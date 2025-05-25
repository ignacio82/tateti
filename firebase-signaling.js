// firebase-signaling.js

// Assumes 'database' is initialized in firebase-config.js and is globally available
// or pass 'database' as an argument to these functions.

let roomRef = null;
let onOfferCallback, onAnswerCallback, onIceCandidateCallback, onPeerDisconnectCallback;
let localPlayerRole = null; // 'host' or 'joiner'

// Keep track of listeners to detach them
let offerListener, answerListener, hostIceListener, joinerIceListener, hostOnlineListener, joinerOnlineListener;

function detachFirebaseListeners() {
    if (roomRef) {
        if (offerListener) roomRef.child('offer').off('value', offerListener);
        if (answerListener) roomRef.child('answer').off('value', answerListener);
        if (hostIceListener) roomRef.child('hostIceCandidates').off('child_added', hostIceListener);
        if (joinerIceListener) roomRef.child('joinerIceCandidates').off('child_added', joinerIceListener);
        if (hostOnlineListener) roomRef.child('hostOnline').off('value', hostOnlineListener);
        if (joinerOnlineListener) roomRef.child('joinerOnline').off('value', joinerOnlineListener);
        console.log("Firebase listeners detached for room:", roomRef.key);
    }
    offerListener = answerListener = hostIceListener = joinerIceListener = hostOnlineListener = joinerOnlineListener = null;
}

function initFirebaseSignaling(roomId, playerRole, callbacks) {
    localPlayerRole = playerRole;
    onOfferCallback = callbacks.onOffer;
    onAnswerCallback = callbacks.onAnswer;
    onIceCandidateCallback = callbacks.onIceCandidate;
    onPeerDisconnectCallback = callbacks.onPeerDisconnect;

    const newRoomRef = database.ref('rooms/' + roomId);

    // If roomRef is different or null, means new room or re-init for different room
    // If same room, still good to detach and re-attach for robustness,
    // especially if playerRole changes (though not typical for same room ID).
    if (roomRef && roomRef.key !== newRoomRef.key) {
        detachFirebaseListeners(); // Detach listeners from old room
    } else if (roomRef) { // Same room, re-initializing
        detachFirebaseListeners();
    }
    roomRef = newRoomRef;


    // Set up listeners
    if (localPlayerRole === 'joiner') {
        offerListener = roomRef.child('offer').on('value', snapshot => {
            if (snapshot.exists() && onOfferCallback) {
                onOfferCallback(snapshot.val());
            }
        });
        hostIceListener = roomRef.child('hostIceCandidates').on('child_added', snapshot => {
            if (snapshot.exists() && onIceCandidateCallback) {
                onIceCandidateCallback(snapshot.val());
            }
        });
        hostOnlineListener = roomRef.child('hostOnline').on('value', snapshot => {
            // Check specifically for false, as initial null/true are just presence
            if (snapshot.exists() && snapshot.val() === false && onPeerDisconnectCallback) {
                console.log("Firebase: Host reported offline.");
                onPeerDisconnectCallback('host');
            }
        });
    } else { // Host
        answerListener = roomRef.child('answer').on('value', snapshot => {
            if (snapshot.exists() && onAnswerCallback) {
                onAnswerCallback(snapshot.val());
            }
        });
        joinerIceListener = roomRef.child('joinerIceCandidates').on('child_added', snapshot => {
            if (snapshot.exists() && onIceCandidateCallback) {
                onIceCandidateCallback(snapshot.val());
            }
        });
        joinerOnlineListener = roomRef.child('joinerOnline').on('value', snapshot => {
            if (snapshot.exists() && snapshot.val() === false && onPeerDisconnectCallback) {
                console.log("Firebase: Joiner reported offline.");
                onPeerDisconnectCallback('joiner');
                // Host might clean up the joinerOnline node if joiner explicitly disconnects
                // roomRef.child('joinerOnline').remove();
            }
        });
    }

    // Mark presence
    const presenceRef = roomRef.child(localPlayerRole === 'host' ? 'hostOnline' : 'joinerOnline');
    presenceRef.set(true);
    presenceRef.onDisconnect().set(false); // Firebase handles setting this to false on disconnect

    console.log(`Firebase signaling initialized for room ${roomId} as ${localPlayerRole}`);
}

async function sendOfferViaFirebase(offer) {
    if (!roomRef || localPlayerRole !== 'host') return;
    try {
        // Ensure previous answer is cleared before setting a new offer,
        // in case of re-negotiation or stale data.
        await roomRef.child('answer').remove();
        await roomRef.child('joinerIceCandidates').remove(); // Clear old ICE from joiner
        await roomRef.child('offer').set(offer);
        console.log("Offer sent to Firebase");
    } catch (error) {
        console.error("Error sending offer to Firebase:", error);
    }
}

async function sendAnswerViaFirebase(answer) {
    if (!roomRef || localPlayerRole !== 'joiner') return;
    try {
        await roomRef.child('answer').set(answer);
        console.log("Answer sent to Firebase");
    } catch (error) {
        console.error("Error sending answer to Firebase:", error);
    }
}

async function sendIceCandidateViaFirebase(candidate) {
    if (!roomRef) return;
    const iceCandidatesRefPath = localPlayerRole === 'host' ?
        'hostIceCandidates' :
        'joinerIceCandidates';
    try {
        await roomRef.child(iceCandidatesRefPath).push(candidate);
        console.log("ICE candidate sent to Firebase on path:", iceCandidatesRefPath);
    } catch (error)
        {
        console.error("Error sending ICE candidate to Firebase:", error);
    }
}

function cleanUpFirebaseRoom() {
    console.log("Attempting to clean up Firebase room parts by:", localPlayerRole);
    detachFirebaseListeners(); // Crucial: Detach listeners to prevent them from firing after cleanup

    if (roomRef) {
        const presenceRefPath = localPlayerRole === 'host' ? 'hostOnline' : 'joinerOnline';
        // Remove own presence node directly instead of relying only on onDisconnect,
        // as onDisconnect might not fire if browser closes abruptly or network drops before it can.
        roomRef.child(presenceRefPath).set(false) // Signal offline explicitly
            .then(() => console.log(`Set ${presenceRefPath} to false`))
            .catch(err => console.error(`Error setting ${presenceRefPath} to false:`, err));


        if (localPlayerRole === 'host') {
            // Host might decide to remove the entire room after a delay or specific condition
            // For now, just ensure presence is off. If rejoining rooms is not supported with same ID,
            // host should remove the room.
            // Example: roomRef.remove().then(...);
            console.log("Host has marked self offline. Room data might persist unless explicitly removed by host logic.");
        }
    }
    roomRef = null; // Nullify after detaching and updates.
}

window.firebaseSignaling = {
    init: initFirebaseSignaling,
    sendOffer: sendOfferViaFirebase,
    sendAnswer: sendAnswerViaFirebase,
    sendIceCandidate: sendIceCandidateViaFirebase,
    cleanUp: cleanUpFirebaseRoom
};