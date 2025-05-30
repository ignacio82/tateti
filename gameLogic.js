// gameLogic.js - Fixed endGame and endDraw functions for proper P2P restart
import * as state   from './state.js';
import * as ui      from './ui.js';
import * as player  from './player.js';
import * as sound   from './sound.js';
import { calculateBestMove,
         cpuMove,
         cpuMoveThreePiece,
         calculateBestSlideForHint } from './cpu.js';
import * as peerConnection from './peerConnection.js';

// boardToPhase function (ensure this is robust)
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
  const dr = Math.abs(r1-r2); const dc = Math.abs(c1-c2); // Ensure dr and dc are calculated
  return dr <=1 && dc <=1 && (dr + dc > 0); // Ensure it's not the same cell
};
export function hasValidMoves(sym,board){
  for(let i=0;i<board.length;i++){ if(board[i]!==sym)continue;
    for(let j=0;j<board.length;j++){ if(board[j]===null && areCellsAdjacent(i,j)) return true;}}
  return false;
}
export function checkDraw(board=state.board){
  if(!state.gameActive)return false;
  if(state.gameVariant===state.GAME_VARIANTS.THREE_PIECE && state.gamePhase===state.GAME_PHASES.MOVING){
    const p1Icon = state.gameP1Icon || (Object.keys(state.playerPiecesOnBoard)[0]); // Fallback if not set
    const p2Icon = state.gameP2Icon || (Object.keys(state.playerPiecesOnBoard)[1]); // Fallback
    if (!p1Icon || !p2Icon) return false; // Not enough info for a draw check yet
    return !checkWin(p1Icon,board) && !checkWin(p2Icon,board) && !hasValidMoves(p1Icon,board) && !hasValidMoves(p2Icon,board);
  }
  // For classic, or if anything above fails to determine draw for 3-piece moving.
  return board.every(c=>c!==null) && !checkWin(state.gameP1Icon,board) && !checkWin(state.gameP2Icon,board);
}

export function switchPlayer() {
  const capturedPhaseBeforeSwitch = state.gamePhase;
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

  // Moved draw check after status update and player switch for accuracy
  if (state.gameActive && state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && state.gamePhase === state.GAME_PHASES.MOVING) {
      if (checkDraw(state.board)) {
        endDraw(); // This will set gameActive false
        // No return true here, as endDraw handles game end.
        // If a draw occurs, subsequent logic like showEasyModeHint shouldn't run for a non-active game.
      }
  }

  const isMyTurnForHint = (state.pvpRemoteActive && state.isMyTurnInRemote) || (!state.pvpRemoteActive && !state.vsCPU) || (!state.pvpRemoteActive && state.vsCPU && state.currentPlayer === state.myEffectiveIcon);
  if (state.gameActive && isMyTurnForHint) showEasyModeHint(); // Only show hint if game is still active
}

