// peerConnection.js
import * as state from './state.js';
import * as ui from './ui.js';
import * as player from './player.js';
import * as gameLogic from './gameLogic.js';
import * as sound from './sound.js'; // For connected sound, etc.

// Callbacks that will be passed to window.peerJsMultiplayer.init()
const peerJsCallbacks = {
    onPeerOpen: (id) => { //
        if (state.pvpRemoteActive && state.iAmPlayer1InRemote) { // Host logic
            state.setCurrentHostPeerId(id);
            // const desiredBaseUrl = window.location.origin; // Or your specific base URL
            const desiredBaseUrl = 'https://tateti.martinez.fyi'; // As per original game.js
            const gameLink = `${desiredBaseUrl}/?room=${id}`;

            ui.updateStatus(`Comparte el enlace o ID: ${id}`);
            ui.showOverlay(`Tu ID de Host: ${id}. Esperando conexión...`);
            ui.displayQRCode(gameLink);
        } else if (state.pvpRemoteActive && !state.iAmPlayer1InRemote) { // Joiner logic, ID is for this peer
            // The joiner has its own ID, now it can attempt to connect to the host.
            if (state.currentHostPeerId && window.peerJsMultiplayer?.connect) {
                console.log(`PeerJS: Joiner's peer ID is ${id}. Attempting to connect to host: ${state.currentHostPeerId}`);
                window.peerJsMultiplayer.connect(state.currentHostPeerId);
            } else {
                console.error("PeerConnection: Host ID not set for joiner, or peerJsMultiplayer.connect not available.");
                ui.showOverlay("Error: No se pudo conectar al host.");
                state.resetRemoteState();
                // updateAllUITogglesHandler(); // This needs to be callable or handled globally
            }
        }
    },
    onNewConnection: (conn) => { // Host receives a new connection
        console.log('PeerConnection: Incoming connection from', conn.peer);
        // Game logic might already be preventing multiple connections via currentConnection in peerjs-multiplayer.js
        ui.showOverlay("Jugador 2 conectándose...");
        ui.updateStatus("Jugador 2 está conectándose...");
        // The actual connection setup (like event handlers for data, close) is done by peerjs-multiplayer.js
        // We just get notified here.
    },
    onConnectionOpen: () => { // Both Host and Joiner when connection is ready
        console.log("PeerConnection: Data connection opened with peer.");
        state.setGamePaired(true);
        ui.hideOverlay();
        ui.hideQRCode();

        player.determineEffectiveIcons(); // Determine icons before sending player info
        if (window.peerJsMultiplayer?.send) {
            window.peerJsMultiplayer.send({
                type: 'player_info',
                name: state.myPlayerName,
                icon: state.myEffectiveIcon // Send my determined effective icon
            });
        }
        ui.updateStatus("¡Conectado! Iniciando partida...");
        sound.playSound('win'); // Or a specific 'connected' sound
        gameLogic.init(); // Initialize game board and turns for the new remote game
    },
    onDataReceived: (data) => { //
        console.log("PeerConnection: Data received:", data);
        if(data.type === 'player_info') {
            state.setOpponentPlayerName(data.name || 'Oponente Remoto');
            state.setOpponentPlayerIcon(data.icon); // Opponent sends their effective icon
            console.log("PeerConnection: Opponent info updated:", state.opponentPlayerName, state.opponentPlayerIcon);
            player.determineEffectiveIcons(); // Re-determine all icons with new opponent info
            gameLogic.updateScoreboardHandler(); // Assuming this is set and updates UI

            // Update status based on whose turn it is, if game is active
            if (state.gameActive) {
                ui.updateStatus(state.isMyTurnInRemote ?
                    `Tu Turno ${player.getPlayerName(state.currentPlayer)}` :
                    `Esperando a ${player.getPlayerName(state.currentPlayer)}...`);
            }
            // If connection was established but init hadn't run fully (e.g. waiting for player_info)
            if(!state.gameActive && state.pvpRemoteActive && state.gamePaired) {
                gameLogic.init(); // Ensure game starts if player_info was the last piece
            }
            return;
        }

        // Ignore data if not in an active, paired remote game or if it's my turn (I shouldn't receive moves then)
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

        // Handle game-specific data types
        if (data.type === 'move' && typeof data.index === 'number') {
            handleRemoteMove(data.index);
        } else if (data.type === 'restart_request') {
            console.log("PeerConnection: Received restart request.");
            const requesterName = state.opponentPlayerIcon ? player.getPlayerName(state.opponentPlayerIcon) : "El oponente";
            ui.showOverlay(`${requesterName} quiere reiniciar. Aceptando automáticamente...`); // Or add confirm dialog
            if (window.peerJsMultiplayer?.send) {
                window.peerJsMultiplayer.send({ type: 'restart_ack' });
            }
            // Both sides will call init upon receiving ack or sending it.
            setTimeout(() => { ui.hideOverlay(); gameLogic.init(); }, 2000); // Receiver also inits
        } else if (data.type === 'restart_ack') {
            console.log("PeerConnection: Received restart acknowledgement.");
            ui.showOverlay("Reinicio aceptado. Nueva partida.");
            setTimeout(() => { ui.hideOverlay(); gameLogic.init(); }, 1500); // Requester inits
        }
    },
    onConnectionClose: () => { //
        console.log("PeerConnection: Connection closed.");
        if (state.pvpRemoteActive) { // Only show overlay if we were in an active remote session
            ui.showOverlay("El oponente se ha desconectado.");
            ui.updateStatus("Conexión perdida.");
        }
        state.resetRemoteState(); // Reset flags like pvpRemoteActive, gamePaired
        gameLogic.updateAllUITogglesHandler(); // Update UI buttons
        // Optionally, could call gameLogic.init() to reset to a local game state.
    },
    onError: (err) => { //
        console.error('PeerConnection: PeerJS Error:', err);
        ui.showOverlay(`Error de conexión: ${err.type || err.message}`);
        // Could add more specific error handling here based on err.type
        // e.g., 'peer-unavailable', 'network'
        state.resetRemoteState();
        gameLogic.updateAllUITogglesHandler();
    }
};

