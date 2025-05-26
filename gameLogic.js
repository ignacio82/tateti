// gameLogic.js
import * as state from './state.js';
import * as ui from './ui.js';
import * as player from './player.js';
import * as sound from './sound.js';
import { calculateBestMove } from './cpu.js';

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
 * Shows a hint for the human player if in Easy CPU mode (Classic variant only for now).
 */
function showEasyModeHint() {
    if (state.gameVariant === state.GAME_VARIANTS.CLASSIC && state.vsCPU && state.difficulty === 'easy' && state.currentPlayer === state.gameP1Icon && state.gameActive) {
        const bestMoveIndex = calculateBestMove(state.board, state.gameP1Icon, state.gameP2Icon, state.difficulty);
        if (bestMoveIndex !== null) {
            ui.highlightSuggestedMove(bestMoveIndex);
        }
    } else {
        ui.clearSuggestedMoveHighlight();
    }
}

/**
 * Checks if the given player has won on the current board.
 */
export function checkWin(playerSymbol, boardToCheck = state.board) {
    const winningCombinations = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], 
        [0, 3, 6], [1, 4, 7], [2, 5, 8], 
        [0, 4, 8], [2, 4, 6]             
    ];
    return winningCombinations.find(combo => combo.every(i => boardToCheck[i] === playerSymbol)) || null;
}

/**
 * Helper function to check if two cells are adjacent (including diagonals for 3-piece move).
 */
function areCellsAdjacent(index1, index2) {
    const r1 = Math.floor(index1 / 3);
    const c1 = index1 % 3;
    const r2 = Math.floor(index2 / 3);
    const c2 = index2 % 3;
    const rowDiff = Math.abs(r1 - r2);
    const colDiff = Math.abs(c1 - c2);
    return rowDiff <= 1 && colDiff <= 1 && (rowDiff + colDiff > 0);
}

/**
 * Checks if a player has any valid moves in the "Three Piece" MOVING phase.
 * @param {string} playerSymbol The player's symbol.
 * @param {Array<string|null>} currentBoard The current board state.
 * @returns {boolean} True if the player has at least one valid move, false otherwise.
 */
function hasValidMoves(playerSymbol, currentBoard) {
    for (let i = 0; i < currentBoard.length; i++) {
        if (currentBoard[i] === playerSymbol) { // Found a piece belonging to the player
            // Check all 8 potential adjacent cells
            for (let j = 0; j < currentBoard.length; j++) {
                if (i === j) continue; // Skip self
                if (currentBoard[j] === null && areCellsAdjacent(i, j)) {
                    return true; // Found a valid move
                }
            }
        }
    }
    return false; // No valid moves found for any piece of this player
}


/**
 * Checks if the current game board results in a draw.
 */
export function checkDraw(boardToCheck = state.board) {
    if (!state.gameActive) return false; // No draw if game isn't active (e.g., already won)

    if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
        if (state.gamePhase === state.GAME_PHASES.MOVING) {
            // A draw occurs if the current player to move has no valid moves, and it's not a win.
            // This check should be done *after* checking for a win for the player whose turn it just became.
            if (!checkWin(state.currentPlayer, boardToCheck) && !hasValidMoves(state.currentPlayer, boardToCheck)) {
                return true;
            }
        }
        // During PLACING phase of 3-piece, a draw isn't possible yet.
        return false;
    }
    // Classic mode draw condition:
    return boardToCheck.every(cell => cell !== null) &&
           !checkWin(state.gameP1Icon, boardToCheck) &&
           !checkWin(state.gameP2Icon, boardToCheck);
}


/**
 * Switches the current player and updates UI/state accordingly.
 */
