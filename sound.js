// sound.js
import * as state from './state.js';
import { updateSoundToggleButton, updateHapticsToggleButton } from './ui.js'; // For updating the button's visual state

let audioCtx = null;

// --- Haptic Feedback Patterns ---
export const HAPTIC_PATTERNS = {
    PLACE_PIECE: 50, // A short, single vibration
    WIN: [100, 50, 100, 50, 200], // A triumphant series
    LOSE_DRAW: [75, 50, 75] // A softer, shorter series
};

/**
 * Gets or creates the AudioContext.
 * @returns {AudioContext|null} The AudioContext instance or null if not supported.
 */
export function getAudioContext() {
    if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

/**
 * Resumes the AudioContext if it's suspended.
 * This is typically called after a user interaction.
 */
export function initAudioOnInteraction() {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(err => console.error("Error resuming AudioContext:", err));
    }
    // The event listener for this is usually added once in the main setup.
    // We export this function so the main setup can call it.
}

/**
 * Plays a sound effect based on the type.
 * @param {string} type - The type of sound to play ('move', 'win', 'draw', 'reset').
 */
export function playSound(type) {
    if (!state.soundEnabled) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    let freq1 = 200, freq2 = 300, duration = 0.1, gainVal = 0.3, oscType = 'sine';

    switch (type) {
        case 'move': //
            oscType = 'sine'; //
            freq1 = 200; //
            freq2 = 300; //
            duration = 0.1; //
            gainVal = 0.3; //
            break;
        case 'win': //
            oscType = 'triangle'; //
            freq1 = 300; //
            freq2 = 600; //
            duration = 0.3; //
            gainVal = 0.3; //
            break;
        case 'draw': //
            oscType = 'sawtooth'; //
            freq1 = 200; //
            freq2 = 100; //
            duration = 0.3; //
            gainVal = 0.2; //
            break;
        case 'reset': //
            oscType = 'square'; //
            freq1 = 150; //
            freq2 = 80; //
            duration = 0.2; //
            gainVal = 0.2; //
            break;
        default:
            return; // Unknown sound type
    }

    osc.type = oscType;
    osc.frequency.setValueAtTime(freq1, ctx.currentTime);
    gain.gain.setValueAtTime(gainVal, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq2, ctx.currentTime + duration);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration + 0.1); // Stop slightly after ramp
}

/**
 * Toggles the sound enabled state and updates the UI.
 */
export function toggleSound() {
    state.setSoundEnabled(!state.soundEnabled); //
    localStorage.setItem('soundDisabled', !state.soundEnabled); //
    updateSoundToggleButton(state.soundEnabled); // Update UI from ui.js
    if (state.soundEnabled) {
        playSound('reset'); // Play a sound to confirm it's on
    }
}

/**
 * Sets up the initial audio interaction listener.
 * This should be called once when the application loads.
 */
export function setupAudio() {
    document.addEventListener('click', initAudioOnInteraction, { once: true });
}

/**
 * Triggers haptic feedback if supported and enabled.
 * @param {number|number[]} pattern - A single duration or an array pattern for vibration.
 */
export function vibrate(pattern) {
    if (state.hapticsEnabled && "vibrate" in navigator) {
        try {
            navigator.vibrate(pattern);
        } catch (e) {
            console.warn("Haptic feedback failed. Error:", e);
        }
    }
}

/**
 * Toggles the haptic feedback enabled state and updates the UI.
 */
export function toggleHaptics() {
    state.setHapticsEnabled(!state.hapticsEnabled);
    localStorage.setItem('hapticsDisabled', !state.hapticsEnabled);
    updateHapticsToggleButton(state.hapticsEnabled);
    if (state.hapticsEnabled) {
        vibrate(50); // Brief vibration to confirm it's on
    }
}