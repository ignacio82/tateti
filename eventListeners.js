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
    if (!state.gameActive) return;

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
            } else if (state.board[cellIndex] === null) {           // destination
                ui.clearSelectedPieceHighlight();
                if (
                    gameLogic.movePiece(
                        state.selectedPieceIndex,
                        cellIndex,
                        state.currentPlayer
                    )
                ) {
                    /* move succeeded – gameLogic switches turn */
                } else {
                    ui.updateStatus(
                        `${player.getPlayerName(state.currentPlayer)}: Movimiento inválido. Selecciona tu pieza y luego un espacio adyacente vacío.`
                    );
                    state.setSelectedPieceIndex(null);
                }
            } else if (state.board[cellIndex] === state.currentPlayer) { // change selection
                state.setSelectedPieceIndex(cellIndex);
                ui.highlightSelectedPiece(cellIndex);
                ui.updateStatus(
                    `${player.getPlayerName(state.currentPlayer)}: Mueve la pieza seleccionada a un espacio adyacente vacío.`
                );
            } else {
                ui.updateStatus(
                    `${player.getPlayerName(state.currentPlayer)}: Movimiento inválido. Mueve tu pieza seleccionada a un espacio adyacente vacío.`
                );
            }
        }
        return; // stop here; skip placement-phase handling
    }

    /* ----------  CLASSIC OR THREE-PIECE PLACEMENT PHASE  ---------- */
    if (clickedCell.querySelector('span')?.textContent !== '') return; // occupied

    let playerSymbolToPlace = null;

    if (state.pvpRemoteActive) {
        if (!state.gamePaired || !state.isMyTurnInRemote) return;
        playerSymbolToPlace = state.myEffectiveIcon;
    } else if (state.vsCPU) {
        if (state.currentPlayer !== state.gameP1Icon) return; // Human is always P1 vs CPU
        playerSymbolToPlace = state.gameP1Icon;
    } else { // Local PvP
        playerSymbolToPlace = state.currentPlayer;
    }

    if (playerSymbolToPlace && gameLogic.makeMove(cellIndex, playerSymbolToPlace)) {
        if (state.pvpRemoteActive && state.gamePaired && state.gameActive) {
            const moveData = { type: 'move', index: cellIndex };

            const winDetails = gameLogic.checkWin(playerSymbolToPlace);
            if (winDetails) {
                moveData.winner       = playerSymbolToPlace;
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
        // state.setGameVariant(state.GAME_VARIANTS.CLASSIC); // Keep current variant
        // localStorage.setItem('tatetiGameVariant', state.GAME_VARIANTS.CLASSIC);
        gameLogic.init();
    });

    /* 3-Piece ON/OFF switch  */
    ui.threePieceToggle?.addEventListener('change', e => {
        const useThreePiece = e.target.checked;
        mainStopAnyGameInProgressAndResetUICallback?.(); // Stop current game before switching variant

        state.setGameVariant(
            useThreePiece ? state.GAME_VARIANTS.THREE_PIECE
                          : state.GAME_VARIANTS.CLASSIC
        );
        localStorage.setItem('tatetiGameVariant', state.gameVariant);

        // CPU mode is now compatible with Three-Piece, so no need to auto-disable it.
        // if (useThreePiece && state.vsCPU) state.setVsCPU(false); // REMOVED

        gameLogic.init(); // Initialize with new variant, possibly vs CPU
    });

    ui.hostGameBtn?.addEventListener('click', () => {
        /* preserve current variant (Classic or Three-Piece) for host */
        peerConnection.initializePeerAsHost(mainStopAnyGameInProgressAndResetUICallback);
    });

    ui.cpuBtn?.addEventListener('click', () => {
        // CPU mode is now allowed with Three-Piece, so the guard is removed.
        // if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) return; // REMOVED

        mainStopAnyGameInProgressAndResetUICallback?.();
        state.setVsCPU(true);
        state.setPvpRemoteActive(false);
        // Game variant is preserved when switching to CPU mode
        // state.setGameVariant(state.GAME_VARIANTS.CLASSIC); // This would force classic
        // localStorage.setItem('tatetiGameVariant', state.GAME_VARIANTS.CLASSIC);
        gameLogic.init();
    });

    /* ----------  DIFFICULTY & START OPTIONS  ---------- */
    [ui.easyBtn, ui.mediumBtn, ui.hardBtn].forEach(btn => {
        btn?.addEventListener('click', e => {
            state.setDifficulty(e.target.id.replace('Btn', ''));
            sound.playSound('move');
            // Re-init game if vs CPU and game is not active or board is empty,
            // to apply new difficulty immediately if a game hasn't really started.
            if (state.vsCPU && (!state.gameActive || state.board.every(c => c === null))) {
                gameLogic.init();
            } else if (state.vsCPU) { // Otherwise, just update buttons
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
                gameLogic.init(); // Re-init if game hasn't started to apply new setting
            } else {
                ui.updateAllUIToggleButtons(); // Just update buttons if game is in progress
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