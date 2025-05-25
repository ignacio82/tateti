// webrtc-multiplayer.js
// Replaces sound-multiplayer.js for WebRTC based P2P communication

let peerConnection;
let dataChannel;

// Callbacks to be set by game.js
let onDataChannelOpenCallback = () => console.log("Data channel opened by default.");
let onDataReceivedCallback = (data) => console.log("Data received by default:", data);
let onConnectionStateChangeCallback = (state) => console.log("Connection state by default:", state);
let onIceCandidateCallback = (candidate) => {
    // This callback should be used to send the ICE candidate to the other peer
    // via your signaling mechanism.
    console.log("Generated ICE candidate: ", JSON.stringify(candidate));
    showStatusOverlay("New ICE candidate generated. Send to peer: " + JSON.stringify(candidate).substring(0, 50) + "...");
    // Example: signalToServer({ type: 'ice_candidate', candidate: candidate });
};


const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
    // For more robust NAT traversal, especially behind symmetric NATs,
    // you might need a TURN server.
    // {
    //   urls: 'turn:your.turn.server.com:port',
    //   username: 'user',
    //   credential: 'password'
    // }
  ]
};

/**
 * Initializes the WebRTC peer connection and sets up callbacks.
 * This should be called before creating an offer or handling an offer.
 * @param {object} callbacks - Object containing callback functions:
 * onDataChannelOpen: Called when the data channel is successfully opened.
 * onDataReceived: Called when data is received through the data channel. (Receives data object)
 * onConnectionStateChange: Called when the peer connection state changes. (Receives state string)
 * onIceCandidate: Called when a new ICE candidate is generated. (Receives candidate object)
 */
function initRTCSession(callbacks) {
    if (peerConnection) {
        console.warn("RTC session already initialized. Closing previous one.");
        closeRTCSession();
    }

    onDataChannelOpenCallback = callbacks.onDataChannelOpen || onDataChannelOpenCallback;
    onDataReceivedCallback = callbacks.onDataReceived || onDataReceivedCallback;
    onConnectionStateChangeCallback = callbacks.onConnectionStateChange || onConnectionStateChangeCallback;
    if (callbacks.onIceCandidate) onIceCandidateCallback = callbacks.onIceCandidate;


    try {
        peerConnection = new RTCPeerConnection(rtcConfig);
    } catch (error) {
        console.error("Failed to create RTCPeerConnection:", error);
        showStatusOverlay("Error: Could not create Peer Connection. WebRTC might not be supported or is blocked.");
        if (onConnectionStateChangeCallback) onConnectionStateChangeCallback("failed");
        return;
    }


    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            onIceCandidateCallback(event.candidate);
        }
    };

    peerConnection.onconnectionstatechange = () => {
        if (onConnectionStateChangeCallback) {
            onConnectionStateChangeCallback(peerConnection.connectionState);
        }
        switch (peerConnection.connectionState) {
            case "connected":
                console.log("Peers connected!");
                // Data channel should be open or about to open if it's the receiving side.
                // If this side initiated, data channel might already be configured.
                hideStatusOverlay();
                break;
            case "disconnected":
            case "failed":
            case "closed":
                console.log("Peer connection state: " + peerConnection.connectionState);
                showStatusOverlay("Connection " + peerConnection.connectionState);
                closeRTCSession(); // Clean up
                break;
        }
    };

    // This handler is for the peer who *receives* the data channel
    peerConnection.ondatachannel = (event) => {
        console.log('Data channel received.');
        dataChannel = event.channel;
        setupDataChannelEventHandlers();
        // The onDataChannelOpenCallback is typically called from setupDataChannelEventHandlers
        // once the channel's 'open' event fires.
    };
    console.log("RTC Session Initialized");
}

function setupDataChannelEventHandlers() {
    if (!dataChannel) {
        console.error("Data channel is not initialized.");
        return;
    }
    dataChannel.onopen = () => {
        console.log('Data channel is open and ready to use.');
        if (onDataChannelOpenCallback) {
            onDataChannelOpenCallback();
        }
        hideStatusOverlay();
    };

    dataChannel.onclose = () => {
        console.log('Data channel is closed.');
        // Potentially notify game.js to update UI or state
        showStatusOverlay("Data channel closed.");
    };

    dataChannel.onmessage = (event) => {
        console.log('Message received:', event.data);
        try {
            const message = JSON.parse(event.data);
            if (onDataReceivedCallback) {
                onDataReceivedCallback(message);
            }
        } catch (e) {
            console.error("Failed to parse received message:", e);
            if (onDataReceivedCallback) { // Send as raw if not JSON
                onDataReceivedCallback({ type: 'raw', payload: event.data });
            }
        }
    };

    dataChannel.onerror = (error) => {
        console.error("Data Channel Error:", error);
        showStatusOverlay(`Data Channel Error: ${error.message}`);
    };
}

