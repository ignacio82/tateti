// peerConnection.js
import * as state from './state.js';
import * as ui from './ui.js'; // Import ui directly
import * as player from './player.js';
import * as gameLogic from './gameLogic.js';
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
        console.log("PeerConnection: Data received:", data);
        if(data.type === 'player_info') {
            state.setOpponentPlayerName(data.name || 'Oponente Remoto');
            state.setOpponentPlayerIcon(data.icon);
            console.log("PeerConnection: Opponent info updated:", state.opponentPlayerName, state.opponentPlayerIcon);
            player.determineEffectiveIcons();
            ui.updateScoreboard(); // THIS IS LINE 62 - Corrected to call ui.updateScoreboard()

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

        // Logic for 'move', 'restart_request', 'restart_ack'
        if (data.type === 'move') { // Generic 'move' type from original code.
            // This needs to be more specific for 3-Piezas MOVING phase.
            // For now, assuming data.index is for placement (Classic or 3-Piezas PLACING)
            // or data.from/data.to for 3-Piezas MOVING
            if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && state.gamePhase === state.GAME_PHASES.MOVING) {
                if (typeof data.from === 'number' && typeof data.to === 'number') {
                    handleRemoteSlide(data.from, data.to);
                } else {
                    console.warn("PeerConnection: Received 'move' for 3-Piece MOVING phase without from/to data.", data);
                }
            } else if (typeof data.index === 'number') { // Placement for Classic or 3-Piece PLACING
                 handleRemotePlacement(data.index);
            } else {
                console.warn("PeerConnection: Received 'move' without valid index or from/to.", data);
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

function applyRemoteGameLogic(playerSymbol) {
    const winDetails = gameLogic.checkWin(playerSymbol);
    if (winDetails) {
        gameLogic.endGame(playerSymbol, winDetails);
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
    gameLogic.showEasyModeHint();
}

function handleRemotePlacement(index) {
    ui.hideOverlay();
    if (typeof index !== 'number' || index < 0 || index > 8 || !state.gameActive) {
        console.warn("PeerConnection: Invalid remote placement data received.", {index, gameActive: state.gameActive});
        return;
    }
    const remotePlayerSymbol = state.opponentEffectiveIcon;
    if (!gameLogic.makeMove(index, remotePlayerSymbol)) {
        console.warn("PeerConnection: Invalid remote placement move attempted on board.", {index});
        return;
    }
    applyRemoteGameLogic(remotePlayerSymbol);
}

function handleRemoteSlide(fromIndex, toIndex) {
    ui.hideOverlay();
    if (typeof fromIndex !== 'number' || typeof toIndex !== 'number' ||
        fromIndex < 0 || fromIndex > 8 || toIndex < 0 || toIndex > 8 || !state.gameActive) {
        console.warn("PeerConnection: Invalid remote slide data received.", {fromIndex, toIndex, gameActive: state.gameActive});
        return;
    }
    const remotePlayerSymbol = state.opponentEffectiveIcon;
    if (!gameLogic.movePiece(fromIndex, toIndex, remotePlayerSymbol)) {
        console.warn("PeerConnection: Invalid remote slide move attempted on board.", {fromIndex, toIndex});
        return;
    }
    applyRemoteGameLogic(remotePlayerSymbol);
}


export function sendPeerData(data) {
    if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.send === 'function') {
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