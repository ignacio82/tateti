// gameLogic.js - Applying new phase derivation logic
// ─────────────────────────────────────────────────────────────────────────────
// Core mechanics for both Classic and "3 Piezas" variants of Ta-Te-Ti Deluxe
// ─────────────────────────────────────────────────────────────────────────────

import * as state   from './state.js';
import * as ui      from './ui.js';
import * as player  from './player.js';
import * as sound   from './sound.js';
import { calculateBestMove,
         cpuMove,
         cpuMoveThreePiece,
         calculateBestSlideForHint } from './cpu.js';
// peerConnection import removed as it's not directly used by gameLogic itself for sending,
// but gameLogic functions are called by peerConnection handlers.

/* ╭──────────────────────────────────────────────────────────╮
   │ New Helper: boardToPhase                                 │
   ╰──────────────────────────────────────────────────────────╯ */
// This function determines the game phase based on the board state for 3-Pieces mode.
// For Classic mode, or if the game is already over, it doesn't change the phase.
export function boardToPhase(board, variant, currentPhaseFromState) {
  if (currentPhaseFromState === state.GAME_PHASES.GAME_OVER) {
    return state.GAME_PHASES.GAME_OVER; // Once game is over, phase doesn't change back
  }
  if (variant !== state.GAME_VARIANTS.THREE_PIECE) {
    // For Classic Tic-Tac-Toe, there's no explicit 'MOVING' phase based on piece count.
    // The phase is implicitly 'PLACING' until game over.
    // We can return the current phase or a defined phase for classic if needed.
    // For now, let's assume classic mode doesn't use this logic to change phase.
    return currentPhaseFromState; // Or state.GAME_PHASES.PLACING if game is active
  }

  const totalPieces = board.filter(Boolean).length; // Counts non-null/non-empty cells

  if (totalPieces < (state.MAX_PIECES_PER_PLAYER * 2)) {
    return state.GAME_PHASES.PLACING;
  } else {
    return state.GAME_PHASES.MOVING;
  }
}

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
    state.currentPlayer === state.myEffectiveIcon &&
    state.gameActive
  ) {
    const humanIcon = state.myEffectiveIcon;
    const cpuIcon   = state.opponentEffectiveIcon;
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
          if (state.selectedPieceIndex === null) {
            if (bestSlide.from !== null && state.board[bestSlide.from] === humanIcon) {
              ui.highlightSuggestedMove(bestSlide.from);
            }
          } else if (state.selectedPieceIndex === bestSlide.from) {
            if (bestSlide.to !== null && state.board[bestSlide.to] === null) {
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
  if (a === null || b === null || a < 0 || a > 8 || b < 0 || b > 8 ) return false;
  if (a === b) return false;
  const r1 = Math.floor(a / 3), c1 = a % 3;
  const r2 = Math.floor(b / 3), c2 = b % 3;
  const dr = Math.abs(r1 - r2), dc = Math.abs(c1 - c2);
  return dr <= 1 && dc <= 1 && (dr + dc > 0);
};

export function hasValidMoves(sym, board) {
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== sym) continue;
    for (let j = 0; j < board.length; j++) {
      if (board[j] === null && areCellsAdjacent(i, j)) {
        return true;
      }
    }
  }
  return false;
}

/* ╭──────────────────────────────────────────────────────────╮
   │ 3. Draw detection                                       │
   ╰──────────────────────────────────────────────────────────╯ */
