// gameLogic.js
// ─────────────────────────────────────────────────────────────────────────────
// Core mechanics for both Classic and “3 Piezas” variants of Ta-Te-Ti Deluxe
// ─────────────────────────────────────────────────────────────────────────────

import * as state   from './state.js';
import * as ui      from './ui.js';
import * as player  from './player.js';
import * as sound   from './sound.js';
import { calculateBestMove,
         cpuMove, // This will be used via cpuMoveHandler
         cpuMoveThreePiece, // This will be used via cpuMoveHandler
         calculateBestSlideForHint } from './cpu.js';
// Import peerConnection to send data directly from gameLogic if necessary (for restart_request)
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
    state.currentPlayer === state.gameP1Icon && // Hint for human player
    state.gameActive
  ) {
    const humanIcon = state.gameP1Icon;
    const cpuIcon   = state.gameP2Icon;

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
          // If no piece is selected, hint which piece to select
          if (state.selectedPieceIndex === null) {
            if (state.board[bestSlide.from] === humanIcon) {
              ui.highlightSuggestedMove(bestSlide.from);
            }
          } else if (state.selectedPieceIndex === bestSlide.from) {
            // If the best 'from' piece is selected, hint where to move it
            if (state.board[bestSlide.to] === null) {
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
  const r1 = Math.floor(a / 3), c1 = a % 3;
  const r2 = Math.floor(b / 3), c2 = b % 3;
  const dr = Math.abs(r1 - r2), dc = Math.abs(c1 - c2);
  return dr <= 1 && dc <= 1 && (dr + dc > 0); // Ensure they are different cells
};

export function hasValidMoves(sym, board) {
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== sym) continue;
    for (let j = 0; j < board.length; j++) {
      if (i === j) continue; // Cannot move to the same cell
      if (board[j] === null && areCellsAdjacent(i, j)) {
        return true; // Found at least one valid move
      }
    }
  }
  return false; // No valid moves found
}

/* ╭──────────────────────────────────────────────────────────╮
   │ 3. Draw detection                                       │
   ╰──────────────────────────────────────────────────────────╯ */
export function checkDraw(board = state.board) {
  if (!state.gameActive) return false;

  // For "3 Piezas" in MOVING phase, draw if no player can make a valid move
  if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE &&
      state.gamePhase === state.GAME_PHASES.MOVING) {
    const p1CanMove = hasValidMoves(state.gameP1Icon, board);
    const p2CanMove = hasValidMoves(state.gameP2Icon, board);
    return (
      !checkWin(state.gameP1Icon, board) && // No winner P1
      !checkWin(state.gameP2Icon, board) && // No winner P2
      !p1CanMove && !p2CanMove               // Neither player can move
    );
  }

  // For Classic mode (or 3 Piezas in PLACING if board gets full before phase change)
  // Draw if all cells are full and there's no winner
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
  state.setSelectedPieceIndex(null); // Clear selected piece when turn switches
  ui.clearSelectedPieceHighlight();

  if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE &&
      state.gamePhase === state.GAME_PHASES.MOVING) {
    ui.updateStatus(
      `${player.getPlayerName(state.currentPlayer)}: Selecciona tu pieza para mover.`
    );
    if (checkDraw(state.board)) { endDraw(); return; } // Check for draw after switching to player who might be stuck
  } else if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE &&
             state.gamePhase === state.GAME_PHASES.PLACING) {
    const placed = state.board.filter(s => s === state.currentPlayer).length;
    ui.updateStatus(
      `${player.getPlayerName(state.currentPlayer)}: Coloca tu pieza (${placed + 1}/3).`
    );
  } else { // Classic mode
    ui.updateStatus(`Turno del ${player.getPlayerName(state.currentPlayer)}`);
  }

  showEasyModeHint(); // Show hint for the new current player if applicable
}

/* ╭──────────────────────────────────────────────────────────╮
   │ 5. Game initialisation / reset                          │
   ╰──────────────────────────────────────────────────────────╯ */
