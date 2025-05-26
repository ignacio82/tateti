// eventListeners.js
import * as ui from './ui.js';
import * as state from './state.js';
import * as player from './player.js';
import * as sound from './sound.js';
import * as gameLogic from './gameLogic.js';
import { cpuMove } from './cpu.js';
import * as peerConnection from './peerConnection.js';
import * as theme from './theme.js';

let mainStopAnyGameInProgressAndResetUICallback;

function handleCellClick(e) {
    if (!state.gameActive) return;

    const clickedCell = e.target.closest('.cell');
    if (!clickedCell || clickedCell.textContent !== '') return; // Cell already taken or not a cell

    const cellIndex = parseInt(clickedCell.dataset.index);

    let playerSymbolToPlace = null;

    if (state.pvpRemoteActive) {
        if (!state.gamePaired || !state.isMyTurnInRemote) {
            console.log("Not your turn or game not paired for remote play.");
            return; // Not player's turn in remote game or not paired
        }
        playerSymbolToPlace = state.myEffectiveIcon;
    } else if (state.vsCPU) {
        if (state.currentPlayer !== state.gameP1Icon) { // Assuming P1 is human
            console.log("Not your turn (vs CPU).");
            return; // Not human's turn
        }
        playerSymbolToPlace = state.gameP1Icon;
    } else { // Local PvP
        playerSymbolToPlace = state.currentPlayer;
    }

    if (playerSymbolToPlace && gameLogic.makeMove(cellIndex, playerSymbolToPlace)) {
        const winDetails = gameLogic.checkWin(playerSymbolToPlace);
        if (winDetails) {
            gameLogic.endGame(playerSymbolToPlace, winDetails);
            if (state.pvpRemoteActive && state.gamePaired) {
                peerConnection.sendPeerData({ type: 'move', index: cellIndex, winner: playerSymbolToPlace, winningCells: winDetails });
            }
            return;
        }
        if (gameLogic.checkDraw()) {
            gameLogic.endDraw();
            if (state.pvpRemoteActive && state.gamePaired) {
                peerConnection.sendPeerData({ type: 'move', index: cellIndex, draw: true });
            }
            return;
        }

        // If move was successful and game continues
        if (state.pvpRemoteActive && state.gamePaired) {
            peerConnection.sendPeerData({ type: 'move', index: cellIndex });
            state.setIsMyTurnInRemote(false);
            ui.updateStatus(`Esperando a ${player.getPlayerName(state.opponentEffectiveIcon)}...`);
            ui.setBoardClickable(false);
        } else {
            gameLogic.switchPlayer();
            ui.updateStatus(`Turno del ${player.getPlayerName(state.currentPlayer)}`);

            if (state.vsCPU && state.currentPlayer === state.gameP2Icon && state.gameActive) {
                ui.setBoardClickable(false);
                setTimeout(() => {
                    if(state.gameActive) cpuMove();
                     // cpuMove should handle making board clickable again if game is still active
                     // For safety, ensure board becomes clickable for human if game is active after CPU.
                    if(state.gameActive && state.currentPlayer === state.gameP1Icon) {
                        ui.setBoardClickable(true);
                    }
                }, 700 + Math.random() * 300);
            }
        }
    }
}

function changeSymbolsBtnHandler() {
    let newIndex = (state.currentSymbolIndex + 1) % state.symbolSet.length;
    state.setCurrentSymbolIndex(newIndex);
    localStorage.setItem('currentSymbolIndex', state.currentSymbolIndex.toString());

    player.determineEffectiveIcons(); // This will set gameP1Icon, gameP2Icon based on new defaults or custom choices
    
    sound.playSound('move');
    ui.updateScoreboard(); // Update scoreboard with potentially new icon names

    // If a game is not active, update status to reflect P1's turn with new icon
    // If a game IS active, symbols might change mid-game which is unusual but we'll allow ui update.
    // However, init() is not called here to prevent resetting an active game.
    if (!state.gameActive) {
      // If no game is active, player 1 is typically the one to start by default.
      // Their icon display in the status message might need an update.
      // The gameLogic.init() function will set the correct starting player and status.
      // For now, just update scoreboard and icons. Future game init will use new symbols.
        ui.updateStatus(`Turno del ${player.getPlayerName(state.gameP1Icon)}`);
    }
    // Consider if gameLogic.init() should be called if no game is active
    // if (!state.gameActive || state.board.every(c => c === null)) gameLogic.init();
}


