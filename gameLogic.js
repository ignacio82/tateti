// gameLogic.js - Restoring and refining boardToPhase logic
import * as state   from './state.js';
import * as ui      from './ui.js';
import * as player  from './player.js';
import * as sound   from './sound.js';
import { calculateBestMove,
         cpuMove,
         cpuMoveThreePiece,
         calculateBestSlideForHint } from './cpu.js';

// Re-instated and refined boardToPhase function
export function boardToPhase(board, variant, currentGlobalPhase) {
  console.log(`gameLogic.boardToPhase: CALLED. Board pieces: ${board.filter(Boolean).length}, variant: ${variant}, currentGlobalPhase: ${currentGlobalPhase}, MAX_PIECES_PER_PLAYER: ${state.MAX_PIECES_PER_PLAYER}. Timestamp: ${new Date().toISOString()}`);

  if (currentGlobalPhase === state.GAME_PHASES.GAME_OVER) {
    console.log(`gameLogic.boardToPhase: Returning GAME_OVER as currentGlobalPhase is GAME_OVER.`);
    return state.GAME_PHASES.GAME_OVER;
  }
  if (variant !== state.GAME_VARIANTS.THREE_PIECE) {
    console.log(`gameLogic.boardToPhase: Variant is not THREE_PIECE (${variant}). Returning currentGlobalPhase: ${currentGlobalPhase}.`);
    return currentGlobalPhase; // For classic, phase doesn't change based on piece count this way
  }

  const totalPieces = board.filter(p => p !== null).length;
  const pieceThreshold = state.MAX_PIECES_PER_PLAYER * 2; // Should be 6

  console.log(`gameLogic.boardToPhase: totalPieces = ${totalPieces}, pieceThreshold for MOVING = ${pieceThreshold}`);

  if (totalPieces < pieceThreshold) {
    console.log(`gameLogic.boardToPhase: Returning PLACING because ${totalPieces} < ${pieceThreshold}.`);
    return state.GAME_PHASES.PLACING;
  } else {
    console.log(`gameLogic.boardToPhase: Returning MOVING because ${totalPieces} >= ${pieceThreshold}.`);
    return state.GAME_PHASES.MOVING;
  }
}

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
  if (state.vsCPU && state.difficulty === 'easy' && state.currentPlayer === state.myEffectiveIcon && state.gameActive) {
    const humanIcon = state.myEffectiveIcon; const cpuIcon = state.opponentEffectiveIcon;
    if (state.gameVariant === state.GAME_VARIANTS.CLASSIC) {
      const idx = calculateBestMove(state.board, humanIcon, cpuIcon, 'hint');
      if (idx != null && idx !== -1 && state.board[idx] === null) ui.highlightSuggestedMove(idx);
    } else if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
      if (state.gamePhase === state.GAME_PHASES.PLACING) {
        const idx = calculateBestMove(state.board, humanIcon, cpuIcon, 'hint');
        if (idx != null && idx !== -1 && state.board[idx] === null) ui.highlightSuggestedMove(idx);
      } else if (state.gamePhase === state.GAME_PHASES.MOVING) {
        const bestSlide = calculateBestSlideForHint(state.board, humanIcon, cpuIcon);
        if (bestSlide) {
          if (state.selectedPieceIndex === null) {
            if (bestSlide.from !== null && state.board[bestSlide.from] === humanIcon) ui.highlightSuggestedMove(bestSlide.from);
          } else if (state.selectedPieceIndex === bestSlide.from) {
            if (bestSlide.to !== null && state.board[bestSlide.to] === null) ui.highlightSuggestedMove(bestSlide.to);
          }
        }
      }
    }
  }
}

