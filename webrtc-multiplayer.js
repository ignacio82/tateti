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
        console.warn("RTC: Session already initialized. Closing previous one to prevent issues.");
        closeSession(); // Ensure clean state before re-initializing
    }

    console.log(`RTC: Initializing session for room ${roomId} as ${isHost ? 'Host' : 'Joiner'}`);

    onDataChannelOpenCallback = externalCallbacks.onDataChannelOpen || onDataChannelOpenCallback;
    onDataReceivedCallback = externalCallbacks.onDataReceived || onDataReceivedCallback;
    onConnectionStateChangeCallback = externalCallbacks.onConnectionStateChange || onConnectionStateChangeCallback;

    try {
        peerConnection = new RTCPeerConnection(rtcConfig);
        console.log("RTC: RTCPeerConnection created. Initial signalingState:", peerConnection.signalingState);
    } catch (error) {
        console.error("RTC: Failed to create RTCPeerConnection:", error);
        if (onConnectionStateChangeCallback) onConnectionStateChangeCallback("failed");
        showStatusOverlay("Error: No se pudo crear Peer Connection.");
        return;
    }

    // Event handler for ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log("RTC: Generated ICE candidate:", event.candidate);
            if (window.firebaseSignaling && window.firebaseSignaling.sendIceCandidate) {
                window.firebaseSignaling.sendIceCandidate(event.candidate);
            } else {
                console.error("RTC: firebaseSignaling.sendIceCandidate is not available.");
            }
        } else {
            console.log("RTC: All ICE candidates have been sent.");
        }
    };

    // Event handler for connection state changes
    peerConnection.onconnectionstatechange = () => {
        console.log("RTC: Connection state changed to:", peerConnection.connectionState);
        if (onConnectionStateChangeCallback) {
            onConnectionStateChangeCallback(peerConnection.connectionState);
        }
        // Further handling (e.g., UI updates) can be done in game.js based on the state
        if (peerConnection && (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'closed')) {
            // Consider closing the session more formally if not already triggered by game.js
            // closeSession(); // This might be too aggressive here if game.js handles it.
        }
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
                    console.log("RTC: Offer received from Firebase signaling, passing to _handleOfferAndCreateAnswer.");
                    await _handleOfferAndCreateAnswer(offer);
                }
            },
            onAnswer: async (answer) => { // Host receives answer
                if (isHost) {
                    console.log("RTC: Answer received from Firebase signaling, passing to _handleAnswer.");
                    await _handleAnswer(answer);
                }
            },
            onIceCandidate: async (candidate) => {
                console.log("RTC: ICE candidate received from Firebase signaling, passing to _addIceCandidate.");
                await _addIceCandidate(candidate);
            },
            onPeerDisconnect: (role) => {
                console.log(`RTC: Peer (${role}) disconnected signal from Firebase.`);
                showStatusOverlay("El otro jugador se desconectó.");
                if (onConnectionStateChangeCallback) onConnectionStateChangeCallback("disconnected");
                // game.js should handle game state reset and potentially call closeSession()
            }
        });
    } else {
        console.error("RTC: firebaseSignaling.init is not available. Ensure firebase-signaling.js is loaded and initialized before webrtc-multiplayer.js.");
        showStatusOverlay("Error: Falló la inicialización de la señalización.");
        return;
    }
    console.log("RTC: Session initialized, Firebase signaling listeners active.");
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
            if (onDataReceivedCallback) {
                onDataReceivedCallback({ type: 'raw', payload: event.data });
            }
        }
    };

    dataChannel.onerror = (error) => {
        console.error("RTC: Data Channel Error:", error);
        showStatusOverlay(`Error en Canal de Datos: ${error.message || 'Error desconocido'}`);
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
    if (peerConnection.signalingState !== 'stable' && peerConnection.signalingState !== 'new') {
         console.warn(`RTC (Host): createOffer called in unexpected state: ${peerConnection.signalingState}. Proceeding cautiously.`);
         // This might indicate a previous offer attempt didn't clean up or a re-negotiation scenario not fully handled.
    }

    if (!window.firebaseSignaling || !window.firebaseSignaling.sendOffer) {
        console.error("RTC: firebaseSignaling.sendOffer is not available.");
        showStatusOverlay("Error: Función de envío de oferta no disponible.");
        return;
    }

    try {
        console.log('RTC: Host creating data channel...');
        dataChannel = peerConnection.createDataChannel("gameDataChannel");
        setupDataChannelEventHandlers();

        console.log('RTC: Host creating offer...');
        const offer = await peerConnection.createOffer();
        
        console.log(`RTC (Host): Offer created. Current signalingState before setLocalDescription(offer): ${peerConnection.signalingState}`);
        await peerConnection.setLocalDescription(offer);
        console.log(`RTC (Host): Local description (offer) set. New signalingState: ${peerConnection.signalingState}`); // Should be 'have-local-offer'
        
        console.log("RTC: Sending offer via Firebase signaling.");
        window.firebaseSignaling.sendOffer(offer);
    } catch (error) {
        console.error("RTC: Error creating offer or setting local description:", error);
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
        console.error("RTC (Joiner): PeerConnection not initialized for handling offer.");
        return;
    }
    if (!window.firebaseSignaling || !window.firebaseSignaling.sendAnswer) {
        console.error("RTC (Joiner): firebaseSignaling.sendAnswer is not available.");
        return;
    }
    if (!offer || !offer.type || !offer.sdp || offer.type.toLowerCase() !== 'offer') {
        console.error("RTC (Joiner): Received invalid or malformed offer object:", offer);
        return;
    }

    console.log(`RTC (Joiner): Received offer. Current signalingState before setRemoteDescription(offer): ${peerConnection.signalingState}`);

    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        console.log(`RTC (Joiner): Remote description (offer) set. New signalingState: ${peerConnection.signalingState}`); // Should be 'have-remote-offer'
        
        console.log("RTC (Joiner): Creating answer...");
        const answer = await peerConnection.createAnswer();
        
        console.log(`RTC (Joiner): Answer created. Current signalingState before setLocalDescription(answer): ${peerConnection.signalingState}`);
        await peerConnection.setLocalDescription(answer);
        console.log(`RTC (Joiner): Local description (answer) set. New signalingState: ${peerConnection.signalingState}`); // Should be 'stable' (if polite peer) or unchanged if rollback
        
        console.log("RTC (Joiner): Sending answer via Firebase signaling.");
        window.firebaseSignaling.sendAnswer(answer);
    } catch (error) {
        console.error("RTC (Joiner): Error handling offer or creating/setting answer:", error);
        showStatusOverlay("Error procesando oferta o creando respuesta. Ver consola.");
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
        console.error("RTC (Host): PeerConnection not initialized or already closed when trying to handle answer.");
        return;
    }

    console.log(`RTC (Host): Received answer object. Current peerConnection.signalingState: ${peerConnection.signalingState}`);

    if (peerConnection.signalingState !== 'have-local-offer' && peerConnection.signalingState !== 'have-remote-pranswer') {
        console.error(`RTC (Host): Cannot set remote answer in current signalingState: '${peerConnection.signalingState}'. Expected 'have-local-offer'. Answer processing aborted.`);
        // This indicates a logic flaw elsewhere if this condition is met.
        return;
    }

    if (!answer || !answer.type || !answer.sdp || answer.type.toLowerCase() !== 'answer') {
        console.error("RTC (Host): Received invalid or malformed answer object:", answer);
        return;
    }
    
    try {
        console.log("RTC (Host): Attempting to set remote description with received answer.");
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        console.log("RTC (Host): Remote description (answer) successfully set. New signalingState:", peerConnection.signalingState); // Should be 'stable'
    } catch (error) {
        console.error("RTC (Host): Error setting remote description with answer:", error);
        showStatusOverlay("Error procesando respuesta del par. Ver consola.");
        if (onConnectionStateChangeCallback) onConnectionStateChangeCallback("failed");
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
        if (candidate && candidate.candidate) { // Check candidate string itself
            // Only add candidate if remote description is set (or if it's the offerer, after local description)
            // A common practice is to queue candidates if remote description isn't set yet,
            // but addIceCandidate() can often handle this if called before setRemoteDescription.
            // However, adding a check for signalingState can prevent errors.
            if (peerConnection.remoteDescription || (peerConnection.localDescription && peerConnection.localDescription.type === 'offer')) {
                 console.log("RTC: Adding received ICE candidate:", candidate);
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } else {
                console.warn("RTC: Remote description not yet set, queuing or deferring ICE candidate (or check logic):", candidate);
                // Simple approach: try adding anyway, modern browsers might queue.
                // More robust: explicitly queue and add later. For now, let's try adding.
                 await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            }
        } else {
            console.log("RTC: Received empty or end-of-candidates signal from Firebase.");
        }
    } catch (error) {
        console.error("RTC: Error adding received ICE candidate:", error);
        // Errors here can sometimes be ignored if candidates arrive out of order or for a closed connection.
    }
}

