// gameLogic.js
import * as state from './state.js';
import * as ui from './ui.js';
import * as player from './player.js';
import * as sound from './sound.js';
import { calculateBestMove } from './cpu.js'; // Import the new function

let cpuMoveHandler = () => console.warn("cpuMoveHandler not yet implemented in gameLogic.js");
export function setCpuMoveHandler(handler) {
    cpuMoveHandler = handler;
}

let _updateScoreboardHandler = () => ui.updateScoreboard();
export function setUpdateScoreboardHandler(handler) {
    _updateScoreboardHandler = handler;
}
export function updateScoreboardHandler() {
    if (typeof _updateScoreboardHandler === 'function') {
        _updateScoreboardHandler();
    } else {
        ui.updateScoreboard();
    }
}

let _updateAllUITogglesHandler = () => ui.updateAllUIToggleButtons();
export function setUpdateAllUITogglesHandler(handler) {
    _updateAllUITogglesHandler = handler;
}
export function updateAllUITogglesHandler() {
    if (typeof _updateAllUITogglesHandler === 'function') {
        _updateAllUITogglesHandler();
    } else {
        ui.updateAllUIToggleButtons();
    }
}

/**
 * Shows a hint for the human player if in Easy CPU mode.
 */
function showEasyModeHint() {
    if (state.vsCPU && state.difficulty === 'easy' && state.currentPlayer === state.gameP1Icon && state.gameActive) {
        const bestMoveIndex = calculateBestMove(state.board, state.gameP1Icon, state.gameP2Icon, state.difficulty);
        if (bestMoveIndex !== null) {
            ui.highlightSuggestedMove(bestMoveIndex);
        }
    }
}

/**
 * Checks if the given player has won on the current board.
 * @param {string} playerSymbol - The symbol of the player to check.
 * @param {Array<string|null>} boardToCheck - The game board array.
 * @returns {Array<number>|null} The winning combination array or null if no win.
 */
export function checkWin(playerSymbol, boardToCheck = state.board) {
    const winningCombinations = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
        [0, 4, 8], [2, 4, 6]             // Diagonals
    ];
    return winningCombinations.find(combo => combo.every(i => boardToCheck[i] === playerSymbol)) || null;
}

/**
 * Checks if the current game board results in a draw.
 * @param {Array<string|null>} boardToCheck - The game board array.
 * @returns {boolean} True if it's a draw, false otherwise.
 */
export function checkDraw(boardToCheck = state.board) {
    if (!state.gameP1Icon || !state.gameP2Icon) {
        // console.warn("checkDraw called before gameP1Icon or gameP2Icon was set.");
    }
    return boardToCheck.every(cell => cell !== null) &&
           !checkWin(state.gameP1Icon, boardToCheck) &&
           !checkWin(state.gameP2Icon, boardToCheck);
}

/**
 * Switches the current player and shows hint if applicable.
 */
export function switchPlayer() {
    state.setCurrentPlayer(
        state.currentPlayer === state.gameP1Icon ? state.gameP2Icon : state.gameP1Icon
    );
    // After switching, if it's human's turn in easy CPU mode, show hint
    showEasyModeHint();
}

/**
 * Initializes or resets the game.
 */
export function init() {
    ui.removeConfetti(); ui.hideOverlay(); ui.hideQRCode();
    ui.clearBoardUI(); // This will also clear suggested move highlights

    const isHostBtnActive = ui.hostGameBtn?.classList.contains('active');
    const isJoinBtnActive = ui.joinGameBtn?.classList.contains('active');

    if (!isHostBtnActive && !isJoinBtnActive) {
        if (state.pvpRemoteActive && window.peerJsMultiplayer?.close) {
             window.peerJsMultiplayer.close();
        }
        state.setPvpRemoteActive(false);
        state.setGamePaired(false);
    }

    state.setBoard(Array(9).fill(null));
    state.setGameActive(false);

    player.determineEffectiveIcons();

    if (state.pvpRemoteActive && state.gamePaired) {
        state.setCurrentPlayer(state.gameP1Icon);
        state.setIsMyTurnInRemote(state.currentPlayer === state.myEffectiveIcon);
        ui.updateStatus(state.isMyTurnInRemote ? `Tu Turno ${player.getPlayerName(state.currentPlayer)}` : `Esperando a ${player.getPlayerName(state.currentPlayer)}...`);
        ui.setBoardClickable(state.isMyTurnInRemote);
        state.setGameActive(true);
    } else if (state.pvpRemoteActive && !state.gamePaired) {
        ui.setBoardClickable(false);
        state.setGameActive(false);
    } else { // Local PvP or Vs CPU
        state.setGameActive(true);
        let startingPlayer;
        if (state.whoGoesFirstSetting === 'random') {
            startingPlayer = Math.random() < 0.5 ? state.gameP1Icon : state.gameP2Icon;
        } else if (state.whoGoesFirstSetting === 'loser' && state.previousGameExists && state.lastWinner !== null) {
            startingPlayer = (state.lastWinner === state.gameP1Icon) ? state.gameP2Icon : state.gameP1Icon;
        } else {
            startingPlayer = state.gameP1Icon;
        }
        state.setCurrentPlayer(startingPlayer);
        ui.updateStatus(`Turno del ${player.getPlayerName(state.currentPlayer)}`);

        if (state.vsCPU && state.currentPlayer === state.gameP2Icon) { // If CPU (gameP2Icon) starts
            ui.setBoardClickable(false);
            ui.clearSuggestedMoveHighlight(); // Clear hint before CPU moves
            setTimeout(() => {
                if(state.gameActive) cpuMoveHandler();
                // After CPU moves, gameLogic.switchPlayer will be called, which then calls showEasyModeHint
                if(state.gameActive && state.currentPlayer === state.gameP1Icon) { // Ensure board is clickable if it's human's turn after CPU.
                    ui.setBoardClickable(true);
                }
            }, 700 + Math.random() * 300);
        } else { // Player starts (vs CPU or Local PvP)
            ui.setBoardClickable(true);
            showEasyModeHint(); // Show hint if human starts vs CPU Easy
        }
    }

    updateAllUITogglesHandler();
    updateScoreboardHandler();

    if(state.gameActive && !(state.pvpRemoteActive && !state.gamePaired)) {
        if (sound.getAudioContext() && sound.getAudioContext().state === 'running') {
            sound.playSound('reset');
        } else {
            console.log("Audio context not ready for init sound, will play on user gesture.");
        }
    }
    if (ui.sideMenu && ui.sideMenu.classList.contains('open')) ui.sideMenu.classList.remove('open');
}

