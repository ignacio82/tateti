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
            console.warn("PeerConnection: Received game data but not expecting it.", {
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
            // The icon sent in data.playerWhoMadeTheMoveIcon IS state.opponentEffectiveIcon for the receiver.
            const moverIcon = data.playerWhoMadeTheMoveIcon; 
            if (!moverIcon) {
                console.error("PeerConnection: Move data received without 'playerWhoMadeTheMoveIcon'. Cannot process.", data);
                return;
            }

            // Synchronize gamePhase from sender.
            if (data.gamePhaseAfterMove) {
                if (state.gamePhase !== data.gamePhaseAfterMove) {
                    console.log(`PeerConnection: Syncing gamePhase from ${state.gamePhase} to ${data.gamePhaseAfterMove} based on received data.`);
                    state.setGamePhase(data.gamePhaseAfterMove);
                }
            } else {
                console.warn("PeerConnection: Move data received without 'gamePhaseAfterMove'. Phase sync might be inexact.");
            }

            // CRITICAL: Set currentPlayer to the player who made the move BEFORE calling gameLogic functions.
            // This ensures gameLogic functions (especially their internal switchPlayer) operate on the correct context.
            state.setCurrentPlayer(moverIcon);
            console.log(`PeerConnection: Set currentPlayer to MOVER (${moverIcon}) before processing move.`);

            let moveProcessedSuccessfully = false;
            const isSlideDataFormat = typeof data.from === 'number' && typeof data.to === 'number';
            const isPlacementDataFormat = typeof data.index === 'number';

            if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
                if (isSlideDataFormat) {
                    if (state.gamePhase !== state.GAME_PHASES.MOVING) {
                        console.warn(`PeerConnection: Received slide data (from/to) but local phase was ${state.gamePhase} (expected MOVING after sync). Forcing to MOVING.`);
                        state.setGamePhase(state.GAME_PHASES.MOVING);
                    }
                    console.log(`PeerConnection: Processing remote slide: from ${data.from} to ${data.to} by ${moverIcon}. Local phase: ${state.gamePhase}`);
                    moveProcessedSuccessfully = gameLogic.movePiece(data.from, data.to, moverIcon);
                } else if (isPlacementDataFormat) {
                    if (state.gamePhase !== state.GAME_PHASES.PLACING) {
                         // This might happen if data.gamePhaseAfterMove indicated MOVING (e.g. 6th piece placed)
                        console.warn(`PeerConnection: Received placement data (index) but local phase was ${state.gamePhase} (expected PLACING, or MOVING if it's the very last placement that triggers phase change).`);
                    }
                    console.log(`PeerConnection: Processing remote placement: index ${data.index} by ${moverIcon}. Local phase: ${state.gamePhase}`);
                    moveProcessedSuccessfully = gameLogic.makeMove(data.index, moverIcon);
                } else {
                    console.warn("PeerConnection: 3-Piece mode - Received 'move' data in unrecognized format.", data);
                }
            } else { // Classic game variant
                if (isPlacementDataFormat) {
                    console.log(`PeerConnection: Processing remote classic placement: index ${data.index} by ${moverIcon}.`);
                    moveProcessedSuccessfully = gameLogic.makeMove(data.index, moverIcon);
                } else {
                     console.warn("PeerConnection: Classic mode - Received 'move' data without index.", data);
                }
            }

            if (moveProcessedSuccessfully) {
                // After gameLogic.makeMove/movePiece, state.currentPlayer has been switched to the *receiver* (local player).
                // data.winner and data.draw reflect outcome for the *mover*.
                console.log(`PeerConnection: Move processed by gameLogic. gameActive: ${state.gameActive}, local currentPlayer after logic (should be me): ${state.currentPlayer}`);
                applyRemoteMoveOutcome(data.winner, data.draw); // Pass only outcome, turn is now locally correct.
            } else {
                console.error("PeerConnection: Remote move FAILED to process in local gameLogic.", {
                    dataReceived: data,
                    localGamePhaseDuringProcessing: state.gamePhase,
                    localCurrentPlayerDuringProcessing: state.currentPlayer // This was set to moverIcon
                });
                ui.showOverlay("Error Crítico de Sincronización!");
                // Potentially try to reset or show a disconnect message, as state is unreliable.
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

// Renamed and simplified this function
function applyRemoteMoveOutcome(receivedWinnerSymbol, receivedIsDraw) {
    // gameLogic.makeMove/movePiece was ALREADY CALLED.
    // It handled board updates, win/draw checks, and called switchPlayer.
    // state.currentPlayer is now the local player if the game continues.
    // state.gameActive is false if the game ended.

    if (receivedWinnerSymbol && state.gameActive) {
        // This means remote declared a winner, but our local logic didn't end the game.
        // This indicates a desync in win detection. Force end based on remote.
        console.warn(`PeerConnection (applyOutcome): Remote declared winner ${receivedWinnerSymbol}, but local game still active. Forcing end.`);
        const winningCells = gameLogic.checkWin(receivedWinnerSymbol, state.board); // Re-check for highlight
        gameLogic.endGame(receivedWinnerSymbol, winningCells || []);
        return;
    }
    if (receivedIsDraw && state.gameActive) {
        // Remote declared a draw, but local logic didn't end. Force end.
        console.warn("PeerConnection (applyOutcome): Remote declared draw, but local game still active. Forcing draw.");
        gameLogic.endDraw();
        return;
    }

    if (!state.gameActive) {
        // Game ended locally (correctly by makeMove/movePiece). No further turn processing.
        console.log("PeerConnection (applyOutcome): Game is locally inactive. Game over state handled by gameLogic.");
        ui.setBoardClickable(false);
        return;
    }

    // If game continues (game is active, no winner/draw reported by remote that we didn't already process):
    // The turn has already been switched to the local player by gameLogic.makeMove/movePiece -> switchPlayer.
    // So, state.currentPlayer should be state.myEffectiveIcon.
    state.setIsMyTurnInRemote(true); // It's my turn now.

    let statusMsg = `Tu Turno ${player.getPlayerName(state.currentPlayer)}`;
    if(state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
        if (state.gamePhase === state.GAME_PHASES.MOVING) {
             statusMsg = `${player.getPlayerName(state.currentPlayer)}: Selecciona tu pieza para mover.`;
        } else if (state.gamePhase === state.GAME_PHASES.PLACING) {
            const placed = state.board.filter(s => s === state.currentPlayer).length;
            const displayPlacedCount = Math.min(placed, state.MAX_PIECES_PER_PLAYER -1);
            statusMsg = `${player.getPlayerName(state.currentPlayer)}: Coloca tu pieza (${displayPlacedCount + 1}/3).`;
        }
    }
    ui.updateStatus(statusMsg);
    ui.setBoardClickable(true);
    gameLogic.showEasyModeHint();
    console.log(`PeerConnection (applyOutcome): Turn set to local player. My turn: ${state.isMyTurnInRemote}. Current player: ${state.currentPlayer}. Game phase: ${state.gamePhase}`);
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