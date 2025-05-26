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
        console.log(`PeerConnection: RX @ ${new Date().toLocaleTimeString()}:`, JSON.parse(JSON.stringify(data)));
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
            console.warn("PeerConnection: RX game data but not expecting it (guard fail).", {
                isMyTurnInRemote: state.isMyTurnInRemote, gameActive: state.gameActive,
                pvpRemoteActive: state.pvpRemoteActive, gamePaired: state.gamePaired,
                dataType: data.type, localPhase: state.gamePhase, localPlayer: state.currentPlayer
            });
            return;
        }

        if (data.type === 'move') {
            const {
                gamePhaseAfterMove,
                playerWhoMadeTheMoveIcon, 
                nextPlayerIconAfterMove,  
                winner,                   
                draw,                     
                index: placementIndex,
                from: slideFrom,
                to: slideTo
            } = data;

            if (!playerWhoMadeTheMoveIcon) {
                console.error("PeerConnection: RX Move data missing 'playerWhoMadeTheMoveIcon'. Aborting processing.", data);
                return;
            }
             if (!nextPlayerIconAfterMove && !winner && !draw) { // nextPlayerIcon is not needed if game ended
                console.error("PeerConnection: RX Move data missing 'nextPlayerIconAfterMove' for an ongoing game. Aborting processing.", data);
                return;
            }

            // 1. Synchronize gamePhase from sender.
            if (gamePhaseAfterMove) {
                if (state.gamePhase !== gamePhaseAfterMove) {
                    console.log(`PeerConnection: RX Syncing gamePhase from ${state.gamePhase} to ${gamePhaseAfterMove}.`);
                    state.setGamePhase(gamePhaseAfterMove);
                }
            } else {
                console.warn("PeerConnection: RX Move data missing 'gamePhaseAfterMove'. Phase sync may be incorrect.");
            }

            // 2. Set local currentPlayer to the player WHO MADE THE MOVE (the sender/opponent).
            console.log(`PeerConnection: RX Setting currentPlayer to MOVER (${playerWhoMadeTheMoveIcon}) for gameLogic call.`);
            state.setCurrentPlayer(playerWhoMadeTheMoveIcon);

            let moveProcessedOk = false;
            const isSlideData = typeof slideFrom === 'number' && typeof slideTo === 'number';
            const isPlacementData = typeof placementIndex === 'number';

            if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
                if (isSlideData) {
                    if (state.gamePhase !== state.GAME_PHASES.MOVING) {
                        console.warn(`PeerConnection: RX Received slide data, but local phase is ${state.gamePhase} (synced from sender or existing). Forcing to MOVING for this operation.`);
                        state.setGamePhase(state.GAME_PHASES.MOVING);
                    }
                    console.log(`PeerConnection: RX Processing remote slide: from ${slideFrom} to ${slideTo} by ${playerWhoMadeTheMoveIcon}. Current local phase: ${state.gamePhase}`);
                    moveProcessedOk = gameLogic.movePiece(slideFrom, slideTo, playerWhoMadeTheMoveIcon);
                } else if (isPlacementData) {
                     if (state.gamePhase === state.GAME_PHASES.MOVING && gamePhaseAfterMove === state.GAME_PHASES.PLACING) {
                         console.warn(`PeerConnection: RX Received placement data (index), but local phase is MOVING (sender indicated PLACING). This might be an old/conflicting message or phase desync.`);
                    }
                    console.log(`PeerConnection: RX Processing remote 3-piece placement: index ${placementIndex} by ${playerWhoMadeTheMoveIcon}. Current local phase: ${state.gamePhase}`);
                    moveProcessedOk = gameLogic.makeMove(placementIndex, playerWhoMadeTheMoveIcon);
                } else {
                    console.warn("PeerConnection: RX 3-Piece 'move' data has neither slide nor placement format.", data);
                }
            } else { // Classic
                if (isPlacementData) {
                    console.log(`PeerConnection: RX Processing remote classic placement: index ${placementIndex} by ${playerWhoMadeTheMoveIcon}.`);
                    moveProcessedOk = gameLogic.makeMove(placementIndex, playerWhoMadeTheMoveIcon);
                } else {
                    console.warn("PeerConnection: RX Classic 'move' data missing index.", data);
                }
            }

            if (moveProcessedOk) {
                console.log(`PeerConnection: RX gameLogic call successful. Local state.currentPlayer (after internal switchPlayer): ${state.currentPlayer}. Sender says next is ${nextPlayerIconAfterMove}.`);
                applyRemoteMoveOutcome(winner, draw, nextPlayerIconAfterMove, gamePhaseAfterMove);
            } else { 
                console.error("PeerConnection: RX Remote move FAILED to process in local gameLogic. CRITICAL SYNC ERROR.", {
                    dataReceived: data,
                    context_currentPlayerSetToMover: playerWhoMadeTheMoveIcon,
                    context_gamePhaseUsed: state.gamePhase 
                });
                ui.showOverlay("Error Crítico de Sincronización!");
            }

        } else if (data.type === 'restart_request') {
            const requesterName = state.opponentPlayerIcon ? player.getPlayerName(state.opponentPlayerIcon) : "El oponente";
            ui.showOverlay(`${requesterName} quiere reiniciar. Aceptando automáticamente...`);
            if (window.peerJsMultiplayer?.send) {
                window.peerJsMultiplayer.send({ type: 'restart_ack' });
            }
            setTimeout(() => { ui.hideOverlay(); gameLogic.init(); }, 2000);
        } else if (data.type === 'restart_ack') {
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
    // gameLogic.makeMove/movePiece was ALREADY CALLED.
    // It handled board updates, win/draw checks, called endGame/endDraw (setting state.gameActive=false),
    // and called switchPlayer (updating local state.currentPlayer to be the receiver/local player).

    if (receivedWinnerSymbol && state.gameActive) {
        console.warn(`PeerConnection (applyOutcome): Remote declared winner ${receivedWinnerSymbol}, but local game logic hadn't ended game. Forcing end.`);
        const winningCells = gameLogic.checkWin(receivedWinnerSymbol, state.board);
        gameLogic.endGame(receivedWinnerSymbol, winningCells || []);
        return; 
    }
    if (receivedIsDraw && state.gameActive) {
        console.warn("PeerConnection (applyOutcome): Remote declared draw, but local game logic hadn't ended game. Forcing draw.");
        gameLogic.endDraw();
        return; 
    }

    if (!state.gameActive) {
        console.log("PeerConnection (applyOutcome): Game is locally inactive. Game over state handled by gameLogic.");
        ui.setBoardClickable(false); 
        return;
    }

    // If game continues:
    // Local state.currentPlayer was set by switchPlayer() inside gameLogic.makeMove/movePiece.
    // Now, *enforce* it to be what the sender determined as nextPlayer.
    if (receivedNextPlayerIcon) {
        if (state.currentPlayer !== receivedNextPlayerIcon) {
            console.warn(`PeerConnection (applyOutcome): Local currentPlayer (${state.currentPlayer}) after switchPlayer differs from sender's receivedNextPlayerIcon (${receivedNextPlayerIcon}). Syncing to receivedNextPlayerIcon.`);
            state.setCurrentPlayer(receivedNextPlayerIcon);
        }
    } else {
        // This should not happen if the game is ongoing, as eventListeners.js sends nextPlayerIconAfterMove.
        console.error("PeerConnection (applyOutcome): CRITICAL - receivedNextPlayerIcon is missing for an ongoing game. Turn synchronization will fail.");
        // Fallback: rely on local switchPlayer, but log error.
    }
    
    // Re-confirm gamePhase from what sender sent as the phase AFTER their move.
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
                const displayCountForStatus = Math.min(placed + 1, state.MAX_PIECES_PER_PLAYER);
                statusMsg = `${player.getPlayerName(state.currentPlayer)}: Coloca tu pieza (${displayCountForStatus}/3).`;
            }
        }
        ui.updateStatus(statusMsg);
        ui.setBoardClickable(true);
        gameLogic.showEasyModeHint();
    } else {
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
        console.log(`PeerConnection: TX @ ${new Date().toLocaleTimeString()}:`, JSON.parse(JSON.stringify(data)));
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