export function checkDraw(board = state.board) {
  if (!state.gameActive) return false;
  if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE &&
      state.gamePhase === state.GAME_PHASES.MOVING) {
    const p1CanMove = hasValidMoves(state.gameP1Icon, board);
    const p2CanMove = hasValidMoves(state.gameP2Icon, board);
    return (
      !checkWin(state.gameP1Icon, board) &&
      !checkWin(state.gameP2Icon, board) &&
      !p1CanMove && !p2CanMove
    );
  }
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
  const capturedPhaseBeforeSwitch = state.gamePhase; // This should be the already-updated phase
  console.log(`gameLogic.switchPlayer: Phase captured before switch: ${capturedPhaseBeforeSwitch}. Current player: ${state.currentPlayer}. Timestamp: ${new Date().toISOString()}`);

  state.setCurrentPlayer(
    state.currentPlayer === state.gameP1Icon ? state.gameP2Icon : state.gameP1Icon
  );
  state.setSelectedPieceIndex(null);
  ui.clearSelectedPieceHighlight();

  state.setGamePhase(capturedPhaseBeforeSwitch); // Restore/maintain the phase
  console.log(`gameLogic.switchPlayer: Phase restored after switch: ${state.gamePhase}. New current player: ${state.currentPlayer}. Timestamp: ${new Date().toISOString()}`);

  let statusMessage = '';
  if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
      if (state.gamePhase === state.GAME_PHASES.MOVING) {
          statusMessage = `${player.getPlayerName(state.currentPlayer)}: Selecciona tu pieza para mover.`;
          if (checkDraw(state.board)) { endDraw(); return; }
      } else if (state.gamePhase === state.GAME_PHASES.PLACING) {
          const placedCount = state.board.filter(s => s === state.currentPlayer).length;
          statusMessage = `${player.getPlayerName(state.currentPlayer)}: Coloca tu pieza (${Math.min(placedCount + 1, state.MAX_PIECES_PER_PLAYER)}/${state.MAX_PIECES_PER_PLAYER}).`;
      }
  } else {
      statusMessage = `Turno del ${player.getPlayerName(state.currentPlayer)}`;
  }
  ui.updateStatus(statusMessage);

  const isMyTurnForHint = (state.pvpRemoteActive && state.isMyTurnInRemote) ||
                         (!state.pvpRemoteActive && !state.vsCPU) ||
                         (!state.pvpRemoteActive && state.vsCPU && state.currentPlayer === state.myEffectiveIcon);

  if (state.gameActive && isMyTurnForHint) {
    showEasyModeHint();
  }
}

/* ╭──────────────────────────────────────────────────────────╮
   │ 5. Game initialisation / reset                          │
   ╰──────────────────────────────────────────────────────────╯ */
