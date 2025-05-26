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
    // Allow piece selection/deselection in 3-piece moving phase even if gameActive might briefly be false during transitions
    const isThreePieceMoving = state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && state.gamePhase === state.GAME_PHASES.MOVING;

    if (!state.gameActive && !(isThreePieceMoving && state.selectedPieceIndex !== null)) {
         if (!state.gameActive && !isThreePieceMoving) return; // Block if game is truly inactive
    }


    const clickedCell = e.target.closest('.cell');
    if (!clickedCell) return;
    const cellIndex = parseInt(clickedCell.dataset.index, 10);

    let localMoveProcessed = false;
    let playerMakingTheMove = null;
    let fromIndexForSlide = null;
    let toIndexForSlide = null;


    /* ----------  THREE-PIECE VARIANT : MOVING PHASE  ---------- */
    if (isThreePieceMoving) {
        // Determine whose turn it really is, especially for remote play
        if (state.pvpRemoteActive) {
            if (!state.isMyTurnInRemote) return; // Not my turn
            playerMakingTheMove = state.myEffectiveIcon;
        } else if (state.vsCPU) {
            if (state.currentPlayer !== state.gameP1Icon) return; // CPU's turn
            playerMakingTheMove = state.gameP1Icon;
        } else { // Local PVP
            playerMakingTheMove = state.currentPlayer;
        }
        if (!playerMakingTheMove) return; // Should not happen if checks above are correct


        if (state.selectedPieceIndex === null) {
            if (state.board[cellIndex] === playerMakingTheMove) {
                state.setSelectedPieceIndex(cellIndex);
                ui.clearSuggestedMoveHighlight(); // Clear hint when selecting a piece
                ui.highlightSelectedPiece(cellIndex);
                ui.updateStatus(`${player.getPlayerName(playerMakingTheMove)}: Mueve tu pieza a un espacio adyacente vacío.`);
                gameLogic.showEasyModeHint(); // Show hint for where to move
            } else {
                // ui.updateStatus(`${player.getPlayerName(playerMakingTheMove)}: Selecciona una de TUS piezas para mover.`);
            }
        } else {
            fromIndexForSlide = state.selectedPieceIndex;
            toIndexForSlide = cellIndex;

            if (toIndexForSlide === fromIndexForSlide) { // Clicked selected piece again to deselect
                state.setSelectedPieceIndex(null);
                ui.clearSelectedPieceHighlight();
                ui.updateStatus(`${player.getPlayerName(playerMakingTheMove)}: Selecciona una pieza para mover.`);
                gameLogic.showEasyModeHint(); // Show hint for which piece to select
            } else if (state.board[toIndexForSlide] === null) { // Clicked an empty cell for destination
                ui.clearSelectedPieceHighlight();
                if (gameLogic.movePiece(fromIndexForSlide, toIndexForSlide, playerMakingTheMove)) {
                    localMoveProcessed = true;
                    // BUG 2 FIX: Send explicit slide move for 3-Pieces
                    if (state.pvpRemoteActive && state.gamePaired) {
                        peerConnection.sendPeerData({
                            type : 'move_piece',
                            from : fromIndexForSlide,
                            to   : toIndexForSlide
                            // Opponent will know who made the move (state.opponentEffectiveIcon for them)
                        });
                    }
                } else {
                    ui.updateStatus(`${player.getPlayerName(playerMakingTheMove)}: Movimiento inválido. Intenta de nuevo.`);
                    // Don't deselect, allow trying another destination
                    // state.setSelectedPieceIndex(null);
                    // ui.clearSelectedPieceHighlight(); // Keep it highlighted
                    if ((!state.pvpRemoteActive || state.isMyTurnInRemote) && state.gameActive) {
                        ui.setBoardClickable(true); // Ensure board is clickable
                        gameLogic.showEasyModeHint?.();
                    }
                }
            } else if (state.board[toIndexForSlide] === playerMakingTheMove) { // Clicked another of own pieces
                state.setSelectedPieceIndex(toIndexForSlide);
                ui.clearSelectedPieceHighlight();
                ui.highlightSelectedPiece(toIndexForSlide);
                ui.updateStatus(`${player.getPlayerName(playerMakingTheMove)}: Mueve la pieza seleccionada.`);
                gameLogic.showEasyModeHint();
            } else { // Clicked opponent's piece or invalid cell
                ui.updateStatus(`${player.getPlayerName(playerMakingTheMove)}: No puedes mover ahí. Intenta de nuevo.`);
            }
        }
        // Prevent fall-through if a selection/deselection happened without processing a move
        // if (!localMoveProcessed) return; // This might be too aggressive

    } else { /* ----------  CLASSIC OR THREE-PIECE PLACEMENT PHASE  ---------- */
        if (clickedCell.querySelector('span')?.textContent !== '') return; // Cell not empty

        if (state.pvpRemoteActive) {
            if (!state.gamePaired || !state.isMyTurnInRemote) return;
            playerMakingTheMove = state.myEffectiveIcon;
        } else if (state.vsCPU) {
            if (state.currentPlayer !== state.gameP1Icon) return;
            playerMakingTheMove = state.gameP1Icon;
        } else { // Local PvP
            playerMakingTheMove = state.currentPlayer;
        }

        if (!playerMakingTheMove) return; // Should not happen

        if (gameLogic.makeMove(cellIndex, playerMakingTheMove)) {
            localMoveProcessed = true;
        }
    }

    if (localMoveProcessed && state.pvpRemoteActive && state.gamePaired) {
        const fullStateData = {
            type: 'full_state_update',
            board: [...state.board],
            currentPlayer: state.currentPlayer, // This is the player whose turn it IS NEXT
            gamePhase: state.gamePhase,
            gameActive: state.gameActive,
            winner: null,
            draw: false,
        };

        if (!state.gameActive) { // Game ended
            if (state.lastWinner) {
                fullStateData.winner = state.lastWinner;
            } else {
                fullStateData.draw = true;
            }
        }

        peerConnection.sendPeerData(fullStateData);

        if (state.gameActive) { // If game continues, local player waits
            state.setIsMyTurnInRemote(false);
            ui.updateStatus(`Esperando a ${player.getPlayerName(state.currentPlayer)}...`);
            ui.setBoardClickable(false);
        }
        // If game ended, local UI is handled by gameLogic.endGame/endDraw.
        // Restart for remote games is handled by restart_request/ack flow originating from gameLogic.
    }
}

