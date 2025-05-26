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
    let fromIndexForSlide = null;

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
            fromIndexForSlide = state.selectedPieceIndex;
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
        // Ensure we capture the current phase after the move
        const currentPhaseAfterMove = state.gamePhase;
        
        // Add a small delay to ensure all state updates are complete before sending
        setTimeout(() => {
            const fullStateData = {
                type: 'full_state_update',
                board: [...state.board],
                currentPlayer: state.currentPlayer,
                gamePhase: currentPhaseAfterMove, // Use the captured phase
                gameActive: state.gameActive,
                winner: state.gameActive ? null : state.lastWinner,
                draw: state.gameActive ? false : (!state.lastWinner && !state.gameActive && state.board.every(c=>c!==null)),
                selectedPieceIndex: state.selectedPieceIndex
            };
            
            console.log('Sending full_state_update:', fullStateData);
            peerConnection.sendPeerData(fullStateData);
        }, 50); // Slightly increased delay for better state consistency

        if (state.gameActive) {
            state.setIsMyTurnInRemote(false);
            ui.updateStatus(`Esperando a ${player.getPlayerName(state.currentPlayer)}...`);
            ui.setBoardClickable(false);
        }
    }
}

// ... rest of the file remains the same ...
function changeSymbolsBtnHandler() {
    const newIndex = (state.currentSymbolIndex + 1) % state.symbolSet.length;
    state.setCurrentSymbolIndex(newIndex);
    localStorage.setItem('currentSymbolIndex', state.currentSymbolIndex.toString());
    player.determineEffectiveIcons();
    sound.playSound('move');
    if (!state.gameActive && !state.pvpRemoteActive) { 
        gameLogic.init();