export function init() {
  console.log(`gameLogic.init() called. Timestamp: ${new Date().toISOString()}`);
  ui.removeConfetti(); ui.hideOverlay(); ui.hideQRCode(); ui.clearBoardUI();
  state.resetGameFlowState();
  state.setBoard(Array(9).fill(null)); state.setGameActive(false);
  player.determineEffectiveIcons();
  const initialPhase = boardToPhase(state.board, state.gameVariant, state.gamePhase); // state.gamePhase is PLACING from reset
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
  } else { // Local PvP or Vs CPU
    console.log(`gameLogic.init(): Local or CPU game. TC: ${state.turnCounter}.`); state.setGameActive(true);
    let startingPlayer;
    if (state.whoGoesFirstSetting === 'random') { //
        startingPlayer = Math.random() < 0.5 ? state.gameP1Icon : state.gameP2Icon;
    } else if (state.whoGoesFirstSetting === 'loser' && state.previousGameExists && state.lastWinner !== null) { //
        startingPlayer = (state.lastWinner === state.gameP1Icon) ? state.gameP2Icon : state.gameP1Icon;
    } else { // Default to P1 (gameP1Icon)
        startingPlayer = state.gameP1Icon;
    }
    state.setCurrentPlayer(startingPlayer);
    ui.updateStatus(`Turno del ${player.getPlayerName(state.currentPlayer)}`);

    if (state.vsCPU && state.currentPlayer === state.gameP2Icon) {
        ui.setBoardClickable(false);
        setTimeout(() => {
            if(state.gameActive) cpuMoveHandler();
            if(state.gameActive) ui.setBoardClickable(true);
        }, 700 + Math.random() * 300);
    } else {
        ui.setBoardClickable(true);
    }
  }

  updateAllUITogglesHandler(); // Call the exported wrapper
  updateScoreboardHandler(); // Call the exported wrapper

  if(state.gameActive && !(state.pvpRemoteActive && !state.gamePaired)) {
    // Check if audio context is ready before playing sound, or defer
    if (sound.getAudioContext() && sound.getAudioContext().state === 'running') {
        sound.playSound('reset');
    } else {
        console.log("Audio context not ready for init sound, will play on user gesture.");
    }
  }
  if (ui.sideMenu && ui.sideMenu.classList.contains('open')) ui.sideMenu.classList.remove('open');
}

