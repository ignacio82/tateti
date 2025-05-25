// sound-multiplayer.js

const FREQS = [1200, 1350, 1500, 1650, 1800, 1950, 2100, 2250, 2400]; // For moves 0-8
const PAIR_REQUEST_FREQ = 1000; // Example frequency
const PAIR_ACCEPT_FREQ = 1100;  // Example frequency
const ACK_FREQ = 900; // Optional: For acknowledging received moves

let isListening = false;
let audioListenerContext = null;
let currentListeningType = null; // 'move', 'pair_request', 'pair_accept'

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
    sendFrequency(FREQS[index], 0.5); // Moves might need slightly longer duration
  }
}

function sendPairingRequest() {
  sendFrequency(PAIR_REQUEST_FREQ, 0.5);
}

function sendPairingAccept() {
  sendFrequency(PAIR_ACCEPT_FREQ, 0.5);
}

// Optional: Acknowledge move
function sendAck() {
  sendFrequency(ACK_FREQ, 0.2);
}


/**
 * Start listening for incoming sounds
 * @param {string} type - 'move', 'pair_request', 'pair_accept', 'ack'
 * @param {function} onDetect - Callback with detected index or signal type
 */
async function startListeningForSounds(type, onDetect) {
  if (isListening) {
    console.log("Already listening, stopping previous listener.");
    stopListening(); // Stop any previous listener
  }
  isListening = true;
  currentListeningType = type;

  // Ensure AudioContext is available and resumed
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
    analyser.fftSize = 4096; // Increased for better frequency resolution
    analyser.smoothingTimeConstant = 0.2; // Some smoothing
    source.connect(analyser);

    const buffer = new Float32Array(analyser.fftSize);
    const sampleRate = ctx.sampleRate;

    let lastHeardAt = 0;
    const cooldownMs = 1500; // Increased cooldown
    const detectionThreshold = 0.15; // Relative magnitude threshold (tune this)
                                    // Or an absolute threshold if preferred: const MIN_POWER_THRESHOLD = 10;

    function detectLoop() {
      if (!isListening || currentListeningType !== type) { // Stop if type changed or stopped
          if (source && source.mediaStream && source.mediaStream.getTracks) {
              source.mediaStream.getTracks().forEach(track => track.stop());
          }
          return;
      }
      analyser.getFloatFrequencyData(buffer); // Use frequency data for clearer peaks

      let targetFreqs;
      if (type === 'move') targetFreqs = FREQS;
      else if (type === 'pair_request') targetFreqs = [PAIR_REQUEST_FREQ];
      else if (type === 'pair_accept') targetFreqs = [PAIR_ACCEPT_FREQ];
      else if (type === 'ack') targetFreqs = [ACK_FREQ];
      else { isListening = false; return; }

      let dominantFreq = -1;
      let maxMagnitude = -Infinity;

      for (let i = 0; i < targetFreqs.length; i++) {
          const freq = targetFreqs[i];
          const binWidth = sampleRate / analyser.fftSize;
          const targetBin = Math.round(freq / binWidth);
          
          // Check a small window around the target bin
          let peakMagnitudeInBin = -Infinity;
          for (let j = Math.max(0, targetBin - 2); j <= Math.min(analyser.frequencyBinCount - 1, targetBin + 2); j++) {
              if (buffer[j] > peakMagnitudeInBin) {
                  peakMagnitudeInBin = buffer[j];
              }
          }

          if (peakMagnitudeInBin > maxMagnitude) {
              maxMagnitude = peakMagnitudeInBin;
              dominantFreq = freq; // Store the target frequency, not the exact detected one
          }
      }
      
      // More robust thresholding - this needs tuning based on testing
      // Convert from dB to linear: power = 10^(dB/10). A value like -50dB might be a good threshold.
      const minDbThreshold = -50; // Adjust this value

      const now = Date.now();
      if (maxMagnitude > minDbThreshold && now - lastHeardAt > cooldownMs) {
        lastHeardAt = now;
        // isListening = false; // Keep listening or stop based on game logic needs. For handshake, stop after one detection.
        
        let detectedValue = -1;
        if (type === 'move') {
            detectedValue = FREQS.indexOf(dominantFreq);
        } else if (dominantFreq === PAIR_REQUEST_FREQ && type === 'pair_request') {
            detectedValue = 'pair_request_detected';
        } else if (dominantFreq === PAIR_ACCEPT_FREQ && type === 'pair_accept') {
            detectedValue = 'pair_accept_detected';
        } else if (dominantFreq === ACK_FREQ && type === 'ack') {
            detectedValue = 'ack_detected';
        }

        if (detectedValue !== -1 && detectedValue !== undefined) {
            console.log(`Detected ${type}: ${dominantFreq} Hz (Value: ${detectedValue}), Mag: ${maxMagnitude} dB`);
            stopListening(); // Stop after successful detection for handshake/ack
            onDetect(detectedValue);
        } else {
            // Detected a strong frequency but not the one we are looking for this type
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
    hideStatusOverlay();
    // Optionally, inform the user:
    // statusDiv.textContent = "Error con micrófono. Revisa permisos.";
    // Consider updating UI to reflect microphone error
    const soundToggle = document.getElementById('soundToggle');
    if (soundToggle) {
      // Simulate disabling sound as a fallback or visual cue
      // soundToggle.click(); // This might trigger other logic, be careful
      // Or just update text:
      // soundToggle.textContent='🔇';
      // alert("No se pudo acceder al micrófono. El juego con sonido no funcionará.");
    }
  }
}


/** Stop the audio listener */
function stopListening() {
  if (isListening) {
      console.log("Stopping listener for type:", currentListeningType);
  }
  isListening = false;
  currentListeningType = null; // Clear the type
  // The stream tracks are stopped within the detectLoop when isListening becomes false.
  if (audioListenerContext && audioListenerContext.state === 'running') {
    // Don't close the context here, as it might be reused.
    // Tracks are stopped individually.
  }
}
// ... (rest of the file: showStatusOverlay, hideStatusOverlay)
// Make sure these are exported if not already:
window.sendPairingRequest = sendPairingRequest;
window.sendPairingAccept = sendPairingAccept;
window.sendAck = sendAck; // If you implement ACKs
window.startListeningForSounds = startListeningForSounds; // Note the new name
// window.startListeningForMoves is now replaced by startListeningForSounds('move', callback)