// peerConnection.js
import * as state from './state.js';
import * as ui from './ui.js'; // Import ui directly
import * as player from './player.js';
import * as gameLogic from './gameLogic.js';
import * as sound from './sound.js';

const peerJsCallbacks = {
    onPeerOpen: (id) => {
        if (state.pvpRemoteActive && state.iAmPlayer1InRemote) {
            state.setCurrentHostPeerId(id);
            const desiredBaseUrl = 'https://tateti.martinez.fyi'; // Or your development URL
            const gameLink = `${desiredBaseUrl}/?room=${id}`;

            ui.updateStatus(`Comparte el enlace o ID: ${id}`);
            ui.displayQRCode(gameLink);
        } else if (state.pvpRemoteActive && !state.iAmPlayer1InRemote) {
            // This is the joiner, their peer ID is 'id'. Now connect to host.
            if (state.currentHostPeerId && window.peerJsMultiplayer?.connect) {
                console.log(`PeerJS: Joiner's peer ID is ${id}. Attempting to connect to host: ${state.currentHostPeerId}`);
                window.peerJsMultiplayer.connect(state.currentHostPeerId);
            } else {
                console.error("PeerConnection: Host ID not set for joiner, or peerJsMultiplayer.connect not available.");
                ui.showOverlay("Error: No se pudo conectar al host.");
                state.resetRemoteState();
                gameLogic.updateAllUITogglesHandler();
            }
        }
    },
    onNewConnection: (conn) => {
        console.log('PeerConnection: Incoming connection from', conn.peer);
        ui.hideQRCode(); // Host no longer needs to show QR once someone connects
        ui.showOverlay("Jugador 2 conectándose...");
        ui.updateStatus("Jugador 2 está conectándose...");
        // Connection event handlers (open, data, close, error) for this 'conn'
        // are set up by peerjs-multiplayer.js when it assigns it to currentConnection
    },
    onConnectionOpen: () => {
        console.log("PeerConnection: Data connection opened with peer.");
        state.setGamePaired(true);
        ui.hideOverlay(); // Hide "connecting..." overlay
        ui.hideQRCode();  // Ensure QR is hidden for both host and joiner

        player.determineEffectiveIcons(); // Determine icons now that connection is open
        if (window.peerJsMultiplayer?.send) {
            window.peerJsMultiplayer.send({
                type: 'player_info',
                name: state.myPlayerName,
                icon: state.myEffectiveIcon // Send my chosen/effective icon
            });
        }
        ui.updateStatus("¡Conectado! Iniciando partida...");
        sound.playSound('win'); // Or a connection success sound
        gameLogic.init(); // Initialize the game for both players
    },
    onDataReceived: (data) => {
        console.log("PeerConnection: Data received:", data);
        if(data.type === 'player_info') {
            state.setOpponentPlayerName(data.name || 'Oponente Remoto');
            state.setOpponentPlayerIcon(data.icon); // Store opponent's chosen icon
            console.log("PeerConnection: Opponent info updated:", state.opponentPlayerName, state.opponentPlayerIcon);
            player.determineEffectiveIcons(); // Re-determine all effective icons with opponent's info
            ui.updateScoreboard();

            // Update status based on whose turn it is, if game is active
            if (state.gameActive) {
                ui.updateStatus(state.isMyTurnInRemote ?
                    `Tu Turno ${player.getPlayerName(state.currentPlayer)}` :
                    `Esperando a ${player.getPlayerName(state.currentPlayer)}...`);
            }
            // If game wasn't active but now paired, init might have been waiting for this
            if(!state.gameActive && state.pvpRemoteActive && state.gamePaired) {
                gameLogic.init();
            }
            return;
        }

        // Guard: Only process game moves if game is active, remote, paired, AND it's NOT currently my turn (i.e., I'm expecting a move from opponent)
        if (!state.gameActive || !state.pvpRemoteActive || !state.gamePaired || state.isMyTurnInRemote) {
             console.warn("PeerConnection: Received game data but not expecting it (e.g., not opponent's turn, game not active/paired).", {
                isMyTurnInRemote: state.isMyTurnInRemote,
                gameActive: state.gameActive,
                pvpRemoteActive: state.pvpRemoteActive,
                gamePaired: state.gamePaired,
                receivedDataType: data.type
            });
             return;
        }

        if (data.type === 'move') {
            const playerWhoMadeTheMove = state.opponentEffectiveIcon; // The data always comes from the opponent

            // CRITICAL: Update local gamePhase based on sender's state *before* processing the move logic
            if (data.gamePhaseAfterMove) {
                if (state.gamePhase !== data.gamePhaseAfterMove) { // Only log if it's an actual change
                    console.log(`PeerConnection: Syncing gamePhase. Local was ${state.gamePhase}, received ${data.gamePhaseAfterMove}`);
                    state.setGamePhase(data.gamePhaseAfterMove);
                }
            } else {
                console.warn("PeerConnection: Received move data without 'gamePhaseAfterMove'. This might lead to desync if phases differ.");
                // Not changing local phase, relying on local logic. This could be the source of phase desync if local logic fails.
            }

            let moveProcessedSuccessfully = false;
            // Determine if it's a slide or placement based on the *now synchronized* gamePhase and data content
            if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && state.gamePhase === state.GAME_PHASES.MOVING) {
                if (typeof data.from === 'number' && typeof data.to === 'number') {
                    // This is a slide move
                    moveProcessedSuccessfully = gameLogic.movePiece(data.from, data.to, playerWhoMadeTheMove);
                } else {
                    console.warn("PeerConnection: Expected slide move (from/to) due to MOVING phase, but data format is different. Move data:", data);
                }
            } else if (typeof data.index === 'number') { 
                // This is a placement move (Classic or 3-Piece PLACING phase)
                // Ensure that if we are in 3-piece and PLACING phase, we process it as such.
                if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && state.gamePhase !== state.GAME_PHASES.PLACING) {
                    console.warn(`PeerConnection: Received placement move (index=${data.index}), but local gamePhase is ${state.gamePhase} (expected PLACING for 3-piece placement).`);
                }
                moveProcessedSuccessfully = gameLogic.makeMove(data.index, playerWhoMadeTheMove);
            } else {
                console.warn("PeerConnection: Received 'move' data in unexpected format. Current local gamePhase:", state.gamePhase, "Data:", data);
            }

            if (moveProcessedSuccessfully) {
                // gameLogic.makeMove/movePiece has updated the board, checked for win/draw locally,
                // called endGame/endDraw if necessary (which sets state.gameActive = false),
                // and called switchPlayer (which updated local state.currentPlayer).

                // Now, use data.nextPlayerIcon from the sender to ensure perfect sync for whose turn it is.
                // Also, use data.winner and data.draw to confirm game end state if local logic didn't catch it.
                applyRemoteGameLogic(playerWhoMadeTheMove, data.winner, data.draw, data.nextPlayerIcon);
            } else {
                console.warn("PeerConnection: Remote move was not processed successfully by local gameLogic.", {dataReceived: data, localGamePhase: state.gamePhase, localCurrentPlayer: state.currentPlayer});
                // This indicates a potentially serious desync or invalid move received.
                ui.showOverlay("Error de sincronización. El juego puede estar inconsistente.");
            }

        } else if (data.type === 'restart_request') {
            console.log("PeerConnection: Received restart request.");
            const requesterName = state.opponentPlayerIcon ? player.getPlayerName(state.opponentPlayerIcon) : "El oponente";
            ui.showOverlay(`${requesterName} quiere reiniciar. Aceptando automáticamente...`);
            if (window.peerJsMultiplayer?.send) {
                window.peerJsMultiplayer.send({ type: 'restart_ack' });
            }
            setTimeout(() => { ui.hideOverlay(); gameLogic.init(); }, 2000);
        } else if (data.type === 'restart_ack') {
            console.log("PeerConnection: Received restart acknowledgement.");
            ui.showOverlay("Reinicio aceptado. Nueva partida.");
            setTimeout(() => { ui.hideOverlay(); gameLogic.init(); }, 1500);
        }
    },
    onConnectionClose: () => {
        console.log("PeerConnection: Connection closed.");
        if (state.pvpRemoteActive) { 
            ui.showOverlay("El oponente se ha desconectado.");
            ui.updateStatus("Conexión perdida.");
        }
        state.resetRemoteState(); 
        gameLogic.updateAllUITogglesHandler(); 
    },
    onError: (err) => {
        console.error('PeerConnection: PeerJS Error Object:', err);
        ui.showOverlay(`Error de conexión: ${err.type || 'desconocido'}`);
        state.resetRemoteState();
        gameLogic.updateAllUITogglesHandler();
        ui.hideQRCode(); 
    }
};