function changeSymbolsBtnHandler() {
    const newIndex = (state.currentSymbolIndex + 1) % state.symbolSet.length;
    state.setCurrentSymbolIndex(newIndex);
    localStorage.setItem('currentSymbolIndex', state.currentSymbolIndex.toString());
    player.determineEffectiveIcons();
    sound.playSound('move');
    if (!state.gameActive && !state.pvpRemoteActive) { // Update status only if game isn't active and not in remote mode setup
        gameLogic.init(); // Re-initialize to reflect new default symbols if game hasn't started
    } else if (!state.gameActive && state.pvpRemoteActive && state.gamePaired) {
        // If remote and paired but game not started (e.g. between games)
        ui.updateScoreboard(); // Just update scoreboard
    } else if (state.gameActive) {
        ui.updateScoreboard(); // Update scoreboard during active game
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
            // Send restart request regardless of gameActive, peer will decide
            peerConnection.sendPeerData({ type: 'restart_request' });
            ui.showOverlay(state.gameActive ? 'Solicitud de reinicio enviada...' : 'Proponiendo nueva partida...');
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
        state.setPvpRemoteActive(false); // Ensure remote is off
        state.setGamePaired(false);     // Ensure not paired
        gameLogic.init();
    });

    ui.threePieceToggle?.addEventListener('change', e => {
        const useThreePiece = e.target.checked;
        mainStopAnyGameInProgressAndResetUICallback?.();
        state.setGameVariant(
            useThreePiece ? state.GAME_VARIANTS.THREE_PIECE
                          : state.GAME_VARIANTS.CLASSIC
        );
        localStorage.setItem('tatetiGameVariant', state.gameVariant);
        // VsCPU and PvpRemoteActive state should persist or be reset by mode buttons
        gameLogic.init();
    });

    ui.hostGameBtn?.addEventListener('click', () => {
        peerConnection.initializePeerAsHost(mainStopAnyGameInProgressAndResetUICallback);
    });

    ui.cpuBtn?.addEventListener('click', () => {
        mainStopAnyGameInProgressAndResetUICallback?.();
        state.setVsCPU(true);
        state.setPvpRemoteActive(false); // Ensure remote is off
        state.setGamePaired(false);     // Ensure not paired
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
            // Re-init only if game is not active or board is clear, and not in a paired remote session
            if ((!state.gameActive || state.board.every(c => c === null)) && !(state.pvpRemoteActive && state.gamePaired)) {
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