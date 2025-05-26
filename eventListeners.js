// eventListeners.js - Fixed version with improved state synchronization
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
        return; // Not my turn in remote game
    }
    if (!state.gameActive) {
        if (isThreePieceMoving && state.selectedPieceIndex === cellIndex) {
            // Allow deselection even if game not "active" (e.g. end game overlay shown)
        } else {
            return; // Game not active
        }
    }

    let localMoveProcessed = false;
    let playerMakingTheMove = null;
    // let fromIndexForSlide = null; // Declared later when specifically needed

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
            const fromIndexForSlide = state.selectedPieceIndex; // Assign here
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
                    ui.highlightSelectedPiece(fromIndexForSlide); // Re-highlight the piece that failed to move
                }
            } else if (state.board[toIndexForSlideLocal] === playerMakingTheMove) {
                // Clicked on another of their own pieces
                state.setSelectedPieceIndex(toIndexForSlideLocal);
                ui.clearSelectedPieceHighlight();
                ui.highlightSelectedPiece(toIndexForSlideLocal);
                ui.updateStatus(`${player.getPlayerName(playerMakingTheMove)}: Mueve la pieza seleccionada.`);
                gameLogic.showEasyModeHint();
            } else {
                // Clicked on opponent's piece or invalid cell
                ui.updateStatus(`${player.getPlayerName(playerMakingTheMove)}: No puedes mover ahí.`);
                ui.highlightSelectedPiece(fromIndexForSlide); // Keep current selection highlighted
            }
        }
    } else { // Classic or 3-Piece Placement
        if (clickedCell.querySelector('span')?.textContent !== '') return; // Cell not empty

        if (state.pvpRemoteActive) {
            playerMakingTheMove = state.myEffectiveIcon;
        } else if (state.vsCPU) {
            if (state.currentPlayer !== state.gameP1Icon) return; // Not human's turn vs CPU
            playerMakingTheMove = state.gameP1Icon;
        } else { // Local PvP
            playerMakingTheMove = state.currentPlayer;
        }
        if (!playerMakingTheMove) return;

        if (gameLogic.makeMove(cellIndex, playerMakingTheMove)) {
            localMoveProcessed = true;
        }
    }

    if (localMoveProcessed && state.pvpRemoteActive && state.gamePaired) {
        // **MODIFICATION START**
        // Remove: const currentPhaseAfterMove = state.gamePhase;
        
        // Add a small delay to ensure all state updates are complete before sending
        setTimeout(() => {
            // Capture all state fresh inside the timeout
            const fullStateData = {
                type: 'full_state_update',
                board: [...state.board],                 // Read fresh state
                currentPlayer: state.currentPlayer,       // Read fresh state
                gamePhase: state.gamePhase,             // Read fresh state HERE
                gameActive: state.gameActive,             // Read fresh state
                winner: state.gameActive ? null : state.lastWinner, // Read fresh state
                draw: state.gameActive ? false : (!state.lastWinner && !state.gameActive && state.board.every(c=>c!==null)), // Read fresh state
                selectedPieceIndex: state.selectedPieceIndex // Read fresh state
            };
            
            console.log('Sending full_state_update:', fullStateData);
            peerConnection.sendPeerData(fullStateData);
        }, 50); // Slightly increased delay for better state consistency (or keep at 50 if that worked)
        // **MODIFICATION END**

        // This part for updating the local player's (sender's) UI:
        if (state.gameActive) { // This gameActive is the sender's local state
            state.setIsMyTurnInRemote(false); // Sender is no longer the active turn player
            ui.updateStatus(`Esperando a ${player.getPlayerName(state.currentPlayer)}...`); // currentPlayer is now the other player
            ui.setBoardClickable(false); // Sender's board is not clickable
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
        // Only update scoreboard if paired, otherwise init will handle it
        ui.updateScoreboard(); 
    } else if (state.gameActive) {
        // If game is active, just update icons/scoreboard, don't re-init
        ui.updateScoreboard(); 
    }
    // ui.updateAllUIToggleButtons(); // Might be good to call this too
}

