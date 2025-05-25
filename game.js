// game.js - Main Orchestrator
import * as ui from './ui.js'; // Now imports updateScoreboard and updateAllUIToggleButtons
import * as state from './state.js';
import * as player from './player.js';
import * as sound from './sound.js';
import * as gameLogic from './gameLogic.js';
import { cpuMove } from './cpu.js';
import * as peerConnection from './peerConnection.js';
import * as theme from './theme.js';
import { setupEventListeners } from './eventListeners.js';

document.addEventListener('DOMContentLoaded', () => {
    // Initial state loading
    state.setMyPlayerName(localStorage.getItem('tatetiPlayerName') || 'Jugador');
    state.setMyPlayerIcon(localStorage.getItem('tatetiPlayerIcon') || null);
    state.setCurrentSymbolIndex(+(localStorage.getItem('currentSymbolIndex') || 0));
    state.myWins = +localStorage.getItem('myWinsTateti') || 0;
    state.opponentWins = +localStorage.getItem('opponentWinsTateti') || 0;
    state.draws = +localStorage.getItem('drawsTateti') || 0;
    state.setWhoGoesFirstSetting(localStorage.getItem('whoGoesFirstSetting') || 'player1');
    const initialSoundDisabled = localStorage.getItem('soundDisabled') === 'true';
    state.setSoundEnabled(!initialSoundDisabled);
    state.setPreviousGameExists((state.myWins + state.opponentWins + state.draws) > 0);

    // Initialize modules
    sound.setupAudio();
    theme.initializeTheme();
    // Initial UI state update based on loaded settings
    ui.updateSoundToggleButton(state.soundEnabled); // Ensure button reflects loaded state
    // ui.updateThemeToggleButton is handled by theme.initializeTheme()

    // --- UI Update Callbacks are MOVED to ui.js ---
    // No longer defined here: updateScoreboardUI_callback, updateAllUIToggleButtons_callback

    // Set handlers/callbacks in modules that need them, now passing functions from ui.js
    gameLogic.setCpuMoveHandler(cpuMove);
    gameLogic.setUpdateScoreboardHandler(ui.updateScoreboard); // Pass ui.updateScoreboard
    gameLogic.setUpdateAllUITogglesHandler(ui.updateAllUIToggleButtons); // Pass ui.updateAllUIToggleButtons

    // This function stops any game and ensures UI reflects this.
    // It calls ui.updateAllUIToggleButtons directly.
    function stopAnyGameInProgressAndResetUI() {
        peerConnection.closePeerSession(); // Handles PeerJS shutdown
        state.setGameActive(false);
        state.resetRemoteState();
        state.setVsCPU(false);
        ui.hideOverlay();
        ui.hideQRCode();
        ui.updateAllUIToggleButtons(); // Directly call the UI update function
    }

    // Initial player preferences load and event listener setup for player customization
    player.loadPlayerPreferences();
    player.setupPlayerCustomizationEventListeners(
        ui.updateScoreboard,     // Pass ui.updateScoreboard
        ui.updateStatus,         // Pass ui.updateStatus
        player.determineEffectiveIcons
    );

    // Setup all other event listeners
    setupEventListeners(
        stopAnyGameInProgressAndResetUI,
        ui.updateScoreboard,     // Pass ui.updateScoreboard
        ui.updateAllUIToggleButtons // Pass ui.updateAllUIToggleButtons
    );

    // Initial game setup based on URL or default
    function checkUrlForRoomAndJoin() {
        const urlParams = new URLSearchParams(window.location.search);
        const roomId = urlParams.get('room');
        if (roomId) {
            peerConnection.initializePeerAsJoiner(roomId, stopAnyGameInProgressAndResetUI);
            window.history.replaceState({}, document.title, window.location.pathname);
        } else {
            gameLogic.init(); // gameLogic.init will call the registered UI update handlers
        }
    }
    checkUrlForRoomAndJoin();
});

/* ----------  PWA bootstrap  ---------- */
// ... (same as before)
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    if (location.protocol === 'http:' || location.protocol === 'https:') {
        navigator.serviceWorker.register('./sw.js')
          .then(reg => console.log('SW registered!', reg))
          .catch(err=>console.error('SW registration failed:',err));
    } else {
        console.warn('Service Worker not registered. (Requires HTTP/HTTPS or localhost)');
    }
  });
}