export function init() {
  ui.removeConfetti();
  ui.hideOverlay();
  ui.hideQRCode();
  ui.clearBoardUI();
  state.resetGameFlowState(); // Resets gamePhase to PLACING among other things

  const hostActive = ui.hostGameBtn?.classList.contains('active');
  // This check might be too aggressive if we want to re-init into a paired game
  // if (state.pvpRemoteActive && !state.gamePaired && !hostActive) {
  //   if (window.peerJsMultiplayer?.close) {
  //     window.peerJsMultiplayer.close();
  //   }
  //   state.setPvpRemoteActive(false);
  //   state.setGamePaired(false);
  // }

  state.setBoard(Array(9).fill(null));
  state.setGameActive(false);
  player.determineEffectiveIcons();

  if (state.pvpRemoteActive && state.gamePaired) {
    // Who starts? For now, P1 (host) starts by convention in remote games.
    // This could be made more sophisticated (e.g. loser starts, or synced random choice)
    state.setCurrentPlayer(state.gameP1Icon);
    state.setIsMyTurnInRemote(
      state.currentPlayer === state.myEffectiveIcon
    );
    ui.updateStatus(
      state.isMyTurnInRemote
        ? `Tu Turno ${player.getPlayerName(state.currentPlayer)}`
        : `Esperando a ${player.getPlayerName(state.currentPlayer)}...`
    );
    ui.setBoardClickable(state.isMyTurnInRemote);
    state.setGameActive(true);
  } else if (state.pvpRemoteActive && !state.gamePaired) {
    // Waiting for a connection or re-connection
    ui.setBoardClickable(false);
    state.setGameActive(false);
    if (state.iAmPlayer1InRemote && state.currentHostPeerId) {
         ui.updateStatus(`Comparte el enlace o ID: ${state.currentHostPeerId}`);
         // ui.displayQRCode was handled by initializePeerAsHost, ensure it stays if needed
    } else if (!state.iAmPlayer1InRemote && state.currentHostPeerId){
        ui.updateStatus(`Intentando conectar a ${state.currentHostPeerId}...`);
    } else {
        ui.updateStatus("Modo Remoto: Esperando conexión.");
    }
  } else { // Local or CPU game
    state.setGameActive(true);
    let startPlayer = state.gameP1Icon;
    if (state.whoGoesFirstSetting === 'random') {
      startPlayer = Math.random() < 0.5 ? state.gameP1Icon : state.gameP2Icon;
    } else if (
      state.whoGoesFirstSetting === 'loser' &&
      state.previousGameExists &&
      state.lastWinner !== null
    ) {
      startPlayer =
        state.lastWinner === state.gameP1Icon
          ? state.gameP2Icon
          : state.gameP1Icon;
    } else if (state.whoGoesFirstSetting === 'loser' && state.previousGameExists && state.lastWinner === null) { // Draw, P1 starts
      startPlayer = state.gameP1Icon;
    }
    state.setCurrentPlayer(startPlayer);

    if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
      const placedCount = state.board.filter(
        s => s === startPlayer
      ).length;
      ui.updateStatus(
        `${player.getPlayerName(startPlayer)}: Coloca tu pieza (${placedCount + 1}/3).`
      );
    } else {
      ui.updateStatus(`Turno del ${player.getPlayerName(startPlayer)}`);
    }

    if (state.vsCPU && state.currentPlayer === state.gameP2Icon) {
      ui.setBoardClickable(false);
      setTimeout(async () => {
        if (state.gameActive) await cpuMoveHandler();
      }, 700 + Math.random() * 300);
    } else {
      ui.setBoardClickable(true);
      showEasyModeHint();
    }
  }

  updateAllUITogglesHandler();
  updateScoreboardHandler();

  if (
    state.gameActive &&
    !(state.pvpRemoteActive && !state.gamePaired && state.iAmPlayer1InRemote)
  ) {
    if (sound.getAudioContext()?.state === 'running') {
      sound.playSound('reset');
    }
  }

  if (
    ui.sideMenu?.classList.contains('open') &&
    !(state.pvpRemoteActive && !state.gamePaired && state.iAmPlayer1InRemote)
  ) {
    // ui.sideMenu.classList.remove('open'); // Keep menu open if user is there.
  }
}

