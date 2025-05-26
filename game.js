// game.js – Main Orchestrator
// -----------------------------------------------------------------------------
// Loads UI, state, audio, CPU logic, P2P, theming, and event listeners.
// -----------------------------------------------------------------------------

import * as ui            from './ui.js';
import * as state         from './state.js';
import * as player        from './player.js';
import * as sound         from './sound.js';
import * as gameLogic     from './gameLogic.js';
import { cpuMove, cpuMoveThreePiece } from './cpu.js'; // Ensure both are imported
import * as peerConnection from './peerConnection.js';
import * as theme         from './theme.js';
import { setupEventListeners } from './eventListeners.js';

document.addEventListener('DOMContentLoaded', () => {
  /* ─────── Load persistent settings ─────── */
  state.setMyPlayerName(localStorage.getItem('tatetiPlayerName') || 'Jugador');
  state.setMyPlayerIcon(localStorage.getItem('tatetiPlayerIcon') || null);
  state.setCurrentSymbolIndex(+localStorage.getItem('currentSymbolIndex') || 0);

  state.setMyWins(+localStorage.getItem('myWinsTateti') || 0);
  state.setOpponentWins(+localStorage.getItem('opponentWinsTateti') || 0);
  state.setDraws(+localStorage.getItem('drawsTateti') || 0);

  state.setWhoGoesFirstSetting(localStorage.getItem('whoGoesFirstSetting') || 'player1');

  const savedGameVariant = localStorage.getItem('tatetiGameVariant');
  state.setGameVariant(
    savedGameVariant === state.GAME_VARIANTS.THREE_PIECE
      ? state.GAME_VARIANTS.THREE_PIECE
      : state.GAME_VARIANTS.CLASSIC
  );

  const initialSoundDisabled = localStorage.getItem('soundDisabled') === 'true';
  state.setSoundEnabled(!initialSoundDisabled);
  state.setPreviousGameExists(state.myWins + state.opponentWins + state.draws > 0);

  /* ─────── Initialize subsystems ─────── */
  sound.setupAudio();
  theme.initializeTheme();
  ui.updateSoundToggleButton(state.soundEnabled);

  // Set the CPU move handler in gameLogic
  // This handler will decide which CPU function to call based on the game variant
  gameLogic.setCpuMoveHandler(async () => {
    if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
      await cpuMoveThreePiece();
    } else {
      await cpuMove();
    }
  });

  gameLogic.setUpdateScoreboardHandler(ui.updateScoreboard);
  gameLogic.setUpdateAllUITogglesHandler(ui.updateAllUIToggleButtons);

  function stopAnyGameInProgressAndResetUI() {
    peerConnection.closePeerSession();
    state.setGameActive(false);
    state.resetRemoteState();
    state.setVsCPU(false); // Reset vsCPU state
    ui.hideOverlay();
    ui.hideQRCode();
    ui.updateAllUIToggleButtons(); // Ensure UI reflects these resets
  }

  player.loadPlayerPreferences();
  player.setupPlayerCustomizationEventListeners(
    ui.updateScoreboard,
    ui.updateStatus,
    player.determineEffectiveIcons
  );

  setupEventListeners(stopAnyGameInProgressAndResetUI);

  /* ─────── Handle deep-link joins or normal startup ─────── */
  function checkUrlForRoomAndJoin() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');

    if (roomId) {
      // Joining a remote game defaults to classic variant
      state.setGameVariant(state.GAME_VARIANTS.CLASSIC);
      localStorage.setItem('tatetiGameVariant', state.GAME_VARIANTS.CLASSIC);
      ui.threePieceToggle && (ui.threePieceToggle.checked = false); // Ensure toggle reflects this

      peerConnection.initializePeerAsJoiner(roomId, stopAnyGameInProgressAndResetUI);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      // Normal startup, initialize game based on current/saved state
      gameLogic.init();

      // Open the side-menu on first load if not already open
      // and not in a remote game waiting for a peer
      if (ui.sideMenu && !ui.sideMenu.classList.contains('open') &&
          ! (state.pvpRemoteActive && !state.gamePaired && state.iAmPlayer1InRemote) ) {
        ui.toggleMenu();
      }
    }
  }

  checkUrlForRoomAndJoin();
});

/* ────────────────────  PWA bootstrap  ─────────────────────── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('SW registered!', reg))
        .catch(err => console.error('SW registration failed:', err));
    } else {
      console.warn('Service Worker not registered (requires HTTP/HTTPS or localhost).');
    }
  });
}