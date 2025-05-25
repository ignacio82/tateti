// ui.js
import * as state from './state.js'; // For accessing game state needed for UI updates
import * as player from './player.js'; // For getPlayerName and determineEffectiveIcons

// ----------  ELEMENTOS DEL DOM (already defined)  ----------
export const cells = document.querySelectorAll('.cell');
export const statusDiv = document.getElementById('status');
export const pvpLocalBtn = document.getElementById('pvpLocalBtn');
export const hostGameBtn = document.getElementById('hostGameBtn');
export const joinGameBtn = document.getElementById('joinGameBtn');
export const cpuBtn = document.getElementById('cpuBtn');
export const difficultyDiv = document.querySelector('.difficulty');
export const easyBtn = document.getElementById('easyBtn');
export const mediumBtn = document.getElementById('mediumBtn');
export const hardBtn = document.getElementById('hardBtn');
export const themeToggle = document.getElementById('themeToggle');
export const soundToggle = document.getElementById('soundToggle');
export const changeSymbolsBtn = document.getElementById('changeSymbolsBtn');
export const player1StartsBtn = document.getElementById('player1StartsBtn');
export const randomStartsBtn = document.getElementById('randomStartsBtn');
export const loserStartsBtn = document.getElementById('loserStartsBtn');
export const gameBoardEl = document.getElementById('game');
export const menuToggle = document.getElementById('menu-toggle');
export const sideMenu = document.getElementById('side-menu');
export const restartIcon = document.getElementById('restart-icon');
export const qrDisplayArea = document.getElementById('qr-display-area');
export const qrCodeCanvas = document.getElementById('qr-code-canvas');
export const qrTextData = document.getElementById('qr-text-data');
export const qrTitle = document.getElementById('qr-title');
export const playerNameInput = document.getElementById('playerNameInput');
export const iconSelectionDiv = document.getElementById('iconSelection');
export const savePlayerPrefsBtn = document.getElementById('savePlayerPrefsBtn');
export const resultsDiv = document.getElementById('results');

// ----------  UI HELPER FUNCTIONS (already defined) ----------
export function showOverlay(text) { /* ... */ }
export function hideOverlay() { /* ... */ }
export function setBoardClickable(clickable) { /* ... */ }
export function playDrawAnimation() { /* ... */ }
export function launchConfetti() { /* ... */ }
export function removeConfetti() { /* ... */ }
export function updateStatus(message) { if (statusDiv) statusDiv.textContent = message; }
export function highlightWinner(winningCells) { /* ... */ }
export function clearBoardUI() { /* ... */ }
export function updateCellUI(index, symbol) { /* ... */ }
export function displayQRCode(gameLink) { /* ... */ }
export function hideQRCode() { /* ... */ }
export function toggleMenu() { if (sideMenu) sideMenu.classList.toggle('open'); }
export function closeMenuIfNeeded(eventTarget) { if (sideMenu && menuToggle && !sideMenu.contains(eventTarget) && !menuToggle.contains(eventTarget) && sideMenu.classList.contains('open')) sideMenu.classList.remove('open');}
export function updateThemeToggleButton(isDarkTheme) { if (themeToggle) themeToggle.textContent = isDarkTheme ? '☀️' : '🌙'; } //
export function updateSoundToggleButton(soundEnabled) { if (soundToggle) soundToggle.textContent = soundEnabled ? '🔊' : '🔇'; } //

// ---------- NEWLY MOVED UI UPDATE FUNCTIONS ----------

/**
 * Updates the scoreboard display.
 */
export function updateScoreboard() { // Formerly updateScoreboardUI_callback
    // Ensure effective icons are determined, especially if this is called early
    // This check helps if determineEffectiveIcons hasn't run or needs re-running due to new info.
    if (!state.myEffectiveIcon || (!state.opponentEffectiveIcon && (state.vsCPU || state.pvpRemoteActive))) {
         player.determineEffectiveIcons();
    }

    let myDisplayName = player.getPlayerName(state.myEffectiveIcon);
    let opponentDisplayName;

    if (state.pvpRemoteActive || state.vsCPU) {
        opponentDisplayName = player.getPlayerName(state.opponentEffectiveIcon);
    } else { // Local PvP: display based on gameP1Icon and gameP2Icon for clarity
        myDisplayName = player.getPlayerName(state.gameP1Icon);
        opponentDisplayName = player.getPlayerName(state.gameP2Icon);
    }

    if (resultsDiv) { //
        resultsDiv.innerHTML = `${myDisplayName} <span id="myWinsSpan">${state.myWins}</span> – ${opponentDisplayName} <span id="opponentWinsSpan">${state.opponentWins}</span> – 🤝 <span id="drawsSpan">${state.draws}</span>`; //
    }
}

/**
 * Updates the active state and visibility of various UI toggle buttons and sections
 * based on the current game state.
 */
export function updateAllUIToggleButtons() { // Formerly updateAllUIToggleButtons_callback
    // Game Mode Buttons
    [pvpLocalBtn, hostGameBtn, joinGameBtn, cpuBtn].forEach(btn => btn?.classList.remove('active')); //
    if (state.pvpRemoteActive) { //
        if (state.iAmPlayer1InRemote && hostGameBtn) hostGameBtn.classList.add('active'); //
        else if (!state.iAmPlayer1InRemote && joinGameBtn) joinGameBtn.classList.add('active'); //
    } else if (state.vsCPU && cpuBtn) { //
        cpuBtn.classList.add('active'); //
    } else if (pvpLocalBtn) { // Default or explicitly chosen local PvP
        pvpLocalBtn.classList.add('active'); //
    }

    // Difficulty Section
    if (difficultyDiv) difficultyDiv.style.display = state.vsCPU ? 'flex' : 'none'; //
    [easyBtn, mediumBtn, hardBtn].forEach(btn => btn?.classList.remove('active')); //
    if (state.vsCPU) { //
        if (state.difficulty === 'easy' && easyBtn) easyBtn.classList.add('active'); //
        else if (state.difficulty === 'hard' && hardBtn) hardBtn.classList.add('active'); //
        else if (mediumBtn) mediumBtn.classList.add('active'); // Default
    }

    // Start Options Buttons
    [player1StartsBtn, randomStartsBtn, loserStartsBtn].forEach(btn => btn?.classList.remove('active')); //
    const startSettingMap = { 'player1': player1StartsBtn, 'random': randomStartsBtn, 'loser': loserStartsBtn }; //
    if (startSettingMap[state.whoGoesFirstSetting]) { //
        startSettingMap[state.whoGoesFirstSetting].classList.add('active'); //
    } else if (player1StartsBtn) { // Default
        player1StartsBtn.classList.add('active'); //
    }

    // Theme and Sound Toggle Buttons Visual Update
    // These are also updated by their respective modules (theme.js, sound.js) when toggled.
    // Calling them here ensures consistency if state changes from other places.
    updateThemeToggleButton(document.body.classList.contains('dark-theme')); //
    updateSoundToggleButton(state.soundEnabled); //
}

// Re-export all previously defined UI functions for simplicity if other modules import directly from ui.js
// showOverlay, hideOverlay, setBoardClickable, playDrawAnimation, launchConfetti, removeConfetti,
// updateStatus, highlightWinner, clearBoardUI, updateCellUI, displayQRCode, hideQRCode,
// toggleMenu, closeMenuIfNeeded, updateThemeToggleButton, updateSoundToggleButton.