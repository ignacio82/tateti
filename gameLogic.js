// gameLogic.js - Focused fix for phase transition and piece limits
import * as state   from './state.js';
import * as ui      from './ui.js';
import * as player  from './player.js';
import * as sound   from './sound.js';
import { calculateBestMove,
         cpuMove,
         cpuMoveThreePiece,
         calculateBestSlideForHint } from './cpu.js';

// We are removing boardToPhase from here for now, to simplify and focus on direct logic in makeMove.
// If needed, it can be reintroduced, but let's ensure the core transition works first.

let cpuMoveHandler = () => console.warn('cpuMoveHandler not set');
export const setCpuMoveHandler = h => (cpuMoveHandler = h);
let _updateScoreboardHandler = () => ui.updateScoreboard();
export const setUpdateScoreboardHandler = h => (_updateScoreboardHandler = h);
const updateScoreboardHandler = () => _updateScoreboardHandler();
let _updateAllUITogglesHandler = () => ui.updateAllUIToggleButtons();
export const setUpdateAllUITogglesHandler = h => (_updateAllUITogglesHandler = h);
export const updateAllUITogglesHandler = () => _updateAllUITogglesHandler();

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

export function switchPlayer() {
  const capturedPhaseBeforeSwitch = state.gamePhase;
  console.log(`gameLogic.switchPlayer: Phase captured before switch: ${capturedPhaseBeforeSwitch}. Current player: ${state.currentPlayer}. Timestamp: ${new Date().toISOString()}`);

  state.setCurrentPlayer(
    state.currentPlayer === state.gameP1Icon ? state.gameP2Icon : state.gameP1Icon
  );
  state.setSelectedPieceIndex(null);
  ui.clearSelectedPieceHighlight();

  state.setGamePhase(capturedPhaseBeforeSwitch); // Restore the phase that was set before switchPlayer
  console.log(`gameLogic.switchPlayer: Phase restored after switch: ${state.gamePhase}. New current player: ${state.currentPlayer}. Timestamp: ${new Date().toISOString()}`);

  let statusMessage = '';
  if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
      if (state.gamePhase === state.GAME_PHASES.MOVING) {
          statusMessage = `${player.getPlayerName(state.currentPlayer)}: Selecciona tu pieza para mover.`;
          if (checkDraw(state.board)) { endDraw(); return; } // checkDraw should be after status is determined for current player
      } else if (state.gamePhase === state.GAME_PHASES.PLACING) {
          const placedCount = state.board.filter(s => s === state.currentPlayer).length;
          statusMessage = `${player.getPlayerName(state.currentPlayer)}: Coloca tu pieza (${Math.min(placedCount + 1, state.MAX_PIECES_PER_PLAYER)}/${state.MAX_PIECES_PER_PLAYER}).`;
      }
  } else { // Classic
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
  
  // gamePhase is PLACING from resetGameFlowState
  console.log(`gameLogic.init(): Phase is: ${state.gamePhase} (from reset). Current TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`);

  if (state.pvpRemoteActive && state.gamePaired) {
    console.log(`gameLogic.init(): PVP Remote & Paired. Current TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`);
    state.setCurrentPlayer(state.gameP1Icon); // Host (P1) typically starts or determined by whoGoesFirst settings if implemented for P2P
    state.setIsMyTurnInRemote(state.currentPlayer === state.myEffectiveIcon);
    
    let initialStatusMsg;
    if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && state.gamePhase === state.GAME_PHASES.PLACING) {
        const placed = state.board.filter(s => s === state.currentPlayer).length;
        initialStatusMsg = `${player.getPlayerName(state.currentPlayer)}: Coloca tu pieza (${Math.min(placed + 1, state.MAX_PIECES_PER_PLAYER)}/${state.MAX_PIECES_PER_PLAYER}).`;
        if (!state.isMyTurnInRemote) {
            initialStatusMsg = `Esperando a ${player.getPlayerName(state.currentPlayer)}...`;
        }
    } else {
        initialStatusMsg = state.isMyTurnInRemote
            ? `Tu Turno ${player.getPlayerName(state.currentPlayer)}`
            : `Esperando a ${player.getPlayerName(state.currentPlayer)}...`;
    }
    ui.updateStatus(initialStatusMsg);
    ui.setBoardClickable(state.isMyTurnInRemote);
    state.setGameActive(true);

  } else if (state.pvpRemoteActive && !state.gamePaired) {
    console.log(`gameLogic.init(): PVP Remote & NOT Paired. Timestamp: ${new Date().toISOString()}`);
    ui.setBoardClickable(false); state.setGameActive(false);
    if (state.iAmPlayer1InRemote && state.currentHostPeerId) {
        ui.updateStatus(`Comparte el enlace o ID: ${state.currentHostPeerId}`);
        const gameLink = `https://tateti.martinez.fyi/?room=${state.currentHostPeerId}`;
        ui.displayQRCode(gameLink);
    } else if (!state.iAmPlayer1InRemote && state.currentHostPeerId) {
        ui.updateStatus(`Intentando conectar a ${state.currentHostPeerId}...`);
    } else if (state.iAmPlayer1InRemote && !state.currentHostPeerId) {
        ui.updateStatus("Estableciendo conexión como Host...");
    } else { ui.updateStatus("Modo Remoto: Esperando conexión."); }
  } else { // Local or CPU game
    console.log(`gameLogic.init(): Local or CPU game. Current TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`);
    state.setGameActive(true);
    let startPlayer = state.gameP1Icon;
    if (state.whoGoesFirstSetting === 'random') {
      startPlayer = Math.random() < 0.5 ? state.gameP1Icon : state.gameP2Icon;
    } else if (state.whoGoesFirstSetting === 'loser' && state.previousGameExists && state.lastWinner !== null) {
      startPlayer = state.lastWinner === state.gameP1Icon ? state.gameP2Icon : state.gameP1Icon;
    } else if (state.whoGoesFirstSetting === 'loser' && state.previousGameExists && state.lastWinner === null) {
      startPlayer = state.gameP1Icon;
    }
    state.setCurrentPlayer(startPlayer);

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
      ui.setBoardClickable(true); showEasyModeHint();
    }
  }
  updateAllUITogglesHandler(); updateScoreboardHandler();
  if (sound.getAudioContext()?.state === 'running' && state.gameActive && !(state.pvpRemoteActive && !state.gamePaired && state.iAmPlayer1InRemote)) {
    sound.playSound('reset');
  }
}

