// webrtc-multiplayer.js
// Manages WebRTC connection and data channels, uses firebase-signaling.js for signaling.

let peerConnection;
let dataChannel;

// Callbacks to be set by game.js via initSession
let onDataChannelOpenCallback = () => console.log("RTC: Data channel opened (default cb).");
let onDataReceivedCallback = (data) => console.log("RTC: Data received (default cb):", data);
let onConnectionStateChangeCallback = (state) => console.log("RTC: Connection state (default cb):", state);

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
    // Add TURN servers here if needed for more complex network scenarios
  ]
};

/**
 * Initializes the WebRTC peer connection and Firebase signaling listeners.
 * @param {boolean} isHost - True if this client is hosting, false if joining.
 * @param {string} roomId - The unique ID for the game room.
 * @param {object} externalCallbacks - Callbacks for game.js (onDataChannelOpen, onDataReceived, onConnectionStateChange).
 */
function initSession(isHost, roomId, externalCallbacks) {
    if (peerConnection) {
        console.warn("RTC: Session already initialized. Closing previous one.");
        closeSession();
    }

    console.log(`RTC: Initializing session for room ${roomId} as ${isHost ? 'Host' : 'Joiner'}`);

    onDataChannelOpenCallback = externalCallbacks.onDataChannelOpen || onDataChannelOpenCallback;
    onDataReceivedCallback = externalCallbacks.onDataReceived || onDataReceivedCallback;
    onConnectionStateChangeCallback = externalCallbacks.onConnectionStateChange || onConnectionStateChangeCallback;

    try {
        peerConnection = new RTCPeerConnection(rtcConfig);
    } catch (error) {
        console.error("RTC: Failed to create RTCPeerConnection:", error);
        if (onConnectionStateChangeCallback) onConnectionStateChangeCallback("failed");
        showStatusOverlay("Error: No se pudo crear Peer Connection."); // Show overlay utility
        return;
    }

    // Event handler for ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log("RTC: Generated ICE candidate:", event.candidate);
            // Send ICE candidate via Firebase
            if (window.firebaseSignaling && window.firebaseSignaling.sendIceCandidate) {
                window.firebaseSignaling.sendIceCandidate(event.candidate);
            } else {
                console.error("RTC: firebaseSignaling.sendIceCandidate is not available.");
            }
        }
    };

    // Event handler for connection state changes
    peerConnection.onconnectionstatechange = () => {
        console.log("RTC: Connection state changed to:", peerConnection.connectionState);
        if (onConnectionStateChangeCallback) {
            onConnectionStateChangeCallback(peerConnection.connectionState);
        }
        // Further handling (e.g., UI updates) can be done in game.js based on the state
    };
    
    // Event handler for receiving a data channel (for the joiner/callee)
    peerConnection.ondatachannel = (event) => {
        console.log('RTC: Data channel received.');
        dataChannel = event.channel;
        setupDataChannelEventHandlers();
    };

    // Initialize Firebase signaling layer
    if (window.firebaseSignaling && window.firebaseSignaling.init) {
        window.firebaseSignaling.init(roomId, isHost ? 'host' : 'joiner', {
            onOffer: async (offer) => {
                if (!isHost) { // Joiner receives offer
                    console.log("RTC: Offer received from Firebase signaling.");
                    await _handleOfferAndCreateAnswer(offer);
                }
            },
            onAnswer: async (answer) => {
                if (isHost) { // Host receives answer
                    console.log("RTC: Answer received from Firebase signaling.");
                    await _handleAnswer(answer);
                }
            },
            onIceCandidate: async (candidate) => {
                console.log("RTC: ICE candidate received from Firebase signaling.");
                await _addIceCandidate(candidate);
            },
            onPeerDisconnect: (role) => {
                console.log(`RTC: Peer (${role}) disconnected signal from Firebase.`);
                showStatusOverlay("El otro jugador se desconectó.");
                if (onConnectionStateChangeCallback) onConnectionStateChangeCallback("disconnected");
                // `closeSession` will be called by game.js or connection state change handler
            }
        });
    } else {
        console.error("RTC: firebaseSignaling.init is not available. Ensure firebase-signaling.js is loaded and initialized before webrtc-multiplayer.js.");
        showStatusOverlay("Error: Falló la inicialización de la señalización.");
        return;
    }
    console.log("RTC: Session initialized.");
}

