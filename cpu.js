// cpu.js
// -----------------------------------------------------------------------------
// CPU (AI) logic for Ta-Te-Ti Deluxe
// -----------------------------------------------------------------------------
//  * Supports three difficulty levels: “easy”, “normal”, “hard”.
//  * Exports:
//      - calculateBestMove(board?, cpuIcon?, humanIcon?, difficulty?)
//      - cpuMove()                 ← call this when it’s the CPU’s turn (Classic)
//      - cpuMoveThreePiece()       ← call this when it’s the CPU’s turn (3 Piezas)
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

function minimaxSlide(board, depth, isMax, cpuIcon, humanIcon, alpha, beta) {
  if (gameLogic.checkWin(cpuIcon, board))   return { score: 10 - depth };
  if (gameLogic.checkWin(humanIcon, board)) return { score: -10 + depth };
  if (depth >= 4) return { score: 0 }; // Depth limit for sliding phase

  const legalSlides = enumerateSlides(board, isMax ? cpuIcon : humanIcon);
  if (legalSlides.length === 0) return { score: 0 }; // No moves, draw-like state for this path

  let bestMove = null;

  if (isMax) {
    let bestScore = -Infinity;
    for (const move of legalSlides) {
      const newBoard = simulateSlide(board, move, cpuIcon);
      const { score } = minimaxSlide(newBoard, depth + 1, false, cpuIcon, humanIcon, alpha, beta);
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
      alpha = Math.max(alpha, score);
      if (beta <= alpha) break;
    }
    return { score: bestScore, move: bestMove };
  } else {
    let bestScore = Infinity;
    for (const move of legalSlides) {
      const newBoard = simulateSlide(board, move, humanIcon);
      const { score } = minimaxSlide(newBoard, depth + 1, true, cpuIcon, humanIcon, alpha, beta);
      if (score < bestScore) {
        bestScore = score;
        bestMove = move; // Not strictly needed for min player's best move, but good for symmetry
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
  cpuIcon    = state.gameP2Icon,
  humanIcon  = state.gameP1Icon,
  difficulty = state.difficulty
) {
  if (!cpuIcon || !humanIcon) {
    console.error('CPU or human icon undefined in calculateBestMove', { cpuIcon, humanIcon });
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
        // 1. Check for winning slide
        const winningSlides = enumerateSlides(state.board, cpuIcon);
        for (const slide of winningSlides) {
          const nextBoard = simulateSlide(state.board, slide, cpuIcon);
          if (gameLogic.checkWin(cpuIcon, nextBoard)) {
            bestSlide = slide;
            break;
          }
        }
        if (bestSlide) break;

        // 2. Check for blocking opponent's winning slide
        const opponentWinningSlides = enumerateSlides(state.board, humanIcon);
        let blockMove = null;
        for (const oppSlide of opponentWinningSlides) {
          const oppNextBoard = simulateSlide(state.board, oppSlide, humanIcon);
          if (gameLogic.checkWin(humanIcon, oppNextBoard)) {
            // Can the CPU move to the square the opponent wants to move to?
            const potentialBlocks = enumerateSlides(state.board, cpuIcon);
            for (const cpuPotentialSlide of potentialBlocks) {
              if (cpuPotentialSlide.to === oppSlide.to) {
                blockMove = cpuPotentialSlide;
                break;
              }
            }
            if (blockMove) break;
            // If not directly blocking the 'to' square, try to move the piece the opponent needs
            // This is more complex as it requires checking if CPU *can* move that piece
            // For now, we prioritize moving *any* piece to block the destination.
            // A more advanced block would be to ensure *our* piece that can move to oppSlide.to
            // is not the one the opponent would have moved *from* to win.
          }
        }
         if (blockMove) {
            bestSlide = blockMove;
            break;
        }

        // If no direct block by occupying the 'to' square,
        // check if any of OUR pieces can move to prevent the opponent's win.
        // This is tricky because the opponent might have multiple pieces to move.
        // The most reliable block is to take the square they need for the win.
        // Iterate through all CPU's possible moves. For each move, simulate it.
        // Then, check if the *opponent* can still win on their *next* turn.
        // If a CPU move prevents *all* immediate opponent wins, that's a good block.
        // This is effectively a one-ply lookahead for blocking.

        // Simplified: If CPU can move to the square the opponent would use to win, do it.
        // (already covered by iterating through `winningSlides` for opponent and checking if `cpuPotentialSlide.to === oppSlide.to`)

        // 3. Random slide
        bestSlide = randomSlide(state.board, cpuIcon);
        break;
      }

      case 'hard':
      default: {
        const { move } = minimaxSlide([...state.board], 0, true, cpuIcon, humanIcon, -Infinity, Infinity);
        bestSlide = move;
        if (!bestSlide) { // Fallback if minimax returns no move (e.g. no legal slides)
            bestSlide = randomSlide(state.board, cpuIcon);
        }
        break;
      }
    }

    if (bestSlide) {
      gameLogic.movePiece(bestSlide.from, bestSlide.to, cpuIcon);
    } else {
      // No legal slides for CPU, which might mean a draw if human also has no moves.
      // gameLogic.checkDraw should handle this when the turn flips.
      // If it's CPU's turn and it has no moves, it's a stalemate from CPU's side.
      // The game should end in a draw if the opponent also cannot move.
      // gameLogic.endDraw() should be called by gameLogic if applicable.
      console.warn("CPU has no legal slides in 3 Piezas moving phase.");
       if (!gameLogic.hasValidMoves(cpuIcon, state.board) && !gameLogic.hasValidMoves(humanIcon, state.board)) {
         gameLogic.endDraw();
       }
    }
  }

  // If the game is still active and it's now the human's turn, unlock the board.
  if (state.gameActive && state.currentPlayer === humanIcon) {
    ui.setBoardClickable(true);
    if (state.gamePhase === state.GAME_PHASES.PLACING) {
      const placedCount = state.board.filter(s => s === humanIcon).length;
      ui.updateStatus(`${player.getPlayerName(humanIcon)}: Coloca tu pieza (${placedCount + 1}/3).`);
    } else if (state.gamePhase === state.GAME_PHASES.MOVING) {
      ui.updateStatus(`${player.getPlayerName(humanIcon)}: Selecciona tu pieza para mover.`);
    }
    // No easy mode hint for 3 Piezas for now
  }
}