// gameLogic.js
import * as state from './state.js';
import * as ui from './ui.js';
import * as player from './player.js';
import * as sound from './sound.js';
// cpuMove will be imported when cpu.js is created. For now, init will call a placeholder.
// import { cpuMove } from './cpu.js';


// Forward declaration or placeholder for functions that might be in other modules
// or called via callbacks for cleaner separation later.
let cpuMoveHandler = () => console.warn("cpuMoveHandler not yet implemented in gameLogic.js");
export function setCpuMoveHandler(handler) {
    cpuMoveHandler = handler;
}

let _updateScoreboardHandler = () => ui.updateScoreboard(); // Default to direct call
export function setUpdateScoreboardHandler(handler) {
    _updateScoreboardHandler = handler;
}
// Make updateScoreboardHandler an exported function that calls the internal one
export function updateScoreboardHandler() {
    if (typeof _updateScoreboardHandler === 'function') {
        _updateScoreboardHandler();
    } else {
        console.warn("Actual _updateScoreboardHandler not set or not a function, using default ui.updateScoreboard.");
        ui.updateScoreboard();
    }
}


let _updateAllUITogglesHandler = () => ui.updateAllUIToggleButtons(); // Default to direct call
export function setUpdateAllUITogglesHandler(handler) {
    _updateAllUITogglesHandler = handler;
}
// Make updateAllUITogglesHandler an exported function that calls the internal one
export function updateAllUITogglesHandler() {
    if (typeof _updateAllUITogglesHandler === 'function') {
        _updateAllUITogglesHandler();
    } else {
        console.warn("Actual _updateAllUITogglesHandler not set or not a function, using default ui.updateAllUIToggleButtons.");
        ui.updateAllUIToggleButtons();
    }
}


/**
 * Checks if the given player has won on the current board.
 * @param {string} playerSymbol - The symbol of the player to check (e.g., '🦄', '❤️').
 * @param {Array<string|null>} boardToCheck - The game board array.
 * @returns {Array<number>|null} The winning combination array or null if no win.
 */
export function checkWin(playerSymbol, boardToCheck = state.board) { //
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
export function checkDraw(boardToCheck = state.board) { //
    if (!state.gameP1Icon || !state.gameP2Icon) {
        // console.warn("checkDraw called before gameP1Icon or gameP2Icon was set.");
    }
    return boardToCheck.every(cell => cell !== null) &&
           !checkWin(state.gameP1Icon, boardToCheck) &&
           !checkWin(state.gameP2Icon, boardToCheck);
}

/**
 * Switches the current player.
 */
export function switchPlayer() { //
    state.setCurrentPlayer(
        state.currentPlayer === state.gameP1Icon ? state.gameP2Icon : state.gameP1Icon
    );
}

/**
 * Initializes or resets the game.
 */
export function init() { //
    ui.removeConfetti(); ui.hideOverlay(); ui.hideQRCode();
    ui.clearBoardUI();

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

/**
 * Handles a player making a move on the board.
 * @param {number} index - The index of the cell where the move is made.
 * @param {string} playerSymbolToPlace - The symbol of the player making the move.
 * @returns {boolean} True if the move was successful, false otherwise.
 */
export function makeMove(index, playerSymbolToPlace) { //
    if (state.board[index] !== null || !state.gameActive) return false;

    const newBoard = [...state.board];
    newBoard[index] = playerSymbolToPlace;
    state.setBoard(newBoard);

    ui.updateCellUI(index, playerSymbolToPlace);
    sound.playSound('move'); //
    return true;
}

/**
 * Handles the end of the game when a player wins.
 * @param {string} winnerSymbol - The symbol of the winning player.
 * @param {Array<number>} winningCells - The array of winning cell indices.
 */
export function endGame(winnerSymbol, winningCells) { //
    state.setGameActive(false);
    ui.setBoardClickable(false);
    ui.launchConfetti(); //
    ui.highlightWinner(winningCells);
    sound.playSound('win'); //
    ui.updateStatus(`${player.getPlayerName(winnerSymbol)} GANA!`);

    state.setLastWinner(winnerSymbol); //
    state.setPreviousGameExists(true); //

    if (state.pvpRemoteActive || state.vsCPU) {
         if(winnerSymbol === state.myEffectiveIcon) state.incrementMyWins();
         else if (winnerSymbol === state.opponentEffectiveIcon) state.incrementOpponentWins();
    } else {
        if (winnerSymbol === state.gameP1Icon) state.incrementMyWins();
        else if (winnerSymbol === state.gameP2Icon) state.incrementOpponentWins();
    }

    localStorage.setItem('myWinsTateti', state.myWins.toString());
    localStorage.setItem('opponentWinsTateti', state.opponentWins.toString());
    updateScoreboardHandler(); // Call the exported wrapper

    const delay = state.AUTO_RESTART_DELAY_WIN; //
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
export function endDraw() { //
    state.setGameActive(false);
    ui.setBoardClickable(false);
    ui.playDrawAnimation(); //
    sound.playSound('draw'); //
    ui.updateStatus("¡EMPATE!");
    state.incrementDraws(); //
    state.setLastWinner(null); //
    state.setPreviousGameExists(true); //
    localStorage.setItem('drawsTateti', state.draws.toString());
    updateScoreboardHandler(); // Call the exported wrapper

    const delay = state.AUTO_RESTART_DELAY_DRAW; //
    if (state.pvpRemoteActive && state.gamePaired) {
        ui.showOverlay(`¡EMPATE! Nueva partida en ${delay / 1000}s...`);
        setTimeout(init, delay);
    } else {
        setTimeout(init, delay);
    }
}
