// eventListeners.js - Sync gameVariant and conditional broadcast
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

    // isThreePieceMoving will be determined by the gameLogic functions now,
    // handleCellClick will primarily decide which logic path to attempt.
    // The actual phase is king.

    if (state.pvpRemoteActive && !state.isMyTurnInRemote && state.gameActive) {
        console.log(`handleCellClick: Ignoring click, not my turn in remote game.`);
        return;
    }
    if (!state.gameActive) {
        // Allow deselection in 3-piece moving even if game overlay says "game over" but board is technically still interactive for this.
        if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && state.gamePhase === state.GAME_PHASES.MOVING && state.selectedPieceIndex === cellIndex) {
            // Fall through to deselection logic
        } else {
            console.log(`handleCellClick: Ignoring click, game not active.`);
            return;
        }
    }

    let actionWasSuccessful = false; // Renamed from localMoveProcessed for clarity
    let playerMakingTheMove = null;

    // Determine playerMakingTheMove based on context
    if (state.pvpRemoteActive) {
        playerMakingTheMove = state.myEffectiveIcon;
    } else if (state.vsCPU) {
        if (state.currentPlayer !== state.myEffectiveIcon) {
            console.log(`handleCellClick: vs CPU, not my (human) turn.`);
            return; // Not human's turn vs CPU
        }
        playerMakingTheMove = state.myEffectiveIcon;
    } else { // Local PvP
        playerMakingTheMove = state.currentPlayer;
    }

    if (!playerMakingTheMove) {
        console.error(`handleCellClick: Could not determine playerMakingTheMove. This is unexpected.`);
        return;
    }

    // Decide whether to attempt a "place" or "select/move" based on current knowledge
    // gameLogic.makeMove and gameLogic.movePiece will internally validate phase more strictly.
    
    // Prefer movePiece logic if a piece is already selected in 3-piece mode
    if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && state.selectedPieceIndex !== null) {
        console.log(`handleCellClick: Attempting movePiece logic (piece already selected). Player: ${playerMakingTheMove}, From: ${state.selectedPieceIndex}, To: ${cellIndex}, Phase: ${state.gamePhase}`);
        const fromIndex = state.selectedPieceIndex; // Store before it's potentially cleared
        
        if (cellIndex === fromIndex) { // Clicked selected piece again to deselect
            state.setSelectedPieceIndex(null);
            ui.clearSelectedPieceHighlight();
            ui.updateStatus(`${player.getPlayerName(playerMakingTheMove)}: Selecciona una pieza para mover.`);
            gameLogic.showEasyModeHint();
            actionWasSuccessful = false; // Deselection is a UI change, not a game state progression for broadcast typically
                                         // Or, consider if deselection should send an update if selectedPieceIndex is synced
        } else if (state.board[cellIndex] === playerMakingTheMove && state.gamePhase === state.GAME_PHASES.MOVING) { // Clicked another of their own pieces to switch selection
            state.setSelectedPieceIndex(cellIndex);
            ui.clearSelectedPieceHighlight();
            ui.highlightSelectedPiece(cellIndex);
            ui.updateStatus(`${player.getPlayerName(playerMakingTheMove)}: Mueve la pieza seleccionada.`);
            gameLogic.showEasyModeHint();
            actionWasSuccessful = false; // Selection change is UI, not a turn progression for broadcast
        } else { // Attempt to move to a new cell
             if (gameLogic.movePiece(fromIndex, cellIndex, playerMakingTheMove)) {
                actionWasSuccessful = true;
            } else {
                // movePiece returned false, likely an invalid move (e.g., not adjacent, cell occupied)
                // gameLogic.movePiece would have logged details. We might want to keep the piece selected.
                ui.updateStatus(`${player.getPlayerName(playerMakingTheMove)}: Movimiento inválido.`);
                if (state.board[fromIndex] === playerMakingTheMove) { // Check if original piece is still there
                   ui.highlightSelectedPiece(fromIndex); // Re-highlight if still valid to be selected
                } else { // Piece moved or scenario changed, clear selection
                   state.setSelectedPieceIndex(null);
                   ui.clearSelectedPieceHighlight();
                }
            }
        }
    } else if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && state.gamePhase === state.GAME_PHASES.MOVING) {
        // In MOVING phase, but no piece is selected: this click is an attempt to SELECT a piece
        console.log(`handleCellClick: Attempting piece SELECTION logic. Player: ${playerMakingTheMove}, Cell: ${cellIndex}, Phase: ${state.gamePhase}`);
        if (state.board[cellIndex] === playerMakingTheMove) {
            state.setSelectedPieceIndex(cellIndex);
            ui.clearSuggestedMoveHighlight(); // Clear hints when a piece is selected
            ui.highlightSelectedPiece(cellIndex);
            ui.updateStatus(`${player.getPlayerName(playerMakingTheMove)}: Mueve tu pieza a un espacio adyacente vacío.`);
            gameLogic.showEasyModeHint(); // Show hint for where to move
            actionWasSuccessful = false; // Selecting a piece is a UI change, not a completed game turn to broadcast
        } else {
            console.log(`handleCellClick: MOVING phase, no piece selected, clicked on empty or opponent piece. Cell content: ${state.board[cellIndex]}`);
            // ui.updateStatus(`${player.getPlayerName(playerMakingTheMove)}: Selecciona una de TUS piezas para mover.`);
             actionWasSuccessful = false;
        }
    } else {
        // Attempting to PLACE a piece (Classic mode, or 3-Piece in PLACING phase)
        console.log(`handleCellClick: Attempting makeMove (placement) logic. Player: ${playerMakingTheMove}, Cell: ${cellIndex}, Phase: ${state.gamePhase}`);
        if (gameLogic.makeMove(cellIndex, playerMakingTheMove)) {
            actionWasSuccessful = true;
        }
        // If makeMove returns false, it means the placement was invalid (e.g., cell occupied, or piece limit reached in 3-piece placing).
        // gameLogic.makeMove should have logged the reason.
    }


    // ** MODIFIED: Conditional broadcast based on actionWasSuccessful **
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
                    gameVariant: state.gameVariant, // <-- NEW: Sync gameVariant
                    winner: state.gameActive ? null : state.lastWinner,
                    draw: state.gameActive ? false : (!state.lastWinner && !state.gameActive && state.board.every(c=>c!==null)),
                    selectedPieceIndex: state.selectedPieceIndex // Sync selected piece for UI consistency on remote
                };
                console.log('Sending full_state_update:', JSON.stringify(fullStateData));
                peerConnection.sendPeerData(fullStateData);
            }, 50);
        }

        // This UI update for the sender should also only happen if an action was successful
        if (state.gameActive && state.pvpRemoteActive) { // For P2P, after my successful move, it's other's turn
            console.log(`eventListeners.js: Updating local UI (sender) after successful move. state.gamePhase: ${state.gamePhase}. TC: ${state.turnCounter}. Timestamp: ${new Date().toISOString()}`);
            state.setIsMyTurnInRemote(false);
            ui.updateStatus(`Esperando a ${player.getPlayerName(state.currentPlayer)}...`);
            ui.setBoardClickable(false);
        } else if (state.gameActive && !state.pvpRemoteActive && state.vsCPU && state.currentPlayer === state.opponentEffectiveIcon) {
            // If playing vs CPU and it's now CPU's turn after my successful move
             console.log(`eventListeners.js: Updating local UI (sender) after successful move vs CPU. CPU's turn.`);
            // CPU move is triggered from gameLogic, no need to setIsMyTurnInRemote here
        }
    } else {
        console.log(`handleCellClick: Action was not successful (makeMove or movePiece returned false, or was a selection). No broadcast. Current phase: ${state.gamePhase}`);
        // If action wasn't successful, but it was a piece selection, the UI status should reflect that.
        // ui.updateStatus messages within the selection logic already handle this.
    }
}

// ... (rest of the file: changeSymbolsBtnHandler, setupEventListeners remains the same as your latest version) ...

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