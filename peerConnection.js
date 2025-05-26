// peerConnection.js
import * as state from './state.js';
import * as ui from './ui.js';
import * as player from './player.js';
import * as gameLogic from './gameLogic.js';
import * as sound from './sound.js';

// ... (peerJsCallbacks definition remains the same) ...
const peerJsCallbacks = {
    onPeerOpen: (id) => { 
        if (state.pvpRemoteActive && state.iAmPlayer1InRemote) { 
            state.setCurrentHostPeerId(id);
            const desiredBaseUrl = 'https://tateti.martinez.fyi'; 
            const gameLink = `${desiredBaseUrl}/?room=${id}`;

            ui.updateStatus(`Comparte el enlace o ID: ${id}`);
            // ui.showOverlay(`Tu ID de Host: ${id}. Esperando conexión...`); // This will be handled by modal
            ui.displayQRCode(gameLink); // Show QR modal
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
        ui.hideQRCode(); // Hide QR modal once connection is incoming
        ui.showOverlay("Jugador 2 conectándose...");
        ui.updateStatus("Jugador 2 está conectándose...");
    },
    onConnectionOpen: () => { 
        console.log("PeerConnection: Data connection opened with peer.");
        state.setGamePaired(true);
        ui.hideOverlay();
        ui.hideQRCode(); // Ensure QR modal is hidden

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
            gameLogic.updateScoreboardHandler(); 

            if (state.gameActive) {
                ui.updateStatus(state.isMyTurnInRemote ?
                    `Tu Turno ${player.getPlayerName(state.currentPlayer)}` :
                    `Esperando a ${player.getPlayerName(state.currentPlayer)}...`);
            }
            if(!state.gameActive && state.pvpRemoteActive && state.gamePaired) {
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
        console.error('PeerConnection: PeerJS Error Object:', err); // Log the full error object
        ui.showOverlay(`Error de conexión: ${err.type || 'desconocido'}`);
        state.resetRemoteState();
        gameLogic.updateAllUITogglesHandler();
        ui.hideQRCode(); // Hide QR if it was open
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
    // ui.showOverlay("Configurando partida remota como Host..."); // Overlay might be too intrusive if QR modal shows quickly

    // ADD THIS FOR DEBUGGING:
    console.log("Attempting to initialize Peer as Host. window.peerJsMultiplayer is:", typeof window.peerJsMultiplayer, window.peerJsMultiplayer);

    if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.init === 'function') {
        window.peerJsMultiplayer.init(null, peerJsCallbacks);
    } else {
        console.error("PeerConnection: peerJsMultiplayer.init not found or not a function when trying to host.");
        // Ensure peerJsCallbacks.onError is callable even if peerJsMultiplayer is missing
        if(peerJsCallbacks && typeof peerJsCallbacks.onError === 'function') {
            peerJsCallbacks.onError({type: 'init_failed', message: 'Módulo multijugador (PeerJS) no encontrado.'});
        } else {
            // Fallback UI update if callbacks themselves are broken
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

    // ADD THIS FOR DEBUGGING:
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

// ... (handleRemoteMove, sendPeerData, closePeerSession functions remain the same) ...
function handleRemoteMove(index) { 
    ui.hideOverlay(); 

    if (typeof index !== 'number' || index < 0 || index > 8 || !state.gameActive) {
        console.warn("PeerConnection: Invalid remote move data received.", {index, gameActive: state.gameActive});
        return;
    }
    
    // Opponent's effective icon should be current player when it's their turn
    const remotePlayerSymbol = state.opponentEffectiveIcon; 

    if (!gameLogic.makeMove(index, remotePlayerSymbol)) {
        console.warn("PeerConnection: Invalid remote move attempted on board.", {index});
        return;
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
}

export function sendPeerData(data) {
    // ADD THIS FOR DEBUGGING:
    // console.log("Attempting to send peer data. window.peerJsMultiplayer is:", typeof window.peerJsMultiplayer, window.peerJsMultiplayer);

    if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.send === 'function') {
        window.peerJsMultiplayer.send(data);
    } else {
        console.error("PeerConnection: peerJsMultiplayer.send not available or not a function.");
    }
}

export function closePeerSession() {
    // ADD THIS FOR DEBUGGING:
    // console.log("Attempting to close peer session. window.peerJsMultiplayer is:", typeof window.peerJsMultiplayer, window.peerJsMultiplayer);
    
    if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.close === 'function') {
        window.peerJsMultiplayer.close();
    }
    // resetRemoteState is usually handled by onConnectionClose callback, 
    // but if closing proactively, might be needed here or ensure callback fires.
}
