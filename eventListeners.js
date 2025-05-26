// eventListeners.js
import * as ui from './ui.js';
import * as state from './state.js';
import * as player from './player.js';
import * as sound from './sound.js';
import * as gameLogic from './gameLogic.js';
// cpuMove is imported but primarily used via cpuMoveHandler set in game.js
// import { cpuMove } from './cpu.js'; 
import * as peerConnection from './peerConnection.js';
import * as theme from './theme.js';

let mainStopAnyGameInProgressAndResetUICallback;

function handleCellClick(e) {
    if (!state.gameActive) {
        // console.log("Game not active, cell click ignored.");
        return;
    }

    const clickedCell = e.target.closest('.cell');
    if (!clickedCell) {
        // console.log("Click was not on a cell or its child.");
        return;
    }

    const cellIndex = parseInt(clickedCell.dataset.index);

    // --- Three Piece Variant - Moving Phase Logic ---
    if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && state.gamePhase === state.GAME_PHASES.MOVING) {
        if (state.selectedPieceIndex === null) { // Stage 1: No piece is currently selected, try to select one.
            if (state.board[cellIndex] === state.currentPlayer) { // Clicked on one of the current player's pieces
                state.setSelectedPieceIndex(cellIndex);
                ui.highlightSelectedPiece(cellIndex); // Highlight the selected piece
                // console.log(`ThreePiece/Moving: Piece selected at index ${cellIndex} by ${state.currentPlayer}`);
                ui.updateStatus(`${player.getPlayerName(state.currentPlayer)}: Mueve tu pieza a un espacio adyacente vacío.`);
            } else {
                ui.updateStatus(`${player.getPlayerName(state.currentPlayer)}: Selecciona una de TUS piezas para mover.`);
            }
        } else { // Stage 2: A piece is already selected (state.selectedPieceIndex is not null). Try to move it or change selection.
            if (cellIndex === state.selectedPieceIndex) { // Clicked the already selected piece again
                state.setSelectedPieceIndex(null); // Deselect it
                ui.clearSelectedPieceHighlight(); // Clear visual selection
                // console.log(`ThreePiece/Moving: Piece deselected at index ${cellIndex}`);
                ui.updateStatus(`${player.getPlayerName(state.currentPlayer)}: Selecciona una pieza para mover.`);
            } else if (state.board[cellIndex] === null) { // Clicked on an empty cell (potential destination)
                // console.log(`ThreePiece/Moving: Attempting to move from ${state.selectedPieceIndex} to ${cellIndex} by ${state.currentPlayer}`);
                // Clear highlight before attempting move, gameLogic.movePiece will handle next state.
                ui.clearSelectedPieceHighlight(); 
                if (gameLogic.movePiece(state.selectedPieceIndex, cellIndex, state.currentPlayer)) {
                    // Successful move: state.selectedPieceIndex is reset in movePiece, turn switches.
                } else {
                    // Invalid move (e.g., not adjacent)
                    // console.log("ThreePiece/Moving: Invalid move attempt.");
                    ui.updateStatus(`${player.getPlayerName(state.currentPlayer)}: Movimiento inválido. Selecciona tu pieza y luego un espacio adyacente vacío.`);
                    // state.selectedPieceIndex is already reset in movePiece if it attempted, or remains null if pre-check failed.
                    // Forcing re-selection is good:
                    state.setSelectedPieceIndex(null);
                }
            } else if (state.board[cellIndex] === state.currentPlayer) { // Clicked on another of the current player's pieces
                state.setSelectedPieceIndex(cellIndex); // Change selection to the new piece
                ui.highlightSelectedPiece(cellIndex); // Highlight new selection
                // console.log(`ThreePiece/Moving: Switched selected piece to index ${cellIndex}`);
                ui.updateStatus(`${player.getPlayerName(state.currentPlayer)}: Mueve la pieza seleccionada a un espacio adyacente vacío.`);
            } else { // Clicked on an opponent's piece or some other invalid scenario
                ui.updateStatus(`${player.getPlayerName(state.currentPlayer)}: Movimiento inválido. Mueve tu pieza seleccionada a un espacio adyacente vacío.`);
                // Optionally deselect if you want to force re-pick after invalid target click:
                // state.setSelectedPieceIndex(null);
                // ui.clearSelectedPieceHighlight();
            }
        }
        return; 
    }

    // --- Classic Tic-Tac-Toe Logic / Three-Piece Placement Phase Logic ---
    if (clickedCell.querySelector('span')?.textContent !== '') {
        // console.log("Cell already taken, click ignored for placement.");
        return; 
    }

    let playerSymbolToPlace = null;

    if (state.pvpRemoteActive) { 
        if (!state.gamePaired || !state.isMyTurnInRemote) return;
        playerSymbolToPlace = state.myEffectiveIcon;
    } else if (state.vsCPU) { 
        if (state.currentPlayer !== state.gameP1Icon) return;
        playerSymbolToPlace = state.gameP1Icon;
    } else { 
        playerSymbolToPlace = state.currentPlayer;
    }

    if (playerSymbolToPlace && gameLogic.makeMove(cellIndex, playerSymbolToPlace)) {
        if (state.pvpRemoteActive && state.gamePaired && state.gameActive) {
            const moveData = { type: 'move', index: cellIndex };
            const winDetails = gameLogic.checkWin(playerSymbolToPlace);
            if (winDetails) {
                moveData.winner = playerSymbolToPlace;
                moveData.winningCells = winDetails;
            } else if (gameLogic.checkDraw(state.board)) { 
                moveData.draw = true;
            }
            peerConnection.sendPeerData(moveData);
            
            if (!moveData.winner && !moveData.draw) {
                state.setIsMyTurnInRemote(false);
                ui.updateStatus(`Esperando a ${player.getPlayerName(state.opponentEffectiveIcon)}...`);
                ui.setBoardClickable(false);
            }
        }
    } else {
        // console.log(`makeMove returned false for player ${playerSymbolToPlace} at index ${cellIndex}`);
    }
}

