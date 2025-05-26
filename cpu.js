// cpu.js
import * as state from './state.js'; // state.board, state.difficulty
import * as gameLogic from './gameLogic.js'; // gameLogic.checkWin
import * as ui from './ui.js'; // Potentially for UI updates if CPU needs to trigger them (unlikely here)
import * as player from './player.js'; // Potentially for player names/icons if needed (unlikely here)

/**
 * Makes a random move on the given board.
 * @param {Array<string|null>} currentBoard - The current game board array.
 * @returns {number|null} The index of the cell chosen, or null if no moves are available.
 */
function randomMove(currentBoard) {
    const availableCells = currentBoard.map((cell, index) => cell === null ? index : null).filter(index => index !== null);
    if (availableCells.length > 0) {
        return availableCells[Math.floor(Math.random() * availableCells.length)];
    }
    return null;
}

/**
 * Calculates the best move for a given player based on the board state and difficulty.
 * @param {Array<string|null>} currentBoard - The current game board array.
 * @param {string} CurentPlayerIcon - The icon of the player whose turn it is to move.
 * @param {string} opponentIcon - The icon of the opponent.
 * @param {string} difficultySetting - The current difficulty ('easy', 'medium', 'hard').
 * @returns {number|null} The index of the best cell to play, or null.
 */
export function calculateBestMove(currentBoard, CurentPlayerIcon, opponentIcon, difficultySetting) {
    let tempBoard;

    // 1. Check for a winning move for CurrentPlayerIcon
    for (let i = 0; i < 9; i++) {
        if (currentBoard[i] === null) {
            tempBoard = [...currentBoard];
            tempBoard[i] = CurentPlayerIcon;
            if (gameLogic.checkWin(CurentPlayerIcon, tempBoard)) {
                return i;
            }
        }
    }

    // 2. Check for a blocking move against opponentIcon
    for (let i = 0; i < 9; i++) {
        if (currentBoard[i] === null) {
            tempBoard = [...currentBoard];
            tempBoard[i] = opponentIcon;
            if (gameLogic.checkWin(opponentIcon, tempBoard)) {
                return i; // Block by playing here
            }
        }
    }

    // For 'easy' difficulty, if not win/block, prefer random moves more often.
    // (This logic is handled in cpuMove function directly for CPU's turn on easy)
    // For hinting, 'easy' will also use this more strategic path.
    
    // 3. Try to take the center if available
    if (difficultySetting !== 'easy' || (difficultySetting === 'easy' && Math.random() < 0.75) ) { // Easy less likely to pick center first
        if (currentBoard[4] === null) return 4;
    }


    // 4. Try to take an empty corner
    // For 'hard', prioritize corners. For 'medium', it's a good option. 'Easy' might skip or be less likely.
    if (difficultySetting === 'hard' || (difficultySetting === 'medium' && Math.random() < 0.8) || (difficultySetting === 'easy' && Math.random() < 0.4)) {
        const corners = [0, 2, 6, 8].filter(i => currentBoard[i] === null);
        if (corners.length > 0) return corners[Math.floor(Math.random() * corners.length)];
    }
    
    // 5. Try to take an empty side cell
    // This becomes more relevant if center/corners are taken or strategically less important for the difficulty.
    const sides = [1, 3, 5, 7].filter(i => currentBoard[i] === null);
    if (sides.length > 0) return sides[Math.floor(Math.random() * sides.length)];
    
    // 6. Fallback to a completely random move if no strategic move was found (should be rare if sides are available)
    return randomMove(currentBoard);
}


/**
 * Main function for the CPU's turn.
 * Decides and makes a move based on the difficulty level.
 */
export function cpuMove() {
    if (!state.gameActive || !state.vsCPU || state.currentPlayer !== state.gameP2Icon) return;

    let moveIndex;
    const cpuIcon = state.gameP2Icon; // CPU is always gameP2Icon in vsCPU mode
    const humanIcon = state.gameP1Icon; // Human is always gameP1Icon

    if (state.difficulty === 'easy') {
        // For easy CPU, 50% chance of random move, 50% chance of basic win/block check.
        if (Math.random() < 0.5) {
            moveIndex = randomMove(state.board);
        } else {
            // Check win for CPU
            for (let i = 0; i < 9; i++) {if (state.board[i] === null) { let tb = [...state.board]; tb[i] = cpuIcon; if (gameLogic.checkWin(cpuIcon, tb)) { moveIndex = i; break;}}}
            // Check block for Human
            if (moveIndex === undefined) { for (let i = 0; i < 9; i++) {if (state.board[i] === null) { let tb = [...state.board]; tb[i] = humanIcon; if (gameLogic.checkWin(humanIcon, tb)) {moveIndex = i; break;}}}}
            if (moveIndex === undefined) moveIndex = randomMove(state.board); // Fallback to random if no win/block
        }
    } else { // medium or hard difficulty for CPU
        moveIndex = calculateBestMove(state.board, cpuIcon, humanIcon, state.difficulty);
    }


    if (moveIndex === null) { 
        // This case should ideally not be reached if checkDraw is working,
        // as randomMove would return null only on a full board.
        // If it's a draw, gameLogic.makeMove will fail if board is full,
        // and checkDraw would have been called earlier.
        // For safety, if we reach here and it's a draw, end it.
        if (gameLogic.checkDraw()) { // Re-check just in case
            gameLogic.endDraw();
        }
        return;
    }

    // Make the move
    if (gameLogic.makeMove(moveIndex, cpuIcon)) { // cpuIcon is state.gameP2Icon
        const win = gameLogic.checkWin(cpuIcon);
        if (win) {
            gameLogic.endGame(cpuIcon, win);
            return; // Game ends
        }
        if (gameLogic.checkDraw()) {
            gameLogic.endDraw();
            return; // Game ends
        }
        // If game continues, switch to human player
        gameLogic.switchPlayer(); // Should switch to state.gameP1Icon
        ui.updateStatus(`Turno del ${player.getPlayerName(state.currentPlayer)}`);
        // The highlight logic for human player will be handled in gameLogic.js after this switch
    }
    // If gameLogic.makeMove returned false (e.g. cell taken, though CPU shouldn't pick that)
    // it implies an issue with CPU logic or game state.
    // Board clickability for human player is handled in gameLogic.js or the main game loop.
}
