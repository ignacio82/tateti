// peerConnection.js
import * as state from './state.js';
import * as ui from './ui.js'; // Import ui directly
import * as player from './player.js';
import * as gameLogic from './gameLogic.js';
import * as sound from './sound.js';

// ... (peerJsCallbacks definition remains the same until onDataReceived) ...
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
        console.log("PeerConnection: Data received:", data);
        if(data.type === 'player_info') {
            state.setOpponentPlayerName(data.name || 'Oponente Remoto');
            state.setOpponentPlayerIcon(data.icon); 
            console.log("PeerConnection: Opponent info updated:", state.opponentPlayerName, state.opponentPlayerIcon);
            player.determineEffectiveIcons(); 
            ui.updateScoreboard(); // MODIFIED: Call ui.updateScoreboard directly

            if (state.gameActive) {
                ui.updateStatus(state.isMyTurnInRemote ?
                    `Tu Turno ${player.getPlayerName(state.currentPlayer)}` :
                    `Esperando a ${player.getPlayerName(state.currentPlayer)}...`);
            }
            if(!state.gameActive && state.pvpRemoteActive && state.gamePaired) {
                // It's possible init was already called by onConnectionOpen,
                // but if player_info arrives and game hasn't started, ensure it does.
                // This might also re-trigger init if it was already called, which should be safe.
                gameLogic.init(); 
            }
            return;
        }

        if (!state.gameActive || !state.pvpRemoteActive || !state.gamePaired || state.isMyTurnInRemote) {
             console.warn("PeerConnection: Received data but not expecting it or not opponent's turn.", {
                isMyTurnInRemote: state.isMyTurnInRemote,
                gameActive: state.gameActive,
                pvpRemoteActive: state.pvpRemoteActive,
                gamePaired: state.gamePaired,
                receivedDataType: data.type
            });
             return;
        }

        if (data.type === 'move' && typeof data.index === 'number') {
            handleRemoteMove(data.index);
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


export function initializePeerAsHost(stopPreviousGameCallback) {
    stopPreviousGameCallback(); 
    state.setVsCPU(false);
    state.setPvpRemoteActive(true);
    state.setIAmPlayer1InRemote(true);
    state.setGamePaired(false);
    state.setCurrentHostPeerId(null);

    gameLogic.updateAllUITogglesHandler(); 
    ui.updateStatus("Estableciendo conexión como Host...");

    console.log("Attempting to initialize Peer as Host. window.peerJsMultiplayer is:", typeof window.peerJsMultiplayer, window.peerJsMultiplayer);

    if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.init === 'function') {
        window.peerJsMultiplayer.init(null, peerJsCallbacks);
    } else {
        console.error("PeerConnection: peerJsMultiplayer.init not found or not a function when trying to host.");
        if(peerJsCallbacks && typeof peerJsCallbacks.onError === 'function') {
            peerJsCallbacks.onError({type: 'init_failed', message: 'Módulo multijugador (PeerJS) no encontrado.'});
        } else {
            ui.showOverlay("Error crítico: Módulo multijugador no cargado.");
        }
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

    console.log("Attempting to initialize Peer as Joiner. window.peerJsMultiplayer is:", typeof window.peerJsMultiplayer, window.peerJsMultiplayer);

    if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.init === 'function') {
        window.peerJsMultiplayer.init(null, peerJsCallbacks);
    } else {
        console.error("PeerConnection: peerJsMultiplayer.init not found or not a function when trying to join.");
        if(peerJsCallbacks && typeof peerJsCallbacks.onError === 'function') {
            peerJsCallbacks.onError({type: 'init_failed', message: 'Módulo multijugador (PeerJS) no encontrado.'});
        } else {
            ui.showOverlay("Error crítico: Módulo multijugador no cargado.");
        }
    }
}

function handleRemoteMove(index) { 
    ui.hideOverlay(); 

    if (typeof index !== 'number' || index < 0 || index > 8 || !state.gameActive) {
        console.warn("PeerConnection: Invalid remote move data received.", {index, gameActive: state.gameActive});
        return;
    }
    
    const remotePlayerSymbol = state.opponentEffectiveIcon; 

    // Determine which move function to call based on game variant and phase
    if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
        // For Three-Piece, remote moves will always be placements initially,
        // then actual moves. The data structure for 'move' would need to differentiate.
        // Assuming 'data.index' is for placement for now.
        // If it's a slide, data would need { from, to }
        // This part needs careful review based on how slide moves are sent.
        // For now, assuming data.index implies a placement.
        if (state.gamePhase === state.GAME_PHASES.PLACING) {
            if (!gameLogic.makeMove(index, remotePlayerSymbol)) {
                console.warn("PeerConnection: Invalid remote placement move attempted in 3-Piece.", {index});
                return;
            }
        } else if (state.gamePhase === state.GAME_PHASES.MOVING) {
            // This needs `data` to include `from` and `to` for a slide.
            // The current `data.index` is not enough for a slide.
            // This logic will fail if a slide is received with only `data.index`.
            // Let's assume for now the 'move' type with only 'index' is for Classic or 3-Piece placement.
            // A different data.type like 'slide_move' would be needed.
            console.warn("PeerConnection: Received 'move' type data for 3-Piece MOVING phase. Requires {from, to}. Index only is ambiguous here.");
            // Placeholder: if data.from and data.to were present:
            // if (!gameLogic.movePiece(data.from, data.to, remotePlayerSymbol)) { ... }
            return; // Cannot process ambiguous move
        }
    } else { // Classic Ta-Te-Ti
        if (!gameLogic.makeMove(index, remotePlayerSymbol)) {
            console.warn("PeerConnection: Invalid remote move attempted on board (Classic).", {index});
            return;
        }
    }


    const winDetails = gameLogic.checkWin(remotePlayerSymbol);
    if (winDetails) {
        gameLogic.endGame(remotePlayerSymbol, winDetails);
        return;
    }
    if (gameLogic.checkDraw()) {
        gameLogic.endDraw();
        return;
    }

    state.setCurrentPlayer(state.myEffectiveIcon);
    state.setIsMyTurnInRemote(true);
    ui.updateStatus(`Tu Turno ${player.getPlayerName(state.currentPlayer)}`);
    ui.setBoardClickable(true);
    gameLogic.showEasyModeHint(); // Show hint if applicable
}

export function sendPeerData(data) {
    if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.send === 'function') {
        window.peerJsMultiplayer.send(data);
    } else {
        console.error("PeerConnection: peerJsMultiplayer.send not available or not a function.");
    }
}

export function closePeerSession() {
    if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.close === 'function') {
        window.peerJsMultiplayer.close();
    }
}