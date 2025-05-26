// gameLogic.js - Implementing new AI suggestions for phase and move logic
import * as state   from './state.js';
import * as ui      from './ui.js';
import * as player  from './player.js';
import * as sound   from './sound.js';
import { calculateBestMove,
         cpuMove,
         cpuMoveThreePiece,
         calculateBestSlideForHint } from './cpu.js';

// boardToPhase function (ensure this is robust)
export function boardToPhase(board, variant, currentGlobalPhase) {
  // Log inputs to boardToPhase, including currentGlobalPhase to respect GAME_OVER
  console.log(`gameLogic.boardToPhase: CALLED. Board pieces: ${board.filter(Boolean).length}, variant: ${variant}, currentGlobalPhase: ${currentGlobalPhase}, MAX_PIECES_PER_PLAYER: ${state.MAX_PIECES_PER_PLAYER}. Timestamp: ${new Date().toISOString()}`);

  if (currentGlobalPhase === state.GAME_PHASES.GAME_OVER) {
    console.log(`gameLogic.boardToPhase: Returning GAME_OVER as currentGlobalPhase is GAME_OVER.`);
    return state.GAME_PHASES.GAME_OVER;
  }
  if (variant !== state.GAME_VARIANTS.THREE_PIECE) {
    console.log(`gameLogic.boardToPhase: Variant is not THREE_PIECE (${variant}). Returning currentGlobalPhase: ${currentGlobalPhase}.`);
    return currentGlobalPhase;
  }

  const totalPieces = board.filter(p => p !== null).length;
  const pieceThreshold = state.MAX_PIECES_PER_PLAYER * 2;
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

export function showEasyModeHint() { /* ... (no changes needed to this function based on current request, keep existing) ... */ 
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
export const checkWin = (sym, board = state.board) => { /* ... (no changes needed, keep existing) ... */ 
  const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  return wins.find(combo => combo.every(i => board[i] === sym)) || null;
};
export const areCellsAdjacent = (a,b) => { /* ... (no changes needed, keep existing) ... */ 
  if (a===null||b===null||a<0||a>8||b<0||b>8) return false; if (a===b) return false;
  const r1=Math.floor(a/3),c1=a%3,r2=Math.floor(b/3),c2=b%3;
  return Math.abs(r1-r2)<=1 && Math.abs(c1-c2)<=1;
};
export function hasValidMoves(sym,board){ /* ... (no changes needed, keep existing) ... */ 
  for(let i=0;i<board.length;i++){ if(board[i]!==sym)continue;
    for(let j=0;j<board.length;j++){ if(board[j]===null && areCellsAdjacent(i,j)) return true;}}
  return false;
}
export function checkDraw(board=state.board){ /* ... (no changes needed, keep existing) ... */ 
  if(!state.gameActive)return false;
  if(state.gameVariant===state.GAME_VARIANTS.THREE_PIECE && state.gamePhase===state.GAME_PHASES.MOVING){
    return !checkWin(state.gameP1Icon,board) && !checkWin(state.gameP2Icon,board) && !hasValidMoves(state.gameP1Icon,board) && !hasValidMoves(state.gameP2Icon,board);
  }
  return board.every(c=>c!==null) && !checkWin(state.gameP1Icon,board) && !checkWin(state.gameP2Icon,board);
}

export function switchPlayer() {
  const capturedPhaseBeforeSwitch = state.gamePhase; // This phase should have been correctly set by makeMove/movePiece before calling switchPlayer
  console.log(`gameLogic.switchPlayer: Phase captured before switch: ${capturedPhaseBeforeSwitch}. Current player: ${state.currentPlayer}. Timestamp: ${new Date().toISOString()}`);
  state.setCurrentPlayer(state.currentPlayer === state.gameP1Icon ? state.gameP2Icon : state.gameP1Icon);
  state.setSelectedPieceIndex(null); ui.clearSelectedPieceHighlight();
  state.setGamePhase(capturedPhaseBeforeSwitch);
  console.log(`gameLogic.switchPlayer: Phase restored/maintained: ${state.gamePhase}. New current player: ${state.currentPlayer}. Timestamp: ${new Date().toISOString()}`);

  let statusMessage = '';
  if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
      if (state.gamePhase === state.GAME_PHASES.MOVING) {
          statusMessage = `${player.getPlayerName(state.currentPlayer)}: Selecciona tu pieza para mover.`;
      } else if (state.gamePhase === state.GAME_PHASES.PLACING) {
          const placedCount = state.board.filter(s => s === state.currentPlayer).length;
          statusMessage = `${player.getPlayerName(state.currentPlayer)}: Coloca tu pieza (${Math.min(placedCount + 1, state.MAX_PIECES_PER_PLAYER)}/${state.MAX_PIECES_PER_PLAYER}).`;
      }
  } else { statusMessage = `Turno del ${player.getPlayerName(state.currentPlayer)}`; }
  ui.updateStatus(statusMessage);

  if (state.gamePhase === state.GAME_PHASES.MOVING && state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && checkDraw(state.board)) {
      endDraw(); // endDraw will set gameActive to false
  }

  const isMyTurnForHint = (state.pvpRemoteActive && state.isMyTurnInRemote) || (!state.pvpRemoteActive && !state.vsCPU) || (!state.pvpRemoteActive && state.vsCPU && state.currentPlayer === state.myEffectiveIcon);
  if (state.gameActive && isMyTurnForHint) showEasyModeHint();
}

export function init() { /* ... (Keep existing init, it calls resetGameFlowState which sets phase to PLACING, and then boardToPhase confirms it) ... */ 
  console.log(`gameLogic.init() called. Timestamp: ${new Date().toISOString()}`);
  ui.removeConfetti(); ui.hideOverlay(); ui.hideQRCode(); ui.clearBoardUI();
  state.resetGameFlowState(); 
  state.setBoard(Array(9).fill(null)); state.setGameActive(false);
  player.determineEffectiveIcons();
  const initialPhase = boardToPhase(state.board, state.gameVariant, state.gamePhase);
  state.setGamePhase(initialPhase); 
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
  } else { 
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

// ** makeMove RESTRUCTURED ACCORDING TO OTHER AI'S SUGGESTIONS **
export function makeMove(idx, sym) { // sym is the player making the move (state.myEffectiveIcon or state.currentPlayer)
  console.log(`gameLogic.makeMove: CALLED by ${sym} for cell ${idx}. Initial state.gamePhase: ${state.gamePhase}. Board pieces: ${state.board.filter(Boolean).length}. Timestamp: ${new Date().toISOString()}`);

  if (!state.gameActive) {
    console.log(`gameLogic.makeMove: Move rejected (game not active).`); return false;
  }
  if (state.board[idx] != null) {
    console.log(`gameLogic.makeMove: Move rejected (cell ${idx} occupied).`); return false;
  }

  // ① Update the global phase from the board FIRST (passing current state.gamePhase to respect GAME_OVER)
  const phaseDerivedFromBoard = boardToPhase(state.board, state.gameVariant, state.gamePhase);
  if (phaseDerivedFromBoard !== state.gamePhase) {
    console.log(`gameLogic.makeMove: Phase re-evaluated from board. Was ${state.gamePhase}, became ${phaseDerivedFromBoard}. Player: ${sym}.`);
    state.setGamePhase(phaseDerivedFromBoard);
  }

  // ② If we’re no longer in PLACING (e.g., board has 6 pieces), makeMove should not place.
  // This is a critical guard.
  if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && state.gamePhase !== state.GAME_PHASES.PLACING) {
    console.warn(`gameLogic.makeMove: Attempt to place by ${sym} but current phase is ${state.gamePhase} (should be PLACING for makeMove in 3-Pieces). Move rejected. This might indicate player should be moving a piece.`);
    // ui.updateStatus("Debes mover una pieza existente."); // Optional: inform user
    return false; // Do not allow placement if not in placing phase for 3-pieces
  }
  
  // ③ Count how many pieces THIS player (`sym`) already has for 3-Pieces PLACING phase
  if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE /* && state.gamePhase is PLACING due to check above */) {
    const piecesOfPlayerSym = state.board.filter(p => p === sym).length;
    if (piecesOfPlayerSym >= state.MAX_PIECES_PER_PLAYER) {
      console.warn(`gameLogic.makeMove: Player ${sym} (in PLACING phase) already has ${piecesOfPlayerSym} pieces (max ${state.MAX_PIECES_PER_PLAYER}). Cannot place more. Move rejected.`);
      // The AI suggested forcing phase to MOVING here as a correction.
      // This implies the player might be "stuck" if their UI doesn't let them move.
      // For now, just rejecting is safer. If this log appears, it's a sign the routing in handleCellClick is still problematic.
      // state.setGamePhase(state.GAME_PHASES.MOVING); // Optional: force phase for this player
      // ui.updateStatus(`${player.getPlayerName(sym)}: Ya tienes 3 piezas. Mueve una existente.`);
      return false;
    }
  }

  // ④ …The rest of your placement logic…
  console.log(`gameLogic.makeMove: Placing piece for ${sym} at ${idx}.`);
  const newBoard = [...state.board]; newBoard[idx] = sym;
  state.setBoard(newBoard);
  ui.updateCellUI(idx, sym); sound.playSound('move');

  // ⑤ After a *successful* placement, update phase again from board
  //    (this is important if this placement was the 6th piece)
  const phaseAfterPlacement = boardToPhase(state.board, state.gameVariant, state.gamePhase);
  if (phaseAfterPlacement !== state.gamePhase) {
    console.log(`gameLogic.makeMove: Phase updated after successful placement. Was ${state.gamePhase}, became ${phaseAfterPlacement}. Player: ${sym}.`);
    state.setGamePhase(phaseAfterPlacement);
  }
  console.log(`gameLogic.makeMove: After successful placement. Current state.gamePhase: ${state.gamePhase}. Timestamp: ${new Date().toISOString()}`);

  // Win/Draw checks
  const winCombo = checkWin(sym, state.board);
  if (winCombo) {
    console.log(`gameLogic.makeMove: Win detected for ${sym}.`);
    endGame(sym, winCombo); state.incrementTurnCounter(); return true;
  }
  if (checkDraw(state.board)) {
    console.log(`gameLogic.makeMove: Draw detected.`);
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
  return true; // Signifies a successful action
}

export function movePiece(fromIdx, toIdx, sym) {
  console.log(`gameLogic.movePiece: CALLED by ${sym} from ${fromIdx} to ${toIdx}. Phase: ${state.gamePhase}. Timestamp: ${new Date().toISOString()}`);
  // ① At the start of movePiece, re-evaluate phase from board to be absolutely sure.
  // (Pass current state.gamePhase to respect GAME_OVER)
  const currentPhaseFromBoard = boardToPhase(state.board, state.gameVariant, state.gamePhase);
  if (currentPhaseFromBoard !== state.gamePhase) {
      console.warn(`gameLogic.movePiece: Phase mismatch at entry! state.gamePhase was ${state.gamePhase}, but board suggests ${currentPhaseFromBoard}. Updating phase.`);
      state.setGamePhase(currentPhaseFromBoard);
  }

  if (!state.gameActive || state.gameVariant !== state.GAME_VARIANTS.THREE_PIECE || state.gamePhase !== state.GAME_PHASES.MOVING) {
    console.warn(`movePiece Rejected: Pre-conditions not met (Active: ${state.gameActive}, Variant: ${state.gameVariant}, Phase: ${state.gamePhase}). This move will be rejected.`); return false;
  }
  // ... (rest of movePiece logic as it was, it seemed fine) ...
  if (state.board[fromIdx]!==sym || state.board[toIdx]!==null || !areCellsAdjacent(fromIdx,toIdx)){
    console.warn(`movePiece Rejected: Invalid move conditions (board[from]: ${state.board[fromIdx]}, board[to]: ${state.board[toIdx]}, adjacent: ${areCellsAdjacent(fromIdx,toIdx)}).`); return false;
  }
  const newBoard = [...state.board]; newBoard[toIdx]=sym; newBoard[fromIdx]=null;
  state.setBoard(newBoard);
  ui.updateCellUI(toIdx,sym); ui.updateCellUI(fromIdx,null); sound.playSound('move');
  state.setSelectedPieceIndex(null); ui.clearSelectedPieceHighlight();
  console.log(`movePiece: Successful move by ${sym} from ${fromIdx} to ${toIdx}.`);

  // After a successful move, phase should still be MOVING unless game ends.
  // boardToPhase will confirm this or transition to GAME_OVER if a win/draw occurred.
  // However, win/draw checks below already set GAME_OVER.
  // const phaseAfterMove = boardToPhase(state.board, state.gameVariant, state.gamePhase);
  // if (phaseAfterMove !== state.gamePhase) state.setGamePhase(phaseAfterMove);

  const winCombo = checkWin(sym, state.board);
  if (winCombo) {
    console.log(`gameLogic.movePiece: Win detected for ${sym}.`);
    endGame(sym, winCombo); state.incrementTurnCounter(); return true;
  }
  if (checkDraw(state.board)) {
    console.log(`gameLogic.movePiece: Draw detected.`);
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
  return true; // Signifies a successful action
}

export function endGame(winnerSym, winningCells) { // winnerSym is the icon of the winner
  console.log(`gameLogic.endGame: Winner symbol raw: '${winnerSym}'. TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`);
  state.setGameActive(false);
  state.setGamePhase(state.GAME_PHASES.GAME_OVER); // Explicitly set game over phase
  ui.setBoardClickable(false); ui.clearSuggestedMoveHighlight(); ui.clearSelectedPieceHighlight();
  
  if (winnerSym) { // Check if winnerSym is a valid symbol
    ui.launchConfetti(); ui.highlightWinner(winningCells); sound.playSound('win');
    const winnerName = player.getPlayerName(winnerSym); // This function already formats it well
    console.log(`gameLogic.endGame: Winner name determined: '${winnerName}' for symbol '${winnerSym}'`);
    ui.updateStatus(`${winnerName} GANA!`); // Use the specific winner message
  } else {
    // This case should ideally only be for draws, which are handled by endDraw().
    // If endGame is called with no winnerSym, it indicates an issue or an unexpected state.
    console.error(`gameLogic.endGame: Called with no winnerSymbol! This should be a draw or an error. Displaying 'Juego terminado'.`);
    ui.updateStatus('Juego terminado'); // Fallback message
  }

  state.setLastWinner(winnerSym); state.setPreviousGameExists(true);
  // Score update logic
  if(state.pvpRemoteActive || state.vsCPU){
    if(winnerSym === state.myEffectiveIcon) state.incrementMyWins();
    else if (winnerSym === state.opponentEffectiveIcon) state.incrementOpponentWins();
  } else { // Local PvP
    if(winnerSym === state.gameP1Icon) state.incrementMyWins();
    else if (winnerSym === state.gameP2Icon) state.incrementOpponentWins();
  }
  localStorage.setItem('myWinsTateti',state.myWins.toString()); localStorage.setItem('opponentWinsTateti',state.opponentWins.toString());
  updateScoreboardHandler();

  // P2P restart logic: The other AI suggested winner initiates.
  // Your current system uses restart_request/ack. Let's stick to NO auto-restart for P2P for now.
  // If you want the winner to initiate, the client detecting the win would call init()
  // and then eventListeners.js would send the new empty state.
  if(!state.pvpRemoteActive){
    console.log("endGame: Scheduling local/CPU restart.");
    setTimeout(init,state.AUTO_RESTART_DELAY_WIN);
  } else {
    console.log("endGame: P2P game ended. Winner declared. Waiting for restart action (e.g., restart_request).");
    // The client that detected the win (and called endGame) will send its final state (gameActive:false, winner:winnerSym)
    // The other client will receive this. Both will wait for a restart action.
  }
}

export function endDraw() { /* ... (Keep existing endDraw, but ensure no auto-P2P restart here either) ... */ 
  console.log(`gameLogic.endDraw. TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`);
  state.setGameActive(false); state.setGamePhase(state.GAME_PHASES.GAME_OVER);
  ui.setBoardClickable(false); ui.clearSuggestedMoveHighlight(); ui.clearSelectedPieceHighlight();
  ui.playDrawAnimation(); sound.playSound('draw'); ui.updateStatus('¡EMPATE!');
  state.incrementDraws(); state.setLastWinner(null); state.setPreviousGameExists(true);
  localStorage.setItem('drawsTateti',state.draws.toString()); updateScoreboardHandler();
  if(!state.pvpRemoteActive){console.log("endDraw: Scheduling local/CPU restart."); setTimeout(init,state.AUTO_RESTART_DELAY_DRAW);}
  else{console.log("endDraw: P2P game ended in a draw. Waiting for restart action.");}
}