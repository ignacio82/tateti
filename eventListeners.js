// eventListeners.js - Continued debugging
import * as ui from './ui.js';
import * as state from './state.js';
import * as player from './player.js';
import * as sound from './sound.js';
import * as gameLogic from './gameLogic.js';
import * as peerConnection from './peerConnection.js';
import * as theme from './theme.js';

let mainStopAnyGameInProgressAndResetUICallback;

function handleCellClick(e) {
    const clickedCell = e.target.closest('.cell');
    if (!clickedCell) return;
    const cellIndex = parseInt(clickedCell.dataset.index, 10);

    const isThreePieceMoving = state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && state.gamePhase === state.GAME_PHASES.MOVING;

    if (state.pvpRemoteActive && !state.isMyTurnInRemote && state.gameActive) {
        return;
    }
    if (!state.gameActive) {
        if (isThreePieceMoving && state.selectedPieceIndex === cellIndex) {
            // Allow deselection
        } else {
            return;
        }
    }

    let localMoveProcessed = false;
    let playerMakingTheMove = null;

    if (isThreePieceMoving) {
        if (state.pvpRemoteActive) {
            playerMakingTheMove = state.myEffectiveIcon;
        } else if (state.vsCPU) {
            if (state.currentPlayer !== state.gameP1Icon) return;
            playerMakingTheMove = state.gameP1Icon;
        } else {
            playerMakingTheMove = state.currentPlayer;
        }
        if (!playerMakingTheMove) return;

        if (state.selectedPieceIndex === null) {
            if (state.board[cellIndex] === playerMakingTheMove) {
                state.setSelectedPieceIndex(cellIndex);
                ui.clearSuggestedMoveHighlight();
                ui.highlightSelectedPiece(cellIndex);
                ui.updateStatus(`${player.getPlayerName(playerMakingTheMove)}: Mueve tu pieza a un espacio adyacente vacío.`);
                gameLogic.showEasyModeHint();
            }
        } else {
            const fromIndexForSlide = state.selectedPieceIndex;
            const toIndexForSlideLocal = cellIndex;

            if (toIndexForSlideLocal === fromIndexForSlide) {
                state.setSelectedPieceIndex(null);
                ui.clearSelectedPieceHighlight();
                ui.updateStatus(`${player.getPlayerName(playerMakingTheMove)}: Selecciona una pieza para mover.`);
                gameLogic.showEasyModeHint();
            } else if (state.board[toIndexForSlideLocal] === null) {
                ui.clearSelectedPieceHighlight();
                if (gameLogic.movePiece(fromIndexForSlide, toIndexForSlideLocal, playerMakingTheMove)) {
                    localMoveProcessed = true;
                } else {
                    ui.updateStatus(`${player.getPlayerName(playerMakingTheMove)}: Movimiento inválido.`);
                    ui.highlightSelectedPiece(fromIndexForSlide);
                }
            } else if (state.board[toIndexForSlideLocal] === playerMakingTheMove) {
                state.setSelectedPieceIndex(toIndexForSlideLocal);
                ui.clearSelectedPieceHighlight();
                ui.highlightSelectedPiece(toIndexForSlideLocal);
                ui.updateStatus(`${player.getPlayerName(playerMakingTheMove)}: Mueve la pieza seleccionada.`);
                gameLogic.showEasyModeHint();
            } else {
                ui.updateStatus(`${player.getPlayerName(playerMakingTheMove)}: No puedes mover ahí.`);
                ui.highlightSelectedPiece(fromIndexForSlide);
            }
        }
    } else { // Classic or 3-Piece Placement
        if (clickedCell.querySelector('span')?.textContent !== '') return;

        if (state.pvpRemoteActive) {
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
        // **** NEW DEBUGGING LOG ****
        console.log(`eventListeners.js: RIGHT BEFORE setTimeout schedule. state.gamePhase: ${state.gamePhase}. TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`);
        
        setTimeout(() => {
            console.log(`eventListeners.js: INSIDE setTimeout. Current state.gamePhase before packaging: ${state.gamePhase}. TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`);
            
            const fullStateData = {
                type: 'full_state_update',
                board: [...state.board],
                currentPlayer: state.currentPlayer,
                gamePhase: state.gamePhase, // This is the value we are debugging
                gameActive: state.gameActive,
                turnCounter: state.turnCounter,
                winner: state.gameActive ? null : state.lastWinner,
                draw: state.gameActive ? false : (!state.lastWinner && !state.gameActive && state.board.every(c=>c!==null)),
                selectedPieceIndex: state.selectedPieceIndex
            };
            
            // Log a stringified version to be sure about the packaged content
            console.log('Sending full_state_update:', JSON.stringify(fullStateData)); 
            peerConnection.sendPeerData(fullStateData);
        }, 50);

        // This block executes synchronously after makeMove returns, before the setTimeout callback
        if (state.gameActive) {
            // **** NEW DEBUGGING LOG ****
            console.log(`eventListeners.js: Updating local UI (sender) after move. state.gamePhase: ${state.gamePhase}. TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`);
            state.setIsMyTurnInRemote(false);
            ui.updateStatus(`Esperando a ${player.getPlayerName(state.currentPlayer)}...`);
            ui.setBoardClickable(false);
        }
    }
}

function changeSymbolsBtnHandler() {
    const newIndex = (state.currentSymbolIndex + 1) % state.symbolSet.length;
    state.setCurrentSymbolIndex(newIndex);
    localStorage.setItem('currentSymbolIndex', state.currentSymbolIndex.toString());
    player.determineEffectiveIcons();
    sound.playSound('move');
    if (!state.gameActive && !state.pvpRemoteActive) {
        gameLogic.init();
    } else if (!state.gameActive && state.pvpRemoteActive && state.gamePaired) {
        ui.updateScoreboard();
    } else if (state.gameActive) {
        ui.updateScoreboard();
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
        state.setPvpRemoteActive(false);
        state.setGamePaired(false);
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
        gameLogic.init();
    });

    ui.hostGameBtn?.addEventListener('click', () => {
        peerConnection.initializePeerAsHost(mainStopAnyGameInProgressAndResetUICallback);
    });

    ui.cpuBtn?.addEventListener('click', () => {
        mainStopAnyGameInProgressAndResetUICallback?.();
        state.setVsCPU(true);
        state.setPvpRemoteActive(false);
        state.setGamePaired(false);
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

    document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
}