function applyRemoteGameLogic(playerWhoMadeTheMoveSymbol, receivedWinnerSymbol, receivedIsDraw, receivedNextPlayerIcon) {
    // The functions gameLogic.makeMove or gameLogic.movePiece were already called
    // and have updated the local board (state.board), local state.currentPlayer (via switchPlayer),
    // and potentially local state.gamePhase and state.gameActive (if the game ended).

    // Sync game over state based on received data, if our local logic didn't already conclude the game.
    if (receivedWinnerSymbol && state.gameActive) { // If remote says winner AND we thought game was still active
        console.warn(`PeerConnection: Remote declared winner ${receivedWinnerSymbol}, but local game was still active. Forcing game end.`);
        // Attempt to find the winning cells for the declared winner to highlight them
        const winningCells = gameLogic.checkWin(receivedWinnerSymbol, state.board);
        gameLogic.endGame(receivedWinnerSymbol, winningCells || []); // End game with remote's winner
        return; // Game ended
    }
    if (receivedIsDraw && state.gameActive) { // If remote says draw AND we thought game was still active
        console.warn("PeerConnection: Remote declared draw, but local game was still active. Forcing draw.");
        gameLogic.endDraw(); // End game as draw
        return; // Game ended
    }

    // If the game is locally already inactive (ended), but remote didn't send win/draw, something is off.
    // However, if remote also sent win/draw, the above blocks would handle it.
    // If game genuinely ended, no turn logic is needed.
    if (!state.gameActive) {
        console.log("applyRemoteGameLogic: Game is not active locally, assuming game end handled.");
        ui.setBoardClickable(false); // Ensure board isn't clickable
        return;
    }

    // If game continues (no winner, no draw confirmed by remote AND local game is active):
    // CRITICAL: Synchronize currentPlayer and turn status based on sender's 'nextPlayerIcon'.
    if (receivedNextPlayerIcon) {
        state.setCurrentPlayer(receivedNextPlayerIcon);
    } else {
        console.warn("applyRemoteGameLogic: No 'receivedNextPlayerIcon' in data, cannot definitively sync turn. Relying on local switchPlayer.");
        // If this happens, state.currentPlayer would be what local switchPlayer set it to.
    }
    
    // The gamePhase was ideally set from data.gamePhaseAfterMove before makeMove/movePiece.
    // Re-affirm it if it's part of the explicit sync, or ensure makeMove/movePiece did its job.
    // For now, we assume gamePhase is correct due to the earlier sync in onDataReceived.

    const isMyTurnNow = state.currentPlayer === state.myEffectiveIcon;
    state.setIsMyTurnInRemote(isMyTurnNow);

    if (isMyTurnNow) {
        // Update status based on the now-current (and synchronized) gamePhase and currentPlayer
        if(state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && state.gamePhase === state.GAME_PHASES.MOVING) {
             ui.updateStatus(`${player.getPlayerName(state.currentPlayer)}: Selecciona tu pieza para mover.`);
        } else if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && state.gamePhase === state.GAME_PHASES.PLACING) {
            const placed = state.board.filter(s => s === state.currentPlayer).length;
            // Ensure `placed` doesn't exceed max, though gameLogic.makeMove should prevent invalid states
            const displayPlacedCount = Math.min(placed, state.MAX_PIECES_PER_PLAYER -1);
            ui.updateStatus(`${player.getPlayerName(state.currentPlayer)}: Coloca tu pieza (${displayPlacedCount + 1}/3).`);
        } else { // Classic or other states
             ui.updateStatus(`Tu Turno ${player.getPlayerName(state.currentPlayer)}`);
        }
        ui.setBoardClickable(true);
        gameLogic.showEasyModeHint();
    } else {
        // It's not my turn. This is expected if receivedNextPlayerIcon was the opponent.
        ui.updateStatus(`Esperando a ${player.getPlayerName(state.currentPlayer)}...`);
        ui.setBoardClickable(false);
    }
}