export function makeMove(idx, sym) { // sym is the icon of the player making the move
  console.log(`gameLogic.makeMove: CALLED by ${sym} for cell ${idx}. Current phase: ${state.gamePhase}. Timestamp: ${new Date().toISOString()}`);
  if (state.board[idx] != null || !state.gameActive) {
    console.log(`gameLogic.makeMove: Move rejected (cell occupied or game not active).`);
    return false;
  }

  // **MODIFIED/ENHANCED PIECE LIMIT CHECK (for Issue 1: P2 placing 4th piece)**
  if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
    // This check applies regardless of current gamePhase, as a defense.
    // `sym` is the player attempting to place.
    const tokensOnBoardBySymbol = state.board.filter(s => s === sym).length;
    if (tokensOnBoardBySymbol >= state.MAX_PIECES_PER_PLAYER) {
        // If already 3 pieces, a "placement" (makeMove) is illegal.
        // This situation implies gamePhase might be wrongly 'PLACING' for this player's turn.
        console.warn(`gameLogic.makeMove: Player ${sym} attempted to place piece ${tokensOnBoardBySymbol + 1} (already has ${tokensOnBoardBySymbol}). This should only happen in PLACING phase AND if they have < ${state.MAX_PIECES_PER_PLAYER} pieces. Current phase: ${state.gamePhase}. Move rejected.`);
        // Potentially add a UI message to the user here if this happens often.
        return false;
    }
  }


  const newBoard = [...state.board];
  newBoard[idx] = sym;
  state.setBoard(newBoard);
  ui.updateCellUI(idx, sym);
  sound.playSound('move');

  // **REFINED PHASE TRANSITION LOGIC (for original bug fix)**
  let phaseActuallyChangedThisTurn = false;
  if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && state.gamePhase === state.GAME_PHASES.PLACING) {
    const totalPiecesOnBoard = newBoard.filter(p => p !== null).length;
    console.log(`gameLogic.makeMove: In 3-Piece PLACING. Total pieces on board now: ${totalPiecesOnBoard}. Timestamp: ${new Date().toISOString()}`);
    if (totalPiecesOnBoard >= (state.MAX_PIECES_PER_PLAYER * 2)) { // Should be exactly 6 for transition
      console.log(`gameLogic.makeMove: Transitioning to MOVING phase. totalPieces: ${totalPiecesOnBoard}. Timestamp: ${new Date().toISOString()}`);
      state.setGamePhase(state.GAME_PHASES.MOVING);
      phaseActuallyChangedThisTurn = true;
    }
  }
  console.log(`gameLogic.makeMove: After potential phase change. Current state.gamePhase: ${state.gamePhase}. Timestamp: ${new Date().toISOString()}`);


  const winCombo = checkWin(sym, state.board);
  if (winCombo) {
    console.log(`gameLogic.makeMove: Win detected for ${sym}. Timestamp: ${new Date().toISOString()}`);
    endGame(sym, winCombo); state.incrementTurnCounter(); return true;
  }
  if (checkDraw(state.board)) {
    console.log(`gameLogic.makeMove: Draw detected. Timestamp: ${new Date().toISOString()}`);
    endDraw(); state.incrementTurnCounter(); return true;
  }

  console.log(`gameLogic.makeMove: Before switchPlayer. Current state.gamePhase: ${state.gamePhase}, Current player: ${state.currentPlayer}. Timestamp: ${new Date().toISOString()}`);
  switchPlayer();
  console.log(`gameLogic.makeMove: After switchPlayer. Current state.gamePhase: ${state.gamePhase}, New current player: ${state.currentPlayer}. Timestamp: ${new Date().toISOString()}`);

  updateAllUITogglesHandler();

  const isCPUPlaying = state.vsCPU && state.currentPlayer === state.opponentEffectiveIcon;
  if (state.gameActive) {
    if (isCPUPlaying) {
        ui.setBoardClickable(false);
        setTimeout(async () => { if (state.gameActive) await cpuMoveHandler(); }, 700 + Math.random() * 300);
    } else { // Human player's turn (local or P2P)
        ui.setBoardClickable(true);
        if (!state.pvpRemoteActive || state.isMyTurnInRemote) { // Show hint if it's my turn locally or in P2P
             showEasyModeHint();
        }
    }
  }
  
  state.incrementTurnCounter();
  console.log(`gameLogic.makeMove: Turn counter incremented to ${state.turnCounter} at end of function for move by ${sym}. Timestamp: ${new Date().toISOString()}`);
  return true;
}