/**
 * For the host: Creates a data channel and an offer.
 * The offer needs to be sent to the joining peer via a signaling mechanism.
 */
async function createOfferAndSend() {
    if (!peerConnection) {
        console.error("PeerConnection not initialized. Call initRTCSession first.");
        showStatusOverlay("Error: Initialize RTC session first!");
        return;
    }

    try {
        // Host creates the data channel
        dataChannel = peerConnection.createDataChannel("gameDataChannel");
        console.log('Data channel created by host.');
        setupDataChannelEventHandlers(); // Setup handlers for the created channel

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        console.log("Offer created: ", JSON.stringify(offer));
        showStatusOverlay("Offer created. Send to peer: " + JSON.stringify(offer).substring(0,50) + "...");
        // Send this 'offer' to the other peer via your signaling mechanism
        // Example: signalToServer({ type: 'offer', sdp: offer.sdp });
        // For manual signaling, the host would copy this offer and send it to the joiner.
        // The onIceCandidateCallback will be triggered as ICE candidates are gathered.
        // These also need to be sent to the other peer.
        return offer; // Return for manual sending or integration with signaling
    } catch (error) {
        console.error("Error creating offer:", error);
        showStatusOverlay("Error creating offer. See console.");
        if (onConnectionStateChangeCallback) onConnectionStateChangeCallback("failed");
    }
}

/**
 * For the joiner: Handles an offer from the host and creates an answer.
 * The answer needs to be sent back to the host via a signaling mechanism.
 * @param {RTCSessionDescriptionInit} offer - The offer object received from the host.
 */
async function handleOfferAndCreateAnswer(offer) {
    if (!peerConnection) {
        console.error("PeerConnection not initialized. Call initRTCSession first.");
        showStatusOverlay("Error: Initialize RTC session first!");
        return;
    }
    if (!offer || !offer.sdp || !offer.type) {
        console.error("Invalid offer received:", offer);
        showStatusOverlay("Error: Invalid offer received.");
        return;
    }

    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        console.log("Remote description (offer) set.");

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        console.log("Answer created: ", JSON.stringify(answer));
        showStatusOverlay("Answer created. Send to host: " + JSON.stringify(answer).substring(0,50) + "...");
        // Send this 'answer' to the other peer via your signaling mechanism
        // Example: signalToServer({ type: 'answer', sdp: answer.sdp });
        // The onIceCandidateCallback will be triggered as ICE candidates are gathered.
        return answer; // Return for manual sending or integration with signaling
    } catch (error) {
        console.error("Error handling offer or creating answer:", error);
        showStatusOverlay("Error handling offer. See console.");
        if (onConnectionStateChangeCallback) onConnectionStateChangeCallback("failed");
    }
}

/**
 * For the host: Handles an answer from the joining peer.
 * @param {RTCSessionDescriptionInit} answer - The answer object received from the joiner.
 */
async function handleAnswer(answer) {
    if (!peerConnection) {
        console.error("PeerConnection not initialized.");
        showStatusOverlay("Error: Peer connection not ready for answer.");
        return;
    }
     if (!answer || !answer.sdp || !answer.type) {
        console.error("Invalid answer received:", answer);
        showStatusOverlay("Error: Invalid answer received.");
        return;
    }

    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        console.log("Remote description (answer) set. Connection should establish.");
        // Connection should now establish if all ICE candidates are exchanged.
    } catch (error) {
        console.error("Error handling answer:", error);
        showStatusOverlay("Error handling answer. See console.");
    }
}

/**
 * Handles an ICE candidate received from the other peer via the signaling mechanism.
 * @param {RTCIceCandidateInit} candidate - The ICE candidate object.
 */
async function addIceCandidate(candidate) {
    if (!peerConnection) {
        console.error("PeerConnection not initialized. Cannot add ICE candidate.");
        showStatusOverlay("Error: Peer connection not ready for ICE candidate.");
        return;
    }
    if (!candidate || (!candidate.candidate && !candidate.sdpMid)) { // candidate can be an empty string for end-of-candidates
         console.warn("Received potentially invalid or empty ICE candidate:", candidate);
    }

    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        console.log("ICE candidate added.");
    } catch (error) {
        console.error("Error adding received ICE candidate:", error);
        // This error can sometimes be ignored if it's due to candidates arriving out of order
        // or after the connection is already established.
    }
}

