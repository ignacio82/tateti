// eventListeners.js
import * as ui from './ui.js';
import * as state from './state.js';
import * as player from './player.js';
import * as sound from './sound.js';
import * as gameLogic from './gameLogic.js';
import * as peerConnection from './peerConnection.js';
import * as theme from './theme.js';

let mainStopAnyGameInProgressAndResetUICallback;

/* ------------------------------------------------------------------ *
 * Helpers                                                            *
 * ------------------------------------------------------------------ */

function handleCellClick(e) {
    if (!state.gameActive && !(state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && state.gamePhase === state.GAME_PHASES.MOVING && state.selectedPieceIndex !== null)) {
        if (!state.gameActive) return;
    }

    const clickedCell = e.target.closest('.cell');
    if (!clickedCell) return;
    const cellIndex = parseInt(clickedCell.dataset.index, 10);
    
    let localMoveProcessed = false;
    let playerMakingTheMove = null; 
    let fromIndexForSlide = null; // To capture fromIndex for slide moves
    let toIndexForSlide = null;   // To capture toIndex for slide moves


    /* ----------  THREE-PIECE VARIANT : MOVING PHASE  ---------- */
    if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && state.gamePhase === state.GAME_PHASES.MOVING) {
        playerMakingTheMove = state.currentPlayer; 

        if (state.selectedPieceIndex === null) { 
            if (state.board[cellIndex] === playerMakingTheMove) {
                state.setSelectedPieceIndex(cellIndex);
                ui.highlightSelectedPiece(cellIndex);
                ui.updateStatus(`${player.getPlayerName(playerMakingTheMove)}: Mueve tu pieza a un espacio adyacente vacío.`);
            } else {
                ui.updateStatus(`${player.getPlayerName(playerMakingTheMove)}: Selecciona una de TUS piezas para mover.`);
            }
        } else { 
            fromIndexForSlide = state.selectedPieceIndex;
            toIndexForSlide = cellIndex;

            if (toIndexForSlide === fromIndexForSlide) { 
                state.setSelectedPieceIndex(null);
                ui.clearSelectedPieceHighlight();
                ui.updateStatus(`${player.getPlayerName(playerMakingTheMove)}: Selecciona una pieza para mover.`);
            } else if (state.board[toIndexForSlide] === null) { 
                ui.clearSelectedPieceHighlight();
                if (gameLogic.movePiece(fromIndexForSlide, toIndexForSlide, playerMakingTheMove)) {
                    localMoveProcessed = true;
                } else { 
                    ui.updateStatus(`${player.getPlayerName(playerMakingTheMove)}: Movimiento inválido.`);
                    state.setSelectedPieceIndex(null); 
                    if ((!state.pvpRemoteActive || state.isMyTurnInRemote) && state.gameActive) {
                        ui.setBoardClickable(true); gameLogic.showEasyModeHint?.();
                    }
                }
            } else if (state.board[toIndexForSlide] === playerMakingTheMove) { 
                state.setSelectedPieceIndex(toIndexForSlide); 
                ui.highlightSelectedPiece(toIndexForSlide);   
                ui.updateStatus(`${player.getPlayerName(playerMakingTheMove)}: Mueve la pieza seleccionada.`);
            } else { 
                ui.updateStatus(`${player.getPlayerName(playerMakingTheMove)}: Movimiento inválido.`);
            }
        }
        if (!localMoveProcessed && state.selectedPieceIndex !== null && clickedCell.querySelector('span')?.textContent === playerMakingTheMove) return;
        if (!localMoveProcessed && state.selectedPieceIndex === null && cellIndex !== state.selectedPieceIndex) return;

    } else { /* ----------  CLASSIC OR THREE-PIECE PLACEMENT PHASE  ---------- */
        if (clickedCell.querySelector('span')?.textContent !== '') return;

        if (state.pvpRemoteActive) {
            if (!state.gamePaired || !state.isMyTurnInRemote) return; 
            playerMakingTheMove = state.myEffectiveIcon;
        } else if (state.vsCPU) {
            if (state.currentPlayer !== state.gameP1Icon) return; 
            playerMakingTheMove = state.gameP1Icon;
        } else { 
            playerMakingTheMove = state.currentPlayer;
        }

        if (!playerMakingTheMove) return;

        if (gameLogic.makeMove(cellIndex, playerMakingTheMove)) {
            localMoveProcessed = true;
        }
    }

    if (localMoveProcessed && state.pvpRemoteActive && state.gamePaired) {
        // After local game logic (makeMove or movePiece) has run:
        // - state.board is updated.
        // - state.currentPlayer is now the *next* player.
        // - state.gamePhase might have changed (e.g., to MOVING or GAME_OVER).
        // - state.gameActive is false if the game ended.
        // - state.lastWinner is set if there was a winner.

        const fullStateData = {
            type: 'full_state_update',
            board: [...state.board],
            currentPlayer: state.currentPlayer, // This is the player whose turn it IS NEXT
            gamePhase: state.gamePhase,
            gameActive: state.gameActive,
            winner: null, // Determined below
            draw: false,  // Determined below
            // If it was a slide, include from/to for potential animation on receiver (optional)
            // This assumes fromIndexForSlide and toIndexForSlide are set if it was a slide.
            // This part is slightly tricky if the move was a placement.
            // For simplicity of the state snapshot, from/to aren't strictly needed if board is sent.
            // However, if we want to clearly distinguish move types in data, we can add them conditionally.
        };

        if (!state.gameActive) { // Game ended with the move made by playerMakingTheMove
            if (state.lastWinner) { // gameLogic.endGame sets state.lastWinner
                fullStateData.winner = state.lastWinner;
                fullStateData.draw = false;
            } else { 
                // If game ended and no winner, it must be a draw
                // gameLogic.endDraw() sets lastWinner to null and increments draws.
                fullStateData.draw = true; 
            }
        }
        
        console.log("eventListeners: Sending full_state_update:", JSON.parse(JSON.stringify(fullStateData)));
        peerConnection.sendPeerData(fullStateData);

        if (state.gameActive) { // If game continues, local player waits
            state.setIsMyTurnInRemote(false);
            ui.updateStatus(`Esperando a ${player.getPlayerName(state.currentPlayer)}...`); 
            ui.setBoardClickable(false);
        }
        // If game ended, local UI is already handled by gameLogic's endGame/endDraw
    }
}