/**
 * Handles a player making a move on the board.
 * @param {number} index - The index of the cell where the move is made.
 * @param {string} playerSymbolToPlace - The symbol of the player making the move.
 * @returns {boolean} True if the move was successful, false otherwise.
 */
export function makeMove(index, playerSymbolToPlace) {
    if (state.board[index] !== null || !state.gameActive) return false;

    ui.clearSuggestedMoveHighlight(); // Clear any hint as soon as a move is attempted

    const newBoard = [...state.board];
    newBoard[index] = playerSymbolToPlace;
    state.setBoard(newBoard);

    ui.updateCellUI(index, playerSymbolToPlace); // This also removes .suggested-move from the clicked cell
    sound.playSound('move');
    return true;
}

/**
 * Handles the end of the game when a player wins.
 * @param {string} winnerSymbol - The symbol of the winning player.
 * @param {Array<number>} winningCells - The array of winning cell indices.
 */
export function endGame(winnerSymbol, winningCells) {
    state.setGameActive(false);
    ui.setBoardClickable(false);
    ui.clearSuggestedMoveHighlight(); // Clear hint on game end
    ui.launchConfetti();
    ui.highlightWinner(winningCells);
    sound.playSound('win');
    ui.updateStatus(`${player.getPlayerName(winnerSymbol)} GANA!`);

    state.setLastWinner(winnerSymbol);
    state.setPreviousGameExists(true);

    if (state.pvpRemoteActive || state.vsCPU) {
         if(winnerSymbol === state.myEffectiveIcon) state.incrementMyWins();
         else if (winnerSymbol === state.opponentEffectiveIcon) state.incrementOpponentWins();
    } else {
        if (winnerSymbol === state.gameP1Icon) state.incrementMyWins();
        else if (winnerSymbol === state.gameP2Icon) state.incrementOpponentWins();
    }

    localStorage.setItem('myWinsTateti', state.myWins.toString());
    localStorage.setItem('opponentWinsTateti', state.opponentWins.toString());
    updateScoreboardHandler();

    const delay = state.AUTO_RESTART_DELAY_WIN;
    if (state.pvpRemoteActive && state.gamePaired) {
        ui.showOverlay(`${player.getPlayerName(winnerSymbol)} GANA! Nueva partida en ${delay / 1000}s...`);
        setTimeout(init, delay);
    } else {
        setTimeout(init, delay);
    }
}

/**
 * Handles the end of the game when it's a draw.
 */
export function endDraw() {
    state.setGameActive(false);
    ui.setBoardClickable(false);
    ui.clearSuggestedMoveHighlight(); // Clear hint on game end
    ui.playDrawAnimation();
    sound.playSound('draw');
    ui.updateStatus("¡EMPATE!");
    state.incrementDraws();
    state.setLastWinner(null);
    state.setPreviousGameExists(true);
    localStorage.setItem('drawsTateti', state.draws.toString());
    updateScoreboardHandler();

    const delay = state.AUTO_RESTART_DELAY_DRAW;
    if (state.pvpRemoteActive && state.gamePaired) {
        ui.showOverlay(`¡EMPATE! Nueva partida en ${delay / 1000}s...`);
        setTimeout(init, delay);
    } else {
        setTimeout(init, delay);
    }
}
