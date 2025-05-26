// peerConnection.js
import * as state from './state.js';
import * as ui from './ui.js';
import * as player from './player.js';
import * as gameLogic from './gameLogic.js'; // Still needed for endGame/endDraw and potentially hints
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
                window.peerJsMultiplayer.connect(state.currentHostPeerId);
            } else {
                console.error("PeerConnection: Host ID not set for joiner, or connect not available.");
                ui.showOverlay("Error: No se pudo conectar al host.");
                state.resetRemoteState();
                gameLogic.updateAllUITogglesHandler();
            }
        }
    },
    onNewConnection: (conn) => {
        ui.hideQRCode();
        ui.showOverlay("Jugador 2 conectándose...");
        ui.updateStatus("Jugador 2 está conectándose...");
    },
    onConnectionOpen: () => {
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
        // gameLogic.init() should determine who starts and potentially send initial full state if P1.
        // For now, P1's first move will trigger the first full_state_update.
        // Or, gameLogic.init() on P1 could send an initial state.
        // Let's assume P1's first actual move triggers the first state send.
        gameLogic.init(); 
    },
    onDataReceived: (data) => {
        console.log(`PeerConnection: RX @ ${new Date().toLocaleTimeString()}:`, JSON.parse(JSON.stringify(data)));
        
        if (data.type === 'player_info') {
            state.setOpponentPlayerName(data.name || 'Oponente Remoto');
            state.setOpponentPlayerIcon(data.icon);
            player.determineEffectiveIcons();
            ui.updateScoreboard();
            if (state.gameActive) { // If game somehow started before player_info fully synced
                ui.updateStatus(state.isMyTurnInRemote ?
                    `Tu Turno ${player.getPlayerName(state.currentPlayer)}` :
                    `Esperando a ${player.getPlayerName(state.currentPlayer)}...`);
            } else if (state.pvpRemoteActive && state.gamePaired) {
                 // If game wasn't active, init might be called after P2P setup
                 // gameLogic.init(); // This was here, consider if needed or if onConnectionOpen's init is enough
            }
            return;
        }

        // This guard might be too restrictive if we expect full_state_update to also resume a game
        // or handle cases where local state.gameActive is false but remote is sending an active state.
        // For now, let's assume it's for ongoing game moves.
        // If not my turn, I expect data. If it IS my turn, I should not be getting a state update for a move.
        if (state.isMyTurnInRemote && data.type === 'full_state_update') {
             console.warn("PeerConnection: Received 'full_state_update' but it's currently my turn locally. Ignoring to prevent state override conflicts.", data);
             return;
        }
         if ((!state.gameActive && data.type !== 'full_state_update') || !state.pvpRemoteActive || !state.gamePaired) {
             // Allow full_state_update even if local gameActive is false, as it might be an initial state or recovery.
            // For other types, original guard applies.
            if (data.type !== 'full_state_update' && (!state.gameActive || !state.pvpRemoteActive || !state.gamePaired || state.isMyTurnInRemote)) {
                console.warn("PeerConnection: RX game data (not full_state_update) but not expecting it (guard fail).", {
                    isMyTurnInRemote: state.isMyTurnInRemote, gameActive: state.gameActive,
                    pvpRemoteActive: state.pvpRemoteActive, gamePaired: state.gamePaired,
                    dataType: data.type, localPhase: state.gamePhase, localPlayer: state.currentPlayer
                });
                return;
            }
        }


        // ────────────────────────────────────────────────
        //  1. Full-state sync (handling 'full_state_update' packets)
        // ────────────────────────────────────────────────
        if (data.type === 'full_state_update') {
            console.log('[P2P] Processing full_state_update received:', data);

            // 1. Copy the authoritative game snapshot from sender
            // Ensure board is a new array if it's coming from JSON
            state.setBoard(Array.isArray(data.board) ? [...data.board] : Array(9).fill(null));
            state.setCurrentPlayer(data.currentPlayer); // Sender has already determined next player
            state.setGamePhase(data.gamePhase);
            state.setGameActive(data.gameActive); // Sync active status

            // Update UI based on the new authoritative state
            ui.clearBoardUI(); // Clear previous state from UI
            state.board.forEach((symbol, index) => { // Re-render board
                if (symbol) {
                    ui.updateCellUI(index, symbol);
                }
            });
            // ui.renderBoard(state.board); // If you have a single function for full board render

            ui.updateScoreboard?.(); // If scores were also synced (they are not in current packet)

            // 2. Handle game over conditions from the received state
            if (!data.gameActive) { // If the received state indicates game is over
                if (data.winner) {
                    console.log("[P2P] Game ended. Winner:", data.winner);
                    // Ensure local game logic also reflects this end state if not already
                    // gameLogic.endGame might play sounds/confetti again, check if desired
                    // For now, just ensure UI reflects it.
                    if(state.gameActive !== false) state.setGameActive(false); // ensure consistency
                    ui.updateStatus(`${player.getPlayerName(data.winner)} GANA!`);
                    ui.setBoardClickable(false);
                    const winningCells = gameLogic.checkWin(data.winner, state.board); // For highlighting
                    if(winningCells) ui.highlightWinner(winningCells);
                    // Consider if a full init is needed or just UI update for end.
                } else if (data.draw) {
                    console.log("[P2P] Game ended in a draw.");
                    if(state.gameActive !== false) state.setGameActive(false);
                    ui.updateStatus('¡EMPATE!');
                    ui.setBoardClickable(false);
                    ui.playDrawAnimation?.();
                } else {
                    // Game is not active, but no winner/draw specified by sender. Could be post-game init.
                     console.log("[P2P] Received inactive game state without winner/draw. Assuming post-game or reset.");
                     ui.setBoardClickable(false); // Board usually not clickable if game not active
                }
                return; // Game ended, no further turn processing needed from this packet
            }

            // 3. If game is active, determine whose turn it is now for the local player
            const myTurn = (data.currentPlayer === state.myEffectiveIcon);
            state.setIsMyTurnInRemote(myTurn);

            console.log(`[P2P] State applied. My turn: ${myTurn}. Current player: ${data.currentPlayer}. Phase: ${data.gamePhase}`);

            if (myTurn) {
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
            return; // Handled full_state_update
        }

        // --- Fallback or handling for old 'move' type packets if any are still sent ---
        // --- This section should ideally not be hit if eventListeners.js ONLY sends 'full_state_update' ---
        if (data.type === "move") {
            console.warn("PeerConnection: Received a 'move' type packet, but expected 'full_state_update'. Attempting to process with old logic (may lead to issues).", data);
            // ... (previous logic for data.type === 'move' could be here as a fallback)
            // ... but this would re-introduce the complexities we are trying to avoid with full state sync.
            // For now, let's assume only full_state_update is used for game progression.
            ui.showOverlay("Error: Tipo de mensaje obsoleto recibido.");
            return;
        }
        
        // Handling other specific types like restart requests
        if (data.type === 'restart_request') {
            const requesterName = state.opponentPlayerIcon ? player.getPlayerName(state.opponentPlayerIcon) : "El oponente";
            ui.showOverlay(`${requesterName} quiere reiniciar. Aceptando automáticamente...`);
            if (window.peerJsMultiplayer?.send) {
                window.peerJsMultiplayer.send({ type: 'restart_ack' });
            }
            setTimeout(() => { ui.hideOverlay(); gameLogic.init(); }, 2000); // Both clients re-init
        } else if (data.type === 'restart_ack') {
            ui.showOverlay("Reinicio aceptado. Nueva partida.");
            setTimeout(() => { ui.hideOverlay(); gameLogic.init(); }, 1500); // Both clients re-init
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

// initializePeerAsHost, initializePeerAsJoiner, sendPeerData, closePeerSession remain unchanged
// as they are about connection setup and generic sending.
// The core change is in onDataReceived to handle the 'full_state_update' type.

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