export function switchPlayer() {
    state.setCurrentPlayer(
        state.currentPlayer === state.gameP1Icon ? state.gameP2Icon : state.gameP1Icon
    );
    state.setSelectedPieceIndex(null); 
    ui.clearSelectedPieceHighlight();

    if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && state.gamePhase === state.GAME_PHASES.MOVING) {
        ui.updateStatus(`${player.getPlayerName(state.currentPlayer)}: Selecciona tu pieza para mover.`);
        // After switching, check if the new current player is stuck (draw condition)
        if (checkDraw(state.board)) {
            endDraw();
            return; // Game ends in a draw
        }
    } else if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && state.gamePhase === state.GAME_PHASES.PLACING) {
        const piecesPlaced = state.playerPiecesOnBoard[state.currentPlayer] || 0;
        if (piecesPlaced < state.MAX_PIECES_PER_PLAYER) {
            ui.updateStatus(`${player.getPlayerName(state.currentPlayer)}: Coloca tu pieza (${piecesPlaced + 1}/${state.MAX_PIECES_PER_PLAYER}).`);
        } else {
             ui.updateStatus(`${player.getPlayerName(state.currentPlayer)}: Todas tus piezas colocadas. Turno del oponente.`);
        }
    } else { // Classic mode
        ui.updateStatus(`Turno del ${player.getPlayerName(state.currentPlayer)}`);
    }
    
    showEasyModeHint(); 
}

/**
 * Initializes or resets the game.
 */
export function init() {
    ui.removeConfetti(); ui.hideOverlay(); ui.hideQRCode();
    ui.clearBoardUI(); 
    state.resetGameFlowState(); 

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

    if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
        state.setPlayerPiecesOnBoard(state.gameP1Icon, 0);
        state.setPlayerPiecesOnBoard(state.gameP2Icon, 0);
    }

    if (state.pvpRemoteActive && state.gamePaired) { 
        state.setCurrentPlayer(state.gameP1Icon);
        state.setIsMyTurnInRemote(state.currentPlayer === state.myEffectiveIcon);
        ui.updateStatus(state.isMyTurnInRemote ? `Tu Turno ${player.getPlayerName(state.currentPlayer)}` : `Esperando a ${player.getPlayerName(state.currentPlayer)}...`);
        ui.setBoardClickable(state.isMyTurnInRemote);
        state.setGameActive(true);
    } else if (state.pvpRemoteActive && !state.gamePaired) { 
        ui.setBoardClickable(false);
        state.setGameActive(false);
    } else { 
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

        if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
            state.setGamePhase(state.GAME_PHASES.PLACING);
            const piecesPlaced = state.playerPiecesOnBoard[state.currentPlayer] || 0;
            ui.updateStatus(`${player.getPlayerName(state.currentPlayer)}: Coloca tu pieza (${piecesPlaced + 1}/${state.MAX_PIECES_PER_PLAYER}).`);
        } else {
             ui.updateStatus(`Turno del ${player.getPlayerName(state.currentPlayer)}`);
        }
        
        if (state.vsCPU && state.gameVariant === state.GAME_VARIANTS.CLASSIC && state.currentPlayer === state.gameP2Icon) { 
            ui.setBoardClickable(false);
            ui.clearSuggestedMoveHighlight(); 
            setTimeout(() => {
                if(state.gameActive) cpuMoveHandler();
                if(state.gameActive && state.currentPlayer === state.gameP1Icon) {
                    ui.setBoardClickable(true);
                }
            }, 700 + Math.random() * 300);
        } else { 
            ui.setBoardClickable(true);
            showEasyModeHint(); 
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
 * Handles placing a piece for Classic or Three Piece (Placing Phase).
 */
export function makeMove(index, playerSymbol) {
    if (state.board[index] !== null || !state.gameActive) {
        return false;
    }

    ui.clearSuggestedMoveHighlight();
    ui.clearSelectedPieceHighlight(); 

    if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
        if (state.gamePhase === state.GAME_PHASES.PLACING) {
            const piecesPlacedByCurrentPlayer = state.playerPiecesOnBoard[playerSymbol] || 0;
            if (piecesPlacedByCurrentPlayer >= state.MAX_PIECES_PER_PLAYER) {
                ui.updateStatus(`${player.getPlayerName(playerSymbol)}: Ya has colocado todas tus piezas. Fase de movimiento.`);
                return false; 
            }

            const newBoard = [...state.board];
            newBoard[index] = playerSymbol;
            state.setBoard(newBoard);
            state.setPlayerPiecesOnBoard(playerSymbol, piecesPlacedByCurrentPlayer + 1);
            ui.updateCellUI(index, playerSymbol);
            sound.playSound('move');

            const winDetails = checkWin(playerSymbol);
            if (winDetails) {
                endGame(playerSymbol, winDetails);
                return true;
            }

            const p1Pieces = state.playerPiecesOnBoard[state.gameP1Icon] || 0;
            const p2Pieces = state.playerPiecesOnBoard[state.gameP2Icon] || 0;
            if (p1Pieces === state.MAX_PIECES_PER_PLAYER && p2Pieces === state.MAX_PIECES_PER_PLAYER) {
                state.setGamePhase(state.GAME_PHASES.MOVING);
                // The status will be updated by switchPlayer to prompt the first player to move.
            }
            switchPlayer(); // This handles turn switching and status update.
            return true;
        } else { 
            console.warn("makeMove called during non-PLACING phase of Three Piece game. Use movePiece for MOVING phase.");
            return false;
        }
    } else { // CLASSIC variant
        const newBoard = [...state.board];
        newBoard[index] = playerSymbol;
        state.setBoard(newBoard);
        ui.updateCellUI(index, playerSymbol);
        sound.playSound('move');

        const winDetails = checkWin(playerSymbol);
        if (winDetails) {
            endGame(playerSymbol, winDetails);
            return true;
        }
        if (checkDraw(state.board)) {
            endDraw();
            return true;
        }
        switchPlayer();
        
        if (state.vsCPU && state.currentPlayer === state.gameP2Icon && state.gameActive) {
            ui.setBoardClickable(false);
            setTimeout(() => {
                if(state.gameActive) cpuMoveHandler();
                if(state.gameActive && state.currentPlayer === state.gameP1Icon) {
                     ui.setBoardClickable(true);
                }
            }, 700 + Math.random() * 300);
        }
        return true;
    }
}

