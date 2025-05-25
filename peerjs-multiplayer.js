// peerjs-multiplayer.js

let peer = null; // PeerJS object
let currentConnection = null; // PeerJS DataConnection object
let localPeerId = null;

// Callbacks to be set by game.js
let onPeerOpenCallback = (id) => console.log('PeerJS: Default - My peer ID is:', id);
let onConnectionOpenCallback = () => console.log('PeerJS: Default - Connection opened!');
let onDataReceivedCallback = (data) => console.log('PeerJS: Default - Data received:', data);
let onConnectionCloseCallback = () => console.log('PeerJS: Default - Connection closed.');
let onErrorCallback = (err) => console.error('PeerJS: Default - Error:', err);
let onNewConnectionCallback = (conn) => console.log('PeerJS: Default - New incoming connection', conn);


/**
 * Initializes the PeerJS object.
 * For the Host: It will get an ID from the PeerServer.
 * For the Joiner: It can also get an ID, though it primarily uses it to connect to the Host.
 * @param {string|null} preferredId - Optional: If host wants to attempt a specific ID (not always guaranteed).
 * @param {object} callbacks - Object containing callback functions:
 * onPeerOpen: (id) => Called when this peer is assigned an ID by the PeerServer.
 * onConnectionOpen: () => Called when a data connection to another peer is established and open.
 * onDataReceived: (data) => Called when data is received from the connected peer.
 * onConnectionClose: () => Called when the data connection is closed.
 * onError: (err) => Called when a PeerJS error occurs.
 * onNewConnection: (conn) => (Host specific) Called when a new peer connects to this host.
 */
function initPeerSession(preferredId = null, callbacks = {}) {
    if (peer) {
        console.warn("PeerJS: Peer object already exists. Closing existing session before creating a new one.");
        closePeerSession();
    }

    // Assign callbacks
    onPeerOpenCallback = callbacks.onPeerOpen || onPeerOpenCallback;
    onConnectionOpenCallback = callbacks.onConnectionOpen || onConnectionOpenCallback;
    onDataReceivedCallback = callbacks.onDataReceived || onDataReceivedCallback;
    onConnectionCloseCallback = callbacks.onConnectionClose || onConnectionCloseCallback;
    onErrorCallback = callbacks.onError || onErrorCallback;
    onNewConnectionCallback = callbacks.onNewConnection || onNewConnectionCallback;

    try {
        if (preferredId) {
            peer = new Peer(preferredId); // Attempt to use a preferred ID
        } else {
            peer = new Peer(); // Let PeerServer assign an ID
        }
    } catch (error) {
        console.error("PeerJS: Failed to create Peer object.", error);
        if (onErrorCallback) onErrorCallback({type: 'init_failed', message: 'Failed to create Peer object.', originalError: error});
        return;
    }


    peer.on('open', (id) => {
        localPeerId = id;
        console.log('PeerJS: My peer ID is:', id);
        if (onPeerOpenCallback) {
            onPeerOpenCallback(id);
        }
    });

    // Host: Listen for incoming connections
    peer.on('connection', (conn) => {
        console.log('PeerJS: Incoming connection from', conn.peer);
        if (currentConnection) {
            console.warn(`PeerJS: Already connected to ${currentConnection.peer}. Rejecting new connection from ${conn.peer}.`);
            conn.close(); // Or handle multiple connections if your game supports it
            return;
        }
        currentConnection = conn;
        if (onNewConnectionCallback) {
            onNewConnectionCallback(conn); // Let game.js know, it might show "Player X wants to connect"
        }
        setupConnectionEventHandlers(currentConnection);
    });

    peer.on('disconnected', () => {
        console.log('PeerJS: Disconnected from PeerServer. Attempting to reconnect...');
        // PeerJS will attempt to reconnect automatically.
        // You might want to inform the user.
        if (onErrorCallback) onErrorCallback({type: 'disconnected', message: 'Disconnected from PeerServer.'});
        // Do not call closePeerSession() here as it will destroy the peer object preventing reconnection.
    });

    peer.on('close', () => {
        // This is called when the peer is destroyed (e.g., by peer.destroy())
        console.log('PeerJS: Peer object closed (destroyed).');
        localPeerId = null;
        // onConnectionCloseCallback might be more relevant for data connection closures.
    });

    peer.on('error', (err) => {
        console.error('PeerJS: Error:', err);
        if (onErrorCallback) {
            onErrorCallback(err); // Pass the full error object
        }
        // Common error types: 'network', 'peer-unavailable', 'server-error', 'socket-error', 'webrtc'
        // If 'peer-unavailable', it means the ID you tried to connect to doesn't exist or is not connected to the PeerServer.
    });
}

