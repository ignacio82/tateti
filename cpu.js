// cpu.js
// -----------------------------------------------------------------------------
// CPU (AI) logic for Ta-Te-Ti Deluxe
// -----------------------------------------------------------------------------
//  * Supports three difficulty levels: “easy”, “normal”, “hard”.
//  * Exports:
//      - calculateBestMove(board?, cpuIcon?, humanIcon?, difficulty?)
//      - cpuMove()                 ← call this when it’s the CPU’s turn
//
//  NOTE: gameLogic.makeMove() already flips the player turn, checks win/draw
//  and updates state.  DO **NOT** call gameLogic.switchPlayer() here—doing so
//  would skip the human turn and lock the board.
// -----------------------------------------------------------------------------

import * as state     from './state.js';
import * as gameLogic from './gameLogic.js';
import * as ui        from './ui.js';
import * as player    from './player.js';

/* ─────────────────────── helpers ──────────────────────────── */

const WIN_LINES = [
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
  if (empties.length === 0) return -1;
  return empties[Math.floor(Math.random() * empties.length)];
}

function findTwoInARow(board, icon) {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    const trio = [board[a], board[b], board[c]];
    if (trio.filter(v => v === icon).length === 2 && trio.includes(null)) {
      return line[trio.indexOf(null)];
    }
  }
  return -1;
}

/* ─────────────────────── minimax (hard) ───────────────────── */

function minimax(board, depth, isMax, cpuIcon, humanIcon) {
  if (gameLogic.checkWin(cpuIcon, board))   return { score:  10 - depth };
  if (gameLogic.checkWin(humanIcon, board)) return { score: -10 + depth };
  if (emptySquares(board).length === 0)     return { score: 0 };

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
  cpuIcon    = state.gameP2Icon,
  humanIcon  = state.gameP1Icon,
  difficulty = state.difficulty
) {
  if (!cpuIcon || !humanIcon) {
    console.error('CPU or human icon undefined', { cpuIcon, humanIcon });
    return randomMove(board);
  }
  if (emptySquares(board).length === 0) return -1;

  switch (difficulty) {
    case 'easy':
      return randomMove(board);

    case 'normal': {
      const win   = findTwoInARow(board, cpuIcon);
      if (win !== -1) return win;
      const block = findTwoInARow(board, humanIcon);
      if (block !== -1) return block;
      return randomMove(board);
    }

    case 'hard':
    default: {
      const { index } = minimax([...board], 0, true, cpuIcon, humanIcon);
      return index !== -1 ? index : randomMove(board);
    }
  }
}

/* ───────────────────────── AI turn ─────────────────────────── */

export async function cpuMove() {
  if (!state.gameActive) return;

  ui.setBoardClickable(false);
  await delay(250 + Math.random() * 250);   // small pause for UX

  const cpuIcon   = state.gameP2Icon;
  const humanIcon = state.gameP1Icon;

  if (!cpuIcon) {
    console.error('CPU icon undefined; aborting move.');
    ui.setBoardClickable(true);
    return;
  }

  const moveIndex = calculateBestMove(state.board, cpuIcon, humanIcon, state.difficulty);

  if (moveIndex !== -1) {
    gameLogic.makeMove(moveIndex, cpuIcon);  // flips turn + checks win/draw
  }

  // If the game is still active and it's now the human's turn, unlock the board.
  if (state.gameActive && state.currentPlayer === humanIcon) {
    ui.setBoardClickable(true);
    ui.updateStatus(`Turno del ${player.getPlayerName(humanIcon)}`);
    gameLogic.showEasyModeHint?.();
  }
}
