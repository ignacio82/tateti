// cpu.js
// -----------------------------------------------------------------------------
// CPU (AI) logic for Ta-Te-Ti Deluxe
// -----------------------------------------------------------------------------
//  * Supports three difficulty levels: “easy”, “normal”, “hard”.
//  * Exports:
//      - calculateBestMove(board?, cpuIcon?, humanIcon?, difficulty?)
//      - cpuMakeMove()              ← call this when it’s the CPU’s turn
//
//  NOTE: gameLogic.makeMove() already flips the player turn, checks win/draw
//  and updates state.  DO **NOT** call gameLogic.switchPlayer() here—doing so
//  would skip the human turn and lock the board.
// -----------------------------------------------------------------------------

import * as state     from './state.js';
import * as gameLogic from './gameLogic.js';
import * as ui        from './ui.js';
import * as player    from './player.js'; // Added import for player module

/* ─────────────────────── helpers ──────────────────────────── */

const WIN_LINES = gameLogic.WINNING_COMBINATIONS ?? [ // WINNING_COMBINATIONS is not exported by gameLogic.js, checkWin uses its own.
  [0, 1, 2], [3, 4, 5], [6, 7, 8],      // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8],      // cols
  [0, 4, 8], [2, 4, 6]                  // diags
]; // This WIN_LINES is a local copy, gameLogic.checkWin has its own. This is fine.

const delay = ms => new Promise(r => setTimeout(r, ms));

function emptySquares(board) {
  const out = [];
  board.forEach((v, i) => { if (v === null) out.push(i); });
  return out;
}

function randomMove(board) {
  const empties = emptySquares(board);
  if (empties.length === 0) return -1; // No empty squares
  return empties[Math.floor(Math.random() * empties.length)];
}

function findTwoInARow(board, icon) {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    const trio = [board[a], board[b], board[c]];
    if (trio.filter(v => v === icon).length === 2 &&
        trio.includes(null)) {
      return line[trio.indexOf(null)];
    }
  }
  return -1;
}

/* ─────────────────────── minimax (hard) ───────────────────── */

function minimax(board, depth, isMax, cpuIcon, humanIcon) {
  // Using gameLogic.checkWin which is robust.
  // checkWin returns the winning combo array or null.
  // We need to see if current board state is a win for cpuIcon or humanIcon.
  if (gameLogic.checkWin(cpuIcon, board))  return { score:  10 - depth };
  if (gameLogic.checkWin(humanIcon, board)) return { score: -10 + depth };
  if (emptySquares(board).length === 0) return { score: 0 };

  const compare = isMax ? Math.max : Math.min;
  let bestScore = isMax ? -Infinity : Infinity;
  let bestIndex = -1; // Default bestIndex to -1 to indicate no move found yet

  for (const idx of emptySquares(board)) {
    board[idx] = isMax ? cpuIcon : humanIcon;
    const { score } = minimax(board, depth + 1, !isMax, cpuIcon, humanIcon);
    board[idx] = null;

    if (compare(score, bestScore) === score) {
      bestScore = score;
      bestIndex = idx;
    }
  }
  return { score: bestScore, index: bestIndex };
}

/* ─────────────────── main decision function ───────────────── */

export function calculateBestMove(
  board      = state.board,
  cpuIcon    = state.gameP2Icon,     // CORRECTED: Default to gameP2Icon for CPU
  humanIcon  = state.gameP1Icon,     // Default to gameP1Icon for Human
  difficulty = state.difficulty      // CORRECTED: Use state.difficulty
) {
  if (!cpuIcon || !humanIcon) {
      console.error("CPU or Human icon is undefined in calculateBestMove. CPU will make a random move.", { cpuIcon, humanIcon });
      return randomMove(board);
  }
  if (emptySquares(board).length === 0) {
    console.warn("calculateBestMove called on a full board.");
    return -1; // No moves possible
  }

  if (difficulty === 'easy') {
    return randomMove(board);
  }

  if (difficulty === 'normal') {
    const winMove  = findTwoInARow(board, cpuIcon);
    if (winMove !== -1) return winMove;
    const blockMove = findTwoInARow(board, humanIcon);
    if (blockMove !== -1) return blockMove;
    return randomMove(board);
  }

  // hard → minimax
  const { index } = minimax([...board], 0, true, cpuIcon, humanIcon);
  // If minimax returns -1 (e.g., no valid moves or error), fall back to random
  return index !== -1 ? index : randomMove(board);
}

/* ───────────────────────── AI turn ─────────────────────────── */

export async function cpuMakeMove() {
  if (!state.gameActive) return;

  ui.setBoardClickable(false);
  await delay(250 + Math.random() * 250); // Little pause for UX, slight variance

  const cpuPlayerIcon = state.gameP2Icon;    // CPU is Player 2
  const humanPlayerIcon = state.gameP1Icon;  // Human is Player 1

  if (!cpuPlayerIcon) {
      console.error("CPU icon (gameP2Icon) is undefined. CPU cannot move.");
      // If CPU can't move, and it's supposed to be its turn, give turn back to human if game active.
      if (state.gameActive && state.currentPlayer === cpuPlayerIcon) { // This check might be tricky if currentPlayer was already switched
          state.setCurrentPlayer(humanPlayerIcon); // Try to revert to human
          ui.updateStatus(`Error con CPU. Turno del ${player.getPlayerName(humanPlayerIcon)}`);
          ui.setBoardClickable(true);
      }
      return;
  }
  if (emptySquares(state.board).length === 0 && state.gameActive) {
    console.warn("cpuMakeMove called but board is full and game is somehow active.");
    // Game should have ended in a draw or win before this.
    // For safety, do nothing if board is full. gameLogic.makeMove would also fail.
    return;
  }


  const moveIndex = calculateBestMove(state.board, cpuPlayerIcon, humanPlayerIcon, state.difficulty);

  if (moveIndex === -1 && state.gameActive) { // No valid move found by calculateBestMove (e.g. full board)
    console.warn("CPU calculateBestMove returned -1. Board might be full or issue in logic.");
    // This situation ideally shouldn't happen if game ends correctly.
    // If it's still CPU's turn, and board isn't full, try one last random.
    if (emptySquares(state.board).length > 0) {
        const fallback = randomMove(state.board);
        if (fallback !== -1) gameLogic.makeMove(fallback, cpuPlayerIcon);
    }
    // If game still active and current player is human, make board clickable.
    // This is handled by the block below.
  } else if (state.gameActive) {
    gameLogic.makeMove(moveIndex, cpuPlayerIcon); // gameLogic.makeMove will call switchPlayer
  }


  // After gameLogic.makeMove (which calls switchPlayer), currentPlayer should be the human.
  if (state.gameActive && state.currentPlayer === humanPlayerIcon) {
    ui.setBoardClickable(true);
    ui.updateStatus(`Turno del ${player.getPlayerName(humanPlayerIcon)}`); // CORRECTED
    gameLogic.showEasyModeHint?.(); // Call showEasyModeHint if it exists, for the human's turn
  } else if (state.gameActive && state.currentPlayer === cpuPlayerIcon) {
    // This means the turn did not switch back to human, or game ended on CPU's turn.
    // If game is active and it's still CPU's turn, something is wrong or game should have ended.
    // Board should remain unclickable for human.
    ui.setBoardClickable(false);
    console.warn("CPU's turn did not switch back to human as expected or game ended.");
  }
  // If !state.gameActive, game ended (win/draw by CPU), so no need to set board clickable.
}