export function initializePeerAsHost(stopPreviousGameCallback) {
    stopPreviousGameCallback();
    state.setVsCPU(false);
    state.setPvpRemoteActive(true);
    state.setIAmPlayer1InRemote(true); 
    state.setGamePaired(false);
    state.setCurrentHostPeerId(null); 

    gameLogic.updateAllUITogglesHandler(); 
    ui.updateStatus("Estableciendo conexión como Host...");

    if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.init === 'function') {
        window.peerJsMultiplayer.init(null, peerJsCallbacks); 
    } else {
        console.error("PeerConnection: peerJsMultiplayer.init not found when trying to host.");
        peerJsCallbacks.onError?.({type: 'init_failed', message: 'Módulo multijugador (PeerJS) no encontrado.'});
    }
}

export function initializePeerAsJoiner(hostIdFromUrl, stopPreviousGameCallback) {
    stopPreviousGameCallback();
    state.setVsCPU(false);
    state.setPvpRemoteActive(true);
    state.setIAmPlayer1InRemote(false); 
    state.setGamePaired(false);

    gameLogic.updateAllUITogglesHandler();

    const hostIdInput = hostIdFromUrl || prompt("Ingresa el ID del Host al que deseas unirte:");
    if (!hostIdInput || hostIdInput.trim() === "") {
        ui.showOverlay("ID del Host no ingresado. Operación cancelada.");
        ui.updateStatus("Cancelado. Ingresa un ID para unirte.");
        state.setPvpRemoteActive(false); 
        gameLogic.updateAllUITogglesHandler();
        return;
    }
    state.setCurrentHostPeerId(hostIdInput.trim());

    ui.showOverlay(`Conectando al Host ID: ${state.currentHostPeerId}...`);
    ui.updateStatus(`Intentando conectar a ${state.currentHostPeerId}...`);

    if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.init === 'function') {
        window.peerJsMultiplayer.init(null, peerJsCallbacks); 
    } else {
        console.error("PeerConnection: peerJsMultiplayer.init not found when trying to join.");
        peerJsCallbacks.onError?.({type: 'init_failed', message: 'Módulo multijugador (PeerJS) no encontrado.'});
    }
}

export function sendPeerData(data) {
    if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.send === 'function') {
        window.peerJsMultiplayer.send(data);
    } else {
        console.error("PeerConnection: peerJsMultiplayer.send not available.");
    }
}

export function closePeerSession() {
    if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.close === 'function') {
        window.peerJsMultiplayer.close();
    }
}