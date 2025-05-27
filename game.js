// game.js – Main Orchestrator
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
  state.setPreviousGameExists(state.myWins + state.opponentWins + state.draws > 0);

  /* ─────── Initialize subsystems ─────── */
  sound.setupAudio();
  theme.initializeTheme();
  ui.updateSoundToggleButton(state.soundEnabled);

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
          stopAnyGameInProgressAndResetUI(true);
          state.setVsCPU(false);
          state.setPvpRemoteActive(true);
          // state.setIAmPlayer1InRemote(false); // This will be determined later
          state.setGamePaired(false);
          ui.updateAllUIToggleButtons();
          ui.showOverlay("Iniciando conexión P2P para matchmaking...");

          peerConnection.ensurePeerInitialized({
              onPeerOpen: (localId) => {
                  console.log('[Game] PeerJS ID for matchmaking:', localId);
                  if (localId) {
                    joinSupabaseQueue(localId);
                  } else {
                    console.error('[Game] Failed to get PeerJS ID for matchmaking.');
                    ui.showOverlay("Error: No se pudo obtener ID para matchmaking.");
                    setTimeout(ui.hideOverlay, 3000);
                    state.resetRemoteState();
                    ui.updateAllUIToggleButtons();
                  }
              },
              onError: (err) => {
                  console.error('[Game] PeerJS init error for matchmaking:', err);
                  ui.showOverlay(`Error de PeerJS al iniciar: ${err.type || err.message || 'Desconocido'}`);
                  setTimeout(ui.hideOverlay, 3000);
                  state.resetRemoteState();
                  ui.updateAllUIToggleButtons();
              }
          });
      }
  });

  function joinSupabaseQueue(localId) {
      matchmaking.joinQueue(localId, {
          onSearching: () => {
              ui.updateStatus("Buscando un oponente en la red...");
              ui.showOverlay("Buscando oponente...");
          },
          onMatchFound: (opponentPeerId) => {
              ui.showOverlay(`¡Oponente encontrado! (${opponentPeerId}). Conectando...`);
              console.log(`[Game] Match found with ${opponentPeerId}. Attempting to connect.`);

              // Logic to determine who is P1 or P2 can be added here if needed.
              // For example, the client that initiated the findMatch (this client)
              // could be considered P2, and the one found P1.
              // This needs to be consistent for how onConnectionOpen in peerConnection.js sets up the game.
              // For now, peerConnection.js's onNewConnection (for P1) and onConnectionOpen (for P2 after connect)
              // will establish roles. The client calling connectToDiscoveredPeer is effectively the "joiner".
              state.setPvpRemoteActive(true); // Ensure P2P mode is active
              // state.setIAmPlayer1InRemote(false); // Joiner is typically not P1 initially
              state.setCurrentHostPeerId(opponentPeerId); // Store opponent's ID

              peerConnection.connectToDiscoveredPeer(opponentPeerId);
              // gameLogic.init() will be called by onConnectionOpen in peerConnection.js once connected
          },
          onError: (errMsg) => {
              ui.showOverlay(`Error de Matchmaking: ${errMsg}`);
              console.error('[Game] Matchmaking error:', errMsg);
              setTimeout(() => {
                ui.hideOverlay();
                stopAnyGameInProgressAndResetUI(); // Reset to a clean state
                gameLogic.init(); // Re-initialize to default local mode or similar
              }, 3000);
          },
          onTimeout: () => {
              ui.showOverlay("No se encontraron oponentes. Intenta de nuevo.");
              console.log('[Game] Matchmaking timed out.');
              // matchmaking.leaveQueue() is called internally by the matchmaking module on timeout
              setTimeout(() => {
                ui.hideOverlay();
                stopAnyGameInProgressAndResetUI(); // Reset to a clean state
                gameLogic.init(); // Re-initialize to default local mode or similar
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
          gameLogic.init();
        }
      });
    } else {
      // Normal startup: Initialize PeerJS in a benign way first if not handling a URL room.
      // This ensures getLocalPeerId() can return an ID if matchmaking is tried later
      // without going through host/join specific initializations.
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