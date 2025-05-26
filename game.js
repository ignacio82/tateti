// game.js - Main Orchestrator
import * as ui from './ui.js';
import * as state from './state.js';
import * as player from './player.js';
import * as sound from './sound.js';
import * as gameLogic from './gameLogic.js';
import { cpuMakeMove } from './cpu.js'; // Corrected: Was cpuMove
import * as peerConnection from './peerConnection.js';
import * as theme from './theme.js';
import { setupEventListeners } from './eventListeners.js';

document.addEventListener('DOMContentLoaded', () => {
    // Initial state loading
    state.setMyPlayerName(localStorage.getItem('tatetiPlayerName') || 'Jugador');
    state.setMyPlayerIcon(localStorage.getItem('tatetiPlayerIcon') || null); // Will be null if not set
    state.setCurrentSymbolIndex(+(localStorage.getItem('currentSymbolIndex') || 0));
    
    state.setMyWins(+localStorage.getItem('myWinsTateti') || 0);
    state.setOpponentWins(+localStorage.getItem('opponentWinsTateti') || 0);
    state.setDraws(+localStorage.getItem('drawsTateti') || 0);
    
    state.setWhoGoesFirstSetting(localStorage.getItem('whoGoesFirstSetting') || 'player1');
    
    // Load game variant preference
    const savedGameVariant = localStorage.getItem('tatetiGameVariant');
    if (savedGameVariant === state.GAME_VARIANTS.THREE_PIECE) {
        state.setGameVariant(state.GAME_VARIANTS.THREE_PIECE);
    } else {
        state.setGameVariant(state.GAME_VARIANTS.CLASSIC); // Default to classic
    }
    
    const initialSoundDisabled = localStorage.getItem('soundDisabled') === 'true';
    state.setSoundEnabled(!initialSoundDisabled);
    state.setPreviousGameExists((state.myWins + state.opponentWins + state.draws) > 0);

    // Initialize modules
    sound.setupAudio();
    theme.initializeTheme(); // This will call ui.updateThemeToggleButton internally
    ui.updateSoundToggleButton(state.soundEnabled); // Ensure sound button reflects loaded state

    gameLogic.setCpuMoveHandler(cpuMakeMove); // Corrected: Was cpuMove
    gameLogic.setUpdateScoreboardHandler(ui.updateScoreboard);
    gameLogic.setUpdateAllUITogglesHandler(ui.updateAllUIToggleButtons);

    function stopAnyGameInProgressAndResetUI() {
        peerConnection.closePeerSession();
        state.setGameActive(false);
        state.resetRemoteState();
        state.setVsCPU(false); 
        // Game variant is NOT reset here; it's a user preference or set by mode buttons.
        // If a full reset to classic is desired, state.setGameVariant(state.GAME_VARIANTS.CLASSIC) could be added.
        ui.hideOverlay();
        ui.hideQRCode();
        ui.updateAllUIToggleButtons(); 
    }

    player.loadPlayerPreferences();
    player.setupPlayerCustomizationEventListeners(
        ui.updateScoreboard,
        ui.updateStatus,
        player.determineEffectiveIcons
    );

    setupEventListeners(
        stopAnyGameInProgressAndResetUI
        // Callbacks for ui.updateScoreboard and ui.updateAllUIToggleButtons are not passed here
        // as eventListeners.js is expected to call them directly from ui.js if needed,
        // or they are called by gameLogic.init() which eventListeners.js triggers.
    );

    function checkUrlForRoomAndJoin() {
        const urlParams = new URLSearchParams(window.location.search);
        const roomId = urlParams.get('room');
        if (roomId) {
            // Joining a remote game defaults to classic Tic-Tac-Toe
            state.setGameVariant(state.GAME_VARIANTS.CLASSIC);
            localStorage.setItem('tatetiGameVariant', state.GAME_VARIANTS.CLASSIC); // Persist this if joining via URL
            peerConnection.initializePeerAsJoiner(roomId, stopAnyGameInProgressAndResetUI);
            window.history.replaceState({}, document.title, window.location.pathname);
            // Menu remains closed by default when joining via link
        } else {
            // For a normal load, gameLogic.init() will respect the gameVariant loaded from localStorage (or default).
            gameLogic.init(); 
            // Open the menu on first load if not joining via link and it's not already open
            if (ui.sideMenu && !ui.sideMenu.classList.contains('open')) { //
                ui.toggleMenu(); //
            }
        }
    }
    checkUrlForRoomAndJoin();
});

/* ----------  PWA bootstrap  ---------- */
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