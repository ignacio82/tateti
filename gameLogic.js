// gameLogic.js
// ─────────────────────────────────────────────────────────────────────────────
// Core mechanics for both Classic and “3 Piezas” variants of Ta-Te-Ti Deluxe
// ─────────────────────────────────────────────────────────────────────────────

import * as state   from './state.js';
import * as ui      from './ui.js';
import * as player  from './player.js';
import * as sound   from './sound.js';
import { calculateBestMove, cpuMove, cpuMoveThreePiece } from './cpu.js'; // Ensure cpuMoveThreePiece is imported

/* ╭──────────────────────────────────────────────────────────╮
   │ 1.  Delegates that game.js can override                  │
   ╰──────────────────────────────────────────────────────────╯ */
let cpuMoveHandler = () => console.warn('cpuMoveHandler not set');
// The actual assignment of the handler is done in game.js using this setter.
// It will look like:
// import { cpuMove, cpuMoveThreePiece } from './cpu.js';
// gameLogic.setCpuMoveHandler(() =>
//   state.gameVariant === state.GAME_VARIANTS.THREE_PIECE
//     ? cpuMoveThreePiece()
//     : cpuMove()
// );
export const setCpuMoveHandler = h => (cpuMoveHandler = h);


let _updateScoreboardHandler = () => ui.updateScoreboard();
export const setUpdateScoreboardHandler = h => (_updateScoreboardHandler = h);
const updateScoreboardHandler = () => _updateScoreboardHandler?.();

let _updateAllUITogglesHandler = () => ui.updateAllUIToggleButtons();
export const setUpdateAllUITogglesHandler = h => (_updateAllUITogglesHandler = h);
export const updateAllUITogglesHandler = () => _updateAllUITogglesHandler?.();

/* ╭──────────────────────────────────────────────────────────╮
   │ 2.  Utility helpers                                      │
   ╰──────────────────────────────────────────────────────────╯ */
export function showEasyModeHint() {
  // Show a suggested move only in Classic vs-CPU Easy when it’s the human’s turn
  if (
    state.gameVariant === state.GAME_VARIANTS.CLASSIC &&
    state.vsCPU &&
    state.difficulty === 'easy' &&
    state.currentPlayer === state.gameP1Icon &&
    state.gameActive
  ) {
    // Use hard search so the hint is genuinely good
    const idx = calculateBestMove(
      state.board,
      state.gameP1Icon,            // pretend “human” is the AI
      state.gameP2Icon,
      'hard'
    );
    if (idx !== -1 && idx != null) ui.highlightSuggestedMove(idx);
    else                           ui.clearSuggestedMoveHighlight();
  } else {
    ui.clearSuggestedMoveHighlight();
  }
}

export const checkWin = (sym, board = state.board) => {
  const wins = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],          // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8],          // cols
    [0, 4, 8], [2, 4, 6]                      // diags
  ];
  return wins.find(combo => combo.every(i => board[i] === sym)) || null;
};

export const areCellsAdjacent = (a, b) => { // Exported for use in cpu.js
  const r1 = ~~(a / 3), c1 = a % 3,
        r2 = ~~(b / 3), c2 = b % 3;
  const dr = Math.abs(r1 - r2), dc = Math.abs(c1 - c2);
  return dr <= 1 && dc <= 1 && dr + dc > 0;
};

export function hasValidMoves(sym, board) { // Exported for use in cpu.js
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== sym) continue;
    for (let j = 0; j < board.length; j++) {
      if (i === j) continue;
      if (board[j] === null && areCellsAdjacent(i, j)) return true;
    }
  }
  return false;
}

/* ╭──────────────────────────────────────────────────────────╮
   │ 3.  Draw detection                                       │
   ╰──────────────────────────────────────────────────────────╯ */
export function checkDraw(board = state.board) {
  if (!state.gameActive) return false;

  if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
    if (state.gamePhase === state.GAME_PHASES.MOVING) {
      // Draw if no player has won AND the current player has no valid moves.
      // Also check if the *other* player also has no valid moves for a true stalemate.
      const p1CanMove = hasValidMoves(state.gameP1Icon, board);
      const p2CanMove = hasValidMoves(state.gameP2Icon, board);
      return !checkWin(state.gameP1Icon, board) &&
             !checkWin(state.gameP2Icon, board) &&
             !p1CanMove && !p2CanMove;
    }
    return false; // Draw not possible in placement phase by board alone
  }

  // Classic
  return (
    board.every(c => c !== null) &&
    !checkWin(state.gameP1Icon, board) &&
    !checkWin(state.gameP2Icon, board)
  );
}

