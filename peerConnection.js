// peerConnection.js - Fixed version with proper exports and matchmaking flow
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
            const gameLink = `https://tateti.martinez.fyi/?room=${id}`;
            ui.updateStatus(`Comparte el enlace o ID: ${id}`);
            ui.displayQRCode(gameLink);
        } else if (state.pvpRemoteActive && !state.iAmPlayer1InRemote) {
            if (state.currentHostPeerId && window.peerJsMultiplayer?.connect) {
                console.log(`PeerJS: Joiner (my ID ${id}) connecting to host: ${state.currentHostPeerId}. Timestamp: ${new Date().toISOString()}`);
                window.peerJsMultiplayer.connect(state.currentHostPeerId);
            } else {
                console.error(`PeerConnection: Host ID not set for joiner/connect unavailable. TS: ${new Date().toISOString()}`);
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
        
        // For matchmaking scenarios, determine roles when connection is established
        if (!state.iAmPlayer1InRemote && !state.gamePaired) {
            // If we're receiving a connection and we haven't established roles yet,
            // the one receiving the connection becomes Player 1 (host-like role)
            state.setIAmPlayer1InRemote(true);
            console.log('[PeerConnection] Assigned as Player 1 (host role) due to receiving connection');
        }
    },
    
    onConnectionOpen: () => {
        console.log(`PeerConnection: Data connection opened. Timestamp: ${new Date().toISOString()}`);
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
        console.log(`PeerConnection: RX RAW @ ${new Date().toISOString()}: Type: ${data.type}`, JSON.stringify(data));

        if (data.type === 'reset_game') {
            console.log(`[P2P] Received 'reset_game'. Initializing game locally.`);
            ui.showOverlay("Nueva partida iniciando...");
            setTimeout(() => {
                gameLogic.init();
            }, 500);
            return;
        }

        if (!state.pvpRemoteActive && !['ping', 'player_info'].includes(data.type)) {
            console.warn("PeerConnection: Ignoring data (not PVP remote / not player_info/ping).", data); 
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
            console.log(`[P2P] Received full_state_update. Local TC: ${state.turnCounter}. Data TC: ${data.turnCounter}. Local variant: ${state.gameVariant}. Data variant: ${data.gameVariant}.`);
            
            if (typeof data.turnCounter !== 'number' || (data.turnCounter <= state.turnCounter && state.turnCounter !== 0)) {
                console.warn(`[P2P] Ignoring stale/duplicate state. RX TC: ${data.turnCounter}, Local TC: ${state.turnCounter}.`, data); 
                return;
            }

            const { board, currentPlayer, gamePhase: gamePhaseFromSender, gameActive, turnCounter: receivedTurnCounter,
                    gameVariant: variantFromSender, winner, draw, selectedPieceIndex } = data;

            if (!board || !Array.isArray(board) || board.length !== 9 || !currentPlayer || !gamePhaseFromSender || typeof gameActive !== 'boolean' || !variantFromSender) {
                console.error(`[P2P] Invalid full_state_update content after TC check. Missing critical fields.`, data); 
                return;
            }
            
            console.log(`[P2P] Processing full_state_update (TC validated: ${receivedTurnCounter}). Variant from sender: ${variantFromSender}.`);

            const oldGameActive = state.gameActive;

            state.setTurnCounter(receivedTurnCounter);
            console.log(`[P2P] Local TC updated to: ${state.turnCounter}`);

            if (state.gameVariant !== variantFromSender) {
                console.log(`[P2P] Applying gameVariant from sender. Old: ${state.gameVariant}, New: ${variantFromSender}`);
                state.setGameVariant(variantFromSender);
            }

            state.setBoard([...board]);
            state.setCurrentPlayer(currentPlayer);
            state.setGameActive(gameActive);
            if (selectedPieceIndex !== undefined) state.setSelectedPieceIndex(selectedPieceIndex);

            const newDerivedPhase = gameLogic.boardToPhase(state.board, state.gameVariant, gamePhaseFromSender);
            console.log(`[P2P] peerConnection: gamePhaseFromSender: ${gamePhaseFromSender}. Derived new phase: ${newDerivedPhase}. Current local state.gamePhase before set: ${state.gamePhase}.`);
            state.setGamePhase(newDerivedPhase);

            console.log(`[P2P] Applying UI updates. Board to render:`, JSON.stringify(state.board));
            ui.clearBoardUI(); 
            ui.clearSelectedPieceHighlight();
            state.board.forEach((symbol, index) => ui.updateCellUI(index, symbol || null));
            player.determineEffectiveIcons(); 
            ui.updateScoreboard();

            if (!state.gameActive) {
                ui.setBoardClickable(false);
                console.log(`[P2P] Game ended via full_state_update. Phase: ${state.gamePhase}, Winner: ${winner}, Draw: ${draw}, TC: ${state.turnCounter}.`);
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
            console.log(`[P2P] State applied. My turn: ${myTurnNow}. Player: ${state.currentPlayer}(${player.getPlayerName(state.currentPlayer)}), Phase: ${state.gamePhase}, Variant: ${state.gameVariant}, TC: ${state.turnCounter}.`);

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
                const fullStateData = {
                    type: 'full_state_update', 
                    board: [...state.board], 
                    currentPlayer: state.currentPlayer,
                    gamePhase: state.gamePhase,
                    gameActive: state.gameActive, 
                    turnCounter: state.turnCounter,
                    gameVariant: state.gameVariant,
                    winner: state.gameActive ? null : state.lastWinner,
                    draw: state.gameActive ? false : (!state.lastWinner && !state.gameActive && state.board.every(c=>c!==null)),
                    selectedPieceIndex: state.selectedPieceIndex
                };
                console.log(`[P2P] Sending full_state_update for request_full_state. Phase: ${state.gamePhase}, Variant: ${state.gameVariant}, TC: ${state.turnCounter}.`, JSON.stringify(fullStateData));
                sendPeerData(fullStateData);
            }
            return;
        }
        
        console.warn(`PeerConnection: Received unhandled data type: ${data.type} at ${new Date().toISOString()}`, data);
    },
    
    onConnectionClose: () => {
        console.log(`PeerConnection: Connection closed. Timestamp: ${new Date().toISOString()}`);
        if(state.pvpRemoteActive){
            ui.showOverlay("El oponente se ha desconectado.");
            ui.updateStatus("Conexión perdida.");
        }
        state.resetRemoteState(); 
        gameLogic.updateAllUITogglesHandler(); 
        gameLogic.init();
    },
    
    onError: (err) => {
        console.error(`PeerConnection: PeerJS Error Object at ${new Date().toISOString()}:`, err);
        const nonOverlayErrorTypes = ['peer-unavailable','network','socket-error','server-error','socket-closed','disconnected','webrtc','negotiation-failed','browser-incompatible'];
        let message = err.message || (typeof err === 'string' ? err : 'Error desconocido');
        if (err.type) {
            message = `${err.type}: ${message}`;
        }

        if(err.type && !nonOverlayErrorTypes.includes(err.type) || !err.type) {
            ui.showOverlay(`Error de conexión: ${message}`);
        } else {
            console.log(`PeerJS onError: Common/less critical error, no overlay. Message: ${message}. Timestamp: ${new Date().toISOString()}`);
        }
        ui.updateStatus("Error de conexión."); 
        state.resetRemoteState(); 
        gameLogic.updateAllUITogglesHandler(); 
        ui.hideQRCode();
    }
};

