// cpu.js
import * as state from './state.js';
import * as gameLogic from './gameLogic.js';
import * as ui from './ui.js';
import * as player from './player.js';

/**
 * Makes a random move for the CPU.
 * @returns {number|null} The index of the cell chosen, or null if no moves are available.
 */
function randomMove() { //
    const availableCells = state.board.map((cell, index) => cell === null ? index : null).filter(index => index !== null);
    if (availableCells.length > 0) {
        return availableCells[Math.floor(Math.random() * availableCells.length)];
    }
    return null;
}

/**
 * Determines the best move for the CPU.
 * It tries to win, then tries to block the opponent, then takes the center,
 * then a corner, then a random move.
 * @param {string} cpuIcon - The CPU's game symbol.
 * @param {string} humanIcon - The human player's game symbol.
 * @returns {number|null} The index of the best cell to play, or null.
 */
function bestMove(cpuIcon, humanIcon) { //
    // Create a temporary board for checking moves without altering the actual game state.board
    let tempBoard;

    // 1. Check for a winning move for CPU
    for (let i = 0; i < 9; i++) {
        if (state.board[i] === null) {
            tempBoard = [...state.board];
            tempBoard[i] = cpuIcon;
            if (gameLogic.checkWin(cpuIcon, tempBoard)) {
                return i;
            }
        }
    }

    // 2. Check for a blocking move against Human
    for (let i = 0; i < 9; i++) {
        if (state.board[i] === null) {
            tempBoard = [...state.board];
            tempBoard[i] = humanIcon;
            if (gameLogic.checkWin(humanIcon, tempBoard)) {
                return i;
            }
        }
    }

    // 3. Try to take the center if available (and difficulty is not 'easy' potentially)
    if (state.difficulty !== 'easy' && state.board[4] === null) return 4; //

    // 4. Try to take a corner if available (and difficulty is 'hard')
    if (state.difficulty === 'hard') {
        const corners = [0, 2, 6, 8].filter(i => state.board[i] === null); //
        if (corners.length > 0) return corners[Math.floor(Math.random() * corners.length)];
    }
    
    // 5. For 'easy' difficulty, after checking win/block, prefer random moves more often.
    // Or, if center/corners are not taken based on difficulty.
    // Take any available side cell if center/corners strategy didn't apply or failed.
    if (state.difficulty !== 'easy') { // For medium/hard, try sides if corners/center didn't pan out
        const sides = [1, 3, 5, 7].filter(i => state.board[i] === null);
        if (sides.length > 0) return sides[Math.floor(Math.random() * sides.length)];
    }
    
    // 6. Fallback to a completely random move if no strategic move was found
    return randomMove();
}

/**
 * Main function for the CPU's turn.
 * Decides and makes a move based on the difficulty level.
 */
export function cpuMove() { //
    if (!state.gameActive || !state.vsCPU || state.currentPlayer !== state.gameP2Icon) return;

    let moveIndex;
    // state.gameP2Icon is the CPU's icon, state.gameP1Icon is the human's icon in vsCPU mode
    if (state.difficulty === 'easy') {
        // For easy, 50% chance of random move, 50% chance of trying to find a slightly better move (win/block only)
        if (Math.random() < 0.5) {
            moveIndex = randomMove();
        } else {
            // Check win for CPU
            for (let i = 0; i < 9; i++) {if (state.board[i] === null) { let tb = [...state.board]; tb[i] = state.gameP2Icon; if (gameLogic.checkWin(state.gameP2Icon, tb)) { moveIndex = i; break;}}}
            // Check block for Human
            if (moveIndex === undefined) { for (let i = 0; i < 9; i++) {if (state.board[i] === null) { let tb = [...state.board]; tb[i] = state.gameP1Icon; if (gameLogic.checkWin(state.gameP1Icon, tb)) {moveIndex = i; break;}}}}
            if (moveIndex === undefined) moveIndex = randomMove();
        }
    } else { // medium or hard
        moveIndex = bestMove(state.gameP2Icon, state.gameP1Icon);
    }


    if (moveIndex === null) { // No possible moves left
        if (gameLogic.checkDraw()) {
            gameLogic.endDraw();
        }
        return;
    }

    if (gameLogic.makeMove(moveIndex, state.gameP2Icon)) {
        const win = gameLogic.checkWin(state.gameP2Icon);
        if (win) {
            gameLogic.endGame(state.gameP2Icon, win);
            return;
        }
        if (gameLogic.checkDraw()) {
            gameLogic.endDraw();
            return;
        }
        gameLogic.switchPlayer();
        ui.updateStatus(`Turno del ${player.getPlayerName(state.currentPlayer)}`);
        // Board clickability is handled by the main game loop after CPU move in game.js or gameLogic.js's init
    }
}