export function init() {
  console.log(`gameLogic.init() called. Timestamp: ${new Date().toISOString()}`);
  ui.removeConfetti();
  ui.hideOverlay();
  ui.hideQRCode();
  ui.clearBoardUI();
  state.resetGameFlowState(); // Resets turnCounter and gamePhase to PLACING

  state.setBoard(Array(9).fill(null));
  state.setGameActive(false);
  player.determineEffectiveIcons();

  // After reset, explicitly set phase based on board (though it will be PLACING from reset)
  // This is more for consistency if init was ever called mid-game (which it shouldn't be for this purpose)
  state.setGamePhase(boardToPhase(state.board, state.gameVariant, state.gamePhase));
  console.log(`gameLogic.init(): Phase set after reset to: ${state.gamePhase}. Current TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`);


  if (state.pvpRemoteActive && state.gamePaired) {
    console.log(`gameLogic.init(): PVP Remote & Paired. Current TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`);
    state.setCurrentPlayer(state.gameP1Icon);
    state.setIsMyTurnInRemote(state.currentPlayer === state.myEffectiveIcon);
    // Status update will use the (now confirmed) correct phase from boardToPhase if called by switchPlayer or makeMove
    ui.updateStatus(
      state.isMyTurnInRemote
        ? `Tu Turno ${player.getPlayerName(state.currentPlayer)}` // Initial status will be based on current player and phase
        : `Esperando a ${player.getPlayerName(state.currentPlayer)}...`
    );
    // Further refine status message based on phase after player is set
    if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && state.gamePhase === state.GAME_PHASES.PLACING) {
        const placed = state.board.filter(s => s === state.currentPlayer).length;
        const statusMsg = `${player.getPlayerName(state.currentPlayer)}: Coloca tu pieza (${Math.min(placed + 1, state.MAX_PIECES_PER_PLAYER)}/${state.MAX_PIECES_PER_PLAYER}).`;
        ui.updateStatus(state.isMyTurnInRemote ? statusMsg : `Esperando a ${player.getPlayerName(state.currentPlayer)}...`);
    }


    ui.setBoardClickable(state.isMyTurnInRemote);
    state.setGameActive(true);
  } else if (state.pvpRemoteActive && !state.gamePaired) {
    // ... (no changes to this block's logic beyond logs)
    console.log(`gameLogic.init(): PVP Remote & NOT Paired. Timestamp: ${new Date().toISOString()}`);
    ui.setBoardClickable(false);
    state.setGameActive(false);
     if (state.iAmPlayer1InRemote && state.currentHostPeerId) {
        ui.updateStatus(`Comparte el enlace o ID: ${state.currentHostPeerId}`);
         const desiredBaseUrl = 'https://tateti.martinez.fyi';
         const gameLink = `${desiredBaseUrl}/?room=${state.currentHostPeerId}`;
         ui.displayQRCode(gameLink);
    } else if (!state.iAmPlayer1InRemote && state.currentHostPeerId){
        ui.updateStatus(`Intentando conectar a ${state.currentHostPeerId}...`);
    } else if (state.iAmPlayer1InRemote && !state.currentHostPeerId) {
        ui.updateStatus("Estableciendo conexión como Host...");
    } else {
        ui.updateStatus("Modo Remoto: Esperando conexión.");
    }
  } else { // Local or CPU game
    console.log(`gameLogic.init(): Local or CPU game. Current TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`);
    state.setGameActive(true);
    let startPlayer = state.gameP1Icon;
    if (state.whoGoesFirstSetting === 'random') {
      startPlayer = Math.random() < 0.5 ? state.gameP1Icon : state.gameP2Icon;
    } else if (
      state.whoGoesFirstSetting === 'loser' &&
      state.previousGameExists &&
      state.lastWinner !== null
    ) {
      startPlayer = state.lastWinner === state.gameP1Icon ? state.gameP2Icon : state.gameP1Icon;
    } else if (state.whoGoesFirstSetting === 'loser' && state.previousGameExists && state.lastWinner === null) {
      startPlayer = state.gameP1Icon;
    }
    state.setCurrentPlayer(startPlayer);

    // Initial phase is PLACING from resetGameFlowState, then confirmed by boardToPhase.
    // Status update based on current player and derived phase:
    if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && state.gamePhase === state.GAME_PHASES.PLACING) {
      const placedCount = state.board.filter(s => s === startPlayer).length;
      ui.updateStatus(`${player.getPlayerName(startPlayer)}: Coloca tu pieza (${Math.min(placedCount + 1, state.MAX_PIECES_PER_PLAYER)}/${state.MAX_PIECES_PER_PLAYER}).`);
    } else {
      ui.updateStatus(`Turno del ${player.getPlayerName(startPlayer)}`);
    }

    if (state.vsCPU && state.currentPlayer === state.opponentEffectiveIcon) {
      ui.setBoardClickable(false);
      setTimeout(async () => { if (state.gameActive) await cpuMoveHandler(); }, 700 + Math.random() * 300);
    } else {
      ui.setBoardClickable(true);
      showEasyModeHint();
    }
  }

  updateAllUITogglesHandler();
  updateScoreboardHandler();

  if (sound.getAudioContext()?.state === 'running' && state.gameActive && !(state.pvpRemoteActive && !state.gamePaired && state.iAmPlayer1InRemote)) {
    sound.playSound('reset');
  }
}

/* ╭──────────────────────────────────────────────────────────╮
   │ 6. Placement phase (Classic + 3-Piezas PLACING)         │
   ╰──────────────────────────────────────────────────────────╯ */
