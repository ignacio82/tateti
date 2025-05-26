// gameLogic.js
// ─────────────────────────────────────────────────────────────────────────────
// Core mechanics for both Classic and “3 Piezas” variants of Ta-Te-Ti Deluxe
// ─────────────────────────────────────────────────────────────────────────────

import * as state   from './state.js';
import * as ui      from './ui.js';
import * as player  from './player.js';
import * as sound   from './sound.js';
import { calculateBestMove,
         cpuMove, 
         cpuMoveThreePiece, 
         calculateBestSlideForHint } from './cpu.js';
import * as peerConnection from './peerConnection.js';

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
    state.currentPlayer === state.myEffectiveIcon && // For vs CPU, myEffectiveIcon is P1
    state.gameActive
  ) {
    const humanIcon = state.myEffectiveIcon; // Human is P1
    const cpuIcon   = state.opponentEffectiveIcon; // CPU is P2

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
  state.setCurrentPlayer(
    state.currentPlayer === state.gameP1Icon ? state.gameP2Icon : state.gameP1Icon
  );
  state.setSelectedPieceIndex(null); 
  ui.clearSelectedPieceHighlight();

  let statusMessage = '';
  if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
      if (state.gamePhase === state.GAME_PHASES.MOVING) {
          statusMessage = `${player.getPlayerName(state.currentPlayer)}: Selecciona tu pieza para mover.`;
          if (checkDraw(state.board)) { endDraw(); return; } 
      } else if (state.gamePhase === state.GAME_PHASES.PLACING) {
          const placed = state.board.filter(s => s === state.currentPlayer).length;
          statusMessage = `${player.getPlayerName(state.currentPlayer)}: Coloca tu pieza (${Math.min(placed + 1, state.MAX_PIECES_PER_PLAYER)}/${state.MAX_PIECES_PER_PLAYER}).`;
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
  console.log("gameLogic.init() called");
  ui.removeConfetti();
  ui.hideOverlay();
  ui.hideQRCode();
  ui.clearBoardUI(); // Clears board content and classes
  state.resetGameFlowState(); 

  state.setBoard(Array(9).fill(null));
  state.setGameActive(false); 
  player.determineEffectiveIcons(); 

  if (state.pvpRemoteActive && state.gamePaired) {
    console.log("gameLogic.init(): PVP Remote & Paired");
    state.setCurrentPlayer(state.gameP1Icon); 
    state.setIsMyTurnInRemote(state.currentPlayer === state.myEffectiveIcon);
    ui.updateStatus(
      state.isMyTurnInRemote
        ? `Tu Turno ${player.getPlayerName(state.currentPlayer)}`
        : `Esperando a ${player.getPlayerName(state.currentPlayer)}...`
    );
    ui.setBoardClickable(state.isMyTurnInRemote); // This will use the new setBoardClickable logic
    state.setGameActive(true);
  } else if (state.pvpRemoteActive && !state.gamePaired) {
    console.log("gameLogic.init(): PVP Remote & NOT Paired");
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
    }
     else {
        ui.updateStatus("Modo Remoto: Esperando conexión.");
    }
  } else { 
    console.log("gameLogic.init(): Local or CPU game");
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

    if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
      const placedCount = state.board.filter(s => s === startPlayer).length; 
      ui.updateStatus(`${player.getPlayerName(startPlayer)}: Coloca tu pieza (${Math.min(placedCount + 1, state.MAX_PIECES_PER_PLAYER)}/${state.MAX_PIECES_PER_PLAYER}).`);
    } else { 
      ui.updateStatus(`Turno del ${player.getPlayerName(startPlayer)}`);
    }

    if (state.vsCPU && state.currentPlayer === state.opponentEffectiveIcon) { // Check if it's CPU's turn
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
  state.setBoard(newBoard);
  ui.updateCellUI(idx, sym); 
  sound.playSound('move');

  const winCombo = checkWin(sym, newBoard);
  if (winCombo) { endGame(sym, winCombo); return true; }

  if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && state.gamePhase === state.GAME_PHASES.PLACING ) {
    const totalPiecesOnBoard = newBoard.filter(piece => piece !== null).length;
    if (totalPiecesOnBoard === state.MAX_PIECES_PER_PLAYER * 2) { 
      state.setGamePhase(state.GAME_PHASES.MOVING);
      console.log(`makeMove: Game phase changed to MOVING.`);
      // Additional polish, as suggested by AI:
      // This call ensures that if the current player (who just made the move causing phase change)
      // needs to interact immediately, or if the board appearance needs immediate update
      // based on the new phase and current player, it happens.
      // However, switchPlayer() will be called next and will also call setBoardClickable.
      // This ensures the UI reflects current player's pieces correctly if they are to move again.
      if (state.gameActive) ui.setBoardClickable(true);
    }
  } else if (checkDraw(newBoard)) { 
    endDraw();
    return true;
  }

  switchPlayer(); 
  updateAllUITogglesHandler();

  const isMyTurnNow = (state.pvpRemoteActive && state.isMyTurnInRemote) || !state.pvpRemoteActive;
  const isCPUPlaying = state.vsCPU && state.currentPlayer === state.opponentEffectiveIcon; // Check against opponent

  if (state.gameActive) {
    if (isCPUPlaying) {
        ui.setBoardClickable(false);
        setTimeout(async () => { if (state.gameActive) await cpuMoveHandler(); }, 700 + Math.random() * 300);
    } else if (isMyTurnNow) { 
        ui.setBoardClickable(true); // Ensure this uses the new logic
    } else { 
        ui.setBoardClickable(false);
    }
  }
  return true;
}