export function setupEventListeners(
    stopCb,
) {
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

    const restartBtnDOM = document.getElementById('restartBtn'); // This ID seems unused in HTML, restartIcon is used
    if (restartBtnDOM) { // Keeping for robustness if it was intended for something else
        restartBtnDOM.addEventListener('click', () => {
            if (state.pvpRemoteActive && state.gamePaired) {
                peerConnection.sendPeerData({ type: 'restart_request' });
                ui.showOverlay("Solicitud de reinicio enviada...");
            } else {
                gameLogic.init();
            }
        });
    }

    if (ui.restartIcon) {
        ui.restartIcon.addEventListener('click', () => {
            if (state.pvpRemoteActive && state.gamePaired) {
                peerConnection.sendPeerData({ type: 'restart_request' });
                ui.showOverlay("Solicitud de reinicio enviada...");
            } else {
                // If a local game is active, or vs CPU, mainStop... might not be needed if init handles reset.
                // However, if stopCb does more than just game state reset (e.g. full UI reset), it's good.
                if (mainStopAnyGameInProgressAndResetUICallback && typeof mainStopAnyGameInProgressAndResetUICallback === 'function') {
                     mainStopAnyGameInProgressAndResetUICallback();
                }
                gameLogic.init();
            }
            if (ui.sideMenu && ui.sideMenu.classList.contains('open')) ui.sideMenu.classList.remove('open');
        });
    }

    if (ui.pvpLocalBtn) ui.pvpLocalBtn.addEventListener('click', () => {
        if (mainStopAnyGameInProgressAndResetUICallback && typeof mainStopAnyGameInProgressAndResetUICallback === 'function') mainStopAnyGameInProgressAndResetUICallback();
        state.setVsCPU(false); state.setPvpRemoteActive(false); gameLogic.init();
    });
    if (ui.hostGameBtn) ui.hostGameBtn.addEventListener('click', () => peerConnection.initializePeerAsHost(mainStopAnyGameInProgressAndResetUICallback));
    if (ui.joinGameBtn) ui.joinGameBtn.addEventListener('click', () => peerConnection.initializePeerAsJoiner(null, mainStopAnyGameInProgressAndResetUICallback));
    if (ui.cpuBtn) ui.cpuBtn.addEventListener('click', () => {
        if (mainStopAnyGameInProgressAndResetUICallback && typeof mainStopAnyGameInProgressAndResetUICallback === 'function') mainStopAnyGameInProgressAndResetUICallback();
        state.setVsCPU(true); state.setPvpRemoteActive(false); gameLogic.init();
    });

    [ui.easyBtn, ui.mediumBtn, ui.hardBtn].forEach(btn => {
        btn?.addEventListener('click', e => {
            state.setDifficulty(e.target.id.replace('Btn', ''));
            ui.updateAllUIToggleButtons();
            sound.playSound('move');
            if (!state.gameActive || state.vsCPU || (state.gameActive && state.board.every(c => c === null))) gameLogic.init();
        });
    });

    [ui.player1StartsBtn, ui.randomStartsBtn, ui.loserStartsBtn].forEach(btn => {
        btn?.addEventListener('click', e => {
            state.setWhoGoesFirstSetting(e.target.id.replace('StartsBtn', ''));
            localStorage.setItem('whoGoesFirstSetting', state.whoGoesFirstSetting);
            ui.updateAllUIToggleButtons();
            sound.playSound('move');
            if (!state.gameActive || state.board.every(c => c === null)) gameLogic.init();
        });
    });

    if (ui.themeToggle) ui.themeToggle.addEventListener('click', theme.toggleTheme);
    // soundToggle is already an ID in index.html, ui.soundToggle might be defined in ui.js
    const soundToggleBtn = document.getElementById('soundToggle'); // Explicitly get by ID
    if (soundToggleBtn) soundToggleBtn.addEventListener('click', sound.toggleSound);
    
    if (ui.changeSymbolsBtn) ui.changeSymbolsBtn.addEventListener('click', changeSymbolsBtnHandler);

    // Prevent double-click zoom on touch devices, good for PWA experience
    document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
}
