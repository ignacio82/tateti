// gameLogic.js
// ─────────────────────────────────────────────────────────────────────────────
// Core mechanics for both Classic and “3 Piezas” variants of Ta-Te-Ti Deluxe
// ─────────────────────────────────────────────────────────────────────────────

import * as state   from './state.js';
import * as ui      from './ui.js';
import * as player  from './player.js';
import * as sound   from './sound.js';
import { calculateBestMove,
         cpuMove, // This will be used via cpuMoveHandler
         cpuMoveThreePiece, // This will be used via cpuMoveHandler
         calculateBestSlideForHint } from './cpu.js';

/* ╭──────────────────────────────────────────────────────────╮
   │ 1. Delegates that game.js can override                  │
   ╰──────────────────────────────────────────────────────────╯ */
let cpuMoveHandler = () => console.warn('cpuMoveHandler not set');
export const setCpuMoveHandler = h => (cpuMoveHandler = h);

let _updateScoreboardHandler = () => ui.updateScoreboard();
export const setUpdateScoreboardHandler = h => (_updateScoreboardHandler = h);
const updateScoreboardHandler = () => _updateScoreboardHandler();

let _updateAllUITogglesHandler = () => ui.updateAllUIToggleButtons();
export const setUpdateAllUITogglesHandler = h => (_updateAllUITogglesHandler = h);
export const updateAllUITogglesHandler = () => _updateAllUITogglesHandler();

/* ╭──────────────────────────────────────────────────────────╮
   │ 2. Utility helpers                                      │
   ╰──────────────────────────────────────────────────────────╯ */
export function showEasyModeHint() {
  ui.clearSuggestedMoveHighlight();

  if (
    state.vsCPU &&
    state.difficulty === 'easy' &&
    state.currentPlayer === state.gameP1Icon && // Hint for human player
    state.gameActive
  ) {
    const humanIcon = state.gameP1Icon;
    const cpuIcon   = state.gameP2Icon;

    if (state.gameVariant === state.GAME_VARIANTS.CLASSIC) {
      const idx = calculateBestMove(state.board, humanIcon, cpuIcon, 'hint');
      if (idx != null && idx !== -1 && state.board[idx] === null) {
        ui.highlightSuggestedMove(idx);
      }
    } else if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
      if (state.gamePhase === state.GAME_PHASES.PLACING) {
        const idx = calculateBestMove(state.board, humanIcon, cpuIcon, 'hint');
        if (idx != null && idx !== -1 && state.board[idx] === null) {
          ui.highlightSuggestedMove(idx);
        }
      } else if (state.gamePhase === state.GAME_PHASES.MOVING) {
        const bestSlide = calculateBestSlideForHint(state.board, humanIcon, cpuIcon);
        if (bestSlide) {
          // If no piece is selected, hint which piece to select
          if (state.selectedPieceIndex === null) {
            if (state.board[bestSlide.from] === humanIcon) {
              ui.highlightSuggestedMove(bestSlide.from);
            }
          } else if (state.selectedPieceIndex === bestSlide.from) {
            // If the best 'from' piece is selected, hint where to move it
            if (state.board[bestSlide.to] === null) {
              ui.highlightSuggestedMove(bestSlide.to);
            }
          }
        }
      }
    }
  }
}

export const checkWin = (sym, board = state.board) => {
  const wins = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];
  return wins.find(combo => combo.every(i => board[i] === sym)) || null;
};

export const areCellsAdjacent = (a, b) => {
  const r1 = Math.floor(a / 3), c1 = a % 3;
  const r2 = Math.floor(b / 3), c2 = b % 3;
  const dr = Math.abs(r1 - r2), dc = Math.abs(c1 - c2);
  return dr <= 1 && dc <= 1 && (dr + dc > 0); // Ensure they are different cells
};

export function hasValidMoves(sym, board) {
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== sym) continue;
    for (let j = 0; j < board.length; j++) {
      if (i === j) continue; // Cannot move to the same cell
      if (board[j] === null && areCellsAdjacent(i, j)) {
        return true; // Found at least one valid move
      }
    }
  }
  return false; // No valid moves found
}

/* ╭──────────────────────────────────────────────────────────╮
   │ 3. Draw detection                                       │
   ╰──────────────────────────────────────────────────────────╯ */
