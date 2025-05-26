// cpu.js
// -----------------------------------------------------------------------------
// CPU (AI) logic for Ta-Te-Ti Deluxe
// -----------------------------------------------------------------------------
//  * Supports three difficulty levels: “easy”, “normal”, “hard”.
//  * Exports:
//      - calculateBestMove(board?, cpuIcon?, humanIcon?, difficulty?)
//      - cpuMove()                 ← call this when it’s the CPU’s turn (Classic)
//      - cpuMoveThreePiece()       ← call this when it’s the CPU’s turn (3 Piezas)
//      - calculateBestSlideForHint(board, humanIcon, cpuIcon) ← For 3 Piezas hint
//
//  NOTE: gameLogic.makeMove() / gameLogic.movePiece() already flip the player
//  turn, check win/draw and updates state. DO NOT call gameLogic.switchPlayer()
//  here—doing so would skip the human turn and lock the board.
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

/* ───────────────── 3 PIEZAS: helpers ────────────────── */

function enumerateSlides(board, sym) {
  const legalSlides = [];
  for (let i = 0; i < board.length; i++) {
    if (board[i] === sym) {
      for (let j = 0; j < board.length; j++) {
        if (board[j] === null && gameLogic.areCellsAdjacent(i, j)) {
          legalSlides.push({ from: i, to: j });
        }
      }
    }
  }
  return legalSlides;
}

function simulateSlide(board, move, sym) {
  const newBoard = [...board];
  newBoard[move.from] = null;
  newBoard[move.to] = sym;
  return newBoard;
}

function randomSlide(board, sym) {
  const slides = enumerateSlides(board, sym);
  if (slides.length === 0) return null;
  return slides[Math.floor(Math.random() * slides.length)];
}

/* ─────────── 3 PIEZAS: minimax (sliding phase) ──────────── */

function minimaxSlide(board, depth, isMax, playerToOptimizeIcon, otherPlayerIcon, alpha, beta, isForHint = false) {
  // Check for terminal states
  // If it's for a hint, we are optimizing for playerToOptimizeIcon (human)
  // If it's for CPU move, we are optimizing for playerToOptimizeIcon (CPU)
  const winCheckOptimize = gameLogic.checkWin(playerToOptimizeIcon, board);
  const winCheckOther = gameLogic.checkWin(otherPlayerIcon, board);

  if (winCheckOptimize) return { score: 10 - depth };
  if (winCheckOther) return { score: -10 + depth };

  if (depth >= 4) return { score: 0 }; // Depth limit

  const currentPlayerForTurn = isMax ? playerToOptimizeIcon : otherPlayerIcon;
  const legalSlides = enumerateSlides(board, currentPlayerForTurn);
  if (legalSlides.length === 0) return { score: 0 }; // No moves, draw-like state

  let bestMove = null;

  if (isMax) { // Maximizing for playerToOptimizeIcon
    let bestScore = -Infinity;
    for (const move of legalSlides) {
      const newBoard = simulateSlide(board, move, currentPlayerForTurn);
      const { score } = minimaxSlide(newBoard, depth + 1, false, playerToOptimizeIcon, otherPlayerIcon, alpha, beta, isForHint);
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
      alpha = Math.max(alpha, score);
      if (beta <= alpha) break;
    }
    return { score: bestScore, move: bestMove };
  } else { // Minimizing for playerToOptimizeIcon (i.e., otherPlayerIcon is making their best move)
    let bestScore = Infinity;
    for (const move of legalSlides) {
      const newBoard = simulateSlide(board, move, currentPlayerForTurn);
      const { score } = minimaxSlide(newBoard, depth + 1, true, playerToOptimizeIcon, otherPlayerIcon, alpha, beta, isForHint);
      if (score < bestScore) {
        bestScore = score;
        bestMove = move;
      }
      beta = Math.min(beta, score);
      if (beta <= alpha) break;
    }
    return { score: bestScore, move: bestMove };
  }
}


/* ───────────────── CLASSIC: minimax (hard) ────────────────── */

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

/* ─────────────────── main decision function (Classic) ───────────────── */

export function calculateBestMove(
  board      = state.board,
  cpuIcon    = state.gameP2Icon, // Actually playerToOptimize
  humanIcon  = state.gameP1Icon, // Actually otherPlayer
  difficulty = state.difficulty // This difficulty is for CPU's move, not hint quality
) {
  // When used for hints, cpuIcon is human, humanIcon is CPU.
  // The 'difficulty' param here refers to the quality of the move calculation.
  // For hints, we usually want a 'hard' quality calculation.
  if (!cpuIcon || !humanIcon) {
    console.error('Player icons undefined in calculateBestMove', { cpuIcon, humanIcon });
    return randomMove(board);
  }
  if (emptySquares(board).length === 0) return -1;

  // For hints, we override difficulty to 'hard' to give a good suggestion.
  // The actual CPU opponent difficulty is state.difficulty.
  const calculationDifficulty = difficulty === 'hint' ? 'hard' : difficulty;

  switch (calculationDifficulty) {
    case 'easy':
      return randomMove(board);

    case 'normal': {
      const win   = findTwoInARow(board, cpuIcon); // win for playerToOptimize
      if (win !== -1) return win;
      const block = findTwoInARow(board, humanIcon); // block for otherPlayer
      if (block !== -1) return block;
      return randomMove(board);
    }

    case 'hard':
    default: {
      // cpuIcon is the maximizing player in minimax
      const { index } = minimax([...board], 0, true, cpuIcon, humanIcon);
      return index !== -1 ? index : randomMove(board);
    }
  }
}