export const checkWin = (sym, board = state.board) => {
  const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  return wins.find(combo => combo.every(i => board[i] === sym)) || null;
};
export const areCellsAdjacent = (a,b) => {
  if (a===null||b===null||a<0||a>8||b<0||b>8) return false; if (a===b) return false;
  const r1=Math.floor(a/3),c1=a%3,r2=Math.floor(b/3),c2=b%3;
  return Math.abs(r1-r2)<=1 && Math.abs(c1-c2)<=1;
};
export function hasValidMoves(sym,board){
  for(let i=0;i<board.length;i++){ if(board[i]!==sym)continue;
    for(let j=0;j<board.length;j++){ if(board[j]===null && areCellsAdjacent(i,j)) return true;}}
  return false;
}
export function checkDraw(board=state.board){
  if(!state.gameActive)return false;
  if(state.gameVariant===state.GAME_VARIANTS.THREE_PIECE && state.gamePhase===state.GAME_PHASES.MOVING){
    return !checkWin(state.gameP1Icon,board) && !checkWin(state.gameP2Icon,board) && !hasValidMoves(state.gameP1Icon,board) && !hasValidMoves(state.gameP2Icon,board);
  }
  return board.every(c=>c!==null) && !checkWin(state.gameP1Icon,board) && !checkWin(state.gameP2Icon,board);
}

export function switchPlayer() {
  const capturedPhaseBeforeSwitch = state.gamePhase;
  console.log(`gameLogic.switchPlayer: Phase captured before switch: ${capturedPhaseBeforeSwitch}. Current player: ${state.currentPlayer}. Timestamp: ${new Date().toISOString()}`);
  state.setCurrentPlayer(state.currentPlayer === state.gameP1Icon ? state.gameP2Icon : state.gameP1Icon);
  state.setSelectedPieceIndex(null); ui.clearSelectedPieceHighlight();
  state.setGamePhase(capturedPhaseBeforeSwitch); // Use the phase that was determined *before* this function
  console.log(`gameLogic.switchPlayer: Phase restored/maintained after switch: ${state.gamePhase}. New current player: ${state.currentPlayer}. Timestamp: ${new Date().toISOString()}`);

  let statusMessage = '';
  if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
      if (state.gamePhase === state.GAME_PHASES.MOVING) {
          statusMessage = `${player.getPlayerName(state.currentPlayer)}: Selecciona tu pieza para mover.`;
          // checkDraw should be called after switchPlayer has fully updated current player and phase for accuracy
      } else if (state.gamePhase === state.GAME_PHASES.PLACING) {
          const placedCount = state.board.filter(s => s === state.currentPlayer).length;
          statusMessage = `${player.getPlayerName(state.currentPlayer)}: Coloca tu pieza (${Math.min(placedCount + 1, state.MAX_PIECES_PER_PLAYER)}/${state.MAX_PIECES_PER_PLAYER}).`;
      }
  } else { statusMessage = `Turno del ${player.getPlayerName(state.currentPlayer)}`; }
  ui.updateStatus(statusMessage);

  // Check for draw after player has been switched and status updated
  if (state.gamePhase === state.GAME_PHASES.MOVING && state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && checkDraw(state.board)) {
      endDraw(); // This will set gameActive = false
      // No return needed here as endDraw handles it.
  }

  const isMyTurnForHint = (state.pvpRemoteActive && state.isMyTurnInRemote) || (!state.pvpRemoteActive && !state.vsCPU) || (!state.pvpRemoteActive && state.vsCPU && state.currentPlayer === state.myEffectiveIcon);
  if (state.gameActive && isMyTurnForHint) showEasyModeHint();
}