export function makeMove(idx, sym) {
  if (state.board[idx] != null || !state.gameActive) {
    return false;
  }
  if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && state.gamePhase === state.GAME_PHASES.PLACING) {
    const tokensOnBoardBySymbol = state.board.filter(s => s === sym).length;
    if (tokensOnBoardBySymbol >= state.MAX_PIECES_PER_PLAYER) {
        return false;
    }
  }

  const newBoard = [...state.board];
  newBoard[idx] = sym;
  state.setBoard(newBoard); // Board is updated
  ui.updateCellUI(idx, sym);
  sound.playSound('move');

  // ** NEW: Determine phase from board state IMMEDIATELY after board update **
  const newPhase = boardToPhase(state.board, state.gameVariant, state.gamePhase);
  if (newPhase !== state.gamePhase) {
    console.log(`gameLogic.makeMove: Phase changing from ${state.gamePhase} to ${newPhase} based on boardToPhase after move by ${sym}. Timestamp: ${new Date().toISOString()}`);
    state.setGamePhase(newPhase);
  } else {
    console.log(`gameLogic.makeMove: Phase remains ${state.gamePhase} based on boardToPhase after move by ${sym}. Timestamp: ${new Date().toISOString()}`);
  }

  const winCombo = checkWin(sym, state.board); // Check win on the updated board
  if (winCombo) {
    endGame(sym, winCombo); state.incrementTurnCounter(); return true;
  }
  // Check draw only if no win
  if (checkDraw(state.board)) { // Check draw on the updated board
    endDraw(); state.incrementTurnCounter(); return true;
  }

  console.log(`gameLogic.makeMove: Before switchPlayer. Current state.gamePhase: ${state.gamePhase}, Current player: ${state.currentPlayer}. Timestamp: ${new Date().toISOString()}`);
  switchPlayer();
  console.log(`gameLogic.makeMove: After switchPlayer. Current state.gamePhase: ${state.gamePhase}, New current player: ${state.currentPlayer}. Timestamp: ${new Date().toISOString()}`);

  updateAllUITogglesHandler();

  const isMyTurnNow = (state.pvpRemoteActive && state.isMyTurnInRemote) || !state.pvpRemoteActive;
  const isCPUPlaying = state.vsCPU && state.currentPlayer === state.opponentEffectiveIcon;

  if (state.gameActive) {
    if (isCPUPlaying) {
        ui.setBoardClickable(false);
        setTimeout(async () => { if (state.gameActive) await cpuMoveHandler(); }, 700 + Math.random() * 300);
    } else if (isMyTurnNow) {
        ui.setBoardClickable(true);
        showEasyModeHint();
    } else {
        ui.setBoardClickable(false);
    }
  }
  
  // No longer need the old phaseChanged logic here as phase is derived directly.
  // The sender's UI status for remote game is handled by switchPlayer's status update.

  state.incrementTurnCounter();
  console.log(`gameLogic.makeMove: Turn counter incremented to ${state.turnCounter} at end of function for move by ${sym}. Timestamp: ${new Date().toISOString()}`);
  return true;
}

/* ╭──────────────────────────────────────────────────────────╮
   │ 7. Moving phase (3-Piezas MOVING)                       │
   ╰──────────────────────────────────────────────────────────╯ */
