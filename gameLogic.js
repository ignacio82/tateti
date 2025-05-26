// gameLogic.js
// ─────────────────────────────────────────────────────────────────────────────
// Core mechanics for both Classic and “3 Piezas” variants of Ta-Te-Ti
// ─────────────────────────────────────────────────────────────────────────────

import * as state  from './state.js';
import * as ui     from './ui.js';
import * as player from './player.js';
import * as sound  from './sound.js';
import { calculateBestMove } from './cpu.js';

/* ╭──────────────────────────────────────────────────────────╮
   │ 1.  Delegates that game.js can override                  │
   ╰──────────────────────────────────────────────────────────╯ */
let cpuMoveHandler = () => console.warn('cpuMoveHandler not set');
export const setCpuMoveHandler = h => (cpuMoveHandler = h);

let _updateScoreboardHandler = () => ui.updateScoreboard();
export const setUpdateScoreboardHandler = h => (_updateScoreboardHandler = h);
const updateScoreboardHandler = () => _updateScoreboardHandler?.();

let _updateAllUITogglesHandler = () => ui.updateAllUIToggleButtons();
export const setUpdateAllUITogglesHandler = h => (_updateAllUITogglesHandler = h);
// Corrected line: Added export
export const updateAllUITogglesHandler = () => _updateAllUITogglesHandler?.();

/* ╭──────────────────────────────────────────────────────────╮
   │ 2.  Utility helpers                                      │
   ╰──────────────────────────────────────────────────────────╯ */
function showEasyModeHint() {
  if (
    state.gameVariant === state.GAME_VARIANTS.CLASSIC &&
    state.vsCPU &&
    state.difficulty === 'easy' &&
    state.currentPlayer === state.gameP1Icon &&
    state.gameActive
  ) {
    const idx = calculateBestMove(
      state.board,
      state.gameP1Icon,
      state.gameP2Icon,
      state.difficulty
    );
    if (idx !== null) ui.highlightSuggestedMove(idx);
  } else ui.clearSuggestedMoveHighlight();
}

export const checkWin = (sym, board = state.board) => {
  const wins = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
    [0, 4, 8], [2, 4, 6]             // diags
  ];
  return wins.find(combo => combo.every(i => board[i] === sym)) || null;
};

const areCellsAdjacent = (a, b) => {
  const r1 = ~~(a / 3), c1 = a % 3,
        r2 = ~~(b / 3), c2 = b % 3;
  const dr = Math.abs(r1 - r2), dc = Math.abs(c1 - c2);
  return dr <= 1 && dc <= 1 && dr + dc > 0;
};

function hasValidMoves(sym, board) {
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== sym) continue;
    for (let j = 0; j < board.length; j++) {
      if (i === j) continue;
      if (board[j] === null && areCellsAdjacent(i, j)) return true;
    }
  }
  return false;
}

/* ╭──────────────────────────────────────────────────────────╮
   │ 3.  Draw detection                                       │
   ╰──────────────────────────────────────────────────────────╯ */
export function checkDraw(board = state.board) {
  if (!state.gameActive) return false;

  if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
    if (state.gamePhase === state.GAME_PHASES.MOVING) {
      return !checkWin(state.currentPlayer, board) &&
             !hasValidMoves(state.currentPlayer, board);
    }
    return false; // cannot draw while still placing pieces
  }

  // Classic
  return (
    board.every(c => c !== null) &&
    !checkWin(state.gameP1Icon, board) &&
    !checkWin(state.gameP2Icon, board)
  );
}

/* ╭──────────────────────────────────────────────────────────╮
   │ 4.  Turn switch & status prompts                         │
   ╰──────────────────────────────────────────────────────────╯ */