function changeSymbolsBtnHandler() {
    let newIndex = (state.currentSymbolIndex + 1) % state.symbolSet.length;
    state.setCurrentSymbolIndex(newIndex);
    localStorage.setItem('currentSymbolIndex', state.currentSymbolIndex.toString());
    player.determineEffectiveIcons();
    sound.playSound('move');
    ui.updateScoreboard();
    if (!state.gameActive) {
        ui.updateStatus(`Turno del ${player.getPlayerName(state.gameP1Icon)}`);
    }
}

export function setupEventListeners(stopCb) {
    mainStopAnyGameInProgressAndResetUICallback = stopCb;

    if (ui.menuToggle) ui.menuToggle.addEventListener('click', ui.toggleMenu);
    document.addEventListener('click', e => ui.closeMenuIfNeeded(e.target));

    ui.cells.forEach(c => {
        c.addEventListener('click', handleCellClick);
        c.setAttribute('tabindex', '0');
        c.addEventListener('keydown', e => {
            if (['Enter', ' '].includes(e.key)) {
                e.preventDefault();
                c.click();
            }
        });
    });
    
    if (ui.restartIcon) {
        ui.restartIcon.addEventListener('click', () => {
            if (state.pvpRemoteActive && state.gamePaired) {
                peerConnection.sendPeerData({ type: 'restart_request' });
                ui.showOverlay("Solicitud de reinicio enviada...");
            } else {
                if (mainStopAnyGameInProgressAndResetUICallback && typeof mainStopAnyGameInProgressAndResetUICallback === 'function') {
                     mainStopAnyGameInProgressAndResetUICallback();
                }
                gameLogic.init(); 
            }
            if (ui.sideMenu && ui.sideMenu.classList.contains('open')) ui.sideMenu.classList.remove('open');
        });
    }

    // Game Mode Button Event Listeners
    if (ui.pvpLocalBtn) ui.pvpLocalBtn.addEventListener('click', () => { 
        if (mainStopAnyGameInProgressAndResetUICallback && typeof mainStopAnyGameInProgressAndResetUICallback === 'function') mainStopAnyGameInProgressAndResetUICallback(); 
        state.setVsCPU(false); 
        state.setPvpRemoteActive(false); 
        state.setGameVariant(state.GAME_VARIANTS.CLASSIC);
        localStorage.setItem('tatetiGameVariant', state.GAME_VARIANTS.CLASSIC);
        gameLogic.init(); 
    });

    if (ui.threePieceBtn) ui.threePieceBtn.addEventListener('click', () => { 
        if (mainStopAnyGameInProgressAndResetUICallback && typeof mainStopAnyGameInProgressAndResetUICallback === 'function') mainStopAnyGameInProgressAndResetUICallback();
        state.setVsCPU(false); 
        state.setPvpRemoteActive(false);
        state.setGameVariant(state.GAME_VARIANTS.THREE_PIECE); 
        localStorage.setItem('tatetiGameVariant', state.GAME_VARIANTS.THREE_PIECE);
        gameLogic.init();
    });

    if (ui.hostGameBtn) ui.hostGameBtn.addEventListener('click', () => {
        state.setGameVariant(state.GAME_VARIANTS.CLASSIC); 
        localStorage.setItem('tatetiGameVariant', state.GAME_VARIANTS.CLASSIC);
        peerConnection.initializePeerAsHost(mainStopAnyGameInProgressAndResetUICallback);
    });
    if (ui.joinGameBtn) ui.joinGameBtn.addEventListener('click', () => {
        state.setGameVariant(state.GAME_VARIANTS.CLASSIC); 
        localStorage.setItem('tatetiGameVariant', state.GAME_VARIANTS.CLASSIC);
        peerConnection.initializePeerAsJoiner(null, mainStopAnyGameInProgressAndResetUICallback);
    });
    if (ui.cpuBtn) ui.cpuBtn.addEventListener('click', () => { 
        if (mainStopAnyGameInProgressAndResetUICallback && typeof mainStopAnyGameInProgressAndResetUICallback === 'function') mainStopAnyGameInProgressAndResetUICallback(); 
        state.setVsCPU(true); 
        state.setPvpRemoteActive(false); 
        state.setGameVariant(state.GAME_VARIANTS.CLASSIC); 
        localStorage.setItem('tatetiGameVariant', state.GAME_VARIANTS.CLASSIC);
        gameLogic.init(); 
    });

    // Difficulty and Start Options
    [ui.easyBtn, ui.mediumBtn, ui.hardBtn].forEach(btn => {
        btn?.addEventListener('click', e => {
            state.setDifficulty(e.target.id.replace('Btn', ''));
            sound.playSound('move');
            if (state.vsCPU && (!state.gameActive || state.board.every(c => c === null))) gameLogic.init();
            else if (state.vsCPU) ui.updateAllUIToggleButtons(); 
        });
    });
    [ui.player1StartsBtn, ui.randomStartsBtn, ui.loserStartsBtn].forEach(btn => {
        btn?.addEventListener('click', e => {
            state.setWhoGoesFirstSetting(e.target.id.replace('StartsBtn', ''));
            localStorage.setItem('whoGoesFirstSetting', state.whoGoesFirstSetting);
            sound.playSound('move');
            if (!state.gameActive || state.board.every(c => c === null)) gameLogic.init();
            else ui.updateAllUIToggleButtons(); 
        });
    });

    if (ui.themeToggle) ui.themeToggle.addEventListener('click', theme.toggleTheme);
    const soundToggleBtn = document.getElementById('soundToggle'); 
    if (soundToggleBtn) soundToggleBtn.addEventListener('click', sound.toggleSound);
    
    if (ui.changeSymbolsBtn) ui.changeSymbolsBtn.addEventListener('click', changeSymbolsBtnHandler);

    document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
}
