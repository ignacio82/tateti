// peerConnection.js
import * as state from './state.js';
import * as ui from './ui.js';
import * as player from './player.js';
import * as gameLogic from './gameLogic.js'; // Still needed for endGame/endDraw, hints, and local init
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
            } else if (state.pvpRemoteActive && state.gamePaired) {
                 // gameLogic.init(); // Already called onConnectionOpen
            }
            return;
        }

        // **MODIFICATION: The specific guard `if (state.isMyTurnInRemote && data.type === 'full_state_update')` is removed.**
        // The general guard below applies to non-full_state_update, non-restart packets.
        // For 'full_state_update', we generally want to process it as it's authoritative.
        if (data.type !== 'full_state_update' && data.type !== 'restart_request' && data.type !== 'restart_ack') {
            // This guard is for unexpected packet types or if it's my turn and I receive an old 'move' type.
            if (!state.gameActive || !state.pvpRemoteActive || !state.gamePaired || state.isMyTurnInRemote) {
                console.warn("PeerConnection: RX non-sync/non-restart data but not expecting it (guard fail).", {
                    isMyTurnInRemote: state.isMyTurnInRemote, gameActive: state.gameActive,
                    pvpRemoteActive: state.pvpRemoteActive, gamePaired: state.gamePaired,
                    dataType: data.type, localPhase: state.gamePhase, localPlayer: state.currentPlayer
                });
                return;
            }
        }

        // ────────────────────────────────────────────────
        //  Handle 'full_state_update' packets
        // ────────────────────────────────────────────────
        if (data.type === 'full_state_update') {
            console.log('[P2P] Processing full_state_update received:', data);

            // 1. Validate incoming data (basic checks)
            if (!data.board || !Array.isArray(data.board) || data.board.length !== 9) {
                console.error("[P2P] Received full_state_update with invalid board data. Ignoring.", data);
                return;
            }
            if (!data.currentPlayer) { // currentPlayer in packet is whose turn it is NEXT
                console.error("[P2P] Received full_state_update missing 'currentPlayer'. Ignoring.", data);
                return;
            }
            if (!data.gamePhase) {
                console.error("[P2P] Received full_state_update missing 'gamePhase'. Ignoring.", data);
                return;
            }
            if (typeof data.gameActive !== 'boolean') {
                console.error("[P2P] Received full_state_update missing 'gameActive' status. Ignoring.", data);
                return;
            }

            // 2. Apply the authoritative game snapshot from sender
            state.setBoard([...data.board]);
            state.setCurrentPlayer(data.currentPlayer); 
            state.setGamePhase(data.gamePhase);
            state.setGameActive(data.gameActive); 

            // 3. Redraw UI from the new authoritative state
            ui.clearBoardUI(); 
            state.board.forEach((symbol, index) => {
                if (symbol) {
                    ui.updateCellUI(index, symbol); 
                } else {
                    ui.updateCellUI(index, null); 
                }
            });
            ui.updateScoreboard?.(); 

            // 4. Handle game over conditions based on the received state
            if (!state.gameActive) { 
                if (data.winner) {
                    console.log("[P2P] Game ended per received state. Winner:", data.winner);
                    // Ensure state.lastWinner is also updated for consistency if gameLogic.endGame isn't called
                    state.setLastWinner(data.winner);
                    ui.updateStatus(`${player.getPlayerName(data.winner)} GANA!`);
                    ui.setBoardClickable(false);
                    const winningCells = gameLogic.checkWin(data.winner, state.board);
                    if(winningCells) ui.highlightWinner(winningCells);
                    ui.launchConfetti?.(); 
                } else if (data.draw) {
                    console.log("[P2P] Game ended in a draw per received state.");
                     state.setLastWinner(null); // Ensure lastWinner is null for a draw
                    ui.updateStatus('¡EMPATE!');
                    ui.setBoardClickable(false);
                    ui.playDrawAnimation?.();
                } else {
                     console.log("[P2P] Received inactive game state without winner/draw.");
                     ui.updateStatus("Juego terminado."); 
                     ui.setBoardClickable(false);
                }
                // The original setTimeout for init in gameLogic.endGame/endDraw will trigger a new game locally.
                // If P1 doesn't auto-join new game (the second bug report), that's a separate issue regarding
                // how a new game is initiated and state synced AFTER an ended game.
                // For now, this ensures the current game end state is reflected.
                return; 
            }

            // 5. If game is active, determine whose turn it is now for the local player
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
                        const displayCount = Math.min(placed + 1, state.MAX_PIECES_PER_PLAYER);
                        statusMsg = `${player.getPlayerName(state.currentPlayer)}: Coloca tu pieza (${displayCount}/3).`;
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
        
        if (data.type === 'restart_request') {
            const requesterName = state.opponentPlayerIcon ? player.getPlayerName(state.opponentPlayerIcon) : "El oponente";
            ui.showOverlay(`${requesterName} quiere reiniciar. Aceptando automáticamente...`);
            if (window.peerJsMultiplayer?.send) {
                window.peerJsMultiplayer.send({ type: 'restart_ack' });
            }
            setTimeout(() => { ui.hideOverlay(); gameLogic.init(); }, 2000); 
        } else if (data.type === 'restart_ack') {
            ui.showOverlay("Reinicio aceptado. Nueva partida.");
            setTimeout(() => { ui.hideOverlay(); gameLogic.init(); }, 1500); 
        } else {
            console.warn("PeerConnection: Received unhandled data type:", data.type, data);
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