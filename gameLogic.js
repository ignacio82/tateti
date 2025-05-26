// gameLogic.js
// ─────────────────────────────────────────────────────────────────────────────
// Core mechanics for both Classic and “3 Piezas” variants of Ta-Te-Ti
// ─────────────────────────────────────────────────────────────────────────────

import * as state  from './state.js';
import * as ui     from './ui.js';
import * as player from './player.js';
import * as sound  from './sound.js';
// calculateBestMove is used internally by cpu.js, not directly by gameLogic.js
// import { calculateBestMove } from './cpu.js'; // This import is not needed here

/* ╭──────────────────────────────────────────────────────────╮
   │ 1.  Delegates that game.js can override                  │
   ╰──────────────────────────────────────────────────────────╯ */
let cpuMoveHandler = () => console.warn('cpuMoveHandler not set');
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
// showEasyModeHint is now also called from cpu.js after CPU's turn if it's human's turn next.
export function showEasyModeHint() { // Exported so cpu.js can call it if needed
  if (
    state.gameVariant === state.GAME_VARIANTS.CLASSIC &&
    state.vsCPU &&
    state.difficulty === 'easy' &&
    state.currentPlayer === state.gameP1Icon && // Check if it's Player 1's (human in vsCPU) turn
    state.gameActive
  ) {
    // Temporarily disable calculateBestMove import here if not directly used.
    // cpu.js should handle its own calculateBestMove.
    // const idx = calculateBestMove(
    //   state.board,
    //   state.gameP1Icon, // Hint for P1
    //   state.gameP2Icon, // Opponent is P2
    //   state.difficulty // This should be 'easy'
    // );
    // if (idx !== null && idx !== -1) ui.highlightSuggestedMove(idx);
    // For now, let's ensure no error here if calculateBestMove isn't available or needed directly in gameLogic for hint
    console.log("Easy mode hint would be shown for P1 if calculateBestMove was called here.");
    // If you want the hint, cpu.js needs to export calculateBestMove, and gameLogic needs to import it.
    // Or, the hint logic is self-contained without needing explicit calculation here.
    // For safety, let's assume the hint doesn't need to re-calculate here yet.
  } else ui.clearSuggestedMoveHighlight();
}

export const checkWin = (sym, board = state.board) => {
  const wins = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
    [0, 4, 8], [2, 4, 6]             // diags
  ];
  return wins.find(combo => combo.every(i => board[i] === sym)) || null;
};

const areCellsAdjacent = (a, b) => {
  const r1 = ~~(a / 3), c1 = a % 3,
        r2 = ~~(b / 3), c2 = b % 3;
  const dr = Math.abs(r1 - r2), dc = Math.abs(c1 - c2);
  return dr <= 1 && dc <= 1 && dr + dc > 0;
};

function hasValidMoves(sym, board) {
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
      // A draw occurs if the current player (whose turn it is) has no valid moves.
      // And no one has won yet.
      return !checkWin(state.gameP1Icon, board) && // Check P1 win
             !checkWin(state.gameP2Icon, board) && // Check P2 win
             !hasValidMoves(state.currentPlayer, board);
    }
    return false; // Cannot draw while still placing pieces in Three Piece mode
  }

  // Classic Tic-Tac-Toe
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
    // Check for draw after switching to the new player, if they have no moves.
    if (checkDraw(state.board)) { // checkDraw now considers the new currentPlayer
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
  } else { // Classic mode or if other conditions aren't met
    ui.updateStatus(`Turno del ${player.getPlayerName(state.currentPlayer)}`);
  }

  showEasyModeHint(); // Show hint for the new current player (if applicable)
}

/* ╭──────────────────────────────────────────────────────────╮
   │ 5.  Game initialisation / reset                          │
   ╰──────────────────────────────────────────────────────────╯ */