/* ╭──────────────────────────────────────────────────────────╮
   │ 4.  Turn switch & status prompts                         │
   ╰──────────────────────────────────────────────────────────╯ */
export function switchPlayer() {
  state.setCurrentPlayer(
    state.currentPlayer === state.gameP1Icon ? state.gameP2Icon : state.gameP1Icon
  );
  state.setSelectedPieceIndex(null);
  ui.clearSelectedPieceHighlight();

  if (
    state.gameVariant === state.GAME_VARIANTS.THREE_PIECE &&
    state.gamePhase === state.GAME_PHASES.MOVING
  ) {
    ui.updateStatus(
      `${player.getPlayerName(state.currentPlayer)}: Selecciona tu pieza para mover.`
    );
    if (checkDraw(state.board)) { // Check for draw after switching to the new player
      endDraw();
      return;
    }
  } else if (
    state.gameVariant === state.GAME_VARIANTS.THREE_PIECE &&
    state.gamePhase === state.GAME_PHASES.PLACING
  ) {
    const placed = state.board.filter(s => s === state.currentPlayer).length;
    ui.updateStatus(
      `${player.getPlayerName(state.currentPlayer)}: Coloca tu pieza (${placed + 1}/3).`
    );
  } else { // Classic Ta-Te-Ti
    ui.updateStatus(`Turno del ${player.getPlayerName(state.currentPlayer)}`);
  }

  showEasyModeHint(); // hint for the new player (Classic mode only)
}

/* ╭──────────────────────────────────────────────────────────╮
   │ 5.  Game initialisation / reset                          │
   ╰──────────────────────────────────────────────────────────╯ */
export function init() {
  ui.removeConfetti(); ui.hideOverlay(); ui.hideQRCode();
  ui.clearBoardUI();
  state.resetGameFlowState();

  const hostActive = ui.hostGameBtn?.classList.contains('active');
  if (!hostActive) {
    if (state.pvpRemoteActive && window.peerJsMultiplayer?.close)
      window.peerJsMultiplayer.close();
    state.setPvpRemoteActive(false);
    state.setGamePaired(false);
  }

  state.setBoard(Array(9).fill(null));
  state.setGameActive(false); // Will be set to true below if not remote waiting
  player.determineEffectiveIcons();

  // Reset player pieces for THREE_PIECE variant is handled in resetGameFlowState

  if (state.pvpRemoteActive && state.gamePaired) {
    state.setCurrentPlayer(state.gameP1Icon); // P1 (host) usually starts
    state.setIsMyTurnInRemote(state.currentPlayer === state.myEffectiveIcon);
    ui.updateStatus(
      state.isMyTurnInRemote
        ? `Tu Turno ${player.getPlayerName(state.currentPlayer)}`
        : `Esperando a ${player.getPlayerName(state.currentPlayer)}...`
    );
    ui.setBoardClickable(state.isMyTurnInRemote);
    state.setGameActive(true);
  }
  else if (state.pvpRemoteActive && !state.gamePaired) {
    // Waiting for connection, board not clickable, game not active
    ui.setBoardClickable(false);
    state.setGameActive(false);
  }
  else {                                   // local PvP or vs-CPU
    state.setGameActive(true);

    let startPlayer = state.gameP1Icon;
    if (state.whoGoesFirstSetting === 'random') {
      startPlayer = Math.random() < 0.5 ? state.gameP1Icon : state.gameP2Icon;
    } else if (
      state.whoGoesFirstSetting === 'loser' &&
      state.previousGameExists &&
      state.lastWinner !== null // Ensure there was a winner, not a draw
    ) {
      startPlayer = state.lastWinner === state.gameP1Icon ? state.gameP2Icon : state.gameP1Icon;
    }
    state.setCurrentPlayer(startPlayer);

    if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
      state.setGamePhase(state.GAME_PHASES.PLACING);
      const placedCount = state.board.filter(s => s === startPlayer).length;
      ui.updateStatus(
        `${player.getPlayerName(startPlayer)}: Coloca tu pieza (${placedCount + 1}/3).`
      );
    } else { // Classic
      ui.updateStatus(`Turno del ${player.getPlayerName(startPlayer)}`);
    }

    if (state.vsCPU && state.currentPlayer === state.gameP2Icon) {
      ui.setBoardClickable(false);
      ui.clearSuggestedMoveHighlight(); // Clear any previous hint
      setTimeout(async () => {
        if (state.gameActive) await cpuMoveHandler(); // Universal CPU call
      }, 700 + Math.random() * 300);
    } else {
      ui.setBoardClickable(true);
      if (state.gameVariant === state.GAME_VARIANTS.CLASSIC) { // Only show hint for classic
        showEasyModeHint();
      }
    }
  }

  updateAllUITogglesHandler();
  updateScoreboardHandler();

  if (state.gameActive && !(state.pvpRemoteActive && !state.gamePaired)) {
    if (sound.getAudioContext()?.state === 'running') sound.playSound('reset');
  }

  if (ui.sideMenu?.classList.contains('open') &&
      !(state.pvpRemoteActive && !state.gamePaired && state.iAmPlayer1InRemote)) {
    ui.sideMenu.classList.remove('open');
  }
}

