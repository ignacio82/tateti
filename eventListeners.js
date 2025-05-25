// eventListeners.js
import * as ui from './ui.js'; // Import ui module
import * as state from './state.js';
import * as player from './player.js';
import * as sound from './sound.js';
import * as gameLogic from './gameLogic.js';
import { cpuMove } from './cpu.js';
import * as peerConnection from './peerConnection.js';
import * as theme from './theme.js';

let mainStopAnyGameInProgressAndResetUICallback;
// let updateScoreboardUICallback; // No longer needed if direct calls are made
// let updateAllUIToggleButtonsCallback; // No longer needed if direct calls are made


function handleCellClick(e) { /* ... same as before ... */ }
function changeSymbolsBtnHandler() { /* ... same as before ... */ }


export function setupEventListeners(
    stopCb, // stopAnyGameInProgressAndResetUICallback
    // updateScoreboardCb, // No longer need to pass this if ui.updateScoreboard is called directly
    // updateAllTogglesCb // No longer need to pass this if ui.updateAllUIToggleButtons is called directly
) {
    mainStopAnyGameInProgressAndResetUICallback = stopCb;
    // updateScoreboardUICallback = updateScoreboardCb; // Not needed
    // updateAllUIToggleButtonsCallback = updateAllTogglesCb; // Not needed


    if (ui.menuToggle) ui.menuToggle.addEventListener('click', ui.toggleMenu);
    document.addEventListener('click', e => ui.closeMenuIfNeeded(e.target));
    ui.cells.forEach(c => { c.addEventListener('click', handleCellClick); c.setAttribute('tabindex', '0'); c.addEventListener('keydown', e => { if (['Enter', ' '].includes(e.key)) { e.preventDefault(); c.click(); } }); });
    const restartBtnDOM = document.getElementById('restartBtn');
    if (restartBtnDOM) {
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
                if (mainStopAnyGameInProgressAndResetUICallback) mainStopAnyGameInProgressAndResetUICallback();
                gameLogic.init();
            }
            if (ui.sideMenu && ui.sideMenu.classList.contains('open')) ui.sideMenu.classList.remove('open');
        });
    }

    if (ui.pvpLocalBtn) ui.pvpLocalBtn.addEventListener('click', () => { if (mainStopAnyGameInProgressAndResetUICallback) mainStopAnyGameInProgressAndResetUICallback(); state.setVsCPU(false); state.setPvpRemoteActive(false); gameLogic.init(); });
    if (ui.hostGameBtn) ui.hostGameBtn.addEventListener('click', () => peerConnection.initializePeerAsHost(mainStopAnyGameInProgressAndResetUICallback));
    if (ui.joinGameBtn) ui.joinGameBtn.addEventListener('click', () => peerConnection.initializePeerAsJoiner(null, mainStopAnyGameInProgressAndResetUICallback));
    if (ui.cpuBtn) ui.cpuBtn.addEventListener('click', () => { if (mainStopAnyGameInProgressAndResetUICallback) mainStopAnyGameInProgressAndResetUICallback(); state.setVsCPU(true); state.setPvpRemoteActive(false); gameLogic.init(); });

    [ui.easyBtn, ui.mediumBtn, ui.hardBtn].forEach(btn => {
        btn?.addEventListener('click', e => {
            state.setDifficulty(e.target.id.replace('Btn', ''));
            ui.updateAllUIToggleButtons(); // Direct call to ui module function
            sound.playSound('move');
            if (!state.gameActive || state.vsCPU || (state.gameActive && state.board.every(c => c === null))) gameLogic.init();
        });
    });
    [ui.player1StartsBtn, ui.randomStartsBtn, ui.loserStartsBtn].forEach(btn => {
        btn?.addEventListener('click', e => {
            state.setWhoGoesFirstSetting(e.target.id.replace('StartsBtn', ''));
            localStorage.setItem('whoGoesFirstSetting', state.whoGoesFirstSetting);
            ui.updateAllUIToggleButtons(); // Direct call
            sound.playSound('move');
            if (!state.gameActive || state.board.every(c => c === null)) gameLogic.init();
        });
    });

    if (ui.themeToggle) ui.themeToggle.addEventListener('click', theme.toggleTheme);
    const soundToggleBtn = document.getElementById('soundToggle');
    if (soundToggleBtn) soundToggleBtn.addEventListener('click', sound.toggleSound);
    if (ui.changeSymbolsBtn) ui.changeSymbolsBtn.addEventListener('click', changeSymbolsBtnHandler);
    document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
}