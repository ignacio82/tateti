// eventListeners.js - Debugging P2's phase at click time
import * as ui from './ui.js';
import * as state from './state.js';
import * as player from './player.js';
import * as sound from './sound.js';
import * as gameLogic from './gameLogic.js';
import * as peerConnection from './peerConnection.js';
import * as theme from './theme.js';

let mainStopAnyGameInProgressAndResetUICallback;

function handleCellClick(e) {
    // **** NEW CRITICAL LOG ****
    console.log(`handleCellClick: ENTRY. Player making click: ${state.myEffectiveIcon}. Current state.currentPlayer: ${state.currentPlayer}. Current state.gamePhase: ${state.gamePhase}. state.isMyTurnInRemote: ${state.isMyTurnInRemote}. TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`);

    const clickedCell = e.target.closest('.cell');
    if (!clickedCell) return;
    const cellIndex = parseInt(clickedCell.dataset.index, 10);

    const isThreePieceMoving = state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && state.gamePhase === state.GAME_PHASES.MOVING;
    // Log what isThreePieceMoving evaluates to
    console.log(`handleCellClick: Calculated isThreePieceMoving = ${isThreePieceMoving} (variant: ${state.gameVariant}, phase: ${state.gamePhase})`);

    if (state.pvpRemoteActive && !state.isMyTurnInRemote && state.gameActive) {
        console.log(`handleCellClick: Ignoring click, not my turn in remote game.`);
        return;
    }
    if (!state.gameActive) {
        if (isThreePieceMoving && state.selectedPieceIndex === cellIndex) {
            // Allow deselection even if game not "active" (e.g. end game overlay shown)
        } else {
            console.log(`handleCellClick: Ignoring click, game not active.`);
            return;
        }
    }

    let localMoveProcessed = false;
    let playerMakingTheMove = null;

    if (isThreePieceMoving) { // Logic for MOVING phase
        console.log(`handleCellClick: Entering MOVING phase logic branch.`);
        if (state.pvpRemoteActive) {
            playerMakingTheMove = state.myEffectiveIcon;
        } else if (state.vsCPU) {
            if (state.currentPlayer !== state.myEffectiveIcon) { // Corrected to myEffectiveIcon for CPU game player
                console.log(`handleCellClick: MOVING branch, vs CPU, not my turn.`);
                return;
            }
            playerMakingTheMove = state.myEffectiveIcon;
        } else { // Local PvP
            playerMakingTheMove = state.currentPlayer;
        }

        if (!playerMakingTheMove) {
            console.error(`handleCellClick: MOVING branch, playerMakingTheMove is null/undefined. This shouldn't happen.`);
            return;
        }
        console.log(`handleCellClick: MOVING branch, playerMakingTheMove: ${playerMakingTheMove}, selectedPieceIndex: ${state.selectedPieceIndex}`);

        if (state.selectedPieceIndex === null) { // Try to select a piece
            if (state.board[cellIndex] === playerMakingTheMove) {
                state.setSelectedPieceIndex(cellIndex);
                ui.clearSuggestedMoveHighlight();
                ui.highlightSelectedPiece(cellIndex);
                ui.updateStatus(`${player.getPlayerName(playerMakingTheMove)}: Mueve tu pieza a un espacio adyacente vacío.`);
                gameLogic.showEasyModeHint();
            } else {
                console.log(`handleCellClick: MOVING branch, tried to select empty or opponent piece. Cell content: ${state.board[cellIndex]}`);
            }
        } else { // A piece is already selected, try to move it
            const fromIndexForSlide = state.selectedPieceIndex;
            const toIndexForSlideLocal = cellIndex;

            if (toIndexForSlideLocal === fromIndexForSlide) { // Clicked selected piece again
                state.setSelectedPieceIndex(null);
                ui.clearSelectedPieceHighlight();
                ui.updateStatus(`${player.getPlayerName(playerMakingTheMove)}: Selecciona una pieza para mover.`);
                gameLogic.showEasyModeHint();
            } else if (state.board[toIndexForSlideLocal] === null) { // Clicked an empty cell
                ui.clearSelectedPieceHighlight();
                if (gameLogic.movePiece(fromIndexForSlide, toIndexForSlideLocal, playerMakingTheMove)) {
                    localMoveProcessed = true;
                } else { // movePiece returned false (e.g. not adjacent)
                    ui.updateStatus(`${player.getPlayerName(playerMakingTheMove)}: Movimiento inválido.`);
                    ui.highlightSelectedPiece(fromIndexForSlide); // Re-highlight
                }
            } else if (state.board[toIndexForSlideLocal] === playerMakingTheMove) { // Clicked another of their own pieces
                state.setSelectedPieceIndex(toIndexForSlideLocal);
                ui.clearSelectedPieceHighlight();
                ui.highlightSelectedPiece(toIndexForSlideLocal);
                ui.updateStatus(`${player.getPlayerName(playerMakingTheMove)}: Mueve la pieza seleccionada.`);
                gameLogic.showEasyModeHint();
            } else { // Clicked opponent's piece or invalid cell
                ui.updateStatus(`${player.getPlayerName(playerMakingTheMove)}: No puedes mover ahí.`);
                ui.highlightSelectedPiece(fromIndexForSlide);
            }
        }
    } else { // Logic for PLACING phase (Classic or 3-Piece Placement)
        console.log(`handleCellClick: Entering PLACING phase logic branch. Current player: ${state.currentPlayer}, gamePhase: ${state.gamePhase}`);
        
        if (clickedCell.querySelector('span')?.textContent !== '') {
            console.log(`handleCellClick: PLACING branch, cell not empty.`);
            return;
        }

        if (state.pvpRemoteActive) {
            playerMakingTheMove = state.myEffectiveIcon;
        } else if (state.vsCPU) {
            if (state.currentPlayer !== state.myEffectiveIcon) { // Corrected
                 console.log(`handleCellClick: PLACING branch, vs CPU, not my turn.`);
                return;
            }
            playerMakingTheMove = state.myEffectiveIcon;
        } else { // Local PvP
            playerMakingTheMove = state.currentPlayer;
        }

        if (!playerMakingTheMove) {
            console.error(`handleCellClick: PLACING branch, playerMakingTheMove is null/undefined.`);
            return;
        }
        console.log(`handleCellClick: PLACING branch, playerMakingTheMove: ${playerMakingTheMove}`);

        if (gameLogic.makeMove(cellIndex, playerMakingTheMove)) {
            localMoveProcessed = true;
        }
    }

    if (localMoveProcessed && state.pvpRemoteActive && state.gamePaired) {
        console.log(`eventListeners.js: RIGHT BEFORE setTimeout schedule. state.gamePhase: ${state.gamePhase}. TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`);
        setTimeout(() => {
            console.log(`eventListeners.js: INSIDE setTimeout. Current state.gamePhase before packaging: ${state.gamePhase}. TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`);
            const fullStateData = {
                type: 'full_state_update',
                board: [...state.board], currentPlayer: state.currentPlayer, gamePhase: state.gamePhase,
                gameActive: state.gameActive, turnCounter: state.turnCounter,
                winner: state.gameActive ? null : state.lastWinner,
                draw: state.gameActive ? false : (!state.lastWinner && !state.gameActive && state.board.every(c=>c!==null)),
                selectedPieceIndex: state.selectedPieceIndex
            };
            console.log('Sending full_state_update:', JSON.stringify(fullStateData));
            peerConnection.sendPeerData(fullStateData);
        }, 50);

        if (state.gameActive) {
            console.log(`eventListeners.js: Updating local UI (sender) after move. state.gamePhase: ${state.gamePhase}. TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`);
            state.setIsMyTurnInRemote(false);
            ui.updateStatus(`Esperando a ${player.getPlayerName(state.currentPlayer)}...`);
            ui.setBoardClickable(false);
        }
    }
}

