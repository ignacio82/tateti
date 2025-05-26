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
    // Initial gameActive check. More nuanced checks might be needed if a move could start a game.
    // If no piece is selected in moving phase, gameActive must be true to proceed.
    if (!state.gameActive && !(state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && state.gamePhase === state.GAME_PHASES.MOVING && state.selectedPieceIndex !== null)) {
        if (!state.gameActive) return; // Stricter check if not trying to complete a move in 3-piece
    }

    const clickedCell = e.target.closest('.cell');
    if (!clickedCell) return;

    const cellIndex = parseInt(clickedCell.dataset.index, 10);
    let localMoveProcessed = false;
    let playerMakingTheMove = null; // To store who made the move for win/draw check

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
                playerMakingTheMove = state.currentPlayer; // Player whose turn it was when initiating this action

                ui.clearSelectedPieceHighlight();
                
                if (gameLogic.movePiece(fromIndex, toIndex, playerMakingTheMove)) {
                    localMoveProcessed = true;
                    // gameLogic.movePiece has updated local state (board, currentPlayer, gamePhase, gameActive)
                } else {
                    // Move was invalid
                    ui.updateStatus(
                        `${player.getPlayerName(playerMakingTheMove)}: Movimiento inválido. Selecciona tu pieza y luego un espacio adyacente vacío.`
                    );
                    state.setSelectedPieceIndex(null); 
                    ui.clearSelectedPieceHighlight();
                    if ((!state.pvpRemoteActive || state.isMyTurnInRemote) && state.gameActive) {
                         ui.setBoardClickable(true);
                         gameLogic.showEasyModeHint?.();
                    }
                }
            } else if (state.board[cellIndex] === state.currentPlayer) { // change selection
                state.setSelectedPieceIndex(cellIndex);
                ui.highlightSelectedPiece(cellIndex); 
                ui.updateStatus(
                    `${player.getPlayerName(state.currentPlayer)}: Mueve la pieza seleccionada a un espacio adyacente vacío.`
                );
            } else { // Clicked on opponent's piece or an invalid cell not handled above
                ui.updateStatus(
                    `${player.getPlayerName(state.currentPlayer)}: Movimiento inválido. Mueve tu pieza seleccionada a un espacio adyacente vacío.`
                );
            }
        }
        // For MOVING phase, if a move was processed, fall through to send state. If only selection changed, return.
        if (!localMoveProcessed && state.selectedPieceIndex !== null) return; // Only selection changed, don't send state.
        if (!localMoveProcessed && state.selectedPieceIndex === null && cellIndex !== state.selectedPieceIndex) return; // Deselection, don't send state.

    } else { /* ----------  CLASSIC OR THREE-PIECE PLACEMENT PHASE  ---------- */
        if (clickedCell.querySelector('span')?.textContent !== '') return; // Cell occupied

        if (state.pvpRemoteActive) {
            if (!state.gamePaired || !state.isMyTurnInRemote) return; 
            playerMakingTheMove = state.myEffectiveIcon;
        } else if (state.vsCPU) {
            if (state.currentPlayer !== state.gameP1Icon) return; 
            playerMakingTheMove = state.gameP1Icon;
        } else { 
            playerMakingTheMove = state.currentPlayer;
        }

        if (playerMakingTheMove && gameLogic.makeMove(cellIndex, playerMakingTheMove)) {
            localMoveProcessed = true;
            // gameLogic.makeMove has updated local state (board, currentPlayer, gamePhase, gameActive)
        }
    }

    // If a local move was successfully processed, send the new state in P2P games
    if (localMoveProcessed && state.pvpRemoteActive && state.gamePaired) {
        // Scores are not strictly part of "move" state but can be sent for robust sync if desired
        // For now, focusing on essential game state for turns.
        const fullStateData = {
            type: 'full_state_update',
            board: [...state.board], // Send a copy of the board
            currentPlayer: state.currentPlayer, // This is the player whose turn it is NEXT
            gamePhase: state.gamePhase,
            gameActive: state.gameActive,
            // Include win/draw information based on the playerWhoMadeTheMove
            // Note: gameLogic would have set gameActive = false if game ended.
            // The 'winner' and 'draw' fields here are for the remote player to know the outcome clearly.
            winner: null,
            draw: false,
            // We also need to determine who made the move that led to this state, for win/draw context
            // playerWhoMadeTheMoveIcon is `playerMakingTheMove` captured above.
        };

        if (!state.gameActive && playerMakingTheMove) { // If game just ended with this move
            const winDetails = gameLogic.checkWin(playerMakingTheMove, state.board);
            if (winDetails) {
                fullStateData.winner = playerMakingTheMove;
                // fullStateData.winningCells = winDetails; // Optional: if receiver needs to highlight
            } else if (gameLogic.checkDraw(state.board)) {
                fullStateData.draw = true;
            }
        }
        
        console.log("eventListeners: Sending full_state_update:", JSON.parse(JSON.stringify(fullStateData)));
        peerConnection.sendPeerData(fullStateData);

        // After sending the state, local player waits (if game is still active)
        if (state.gameActive) { 
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
            // For full state sync, a restart might just re-initialize locally and send new init state.
            // Or, send a specific 'restart_request' which then causes both to re-init.
            // Keeping restart_request for now as it's a different kind of message.
            peerConnection.sendPeerData({ type: 'restart_request' });
            ui.showOverlay('Solicitud de reinicio enviada...');
        } else {
            mainStopAnyGameInProgressAndResetUICallback?.();
            gameLogic.init(); // This will reset local state
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