function setupDataChannelEventHandlers() {
    if (!dataChannel) {
        console.error("RTC: Data channel is not initialized for event handlers.");
        return;
    }
    dataChannel.onopen = () => {
        console.log('RTC: Data channel is open.');
        if (onDataChannelOpenCallback) {
            onDataChannelOpenCallback();
        }
    };

    dataChannel.onclose = () => {
        console.log('RTC: Data channel is closed.');
        // Potentially notify game.js if needed, though onconnectionstatechange might cover this
    };

    dataChannel.onmessage = (event) => {
        console.log('RTC: Message received from data channel:', event.data);
        try {
            const message = JSON.parse(event.data);
            if (onDataReceivedCallback) {
                onDataReceivedCallback(message);
            }
        } catch (e) {
            console.warn("RTC: Received non-JSON message or parse error:", event.data, e);
            if (onDataReceivedCallback) { // Send as raw if not JSON
                onDataReceivedCallback({ type: 'raw', payload: event.data });
            }
        }
    };

    dataChannel.onerror = (error) => {
        console.error("RTC: Data Channel Error:", error);
        showStatusOverlay(`Error en Canal de Datos: ${error.message}`);
    };
}

/**
 * For the host: Creates a data channel and an offer, then sends offer via Firebase.
 * Called by game.js after initSession.
 */
async function createOffer() {
    if (!peerConnection) {
        console.error("RTC: PeerConnection not initialized. Call initSession first.");
        showStatusOverlay("Error: Inicializar sesión RTC primero.");
        return;
    }
    if (!window.firebaseSignaling || !window.firebaseSignaling.sendOffer) {
        console.error("RTC: firebaseSignaling.sendOffer is not available.");
        showStatusOverlay("Error: Función de envío de oferta no disponible.");
        return;
    }

    try {
        console.log('RTC: Host creating data channel...');
        dataChannel = peerConnection.createDataChannel("gameDataChannel");
        setupDataChannelEventHandlers(); // Setup handlers for the created channel

        console.log('RTC: Host creating offer...');
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        console.log("RTC: Offer created, sending via Firebase signaling.");
        window.firebaseSignaling.sendOffer(offer);
    } catch (error) {
        console.error("RTC: Error creating offer:", error);
        showStatusOverlay("Error creando oferta. Ver consola.");
        if (onConnectionStateChangeCallback) onConnectionStateChangeCallback("failed");
    }
}

/**
 * For the joiner: Handles an offer received from Firebase and creates/sends an answer.
 * This is an internal function called by the Firebase signaling callback.
 * @param {RTCSessionDescriptionInit} offer - The offer object.
 */
async function _handleOfferAndCreateAnswer(offer) {
    if (!peerConnection) {
        console.error("RTC: PeerConnection not initialized for handling offer.");
        return;
    }
    if (!window.firebaseSignaling || !window.firebaseSignaling.sendAnswer) {
        console.error("RTC: firebaseSignaling.sendAnswer is not available.");
        return;
    }

    try {
        console.log("RTC: Joiner setting remote description (offer).");
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        
        console.log("RTC: Joiner creating answer...");
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        console.log("RTC: Answer created, sending via Firebase signaling.");
        window.firebaseSignaling.sendAnswer(answer);
    } catch (error) {
        console.error("RTC: Error handling offer or creating answer:", error);
        showStatusOverlay("Error manejando oferta. Ver consola.");
        if (onConnectionStateChangeCallback) onConnectionStateChangeCallback("failed");
    }
}

/**
 * For the host: Handles an answer received from Firebase.
 * This is an internal function called by the Firebase signaling callback.
 * @param {RTCSessionDescriptionInit} answer - The answer object.
 */