// Function to get the local PeerJS ID - FIXED: Now properly exported
export function getLocalPeerId() {
    if (window.peerJsMultiplayer) {
        return window.peerJsMultiplayer.getLocalId();
    }
    return null;
}

// Initialize PeerJS session - ensures peer is connected to PeerServer and has an ID
export function ensurePeerInitialized(customCallbacks = {}) {
    if (window.peerJsMultiplayer?.init) {
        // Merge default callbacks with any custom ones, prioritizing custom ones.
        const effectiveCallbacks = {
            ...peerJsCallbacks, // Default game handlers
            onPeerOpen: (id) => {
                console.log('[ensurePeerInitialized] PeerJS open with ID:', id);
                peerJsCallbacks.onPeerOpen(id); // Call original game's onPeerOpen
                customCallbacks.onPeerOpen?.(id); // Call any custom onPeerOpen (e.g., from matchmaking)
            },
            onError: (err) => {
                peerJsCallbacks.onError(err); // Call original game's onError
                customCallbacks.onError?.(err); // Call any custom onError
            },
            // For matchmaking, we might want to override other callbacks too
            onNewConnection: (conn) => {
                peerJsCallbacks.onNewConnection(conn);
                customCallbacks.onNewConnection?.(conn);
            },
            onConnectionOpen: () => {
                peerJsCallbacks.onConnectionOpen();
                customCallbacks.onConnectionOpen?.();
            },
            onDataReceived: (data) => {
                peerJsCallbacks.onDataReceived(data);
                customCallbacks.onDataReceived?.(data);
            },
            onConnectionClose: () => {
                peerJsCallbacks.onConnectionClose();
                customCallbacks.onConnectionClose?.();
            }
        };
        window.peerJsMultiplayer.init(null, effectiveCallbacks);
    } else {
        console.error("PeerConnection: peerJsMultiplayer.init not found (ensurePeerInitialized).");
        customCallbacks.onError?.({ type: 'init_failed', message: 'Módulo multijugador no disponible.' });
    }
}

