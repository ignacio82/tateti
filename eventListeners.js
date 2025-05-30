// eventListeners.js - Fixed version with proper playRandomBtn handling
import * as ui from './ui.js';
import * as state from './state.js';
import * as player from './player.js';
import * as sound from './sound.js';
import * as gameLogic from './gameLogic.js';
import * as peerConnection from './peerConnection.js';
import * as theme from './theme.js';

let mainStopAnyGameInProgressAndResetUICallback;

function handleCellClick(e) {
    console.log(`handleCellClick: ENTRY. Player making click: ${state.myEffectiveIcon}. Current state.currentPlayer: ${state.currentPlayer}. Current state.gamePhase: ${state.gamePhase}. Current state.gameVariant: ${state.gameVariant}. state.isMyTurnInRemote: ${state.isMyTurnInRemote}. TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`);

    const clickedCell = e.target.closest('.cell');
    if (!clickedCell) return;
    const cellIndex = parseInt(clickedCell.dataset.index, 10);

    if (state.pvpRemoteActive && !state.isMyTurnInRemote && state.gameActive) {
        console.log(`handleCellClick: Ignoring click, not my turn in remote game.`);
        return;
    }
    if (!state.gameActive) {
        if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && state.gamePhase === state.GAME_PHASES.MOVING && state.selectedPieceIndex === cellIndex) {
            // Fall through to deselection logic
        } else {
            console.log(`handleCellClick: Ignoring click, game not active.`);
            return;
        }
    }

    let actionWasSuccessful = false;
    let playerMakingTheMove = null;

    if (state.pvpRemoteActive) {
        playerMakingTheMove = state.myEffectiveIcon;
    } else if (state.vsCPU) {
        if (state.currentPlayer !== state.myEffectiveIcon) {
            console.log(`handleCellClick: vs CPU, not my (human) turn.`);
            return;
        }
        playerMakingTheMove = state.myEffectiveIcon;
    } else { // Local PvP
        playerMakingTheMove = state.currentPlayer;
    }

    if (!playerMakingTheMove) {
        console.error(`handleCellClick: Could not determine playerMakingTheMove. This is unexpected.`);
        return;
    }

    if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && state.selectedPieceIndex !== null) {
        console.log(`handleCellClick: Attempting movePiece logic (piece already selected). Player: ${playerMakingTheMove}, From: ${state.selectedPieceIndex}, To: ${cellIndex}, Phase: ${state.gamePhase}`);
        const fromIndex = state.selectedPieceIndex;

        if (cellIndex === fromIndex) {
            state.setSelectedPieceIndex(null);
            ui.clearSelectedPieceHighlight();
            ui.updateStatus(`${player.getPlayerName(playerMakingTheMove)}: Selecciona una pieza para mover.`);
            gameLogic.showEasyModeHint();
            actionWasSuccessful = false;
        } else if (state.board[cellIndex] === playerMakingTheMove && state.gamePhase === state.GAME_PHASES.MOVING) {
            state.setSelectedPieceIndex(cellIndex);
            ui.clearSelectedPieceHighlight();
            ui.highlightSelectedPiece(cellIndex);
            ui.updateStatus(`${player.getPlayerName(playerMakingTheMove)}: Mueve la pieza seleccionada.`);
            gameLogic.showEasyModeHint();
            actionWasSuccessful = false;
        } else {
             if (gameLogic.movePiece(fromIndex, cellIndex, playerMakingTheMove)) {
                actionWasSuccessful = true;
            } else {
                ui.updateStatus(`${player.getPlayerName(playerMakingTheMove)}: Movimiento inválido.`);
                if (state.board[fromIndex] === playerMakingTheMove) {
                   ui.highlightSelectedPiece(fromIndex);
                } else {
                   state.setSelectedPieceIndex(null);
                   ui.clearSelectedPieceHighlight();
                }
            }
        }
    } else if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && state.gamePhase === state.GAME_PHASES.MOVING) {
        console.log(`handleCellClick: Attempting piece SELECTION logic. Player: ${playerMakingTheMove}, Cell: ${cellIndex}, Phase: ${state.gamePhase}`);
        if (state.board[cellIndex] === playerMakingTheMove) {
            state.setSelectedPieceIndex(cellIndex);
            ui.clearSuggestedMoveHighlight();
            ui.highlightSelectedPiece(cellIndex);
            ui.updateStatus(`${player.getPlayerName(playerMakingTheMove)}: Mueve tu pieza a un espacio adyacente vacío.`);
            gameLogic.showEasyModeHint();
            actionWasSuccessful = false;
        } else {
            console.log(`handleCellClick: MOVING phase, no piece selected, clicked on empty or opponent piece. Cell content: ${state.board[cellIndex]}`);
             actionWasSuccessful = false;
        }
    } else {
        console.log(`handleCellClick: Attempting makeMove (placement) logic. Player: ${playerMakingTheMove}, Cell: ${cellIndex}, Phase: ${state.gamePhase}`);
        if (gameLogic.makeMove(cellIndex, playerMakingTheMove)) {
            actionWasSuccessful = true;
        }
    }

    if (actionWasSuccessful) {
        if (state.pvpRemoteActive && state.gamePaired) {
            console.log(`eventListeners.js: Action successful. RIGHT BEFORE setTimeout schedule. state.gamePhase: ${state.gamePhase}, state.gameVariant: ${state.gameVariant}, TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`);
            setTimeout(() => {
                console.log(`eventListeners.js: INSIDE setTimeout. Current state.gamePhase: ${state.gamePhase}, gameVariant: ${state.gameVariant}, TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`);
                const fullStateData = {
                    type: 'full_state_update',
                    board: [...state.board],
                    currentPlayer: state.currentPlayer,
                    gamePhase: state.gamePhase,
                    gameActive: state.gameActive,
                    turnCounter: state.turnCounter,
                    gameVariant: state.gameVariant,
                    winner: state.gameActive ? null : state.lastWinner,
                    draw: state.gameActive ? false : (!state.lastWinner && !state.gameActive && state.board.every(c=>c!==null)),
                    selectedPieceIndex: state.selectedPieceIndex
                };
                console.log('Sending full_state_update:', JSON.stringify(fullStateData));
                peerConnection.sendPeerData(fullStateData);
            }, 50);
        }

        if (state.gameActive && state.pvpRemoteActive) {
            console.log(`eventListeners.js: Updating local UI (sender) after successful move. state.gamePhase: ${state.gamePhase}. TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`);
            state.setIsMyTurnInRemote(false);
            ui.updateStatus(`Esperando a ${player.getPlayerName(state.currentPlayer)}...`);
            ui.setBoardClickable(false);
        } else if (state.gameActive && !state.pvpRemoteActive && state.vsCPU && state.currentPlayer === state.opponentEffectiveIcon) {
             console.log(`eventListeners.js: Updating local UI (sender) after successful move vs CPU. CPU's turn.`);
        }
    } else {
        console.log(`handleCellClick: Action was not successful (makeMove or movePiece returned false, or was a selection). No broadcast. Current phase: ${state.gamePhase}`);
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

// Modified to accept an options object for additional handlers like onPlayRandom
export function setupEventListeners(stopCb, options = {}) {
    mainStopAnyGameInProgressAndResetUICallback = stopCb;
    
    ui.menuToggle?.addEventListener('click', ui.toggleMenu);
    document.addEventListener('click', e => ui.closeMenuIfNeeded(e.target));
    
    ui.cells.forEach(cell => {
        cell.addEventListener('click', handleCellClick);
        cell.setAttribute('tabindex', '0');
        cell.addEventListener('keydown', e => {
            if (['Enter', ' '].includes(e.key)) { e.preventDefault(); cell.click(); }
        });
    });
    
    ui.restartIcon?.addEventListener('click', () => {
        if (state.pvpRemoteActive && state.gamePaired) {
            peerConnection.sendPeerData({ type: 'restart_request' });
            ui.showOverlay(state.gameActive ? 'Solicitud de reinicio enviada...' : 'Proponiendo nueva partida...');
        } else {
            mainStopAnyGameInProgressAndResetUICallback?.(true); // Pass true to preserve menu
            gameLogic.init();
        }
        if (!mainStopAnyGameInProgressAndResetUICallback) gameLogic.init(); // Fallback if stopCb is not main one
        ui.sideMenu?.classList.remove('open');
    });
    
    ui.pvpLocalBtn?.addEventListener('click', () => {
        mainStopAnyGameInProgressAndResetUICallback?.(true);
        state.setVsCPU(false); 
        state.setPvpRemoteActive(false);
        state.setGamePaired(false); 
        gameLogic.init();
    });
    
    ui.threePieceToggle?.addEventListener('change', e => {
        const useThreePiece = e.target.checked;
        mainStopAnyGameInProgressAndResetUICallback?.(true);
        state.setGameVariant(useThreePiece ? state.GAME_VARIANTS.THREE_PIECE : state.GAME_VARIANTS.CLASSIC);
        localStorage.setItem('tatetiGameVariant', state.gameVariant); 
        gameLogic.init();
    });
    
    ui.hostGameBtn?.addEventListener('click', () => {
        // stopAnyGameInProgressAndResetUICallback is called within initializePeerAsHost
        peerConnection.initializePeerAsHost(mainStopAnyGameInProgressAndResetUICallback);
    });

    // FIXED: Add listener for the "Play Random" button using the export from ui.js
    ui.playRandomBtn?.addEventListener('click', () => {
        if (options.onPlayRandom && typeof options.onPlayRandom === 'function') {
            options.onPlayRandom();
        } else {
            console.warn('Play Random button clicked but no onPlayRandom handler provided');
        }
    });

    ui.cpuBtn?.addEventListener('click', () => {
        mainStopAnyGameInProgressAndResetUICallback?.(true);
        state.setVsCPU(true); 
        state.setPvpRemoteActive(false);
        state.setGamePaired(false); 
        gameLogic.init();
    });
    
    [ui.easyBtn, ui.mediumBtn, ui.hardBtn].forEach(btn => {
        btn?.addEventListener('click', e => {
            state.setDifficulty(e.target.id.replace('Btn', '')); 
            sound.playSound('move');
            if (state.vsCPU && (!state.gameActive || state.board.every(c => c === null))) gameLogic.init();
            else if (state.vsCPU) ui.updateAllUIToggleButtons();
        });
    });
    
    [ui.player1StartsBtn, ui.randomStartsBtn, ui.loserStartsBtn].forEach(btn => {
        btn?.addEventListener('click', e => {
            state.setWhoGoesFirstSetting(e.target.id.replace('StartsBtn', ''));
            localStorage.setItem('whoGoesFirstSetting', state.whoGoesFirstSetting); 
            sound.playSound('move');
            if ((!state.gameActive || state.board.every(c => c === null)) && !(state.pvpRemoteActive && state.gamePaired)) gameLogic.init();
            else ui.updateAllUIToggleButtons();
        });
    });
    
    ui.themeToggle?.addEventListener('click', theme.toggleTheme);
    ui.soundToggle?.addEventListener('click', sound.toggleSound); // Corrected: ui.soundToggle instead of document.getElementById
    ui.hapticsToggle?.addEventListener('click', sound.toggleHaptics); // ADDED: Event listener for haptics toggle
    ui.changeSymbolsBtn?.addEventListener('click', changeSymbolsBtnHandler);
    document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
}