export function init() {
  console.log(`gameLogic.init() called. Timestamp: ${new Date().toISOString()}`);
  ui.removeConfetti(); ui.hideOverlay(); ui.hideQRCode(); ui.clearBoardUI();
  state.resetGameFlowState(); // Resets turnCounter to 0 and gamePhase to PLACING
  state.setBoard(Array(9).fill(null)); state.setGameActive(false);
  player.determineEffectiveIcons();
  // Phase is PLACING from reset. boardToPhase would confirm this.
  const initialPhase = boardToPhase(state.board, state.gameVariant, state.gamePhase);
  state.setGamePhase(initialPhase); // Will log via state.js
  console.log(`gameLogic.init(): Phase is: ${state.gamePhase}. TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`);

  if (state.pvpRemoteActive && state.gamePaired) {
    console.log(`gameLogic.init(): PVP Remote & Paired. TC: ${state.turnCounter}.`);
    state.setCurrentPlayer(state.gameP1Icon); state.setIsMyTurnInRemote(state.currentPlayer === state.myEffectiveIcon);
    let sMsg;
    if(state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && state.gamePhase === state.GAME_PHASES.PLACING){
        const pc = state.board.filter(s => s === state.currentPlayer).length;
        sMsg = `${player.getPlayerName(state.currentPlayer)}: Coloca tu pieza (${Math.min(pc+1,state.MAX_PIECES_PER_PLAYER)}/${state.MAX_PIECES_PER_PLAYER}).`;
        if(!state.isMyTurnInRemote) sMsg = `Esperando a ${player.getPlayerName(state.currentPlayer)}...`;
    } else {sMsg = state.isMyTurnInRemote ? `Tu Turno ${player.getPlayerName(state.currentPlayer)}` : `Esperando a ${player.getPlayerName(state.currentPlayer)}...`;}
    ui.updateStatus(sMsg); ui.setBoardClickable(state.isMyTurnInRemote); state.setGameActive(true);
  } else if (state.pvpRemoteActive && !state.gamePaired) {
    console.log(`gameLogic.init(): PVP Remote & NOT Paired.`); ui.setBoardClickable(false); state.setGameActive(false);
    if(state.iAmPlayer1InRemote&&state.currentHostPeerId){ui.updateStatus(`Comparte el enlace o ID: ${state.currentHostPeerId}`); ui.displayQRCode(`https://tateti.martinez.fyi/?room=${state.currentHostPeerId}`);}
    else if(!state.iAmPlayer1InRemote&&state.currentHostPeerId){ui.updateStatus(`Intentando conectar a ${state.currentHostPeerId}...`);}
    else if(state.iAmPlayer1InRemote&&!state.currentHostPeerId){ui.updateStatus("Estableciendo conexión como Host...");}
    else{ui.updateStatus("Modo Remoto: Esperando conexión.");}
  } else { // Local or CPU
    console.log(`gameLogic.init(): Local or CPU game. TC: ${state.turnCounter}.`); state.setGameActive(true);
    let sPlayer=state.gameP1Icon;
    if(state.whoGoesFirstSetting==='random')sPlayer=Math.random()<0.5?state.gameP1Icon:state.gameP2Icon;
    else if(state.whoGoesFirstSetting==='loser'&&state.previousGameExists&&state.lastWinner!==null)sPlayer=state.lastWinner===state.gameP1Icon?state.gameP2Icon:state.gameP1Icon;
    else if(state.whoGoesFirstSetting==='loser'&&state.previousGameExists&&state.lastWinner===null)sPlayer=state.gameP1Icon;
    state.setCurrentPlayer(sPlayer);
    if(state.gameVariant===state.GAME_VARIANTS.THREE_PIECE&&state.gamePhase===state.GAME_PHASES.PLACING){
      const pc=state.board.filter(s=>s===sPlayer).length;
      ui.updateStatus(`${player.getPlayerName(sPlayer)}: Coloca tu pieza (${Math.min(pc+1,state.MAX_PIECES_PER_PLAYER)}/${state.MAX_PIECES_PER_PLAYER}).`);
    }else{ui.updateStatus(`Turno del ${player.getPlayerName(sPlayer)}`);}
    if(state.vsCPU&&state.currentPlayer===state.opponentEffectiveIcon){ui.setBoardClickable(false);setTimeout(async()=>{if(state.gameActive)await cpuMoveHandler();},700+Math.random()*300);}
    else{ui.setBoardClickable(true);showEasyModeHint();}
  }
  updateAllUITogglesHandler(); updateScoreboardHandler();
  if(sound.getAudioContext()?.state==='running'&&state.gameActive&&!(state.pvpRemoteActive&&!state.gamePaired&&state.iAmPlayer1InRemote))sound.playSound('reset');
}