export function switchPlayer() {
  state.setCurrentPlayer(
    state.currentPlayer === state.gameP1Icon ? state.gameP2Icon : state.gameP1Icon
  );
  state.setSelectedPieceIndex(null);
  ui.clearSelectedPieceHighlight();

  if (
    state.gameVariant === state.GAME_VARIANTS.THREE_PIECE &&
    state.gamePhase === state.GAME_PHASES.MOVING
  ) {
    ui.updateStatus(
      `${player.getPlayerName(state.currentPlayer)}: Selecciona tu pieza para mover.`
    );
    if (checkDraw(state.board)) {
      endDraw();
      return;
    }
  } else if (
    state.gameVariant === state.GAME_VARIANTS.THREE_PIECE &&
    state.gamePhase === state.GAME_PHASES.PLACING
  ) {
    const placed = state.board.filter(s => s === state.currentPlayer).length;
    ui.updateStatus(
      `${player.getPlayerName(state.currentPlayer)}: Coloca tu pieza (${placed + 1}/3).`
    );
  } else {
    ui.updateStatus(`Turno del ${player.getPlayerName(state.currentPlayer)}`);
  }

  showEasyModeHint();
}

/* ╭──────────────────────────────────────────────────────────╮
   │ 5.  Game initialisation / reset                          │
   ╰──────────────────────────────────────────────────────────╯ */
export function init() {
  ui.removeConfetti(); ui.hideOverlay(); ui.hideQRCode();
  ui.clearBoardUI();
  state.resetGameFlowState();

  // Close peer connection if leaving remote mode
  const hostActive = ui.hostGameBtn?.classList.contains('active');
  const joinActive = ui.joinGameBtn?.classList.contains('active');
  if (!hostActive && !joinActive) {
    if (state.pvpRemoteActive && window.peerJsMultiplayer?.close)
      window.peerJsMultiplayer.close();
    state.setPvpRemoteActive(false);
    state.setGamePaired(false);
  }

  state.setBoard(Array(9).fill(null));
  state.setGameActive(false);
  player.determineEffectiveIcons();

  /* ── reset counters for 3-Piezas ── */
  if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
    // state.resetPlayerPiecesOnBoard() called in state.resetGameFlowState() should handle this.
    // If explicit initialization to 0 for gameP1Icon and gameP2Icon is needed after that,
    // ensure state.gameP1Icon and state.gameP2Icon are determined before this point
    // or that resetPlayerPiecesOnBoard correctly sets up for these players.
    // The original code had:
    // state.setPlayerPiecesOnBoard(state.gameP1Icon, 0);
    // state.setPlayerPiecesOnBoard(state.gameP2Icon, 0);
    // This is generally fine if player.determineEffectiveIcons() has set gameP1Icon and gameP2Icon.
  }

  /* ── MODE A: remote play & paired ── */
  if (state.pvpRemoteActive && state.gamePaired) {
    state.setCurrentPlayer(state.gameP1Icon);
    state.setIsMyTurnInRemote(state.currentPlayer === state.myEffectiveIcon);
    ui.updateStatus(
      state.isMyTurnInRemote
        ? `Tu Turno ${player.getPlayerName(state.currentPlayer)}`
        : `Esperando a ${player.getPlayerName(state.currentPlayer)}...`
    );
    ui.setBoardClickable(state.isMyTurnInRemote);
    state.setGameActive(true);
  }
  /* ── MODE B: remote but waiting pair ── */
  else if (state.pvpRemoteActive && !state.gamePaired) {
    ui.setBoardClickable(false);
    state.setGameActive(false);
  }
  /* ── MODE C: local or vs-CPU ── */
  else {
    state.setGameActive(true);

    // choose starting player
    let start = state.gameP1Icon;
    if (state.whoGoesFirstSetting === 'random') {
      start = Math.random() < 0.5 ? state.gameP1Icon : state.gameP2Icon;
    } else if (
      state.whoGoesFirstSetting === 'loser' &&
      state.previousGameExists &&
      state.lastWinner !== null
    ) {
      start = state.lastWinner === state.gameP1Icon ? state.gameP2Icon : state.gameP1Icon;
    }
    state.setCurrentPlayer(start);

    if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
      state.setGamePhase(state.GAME_PHASES.PLACING);
      const placed = state.board.filter(s => s === start).length;
      ui.updateStatus(
        `${player.getPlayerName(start)}: Coloca tu pieza (${placed + 1}/3).`
      );
    } else {
      ui.updateStatus(`Turno del ${player.getPlayerName(start)}`);
    }

    /* CPU auto-move if CPU starts classic */
    if (
      state.vsCPU &&
      state.gameVariant === state.GAME_VARIANTS.CLASSIC &&
      state.currentPlayer === state.gameP2Icon
    ) {
      ui.setBoardClickable(false);
      ui.clearSuggestedMoveHighlight();
      setTimeout(() => {
        if (state.gameActive) cpuMoveHandler();
        if (state.gameActive && state.currentPlayer === state.gameP1Icon)
          ui.setBoardClickable(true);
      }, 700 + Math.random() * 300);
    } else {
      ui.setBoardClickable(true);
      showEasyModeHint();
    }
  }

  updateAllUITogglesHandler();
  updateScoreboardHandler();

  // reset sound
  if (state.gameActive && !(state.pvpRemoteActive && !state.gamePaired)) {
    if (sound.getAudioContext()?.state === 'running') sound.playSound('reset');
  }

  if (ui.sideMenu?.classList.contains('open')) ui.sideMenu.classList.remove('open');
}