/**
 * Initializes PeerJS for hosting a game.
 * @param {function} stopPreviousGameCallback - Callback to stop any ongoing game.
 */
export function initializePeerAsHost(stopPreviousGameCallback) { //
    stopPreviousGameCallback(); // Ensure any existing game/connection is stopped
    state.setVsCPU(false);
    state.setPvpRemoteActive(true);
    state.setIAmPlayer1InRemote(true);
    state.setGamePaired(false);
    state.setCurrentHostPeerId(null);

    gameLogic.updateAllUITogglesHandler(); // Update UI to reflect "hosting" state
    ui.showOverlay("Configurando partida remota como Host...");
    ui.updateStatus("Estableciendo conexión como Host...");

    if (window.peerJsMultiplayer?.init) {
        // The peerjs-multiplayer.js script should handle creating a new Peer object.
        // We pass our game-specific callbacks to it.
        window.peerJsMultiplayer.init(null, peerJsCallbacks);
    } else {
        console.error("PeerConnection: peerJsMultiplayer.init not found.");
        peerJsCallbacks.onError({ type: 'init_failed', message: 'Módulo multijugador (PeerJS) no encontrado.' });
    }
}

/**
 * Initializes PeerJS for joining a game.
 * @param {string|null} hostIdFromUrl - The host's Peer ID if provided via URL.
 * @param {function} stopPreviousGameCallback - Callback to stop any ongoing game.
 */
export function initializePeerAsJoiner(hostIdFromUrl, stopPreviousGameCallback) { //
    stopPreviousGameCallback();
    state.setVsCPU(false);
    state.setPvpRemoteActive(true);
    state.setIAmPlayer1InRemote(false);
    state.setGamePaired(false);

    gameLogic.updateAllUITogglesHandler(); // Update UI

    const hostIdInput = hostIdFromUrl || prompt("Ingresa el ID del Host al que deseas unirte:");
    if (!hostIdInput || hostIdInput.trim() === "") {
        ui.showOverlay("ID del Host no ingresado. Operación cancelada.");
        ui.updateStatus("Cancelado. Ingresa un ID para unirte.");
        state.setPvpRemoteActive(false); // Revert state
        gameLogic.updateAllUITogglesHandler();
        return;
    }
    state.setCurrentHostPeerId(hostIdInput.trim());

    ui.showOverlay(`Conectando al Host ID: ${state.currentHostPeerId}...`);
    ui.updateStatus(`Intentando conectar a ${state.currentHostPeerId}...`);

    if (window.peerJsMultiplayer?.init && window.peerJsMultiplayer?.connect) {
        // Initialize PeerJS for the joiner. It will get its own ID.
        // The actual connection to hostId is done in peerJsCallbacks.onPeerOpen
        // OR peerjs-multiplayer.js might handle calling connect itself after init.
        // For this model, let's assume init gets an ID, then we explicitly connect.
        // The peerjs-multiplayer.js's init will call our onPeerOpen, which then calls connect.
        window.peerJsMultiplayer.init(null, peerJsCallbacks);
    } else {
        console.error("PeerConnection: peerJsMultiplayer.init or .connect not found.");
        peerJsCallbacks.onError({ type: 'init_failed', message: 'Módulo multijugador (PeerJS) no encontrado.' });
    }
}

/**
 * Handles a game move received from the remote peer.
 * @param {number} index - The cell index of the move.
 */
function handleRemoteMove(index) { //
    ui.hideOverlay(); // Hide any "waiting" overlay

    // Validate move (basic check, gameLogic.makeMove will do more)
    if (typeof index !== 'number' || index < 0 || index > 8 || !state.gameActive) {
        console.warn("PeerConnection: Invalid remote move data received.", {index, gameActive: state.gameActive});
        return;
    }

    // The move is from the opponent, so use opponentEffectiveIcon
    if (!gameLogic.makeMove(index, state.opponentEffectiveIcon)) {
        // Move was invalid (e.g., cell already taken), though this should ideally be prevented by sender.
        console.warn("PeerConnection: Invalid remote move attempted on board.", {index});
        return;
    }

    // Check game state after opponent's move
    const winDetails = gameLogic.checkWin(state.opponentEffectiveIcon);
    if (winDetails) {
        gameLogic.endGame(state.opponentEffectiveIcon, winDetails);
        return;
    }
    if (gameLogic.checkDraw()) {
        gameLogic.endDraw();
        return;
    }

    // It's now my turn
    state.setCurrentPlayer(state.myEffectiveIcon);
    state.setIsMyTurnInRemote(true);
    ui.updateStatus(`Tu Turno ${player.getPlayerName(state.currentPlayer)}`);
    ui.setBoardClickable(true);
}

/**
 * Sends data (e.g., a game move or restart request) to the connected peer.
 * @param {object} data - The data object to send.
 */
export function sendPeerData(data) {
    if (window.peerJsMultiplayer?.send) {
        window.peerJsMultiplayer.send(data);
    } else {
        console.error("PeerConnection: peerJsMultiplayer.send not available.");
    }
}

/**
 * Closes the current PeerJS session (data connection and peer object).
 */
export function closePeerSession() {
    if (window.peerJsMultiplayer?.close) {
        window.peerJsMultiplayer.close();
    }
    // state.resetRemoteState(); // This is usually handled by onConnectionClose callback
    // gameLogic.updateAllUITogglesHandler();
}