/**
 * Sets up event handlers for a new PeerJS DataConnection.
 * @param {Peer.DataConnection} conn - The DataConnection object.
 */
function setupConnectionEventHandlers(conn) {
    conn.on('open', () => {
        console.log(`PeerJS: Data connection opened with ${conn.peer}. Ready to send/receive data.`);
        if (onConnectionOpenCallback) {
            onConnectionOpenCallback();
        }
    });

    conn.on('data', (data) => {
        console.log(`PeerJS: Data received from ${conn.peer}:`, data);
        if (onDataReceivedCallback) {
            onDataReceivedCallback(data);
        }
    });

    conn.on('close', () => {
        console.log(`PeerJS: Data connection with ${conn.peer} closed.`);
        if (onConnectionCloseCallback) {
            onConnectionCloseCallback();
        }
        if (currentConnection && currentConnection.peer === conn.peer) {
            currentConnection = null; // Clear current connection
        }
    });

    conn.on('error', (err) => {
        console.error(`PeerJS: Data connection error with ${conn.peer}:`, err);
        if (onErrorCallback) {
            onErrorCallback({type: 'connection_error', peer: conn.peer, originalError: err});
        }
    });
}

/**
 * For Joiner: Connects to a host peer by their ID.
 * @param {string} hostPeerId - The ID of the host peer to connect to.
 */
function connectToPeer(hostPeerId) {
    if (!peer) {
        console.error("PeerJS: Peer object not initialized. Call initPeerSession first.");
        if (onErrorCallback) onErrorCallback({type: 'not_initialized', message: 'PeerJS not initialized.'});
        return;
    }
    if (currentConnection) {
        console.warn(`PeerJS: Already attempting or connected. Current connection with ${currentConnection.peer}. Please close it first if you want to connect to another peer.`);
        return;
    }

    console.log(`PeerJS: Attempting to connect to host with ID: ${hostPeerId}`);
    try {
        currentConnection = peer.connect(hostPeerId, {
            reliable: true // Use reliable data channel (SCTP)
        });
        if (!currentConnection) {
            // This should ideally not happen if peer.connect itself doesn't throw
            console.error("PeerJS: peer.connect() returned null or undefined.");
            if (onErrorCallback) onErrorCallback({type: 'connect_failed', message: 'peer.connect() failed to return a connection object.', peerId: hostPeerId });
            return;
        }
        setupConnectionEventHandlers(currentConnection);
    } catch (error) {
        console.error("PeerJS: Error when trying to call peer.connect():", error);
        if (onErrorCallback) onErrorCallback({type: 'connect_exception', message: 'Exception during peer.connect().', peerId: hostPeerId, originalError: error });
    }
}

/**
 * Sends data to the currently connected peer.
 * @param {any} data - The data to send (can be any JSON-serializable type).
 */
function sendData(data) {
    if (currentConnection && currentConnection.open) {
        try {
            currentConnection.send(data);
            // console.log("PeerJS: Data sent:", data); // Can be too verbose
        } catch (error) {
            console.error("PeerJS: Error sending data:", error);
            if (onErrorCallback) onErrorCallback({type: 'send_error', message: 'Failed to send data.', originalError: error});
        }
    } else {
        console.warn("PeerJS: No open connection or connection not ready. Cannot send data.");
        if (onErrorCallback && (!currentConnection || !currentConnection.open) ) {
             onErrorCallback({type: 'send_error_no_connection', message: 'No open connection to send data.'});
        }
    }
}

/**
 * Closes the current data connection and/or destroys the Peer object.
 */
function closePeerSession() {
    console.log("PeerJS: Closing peer session...");
    if (currentConnection) {
        try {
            currentConnection.close();
            console.log("PeerJS: Current data connection closed.");
        } catch (e) {
            console.warn("PeerJS: Error closing data connection", e);
        }
        currentConnection = null;
    }
    if (peer) {
        try {
            if (!peer.destroyed) {
                peer.destroy(); // Destroys the peer, releasing its ID and closing connections.
                console.log("PeerJS: Peer object destroyed.");
            }
        } catch (e) {
            console.warn("PeerJS: Error destroying peer object", e);
        }
        peer = null;
    }
    localPeerId = null;
    // Callbacks for closure are typically handled by the event listeners ('close' on connection or peer)
}

/**
 * Gets the local peer's ID.
 * @returns {string|null} The local peer ID, or null if not yet assigned.
 */
function getLocalPeerId() {
    return localPeerId;
}


// Expose functions to game.js
window.peerJsMultiplayer = {
    init: initPeerSession,
    connect: connectToPeer,
    send: sendData,
    close: closePeerSession,
    getLocalId: getLocalPeerId
};

console.log("PeerJS multiplayer script loaded.");