export function checkDraw(board = state.board) {
  if (!state.gameActive) return false;

  // For "3 Piezas" in MOVING phase, draw if no player can make a valid move
  if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE &&
      state.gamePhase === state.GAME_PHASES.MOVING) {
    const p1CanMove = hasValidMoves(state.gameP1Icon, board);
    const p2CanMove = hasValidMoves(state.gameP2Icon, board);
    return (
      !checkWin(state.gameP1Icon, board) && // No winner P1
      !checkWin(state.gameP2Icon, board) && // No winner P2
      !p1CanMove && !p2CanMove               // Neither player can move
    );
  }

  // For Classic mode (or 3 Piezas in PLACING if board gets full before phase change, though unlikely)
  // Draw if all cells are full and there's no winner
  return (
    board.every(c => c !== null) &&
    !checkWin(state.gameP1Icon, board) &&
    !checkWin(state.gameP2Icon, board)
  );
}

/* ╭──────────────────────────────────────────────────────────╮
   │ 4. Turn switch & status prompts                         │
   ╰──────────────────────────────────────────────────────────╯ */
export function switchPlayer() {
  state.setCurrentPlayer(
    state.currentPlayer === state.gameP1Icon ? state.gameP2Icon : state.gameP1Icon
  );
  state.setSelectedPieceIndex(null); // Clear selected piece when turn switches
  ui.clearSelectedPieceHighlight();

  if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE &&
      state.gamePhase === state.GAME_PHASES.MOVING) {
    ui.updateStatus(
      `${player.getPlayerName(state.currentPlayer)}: Selecciona tu pieza para mover.`
    );
    if (checkDraw(state.board)) { endDraw(); return; } // Check for draw after switching to player who might be stuck
  } else if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE &&
             state.gamePhase === state.GAME_PHASES.PLACING) {
    const placed = state.board.filter(s => s === state.currentPlayer).length;
    ui.updateStatus(
      `${player.getPlayerName(state.currentPlayer)}: Coloca tu pieza (${placed + 1}/3).`
    );
  } else { // Classic mode
    ui.updateStatus(`Turno del ${player.getPlayerName(state.currentPlayer)}`);
  }

  showEasyModeHint(); // Show hint for the new current player if applicable
}

/* ╭──────────────────────────────────────────────────────────╮
   │ 5. Game initialisation / reset                          │
   ╰──────────────────────────────────────────────────────────╯ */
export function init() {
  ui.removeConfetti();
  ui.hideOverlay();
  ui.hideQRCode();
  ui.clearBoardUI();
  state.resetGameFlowState(); // Resets gamePhase to PLACING among other things

  // ▶ REMOTE-TEARDOWN SAFEGUARD (ensure no active peer session if not in remote mode)
  // Check if hostGameBtn or an equivalent for joiner (e.g., direct URL join implied state) is active
  // This part might need refinement based on how joiner state is explicitly tracked in UI buttons
  const hostActive = ui.hostGameBtn?.classList.contains('active');
  // const joinActive = ... ; // If there was a joinGameBtn or similar indicator
  if (state.pvpRemoteActive && !state.gamePaired && !hostActive /* && !joinActive */) {
    if (window.peerJsMultiplayer?.close) {
      window.peerJsMultiplayer.close();
    }
    state.setPvpRemoteActive(false); // Reset remote state flags
    state.setGamePaired(false);
    // No need to call state.resetRemoteState() here if the above suffices
  }

  state.setBoard(Array(9).fill(null));
  state.setGameActive(false); // Set game to not active initially
  player.determineEffectiveIcons(); // Determine icons based on current settings

  // ─────────────────────────────────────────────────────────
  //   REMOTE MODE HANDLING
  // ─────────────────────────────────────────────────────────
  if (state.pvpRemoteActive && state.gamePaired) {
    state.setCurrentPlayer(state.gameP1Icon); // Host (P1 on board) usually starts
    state.setIsMyTurnInRemote(
      state.currentPlayer === state.myEffectiveIcon
    );
    ui.updateStatus(
      state.isMyTurnInRemote
        ? `Tu Turno ${player.getPlayerName(state.currentPlayer)}`
        : `Esperando a ${player.getPlayerName(state.currentPlayer)}...`
    );
    ui.setBoardClickable(state.isMyTurnInRemote);
    state.setGameActive(true); // Game becomes active
  } else if (state.pvpRemoteActive && !state.gamePaired) {
    // Waiting for a connection, board should not be clickable
    ui.setBoardClickable(false);
    state.setGameActive(false); // Game is not active yet
    // Status is usually handled by peerConnection.js (e.g., "Share link...")
  } else {
    // ─────────────────────────────────────────────────────────
    //   LOCAL / CPU MODE HANDLING
    // ─────────────────────────────────────────────────────────
    state.setGameActive(true); // Game is active
    let startPlayer = state.gameP1Icon; // Default start player
    if (state.whoGoesFirstSetting === 'random') {
      startPlayer = Math.random() < 0.5 ? state.gameP1Icon : state.gameP2Icon;
    } else if (
      state.whoGoesFirstSetting === 'loser' &&
      state.previousGameExists &&
      state.lastWinner !== null // Ensure there was a last winner
    ) {
      startPlayer =
        state.lastWinner === state.gameP1Icon // If P1 won last
          ? state.gameP2Icon                  // P2 starts
          : state.gameP1Icon;                 // Else P1 starts (P2 won or it was a draw and P1 is default)
    } else if (state.whoGoesFirstSetting === 'loser' && state.previousGameExists && state.lastWinner === null) {
      // If last game was a draw and "loser starts", P1 (default) starts
      startPlayer = state.gameP1Icon;
    }
    state.setCurrentPlayer(startPlayer);

    // Set initial status based on game variant and phase (which is PLACING here)
    if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
      // gamePhase is already PLACING due to resetGameFlowState
      const placedCount = state.board.filter(
        s => s === startPlayer
      ).length; // Should be 0
      ui.updateStatus(
        `${player.getPlayerName(startPlayer)}: Coloca tu pieza (${placedCount + 1}/3).`
      );
    } else { // Classic mode
      ui.updateStatus(`Turno del ${player.getPlayerName(startPlayer)}`);
    }

    if (state.vsCPU && state.currentPlayer === state.gameP2Icon) { // If CPU (P2) starts
      ui.setBoardClickable(false);
      setTimeout(async () => {
        if (state.gameActive) await cpuMoveHandler(); // cpuMoveHandler decides classic or 3-piece CPU
      }, 700 + Math.random() * 300);
    } else { // Human player starts
      ui.setBoardClickable(true);
      showEasyModeHint();
    }
  }

  updateAllUITogglesHandler(); // Sync UI buttons with current state
  updateScoreboardHandler();   // Update scoreboard

  // Play reset sound if game is active and not in a pre-pairing remote state
  if (
    state.gameActive &&
    !(state.pvpRemoteActive && !state.gamePaired && state.iAmPlayer1InRemote)
  ) {
    if (sound.getAudioContext()?.state === 'running') {
      sound.playSound('reset');
    }
  }

  // Close side menu if it's open and not in a host-waiting state
  if (
    ui.sideMenu?.classList.contains('open') &&
    !(state.pvpRemoteActive && !state.gamePaired && state.iAmPlayer1InRemote)
  ) {
    ui.sideMenu.classList.remove('open');
  }
}