export function makeMove(idx, sym) {
  console.log(`gameLogic.makeMove: CALLED by ${sym} for cell ${idx}. Current phase: ${state.gamePhase}. Board pieces: ${state.board.filter(Boolean).length}. Timestamp: ${new Date().toISOString()}`);
  if (state.board[idx] != null || !state.gameActive) {
    console.log(`gameLogic.makeMove: Move rejected (cell occupied or game not active).`); return false;
  }

  if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
    const tokensOnBoardBySymbol = state.board.filter(s => s === sym).length;
    if (tokensOnBoardBySymbol >= state.MAX_PIECES_PER_PLAYER && state.gamePhase === state.GAME_PHASES.PLACING) {
      // This condition means they are trying to place a 4th piece during the placing phase.
      console.warn(`gameLogic.makeMove: Player ${sym} (in PLACING phase) attempted to place piece ${tokensOnBoardBySymbol + 1}, but already has ${tokensOnBoardBySymbol}. Move rejected.`);
      return false;
    }
    // If it's MOVING phase, makeMove shouldn't be called by eventListeners.js for placing a new piece.
    // The defensive check below handles if makeMove is erroneously called in MOVING phase with an attempt to place.
    if (state.gamePhase === state.GAME_PHASES.MOVING) {
        console.error(`gameLogic.makeMove: Called for player ${sym} in MOVING phase. This should be handled by movePiece. Rejecting placement.`);
        return false; // Do not allow placement in moving phase via makeMove
    }
  }

  const newBoard = [...state.board]; newBoard[idx] = sym;
  state.setBoard(newBoard);
  ui.updateCellUI(idx, sym); sound.playSound('move');

  // Determine and set new phase based on board state *before* win/draw/switch
  // Pass the current state.gamePhase, so boardToPhase can respect GAME_OVER
  const newCalculatedPhase = boardToPhase(state.board, state.gameVariant, state.gamePhase);
  if (newCalculatedPhase !== state.gamePhase) { // Only update if it actually changes
      console.log(`gameLogic.makeMove: Phase changing from ${state.gamePhase} to ${newCalculatedPhase} (derived by boardToPhase). Player: ${sym}. Timestamp: ${new Date().toISOString()}`);
      state.setGamePhase(newCalculatedPhase);
  } else {
      console.log(`gameLogic.makeMove: Phase remains ${state.gamePhase} (confirmed by boardToPhase). Player: ${sym}. Timestamp: ${new Date().toISOString()}`);
  }

  const winCombo = checkWin(sym, state.board);
  if (winCombo) {
    console.log(`gameLogic.makeMove: Win detected for ${sym}. Timestamp: ${new Date().toISOString()}`);
    endGame(sym, winCombo); state.incrementTurnCounter(); return true;
  }
  if (checkDraw(state.board)) {
    console.log(`gameLogic.makeMove: Draw detected. Timestamp: ${new Date().toISOString()}`);
    endDraw(); state.incrementTurnCounter(); return true;
  }

  console.log(`gameLogic.makeMove: Before switchPlayer. state.gamePhase: ${state.gamePhase}, state.currentPlayer: ${state.currentPlayer}. Timestamp: ${new Date().toISOString()}`);
  switchPlayer();
  console.log(`gameLogic.makeMove: After switchPlayer. state.gamePhase: ${state.gamePhase}, state.currentPlayer: ${state.currentPlayer}. Timestamp: ${new Date().toISOString()}`);
  updateAllUITogglesHandler();

  const isCPUPlaying = state.vsCPU && state.currentPlayer === state.opponentEffectiveIcon;
  if (state.gameActive) {
    if (isCPUPlaying) {
        ui.setBoardClickable(false); setTimeout(async () => { if (state.gameActive) await cpuMoveHandler(); }, 700 + Math.random() * 300);
    } else { ui.setBoardClickable(true); if (!state.pvpRemoteActive || state.isMyTurnInRemote) showEasyModeHint(); }
  }
  state.incrementTurnCounter();
  console.log(`gameLogic.makeMove: Turn counter incremented to ${state.turnCounter} at end by ${sym}. Timestamp: ${new Date().toISOString()}`);
  return true;
}