/* ╭──────────────────────────────────────────────────────────╮
   │ 6.  Placement phase (Classic + 3-Piezas PLACING)         │
   ╰──────────────────────────────────────────────────────────╯ */
export function makeMove(idx, sym) {
  if (state.board[idx] !== null || !state.gameActive) return false;

  ui.clearSuggestedMoveHighlight();
  ui.clearSelectedPieceHighlight();

  // ── GUARD: in 3-Piezas placement, limit to 3 tokens already on the board
  if (
    state.gameVariant === state.GAME_VARIANTS.THREE_PIECE &&
    state.gamePhase === state.GAME_PHASES.PLACING
  ) {
    const tokens = state.board.filter(s => s === sym).length;
    if (tokens >= state.MAX_PIECES_PER_PLAYER) { // Using MAX_PIECES_PER_PLAYER from state.js
      ui.updateStatus(
        `${player.getPlayerName(sym)}: Ya tienes 3 piezas. Entra la fase de movimiento.`
      );
      // The user's original code had updateAllUITogglesHandler() here.
      // If it was intended to update UI immediately on this condition, it can be added back.
      // However, returning false and letting the game flow might be cleaner.
      // For now, matching the user's provided structure.
      // updateAllUITogglesHandler(); // As per user's provided file structure for this block.
      return false;
    }
  }

  // place piece
  const newBoard = [...state.board];
  newBoard[idx] = sym;
  state.setBoard(newBoard);
  ui.updateCellUI(idx, sym);
  sound.playSound('move');

  // win / draw check
  const winCombo = checkWin(sym);
  if (winCombo) {
    endGame(sym, winCombo);
    return true;
  }

  // auto-switch to MOVING when both players have 3 pieces
  if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && state.gamePhase === state.GAME_PHASES.PLACING) {
    const p1 = newBoard.filter(s => s === state.gameP1Icon).length;
    const p2 = newBoard.filter(s => s === state.gameP2Icon).length;
    if (p1 === state.MAX_PIECES_PER_PLAYER && p2 === state.MAX_PIECES_PER_PLAYER) {
         state.setGamePhase(state.GAME_PHASES.MOVING);
    }
  } else if (checkDraw(newBoard)) {
    endDraw();
    return true;
  }

  switchPlayer();
  // The user's original code for makeMove had:
  // if (tokens >= 3) { ... updateAllUITogglesHandler(); return false; }
  // ...
  // switchPlayer();
  // updateAllUITogglesHandler(); // keeps CPU button disabled when 3-Piezas is on
  // The call to updateAllUITogglesHandler() inside the "tokens >= 3" block was present in the user's file.
  // I'll ensure the structure matches what they provided.
  // The `updateAllUITogglesHandler()` here seems correctly placed as per the user's original structure.
  if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE &&
      state.gamePhase === state.GAME_PHASES.PLACING &&
      state.board.filter(s => s === sym).length >= state.MAX_PIECES_PER_PLAYER) {
      // This is a bit tricky, because if we returned false above, this won't be hit.
      // Let's look at the original structure:
      // if (tokens >= 3) { ui.updateStatus(...); updateAllUITogglesHandler(); return false; }
      // So, if it returned false, it means the `updateAllUITogglesHandler()` inside that block was the one.
      // The one *after* switchPlayer() in their code is outside that specific "tokens >= 3" return path.
  }
  // Matching the user's structure, they had `updateAllUITogglesHandler()` after `switchPlayer()`.
  updateAllUITogglesHandler(); // keeps CPU button disabled when 3-Piezas is on


  // CPU response (Classic only)
  if (
    state.vsCPU &&
    state.gameVariant === state.GAME_VARIANTS.CLASSIC &&
    state.currentPlayer === state.gameP2Icon &&
    state.gameActive
  ) {
    ui.setBoardClickable(false);
    setTimeout(() => {
      if (state.gameActive) cpuMoveHandler();
      if (state.gameActive && state.currentPlayer === state.gameP1Icon)
        ui.setBoardClickable(true);
    }, 700 + Math.random() * 300);
  }

  return true;
}