export function init() {
  ui.removeConfetti(); ui.hideOverlay(); ui.hideQRCode();
  ui.clearBoardUI();
  state.resetGameFlowState();

  const hostActive = ui.hostGameBtn?.classList.contains('active');
  // const joinActive = ui.joinGameBtn?.classList.contains('active'); // joinGameBtn removed
  // Simplified condition as joinGameBtn is removed
  if (!hostActive) { // If not hosting (implies not joining via button either)
    if (state.pvpRemoteActive && window.peerJsMultiplayer?.close)
      window.peerJsMultiplayer.close();
    state.setPvpRemoteActive(false); // Ensure remote state is cleared if not actively hosting/joining
    state.setGamePaired(false);
  }


  state.setBoard(Array(9).fill(null));
  state.setGameActive(false); // Will be set to true shortly if not waiting for remote pair
  player.determineEffectiveIcons();


  if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
    // state.resetPlayerPiecesOnBoard() called in state.resetGameFlowState()
  }

  if (state.pvpRemoteActive && state.gamePaired) {
    state.setCurrentPlayer(state.gameP1Icon); // Host (P1 on board) usually starts
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
    ui.setBoardClickable(false);
    // Status message is usually set by peerConnection.js (e.g., "Comparte el enlace...")
    state.setGameActive(false); // Game is not active until paired
  }
  else { // Local PvP or Vs CPU
    state.setGameActive(true);

    let startPlayer = state.gameP1Icon;
    if (state.whoGoesFirstSetting === 'random') {
      startPlayer = Math.random() < 0.5 ? state.gameP1Icon : state.gameP2Icon;
    } else if (
      state.whoGoesFirstSetting === 'loser' &&
      state.previousGameExists &&
      state.lastWinner !== null // Ensure there was a definitive last winner
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
    } else {
      ui.updateStatus(`Turno del ${player.getPlayerName(startPlayer)}`);
    }

    if (
      state.vsCPU &&
      state.gameVariant === state.GAME_VARIANTS.CLASSIC &&
      state.currentPlayer === state.gameP2Icon // CPU (P2) starts
    ) {
      ui.setBoardClickable(false);
      ui.clearSuggestedMoveHighlight();
      setTimeout(async () => { // Make the callback async
        if (state.gameActive) {
          await cpuMoveHandler(); // Await the async cpuMakeMove
        }
        // cpuMakeMove is responsible for setting board clickable and status for P1 after its move
        // No explicit ui.setBoardClickable(true) here for P1; handled by cpuMakeMove
      }, 700 + Math.random() * 300);
    } else { // Human starts, or not vsCPU mode, or not CPU's turn to start
      ui.setBoardClickable(true);
      showEasyModeHint(); // Show hint if it's human's turn and conditions met
    }
  }

  updateAllUITogglesHandler();
  updateScoreboardHandler();

  if (state.gameActive && !(state.pvpRemoteActive && !state.gamePaired)) {
    if (sound.getAudioContext()?.state === 'running') sound.playSound('reset');
  }

  if (ui.sideMenu?.classList.contains('open') && !(state.pvpRemoteActive && !state.gamePaired && state.iAmPlayer1InRemote)) {
     // Close menu unless we are a host waiting for connection (QR code might be up)
    ui.sideMenu.classList.remove('open');
  }
}

/* ╭──────────────────────────────────────────────────────────╮
   │ 6.  Placement phase (Classic + 3-Piezas PLACING)         │
   ╰──────────────────────────────────────────────────────────╯ */
