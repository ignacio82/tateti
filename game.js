// game.js – Main Orchestrator - Fixed version
// -----------------------------------------------------------------------------
// Loads UI, state, audio, CPU logic, P2P, theming, and event listeners.
// -----------------------------------------------------------------------------

import * as ui            from './ui.js';
import * as state         from './state.js';
import * as player        from './player.js';
import * as sound         from './sound.js';
import * as gameLogic     from './gameLogic.js';
import { cpuMove, cpuMoveThreePiece } from './cpu.js';
import * as peerConnection from './peerConnection.js';
import * as theme         from './theme.js';
import { setupEventListeners } from './eventListeners.js';
// Import Supabase matchmaking functions
import * as matchmaking   from './matchmaking_supabase.js';

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
  
  const initialHapticsDisabled = localStorage.getItem('hapticsDisabled') === 'true'; // ADDED: Load haptics setting
  state.setHapticsEnabled(!initialHapticsDisabled); // ADDED: Set initial haptics state

  state.setPreviousGameExists(state.myWins + state.opponentWins + state.draws > 0);

  /* ─────── Initialize subsystems ─────── */
  sound.setupAudio();
  theme.initializeTheme();
  ui.updateSoundToggleButton(state.soundEnabled);
  ui.updateHapticsToggleButton(state.hapticsEnabled); // ADDED: Update haptics button on load

  gameLogic.setCpuMoveHandler(async () => {
    if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
      await cpuMoveThreePiece();
    } else {
      await cpuMove();
    }
  });

  gameLogic.setUpdateScoreboardHandler(ui.updateScoreboard);
  gameLogic.setUpdateAllUITogglesHandler(ui.updateAllUIToggleButtons);

  function stopAnyGameInProgressAndResetUI(preserveMenu = false) {
    matchmaking.leaveQueue();
    peerConnection.closePeerSession();
    state.setGameActive(false);
    state.resetRemoteState();
    state.setVsCPU(false);
    ui.hideOverlay();
    ui.hideQRCode();
    ui.updateAllUIToggleButtons();
    if (ui.sideMenu && !preserveMenu && ui.sideMenu.classList.contains('open')) {
        // ui.toggleMenu(); // Decide if menu should auto-close
    }
  }

  player.loadPlayerPreferences();
  player.setupPlayerCustomizationEventListeners(
    ui.updateScoreboard,
    ui.updateStatus,
    player.determineEffectiveIcons
  );

  setupEventListeners(stopAnyGameInProgressAndResetUI, {
      onPlayRandom: async () => {
          console.log('[Game] Play Random button clicked');
          stopAnyGameInProgressAndResetUI(true);
          state.setVsCPU(false);
          state.setPvpRemoteActive(true);
          state.setGamePaired(false);
          ui.updateAllUIToggleButtons();
          ui.showOverlay("Iniciando conexión P2P para matchmaking...");

          // First ensure PeerJS is initialized and get the local ID
          peerConnection.ensurePeerInitialized({
              onPeerOpen: (localId) => {
                  console.log('[Game] PeerJS ID for matchmaking:', localId);
                  if (localId) {
                    joinSupabaseQueue(localId);
                  } else {
                    console.error('[Game] Failed to get PeerJS ID for matchmaking.');
                    ui.showOverlay("Error: No se pudo obtener ID para matchmaking.");
                    setTimeout(() => {
                        ui.hideOverlay();
                        state.resetRemoteState();
                        ui.updateAllUIToggleButtons();
                        gameLogic.init();
                    }, 3000);
                  }
              },
              onError: (err) => {
                  console.error('[Game] PeerJS init error for matchmaking:', err);
                  ui.showOverlay(`Error de PeerJS al iniciar: ${err.type || err.message || 'Desconocido'}`);
                  setTimeout(() => {
                      ui.hideOverlay();
                      state.resetRemoteState();
                      ui.updateAllUIToggleButtons();
                      gameLogic.init();
                  }, 3000);
              }
          });
      }
  });

  function joinSupabaseQueue(localId) {
      console.log('[Game] Joining Supabase queue with ID:', localId);
      matchmaking.joinQueue(localId, {
          onSearching: () => {
              console.log('[Game] Searching for opponent...');
              ui.updateStatus("Buscando un oponente en la red...");
              ui.showOverlay("Buscando oponente...");
          },
          onMatchFound: (opponentPeerId) => {
              console.log(`[Game] Match found with ${opponentPeerId}. Attempting to connect.`);
              ui.showOverlay(`¡Oponente encontrado! (${opponentPeerId}). Conectando...`);

              // Ensure we're still in PVP remote mode
              state.setPvpRemoteActive(true);
              state.setCurrentHostPeerId(opponentPeerId);

              // Connect to the discovered peer
              peerConnection.connectToDiscoveredPeer(opponentPeerId);
          },
          onError: (errMsg) => {
              console.error('[Game] Matchmaking error:', errMsg);
              ui.showOverlay(`Error de Matchmaking: ${errMsg}`);
              setTimeout(() => {
                ui.hideOverlay();
                stopAnyGameInProgressAndResetUI();
                gameLogic.init();
              }, 3000);
          },
          onTimeout: () => {
              console.log('[Game] Matchmaking timed out.');
              ui.showOverlay("No se encontraron oponentes. Intenta de nuevo.");
              setTimeout(() => {
                ui.hideOverlay();
                stopAnyGameInProgressAndResetUI();
                gameLogic.init();
              }, 3000);
          }
      });
  }

  /* ─────── Handle deep-link joins or normal startup ─────── */
  function checkUrlForRoomAndJoin() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');

    if (roomId) {
      // Ensure PeerJS is initialized before attempting to join via URL
      peerConnection.ensurePeerInitialized({
        onPeerOpen: (localId) => {
          console.log('[Game] PeerJS initialized for URL join, ID:', localId);
          state.setGameVariant(state.GAME_VARIANTS.CLASSIC);
          localStorage.setItem('tatetiGameVariant', state.GAME_VARIANTS.CLASSIC);
          if (ui.threePieceToggle) ui.threePieceToggle.checked = false;

          peerConnection.initializePeerAsJoiner(roomId, stopAnyGameInProgressAndResetUI);
          window.history.replaceState({}, document.title, window.location.pathname);
        },
        onError: (err) => {
          console.error('[Game] PeerJS init error for URL join:', err);
          ui.showOverlay(`Error de PeerJS: ${err.type || 'No se pudo iniciar P2P para unirse.'}`);
          // Fallback to normal init
          setTimeout(() => {
              ui.hideOverlay();
              gameLogic.init();
          }, 3000);
        }
      });
    } else {
      // Normal startup: Initialize PeerJS in a benign way first
      peerConnection.ensurePeerInitialized({
        onPeerOpen: (id) => console.log('[Game] PeerJS session pre-initialized on load. ID:', id),
        onError: (err) => console.warn('[Game] Benign PeerJS pre-init error:', err.type)
      });
      gameLogic.init(); // Standard game init
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