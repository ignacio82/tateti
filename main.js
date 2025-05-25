// main.js – handles game mode switching and sound-based multiplayer logic

const FREQS = [1200, 1350, 1500, 1650, 1800, 1950, 2100, 2250, 2400];
let isListening = false;
let audioListenerContext = null;

/**
 * Send move via sound
 * @param {number} index - Cell index (0 to 8)
 */
function sendMoveViaSound(index) {
  const freq = FREQS[index];
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start();
  osc.stop(ctx.currentTime + 0.5);
}

/**
 * Start listening for incoming moves
 * @param {function} onDetect - Callback with detected index
 */
async function startListeningForMoves(onDetect) {
  if (isListening) return;
  isListening = true;

  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  audioListenerContext = ctx;

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);

  const buffer = new Float32Array(analyser.fftSize);
  const sampleRate = ctx.sampleRate;

  let lastHeardAt = 0;
  const cooldownMs = 1200;

  function detect() {
    analyser.getFloatTimeDomainData(buffer);

    const magnitudes = FREQS.map(freq => {
      const bin = Math.round(freq * analyser.fftSize / sampleRate);
      let re = 0, im = 0;
      for (let i = 0; i < buffer.length; i++) {
        const angle = 2 * Math.PI * bin * i / buffer.length;
        re += buffer[i] * Math.cos(angle);
        im += buffer[i] * Math.sin(angle);
      }
      return Math.sqrt(re * re + im * im);
    });

    const max = Math.max(...magnitudes);
    const index = magnitudes.findIndex(m => m === max);

    const now = Date.now();
    if (max > 5 && now - lastHeardAt > cooldownMs) {
      lastHeardAt = now;
      isListening = false;
      hideStatusOverlay();
      onDetect(index);
    }

    if (isListening) requestAnimationFrame(detect);
  }

  detect();
}

/** Stop the audio listener */
function stopListening() {
  isListening = false;
  if (audioListenerContext?.state === 'running') {
    audioListenerContext.close();
  }
}

/** Show overlay message */
function showStatusOverlay(text) {
  const overlay = document.getElementById('statusOverlay');
  overlay.textContent = text;
  overlay.style.display = 'block';
}

/** Hide overlay message */
function hideStatusOverlay() {
  const overlay = document.getElementById('statusOverlay');
  if (overlay) overlay.style.display = 'none';
}

// Export globally
window.sendMoveViaSound = sendMoveViaSound;
window.startListeningForMoves = startListeningForMoves;
window.stopListening = stopListening;
window.showStatusOverlay = showStatusOverlay;
window.hideStatusOverlay = hideStatusOverlay;
