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
//  would skip the human turn and lock the board (the bug you just hit).
// -----------------------------------------------------------------------------

import * as state     from './state.js';
import * as gameLogic from './gameLogic.js';
import * as ui        from './ui.js';

/* ─────────────────────── helpers ──────────────────────────── */

const WIN_LINES = gameLogic.WINNING_COMBINATIONS ?? [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],      // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8],      // cols
  [0, 4, 8], [2, 4, 6]                  // diags
];

const delay = ms => new Promise(r => setTimeout(r, ms));

function emptySquares(board) {
  const out = [];
  board.forEach((v, i) => { if (v === null) out.push(i); });
  return out;
}

function randomMove(board) {
  const empties = emptySquares(board);
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
  const winner = gameLogic.getWinner?.(board);  // optional helper in gameLogic
  if (winner === cpuIcon)  return { score:  10 - depth };
  if (winner === humanIcon) return { score: -10 + depth };
  if (emptySquares(board).length === 0) return { score: 0 };

  const compare = isMax ? Math.max : Math.min;
  let bestScore = isMax ? -Infinity : Infinity;
  let bestIndex = -1;

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
  cpuIcon    = state.gameCpuIcon,
  humanIcon  = state.gameP1Icon,
  difficulty = state.cpuDifficulty        // "easy" | "normal" | "hard"
) {
  if (difficulty === 'easy') {
    return randomMove(board);
  }

  if (difficulty === 'normal') {
    // 1) win if you can, 2) block if opponent can, 3) random
    const win  = findTwoInARow(board, cpuIcon);
    if (win !== -1) return win;
    const block = findTwoInARow(board, humanIcon);
    if (block !== -1) return block;
    return randomMove(board);
  }

  // hard → minimax
  const { index } = minimax([...board], 0, true, cpuIcon, humanIcon);
  return index;
}

/* ───────────────────────── AI turn ─────────────────────────── */

export async function cpuMakeMove() {
  if (!state.gameActive) return;

  ui.setBoardClickable(false);                // freeze board while thinking
  await delay(250);                           // little pause for UX

  const moveIndex = calculateBestMove();
  const moved     = gameLogic.makeMove(moveIndex, state.gameCpuIcon);

  // Fallback guard (should never trigger, but keeps things robust)
  if (!moved) {
    const fallback = randomMove(state.board);
    gameLogic.makeMove(fallback, state.gameCpuIcon);
  }

  // If the game is still running it’s now the human’s turn.
  if (state.gameActive && state.currentPlayer === state.gameP1Icon) {
    ui.setBoardClickable(true);
    ui.updateStatus(`Turno del ${state.player1Name ?? 'Jugador 1'}`);
  }
}
