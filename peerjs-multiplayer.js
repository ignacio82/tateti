// peerjs-multiplayer.js
console.log("DEBUG: peerjs-multiplayer.js script execution started."); // <-- NEW DEBUG LOG AT THE VERY TOP

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
        // Ensure PeerJS library is loaded
        if (typeof Peer === 'undefined') {
            console.error("PeerJS: Peer library (Peer constructor) is not loaded!");
            if (onErrorCallback) onErrorCallback({type: 'init_failed', message: 'PeerJS library not loaded.', originalError: new Error('Peer is not defined')});
            return;
        }

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
        if (currentConnection && currentConnection.open) { 
            console.warn(`PeerJS: Already connected to ${currentConnection.peer}. Rejecting new connection from ${conn.peer}.`);
            // Ensure conn is open before trying to close, though it might not be necessary
            // if we are just rejecting it.
            if (conn.open) {
                conn.close();
            } else {
                // If not open, PeerJS might handle its cleanup if 'open' is never fired.
                // Or listen for its 'open' to close, or 'error'.
                conn.on('open', () => conn.close()); // Close it if it ever opens
            }
            return;
        }
        currentConnection = conn;
        if (onNewConnectionCallback) {
            onNewConnectionCallback(conn); 
        }
        setupConnectionEventHandlers(currentConnection);
    });

    peer.on('disconnected', () => {
        console.log('PeerJS: Disconnected from PeerServer. Attempting to reconnect...');
        if (onErrorCallback) onErrorCallback({type: 'disconnected', message: 'Disconnected from PeerServer.'});
    });

    peer.on('close', () => {
        console.log('PeerJS: Peer object closed (destroyed).');
        localPeerId = null;
    });

    peer.on('error', (err) => {
        console.error('PeerJS: Error:', err);
        if (onErrorCallback) {
            onErrorCallback(err); 
        }
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
            currentConnection = null; 
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
    if (!peer || peer.destroyed) { 
        console.error("PeerJS: Peer object not initialized or destroyed. Call initPeerSession first.");
        if (onErrorCallback) onErrorCallback({type: 'not_initialized', message: 'PeerJS not initialized or destroyed.'});
        return;
    }
    if (currentConnection && currentConnection.open) {
        console.warn(`PeerJS: Already connected to ${currentConnection.peer}. Please close it first if you want to connect to another peer.`);
        return;
    }
    if (currentConnection) { 
        console.warn(`PeerJS: Already attempting to connect to ${currentConnection.peer || 'a peer'}. Please wait or close the current attempt.`);
        return;
    }

    console.log(`PeerJS: Attempting to connect to host with ID: ${hostPeerId}`);
    try {
        currentConnection = peer.connect(hostPeerId, {
            reliable: true 
        });
        if (!currentConnection) {
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
            if (currentConnection.open) { 
                currentConnection.close();
                console.log("PeerJS: Current data connection closed.");
            } else {
                console.log("PeerJS: Current data connection was not open, no need to close explicitly here.");
            }
        } catch (e) {
            console.warn("PeerJS: Error closing data connection", e);
        }
        currentConnection = null;
    }
    if (peer) {
        try {
            if (!peer.destroyed) {
                peer.destroy(); 
                console.log("PeerJS: Peer object destroyed.");
            } else {
                console.log("PeerJS: Peer object was already destroyed.");
            }
        } catch (e) {
            console.warn("PeerJS: Error destroying peer object", e);
        }
        peer = null;
    }
    localPeerId = null;
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

console.log("Assigned window.peerJsMultiplayer:", typeof window.peerJsMultiplayer, window.peerJsMultiplayer);
console.log("PeerJS multiplayer script loaded."); // This log was present in older logs
