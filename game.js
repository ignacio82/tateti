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
    matchmaking.leaveQueue(); // Ensure we leave matchmaking queue if active
    peerConnection.closePeerSession();
    state.setGameActive(false);
    state.resetRemoteState();
    state.setVsCPU(false);
    ui.hideOverlay();
    ui.hideQRCode();
    ui.updateAllUIToggleButtons();
    if (ui.sideMenu && !preserveMenu && ui.sideMenu.classList.contains('open')) {
        // Optionally close menu unless specified not to (e.g. if action was from menu)
    }
  }

  player.loadPlayerPreferences();
  player.setupPlayerCustomizationEventListeners(
    ui.updateScoreboard,
    ui.updateStatus,
    player.determineEffectiveIcons
  );

  // Initial PeerJS setup to get localPeerId early for matchmaking
  // We're not connecting yet, just getting an ID.
  // The peerJsCallbacks in peerConnection.js will handle onPeerOpen.
  // We need to ensure getLocalPeerId() in peerConnection.js returns the ID once available.
  // peerConnection.initializePeerAsHost() or Joiner() will call window.peerJsMultiplayer.init().
  // For matchmaking, we need a way to init PeerJS without immediately deciding host/joiner.

  // Let's adjust how PeerJS is initialized for matchmaking.
  // It might be better to have a generic peer init that matchmaking can use.
  // For now, we assume `peerConnection.getLocalPeerId()` will work after peerConnection methods are called.
  // The `peerjs-multiplayer.js` `initPeerSession` is called by `peerConnection` functions.

  // Attach event listeners (including the new matchmaking button listener)
  setupEventListeners(stopAnyGameInProgressAndResetUI, {
      onPlayRandom: async () => {
          stopAnyGameInProgressAndResetUI(true); // Preserve menu if open
          state.setVsCPU(false);
          state.setPvpRemoteActive(true); // Set to true to indicate a P2P game
          state.setIAmPlayer1InRemote(false); // Default to false, can be negotiated or set based on who connects
          state.setGamePaired(false);
          ui.updateAllUIToggleButtons();
          ui.showOverlay("Buscando oponente...");

          // Ensure PeerJS is initialized and we have an ID.
          // A robust way is to ensure peerConnection.init() or similar is called
          // and provides the local ID.
          // For now, assuming peerConnection.getLocalPeerId() can retrieve it
          // if a connection (even a dormant one to PeerServer) is established.
          // If not, we might need a dedicated init step for PeerJS before matchmaking.

          // Initialize a generic PeerJS session if one isn't active,
          // just to get our PeerID from the PeerServer.
          if (!peerConnection.getLocalPeerId() && window.peerJsMultiplayer?.init) {
              console.log('[Game] Initializing PeerJS session for matchmaking ID...');
              // Using a simplified init just to get an ID. The full callbacks are in peerConnection.js
              // This is a bit of a workaround. Ideally, peerConnection.js would expose a
              // simple "ensurePeerId" function.
              window.peerJsMultiplayer.init(null, {
                  onPeerOpen: (id) => {
                      console.log('[Game] PeerJS ID for matchmaking:', id);
                      // Now that we have the ID, join the queue
                      joinSupabaseQueue(id);
                  },
                  onError: (err) => {
                      console.error('[Game] PeerJS init error for matchmaking:', err);
                      ui.showOverlay(`Error de PeerJS: ${err.type || 'Desconocido'}`);
                      setTimeout(ui.hideOverlay, 3000);
                      state.resetRemoteState();
                      ui.updateAllUIToggleButtons();
                  }
              });
          } else if (peerConnection.getLocalPeerId()) {
              joinSupabaseQueue(peerConnection.getLocalPeerId());
          } else {
              console.error('[Game] PeerJS multiplayer module not available for matchmaking.');
              ui.showOverlay("Error: Módulo P2P no disponible.");
              setTimeout(ui.hideOverlay, 3000);
          }
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
              // We are initiating the connection, so we act as the "joiner" in PeerJS terms.
              // The other client is already listening due to their own peer.on('connection').
              state.setPvpRemoteActive(true);
              state.setIAmPlayer1InRemote(false); // Peer initiating connect is often P2
              state.setCurrentHostPeerId(opponentPeerId); // Store opponent's ID as "host" to connect to

              // Use peerConnection.initializePeerAsJoiner or a more direct connect method.
              // initializePeerAsJoiner might do more than just connect (like prompting for ID).
              // We need a way for peerConnection to connect if we already have the host ID.
              // Let's assume initializePeerAsJoiner can take an ID and skip prompt.
              // Or, better, peerConnection.connectToPeer(opponentPeerId) if available.

              // For now, let's refine how we connect.
              // If peerJsMultiplayer.connect is available, we use it.
              // The peerConnection.js callbacks (onConnectionOpen, etc.) will handle game setup.
              if (window.peerJsMultiplayer?.connect) {
                  // Ensure peerJsMultiplayer is initialized with our game's callbacks from peerConnection.js
                  // This might mean peerConnection.js needs an init function that doesn't assume host/joiner role yet.
                  // For now, assuming the existing callbacks in peerConnection.js are set up.
                  window.peerJsMultiplayer.connect(opponentPeerId);
              } else {
                  console.error("[Game] peerJsMultiplayer.connect not available.");
                  ui.showOverlay("Error al intentar conectar.");
                  matchmaking.leaveQueue(); // Leave queue if connection fails early
              }
              // gameLogic.init() will be called by onConnectionOpen in peerConnection.js
          },
          onError: (errMsg) => {
              ui.showOverlay(`Error de Matchmaking: ${errMsg}`);
              console.error('[Game] Matchmaking error:', errMsg);
              setTimeout(ui.hideOverlay, 3000);
              state.resetRemoteState();
              ui.updateAllUIToggleButtons();
          },
          onTimeout: () => {
              ui.showOverlay("No se encontraron oponentes. Intenta de nuevo.");
              console.log('[Game] Matchmaking timed out.');
              // matchmaking.leaveQueue() is called internally by the matchmaking module on timeout
              setTimeout(ui.hideOverlay, 3000);
              state.resetRemoteState();
              ui.updateAllUIToggleButtons();
          }
      });
  }


  /* ─────── Handle deep-link joins or normal startup ─────── */
  function checkUrlForRoomAndJoin() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');

    if (roomId) {
      state.setGameVariant(state.GAME_VARIANTS.CLASSIC);
      localStorage.setItem('tatetiGameVariant', state.GAME_VARIANTS.CLASSIC);
      if (ui.threePieceToggle) ui.threePieceToggle.checked = false;

      peerConnection.initializePeerAsJoiner(roomId, stopAnyGameInProgressAndResetUI);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      gameLogic.init();
      if (ui.sideMenu && !ui.sideMenu.classList.contains('open') &&
          ! (state.pvpRemoteActive && !state.gamePaired && state.iAmPlayer1InRemote) ) {
        // ui.toggleMenu(); // Decided against auto-opening menu for now
      }
    }
  }

  checkUrlForRoomAndJoin(); // Or call gameLogic.init() directly if no deep-linking for now
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