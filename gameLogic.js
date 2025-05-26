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
    state.currentPlayer === state.gameP1Icon &&
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
          if (state.selectedPieceIndex === null) {
            if (state.board[bestSlide.from] === humanIcon) {
              ui.highlightSuggestedMove(bestSlide.from);
            }
          } else if (state.selectedPieceIndex === bestSlide.from) {
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
  return dr <= 1 && dc <= 1 && (dr + dc > 0);
};

export function hasValidMoves(sym, board) {
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== sym) continue;
    for (let j = 0; j < board.length; j++) {
      if (i === j) continue;
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

  if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE &&
      state.gamePhase === state.GAME_PHASES.MOVING) {
    ui.updateStatus(
      `${player.getPlayerName(state.currentPlayer)}: Selecciona tu pieza para mover.`
    );
    if (checkDraw(state.board)) { endDraw(); return; }
  } else if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE &&
             state.gamePhase === state.GAME_PHASES.PLACING) {
    const placed = state.board.filter(s => s === state.currentPlayer).length;
    ui.updateStatus(
      `${player.getPlayerName(state.currentPlayer)}: Coloca tu pieza (${placed + 1}/3).`
    );
  } else {
    ui.updateStatus(`Turno del ${player.getPlayerName(state.currentPlayer)}`);
  }

  showEasyModeHint();
}

/* ╭──────────────────────────────────────────────────────────╮
   │ 5. Game initialisation / reset                          │
   ╰──────────────────────────────────────────────────────────╯ */
export function init() {
  ui.removeConfetti();
  ui.hideOverlay();
  ui.hideQRCode();
  ui.clearBoardUI();
  state.resetGameFlowState();

  // ▶ REMOTE-TEARDOWN SAFEGUARD
  const hostActive = ui.hostGameBtn?.classList.contains('active');
  const joinActive = ui.joinGameBtn?.classList.contains('active');
  if (state.pvpRemoteActive && !state.gamePaired && !hostActive && !joinActive) {
    if (window.peerJsMultiplayer?.close) {
      window.peerJsMultiplayer.close();
    }
    state.setPvpRemoteActive(false);
    state.setGamePaired(false);
  }

  state.setBoard(Array(9).fill(null));
  state.setGameActive(false);
  player.determineEffectiveIcons();

  // ─────────────────────────────────────────────────────────
  //   REMOTE MODE HANDLING
  // ─────────────────────────────────────────────────────────
  if (state.pvpRemoteActive && state.gamePaired) {
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
    ui.setBoardClickable(false);
    state.setGameActive(false);
  } else {
    // ─────────────────────────────────────────────────────────
    //   LOCAL / CPU MODE HANDLING
    // ─────────────────────────────────────────────────────────
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
    }
    state.setCurrentPlayer(startPlayer);

    if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
      state.setGamePhase(state.GAME_PHASES.PLACING);
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
    !(state.pvpRemoteActive && !state.gamePaired)
  ) {
    if (sound.getAudioContext()?.state === 'running') {
      sound.playSound('reset');
    }
  }

  if (
    ui.sideMenu?.classList.contains('open') &&
    !(state.pvpRemoteActive && !state.gamePaired && state.iAmPlayer1InRemote)
  ) {
    ui.sideMenu.classList.remove('open');
  }
}

/* ╭──────────────────────────────────────────────────────────╮
   │ 6. Placement phase (Classic + 3-Piezas PLACING)         │
   ╰──────────────────────────────────────────────────────────╯ */
export function makeMove(idx, sym) {
  if (state.board[idx] != null || !state.gameActive) return false;
  // Placement logic
  if (
    state.gameVariant === state.GAME_VARIANTS.THREE_PIECE &&
    state.gamePhase === state.GAME_PHASES.PLACING
  ) {
    const tokensOnBoard = state.board.filter(s => s === sym).length;
    if (tokensOnBoard >= state.MAX_PIECES_PER_PLAYER) return false;
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
    const p1Count = newBoard.filter(s => s === state.gameP1Icon).length;
    const p2Count = newBoard.filter(s => s === state.gameP2Icon).length;
    if (
      p1Count === state.MAX_PIECES_PER_PLAYER &&
      p2Count === state.MAX_PIECES_PER_PLAYER
    ) {
      state.setGamePhase(state.GAME_PHASES.MOVING);
    }
  } else if (checkDraw(newBoard)) {
    endDraw();
    return true;
  }

  switchPlayer();
  updateAllUITogglesHandler();

  if (state.vsCPU && state.currentPlayer === state.gameP2Icon && state.gameActive) {
    ui.setBoardClickable(false);
    setTimeout(async () => { if (state.gameActive) await cpuMoveHandler(); }, 700 + Math.random() * 300);
  } else if (state.gameActive && state.currentPlayer === state.gameP1Icon) {
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
    ui.updateStatus(`${player.getPlayerName(sym)}: Inválido. Mueve adyacente.`);
    state.setSelectedPieceIndex(null);
    ui.clearSelectedPieceHighlight();
    showEasyModeHint();
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
  } else if (state.gameActive && state.currentPlayer === state.gameP1Icon) {
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
  state.setLastWinner(null);
  state.setPreviousGameExists(true);
  localStorage.setItem('drawsTateti', state.draws.toString());
  updateScoreboardHandler();

  setTimeout(init, state.AUTO_RESTART_DELAY_DRAW);
}