/* ╭──────────────────────────────────────────────────────────╮
   │ 6.  Placement phase (Classic + 3-Piezas PLACING)         │
   ╰──────────────────────────────────────────────────────────╯ */
export function makeMove(idx, sym) {
  if (state.board[idx] !== null || !state.gameActive) return false;

  ui.clearSuggestedMoveHighlight();
  ui.clearSelectedPieceHighlight(); // Should be cleared if a move is made

  let pieceLimitReached = false;
  if (
    state.gameVariant === state.GAME_VARIANTS.THREE_PIECE &&
    state.gamePhase === state.GAME_PHASES.PLACING
  ) {
    const tokensOnBoard = state.board.filter(s => s === sym).length;
    if (tokensOnBoard >= state.MAX_PIECES_PER_PLAYER) {
      // This case should ideally not be reached if UI/state prevents it,
      // but as a safeguard:
      console.warn(`${player.getPlayerName(sym)} trying to place more than ${state.MAX_PIECES_PER_PLAYER} pieces.`);
      pieceLimitReached = true; // For local state, UI should reflect this.
      // Do not proceed with move if limit is already met for *this* player.
      // The check for transitioning to MOVING phase is after the move.
      return false;
    }
  }

  const newBoard = [...state.board];
  newBoard[idx] = sym;
  state.setBoard(newBoard);
  ui.updateCellUI(idx, sym);
  sound.playSound('move');

  const winCombo = checkWin(sym, newBoard); // Check win on new board
  if (winCombo) {
    endGame(sym, winCombo);
    return true;
  }

  // Transition to MOVING phase in THREE_PIECE if all pieces are placed
  if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE &&
      state.gamePhase === state.GAME_PHASES.PLACING) {
    const p1Pieces = newBoard.filter(s => s === state.gameP1Icon).length;
    const p2Pieces = newBoard.filter(s => s === state.gameP2Icon).length;
    if (p1Pieces === state.MAX_PIECES_PER_PLAYER &&
        p2Pieces === state.MAX_PIECES_PER_PLAYER) {
      state.setGamePhase(state.GAME_PHASES.MOVING);
      // Status will be updated by switchPlayer or CPU move
    }
  } else if (checkDraw(newBoard)) { // Classic draw check
    endDraw();
    return true;
  }

  switchPlayer(); // This will update status for next player
  updateAllUITogglesHandler();

  // CPU's turn logic (common for both variants after a human move)
  if (state.vsCPU && state.currentPlayer === state.gameP2Icon && state.gameActive) {
    ui.setBoardClickable(false);
    // No hint clear here, cpuMove itself or next human turn hint will handle it
    setTimeout(async () => {
      if (state.gameActive) await cpuMoveHandler(); // Universal CPU call
    }, 700 + Math.random() * 300);
  } else if (state.gameActive && state.currentPlayer === state.gameP1Icon) {
    // Human's turn again (e.g. local PvP)
    ui.setBoardClickable(true);
    if (state.gameVariant === state.GAME_VARIANTS.CLASSIC) {
        showEasyModeHint();
    }
  }

  return true;
}

