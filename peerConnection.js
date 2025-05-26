// peerConnection.js
import * as state from './state.js';
import * as ui from './ui.js';
import * as player from './player.js';
import * as gameLogic from './gameLogic.js';
import * as sound from './sound.js';

const peerJsCallbacks = {
    onPeerOpen: (id) => {
        console.log(`peerConnection.onPeerOpen: ID ${id}. Am I P1? ${state.iAmPlayer1InRemote}. Timestamp: ${new Date().toISOString()}`);
        if (state.pvpRemoteActive && state.iAmPlayer1InRemote) {
            state.setCurrentHostPeerId(id);
            const desiredBaseUrl = 'https://tateti.martinez.fyi';
            const gameLink = `${desiredBaseUrl}/?room=${id}`;
            ui.updateStatus(`Comparte el enlace o ID: ${id}`);
            ui.displayQRCode(gameLink);
        } else if (state.pvpRemoteActive && !state.iAmPlayer1InRemote) {
            if (state.currentHostPeerId && window.peerJsMultiplayer?.connect) {
                console.log(`PeerJS: Joiner (my ID ${id}) connecting to host: ${state.currentHostPeerId}. Timestamp: ${new Date().toISOString()}`);
                window.peerJsMultiplayer.connect(state.currentHostPeerId);
            } else {
                console.error("PeerConnection: Host ID not set for joiner, or connect unavailable. Timestamp: ${new Date().toISOString()}");
                ui.showOverlay("Error: No se pudo conectar al host.");
                state.resetRemoteState();
                gameLogic.updateAllUITogglesHandler();
            }
        }
    },
    onNewConnection: (conn) => {
        console.log(`PeerConnection: Incoming connection from ${conn.peer}. Timestamp: ${new Date().toISOString()}`);
        ui.hideQRCode();
        ui.showOverlay("Jugador 2 conectándose...");
        ui.updateStatus("Jugador 2 está conectándose...");
    },
    onConnectionOpen: () => {
        console.log(`PeerConnection: Data connection opened with peer. Timestamp: ${new Date().toISOString()}`);
        state.setGamePaired(true);
        ui.hideOverlay();
        ui.hideQRCode();
        player.determineEffectiveIcons();
        if (window.peerJsMultiplayer?.send) {
            window.peerJsMultiplayer.send({
                type: 'player_info',
                name: state.myPlayerName,
                icon: state.myEffectiveIcon
                // Note: Player info doesn't need turnCounter as it's not core game state progression
            });
        }
        ui.updateStatus("¡Conectado! Iniciando partida...");
        sound.playSound('win');
        gameLogic.init(); // init will reset turnCounter to 0 for a new game
    },
    onDataReceived: (data) => {
        // DEBUGGING LOG: Log all raw data received
        console.log(`PeerConnection: RX RAW @ ${new Date().toISOString()}: Type: ${data.type}`, data);

        if (!state.pvpRemoteActive && data.type !== 'ping' && data.type !=='player_info') { // Allow player_info even if pvpRemoteActive is briefly false during setup
            console.warn("PeerConnection: Received data but not in PVP remote mode (or not player_info). Ignoring.", data);
            return;
        }

        if (data.type === 'player_info') {
            state.setOpponentPlayerName(data.name || 'Oponente Remoto');
            state.setOpponentPlayerIcon(data.icon);
            player.determineEffectiveIcons();
            ui.updateScoreboard();
            if (state.gameActive) { // Update status only if game is active
                 ui.updateStatus(state.isMyTurnInRemote ?
                    `Tu Turno ${player.getPlayerName(state.currentPlayer)}` :
                    `Esperando a ${player.getPlayerName(state.currentPlayer)}...`);
            }
            return;
        }

        if (data.type === 'full_state_update') {
            // NEW: Check for turnCounter and reject stale or duplicate states
            if (typeof data.turnCounter !== 'number' || data.turnCounter <= state.turnCounter) {
              console.warn(
                `[P2P] Ignoring stale/duplicate state. Received TC: ${data.turnCounter}, Local TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`,
                data
              );
              return; // Ignore this stale state update
            }
            // If we are here, the received state is newer.

            console.log(`[P2P] Processing full_state_update received (TC validated: ${data.turnCounter} > ${state.turnCounter}). Timestamp: ${new Date().toISOString()}`, data);
            const { board, currentPlayer, gamePhase, gameActive, winner, draw, selectedPieceIndex, turnCounter: receivedTurnCounter } = data; // Renamed to avoid conflict

            if (!board || !Array.isArray(board) || board.length !== 9 || !currentPlayer || !gamePhase || typeof gameActive !== 'boolean') {
                console.error("[P2P] Received invalid full_state_update content after TC check. Ignoring. Timestamp: ${new Date().toISOString()}", data);
                return;
            }

            const oldGameActive = state.gameActive;

            // Apply authoritative state, including the new turn counter
            state.setTurnCounter(receivedTurnCounter); // Update local turn counter

            state.setBoard([...board]);
            state.setCurrentPlayer(currentPlayer);
            state.setGamePhase(gamePhase);
            state.setGameActive(gameActive);

            if (selectedPieceIndex !== undefined) {
                state.setSelectedPieceIndex(selectedPieceIndex);
            }

            ui.clearBoardUI();
            ui.clearSelectedPieceHighlight();
            state.board.forEach((symbol, index) => ui.updateCellUI(index, symbol || null));

            player.determineEffectiveIcons();
            ui.updateScoreboard();

            if (!state.gameActive) {
                ui.setBoardClickable(false);
                console.log(`[P2P] Game ended via full_state_update. TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`);
                if (winner) {
                    state.setLastWinner(winner);
                    ui.updateStatus(`${player.getPlayerName(winner)} GANA!`);
                    const winningCells = gameLogic.checkWin(winner, state.board);
                    if(winningCells) ui.highlightWinner(winningCells);
                    // Confetti and draw animations are usually for local events,
                    // but could be triggered if oldGameActive was true.
                    if (oldGameActive) {
                        ui.launchConfetti?.();
                    }
                } else if (draw) {
                    state.setLastWinner(null); // Ensure lastWinner is null on a draw
                    ui.updateStatus('¡EMPATE!');
                    if (oldGameActive) ui.playDrawAnimation?.();
                } else {
                     ui.updateStatus("Juego terminado.");
                }
                // Restart is handled by restart_request/ack flow or user action.
                return;
            }

            // Game is active, determine whose turn it is
            const myTurnNow = (state.currentPlayer === state.myEffectiveIcon);
            state.setIsMyTurnInRemote(myTurnNow);

            // DEBUGGING LOG: Critical log to check phase after state application
            console.log(`[P2P] State applied by full_state_update. My turn: ${myTurnNow}. Current player: ${state.currentPlayer} (${player.getPlayerName(state.currentPlayer)}), Phase: ${state.gamePhase}, TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`);

            if (myTurnNow) {
                let statusMsg = `Tu Turno ${player.getPlayerName(state.currentPlayer)}`;
                 if(state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
                    if (state.gamePhase === state.GAME_PHASES.MOVING) { // Hopefully 'MOVING' if transition occurred
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

        if (data.type === 'restart_request') {
            const requesterName = state.opponentPlayerName || "El oponente";
            ui.showOverlay(`${requesterName} quiere reiniciar. Aceptando...`);
            if (window.peerJsMultiplayer?.send) {
                window.peerJsMultiplayer.send({ type: 'restart_ack' });
            }
            setTimeout(() => {
                ui.hideOverlay();
                gameLogic.init(); // This will reset turnCounter for the new game
            }, 100);
            return;
        }

        if (data.type === 'restart_ack') {
            ui.showOverlay("Reinicio aceptado. Nueva partida...");
            setTimeout(() => {
                ui.hideOverlay();
                gameLogic.init(); // This will reset turnCounter for the new game
            }, 100);
            return;
        }

        if (data.type === 'request_full_state') {
            // When responding to a request for full state, always send the current authoritative state
            // including the current turnCounter. The receiver will then decide if it's newer.
            if (window.peerJsMultiplayer?.send) {
                 const fullStateData = {
                    type: 'full_state_update', // Send as a normal update
                    board: [...state.board],
                    currentPlayer: state.currentPlayer,
                    gamePhase: state.gamePhase,
                    gameActive: state.gameActive,
                    turnCounter: state.turnCounter, // Include current turn counter
                    winner: state.gameActive ? null : state.lastWinner,
                    draw: state.gameActive ? false : (!state.lastWinner && !state.gameActive && state.board.every(c=>c!==null)),
                    selectedPieceIndex: state.selectedPieceIndex
                };
                console.log(`[P2P] Sending full_state_update in response to request_full_state. TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`, fullStateData);
                sendPeerData(fullStateData);
            }
            return;
        }

        console.warn(`PeerConnection: Received unhandled data type: ${data.type} at ${new Date().toISOString()}`, data);
    },
    onConnectionClose: () => {
        console.log(`PeerConnection: Connection closed. Timestamp: ${new Date().toISOString()}`);
        if (state.pvpRemoteActive) {
            ui.showOverlay("El oponente se ha desconectado.");
            ui.updateStatus("Conexión perdida.");
        }
        state.resetRemoteState();
        gameLogic.updateAllUITogglesHandler();
        gameLogic.init(); // Reset to a clean local state
    },
    onError: (err) => {
        console.error(`PeerConnection: PeerJS Error Object at ${new Date().toISOString()}:`, err);
        // Avoid showing overlay for common/less critical network errors that PeerJS might handle or that are transient
        const nonOverlayErrorTypes = [
            'peer-unavailable', 'network', 'socket-error', 'server-error', 
            'socket-closed', 'disconnected', 'webrtc', 'negotiation-failed',
            'browser-incompatible' 
            // Add any other types that you find are too noisy for an overlay
        ];
        if (err.type && !nonOverlayErrorTypes.includes(err.type)) {
             ui.showOverlay(`Error de conexión: ${err.type || err.message || 'desconocido'}`);
        } else if (!err.type && err.message) { // Generic error with a message
             ui.showOverlay(`Error de conexión: ${err.message || 'desconocido'}`);
        } else {
            console.log(`PeerJS onError: A common or less critical error occurred, not showing overlay. Type: ${err.type}. Timestamp: ${new Date().toISOString()}`);
        }
        ui.updateStatus("Error de conexión.");
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
    state.setTurnCounter(0); // Explicitly reset turn counter when starting as host

    gameLogic.updateAllUITogglesHandler();
    ui.updateStatus("Estableciendo conexión como Host...");
    ui.hideOverlay();

    if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.init === 'function') {
        window.peerJsMultiplayer.init(null, peerJsCallbacks);
    } else {
        console.error("PeerConnection: peerJsMultiplayer.init not found when trying to host. Timestamp: ${new Date().toISOString()}");
        peerJsCallbacks.onError?.({type: 'init_failed', message: 'Módulo multijugador (PeerJS) no encontrado.'});
    }
}

export function initializePeerAsJoiner(hostIdFromUrl, stopPreviousGameCallback) {
    stopPreviousGameCallback();
    state.setVsCPU(false);
    state.setPvpRemoteActive(true);
    state.setIAmPlayer1InRemote(false);
    state.setGamePaired(false);
    state.setTurnCounter(0); // Explicitly reset turn counter when starting as joiner

    gameLogic.updateAllUITogglesHandler();
    ui.hideOverlay();

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
        console.error("PeerConnection: peerJsMultiplayer.init not found when trying to join. Timestamp: ${new Date().toISOString()}");
        peerJsCallbacks.onError?.({type: 'init_failed', message: 'Módulo multijugador (PeerJS) no encontrado.'});
    }
}

export function sendPeerData(data) {
    if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.send === 'function' && state.gamePaired) {
        // DEBUGGING LOG: Log data being sent
        // console.log(`PeerConnection: TX @ ${new Date().toISOString()}: Type: ${data.type}`, data); // Can be very verbose
        window.peerJsMultiplayer.send(data);
    } else if (!state.gamePaired) {
        console.warn(`PeerConnection: Cannot send data, game not paired. Type: ${data.type}. Timestamp: ${new Date().toISOString()}`, data);
    } else {
        console.error(`PeerConnection: peerJsMultiplayer.send not available to send data. Type: ${data.type}. Timestamp: ${new Date().toISOString()}`, data);
    }
}

export function closePeerSession() {
    if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.close === 'function') {
        window.peerJsMultiplayer.close();
    }
}