export function movePiece(fromIdx, toIdx, sym) {
  console.log(`gameLogic.movePiece: Attempt by ${sym} from ${fromIdx} to ${toIdx}. GameActive=${state.gameActive}, Variant=${state.gameVariant}, Phase=${state.gamePhase}. Timestamp: ${new Date().toISOString()}`);

  if (!state.gameActive || state.gameVariant !== state.GAME_VARIANTS.THREE_PIECE || state.gamePhase !== state.GAME_PHASES.MOVING) {
    console.warn("movePiece Rejected: Pre-conditions not met."); return false;
  }
  if (state.board[fromIdx] !== sym || state.board[toIdx] !== null || !areCellsAdjacent(fromIdx, toIdx)) {
    console.warn("movePiece Rejected: Invalid move conditions."); return false;
  }

  const newBoard = [...state.board];
  newBoard[toIdx]   = sym;
  newBoard[fromIdx] = null;
  state.setBoard(newBoard); // Board is updated
  ui.updateCellUI(toIdx, sym);
  ui.updateCellUI(fromIdx, null);
  sound.playSound('move');
  state.setSelectedPieceIndex(null);
  ui.clearSelectedPieceHighlight();
  console.log(`movePiece: Successful move by ${sym} from ${fromIdx} to ${toIdx}.`);

  // Note: boardToPhase won't change phase from MOVING back to PLACING unless pieces are removed,
  // which doesn't happen in movePiece. So, phase should remain MOVING.
  // state.setGamePhase(boardToPhase(state.board, state.gameVariant, state.gamePhase)); // Not strictly needed if phase can only be MOVING or GAME_OVER here

  const winCombo = checkWin(sym, state.board);
  if (winCombo) {
    endGame(sym, winCombo); state.incrementTurnCounter(); return true;
  }
  if (checkDraw(state.board)) {
    endDraw(); state.incrementTurnCounter(); return true;
  }

  switchPlayer();
  updateAllUITogglesHandler();

  const isMyTurnNow = (state.pvpRemoteActive && state.isMyTurnInRemote) || !state.pvpRemoteActive;
  const isCPUPlaying = state.vsCPU && state.currentPlayer === state.opponentEffectiveIcon;

  if (state.gameActive) {
    if (isCPUPlaying) {
        ui.setBoardClickable(false);
        setTimeout(async () => { if (state.gameActive) await cpuMoveHandler(); }, 700 + Math.random() * 300);
    } else if (isMyTurnNow) {
        ui.setBoardClickable(true);
        showEasyModeHint();
    } else {
        ui.setBoardClickable(false);
    }
  }
  state.incrementTurnCounter();
  console.log(`gameLogic.movePiece: Turn counter incremented to ${state.turnCounter} at end of function for move by ${sym}. Timestamp: ${new Date().toISOString()}`);
  return true;
}

/* ╭──────────────────────────────────────────────────────────╮
   │ 8. Game-over helpers                                    │
   ╰──────────────────────────────────────────────────────────╯ */
export function endGame(winnerSym, winningCells) {
  console.log(`gameLogic.endGame: Winner ${winnerSym}. Current TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`);
  state.setGameActive(false);
  state.setGamePhase(state.GAME_PHASES.GAME_OVER); // Explicitly set to GAME_OVER
  ui.setBoardClickable(false);
  // ... (rest of endGame logic) ...
  localStorage.setItem('myWinsTateti', state.myWins.toString());
  localStorage.setItem('opponentWinsTateti', state.opponentWins.toString());
  updateScoreboardHandler();

  if (state.pvpRemoteActive && state.gamePaired) {
    console.log("endGame: Remote game ended. TC will be reset if a new game starts via init().");
  } else if (!state.pvpRemoteActive) {
    console.log("endGame: Scheduling local/CPU restart. TC will be reset by init().");
    setTimeout(init, state.AUTO_RESTART_DELAY_WIN);
  }
}

export function endDraw() {
  console.log(`gameLogic.endDraw. Current TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`);
  state.setGameActive(false);
  state.setGamePhase(state.GAME_PHASES.GAME_OVER); // Explicitly set to GAME_OVER
  ui.setBoardClickable(false);
  // ... (rest of endDraw logic) ...
  localStorage.setItem('drawsTateti', state.draws.toString());
  updateScoreboardHandler();

  if (state.pvpRemoteActive && state.gamePaired) {
    console.log("endDraw: Remote game ended. TC will be reset if a new game starts via init().");
  } else if (!state.pvpRemoteActive) {
    console.log("endDraw: Scheduling local/CPU restart. TC will be reset by init().");
    setTimeout(init, state.AUTO_RESTART_DELAY_DRAW);
  }
}