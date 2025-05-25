// sound-multiplayer.js

const FREQS = [1200, 1350, 1500, 1650, 1800, 1950, 2100, 2250, 2400]; // For moves 0-8
const PAIR_REQUEST_FREQ = 1000;
const PAIR_ACCEPT_FREQ = 1100;
const HOST_ACK_FREQ = 800; // New frequency for Host's acknowledgment
const ACK_FREQ = 900; // Optional: For acknowledging received moves (can be kept if used elsewhere)

let isListening = false;
let audioListenerContext = null;
let currentListeningType = null; // 'move', 'pair_request', 'pair_accept', 'host_ack'

/**
 * Send a specific frequency sound
 * @param {number} freq - Frequency to send
 * @param {number} duration - Duration in seconds
 */
function sendFrequency(freq, duration = 0.3) {
  if (!freq) return;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (!ctx) {
    console.error("AudioContext not supported.");
    return;
  }
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.2, ctx.currentTime); // Keep gain reasonable
  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start();
  osc.stop(ctx.currentTime + duration);
  console.log(`Sent frequency: ${freq} for ${duration}s`);
}

function sendMoveViaSound(index) {
  if (index >= 0 && index < FREQS.length) {
    sendFrequency(FREQS[index], 0.5);
  }
}

function sendPairingRequest() {
  sendFrequency(PAIR_REQUEST_FREQ, 0.5);
}

function sendPairingAccept() {
  sendFrequency(PAIR_ACCEPT_FREQ, 0.5);
}

function sendHostAck() { // New function to send Host ACK
  sendFrequency(HOST_ACK_FREQ, 0.3);
}

// Optional: Acknowledge move
function sendAck() {
  sendFrequency(ACK_FREQ, 0.2);
}

/**
 * Start listening for incoming sounds
 * @param {string} type - 'move', 'pair_request', 'pair_accept', 'host_ack', 'ack'
 * @param {function} onDetect - Callback with detected index or signal type
 */
async function startListeningForSounds(type, onDetect) {
  if (isListening) {
    console.log("Already listening, stopping previous listener for type:", currentListeningType);
    stopListening(); 
  }
  isListening = true;
  currentListeningType = type;
  console.log("Starting listener for type:", currentListeningType);


  if (!audioListenerContext || audioListenerContext.state === 'closed') {
    audioListenerContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioListenerContext.state === 'suspended') {
    await audioListenerContext.resume();
  }
  
  const ctx = audioListenerContext;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 4096; 
    analyser.smoothingTimeConstant = 0.2; 
    source.connect(analyser);

    const buffer = new Float32Array(analyser.fftSize);
    const sampleRate = ctx.sampleRate;

    let lastHeardAt = 0;
    const cooldownMs = 1500; 
    const minDbThreshold = -50; 

    function detectLoop() {
      if (!isListening || currentListeningType !== type) { 
          if (source && source.mediaStream && source.mediaStream.getTracks) {
              source.mediaStream.getTracks().forEach(track => track.stop());
          }
          console.log("Listener stopping or type changed. Current:", currentListeningType, "Expected:", type);
          return;
      }
      analyser.getFloatFrequencyData(buffer); 

      let targetFreqs;
      if (type === 'move') targetFreqs = FREQS;
      else if (type === 'pair_request') targetFreqs = [PAIR_REQUEST_FREQ];
      else if (type === 'pair_accept') targetFreqs = [PAIR_ACCEPT_FREQ];
      else if (type === 'host_ack') targetFreqs = [HOST_ACK_FREQ]; // Listen for HOST_ACK
      else if (type === 'ack') targetFreqs = [ACK_FREQ];
      else { 
        console.error("Unknown listening type:", type);
        stopListening(); // Stop if type is unknown
        return; 
      }

      let dominantFreq = -1;
      let maxMagnitude = -Infinity;

      for (let i = 0; i < targetFreqs.length; i++) {
          const freq = targetFreqs[i];
          const binWidth = sampleRate / analyser.fftSize;
          const targetBin = Math.round(freq / binWidth);
          
          let peakMagnitudeInBin = -Infinity;
          for (let j = Math.max(0, targetBin - 2); j <= Math.min(analyser.frequencyBinCount - 1, targetBin + 2); j++) {
              if (buffer[j] > peakMagnitudeInBin) {
                  peakMagnitudeInBin = buffer[j];
              }
          }

          if (peakMagnitudeInBin > maxMagnitude) {
              maxMagnitude = peakMagnitudeInBin;
              dominantFreq = freq; 
          }
      }
      
      const now = Date.now();
      if (maxMagnitude > minDbThreshold && now - lastHeardAt > cooldownMs) {
        lastHeardAt = now;
        
        let detectedValue = -1;
        if (type === 'move') {
            detectedValue = FREQS.indexOf(dominantFreq);
        } else if (dominantFreq === PAIR_REQUEST_FREQ && type === 'pair_request') {
            detectedValue = 'pair_request_detected';
        } else if (dominantFreq === PAIR_ACCEPT_FREQ && type === 'pair_accept') {
            detectedValue = 'pair_accept_detected';
        } else if (dominantFreq === HOST_ACK_FREQ && type === 'host_ack') { // Detect HOST_ACK
            detectedValue = 'host_ack_detected';
        } else if (dominantFreq === ACK_FREQ && type === 'ack') {
            detectedValue = 'ack_detected';
        }

        if (detectedValue !== -1 && detectedValue !== undefined) {
            console.log(`Detected ${type}: ${dominantFreq} Hz (Value: ${detectedValue}), Mag: ${maxMagnitude} dB`);
            stopListening(); 
            onDetect(detectedValue);
        } else {
            // console.log(`Detected strong freq ${dominantFreq} but not for type ${type}`);
        }
      }

      if (isListening && currentListeningType === type) {
        requestAnimationFrame(detectLoop);
      } else {
          if (source && source.mediaStream && source.mediaStream.getTracks) {
            source.mediaStream.getTracks().forEach(track => track.stop());
          }
      }
    }
    detectLoop();
  } catch (err) {
    console.error('Error starting listener:', err);
    isListening = false;
    currentListeningType = null;
    if (typeof hideStatusOverlay === "function") hideStatusOverlay(); // Ensure this function exists
  }
}

/** Stop the audio listener */
function stopListening() {
  if (isListening) {
      console.log("Stopping listener for type:", currentListeningType);
  }
  isListening = false;
  // currentListeningType = null; // Do not clear here, detectLoop checks it to stop
  // The stream tracks are stopped within the detectLoop when isListening becomes false or type changes.
}

// Functions for showStatusOverlay and hideStatusOverlay
// (Ensure these are present, as discussed previously, or the game will have other errors)
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

window.sendPairingRequest = sendPairingRequest;
window.sendPairingAccept = sendPairingAccept;
window.sendHostAck = sendHostAck; // Export new function
window.sendAck = sendAck; 
window.startListeningForSounds = startListeningForSounds;
window.stopListening = stopListening;
window.sendMoveViaSound = sendMoveViaSound;
window.showStatusOverlay = showStatusOverlay;
window.hideStatusOverlay = hideStatusOverlay;