/* ╭──────────────────────────────────────────────────────────╮
   │ 6. Placement phase (Classic + 3-Piezas PLACING)         │
   ╰──────────────────────────────────────────────────────────╯ */
export function makeMove(idx, sym) {
  if (state.board[idx] != null || !state.gameActive) return false;
  
  // Placement logic for THREE_PIECE variant (prevent placing more than MAX_PIECES)
  if (
    state.gameVariant === state.GAME_VARIANTS.THREE_PIECE &&
    state.gamePhase === state.GAME_PHASES.PLACING
  ) {
    const tokensOnBoardBySymbol = state.board.filter(s => s === sym).length;
    if (tokensOnBoardBySymbol >= state.MAX_PIECES_PER_PLAYER) {
        // console.warn(`Player ${sym} trying to place more than ${state.MAX_PIECES_PER_PLAYER} pieces.`);
        return false; // Prevent placing more than allowed pieces
    }
  }

  const newBoard = [...state.board];
  newBoard[idx] = sym;
  state.setBoard(newBoard);
  ui.updateCellUI(idx, sym);
  sound.playSound('move');

  const winCombo = checkWin(sym, newBoard);
  if (winCombo) { endGame(sym, winCombo); return true; }

  // Check for phase transition in THREE_PIECE mode
  if (
    state.gameVariant === state.GAME_VARIANTS.THREE_PIECE &&
    state.gamePhase === state.GAME_PHASES.PLACING // Only transition if currently in PLACING phase
  ) {
    // MODIFIED/NEW ROBUST WAY: Check total pieces on board to transition phase
    const totalPiecesOnBoard = newBoard.filter(piece => piece !== null).length;

    if (totalPiecesOnBoard === state.MAX_PIECES_PER_PLAYER * 2) { // e.g., 3 * 2 = 6 pieces
      state.setGamePhase(state.GAME_PHASES.MOVING);
      // The status update for entering moving phase will be handled by switchPlayer
    }
  } else if (checkDraw(newBoard)) { // For classic mode, or if not transitioning phase in 3-piece
    endDraw();
    return true;
  }

  switchPlayer(); // This will update status based on the new (or old) gamePhase
  updateAllUITogglesHandler();

  if (state.vsCPU && state.currentPlayer === state.gameP2Icon && state.gameActive) {
    ui.setBoardClickable(false);
    setTimeout(async () => { if (state.gameActive) await cpuMoveHandler(); }, 700 + Math.random() * 300);
  } else if (state.gameActive && state.currentPlayer === state.gameP1Icon) { // Human player's turn (local or remote)
    ui.setBoardClickable(true);
    showEasyModeHint();
  }

  return true;
}