function changeSymbolsBtnHandler() {
    const newIndex = (state.currentSymbolIndex + 1) % state.symbolSet.length;
    state.setCurrentSymbolIndex(newIndex);
    localStorage.setItem('currentSymbolIndex', state.currentSymbolIndex.toString());
    player.determineEffectiveIcons();
    sound.playSound('move');
    if (!state.gameActive) {
        ui.updateStatus(`Turno del ${player.getPlayerName(state.gameP1Icon)}`);
    }
}

export function setupEventListeners(stopCb) {
    mainStopAnyGameInProgressAndResetUICallback = stopCb;

    /* ----------  GLOBAL / MENU HANDLERS  ---------- */
    ui.menuToggle?.addEventListener('click', ui.toggleMenu);
    document.addEventListener('click', e => ui.closeMenuIfNeeded(e.target));

    /* ----------  BOARD CELLS  ---------- */
    ui.cells.forEach(cell => {
        cell.addEventListener('click', handleCellClick);
        cell.setAttribute('tabindex', '0');
        cell.addEventListener('keydown', e => {
            if (['Enter', ' '].includes(e.key)) {
                e.preventDefault();
                cell.click();
            }
        });
    });

    /* ----------  RESTART  ---------- */
    ui.restartIcon?.addEventListener('click', () => {
        if (state.pvpRemoteActive && state.gamePaired) {
            peerConnection.sendPeerData({ type: 'restart_request' });
            ui.showOverlay('Solicitud de reinicio enviada...');
        } else {
            mainStopAnyGameInProgressAndResetUICallback?.();
            gameLogic.init();
        }
        ui.sideMenu?.classList.remove('open');
    });

    /* ----------  MODE BUTTONS  ---------- */
    ui.pvpLocalBtn?.addEventListener('click', () => {
        mainStopAnyGameInProgressAndResetUICallback?.();
        state.setVsCPU(false);
        state.setPvpRemoteActive(false);
        gameLogic.init();
    });

    /* 3-Piece ON/OFF switch  */
    ui.threePieceToggle?.addEventListener('change', e => {
        const useThreePiece = e.target.checked;
        mainStopAnyGameInProgressAndResetUICallback?.(); 

        state.setGameVariant(
            useThreePiece ? state.GAME_VARIANTS.THREE_PIECE
                          : state.GAME_VARIANTS.CLASSIC
        );
        localStorage.setItem('tatetiGameVariant', state.gameVariant);
        gameLogic.init(); 
    });

    ui.hostGameBtn?.addEventListener('click', () => {
        peerConnection.initializePeerAsHost(mainStopAnyGameInProgressAndResetUICallback);
    });

    ui.cpuBtn?.addEventListener('click', () => {
        mainStopAnyGameInProgressAndResetUICallback?.();
        state.setVsCPU(true);
        state.setPvpRemoteActive(false);
        gameLogic.init();
    });

    /* ----------  DIFFICULTY & START OPTIONS  ---------- */
    [ui.easyBtn, ui.mediumBtn, ui.hardBtn].forEach(btn => {
        btn?.addEventListener('click', e => {
            state.setDifficulty(e.target.id.replace('Btn', ''));
            sound.playSound('move');
            if (state.vsCPU && (!state.gameActive || state.board.every(c => c === null))) {
                gameLogic.init();
            } else if (state.vsCPU) { 
                ui.updateAllUIToggleButtons();
            }
        });
    });

    [ui.player1StartsBtn, ui.randomStartsBtn, ui.loserStartsBtn].forEach(btn => {
        btn?.addEventListener('click', e => {
            state.setWhoGoesFirstSetting(e.target.id.replace('StartsBtn', ''));
            localStorage.setItem('whoGoesFirstSetting', state.whoGoesFirstSetting);
            sound.playSound('move');
            if (!state.gameActive || state.board.every(c => c === null)) {
                gameLogic.init(); 
            } else {
                ui.updateAllUIToggleButtons(); 
            }
        });
    });

    /* ----------  THEME, SOUND, SYMBOLS  ---------- */
    ui.themeToggle?.addEventListener('click', theme.toggleTheme);
    document.getElementById('soundToggle')?.addEventListener('click', sound.toggleSound);
    ui.changeSymbolsBtn?.addEventListener('click', changeSymbolsBtnHandler);

    /* prevent pinch-zoom dbl-tap quirks on mobile */
    document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
}