/* ╭──────────────────────────────────────────────────────────╮
   │ 6. Placement phase (Classic + 3-Piezas PLACING)         │
   ╰──────────────────────────────────────────────────────────╯ */
export function makeMove(idx, sym) {
  if (state.board[idx] != null || !state.gameActive) return false;

  if (
    state.gameVariant === state.GAME_VARIANTS.THREE_PIECE &&
    state.gamePhase === state.GAME_PHASES.PLACING
  ) {
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

  if (
    state.gameVariant === state.GAME_VARIANTS.THREE_PIECE &&
    state.gamePhase === state.GAME_PHASES.PLACING
  ) {
    const totalPiecesOnBoard = newBoard.filter(piece => piece !== null).length;
    if (totalPiecesOnBoard === state.MAX_PIECES_PER_PLAYER * 2) {
      state.setGamePhase(state.GAME_PHASES.MOVING);
    }
  } else if (checkDraw(newBoard)) { // Classic draw or 3-piece draw during placement if board fills
    endDraw();
    return true;
  }

  switchPlayer();
  updateAllUITogglesHandler(); // Update UI after phase potentially changes

  if (state.vsCPU && state.currentPlayer === state.gameP2Icon && state.gameActive) {
    ui.setBoardClickable(false);
    setTimeout(async () => { if (state.gameActive) await cpuMoveHandler(); }, 700 + Math.random() * 300);
  } else if (state.gameActive && (!state.pvpRemoteActive || state.isMyTurnInRemote)) { // Allow clicks if local or my turn in remote
    ui.setBoardClickable(true);
    showEasyModeHint();
  }


  return true;
}


/* ╭──────────────────────────────────────────────────────────╮
   │ 7. Moving phase (3-Piezas MOVING)                       │
   ╰──────────────────────────────────────────────────────────╯ */
export function movePiece(fromIdx, toIdx, sym) {
  if (
    !state.gameActive ||
    state.gameVariant !== state.GAME_VARIANTS.THREE_PIECE ||
    state.gamePhase !== state.GAME_PHASES.MOVING
  ) return false;

  if (state.board[fromIdx] !== sym || state.board[toIdx] !== null) return false;
  if (!areCellsAdjacent(fromIdx, toIdx)) {
    // console.warn("Move rejected: cells not adjacent or same cell");
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

  const winCombo = checkWin(sym, newBoard);
  if (winCombo) { endGame(sym, winCombo); return true; }
  if (checkDraw(newBoard)) { endDraw(); return true; }

  switchPlayer();
  updateAllUITogglesHandler();

  if (state.vsCPU && state.currentPlayer === state.gameP2Icon && state.gameActive) {
    ui.setBoardClickable(false);
    setTimeout(async () => { if (state.gameActive) await cpuMoveHandler(); }, 700 + Math.random() * 300);
  } else if (state.gameActive && (!state.pvpRemoteActive || state.isMyTurnInRemote)) { // Allow clicks if local or my turn in remote
    ui.setBoardClickable(true);
    showEasyModeHint();
  }

  return true;
}

/* ╭──────────────────────────────────────────────────────────╮
   │ 8. Game-over helpers                                    │
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
    peerConnection.sendPeerData({ type: 'restart_request' });
    // ui.showOverlay('Solicitando reinicio al oponente...'); // Overlay managed by peerConnection or UI based on context
  } else if (!state.pvpRemoteActive) { // Only for local/CPU games
    setTimeout(init, state.AUTO_RESTART_DELAY_WIN);
  }
  // For remote games, init() will be called upon receiving restart_ack
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
  state.setLastWinner(null);
  state.setPreviousGameExists(true);
  localStorage.setItem('drawsTateti', state.draws.toString());
  updateScoreboardHandler();

  if (state.pvpRemoteActive && state.gamePaired) {
    peerConnection.sendPeerData({ type: 'restart_request' });
    // ui.showOverlay('Solicitando reinicio al oponente...');
  } else if (!state.pvpRemoteActive) { // Only for local/CPU games
    setTimeout(init, state.AUTO_RESTART_DELAY_DRAW);
  }
  // For remote games, init() will be called upon receiving restart_ack
}