async function _handleAnswer(answer) {
    if (!peerConnection) {
        console.error("RTC: PeerConnection not initialized for handling answer.");
        return;
    }
    try {
        console.log("RTC: Host setting remote description (answer).");
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        console.log("RTC: Remote description (answer) set. Connection should establish if ICE candidates align.");
    } catch (error) {
        console.error("RTC: Error handling answer:", error);
        showStatusOverlay("Error manejando respuesta. Ver consola.");
    }
}

/**
 * Handles an ICE candidate received from Firebase.
 * This is an internal function called by the Firebase signaling callback.
 * @param {RTCIceCandidateInit} candidate - The ICE candidate object.
 */
async function _addIceCandidate(candidate) {
    if (!peerConnection) {
        console.error("RTC: PeerConnection not initialized. Cannot add ICE candidate.");
        return;
    }
    try {
        if (candidate) { // Ensure candidate is not null/undefined
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            console.log("RTC: ICE candidate added.");
        } else {
            console.warn("RTC: Received null/empty ICE candidate from signaling.");
        }
    } catch (error) {
        console.error("RTC: Error adding received ICE candidate:", error);
    }
}

/**
 * Sends a message (object) to the connected peer over the data channel.
 * The message will be JSON.stringified.
 * @param {object} messageObject - The JavaScript object to send.
 */
function sendMessage(messageObject) {
    if (dataChannel && dataChannel.readyState === 'open') {
        try {
            const messageString = JSON.stringify(messageObject);
            dataChannel.send(messageString);
            console.log('RTC: Message sent via data channel:', messageObject);
        } catch (e) {
            console.error("RTC: Error sending message (serialization or send error):", e, messageObject);
            showStatusOverlay("Error enviando mensaje. Ver consola.");
        }
    } else {
        console.error('RTC: Data channel is not open. Cannot send message.', dataChannel ? `State: ${dataChannel.readyState}` : 'Channel is null');
        showStatusOverlay("Error: Canal de datos no abierto para enviar.");
    }
}

/**
 * Closes the WebRTC peer connection, data channel, and Firebase signaling.
 */
function closeSession() {
    console.log("RTC: Closing session...");
    if (dataChannel) {
        try { dataChannel.close(); } catch (e) { console.warn("RTC: Error closing data channel", e); }
        dataChannel = null;
    }
    if (peerConnection) {
        try { peerConnection.close(); } catch (e) { console.warn("RTC: Error closing peer connection", e); }
        peerConnection = null;
    }
    
    if (window.firebaseSignaling && window.firebaseSignaling.cleanUp) {
        window.firebaseSignaling.cleanUp(); // Clean up Firebase presence/room
    } else {
        console.warn("RTC: firebaseSignaling.cleanUp is not available.");
    }

    if (onConnectionStateChangeCallback) {
        // Ensure the callback is invoked with a final "closed" state if not already handled
        // by onconnectionstatechange event.
        onConnectionStateChangeCallback("closed");
    }
    console.log("RTC: Session closed.");
}


// Utility functions (can be kept if game.js relies on them being here)
function showStatusOverlay(text) {
  const overlay = document.getElementById('statusOverlay');
  if (overlay) {
    overlay.textContent = text;
    overlay.style.display = 'block';
  } else {
    console.warn("RTC: statusOverlay element not found for showStatusOverlay");
  }
}

function hideStatusOverlay() {
  const overlay = document.getElementById('statusOverlay');
  if (overlay) {
    overlay.style.display = 'none';
  } else {
    console.warn("RTC: statusOverlay element not found for hideStatusOverlay");
  }
}

// --- EXPORT FUNCTIONS to be used by game.js ---
window.rtcMultiplayer = {
    initSession: initSession,
    createOffer: createOffer,   // Host calls this after initSession
    sendMessage: sendMessage,
    closeSession: closeSession
    // Offer/Answer/ICE handling is now mostly internal or via Firebase callbacks set up in initSession
};

console.log("WebRTC multiplayer script (with Firebase signaling integration) loaded.");