export function setupEventListeners(stopCb) {
    mainStopAnyGameInProgressAndResetUICallback = stopCb;

    /* ----------  GLOBAL / MENU HANDLERS  ---------- */
    ui.menuToggle?.addEventListener('click', ui.toggleMenu);
    document.addEventListener('click', e => ui.closeMenuIfNeeded(e.target));

    /* ----------  BOARD CELLS  ---------- */
    ui.cells.forEach(cell => {
        cell.addEventListener('click', handleCellClick);
        cell.setAttribute('tabindex', '0'); // For accessibility
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
            // Show a more neutral message, actual restart happens on ack
            ui.showOverlay(state.gameActive ? 'Solicitud de reinicio enviada...' : 'Proponiendo nueva partida...');
        } else {
            mainStopAnyGameInProgressAndResetUICallback?.(); // Stop any local/cpu game
            gameLogic.init(); // Re-initialize for local/cpu
        }
        ui.sideMenu?.classList.remove('open'); // Close menu on action
    });

    /* ----------  MODE BUTTONS  ---------- */
    ui.pvpLocalBtn?.addEventListener('click', () => {
        mainStopAnyGameInProgressAndResetUICallback?.();
        state.setVsCPU(false);
        state.setPvpRemoteActive(false); 
        state.setGamePaired(false);     // Ensure paired is false
        gameLogic.init();
    });

    ui.threePieceToggle?.addEventListener('change', e => {
        const useThreePiece = e.target.checked;
        mainStopAnyGameInProgressAndResetUICallback?.(); // Stop current game before switching variant
        state.setGameVariant(
            useThreePiece ? state.GAME_VARIANTS.THREE_PIECE
                          : state.GAME_VARIANTS.CLASSIC
        );
        localStorage.setItem('tatetiGameVariant', state.gameVariant);
        gameLogic.init(); // Initialize with new variant
    });

    ui.hostGameBtn?.addEventListener('click', () => {
        // Callback will handle stopping previous game.
        peerConnection.initializePeerAsHost(mainStopAnyGameInProgressAndResetUICallback);
    });

    ui.cpuBtn?.addEventListener('click', () => {
        mainStopAnyGameInProgressAndResetUICallback?.();
        state.setVsCPU(true);
        state.setPvpRemoteActive(false); 
        state.setGamePaired(false);     // Ensure paired is false
        gameLogic.init();
    });

    /* ----------  DIFFICULTY & START OPTIONS  ---------- */
    [ui.easyBtn, ui.mediumBtn, ui.hardBtn].forEach(btn => {
        btn?.addEventListener('click', e => {
            state.setDifficulty(e.target.id.replace('Btn', ''));
            sound.playSound('move');
            // If vs CPU and game hasn't really started (or is over), re-init. Otherwise, just update buttons.
            if (state.vsCPU && (!state.gameActive || state.board.every(c => c === null))) {
                gameLogic.init();
            } else if (state.vsCPU) { // Game active, just update UI
                ui.updateAllUIToggleButtons();
            }
            // If not vs CPU, this setting doesn't apply, but update buttons anyway
            // Or, more strictly: if (!state.vsCPU) ui.updateAllUIToggleButtons();
        });
    });

    [ui.player1StartsBtn, ui.randomStartsBtn, ui.loserStartsBtn].forEach(btn => {
        btn?.addEventListener('click', e => {
            state.setWhoGoesFirstSetting(e.target.id.replace('StartsBtn', ''));
            localStorage.setItem('whoGoesFirstSetting', state.whoGoesFirstSetting);
            sound.playSound('move');
            // Re-init if game not active/board empty, AND not in a paired remote game
            if ((!state.gameActive || state.board.every(c => c === null)) && !(state.pvpRemoteActive && state.gamePaired)) {
                gameLogic.init();
            } else { // Game active or remote paired, just update UI
                ui.updateAllUIToggleButtons();
            }
        });
    });

    /* ----------  THEME, SOUND, SYMBOLS  ---------- */
    ui.themeToggle?.addEventListener('click', theme.toggleTheme);
    document.getElementById('soundToggle')?.addEventListener('click', sound.toggleSound);
    ui.changeSymbolsBtn?.addEventListener('click', changeSymbolsBtnHandler);

    // Prevent double-click text selection which can be annoying on a game board
    document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
}