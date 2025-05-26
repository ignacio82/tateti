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
            const desiredBaseUrl = 'https://tateti.martinez.fyi'; // Or your development URL
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
                state.resetRemoteState();
                gameLogic.updateAllUITogglesHandler();
            }
        }
    },
    onNewConnection: (conn) => {
        console.log('PeerConnection: Incoming connection from', conn.peer);
        ui.hideQRCode();
        ui.showOverlay("Jugador 2 conectándose...");
        ui.updateStatus("Jugador 2 está conectándose...");
    },
    onConnectionOpen: () => {
        console.log("PeerConnection: Data connection opened with peer.");
        state.setGamePaired(true);
        ui.hideOverlay();
        ui.hideQRCode();
        player.determineEffectiveIcons();
        if (window.peerJsMultiplayer?.send) {
            window.peerJsMultiplayer.send({
                type: 'player_info',
                name: state.myPlayerName,
                icon: state.myEffectiveIcon
            });
        }
        ui.updateStatus("¡Conectado! Iniciando partida...");
        sound.playSound('win');
        gameLogic.init();
    },
    onDataReceived: (data) => {
        console.log(`PeerConnection: Data received at ${new Date().toLocaleTimeString()}:`, JSON.parse(JSON.stringify(data)));
        if (data.type === 'player_info') {
            state.setOpponentPlayerName(data.name || 'Oponente Remoto');
            state.setOpponentPlayerIcon(data.icon);
            player.determineEffectiveIcons();
            ui.updateScoreboard();
            if (state.gameActive) {
                ui.updateStatus(state.isMyTurnInRemote ?
                    `Tu Turno ${player.getPlayerName(state.currentPlayer)}` :
                    `Esperando a ${player.getPlayerName(state.currentPlayer)}...`);
            }
            if (!state.gameActive && state.pvpRemoteActive && state.gamePaired) {
                gameLogic.init();
            }
            return;
        }

        if (!state.gameActive || !state.pvpRemoteActive || !state.gamePaired || state.isMyTurnInRemote) {
            console.warn("PeerConnection: Received game data but not expecting it (e.g., not my turn, game not active/paired).", {
                isMyTurnInRemote: state.isMyTurnInRemote,
                gameActive: state.gameActive,
                pvpRemoteActive: state.pvpRemoteActive,
                gamePaired: state.gamePaired,
                receivedDataType: data.type,
                localGamePhase: state.gamePhase,
                localCurrentPlayer: state.currentPlayer
            });
            return;
        }

        if (data.type === 'move') {
            const moverIcon = data.playerWhoMadeTheMoveIcon;
            if (!moverIcon) {
                console.error("PeerConnection: Move data received without 'playerWhoMadeTheMoveIcon'. Cannot process.", data);
                return;
            }

            // 1. Synchronize gamePhase from sender.
            if (data.gamePhaseAfterMove) {
                if (state.gamePhase !== data.gamePhaseAfterMove) {
                    console.log(`PeerConnection: Syncing gamePhase from ${state.gamePhase} to ${data.gamePhaseAfterMove}.`);
                    state.setGamePhase(data.gamePhaseAfterMove);
                }
            } else {
                console.warn("PeerConnection: Move data received without 'gamePhaseAfterMove'. Phase sync might be problematic.");
            }

            // 2. Set local currentPlayer to the player WHO MADE THE MOVE (the sender/opponent).
            // This ensures gameLogic functions operate in the context of the mover.
            // gameLogic's internal switchPlayer will then transition it to the receiver's turn.
            state.setCurrentPlayer(moverIcon);
            console.log(`PeerConnection: Set currentPlayer to MOVER_ICON (${moverIcon}) before calling gameLogic.`);

            let moveProcessedSuccessfully = false;
            const isSlideDataFormat = typeof data.from === 'number' && typeof data.to === 'number';
            const isPlacementDataFormat = typeof data.index === 'number';

            if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
                if (isSlideDataFormat) {
                    // If data *looks* like a slide, we assert the phase should be MOVING.
                    if (state.gamePhase !== state.GAME_PHASES.MOVING) {
                        console.warn(`PeerConnection: Received slide data (from/to), but synced local phase was ${state.gamePhase}. Forcing to MOVING for processing.`);
                        state.setGamePhase(state.GAME_PHASES.MOVING);
                    }
                    console.log(`PeerConnection: Processing remote slide: from ${data.from} to ${data.to} by ${moverIcon}. Current local phase: ${state.gamePhase}`);
                    // Pass moverIcon as the symbol performing the action
                    moveProcessedSuccessfully = gameLogic.movePiece(data.from, data.to, moverIcon);
                } else if (isPlacementDataFormat) {
                    // For placement, gamePhase should ideally be PLACING, unless this is the move that *causes* transition to MOVING
                    if (state.gamePhase === state.GAME_PHASES.MOVING && data.gamePhaseAfterMove === state.GAME_PHASES.PLACING) {
                         console.warn(`PeerConnection: Received placement data (index), but local phase is MOVING (and sender indicated PLACING). This might be an old/conflicting message or phase desync.`);
                    }
                    console.log(`PeerConnection: Processing remote placement: index ${data.index} by ${moverIcon}. Current local phase: ${state.gamePhase}`);
                     // Pass moverIcon as the symbol performing the action
                    moveProcessedSuccessfully = gameLogic.makeMove(data.index, moverIcon);
                } else {
                    console.warn("PeerConnection: 3-Piece mode - Received 'move' data in unrecognized format. Cannot determine if slide or placement.", data);
                }
            } else { // Classic game variant - only placements
                if (isPlacementDataFormat) {
                    console.log(`PeerConnection: Processing remote classic placement: index ${data.index} by ${moverIcon}.`);
                    moveProcessedSuccessfully = gameLogic.makeMove(data.index, moverIcon);
                } else {
                     console.warn("PeerConnection: Classic mode - Received 'move' data without index (expected placement).", data);
                }
            }

            if (moveProcessedSuccessfully) {
                // gameLogic.makeMove/movePiece has run.
                // Inside those, switchPlayer() was called, so local state.currentPlayer is now the *receiver* (local player).
                // data.winner/draw refers to outcome for playerWhoMadeTheMoveIcon.
                // data.nextPlayerIconAfterMove is what the sender determined as the next player (should be us).
                console.log(`PeerConnection: Move by ${moverIcon} processed by gameLogic. Local state.gameActive: ${state.gameActive}, local state.currentPlayer after switchPlayer: ${state.currentPlayer}, received nextPlayerIconAfterMove: ${data.nextPlayerIconAfterMove}`);
                applyRemoteMoveOutcome(data.winner, data.draw, data.nextPlayerIconAfterMove, data.gamePhaseAfterMove);
            } else {
                console.error("PeerConnection: Remote move FAILED to process in local gameLogic. This is a critical desync.", {
                    dataReceived: data,
                    localGamePhaseAttempted: state.gamePhase, // The phase used for attempt
                    localCurrentPlayerContext: moverIcon // The currentPlayer context for gameLogic call
                });
                ui.showOverlay("Error Crítico de Sincronización!");
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

function applyRemoteMoveOutcome(receivedWinnerSymbol, receivedIsDraw, receivedNextPlayerIcon, receivedGamePhaseAfterMove) {
    // gameLogic.makeMove/movePiece was already called.
    // It updated the board, checked win/draw, called endGame/endDraw (setting state.gameActive=false),
    // and called switchPlayer (updating local state.currentPlayer to be the receiver/local player).

    // Handle game end state first, primarily trusting local gameLogic's endGame/endDraw calls.
    if (receivedWinnerSymbol && state.gameActive) {
        console.warn(`PeerConnection (applyOutcome): Remote declared winner ${receivedWinnerSymbol}, but local game logic hadn't ended game. Forcing end.`);
        const winningCells = gameLogic.checkWin(receivedWinnerSymbol, state.board);
        gameLogic.endGame(receivedWinnerSymbol, winningCells || []); // This will set gameActive=false
    } else if (receivedIsDraw && state.gameActive) {
        console.warn("PeerConnection (applyOutcome): Remote declared draw, but local game logic hadn't ended game. Forcing draw.");
        gameLogic.endDraw(); // This will set gameActive=false
    }

    // If the game has ended (either by local logic or forced above), no further turn processing.
    if (!state.gameActive) {
        console.log("PeerConnection (applyOutcome): Game is inactive. UI should reflect game over.");
        ui.setBoardClickable(false);
        return;
    }

    // If game continues:
    // The local state.currentPlayer should now be the receiver (local player) due to switchPlayer
    // called inside gameLogic.makeMove/movePiece.
    // We now use receivedNextPlayerIcon to *verify and enforce* this.
    if (receivedNextPlayerIcon) {
        if (state.currentPlayer !== receivedNextPlayerIcon) {
            console.warn(`PeerConnection (applyOutcome): Local currentPlayer (${state.currentPlayer}) differs from receivedNextPlayerIcon (${receivedNextPlayerIcon}). Syncing to received.`);
            state.setCurrentPlayer(receivedNextPlayerIcon);
        }
    } else {
        console.error("PeerConnection (applyOutcome): CRITICAL - receivedNextPlayerIcon is missing. Turn synchronization will fail.");
        // Fallback: assume local switchPlayer was correct, but this is risky.
        // No change to state.currentPlayer here, relying on what switchPlayer did.
    }
    
    // Ensure game phase is also aligned with what sender determined after their move.
    // This was already set once before gameLogic call, this is a re-affirmation or correction if needed.
    if (receivedGamePhaseAfterMove && state.gamePhase !== receivedGamePhaseAfterMove) {
        console.log(`PeerConnection (applyOutcome): Re-syncing gamePhase from ${state.gamePhase} to ${receivedGamePhaseAfterMove}.`);
        state.setGamePhase(receivedGamePhaseAfterMove);
    }


    const isMyTurnNow = state.currentPlayer === state.myEffectiveIcon;
    state.setIsMyTurnInRemote(isMyTurnNow);
    console.log(`PeerConnection (applyOutcome): Turn processing complete. Is my turn: ${isMyTurnNow}. Current player: ${state.currentPlayer}. Game phase: ${state.gamePhase}`);


    if (isMyTurnNow) {
        let statusMsg = `Tu Turno ${player.getPlayerName(state.currentPlayer)}`;
        if(state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
            if (state.gamePhase === state.GAME_PHASES.MOVING) {
                 statusMsg = `${player.getPlayerName(state.currentPlayer)}: Selecciona tu pieza para mover.`;
            } else if (state.gamePhase === state.GAME_PHASES.PLACING) {
                const placed = state.board.filter(s => s === state.currentPlayer).length;
                // displayPlacedCount should reflect pieces for next placement, so it's current count + 1
                const displayCountForStatus = Math.min(placed + 1, state.MAX_PIECES_PER_PLAYER);
                statusMsg = `${player.getPlayerName(state.currentPlayer)}: Coloca tu pieza (${displayCountForStatus}/3).`;
            }
        }
        ui.updateStatus(statusMsg);
        ui.setBoardClickable(true);
        gameLogic.showEasyModeHint();
    } else {
        // This scenario implies that even after processing opponent's move and syncing next player,
        // it's still determined to be the opponent's turn. This should be rare in a 2-player game
        // unless receivedNextPlayerIcon was not myEffectiveIcon.
        console.warn(`PeerConnection (applyOutcome): Processed opponent's move, but it's still not my turn. Next player: ${player.getPlayerName(state.currentPlayer)}`);
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
        console.log(`PeerConnection: Sending data at ${new Date().toLocaleTimeString()}:`, JSON.parse(JSON.stringify(data)));
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