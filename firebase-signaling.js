// firebase-signaling.js

// Assumes 'database' is initialized in firebase-config.js and is globally available
// or pass 'database' as an argument to these functions.

let roomRef = null;
let onOfferCallback, onAnswerCallback, onIceCandidateCallback, onPeerDisconnectCallback;
let localPlayerRole = null; // 'host' or 'joiner'

function initFirebaseSignaling(roomId, playerRole, callbacks) {
    localPlayerRole = playerRole;
    onOfferCallback = callbacks.onOffer;
    onAnswerCallback = callbacks.onAnswer;
    onIceCandidateCallback = callbacks.onIceCandidate;
    onPeerDisconnectCallback = callbacks.onPeerDisconnect;

    roomRef = database.ref('rooms/' + roomId);

    // Set up listeners
    if (localPlayerRole === 'joiner') {
        // Joiner listens for offer from host
        roomRef.child('offer').on('value', snapshot => {
            if (snapshot.exists() && onOfferCallback) {
                onOfferCallback(snapshot.val());
            }
        });
        // Joiner listens for ICE candidates from host
        roomRef.child('hostIceCandidates').on('child_added', snapshot => {
            if (snapshot.exists() && onIceCandidateCallback) {
                onIceCandidateCallback(snapshot.val());
            }
        });
        // Joiner listens for host disconnect
        roomRef.child('hostOnline').on('value', snapshot => {
            if (snapshot.exists() && snapshot.val() === false && onPeerDisconnectCallback) {
                onPeerDisconnectCallback('host');
            }
        });
    } else { // Host
        // Host listens for answer from joiner
        roomRef.child('answer').on('value', snapshot => {
            if (snapshot.exists() && onAnswerCallback) {
                onAnswerCallback(snapshot.val());
            }
        });
        // Host listens for ICE candidates from joiner
        roomRef.child('joinerIceCandidates').on('child_added', snapshot => {
            if (snapshot.exists() && onIceCandidateCallback) {
                onIceCandidateCallback(snapshot.val());
            }
        });
        // Host listens for joiner disconnect
        roomRef.child('joinerOnline').on('value', snapshot => {
            if (snapshot.exists() && snapshot.val() === false && onPeerDisconnectCallback) {
                onPeerDisconnectCallback('joiner');
                roomRef.child('joinerOnline').remove(); // Clean up
            }
        });
    }

    // Mark presence
    const presenceRef = roomRef.child(localPlayerRole === 'host' ? 'hostOnline' : 'joinerOnline');
    presenceRef.set(true);
    presenceRef.onDisconnect().set(false); // Or remove() if you prefer

    console.log(`Firebase signaling initialized for room ${roomId} as ${localPlayerRole}`);
}

async function sendOfferViaFirebase(offer) {
    if (!roomRef || localPlayerRole !== 'host') return;
    try {
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
    const iceCandidatesRef = localPlayerRole === 'host' ?
        roomRef.child('hostIceCandidates') :
        roomRef.child('joinerIceCandidates');
    try {
        await iceCandidatesRef.push(candidate); // push() creates a unique ID for each candidate
        console.log("ICE candidate sent to Firebase");
    } catch (error) {
        console.error("Error sending ICE candidate to Firebase:", error);
    }
}

function cleanUpFirebaseRoom() {
    if (roomRef && localPlayerRole === 'host') { // Only host cleans up the entire room
        console.log("Host cleaning up Firebase room:", roomRef.key);
        roomRef.remove()
            .then(() => console.log("Firebase room removed."))
            .catch(err => console.error("Error removing Firebase room:", err));
    } else if (roomRef) { // Joiner just removes their presence
        roomRef.child('joinerOnline').remove();
    }
    roomRef = null;
}

window.firebaseSignaling = {
    init: initFirebaseSignaling,
    sendOffer: sendOfferViaFirebase,
    sendAnswer: sendAnswerViaFirebase,
    sendIceCandidate: sendIceCandidateViaFirebase,
    cleanUp: cleanUpFirebaseRoom
};