// Applying "Other AI's" suggested structure for makeMove
export function makeMove(idx, sym) { // sym is the player making the move
  console.log(`gameLogic.makeMove: CALLED by ${sym} for cell ${idx}. Initial state.gamePhase: ${state.gamePhase}. Board pieces: ${state.board.filter(Boolean).length}. Timestamp: ${new Date().toISOString()}`);

  if (!state.gameActive) {
    console.log(`gameLogic.makeMove: Move rejected (game not active).`); return false;
  }
  if (state.board[idx] != null) { // Cell must be empty
    console.log(`gameLogic.makeMove: Move rejected (cell ${idx} occupied by ${state.board[idx]}).`); return false;
  }

  // ① Update the global phase from the board *before* further checks specific to makeMove
  // Pass current state.gamePhase to respect GAME_OVER status.
  const phaseDerivedFromBoardEarly = boardToPhase(state.board, state.gameVariant, state.gamePhase);
  if (phaseDerivedFromBoardEarly !== state.gamePhase) {
    console.log(`gameLogic.makeMove (Early Phase Check): Phase re-evaluated. Was ${state.gamePhase}, became ${phaseDerivedFromBoardEarly}. Player: ${sym}.`);
    state.setGamePhase(phaseDerivedFromBoardEarly);
  }

  // ② If we're no longer in PLACING (e.g., board already has 6 pieces for 3-Piece mode),
  // makeMove should not proceed to place a piece. This is crucial for 3-Piece mode.
  if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && state.gamePhase !== state.GAME_PHASES.PLACING) {
    console.warn(`gameLogic.makeMove: Attempt to place piece by ${sym} but current phase is ${state.gamePhase}. For 3-Pieces, makeMove is only for PLACING phase. Move rejected. Player should be moving a piece via movePiece.`);
    // ui.updateStatus("Debes mover una pieza existente."); // Optionally inform the user
    return false; // Critical: Do not allow "placing" if not in "PLACING" phase for 3-piece.
  }

  // ③ If in PLACING phase (for 3-Piece variant), count how many pieces THIS player (`sym`) already has.
  if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE /* && state.gamePhase is PLACING due to check above */) {
    const piecesOfPlayerSym = state.board.filter(p => p === sym).length;
    if (piecesOfPlayerSym >= state.MAX_PIECES_PER_PLAYER) {
      console.warn(`gameLogic.makeMove: Player ${sym} (in PLACING phase) already has ${piecesOfPlayerSym} pieces (max ${state.MAX_PIECES_PER_PLAYER}). Cannot place more. Move rejected.`);
      // The other AI suggested: state.setGamePhase(state.GAME_PHASES.MOVING); // Corrective action
      // This can be aggressive. For now, just rejecting is safer. If this log appears frequently,
      // it means handleCellClick is not routing to movePiece when it should.
      return false;
    }
  }

  // ④ …If all checks passed, proceed with placement logic…
  console.log(`gameLogic.makeMove: Placing piece for ${sym} at ${idx}.`);
  const newBoard = [...state.board]; newBoard[idx] = sym;
  state.setBoard(newBoard);
  ui.updateCellUI(idx, sym); 
  sound.playSound('move');
  sound.vibrate(sound.HAPTIC_PATTERNS.PLACE_PIECE); // ADDED: Haptic feedback for piece placement

  // ⑤ After a *successful* placement, update phase again from the new board state.
  //    This is important if this placement was the one to fill the board (e.g., 6th piece in 3-Piece).
  const phaseAfterPlacement = boardToPhase(state.board, state.gameVariant, state.gamePhase); // Pass current phase again for GAME_OVER check
  if (phaseAfterPlacement !== state.gamePhase) {
    console.log(`gameLogic.makeMove: Phase updated after successful placement. Was ${state.gamePhase}, became ${phaseAfterPlacement}. Player: ${sym}.`);
    state.setGamePhase(phaseAfterPlacement);
  }
  console.log(`gameLogic.makeMove: After successful placement and final phase check. Current state.gamePhase: ${state.gamePhase}. Timestamp: ${new Date().toISOString()}`);

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
  switchPlayer(); // switchPlayer will use the (now correctly set) state.gamePhase
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
  // At the start of movePiece, re-evaluate phase from board to be absolutely sure.
  const currentPhaseFromBoard = boardToPhase(state.board, state.gameVariant, state.gamePhase);
  if (currentPhaseFromBoard !== state.gamePhase) {
      console.warn(`gameLogic.movePiece: Phase mismatch at entry! state.gamePhase was ${state.gamePhase}, but board suggests ${currentPhaseFromBoard}. Updating phase to ${currentPhaseFromBoard}.`);
      state.setGamePhase(currentPhaseFromBoard);
  }

  if (!state.gameActive || state.gameVariant !== state.GAME_VARIANTS.THREE_PIECE || state.gamePhase !== state.GAME_PHASES.MOVING) {
    console.warn(`movePiece Rejected: Pre-conditions not met (Active: ${state.gameActive}, Variant: ${state.gameVariant}, Phase: ${state.gamePhase}). This move will be rejected.`); return false;
  }
  if (state.board[fromIdx]!==sym || state.board[toIdx]!==null || !areCellsAdjacent(fromIdx,toIdx)){
    console.warn(`movePiece Rejected: Invalid move conditions (board[from]: ${state.board[fromIdx]}, board[to]: ${state.board[toIdx]}, adjacent: ${areCellsAdjacent(fromIdx,toIdx)}).`); return false;
  }
  const newBoard = [...state.board]; newBoard[toIdx]=sym; newBoard[fromIdx]=null;
  state.setBoard(newBoard);
  ui.updateCellUI(toIdx,sym); ui.updateCellUI(fromIdx,null); 
  sound.playSound('move');
  sound.vibrate(sound.HAPTIC_PATTERNS.PLACE_PIECE); // ADDED: Haptic feedback for piece movement (same as placement)
  state.setSelectedPieceIndex(null); ui.clearSelectedPieceHighlight();
  console.log(`movePiece: Successful move by ${sym} from ${fromIdx} to ${toIdx}.`);

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
  return true;
}

