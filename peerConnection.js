// peerConnection.js - Consistent with latest gameLogic.js
import * as state from './state.js';
import * as ui from './ui.js';
import * as player from './player.js';
import * as gameLogic from './gameLogic.js'; // Ensure this uses the gameLogic that exports boardToPhase
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
                console.error(`PeerConnection: Host ID not set for joiner, or connect unavailable. Timestamp: ${new Date().toISOString()}`);
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
            });
        }
        ui.updateStatus("¡Conectado! Iniciando partida...");
        sound.playSound('win');
        gameLogic.init(); // This call ensures turnCounter is 0 for both players at the start of a P2P game.
    },
    onDataReceived: (data) => {
        console.log(`PeerConnection: RX RAW @ ${new Date().toISOString()}: Type: ${data.type}`, JSON.stringify(data)); // Log stringified data

        if (!state.pvpRemoteActive && data.type !== 'ping' && data.type !=='player_info') {
            console.warn("PeerConnection: Received data but not in PVP remote mode (or not player_info). Ignoring.", data);
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

        if (data.type === 'full_state_update') {
            console.log(`[P2P] Received full_state_update. Current local TC: ${state.turnCounter}. Data TC: ${data.turnCounter}. Timestamp: ${new Date().toISOString()}`);

            if (typeof data.turnCounter !== 'number') {
                console.warn(`[P2P] Ignoring update: data.turnCounter is not a number. Data:`, data);
                return;
            }
            if (data.turnCounter <= state.turnCounter) {
              console.warn(
                `[P2P] Ignoring stale/duplicate state. Received TC: ${data.turnCounter}, Local TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`,
                data
              );
              return; 
            }
            
            console.log(`[P2P] Processing full_state_update (TC validated: ${data.turnCounter} > ${state.turnCounter}). Timestamp: ${new Date().toISOString()}`, data);
            const { board, currentPlayer, gamePhase: gamePhaseFromSender, gameActive, winner, draw, selectedPieceIndex, turnCounter: receivedTurnCounter } = data;

            if (!board || !Array.isArray(board) || board.length !== 9 || !currentPlayer || !gamePhaseFromSender || typeof gameActive !== 'boolean') {
                console.error(`[P2P] Received invalid full_state_update content after TC check. Ignoring. Timestamp: ${new Date().toISOString()}`, data);
                return;
            }

            const oldGameActive = state.gameActive;

            state.setTurnCounter(receivedTurnCounter); // Update local turn counter first
            console.log(`[P2P] Local TC updated to: ${state.turnCounter}`);

            state.setBoard([...board]);
            state.setCurrentPlayer(currentPlayer);
            // gamePhase will be set after this using boardToPhase
            state.setGameActive(gameActive);
            
            // Derive and set phase based on the received board state
            const newDerivedPhase = gameLogic.boardToPhase(state.board, state.gameVariant, gamePhaseFromSender);
            console.log(`[P2P] peerConnection: gamePhaseFromSender: ${gamePhaseFromSender}. Derived new phase: ${newDerivedPhase}. Current local state.gamePhase before set: ${state.gamePhase}. Timestamp: ${new Date().toISOString()}`);
            state.setGamePhase(newDerivedPhase);

            if (selectedPieceIndex !== undefined) {
                state.setSelectedPieceIndex(selectedPieceIndex);
            }

            console.log(`[P2P] Applying UI updates. Board to render:`, JSON.stringify(state.board));
            ui.clearBoardUI();
            ui.clearSelectedPieceHighlight();
            state.board.forEach((symbol, index) => {
                // console.log(`[P2P] Updating cell ${index} with symbol ${symbol}`); // Can be very verbose
                ui.updateCellUI(index, symbol || null);
            });

            player.determineEffectiveIcons();
            ui.updateScoreboard();

            if (!state.gameActive) {
                ui.setBoardClickable(false);
                console.log(`[P2P] Game ended via full_state_update. Phase: ${state.gamePhase}, TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`);
                if (winner) {
                    state.setLastWinner(winner);
                    ui.updateStatus(`${player.getPlayerName(winner)} GANA!`);
                    const winningCells = gameLogic.checkWin(winner, state.board);
                    if(winningCells) ui.highlightWinner(winningCells);
                    if (oldGameActive) ui.launchConfetti?.();
                } else if (draw) {
                    state.setLastWinner(null);
                    ui.updateStatus('¡EMPATE!');
                    if (oldGameActive) ui.playDrawAnimation?.();
                } else {
                     ui.updateStatus("Juego terminado.");
                }
                return;
            }

            const myTurnNow = (state.currentPlayer === state.myEffectiveIcon);
            state.setIsMyTurnInRemote(myTurnNow);

            console.log(`[P2P] State applied by full_state_update. My turn: ${myTurnNow}. Current player: ${state.currentPlayer} (${player.getPlayerName(state.currentPlayer)}), Phase: ${state.gamePhase}, TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`);

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

        if (data.type === 'restart_request') {
            const requesterName = state.opponentPlayerName || "El oponente";
            ui.showOverlay(`${requesterName} quiere reiniciar. Aceptando...`);
            if (window.peerJsMultiplayer?.send) {
                window.peerJsMultiplayer.send({ type: 'restart_ack' });
            }
            setTimeout(() => { ui.hideOverlay(); gameLogic.init(); }, 100);
            return;
        }

        if (data.type === 'restart_ack') {
            ui.showOverlay("Reinicio aceptado. Nueva partida...");
            setTimeout(() => { ui.hideOverlay(); gameLogic.init(); }, 100);
            return;
        }

        if (data.type === 'request_full_state') {
            if (window.peerJsMultiplayer?.send) {
                const currentBoardPhase = gameLogic.boardToPhase(state.board, state.gameVariant, state.gamePhase);
                if (currentBoardPhase !== state.gamePhase) {
                    console.warn(`[P2P] request_full_state: Local gamePhase ${state.gamePhase} differs from derived ${currentBoardPhase}. Correcting before sending.`);
                    state.setGamePhase(currentBoardPhase); // Ensure local state is consistent before sending
                }
                 const fullStateData = {
                    type: 'full_state_update', board: [...state.board], currentPlayer: state.currentPlayer,
                    gamePhase: state.gamePhase, // Send the now confirmed correct phase
                    gameActive: state.gameActive, turnCounter: state.turnCounter,
                    winner: state.gameActive ? null : state.lastWinner,
                    draw: state.gameActive ? false : (!state.lastWinner && !state.gameActive && state.board.every(c=>c!==null)),
                    selectedPieceIndex: state.selectedPieceIndex
                };
                console.log(`[P2P] Sending full_state_update in response to request_full_state. Phase: ${state.gamePhase}, TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`, JSON.stringify(fullStateData));
                sendPeerData(fullStateData);
            }
            return;
        }
        console.warn(`PeerConnection: Received unhandled data type: ${data.type} at ${new Date().toISOString()}`, data);
    },
    onConnectionClose: () => {
        console.log(`PeerConnection: Connection closed. Timestamp: ${new Date().toISOString()}`);
        if(state.pvpRemoteActive){ui.showOverlay("El oponente se ha desconectado.");ui.updateStatus("Conexión perdida.");}
        state.resetRemoteState(); gameLogic.updateAllUITogglesHandler(); gameLogic.init();
    },
    onError: (err) => {
        console.error(`PeerConnection: PeerJS Error Object at ${new Date().toISOString()}:`, err);
        const nonOverlayErrorTypes = ['peer-unavailable','network','socket-error','server-error','socket-closed','disconnected','webrtc','negotiation-failed','browser-incompatible'];
        if(err.type&&!nonOverlayErrorTypes.includes(err.type)){ui.showOverlay(`Error de conexión: ${err.type||err.message||'desconocido'}`);}
        else if(!err.type&&err.message){ui.showOverlay(`Error de conexión: ${err.message||'desconocido'}`);}
        else{console.log(`PeerJS onError: Common/less critical error, no overlay. Type: ${err.type}. Timestamp: ${new Date().toISOString()}`);}
        ui.updateStatus("Error de conexión."); state.resetRemoteState(); gameLogic.updateAllUITogglesHandler(); ui.hideQRCode();
    }
};

export function initializePeerAsHost(stopPreviousGameCallback) {
    stopPreviousGameCallback(); state.setVsCPU(false); state.setPvpRemoteActive(true);
    state.setIAmPlayer1InRemote(true); state.setGamePaired(false); state.setCurrentHostPeerId(null);
    // state.setTurnCounter(0); // init will call resetGameFlowState which resets TC
    gameLogic.updateAllUITogglesHandler(); ui.updateStatus("Estableciendo conexión como Host..."); ui.hideOverlay();
    if(window.peerJsMultiplayer?.init) window.peerJsMultiplayer.init(null, peerJsCallbacks);
    else {console.error(`PeerConnection: peerJsMultiplayer.init not found (host). TS: ${new Date().toISOString()}`); peerJsCallbacks.onError?.({type:'init_failed',message:'Módulo multijugador no encontrado.'});}
}

export function initializePeerAsJoiner(hostIdFromUrl, stopPreviousGameCallback) {
    stopPreviousGameCallback(); state.setVsCPU(false); state.setPvpRemoteActive(true);
    state.setIAmPlayer1InRemote(false); state.setGamePaired(false);
    // state.setTurnCounter(0); // init will call resetGameFlowState which resets TC
    gameLogic.updateAllUITogglesHandler(); ui.hideOverlay();
    const hostIdInput = hostIdFromUrl || prompt("Ingresa el ID del Host:");
    if(!hostIdInput?.trim()){ui.showOverlay("ID Host no ingresado.");ui.updateStatus("Cancelado.");state.setPvpRemoteActive(false);gameLogic.updateAllUITogglesHandler();return;}
    state.setCurrentHostPeerId(hostIdInput.trim());
    ui.showOverlay(`Conectando al Host ID: ${state.currentHostPeerId}...`); ui.updateStatus(`Intentando conectar a ${state.currentHostPeerId}...`);
    if(window.peerJsMultiplayer?.init) window.peerJsMultiplayer.init(null, peerJsCallbacks);
    else {console.error(`PeerConnection: peerJsMultiplayer.init not found (joiner). TS: ${new Date().toISOString()}`); peerJsCallbacks.onError?.({type:'init_failed',message:'Módulo multijugador no encontrado.'});}
}

export function sendPeerData(data) {
    if(window.peerJsMultiplayer?.send && state.gamePaired){ window.peerJsMultiplayer.send(data); }
    else if(!state.gamePaired)console.warn(`PeerConnection: Cannot send, game not paired. Type: ${data.type}. TS: ${new Date().toISOString()}`, data);
    else console.error(`PeerConnection: peerJsMultiplayer.send not available. Type: ${data.type}. TS: ${new Date().toISOString()}`, data);
}
export function closePeerSession() { if(window.peerJsMultiplayer?.close) window.peerJsMultiplayer.close(); }