/**
 * Sends a message (object) to the connected peer over the data channel.
 * The message will be JSON.stringified.
 * @param {object} messageObject - The JavaScript object to send.
 */
function sendRTCMessage(messageObject) {
    if (dataChannel && dataChannel.readyState === 'open') {
        try {
            const messageString = JSON.stringify(messageObject);
            dataChannel.send(messageString);
            console.log('Message sent:', messageObject);
        } catch (e) {
            console.error("Error sending message (serialization or send error):", e, messageObject);
            showStatusOverlay("Error sending message. See console.");
        }
    } else {
        console.error('Data channel is not open. Cannot send message.', dataChannel ? dataChannel.readyState : 'null');
        showStatusOverlay("Error: Data channel not open for sending.");
    }
}

/**
 * Closes the WebRTC peer connection and data channel.
 */
function closeRTCSession() {
    if (dataChannel) {
        dataChannel.close();
        dataChannel = null;
        console.log("Data channel closed.");
    }
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
        console.log("PeerConnection closed.");
    }
    if (onConnectionStateChangeCallback) onConnectionStateChangeCallback("closed");
    // hideStatusOverlay(); // Or set a "Disconnected" message
    console.log("RTC Session closed.");
}


// Functions for showStatusOverlay and hideStatusOverlay
// (Copied from your original sound-multiplayer.js for convenience)
function showStatusOverlay(text) {
  const overlay = document.getElementById('statusOverlay');
  if (overlay) {
    overlay.textContent = text;
    overlay.style.display = 'block';
  } else {
    console.warn("statusOverlay element not found for showStatusOverlay");
  }
}

function hideStatusOverlay() {
  const overlay = document.getElementById('statusOverlay');
  if (overlay) {
    overlay.style.display = 'none';
  } else {
    console.warn("statusOverlay element not found for hideStatusOverlay");
  }
}

// --- EXPORT FUNCTIONS to be used by game.js ---
// These would replace the sound-based functions.
// Example:
// window.rtc = {
//   init: initRTCSession,
//   createOffer: createOfferAndSend,
//   handleOfferAndCreateAnswer: handleOfferAndCreateAnswer,
//   handleAnswer: handleAnswer,
//   addIceCandidate: addIceCandidate,
//   sendMessage: sendRTCMessage,
//   close: closeRTCSession,
//   showOverlay: showStatusOverlay, // Keep utility functions if needed
//   hideOverlay: hideStatusOverlay  // Keep utility functions if needed
// };

// For direct use in <script> tag, similar to your previous file:
window.initRTCSession = initRTCSession;
window.createOfferForHost = createOfferAndSend; // Renamed for clarity
window.createAnswerForJoiner = handleOfferAndCreateAnswer; // Renamed for clarity
window.acceptAnswerFromHost = handleAnswer; // Renamed for clarity (host accepts answer)
window.addICECandidateToPeer = addIceCandidate; // Renamed for clarity
window.sendRTCMessage = sendRTCMessage;
window.closeRTCSession = closeRTCSession;
window.showStatusOverlay = showStatusOverlay;
window.hideStatusOverlay = hideStatusOverlay;

// --- Functions to map to your game.js usage ---
// You'll need to adapt game.js to use these.
// The old 'pairing' can be mapped to offer/answer exchange.
// Moves are sent via sendRTCMessage.
// Listening for moves is handled by the onDataReceivedCallback.

// Example mapping:
// sendPairingRequest -> Host calls createOfferForHost() and shares the offer.
// sendPairingAccept  -> Joiner calls createAnswerForJoiner(offer) and shares the answer.
// sendHostAck        -> Host calls acceptAnswerFromHost(answer). (ICE candidates also exchanged)
                        // The actual connection and data channel opening serves as the "ACK".

// startListeningForSounds(type, callback) -> Covered by onDataReceivedCallback which game.js sets up during initRTCSession.
//                                             The 'type' of message would be part of the JSON object sent.
//                                             e.g., { type: 'move', index: 5 }
//                                             or { type: 'pairing_complete' }

// stopListening -> Not directly needed. Call closeRTCSession() to end communication.

// sendMoveViaSound(index) -> sendRTCMessage({ type: 'move', payload: { index: index } });


console.log("WebRTC multiplayer script loaded.");
