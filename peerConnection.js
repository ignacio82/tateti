// peerConnection.js
import * as state from './state.js';
import * as ui from './ui.js';
import * as player from './player.js';
import * as gameLogic from './gameLogic.js';
import * as sound from './sound.js';

const peerJsCallbacks = {
    onPeerOpen: (id) => {
        if (state.pvpRemoteActive && state.iAmPlayer1InRemote) {
            state.setCurrentHostPeerId(id);
            const desiredBaseUrl = 'https://tateti.martinez.fyi';
            const gameLink = `${desiredBaseUrl}/?room=${id}`;
            ui.updateStatus(`Comparte el enlace o ID: ${id}`);
            ui.displayQRCode(gameLink);
        } else if (state.pvpRemoteActive && !state.iAmPlayer1InRemote) {
            if (state.currentHostPeerId && window.peerJsMultiplayer?.connect) {
                console.log(`PeerJS: Joiner's peer ID is ${id}. Attempting to connect to host: ${state.currentHostPeerId}`);
                window.peerJsMultiplayer.connect(state.currentHostPeerId);
            } else {
                console.error("PeerConnection: Host ID not set for joiner, or peerJsMultiplayer.connect not available.");
                ui.showOverlay("Error: No se pudo conectar al host.");
                state.resetRemoteState(); // Reset remote state
                gameLogic.updateAllUITogglesHandler(); // Update UI
                // gameLogic.init(); // Re-init to a default local state might be good
            }
        }
    },
    onNewConnection: (conn) => {
        console.log('PeerConnection: Incoming connection from', conn.peer);
        ui.hideQRCode(); // Hide QR for host once someone connects
        ui.showOverlay("Jugador 2 conectándose...");
        ui.updateStatus("Jugador 2 está conectándose...");
    },
    onConnectionOpen: () => {
        console.log("PeerConnection: Data connection opened with peer.");
        state.setGamePaired(true);
        ui.hideOverlay();
        ui.hideQRCode(); // Ensure QR is hidden for joiner too
        player.determineEffectiveIcons();
        if (window.peerJsMultiplayer?.send) {
            window.peerJsMultiplayer.send({
                type: 'player_info',
                name: state.myPlayerName,
                icon: state.myEffectiveIcon // Send my effective icon
            });
        }
        ui.updateStatus("¡Conectado! Iniciando partida...");
        sound.playSound('win'); // Connection success sound
        gameLogic.init(); // Initialize game for both players on connection
    },
    onDataReceived: (data) => {
        console.log(`PeerConnection: RX @ ${new Date().toLocaleTimeString()}:`, JSON.parse(JSON.stringify(data)));

        if (!state.pvpRemoteActive) { // Ignore packets if not in PVP remote mode
            console.warn("PeerConnection: Received data but not in PVP remote mode. Ignoring.", data);
            return;
        }

        if (data.type === 'player_info') {
            state.setOpponentPlayerName(data.name || 'Oponente Remoto');
            state.setOpponentPlayerIcon(data.icon); // Store opponent's chosen icon
            player.determineEffectiveIcons(); // Re-determine effective icons
            ui.updateScoreboard();
            // Update status if game is already active (e.g. if info comes mid-game or on reconnect)
            if (state.gameActive) {
                 ui.updateStatus(state.isMyTurnInRemote ?
                    `Tu Turno ${player.getPlayerName(state.currentPlayer)}` :
                    `Esperando a ${player.getPlayerName(state.currentPlayer)}...`);
            }
            return;
        }

        // BUG 2 FIX: Handle 'move_piece' packet
        if (data.type === 'move_piece') {
            // This packet is for 3-piece slide. The sender already updated their state.
            // Receiver needs to apply this move.
            if (!state.gameActive || state.isMyTurnInRemote) {
                console.warn("PeerConnection: Received 'move_piece' but game not active or it's my turn. Ignoring.", data);
                return;
            }
            console.log("[P2P] Processing move_piece received:", data);
            const ok = gameLogic.movePiece(
                data.from,
                data.to,
                state.opponentEffectiveIcon // The move was made by the opponent
            );

            if (!ok) {
                console.warn('[P2P] Desync: Illegal slide received via move_piece. Opponent tried:', data, 'My board:', state.board);
                // Request a full state update to resync
                if(window.peerJsMultiplayer?.send) peerConnection.sendPeerData({type: 'request_full_state'});
            }
            // After gameLogic.movePiece, state.currentPlayer is now the local player (receiver)
            // and UI should be updated accordingly by gameLogic.movePiece -> switchPlayer.
            // Explicitly ensure turn state for local player:
            if (state.gameActive && state.currentPlayer === state.myEffectiveIcon) {
                state.setIsMyTurnInRemote(true);
                ui.setBoardClickable(true);
                ui.updateStatus(`Tu Turno ${player.getPlayerName(state.currentPlayer)}`); // Ensure status reflects this
                gameLogic.showEasyModeHint?.();
            } else if (state.gameActive) { // Opponent's turn again (should not happen from opponent's move_piece)
                 state.setIsMyTurnInRemote(false);
                 ui.setBoardClickable(false);
                 ui.updateStatus(`Esperando a ${player.getPlayerName(state.currentPlayer)}...`);
            }
            return;
        }


        if (data.type === 'full_state_update') {
            console.log('[P2P] Processing full_state_update received:', data);

            if (!data.board || !Array.isArray(data.board) || data.board.length !== 9 ||
                !data.currentPlayer || !data.gamePhase || typeof data.gameActive !== 'boolean') {
                console.error("[P2P] Received invalid full_state_update. Ignoring.", data);
                return;
            }

            state.setBoard([...data.board]);
            state.setCurrentPlayer(data.currentPlayer);
            state.setGamePhase(data.gamePhase);
            // Only set gameActive from packet if it's truly ending the game.
            // If packet says gameActive=true, local state.gameActive should already be true or become true.
            // If packet says gameActive=false, it means game ended.
            const oldGameActive = state.gameActive;
            state.setGameActive(data.gameActive);


            ui.clearBoardUI();
            state.board.forEach((symbol, index) => {
                ui.updateCellUI(index, symbol || null);
            });
            player.determineEffectiveIcons(); // Ensure icons are correct based on potential newcurrentPlayer
            ui.updateScoreboard?.();

            if (!state.gameActive) { // Game ended based on packet
                ui.setBoardClickable(false);
                if (data.winner) {
                    state.setLastWinner(data.winner);
                    ui.updateStatus(`${player.getPlayerName(data.winner)} GANA!`);
                    const winningCells = gameLogic.checkWin(data.winner, state.board);
                    if(winningCells) ui.highlightWinner(winningCells);
                    if(!oldGameActive && data.winner) ui.launchConfetti?.(); // Confetti if game just ended now with winner

                    // Update scores based on received winner
                    // This logic should ideally be in one place, e.g., gameLogic.endGame/endDraw
                    // For now, mirror potential score update
                    if (data.winner === state.myEffectiveIcon && oldGameActive) state.incrementMyWins();
                    else if (data.winner === state.opponentEffectiveIcon && oldGameActive) state.incrementOpponentWins();
                     localStorage.setItem('myWinsTateti', state.myWins.toString());
                     localStorage.setItem('opponentWinsTateti', state.opponentWins.toString());
                     ui.updateScoreboard();


                } else if (data.draw) {
                    state.setLastWinner(null);
                    ui.updateStatus('¡EMPATE!');
                    if(oldGameActive) ui.playDrawAnimation?.();
                    if (oldGameActive) state.incrementDraws();
                    localStorage.setItem('drawsTateti', state.draws.toString());
                    ui.updateScoreboard();
                } else {
                     ui.updateStatus("Juego terminado.");
                }
                // Restart is handled by restart_request/ack flow
                return;
            }

            // If game is active, set turn
            const myTurnNow = (state.currentPlayer === state.myEffectiveIcon);
            state.setIsMyTurnInRemote(myTurnNow);

            console.log(`[P2P] State applied. My turn: ${myTurnNow}. Current player: ${state.currentPlayer}. Phase: ${state.gamePhase}`);

            if (myTurnNow) {
                let statusMsg = `Tu Turno ${player.getPlayerName(state.currentPlayer)}`;
                 if(state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
                    if (state.gamePhase === state.GAME_PHASES.MOVING) {
                        statusMsg = `${player.getPlayerName(state.currentPlayer)}: Selecciona tu pieza para mover.`;
                    } else if (state.gamePhase === state.GAME_PHASES.PLACING) {
                        const placed = state.board.filter(s => s === state.currentPlayer).length;
                        statusMsg = `${player.getPlayerName(state.currentPlayer)}: Coloca tu pieza (${Math.min(placed + 1, state.MAX_PIECES_PER_PLAYER)}/${state.MAX_PIECES_PER_PLAYER}).`;
                    }
                }
                ui.updateStatus(statusMsg);
                ui.setBoardClickable(true);
                gameLogic.showEasyModeHint?.();
            } else {
                ui.updateStatus(`Esperando a ${player.getPlayerName(state.currentPlayer)}…`);
                ui.setBoardClickable(false);
            }
            return;
        }
        
        // BUG 1 FIX: Synchronised restarts
        if (data.type === 'restart_request') {
            const requesterName = state.opponentPlayerName || "El oponente";
            ui.showOverlay(`${requesterName} quiere reiniciar. Aceptando...`);
            if (window.peerJsMultiplayer?.send) {
                window.peerJsMultiplayer.send({ type: 'restart_ack' });
            }
            // Receiver of request also inits
            setTimeout(() => { // Short delay for ack to send and UI to show
                ui.hideOverlay();
                gameLogic.init();
            }, 100); // Reduced delay
            return;
        }

        if (data.type === 'restart_ack') {
            // Requester (who sent restart_request from endGame/endDraw) now inits
            ui.showOverlay("Reinicio aceptado. Nueva partida...");
            setTimeout(() => { // Short delay for UI
                ui.hideOverlay();
                gameLogic.init();
            }, 100); // Reduced delay
            return;
        }
        
        if (data.type === 'request_full_state') { // Handle request for full state
            if (window.peerJsMultiplayer?.send) {
                 const fullStateData = {
                    type: 'full_state_update',
                    board: [...state.board],
                    currentPlayer: state.currentPlayer,
                    gamePhase: state.gamePhase,
                    gameActive: state.gameActive,
                    winner: state.gameActive ? null : state.lastWinner,
                    draw: state.gameActive ? false : (!state.lastWinner && !state.gameActive && state.board.every(c=>c!==null)),
                };
                peerConnection.sendPeerData(fullStateData);
            }
            return;
        }


        console.warn("PeerConnection: Received unhandled data type:", data.type, data);
    },
    onConnectionClose: () => {
        console.log("PeerConnection: Connection closed.");
        if (state.pvpRemoteActive) {
            ui.showOverlay("El oponente se ha desconectado.");
            ui.updateStatus("Conexión perdida.");
        }
        state.resetRemoteState(); // Resets pvpRemoteActive, gamePaired, etc.
        gameLogic.updateAllUITogglesHandler();
        gameLogic.init(); // Re-initialize to a stable local state
    },
    onError: (err) => {
        console.error('PeerConnection: PeerJS Error Object:', err);
        // Avoid showing generic overlay if it's a common error like peer unavailable during connection attempt
        if (err.type && err.type !== 'peer-unavailable' && err.type !== 'network') {
             ui.showOverlay(`Error de conexión: ${err.type || err.message || 'desconocido'}`);
        } else if (!err.type) {
             ui.showOverlay(`Error de conexión: ${err.message || 'desconocido'}`);
        }
        ui.updateStatus("Error de conexión.");
        state.resetRemoteState();
        gameLogic.updateAllUITogglesHandler();
        ui.hideQRCode();
        // gameLogic.init(); // Re-initialize to a stable local state
    }
};