/**
 * Sends a message (object) to the connected peer over the data channel.
 */
function sendMessage(messageObject) {
    if (dataChannel && dataChannel.readyState === 'open') {
        try {
            const messageString = JSON.stringify(messageObject);
            dataChannel.send(messageString);
            // console.log('RTC: Message sent via data channel:', messageObject); // Can be too verbose
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
        try { 
            // Log state before closing for diagnostics
            console.log("RTC: PeerConnection state before close:", peerConnection.signalingState, peerConnection.iceConnectionState, peerConnection.connectionState);
            peerConnection.close(); 
        } catch (e) { console.warn("RTC: Error closing peer connection", e); }
        peerConnection = null;
    }
    
    if (window.firebaseSignaling && window.firebaseSignaling.cleanUp) {
        window.firebaseSignaling.cleanUp();
    } else {
        console.warn("RTC: firebaseSignaling.cleanUp is not available.");
    }

    // It's important that onConnectionStateChangeCallback is robust enough
    // to be called with "closed" if the peerConnection was already closed.
    // The onconnectionstatechange handler should naturally fire a 'closed' event.
    // if (onConnectionStateChangeCallback) {
    //     onConnectionStateChangeCallback("closed"); // Can cause duplicate calls if already handled
    // }
    console.log("RTC: Session resources released.");
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
};

console.log("WebRTC multiplayer script (with Firebase signaling and improved state handling) loaded.");