// ... (rest of the file: changeSymbolsBtnHandler, setupEventListeners, etc. remains the same) ...

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
            mainStopAnyGameInProgressAndResetUICallback?.(); gameLogic.init();
        }
        ui.sideMenu?.classList.remove('open');
    });
    ui.pvpLocalBtn?.addEventListener('click', () => {
        mainStopAnyGameInProgressAndResetUICallback?.(); state.setVsCPU(false); state.setPvpRemoteActive(false);
        state.setGamePaired(false); gameLogic.init();
    });
    ui.threePieceToggle?.addEventListener('change', e => {
        const useThreePiece = e.target.checked;
        mainStopAnyGameInProgressAndResetUICallback?.();
        state.setGameVariant(useThreePiece ? state.GAME_VARIANTS.THREE_PIECE : state.GAME_VARIANTS.CLASSIC);
        localStorage.setItem('tatetiGameVariant', state.gameVariant); gameLogic.init();
    });
    ui.hostGameBtn?.addEventListener('click', () => {
        peerConnection.initializePeerAsHost(mainStopAnyGameInProgressAndResetUICallback);
    });
    ui.cpuBtn?.addEventListener('click', () => {
        mainStopAnyGameInProgressAndResetUICallback?.(); state.setVsCPU(true); state.setPvpRemoteActive(false);
        state.setGamePaired(false); gameLogic.init();
    });
    [ui.easyBtn, ui.mediumBtn, ui.hardBtn].forEach(btn => {
        btn?.addEventListener('click', e => {
            state.setDifficulty(e.target.id.replace('Btn', '')); sound.playSound('move');
            if (state.vsCPU && (!state.gameActive || state.board.every(c => c === null))) gameLogic.init();
            else if (state.vsCPU) ui.updateAllUIToggleButtons();
        });
    });
    [ui.player1StartsBtn, ui.randomStartsBtn, ui.loserStartsBtn].forEach(btn => {
        btn?.addEventListener('click', e => {
            state.setWhoGoesFirstSetting(e.target.id.replace('StartsBtn', ''));
            localStorage.setItem('whoGoesFirstSetting', state.whoGoesFirstSetting); sound.playSound('move');
            if ((!state.gameActive || state.board.every(c => c === null)) && !(state.pvpRemoteActive && state.gamePaired)) gameLogic.init();
            else ui.updateAllUIToggleButtons();
        });
    });
    ui.themeToggle?.addEventListener('click', theme.toggleTheme);
    document.getElementById('soundToggle')?.addEventListener('click', sound.toggleSound);
    ui.changeSymbolsBtn?.addEventListener('click', changeSymbolsBtnHandler);
    document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
}