export function movePiece(fromIdx, toIdx, sym) {
  console.log(`gameLogic.movePiece: CALLED by ${sym} from ${fromIdx} to ${toIdx}. Current phase: ${state.gamePhase}. Timestamp: ${new Date().toISOString()}`);
  if (!state.gameActive) { console.warn("movePiece Rejected: Game not active."); return false; }
  if (state.gameVariant !== state.GAME_VARIANTS.THREE_PIECE) { console.warn("movePiece Rejected: Not 3-Piece variant."); return false; }
  // **CRITICAL CHECK for Issue 1**: Ensure this is only called in MOVING phase.
  // handleCellClick in eventListeners.js should primarily enforce this.
  if (state.gamePhase !== state.GAME_PHASES.MOVING) {
    console.error(`gameLogic.movePiece: FATAL: Called when gamePhase is ${state.gamePhase}, not MOVING. This indicates a flaw in handleCellClick routing.`);
    return false;
  }

  if (state.board[fromIdx] !== sym) { console.warn(`movePiece Rejected: Piece at fromIdx ${fromIdx} (${state.board[fromIdx]}) is not ${sym}.`); return false; }
  if (state.board[toIdx] !== null) { console.warn(`movePiece Rejected: Cell at toIdx ${toIdx} (${state.board[toIdx]}) is not empty.`); return false; }
  if (!areCellsAdjacent(fromIdx, toIdx)) {
    console.warn(`movePiece Rejected: Cells ${fromIdx} and ${toIdx} are not adjacent.`); return false;
  }

  const newBoard = [...state.board];
  newBoard[toIdx]   = sym; newBoard[fromIdx] = null;
  state.setBoard(newBoard);
  ui.updateCellUI(toIdx, sym); ui.updateCellUI(fromIdx, null);
  sound.playSound('move');
  state.setSelectedPieceIndex(null); ui.clearSelectedPieceHighlight();
  console.log(`movePiece: Successful move by ${sym} from ${fromIdx} to ${toIdx}.`);

  const winCombo = checkWin(sym, state.board);
  if (winCombo) {
    console.log(`gameLogic.movePiece: Win detected for ${sym}. Timestamp: ${new Date().toISOString()}`);
    endGame(sym, winCombo); state.incrementTurnCounter(); return true;
  }
  if (checkDraw(state.board)) {
    console.log(`gameLogic.movePiece: Draw detected. Timestamp: ${new Date().toISOString()}`);
    endDraw(); state.incrementTurnCounter(); return true;
  }

  switchPlayer(); updateAllUITogglesHandler();

  const isCPUPlaying = state.vsCPU && state.currentPlayer === state.opponentEffectiveIcon;
  if (state.gameActive) {
    if (isCPUPlaying) {
        ui.setBoardClickable(false);
        setTimeout(async () => { if (state.gameActive) await cpuMoveHandler(); }, 700 + Math.random() * 300);
    } else {
        ui.setBoardClickable(true);
        if (!state.pvpRemoteActive || state.isMyTurnInRemote) {
            showEasyModeHint();
        }
    }
  }
  state.incrementTurnCounter();
  console.log(`gameLogic.movePiece: Turn counter incremented to ${state.turnCounter} at end of function for move by ${sym}. Timestamp: ${new Date().toISOString()}`);
  return true;
}

