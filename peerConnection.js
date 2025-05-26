// peerConnection.js
import * as state from './state.js';
import * as ui from './ui.js';
import * as player from './player.js';
import * as gameLogic from './gameLogic.js';
import * as sound from './sound.js';

const peerJsCallbacks = {
    onPeerOpen: (id) => {
        console.log(`peerConnection.onPeerOpen: ID ${id}. Am I P1? ${state.iAmPlayer1InRemote}`);
        if (state.pvpRemoteActive && state.iAmPlayer1InRemote) {
            state.setCurrentHostPeerId(id);
            const desiredBaseUrl = 'https://tateti.martinez.fyi';
            const gameLink = `${desiredBaseUrl}/?room=${id}`;
            ui.updateStatus(`Comparte el enlace o ID: ${id}`);
            ui.displayQRCode(gameLink);
        } else if (state.pvpRemoteActive && !state.iAmPlayer1InRemote) {
            if (state.currentHostPeerId && window.peerJsMultiplayer?.connect) {
                console.log(`PeerJS: Joiner (my ID ${id}) connecting to host: ${state.currentHostPeerId}`);
                window.peerJsMultiplayer.connect(state.currentHostPeerId);
            } else {
                console.error("PeerConnection: Host ID not set for joiner, or connect unavailable.");
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
        console.log(`PeerConnection: RX @ ${new Date().toLocaleTimeString()}: Type: ${data.type}`, data);

        if (!state.pvpRemoteActive && data.type !== 'ping') { 
            console.warn("PeerConnection: Received data but not in PVP remote mode. Ignoring.", data);
            return;
        }

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
            return;
        }
        
        // REMOVED 'move_piece' handler. full_state_update is responsible.

        if (data.type === 'full_state_update') {
            console.log('[P2P] Processing full_state_update received:', data);
            const { board, currentPlayer, gamePhase, gameActive, winner, draw, selectedPieceIndex } = data;

            if (!board || !Array.isArray(board) || board.length !== 9 || !currentPlayer || !gamePhase || typeof gameActive !== 'boolean') {
                console.error("[P2P] Received invalid full_state_update. Ignoring.", data);
                return;
            }

            const oldGameActive = state.gameActive;

            // Update all state in the correct order
            state.setBoard([...board]);
            state.setCurrentPlayer(currentPlayer);
            state.setGamePhase(gamePhase);
            state.setGameActive(gameActive);
            
            // Handle selected piece index for 3-piece moving phase
            if (selectedPieceIndex !== undefined) {
                state.setSelectedPieceIndex(selectedPieceIndex);
            }

            // Clear UI first, then repopulate
            ui.clearBoardUI();
            ui.clearSelectedPieceHighlight(); // Clear any previous selection highlights
            state.board.forEach((symbol, index) => ui.updateCellUI(index, symbol || null));
            
            player.determineEffectiveIcons(); 
            ui.updateScoreboard();

            if (!state.gameActive) { 
                ui.setBoardClickable(false); 
                console.log("[P2P] Game ended via full_state_update.");
                if (winner) {
                    state.setLastWinner(winner);
                    ui.updateStatus(`${player.getPlayerName(winner)} GANA!`);
                    const winningCells = gameLogic.checkWin(winner, state.board);
                    if(winningCells) ui.highlightWinner(winningCells);
                    if (oldGameActive) { 
                        ui.launchConfetti?.();
                    }
                } else if (draw) {
                    state.setLastWinner(null);
                    ui.updateStatus('¡EMPATE!');
                    if (oldGameActive) ui.playDrawAnimation?.();
                } else {
                     ui.updateStatus("Juego terminado."); 
                }
                // Restart is handled by restart_request/ack flow.
                return;
            }

            // Game is active, determine whose turn it is
            const myTurnNow = (state.currentPlayer === state.myEffectiveIcon);
            state.setIsMyTurnInRemote(myTurnNow);
            
            console.log(`[P2P] State applied by full_state_update. My turn: ${myTurnNow}. Current player: ${state.currentPlayer} (${player.getPlayerName(state.currentPlayer)}), Phase: ${state.gamePhase}`);

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
                ui.setBoardClickable(true); // This uses the new setBoardClickable logic
                gameLogic.showEasyModeHint?.();
            } else {
                ui.updateStatus(`Esperando a ${player.getPlayerName(state.currentPlayer)}…`);
                ui.setBoardClickable(false); // This uses the new setBoardClickable logic
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
                gameLogic.init();
            }, 100); 
            return;
        }

        if (data.type === 'restart_ack') {
            ui.showOverlay("Reinicio aceptado. Nueva partida...");
            setTimeout(() => { 
                ui.hideOverlay();
                gameLogic.init();
            }, 100); 
            return;
        }
        
        if (data.type === 'request_full_state') { 
            if (window.peerJsMultiplayer?.send) {
                 const fullStateData = {
                    type: 'full_state_update',
                    board: [...state.board],
                    currentPlayer: state.currentPlayer,
                    gamePhase: state.gamePhase,
                    gameActive: state.gameActive,
                    winner: state.gameActive ? null : state.lastWinner,
                    draw: state.gameActive ? false : (!state.lastWinner && !state.gameActive && state.board.every(c=>c!==null)),
                    selectedPieceIndex: state.selectedPieceIndex
                };
                sendPeerData(fullStateData); // Use the exported sendPeerData
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
        state.resetRemoteState(); 
        gameLogic.updateAllUITogglesHandler();
        gameLogic.init(); 
    },
    onError: (err) => {
        console.error('PeerConnection: PeerJS Error Object:', err);
        if (err.type && err.type !== 'peer-unavailable' && err.type !== 'network' && err.type !== 'socket-error' && err.type !== 'server-error' && err.type !== 'socket-closed' && err.type !=='disconnected') {
             ui.showOverlay(`Error de conexión: ${err.type || err.message || 'desconocido'}`);
        } else if (!err.type && err.message) {
             ui.showOverlay(`Error de conexión: ${err.message || 'desconocido'}`);
        } else {
            console.log("PeerJS onError: A common or less critical error occurred, not showing overlay.", err.type);
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

    gameLogic.updateAllUITogglesHandler(); 
    ui.updateStatus("Estableciendo conexión como Host...");
    ui.hideOverlay(); 

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
        console.error("PeerConnection: peerJsMultiplayer.init not found when trying to join.");
        peerJsCallbacks.onError?.({type: 'init_failed', message: 'Módulo multijugador (PeerJS) no encontrado.'});
    }
}

export function sendPeerData(data) {
    if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.send === 'function' && state.gamePaired) { 
        window.peerJsMultiplayer.send(data);
    } else if (!state.gamePaired) {
        // console.warn("PeerConnection: Cannot send data, game not paired.", data); // Too noisy for normal operations like sending restart when game just ended
    } else {
        console.error("PeerConnection: peerJsMultiplayer.send not available to send data.", data);
    }
}

export function closePeerSession() {
    if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.close === 'function') {
        window.peerJsMultiplayer.close();
    }
}