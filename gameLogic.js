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

let updateScoreboardHandler = () => console.warn("updateScoreboardHandler not yet implemented in gameLogic.js");
export function setUpdateScoreboardHandler(handler) {
    updateScoreboardHandler = handler;
}

let updateAllUITogglesHandler = () => console.warn("updateAllUITogglesHandler not yet implemented in gameLogic.js");
export function setUpdateAllUITogglesHandler(handler) {
    updateAllUITogglesHandler = handler;
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
    // A draw occurs if all cells are filled and no one has won.
    // Ensure gameP1Icon and gameP2Icon are set before calling this, usually via determineEffectiveIcons.
    if (!state.gameP1Icon || !state.gameP2Icon) {
        // console.warn("checkDraw called before gameP1Icon or gameP2Icon was set.");
        // If icons aren't set, it's unlikely a valid game state for a draw check.
        // However, simply checking for all cells filled is a common approach.
        // The original checkWin calls within checkDraw implicitly handle this.
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

    // Check if we are in a remote game setup phase (e.g., host waiting for joiner)
    // This logic might need refinement based on how peerConnection.js handles states.
    const isHostBtnActive = ui.hostGameBtn?.classList.contains('active');
    const isJoinBtnActive = ui.joinGameBtn?.classList.contains('active');

    if (!isHostBtnActive && !isJoinBtnActive) {
        // If not actively trying to host or join, and a pvpRemote session exists, close it.
        if (state.pvpRemoteActive && window.peerJsMultiplayer?.close) {
             window.peerJsMultiplayer.close(); // This should trigger onConnectionClose if connected.
        }
        // Ensure remote state is fully reset if not in a remote setup process
        state.setPvpRemoteActive(false);
        state.setGamePaired(false);
    }


    state.setBoard(Array(9).fill(null));
    // Difficulty is typically set via UI interaction, not reset in init unless intended.
    // state.setDifficulty(ui.easyBtn.classList.contains('active')?'easy':ui.hardBtn.classList.contains('active')?'hard':'medium');
    state.setGameActive(false); // Will be set true if game actually starts

    player.determineEffectiveIcons();

    if (state.pvpRemoteActive && state.gamePaired) {
        state.setCurrentPlayer(state.gameP1Icon); // Host (gameP1Icon) always starts a new remote round
        state.setIsMyTurnInRemote(state.currentPlayer === state.myEffectiveIcon);
        ui.updateStatus(state.isMyTurnInRemote ? `Tu Turno ${player.getPlayerName(state.currentPlayer)}` : `Esperando a ${player.getPlayerName(state.currentPlayer)}...`);
        ui.setBoardClickable(state.isMyTurnInRemote);
        state.setGameActive(true);
    } else if (state.pvpRemoteActive && !state.gamePaired) { // Waiting for connection
        ui.setBoardClickable(false);
        state.setGameActive(false);
        // Status like "Waiting for connection" should be set by peerConnection.js logic
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

        if (state.vsCPU && state.currentPlayer === state.gameP2Icon) { // If CPU (gameP2Icon) starts
            ui.setBoardClickable(false);
            setTimeout(() => {
                if(state.gameActive) cpuMoveHandler(); // Call the CPU move
                if(state.gameActive) ui.setBoardClickable(true);
            }, 700 + Math.random() * 300);
        } else { // Player starts (vs CPU) or Local PvP turn
            ui.setBoardClickable(true);
        }
    }

    if (updateAllUITogglesHandler) updateAllUITogglesHandler();
    if (updateScoreboardHandler) updateScoreboardHandler();

    if(state.gameActive && !(state.pvpRemoteActive && !state.gamePaired)) {
        sound.playSound('reset'); //
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

    // Determine who the winnerSymbol corresponds to for score update
    if (state.pvpRemoteActive || state.vsCPU) {
         if(winnerSymbol === state.myEffectiveIcon) state.incrementMyWins();
         else if (winnerSymbol === state.opponentEffectiveIcon) state.incrementOpponentWins();
    } else { // For local PvP games
        if (winnerSymbol === state.gameP1Icon) state.incrementMyWins(); // P1 on board is "my" score slot
        else if (winnerSymbol === state.gameP2Icon) state.incrementOpponentWins(); // P2 is "opponent"
    }

    localStorage.setItem('myWinsTateti', state.myWins); //
    localStorage.setItem('opponentWinsTateti', state.opponentWins); //
    if(updateScoreboardHandler) updateScoreboardHandler();

    const delay = state.AUTO_RESTART_DELAY_WIN; //
    if (state.pvpRemoteActive && state.gamePaired) {
        ui.showOverlay(`${player.getPlayerName(winnerSymbol)} GANA! Nueva partida en ${delay / 1000}s...`);
        setTimeout(init, delay); // AUTOMATIC RESTART for remote games
    } else { // Local or CPU games
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
    localStorage.setItem('drawsTateti', state.draws); //
    if (updateScoreboardHandler) updateScoreboardHandler();

    const delay = state.AUTO_RESTART_DELAY_DRAW; //
    if (state.pvpRemoteActive && state.gamePaired) {
        ui.showOverlay(`¡EMPATE! Nueva partida en ${delay / 1000}s...`);
        setTimeout(init, delay); // AUTOMATIC RESTART for remote games
    } else { // Local or CPU games
        setTimeout(init, delay);
    }
}