export function initializePeerAsHost(stopPreviousGameCallback) {
    stopPreviousGameCallback?.(); 
    state.setVsCPU(false); 
    state.setPvpRemoteActive(true);
    state.setIAmPlayer1InRemote(true); 
    state.setGamePaired(false); 
    state.setCurrentHostPeerId(null);
    gameLogic.updateAllUITogglesHandler(); 
    ui.updateStatus("Estableciendo conexión como Host..."); 
    ui.hideOverlay();
    
    if(window.peerJsMultiplayer?.init) {
        window.peerJsMultiplayer.init(null, peerJsCallbacks);
    } else {
        console.error(`PeerConnection: peerJsMultiplayer.init not found (host). TS: ${new Date().toISOString()}`); 
        peerJsCallbacks.onError?.({type:'init_failed',message:'Módulo multijugador no encontrado.'});
    }
}

export function initializePeerAsJoiner(hostIdFromUrl, stopPreviousGameCallback) {
    stopPreviousGameCallback?.(); 
    state.setVsCPU(false); 
    state.setPvpRemoteActive(true);
    state.setIAmPlayer1InRemote(false); 
    state.setGamePaired(false);
    gameLogic.updateAllUITogglesHandler(); 
    ui.hideOverlay();
    
    const hostIdInput = hostIdFromUrl || prompt("Ingresa el ID del Host:");
    if(!hostIdInput?.trim()){
        ui.showOverlay("ID Host no ingresado.");
        ui.updateStatus("Cancelado.");
        state.setPvpRemoteActive(false);
        gameLogic.updateAllUITogglesHandler();
        return;
    }
    
    state.setCurrentHostPeerId(hostIdInput.trim());
    ui.showOverlay(`Conectando al Host ID: ${state.currentHostPeerId}...`); 
    ui.updateStatus(`Intentando conectar a ${state.currentHostPeerId}...`);
    
    if(window.peerJsMultiplayer?.init) {
        window.peerJsMultiplayer.init(null, peerJsCallbacks);
    } else {
        console.error(`PeerConnection: peerJsMultiplayer.init not found (joiner). TS: ${new Date().toISOString()}`); 
        peerJsCallbacks.onError?.({type:'init_failed',message:'Módulo multijugador no encontrado.'});
    }
}

// Direct connect function for matchmaking once opponent PeerID is known
export function connectToDiscoveredPeer(remotePeerId) {
    if (!remotePeerId) {
        console.error("connectToDiscoveredPeer: remotePeerId is null or undefined.");
        peerJsCallbacks.onError?.({type: 'connect_error', message: 'ID de par remoto nulo.'});
        return;
    }
    
    if (window.peerJsMultiplayer?.connect) {
        console.log(`[PeerConnection] Attempting to connect to discovered peer: ${remotePeerId}`);
        // Set that we are the joiner (Player 2) when connecting to discovered peer
        state.setIAmPlayer1InRemote(false);
        window.peerJsMultiplayer.connect(remotePeerId);
    } else {
        console.error("connectToDiscoveredPeer: peerJsMultiplayer.connect not found.");
        peerJsCallbacks.onError?.({type: 'connect_error', message: 'Función de conexión P2P no disponible.'});
    }
}

export function sendPeerData(data) {
    if(window.peerJsMultiplayer?.send && state.gamePaired){ 
        window.peerJsMultiplayer.send(data); 
    } else if(!state.gamePaired) {
        console.warn(`PeerConnection: Cannot send, game not paired. Type: ${data.type}. TS: ${new Date().toISOString()}`, data);
    } else {
        console.error(`PeerConnection: peerJsMultiplayer.send not available. Type: ${data.type}. TS: ${new Date().toISOString()}`, data);
    }
}

export function closePeerSession() {
    if(window.peerJsMultiplayer?.close) {
        window.peerJsMultiplayer.close();
    }
}