export function makeMove(idx, sym) {
  if (state.board[idx] !== null || !state.gameActive) return false;

  ui.clearSuggestedMoveHighlight();
  ui.clearSelectedPieceHighlight(); // Clear piece selection if any

  if (
    state.gameVariant === state.GAME_VARIANTS.THREE_PIECE &&
    state.gamePhase === state.GAME_PHASES.PLACING
  ) {
    const tokensOnBoard = state.board.filter(s => s === sym).length;
    if (tokensOnBoard >= state.MAX_PIECES_PER_PLAYER) {
      ui.updateStatus(
        `${player.getPlayerName(sym)}: Ya tienes 3 piezas. Fase de movimiento iniciará.`
      );
      // Do not return false yet, let the piece placement proceed if cell is empty,
      // then check for phase transition. Or, prevent move if already 3:
      // For now, this message is just a warning. The actual phase transition is checked later.
      // If we strictly prevent placing more than 3: return false;
      // However, current logic allows placing, then transitions.
    }
  }

  const newBoard = [...state.board];
  newBoard[idx] = sym;
  state.setBoard(newBoard);
  ui.updateCellUI(idx, sym);
  sound.playSound('move');

  const winCombo = checkWin(sym);
  if (winCombo) {
    endGame(sym, winCombo);
    return true;
  }

  if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && state.gamePhase === state.GAME_PHASES.PLACING) {
    const p1Pieces = newBoard.filter(s => s === state.gameP1Icon).length;
    const p2Pieces = newBoard.filter(s => s === state.gameP2Icon).length;
    if (p1Pieces === state.MAX_PIECES_PER_PLAYER && p2Pieces === state.MAX_PIECES_PER_PLAYER) {
         state.setGamePhase(state.GAME_PHASES.MOVING);
         // Status update for moving phase will be handled by switchPlayer or next turn's start
    }
  } else if (checkDraw(newBoard)) { // checkDraw for classic or if not in placing phase of 3-piece
    endDraw();
    return true;
  }

  switchPlayer(); // This sets the new currentPlayer and updates status for them

  updateAllUITogglesHandler();

  // CPU response logic (only for Classic Tic-Tac-Toe)
  // This is after the current player (sym) has moved and player has been switched.
  // So, state.currentPlayer is now the one who should respond.
  if (
    state.vsCPU &&
    state.gameVariant === state.GAME_VARIANTS.CLASSIC &&
    state.currentPlayer === state.gameP2Icon && // If it's now CPU's (P2) turn
    state.gameActive
  ) {
    ui.setBoardClickable(false); // Disable board for human while CPU "thinks"
    setTimeout(async () => { // Make the callback async
      if (state.gameActive) { // Check if game is still active (e.g. human didn't win)
        await cpuMoveHandler(); // Await the async cpuMakeMove
      }
      // After cpuMoveHandler finishes, cpuMakeMove is responsible for:
      // 1. Making CPU's move (which calls makeMove -> switchPlayer -> sets currentPlayer to P1)
      // 2. If game continues and it's P1's turn, making board clickable and updating status for P1.
      // No further ui.setBoardClickable(true) or status update for P1 needed here.
    }, 700 + Math.random() * 300);
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
  )
    return false;

  if (state.board[fromIdx] !== sym || state.board[toIdx] !== null) return false;
  if (!areCellsAdjacent(fromIdx, toIdx)) {
    ui.updateStatus(`${player.getPlayerName(sym)}: Inválido. Mueve a casilla adyacente.`);
    state.setSelectedPieceIndex(null); // Reset selection on invalid move attempt
    ui.clearSelectedPieceHighlight();
    return false;
  }

  const newBoard = [...state.board];
  newBoard[toIdx] = sym;
  newBoard[fromIdx] = null;
  state.setBoard(newBoard);
  ui.updateCellUI(toIdx, sym);
  ui.updateCellUI(fromIdx, null);
  sound.playSound('move');
  state.setSelectedPieceIndex(null); // Clear selection after successful move
  ui.clearSelectedPieceHighlight();

  const winCombo = checkWin(sym);
  if (winCombo) {
    endGame(sym, winCombo);
    return true;
  }

  // Check for draw: if the *next* player (after switching) has no valid moves
  const nextPlayer = sym === state.gameP1Icon ? state.gameP2Icon : state.gameP1Icon;
  if (!hasValidMoves(nextPlayer, newBoard)) {
    endDraw(); // Pass the current board state
    return true;
  }

  switchPlayer(); // Sets new currentPlayer and updates status
  // If checkDraw needs to be called for the new current player, it's handled in switchPlayer
  return true;
}

/* ╭──────────────────────────────────────────────────────────╮
   │ 8.  Game-over helpers                                    │
   ╰──────────────────────────────────────────────────────────╯ */
export function endGame(winnerSym, winningCells) {
  state.setGameActive(false);
  state.setGamePhase(state.GAME_PHASES.GAME_OVER); // Set game over phase
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
    else if (winnerSym === state.opponentEffectiveIcon) state.incrementOpponentWins();
  } else { // Local PvP
    if (winnerSym === state.gameP1Icon) state.incrementMyWins(); // Assuming P1 is 'myWins'
    else state.incrementOpponentWins(); // P2 is 'opponentWins'
  }
  localStorage.setItem('myWinsTateti', state.myWins.toString());
  localStorage.setItem('opponentWinsTateti', state.opponentWins.toString());
  updateScoreboardHandler();

  setTimeout(init, state.AUTO_RESTART_DELAY_WIN);
}

export function endDraw() {
  state.setGameActive(false);
  state.setGamePhase(state.GAME_PHASES.GAME_OVER); // Set game over phase
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