/* ╭──────────────────────────────────────────────────────────╮
   │ 7. Moving phase (3-Piezas MOVING)                       │
   ╰──────────────────────────────────────────────────────────╯ */
export function movePiece(fromIdx, toIdx, sym) {
  console.log(`movePiece: Attempt by ${sym} from ${fromIdx} to ${toIdx}. GameActive=${state.gameActive}, Variant=${state.gameVariant}, Phase=${state.gamePhase}`);
  
  if (!state.gameActive) { console.warn("movePiece Rejected: Game not active."); return false; }
  if (state.gameVariant !== state.GAME_VARIANTS.THREE_PIECE) { console.warn("movePiece Rejected: Not 3-Piece variant."); return false; }
  if (state.gamePhase !== state.GAME_PHASES.MOVING) { console.warn("movePiece Rejected: Not in MOVING phase."); return false; }

  if (state.board[fromIdx] !== sym) { console.warn(`movePiece Rejected: Piece at fromIdx ${fromIdx} (${state.board[fromIdx]}) is not ${sym}.`); return false; }
  if (state.board[toIdx] !== null) { console.warn(`movePiece Rejected: Cell at toIdx ${toIdx} (${state.board[toIdx]}) is not empty.`); return false; }
  
  if (!areCellsAdjacent(fromIdx, toIdx)) {
    console.warn(`movePiece Rejected: Cells ${fromIdx} and ${toIdx} are not adjacent.`);
    return false;
  }

  const newBoard = [...state.board];
  newBoard[toIdx]   = sym;
  newBoard[fromIdx] = null;
  state.setBoard(newBoard);
  ui.updateCellUI(toIdx, sym); 
  ui.updateCellUI(fromIdx, null); 
  sound.playSound('move');
  state.setSelectedPieceIndex(null); 
  ui.clearSelectedPieceHighlight();  
  console.log(`movePiece: Successful move by ${sym} from ${fromIdx} to ${toIdx}.`);

  const winCombo = checkWin(sym, newBoard);
  if (winCombo) { endGame(sym, winCombo); return true; }
  if (checkDraw(newBoard)) { endDraw(); return true; } 

  switchPlayer(); 
  updateAllUITogglesHandler();

  const isMyTurnNow = (state.pvpRemoteActive && state.isMyTurnInRemote) || !state.pvpRemoteActive;
  const isCPUPlaying = state.vsCPU && state.currentPlayer === state.opponentEffectiveIcon; // Check against opponent

  if (state.gameActive) {
    if (isCPUPlaying) {
        ui.setBoardClickable(false);
        setTimeout(async () => { if (state.gameActive) await cpuMoveHandler(); }, 700 + Math.random() * 300);
    } else if (isMyTurnNow) {
        ui.setBoardClickable(true); // Key call: Make board clickable for the current player
    } else { 
        ui.setBoardClickable(false);
    }
  }
  return true;
}

/* ╭──────────────────────────────────────────────────────────╮
   │ 8. Game-over helpers                                    │
   ╰──────────────────────────────────────────────────────────╯ */
export function endGame(winnerSym, winningCells) {
  console.log(`gameLogic.endGame: Winner ${winnerSym}`);
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

  if (state.pvpRemoteActive || state.vsCPU) { 
    if (winnerSym === state.myEffectiveIcon) state.incrementMyWins();
    else state.incrementOpponentWins();
  } else { 
    if (winnerSym === state.gameP1Icon) state.incrementMyWins(); 
    else state.incrementOpponentWins(); 
  }

  localStorage.setItem('myWinsTateti', state.myWins.toString());
  localStorage.setItem('opponentWinsTateti', state.opponentWins.toString());
  updateScoreboardHandler();

  if (state.pvpRemoteActive && state.gamePaired) {
    console.log("endGame: Sending restart_request to opponent.");
    peerConnection.sendPeerData({ type: 'restart_request' });
  } else if (!state.pvpRemoteActive) { 
    console.log("endGame: Scheduling local/CPU restart.");
    setTimeout(init, state.AUTO_RESTART_DELAY_WIN);
  }
}

export function endDraw() {
  console.log("gameLogic.endDraw");
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

  if (state.pvpRemoteActive && state.gamePaired) {
    console.log("endDraw: Sending restart_request to opponent.");
    peerConnection.sendPeerData({ type: 'restart_request' });
  } else if (!state.pvpRemoteActive) { 
    console.log("endDraw: Scheduling local/CPU restart.");
    setTimeout(init, state.AUTO_RESTART_DELAY_DRAW);
  }
}