/* ─────────────────── AI turn (Classic) ───────────────────── */

export async function cpuMove() {
  if (!state.gameActive) return;

  ui.setBoardClickable(false);
  await delay(250 + Math.random() * 250);   // small pause for UX

  const cpuIcon   = state.gameP2Icon;
  const humanIcon = state.gameP1Icon;

  if (!cpuIcon) {
    console.error('CPU icon undefined; aborting classic move.');
    ui.setBoardClickable(true);
    return;
  }

  const moveIndex = calculateBestMove(state.board, cpuIcon, humanIcon, state.difficulty);

  if (moveIndex !== -1) {
    gameLogic.makeMove(moveIndex, cpuIcon);
  }

  if (state.gameActive && state.currentPlayer === humanIcon) {
    ui.setBoardClickable(true);
    ui.updateStatus(`Turno del ${player.getPlayerName(humanIcon)}`);
    gameLogic.showEasyModeHint?.();
  }
}


/* ─────────────────── AI turn (3 Piezas) ──────────────────── */
export async function cpuMoveThreePiece() {
  if (!state.gameActive) return;

  ui.setBoardClickable(false);
  await delay(250 + Math.random() * 250);

  const cpuIcon = state.gameP2Icon;
  const humanIcon = state.gameP1Icon;

  if (!cpuIcon || !humanIcon) {
    console.error('CPU or human icon undefined for 3 Piezas; aborting move.');
    ui.setBoardClickable(true);
    return;
  }

  if (state.gamePhase === state.GAME_PHASES.PLACING) {
    const moveIndex = calculateBestMove(state.board, cpuIcon, humanIcon, state.difficulty);
    if (moveIndex !== -1) {
      gameLogic.makeMove(moveIndex, cpuIcon);
    }
  } else if (state.gamePhase === state.GAME_PHASES.MOVING) {
    let bestSlide = null;
    const difficulty = state.difficulty;

    switch (difficulty) {
      case 'easy':
        bestSlide = randomSlide(state.board, cpuIcon);
        break;

      case 'normal': {
        // 1. Check for winning slide for CPU
        const winningSlidesCPU = enumerateSlides(state.board, cpuIcon);
        for (const slide of winningSlidesCPU) {
          if (gameLogic.checkWin(cpuIcon, simulateSlide(state.board, slide, cpuIcon))) {
            bestSlide = slide;
            break;
          }
        }
        if (bestSlide) break;

        // 2. Check for blocking opponent's winning slide
        const winningSlidesHuman = enumerateSlides(state.board, humanIcon);
        for (const humanSlide of winningSlidesHuman) {
          if (gameLogic.checkWin(humanIcon, simulateSlide(state.board, humanSlide, humanIcon))) {
            // Can CPU block this humanSlide?
            // Try to move to the 'to' square of human's winning slide
            const cpuBlockSlides = enumerateSlides(state.board, cpuIcon);
            for (const cpuPotentialBlock of cpuBlockSlides) {
              if (cpuPotentialBlock.to === humanSlide.to) {
                bestSlide = cpuPotentialBlock;
                break;
              }
            }
            if (bestSlide) break;
          }
        }
        if (bestSlide) break;
        
        // 3. Random slide
        bestSlide = randomSlide(state.board, cpuIcon);
        break;
      }

      case 'hard':
      default: {
        const { move } = minimaxSlide([...state.board], 0, true, cpuIcon, humanIcon, -Infinity, Infinity);
        bestSlide = move;
        if (!bestSlide && enumerateSlides(state.board, cpuIcon).length > 0) { // Fallback if minimax returns no move but moves exist
            bestSlide = randomSlide(state.board, cpuIcon);
        }
        break;
      }
    }

    if (bestSlide) {
      gameLogic.movePiece(bestSlide.from, bestSlide.to, cpuIcon);
    } else {
      console.warn("CPU has no legal slides in 3 Piezas moving phase.");
       if (!gameLogic.hasValidMoves(cpuIcon, state.board) && !gameLogic.hasValidMoves(humanIcon, state.board)) {
         gameLogic.endDraw();
       }
    }
  }

  if (state.gameActive && state.currentPlayer === humanIcon) {
    ui.setBoardClickable(true);
    if (state.gamePhase === state.GAME_PHASES.PLACING) {
      const placedCount = state.board.filter(s => s === humanIcon).length;
      ui.updateStatus(`${player.getPlayerName(humanIcon)}: Coloca tu pieza (${placedCount + 1}/3).`);
    } else if (state.gamePhase === state.GAME_PHASES.MOVING) {
      ui.updateStatus(`${player.getPlayerName(humanIcon)}: Selecciona tu pieza para mover.`);
    }
    gameLogic.showEasyModeHint?.(); // Call hint for human's turn
  }
}

/**
 * Calculates the best slide for a hint in 3 Piezas mode.
 * It pretends the human is the maximizing player.
 * @param {Array} board - The current game board.
 * @param {string} humanIcon - The icon of the human player.
 * @param {string} cpuIcon - The icon of the CPU player.
 * @returns {object|null} - The best slide {from, to} or null if no slide.
 */
export function calculateBestSlideForHint(board, humanIcon, cpuIcon) {
  if (!humanIcon || !cpuIcon) {
    console.error('Icons undefined for hint calculation', {humanIcon, cpuIcon});
    return null;
  }
  // We want to find the best move for humanIcon (isMax=true)
  const { move } = minimaxSlide([...board], 0, true, humanIcon, cpuIcon, -Infinity, Infinity, true);
  return move; // move can be null if no legal slides or no good move found by minimax
}