/* ╭──────────────────────────────────────────────────────────╮
   │ 7.  Moving phase (3-Piezas MOVING)                       │
   ╰──────────────────────────────────────────────────────────╯ */
export function movePiece(fromIdx, toIdx, sym) {
  if (
    !state.gameActive ||
    state.gameVariant !== state.GAME_VARIANTS.THREE_PIECE ||
    state.gamePhase !== state.GAME_PHASES.MOVING
  )
    return false;

  if (state.board[fromIdx] !== sym || state.board[toIdx] !== null) return false;
  if (!areCellsAdjacent(fromIdx, toIdx)) {
    ui.updateStatus(`${player.getPlayerName(sym)}: Inválido. Mueve a casilla adyacente.`);
    state.setSelectedPieceIndex(null);
    ui.clearSelectedPieceHighlight();
    return false;
  }

  const newBoard = [...state.board];
  newBoard[toIdx] = sym;
  newBoard[fromIdx] = null;
  state.setBoard(newBoard);
  ui.updateCellUI(toIdx, sym);
  ui.updateCellUI(fromIdx, null);
  sound.playSound('move');
  state.setSelectedPieceIndex(null);
  ui.clearSelectedPieceHighlight();

  const winCombo = checkWin(sym);
  if (winCombo) {
    endGame(sym, winCombo);
    return true;
  }

  const nextSym = sym === state.gameP1Icon ? state.gameP2Icon : state.gameP1Icon;
  if (!hasValidMoves(nextSym, newBoard)) { // If opponent has no moves after this move
    endDraw(); // Then it's a draw
    return true;
  }

  switchPlayer();
  return true;
}

/* ╭──────────────────────────────────────────────────────────╮
   │ 8.  Game-over helpers                                    │
   ╰──────────────────────────────────────────────────────────╯ */
export function endGame(winnerSym, winningCells) {
  state.setGameActive(false);
  state.setGamePhase(state.GAME_PHASES.GAME_OVER);
  ui.setBoardClickable(false);
  ui.clearSuggestedMoveHighlight();
  ui.clearSelectedPieceHighlight();
  ui.launchConfetti();
  ui.highlightWinner(winningCells);
  sound.playSound('win');
  ui.updateStatus(`${player.getPlayerName(winnerSym)} GANA!`);

  state.setLastWinner(winnerSym);
  state.setPreviousGameExists(true);

  // stats
  if (state.pvpRemoteActive || state.vsCPU) {
    if (winnerSym === state.myEffectiveIcon) state.incrementMyWins();
    else if (winnerSym === state.opponentEffectiveIcon) state.incrementOpponentWins();
  } else {
    if (winnerSym === state.gameP1Icon) state.incrementMyWins();
    else state.incrementOpponentWins();
  }
  localStorage.setItem('myWinsTateti', state.myWins.toString());
  localStorage.setItem('opponentWinsTateti', state.opponentWins.toString());
  updateScoreboardHandler();

  setTimeout(init, state.AUTO_RESTART_DELAY_WIN);
}

export function endDraw() {
  state.setGameActive(false);
  state.setGamePhase(state.GAME_PHASES.GAME_OVER);
  ui.setBoardClickable(false);
  ui.clearSuggestedMoveHighlight();
  ui.clearSelectedPieceHighlight();
  ui.playDrawAnimation();
  sound.playSound('draw');
  ui.updateStatus('¡EMPATE!');

  state.incrementDraws();
  state.setLastWinner(null);
  state.setPreviousGameExists(true);
  localStorage.setItem('drawsTateti', state.draws.toString());
  updateScoreboardHandler();

  setTimeout(init, state.AUTO_RESTART_DELAY_DRAW);
}