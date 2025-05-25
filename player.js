// player.js
import * as state from './state.js';
import {
    playerNameInput,
    iconSelectionDiv,
    savePlayerPrefsBtn,
    sideMenu,
    // The following are needed if updateScoreboard and updateStatus are called from here
    // or if their logic (which uses getPlayerName) is part of this module.
    // For now, assuming they are called from game.js or a future gameLogic.js
    // resultsDiv, statusDiv
} from './ui.js';

// Functions to be moved/used by game.js or ui.js for status/score updates.
// We'll keep getPlayerName here as it's core to player representation.
// updateScoreboard and updateStatus will be refactored later.

export function getPlayerName(sym) {
    if (!sym) return 'Jugador'; // Fallback for undefined symbol

    if (sym === state.myEffectiveIcon) return `${state.myPlayerName} (${sym})`;
    if (sym === state.opponentEffectiveIcon && (state.pvpRemoteActive || state.vsCPU)) {
        return `${state.opponentPlayerName} (${sym})`;
    }
    // For local PvP, opponentEffectiveIcon is P2's icon.
    if (!state.pvpRemoteActive && !state.vsCPU && sym === state.opponentEffectiveIcon) {
        return `Jugador 2 (${sym})`;
    }

    // Fallback to default names from symbolSet if symbol doesn't match effective icons
    for (const set of state.symbolSet) { //
        if (sym === set.player1) return `${set.nameP1} (${sym})`; //
        if (sym === set.player2) return `${set.nameP2} (${sym})`; //
    }
    return `Jugador (${sym})`; // Generic fallback
}


function populateIconSelection() {
    if (!iconSelectionDiv) return;
    iconSelectionDiv.innerHTML = '';
    const uniqueIcons = new Set();
    state.symbolSet.forEach(pair => { //
        uniqueIcons.add(pair.player1);  //
        uniqueIcons.add(pair.player2); //
    });
    uniqueIcons.forEach(icon => {
        const button = document.createElement('button');
        button.classList.add('icon-choice-btn', 'std');
        button.textContent = icon;
        button.dataset.icon = icon;
        if (icon === state.myPlayerIcon) button.classList.add('active');
        button.addEventListener('click', () => {
            state.setMyPlayerIcon(icon);
            iconSelectionDiv.querySelectorAll('.icon-choice-btn').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
        });
        iconSelectionDiv.appendChild(button);
    });
}

export function loadPlayerPreferences() {
    // State variables (myPlayerName, myPlayerIcon) are already initialized from localStorage in game.js (will move to an init module)
    if (playerNameInput) playerNameInput.value = state.myPlayerName;
    populateIconSelection();
}

function savePlayerPreferences(updateScoreboardCallback, updateStatusCallback, determineIconsCallback) {
    state.setMyPlayerName(playerNameInput.value.trim() || 'Jugador');
    localStorage.setItem('tatetiPlayerName', state.myPlayerName);
    // myPlayerIcon is set directly by its button click event, state.setMyPlayerIcon(icon)
    if (state.myPlayerIcon) localStorage.setItem('tatetiPlayerIcon', state.myPlayerIcon);
    else localStorage.removeItem('tatetiPlayerIcon');

    alert("Preferencias guardadas!");
    if (sideMenu) sideMenu.classList.remove('open');

    if (!state.gameActive) {
        determineIconsCallback(); // Callback to determineEffectiveIcons in gameLogic
        updateScoreboardCallback(); // Callback to updateScoreboard in gameLogic/ui
        updateStatusCallback(`Turno del ${getPlayerName(state.gameP1Icon)}`); // Callback to updateStatus in gameLogic/ui
    }
}

export function setupPlayerCustomizationEventListeners(updateScoreboardCb, updateStatusCb, determineIconsCb) {
    if (savePlayerPrefsBtn) {
        savePlayerPrefsBtn.addEventListener('click', () => savePlayerPreferences(updateScoreboardCb, updateStatusCb, determineIconsCb));
    }
}


export function determineEffectiveIcons() {
    const myChosenIcon = state.myPlayerIcon;
    const currentDefaultP1 = state.currentSymbols.player1; //
    const currentDefaultP2 = state.currentSymbols.player2; //

    let newMyEffectiveIcon = myChosenIcon ||
                             (state.pvpRemoteActive ?
                                 (state.iAmPlayer1InRemote ? currentDefaultP1 : currentDefaultP2)
                                 : currentDefaultP1);
    state.setMyEffectiveIcon(newMyEffectiveIcon);

    let newOpponentEffectiveIcon;
    if (state.pvpRemoteActive) {
        // If opponent has chosen an icon and it's different from mine, use it.
        // Otherwise, assign the default counterpart.
        if (state.opponentPlayerIcon && state.opponentPlayerIcon !== newMyEffectiveIcon) {
            newOpponentEffectiveIcon = state.opponentPlayerIcon;
        } else {
            newOpponentEffectiveIcon = (newMyEffectiveIcon === currentDefaultP1) ? currentDefaultP2 : currentDefaultP1;
        }
    } else if (state.vsCPU) {
        newOpponentEffectiveIcon = (newMyEffectiveIcon === currentDefaultP1) ? currentDefaultP2 : currentDefaultP1;
    } else { // Local PvP
        newOpponentEffectiveIcon = (newMyEffectiveIcon === currentDefaultP1) ? currentDefaultP2 : currentDefaultP1;
    }
    state.setOpponentEffectiveIcon(newOpponentEffectiveIcon);

    // Assign icons for game board positions (gameP1Icon is always who moves first by convention if not random)
    if (state.pvpRemoteActive) { // Host is P1 on board, Joiner is P2 on board
        state.setGameP1Icon(state.iAmPlayer1InRemote ? state.myEffectiveIcon : state.opponentEffectiveIcon);
        state.setGameP2Icon(state.iAmPlayer1InRemote ? state.opponentEffectiveIcon : state.myEffectiveIcon);
    } else { // Local PvP or Vs CPU: Player 1 on board uses myEffectiveIcon (if P1 chose it or default)
             // Player 2 on board uses opponentEffectiveIcon
        state.setGameP1Icon(state.myEffectiveIcon); // This assumes the user of the app is P1 in local/CPU
        state.setGameP2Icon(state.opponentEffectiveIcon);
    }

    // Safety check: if P1 and P2 icons ended up the same (e.g., due to remote custom icon clash not fully handled)
    // assign the default alternative to P2. This is a basic conflict resolution.
    if (state.gameP1Icon === state.gameP2Icon && state.gameP1Icon !== null) {
        console.warn("Player icon conflict resolved: P1 and P2 had same icon. Assigning alternative to P2.");
        state.setGameP2Icon(state.gameP1Icon === currentDefaultP1 ? currentDefaultP2 : currentDefaultP1);
    }
}