export function endGame(winnerSym, winningCells) {
  console.log(`gameLogic.endGame: Winner symbol raw: '${winnerSym}'. TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`);
  state.setGameActive(false);
  state.setGamePhase(state.GAME_PHASES.GAME_OVER);
  ui.setBoardClickable(false); ui.clearSuggestedMoveHighlight(); ui.clearSelectedPieceHighlight();
  if (winnerSym) {
    ui.launchConfetti(); ui.highlightWinner(winningCells); 
    sound.playSound('win');
    // Determine if "my" player (the one using the device/browser) won
    const myPlayerWon = (state.pvpRemoteActive && winnerSym === state.myEffectiveIcon) ||
                       (!state.pvpRemoteActive && !state.vsCPU && winnerSym === state.myEffectiveIcon) || // Local PvP, I am P1 and I won
                       (!state.pvpRemoteActive && state.vsCPU && winnerSym === state.myEffectiveIcon); // Vs CPU and I won
    
    if (myPlayerWon) {
        sound.vibrate(sound.HAPTIC_PATTERNS.WIN); // ADDED: Haptic feedback for winning
    } else {
        // Opponent won (or in local PvP, P2 won if I was P1)
        sound.vibrate(sound.HAPTIC_PATTERNS.LOSE_DRAW); // ADDED: Haptic feedback for losing
    }

    const winnerName = player.getPlayerName(winnerSym);
    console.log(`gameLogic.endGame: Winner name determined: '${winnerName}' for symbol '${winnerSym}'`);
    ui.updateStatus(`${winnerName} GANA!`);
  } else {
    console.error(`gameLogic.endGame: Called with no winnerSymbol! This implies a draw might have been misclassified or an error occurred.`);
    ui.updateStatus('Juego terminado'); // Fallback
    sound.vibrate(sound.HAPTIC_PATTERNS.LOSE_DRAW); // ADDED: Haptic feedback for game end (non-win for player)
  }
  state.setLastWinner(winnerSym); state.setPreviousGameExists(true);
  if(state.pvpRemoteActive||state.vsCPU){if(winnerSym===state.myEffectiveIcon)state.incrementMyWins();else if (winnerSym===state.opponentEffectiveIcon)state.incrementOpponentWins();}
  else{if(winnerSym===state.gameP1Icon)state.incrementMyWins();else if (winnerSym===state.gameP2Icon)state.incrementOpponentWins();}
  localStorage.setItem('myWinsTateti',state.myWins.toString()); localStorage.setItem('opponentWinsTateti',state.opponentWins.toString());
  updateScoreboardHandler();

  if (!state.pvpRemoteActive || !state.gamePaired) {
    // For local or CPU games - restart immediately
    console.log("endGame: Scheduling local/CPU restart.");
    setTimeout(init, state.AUTO_RESTART_DELAY_WIN);
  } else {
    // For P2P games - DO NOT send reset_game message, just restart locally after delay
    console.log("endGame: P2P game ended. Winner declared. Scheduling local restart only (no peer message).");
    setTimeout(() => {
      console.log("endGame: Calling local init() for P2P restart.");
      init(); // Just restart locally, don't send reset_game message
    }, state.AUTO_RESTART_DELAY_WIN);
  }
}

export function endDraw() {
  console.log(`gameLogic.endDraw. TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`);
  state.setGameActive(false); state.setGamePhase(state.GAME_PHASES.GAME_OVER);
  ui.setBoardClickable(false); ui.clearSuggestedMoveHighlight(); ui.clearSelectedPieceHighlight();
  ui.playDrawAnimation(); 
  sound.playSound('draw');
  sound.vibrate(sound.HAPTIC_PATTERNS.LOSE_DRAW); // ADDED: Haptic feedback for draw
  ui.updateStatus('¡EMPATE!');
  state.incrementDraws(); state.setLastWinner(null); state.setPreviousGameExists(true);
  localStorage.setItem('drawsTateti', state.draws.toString()); updateScoreboardHandler();

  if (!state.pvpRemoteActive || !state.gamePaired) {
    // For local or CPU games - restart immediately
    console.log("endDraw: Scheduling local/CPU restart.");
    setTimeout(init, state.AUTO_RESTART_DELAY_DRAW);
  } else {
    // For P2P games - DO NOT send reset_game message, just restart locally after delay
    console.log("endDraw: P2P game ended in a draw. Scheduling local restart only (no peer message).");
    setTimeout(() => {
      console.log("endDraw: Calling local init() for P2P restart after draw.");
      init(); // Just restart locally, don't send reset_game message
    }, state.AUTO_RESTART_DELAY_DRAW);
  }
}