export function movePiece(fromIdx, toIdx, sym) {
  console.log(`gameLogic.movePiece: CALLED by ${sym} from ${fromIdx} to ${toIdx}. Phase: ${state.gamePhase}. Timestamp: ${new Date().toISOString()}`);
  if (!state.gameActive || state.gameVariant !== state.GAME_VARIANTS.THREE_PIECE || state.gamePhase !== state.GAME_PHASES.MOVING) {
    console.warn(`movePiece Rejected: Pre-conditions not met (Active: ${state.gameActive}, Variant: ${state.gameVariant}, Phase: ${state.gamePhase}).`); return false;
  }
  if (state.board[fromIdx]!==sym || state.board[toIdx]!==null || !areCellsAdjacent(fromIdx,toIdx)){
    console.warn(`movePiece Rejected: Invalid move conditions (board[from]: ${state.board[fromIdx]}, board[to]: ${state.board[toIdx]}, adjacent: ${areCellsAdjacent(fromIdx,toIdx)}).`); return false;
  }
  const newBoard = [...state.board]; newBoard[toIdx]=sym; newBoard[fromIdx]=null;
  state.setBoard(newBoard);
  ui.updateCellUI(toIdx,sym); ui.updateCellUI(fromIdx,null); sound.playSound('move');
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
        ui.setBoardClickable(false); setTimeout(async () => { if (state.gameActive) await cpuMoveHandler(); }, 700 + Math.random() * 300);
    } else { ui.setBoardClickable(true); if (!state.pvpRemoteActive || state.isMyTurnInRemote) showEasyModeHint(); }
  }
  state.incrementTurnCounter();
  console.log(`gameLogic.movePiece: Turn counter incremented to ${state.turnCounter} at end by ${sym}. Timestamp: ${new Date().toISOString()}`);
  return true;
}

export function endGame(winnerSym, winningCells) {
  console.log(`gameLogic.endGame: Winner symbol raw: '${winnerSym}'. TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`);
  state.setGameActive(false);
  state.setGamePhase(state.GAME_PHASES.GAME_OVER);
  ui.setBoardClickable(false); ui.clearSuggestedMoveHighlight(); ui.clearSelectedPieceHighlight();
  if (winnerSym) {
    ui.launchConfetti(); ui.highlightWinner(winningCells); sound.playSound('win');
    const winnerName = player.getPlayerName(winnerSym);
    console.log(`gameLogic.endGame: Winner name: '${winnerName}' for symbol '${winnerSym}'`);
    ui.updateStatus(`${winnerName} GANA!`);
  } else {
    console.error(`gameLogic.endGame: Called with no winnerSymbol! Setting generic 'Juego terminado'.`);
    ui.updateStatus('Juego terminado'); // Fallback for unexpected call without winner
  }
  state.setLastWinner(winnerSym); state.setPreviousGameExists(true);
  if(state.pvpRemoteActive||state.vsCPU){if(winnerSym===state.myEffectiveIcon)state.incrementMyWins();else if(winnerSym===state.opponentEffectiveIcon)state.incrementOpponentWins();}
  else{if(winnerSym===state.gameP1Icon)state.incrementMyWins();else if(winnerSym===state.gameP2Icon)state.incrementOpponentWins();}
  localStorage.setItem('myWinsTateti',state.myWins.toString()); localStorage.setItem('opponentWinsTateti',state.opponentWins.toString());
  updateScoreboardHandler();
  if(!state.pvpRemoteActive){console.log("endGame: Scheduling local/CPU restart."); setTimeout(init,state.AUTO_RESTART_DELAY_WIN);}
  else{console.log("endGame: P2P game ended. Winner declared. Waiting for restart action.");}
}

export function endDraw() {
  console.log(`gameLogic.endDraw. TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`);
  state.setGameActive(false); state.setGamePhase(state.GAME_PHASES.GAME_OVER);
  ui.setBoardClickable(false); ui.clearSuggestedMoveHighlight(); ui.clearSelectedPieceHighlight();
  ui.playDrawAnimation(); sound.playSound('draw'); ui.updateStatus('¡EMPATE!');
  state.incrementDraws(); state.setLastWinner(null); state.setPreviousGameExists(true);
  localStorage.setItem('drawsTateti',state.draws.toString()); updateScoreboardHandler();
  if(!state.pvpRemoteActive){console.log("endDraw: Scheduling local/CPU restart."); setTimeout(init,state.AUTO_RESTART_DELAY_DRAW);}
  else{console.log("endDraw: P2P game ended in a draw. Waiting for restart action.");}
}