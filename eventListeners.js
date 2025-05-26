// eventListeners.js
import * as ui from './ui.js';
import * as state from './state.js';
import * as player from './player.js';
import * as sound from './sound.js';
import * as gameLogic from './gameLogic.js';
// import { cpuMove } from './cpu.js';  // used via cpuMoveHandler in game.js
import * as peerConnection from './peerConnection.js';
import * as theme from './theme.js';

let mainStopAnyGameInProgressAndResetUICallback;

/* ------------------------------------------------------------------ *
 * Helpers                                                            *
 * ------------------------------------------------------------------ */

function handleCellClick(e) {
    // Initial gameActive check; more nuanced checks might be needed if a move could start a game.
    // If no piece is selected in moving phase, gameActive must be true to proceed.
    if (!state.gameActive && !(state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && state.gamePhase === state.GAME_PHASES.MOVING && state.selectedPieceIndex !== null)) {
        if (!state.gameActive) return; // Stricter check if not trying to complete a move in 3-piece
    }

    const clickedCell = e.target.closest('.cell');
    if (!clickedCell) return;

    const cellIndex = parseInt(clickedCell.dataset.index, 10);

    /* ----------  THREE-PIECE VARIANT : MOVING PHASE  ---------- */
    if (
        state.gameVariant === state.GAME_VARIANTS.THREE_PIECE &&
        state.gamePhase   === state.GAME_PHASES.MOVING
    ) {
        if (state.selectedPieceIndex === null) {                    /* ── Stage 1: select ── */
            if (state.board[cellIndex] === state.currentPlayer) {
                state.setSelectedPieceIndex(cellIndex);
                ui.highlightSelectedPiece(cellIndex);
                ui.updateStatus(
                    `${player.getPlayerName(state.currentPlayer)}: Mueve tu pieza a un espacio adyacente vacío.`
                );
            } else {
                ui.updateStatus(
                    `${player.getPlayerName(state.currentPlayer)}: Selecciona una de TUS piezas para mover.`
                );
            }
        } else {                                                    /* ── Stage 2: move / re-select ── */
            if (cellIndex === state.selectedPieceIndex) {           // deselect
                state.setSelectedPieceIndex(null);
                ui.clearSelectedPieceHighlight();
                ui.updateStatus(
                    `${player.getPlayerName(state.currentPlayer)}: Selecciona una pieza para mover.`
                );
            } else if (state.board[cellIndex] === null) {           // destination (attempt to move piece)
                const fromIndex = state.selectedPieceIndex;
                const toIndex = cellIndex;
                const playerMakingTheMove = state.currentPlayer; // Player whose turn it was

                ui.clearSelectedPieceHighlight();
                
                if (
                    gameLogic.movePiece(
                        fromIndex,
                        toIndex,
                        playerMakingTheMove
                    )
                ) {
                    // Move succeeded. gameLogic.movePiece has updated:
                    // - state.board
                    // - state.currentPlayer (to the next player via switchPlayer)
                    // - state.gamePhase (remains MOVING unless game ends)
                    // - state.gameActive (to false if game ended)

                    if (state.pvpRemoteActive && state.gamePaired) {
                        const moveData = {
                            type: 'move',
                            from: fromIndex,
                            to: toIndex,
                            // Send state *after* the move was processed locally
                            gamePhaseAfterMove: state.gamePhase, 
                            nextPlayerIcon: state.currentPlayer // This is the player whose turn is NEXT
                        };

                        // Check win/draw for the player *who made the move*
                        const winDetails = gameLogic.checkWin(playerMakingTheMove, state.board);
                        if (winDetails) {
                            moveData.winner = playerMakingTheMove;
                            moveData.winningCells = winDetails;
                        } else if (gameLogic.checkDraw(state.board)) {
                            moveData.draw = true;
                        }

                        peerConnection.sendPeerData(moveData);

                        // Transition local UI to waiting state ONLY if the game didn't end on this move
                        if (!moveData.winner && !moveData.draw && state.gameActive) { 
                            state.setIsMyTurnInRemote(false);
                            // state.currentPlayer is already the opponent (next player) due to switchPlayer in movePiece
                            ui.updateStatus(`Esperando a ${player.getPlayerName(state.currentPlayer)}...`);
                            ui.setBoardClickable(false);
                        }
                        // If game ended, gameLogic.endGame/endDraw (called by movePiece) handled local UI.
                    }
                } else {
                    // Move was invalid
                    ui.updateStatus(
                        `${player.getPlayerName(playerMakingTheMove)}: Movimiento inválido. Selecciona tu pieza y luego un espacio adyacente vacío.`
                    );
                    state.setSelectedPieceIndex(null); 
                    ui.clearSelectedPieceHighlight(); // Ensure it's cleared
                    // Re-enable board if it's still this player's turn (e.g. local play, or remote if P2P error)
                    if ((!state.pvpRemoteActive || state.isMyTurnInRemote) && state.gameActive) {
                         ui.setBoardClickable(true);
                         gameLogic.showEasyModeHint?.();
                    }
                }
            } else if (state.board[cellIndex] === state.currentPlayer) { // change selection
                state.setSelectedPieceIndex(cellIndex);
                ui.highlightSelectedPiece(cellIndex); // Highlight new selection
                ui.updateStatus(
                    `${player.getPlayerName(state.currentPlayer)}: Mueve la pieza seleccionada a un espacio adyacente vacío.`
                );
            } else { // Clicked on opponent's piece or an invalid cell not handled above
                ui.updateStatus(
                    `${player.getPlayerName(state.currentPlayer)}: Movimiento inválido. Mueve tu pieza seleccionada a un espacio adyacente vacío.`
                );
            }
        }
        return; 
    }

    /* ----------  CLASSIC OR THREE-PIECE PLACEMENT PHASE  ---------- */
    // This check ensures the cell is empty. If not, it's an invalid placement.
    if (clickedCell.querySelector('span')?.textContent !== '') return;

    // Determine who is making the placement move
    let playerMakingTheMove = null; 

    if (state.pvpRemoteActive) {
        if (!state.gamePaired || !state.isMyTurnInRemote) return; // Not my turn or not paired
        playerMakingTheMove = state.myEffectiveIcon;
    } else if (state.vsCPU) {
        if (state.currentPlayer !== state.gameP1Icon) return; // CPU's turn
        playerMakingTheMove = state.gameP1Icon;
    } else { // Local PvP
        playerMakingTheMove = state.currentPlayer;
    }

    if (playerMakingTheMove && gameLogic.makeMove(cellIndex, playerMakingTheMove)) {
        // Placement succeeded. gameLogic.makeMove has updated:
        // - state.board
        // - state.currentPlayer (to the next player via switchPlayer)
        // - state.gamePhase (potentially to MOVING)
        // - state.gameActive (to false if game ended)

        if (state.pvpRemoteActive && state.gamePaired) {
            const moveData = {
                type: 'move',
                index: cellIndex,
                // Send state *after* the move was processed locally
                gamePhaseAfterMove: state.gamePhase,
                nextPlayerIcon: state.currentPlayer // This is the player whose turn is NEXT
            }; 

            // Check win/draw for the player *who made the move*
            const winDetails = gameLogic.checkWin(playerMakingTheMove, state.board);
            if (winDetails) {
                moveData.winner = playerMakingTheMove;
                moveData.winningCells = winDetails;
            } else if (gameLogic.checkDraw(state.board)) {
                moveData.draw = true;
            }

            peerConnection.sendPeerData(moveData);

            // Transition local UI to waiting state ONLY if the game didn't end on this move
            if (!moveData.winner && !moveData.draw && state.gameActive) {
                state.setIsMyTurnInRemote(false);
                // state.currentPlayer is already the opponent (next player) due to switchPlayer in makeMove
                ui.updateStatus(`Esperando a ${player.getPlayerName(state.currentPlayer)}...`);
                ui.setBoardClickable(false);
            }
            // If game ended, gameLogic.endGame/endDraw (called by makeMove) handled local UI.
        }
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

/* ------------------------------------------------------------------ *
 * Public: setupEventListeners                                       *
 * ------------------------------------------------------------------ */
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