export function endGame(winnerSym, winningCells) {
  console.log(`gameLogic.endGame: Winner symbol raw: '${winnerSym}'. Current TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`);
  state.setGameActive(false);
  state.setGamePhase(state.GAME_PHASES.GAME_OVER);
  ui.setBoardClickable(false);
  ui.clearSuggestedMoveHighlight();
  ui.clearSelectedPieceHighlight();
  
  if (winnerSym) { // Check if winnerSym is truthy (not null, undefined, empty string)
    ui.launchConfetti();
    ui.highlightWinner(winningCells);
    sound.playSound('win');
    const winnerName = player.getPlayerName(winnerSym); // Get full name like "Jugador (❤️)"
    console.log(`gameLogic.endGame: Winner name determined: '${winnerName}' for symbol '${winnerSym}'`);
    ui.updateStatus(`${winnerName} GANA!`); // **MODIFIED for Issue 2**
  } else {
    // This case should ideally only be for draws, but a generic fallback.
    // Draws are handled by endDraw(). If endGame is called with no winnerSym, it's an issue.
    console.error(`gameLogic.endGame: Called with no winnerSymbol! This should be a draw or an error. Forcing 'Juego Terminado'.`);
    ui.updateStatus('Juego terminado'); // Fallback, but ideally endDraw handles draws.
  }

  state.setLastWinner(winnerSym); // Store the raw winner symbol
  state.setPreviousGameExists(true);

  if (state.pvpRemoteActive || state.vsCPU) {
    if (winnerSym === state.myEffectiveIcon) state.incrementMyWins();
    else if (winnerSym === state.opponentEffectiveIcon) state.incrementOpponentWins();
  } else { // Local PvP
    if (winnerSym === state.gameP1Icon) state.incrementMyWins();
    else if (winnerSym === state.gameP2Icon) state.incrementOpponentWins();
  }

  localStorage.setItem('myWinsTateti', state.myWins.toString());
  localStorage.setItem('opponentWinsTateti', state.opponentWins.toString());
  updateScoreboardHandler();

  // For P2P, do not auto-restart. Let restart_request/ack handle it or manual restart.
  if (!state.pvpRemoteActive) {
    console.log("endGame: Scheduling local/CPU restart. TC will be reset by init().");
    setTimeout(init, state.AUTO_RESTART_DELAY_WIN);
  } else {
    console.log("endGame: P2P game ended. Winner declared. Waiting for restart action.");
  }
}

export function endDraw() {
  console.log(`gameLogic.endDraw. Current TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`);
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

  if (!state.pvpRemoteActive) {
    console.log("endDraw: Scheduling local/CPU restart. TC will be reset by init().");
    setTimeout(init, state.AUTO_RESTART_DELAY_DRAW);
  } else {
     console.log("endDraw: P2P game ended in a draw. Waiting for restart action.");
  }
}