/* ╭──────────────────────────────────────────────────────────╮
   │ 7. Moving phase (3-Piezas MOVING)                       │
   ╰──────────────────────────────────────────────────────────╯ */
export function movePiece(fromIdx, toIdx, sym) {
  if (
    !state.gameActive ||
    state.gameVariant !== state.GAME_VARIANTS.THREE_PIECE ||
    state.gamePhase !== state.GAME_PHASES.MOVING
  ) return false;

  if (state.board[fromIdx] !== sym || state.board[toIdx] !== null) return false;
  if (!areCellsAdjacent(fromIdx, toIdx)) {
    // Status update for invalid move is usually handled by the caller (eventListeners.js)
    // to keep UI interaction logic there.
    // ui.updateStatus(`${player.getPlayerName(sym)}: Inválido. Mueve adyacente.`);
    // state.setSelectedPieceIndex(null); // Caller should manage selection state on failed UI attempt
    // ui.clearSelectedPieceHighlight();
    // showEasyModeHint(); // Caller can decide to show hint again
    return false;
  }

  const newBoard = [...state.board];
  newBoard[toIdx]   = sym;
  newBoard[fromIdx] = null;
  state.setBoard(newBoard);
  ui.updateCellUI(toIdx, sym);
  ui.updateCellUI(fromIdx, null); // Make old cell appear empty
  sound.playSound('move');
  state.setSelectedPieceIndex(null); // Piece has been moved, so no piece is "selected to move"
  ui.clearSelectedPieceHighlight();  // Clear visual selection

  const winCombo = checkWin(sym, newBoard);
  if (winCombo) { endGame(sym, winCombo); return true; }
  if (checkDraw(newBoard)) { endDraw(); return true; } // Check for draw after a successful move

  switchPlayer(); // Updates status for the next player
  updateAllUITogglesHandler();

  if (state.vsCPU && state.currentPlayer === state.gameP2Icon && state.gameActive) {
    ui.setBoardClickable(false);
    setTimeout(async () => { if (state.gameActive) await cpuMoveHandler(); }, 700 + Math.random() * 300);
  } else if (state.gameActive && state.currentPlayer === state.gameP1Icon) { // Human player's turn
    ui.setBoardClickable(true);
    showEasyModeHint();
  }

  return true;
}

/* ╭──────────────────────────────────────────────────────────╮
   │ 8. Game-over helpers                                    │
   ╰──────────────────────────────────────────────────────────╯ */
export function endGame(winnerSym, winningCells) {
  state.setGameActive(false);
  state.setGamePhase(state.GAME_PHASES.GAME_OVER); // Set phase to game over
  ui.setBoardClickable(false);
  ui.clearSuggestedMoveHighlight();
  ui.clearSelectedPieceHighlight(); // Ensure no piece selection artifacts
  ui.launchConfetti();
  ui.highlightWinner(winningCells);
  sound.playSound('win');
  ui.updateStatus(`${player.getPlayerName(winnerSym)} GANA!`);

  state.setLastWinner(winnerSym);
  state.setPreviousGameExists(true);

  if (state.pvpRemoteActive || state.vsCPU) { // For remote or CPU games
    if (winnerSym === state.myEffectiveIcon) state.incrementMyWins();
    else state.incrementOpponentWins();
  } else { // For local PvP
    if (winnerSym === state.gameP1Icon) state.incrementMyWins(); // P1 on board is 'my' score
    else state.incrementOpponentWins(); // P2 on board is 'opponent' score
  }

  localStorage.setItem('myWinsTateti', state.myWins.toString());
  localStorage.setItem('opponentWinsTateti', state.opponentWins.toString());
  updateScoreboardHandler();

  setTimeout(init, state.AUTO_RESTART_DELAY_WIN); // Auto-restart game
}

export function endDraw() {
  state.setGameActive(false);
  state.setGamePhase(state.GAME_PHASES.GAME_OVER); // Set phase to game over
  ui.setBoardClickable(false);
  ui.clearSuggestedMoveHighlight();
  ui.clearSelectedPieceHighlight();
  ui.playDrawAnimation();
  sound.playSound('draw');
  ui.updateStatus('¡EMPATE!');

  state.incrementDraws();
  state.setLastWinner(null); // No winner in a draw
  state.setPreviousGameExists(true);
  localStorage.setItem('drawsTateti', state.draws.toString());
  updateScoreboardHandler();

  setTimeout(init, state.AUTO_RESTART_DELAY_DRAW); // Auto-restart game
}