/**
 * Handles moving a piece for the Three Piece variant.
 */
export function movePiece(fromIndex, toIndex, playerSymbol) {
    if (!state.gameActive || state.gameVariant !== state.GAME_VARIANTS.THREE_PIECE || state.gamePhase !== state.GAME_PHASES.MOVING) {
        return false;
    }
    if (state.board[fromIndex] !== playerSymbol || state.board[toIndex] !== null) {
        return false; 
    }

    if (!areCellsAdjacent(fromIndex, toIndex)) {
        ui.updateStatus(`${player.getPlayerName(playerSymbol)}: Inválido. Mover a casilla adyacente.`);
        state.setSelectedPieceIndex(null); 
        ui.clearSelectedPieceHighlight(); 
        return false;
    }

    const newBoard = [...state.board];
    newBoard[toIndex] = playerSymbol;
    newBoard[fromIndex] = null;
    state.setBoard(newBoard);

    ui.updateCellUI(toIndex, playerSymbol);
    ui.updateCellUI(fromIndex, null); 
    sound.playSound('move');
    state.setSelectedPieceIndex(null); 
    ui.clearSelectedPieceHighlight();

    const winDetails = checkWin(playerSymbol);
    if (winDetails) {
        endGame(playerSymbol, winDetails);
        return true;
    }
    
    // After a successful move, before switching player, check if the *next* player will have any valid moves.
    // This means we check for the opponent of the current playerSymbol.
    const nextPlayer = playerSymbol === state.gameP1Icon ? state.gameP2Icon : state.gameP1Icon;
    if (!hasValidMoves(nextPlayer, newBoard)) { // Check draw for the player whose turn it will become
        endDraw(); // If next player has no moves, it's a draw
        return true;
    }

    switchPlayer();
    return true;
}


/**
 * Handles the end of the game when a player wins.
 */
export function endGame(winnerSymbol, winningCells) {
    state.setGameActive(false);
    state.setGamePhase(state.GAME_PHASES.GAME_OVER);
    ui.setBoardClickable(false);
    ui.clearSuggestedMoveHighlight();
    ui.clearSelectedPieceHighlight(); 
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
    setTimeout(init, delay);
}

/**
 * Handles the end of the game when it's a draw.
 */
export function endDraw() {
    state.setGameActive(false);
    state.setGamePhase(state.GAME_PHASES.GAME_OVER);
    ui.setBoardClickable(false);
    ui.clearSuggestedMoveHighlight();
    ui.clearSelectedPieceHighlight(); 
    ui.playDrawAnimation();
    sound.playSound('draw');
    ui.updateStatus("¡EMPATE!");
    state.incrementDraws();
    state.setLastWinner(null);
    state.setPreviousGameExists(true);
    localStorage.setItem('drawsTateti', state.draws.toString());
    updateScoreboardHandler();

    const delay = state.AUTO_RESTART_DELAY_DRAW;
    setTimeout(init, delay);
}