export function initializePeerAsHost(stopPreviousGameCallback) {
    stopPreviousGameCallback(); // Ensure previous game logic is stopped
    state.setVsCPU(false);
    state.setPvpRemoteActive(true);
    state.setIAmPlayer1InRemote(true);
    state.setGamePaired(false);
    state.setCurrentHostPeerId(null); // Will be set on 'open'

    gameLogic.updateAllUITogglesHandler(); // Reflect mode change in UI
    ui.updateStatus("Estableciendo conexión como Host...");
    ui.hideOverlay(); // Clear any previous overlays

    if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.init === 'function') {
        window.peerJsMultiplayer.init(null, peerJsCallbacks); // Let PeerServer assign ID
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
    ui.hideOverlay(); // Clear any previous overlays


    const hostIdInput = hostIdFromUrl || prompt("Ingresa el ID del Host al que deseas unirte:");
    if (!hostIdInput || hostIdInput.trim() === "") {
        ui.showOverlay("ID del Host no ingresado. Operación cancelada.");
        ui.updateStatus("Cancelado. Ingresa un ID para unirte.");
        state.setPvpRemoteActive(false); // Revert remote state
        gameLogic.updateAllUITogglesHandler();
        return;
    }
    state.setCurrentHostPeerId(hostIdInput.trim());

    ui.showOverlay(`Conectando al Host ID: ${state.currentHostPeerId}...`);
    ui.updateStatus(`Intentando conectar a ${state.currentHostPeerId}...`);

    if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.init === 'function') {
        window.peerJsMultiplayer.init(null, peerJsCallbacks); // Let PeerServer assign ID, then connect
    } else {
        console.error("PeerConnection: peerJsMultiplayer.init not found when trying to join.");
        peerJsCallbacks.onError?.({type: 'init_failed', message: 'Módulo multijugador (PeerJS) no encontrado.'});
    }
}

export function sendPeerData(data) {
    // Only send if connection is open and ready (checked by currentConnection.open in peerjs-multiplayer.js)
    // and if game is paired (ensures we have an opponent to send to)
    if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.send === 'function' && state.gamePaired) {
        // console.log(`PeerConnection: TX @ ${new Date().toLocaleTimeString()}:`, JSON.parse(JSON.stringify(data)));
        window.peerJsMultiplayer.send(data);
    } else if (!state.gamePaired) {
        console.warn("PeerConnection: Cannot send data, game not paired.", data);
    } else {
        console.error("PeerConnection: peerJsMultiplayer.send not available to send data.", data);
    }
}

export function closePeerSession() {
    if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.close === 'function') {
        window.peerJsMultiplayer.close();
    }
    // Local state like pvpRemoteActive, gamePaired should be reset by onConnectionClose handler
    // or when user explicitly changes game mode.
}