/* ╭──────────────────────────────────────────────────────────╮
   │ 7.  Moving phase (3-Piezas MOVING)                       │
   ╰──────────────────────────────────────────────────────────╯ */
export function movePiece(fromIdx, toIdx, sym) {
  if (
    !state.gameActive ||
    state.gameVariant !== state.GAME_VARIANTS.THREE_PIECE ||
    state.gamePhase !== state.GAME_PHASES.MOVING
  ) return false;

  if (state.board[fromIdx] !== sym || state.board[toIdx] !== null) {
      console.warn("Invalid movePiece attempt: piece not owned or target not empty.", {fromIdx, toIdx, sym, boardOwner: state.board[fromIdx], boardTarget: state.board[toIdx]});
      return false;
  }
  if (!areCellsAdjacent(fromIdx, toIdx)) {
    ui.updateStatus(`${player.getPlayerName(sym)}: Inválido. Mueve a casilla adyacente.`);
    state.setSelectedPieceIndex(null); // Clear selection on invalid move attempt
    ui.clearSelectedPieceHighlight();
    return false;
  }

  const newBoard = [...state.board];
  newBoard[toIdx]   = sym;
  newBoard[fromIdx] = null;
  state.setBoard(newBoard);
  ui.updateCellUI(toIdx, sym);
  ui.updateCellUI(fromIdx, null);
  sound.playSound('move');
  state.setSelectedPieceIndex(null); // Clear selection after successful move
  ui.clearSelectedPieceHighlight();

  const winCombo = checkWin(sym, newBoard);
  if (winCombo) {
    endGame(sym, winCombo);
    return true;
  }

  // Check for draw in THREE_PIECE moving phase (stalemate)
  // This check is crucial: if after a move, the *next* player has no valid moves.
  const nextPlayer = sym === state.gameP1Icon ? state.gameP2Icon : state.gameP1Icon;
  if (!hasValidMoves(nextPlayer, newBoard) && !hasValidMoves(sym, newBoard)) { // Check both players for true stalemate
      endDraw();
      return true;
  }


  switchPlayer(); // This updates status and currentPlayer
  updateAllUITogglesHandler();


  // CPU's turn logic (common for both variants after a human move)
  if (state.vsCPU && state.currentPlayer === state.gameP2Icon && state.gameActive) {
    ui.setBoardClickable(false);
    setTimeout(async () => {
      if (state.gameActive) await cpuMoveHandler(); // Universal CPU call
    }, 700 + Math.random() * 300);
  } else if (state.gameActive && state.currentPlayer === state.gameP1Icon) {
     // Human's turn again (e.g. local PvP)
    ui.setBoardClickable(true);
    // No hint for 3-piece mode during sliding by default
  }

  return true;
}

/* ╭──────────────────────────────────────────────────────────╮
   │ 8.  Game-over helpers                                    │
   ╰──────────────────────────────────────────────────────────╯ */
export function endGame(winnerSym, winningCells) {
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
    if (winnerSym === state.myEffectiveIcon)        state.incrementMyWins();
    else if (winnerSym === state.opponentEffectiveIcon) state.incrementOpponentWins();
  } else { // Local PvP
    if (winnerSym === state.gameP1Icon) state.incrementMyWins(); // Player 1 on board
    else                                 state.incrementOpponentWins(); // Player 2 on board
  }
  localStorage.setItem('myWinsTateti',      state.myWins.toString());
  localStorage.setItem('opponentWinsTateti',state.opponentWins.toString());
  updateScoreboardHandler();

  setTimeout(init, state.AUTO_RESTART_DELAY_WIN);
}

export function endDraw() {
  state.setGameActive(false);
  state.setGamePhase(state.GAME_PHASES.GAME_OVER);
  ui.setBoardClickable(false);
  ui.clearSuggestedMoveHighlight();
  ui.clearSelectedPieceHighlight();
  ui.playDrawAnimation();
  sound.playSound('draw');
  ui.updateStatus('¡EMPATE!');

  state.incrementDraws();
  state.setLastWinner(null); // No winner in a draw
  state.setPreviousGameExists(true);
  localStorage.setItem('drawsTateti', state.draws.toString());
  updateScoreboardHandler();

  setTimeout(init, state.AUTO_RESTART_DELAY_DRAW);
}