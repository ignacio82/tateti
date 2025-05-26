// peerConnection.js
import * as state from './state.js';
import * as ui from './ui.js';
import * as player from './player.js';
import * as gameLogic from './gameLogic.js';
import * as sound from './sound.js';

const peerJsCallbacks = {
    onPeerOpen: (id) => {
        if (state.pvpRemoteActive && state.iAmPlayer1InRemote) {
            state.setCurrentHostPeerId(id);
            const desiredBaseUrl = 'https://tateti.martinez.fyi';
            const gameLink = `${desiredBaseUrl}/?room=${id}`;
            ui.updateStatus(`Comparte el enlace o ID: ${id}`);
            ui.displayQRCode(gameLink);
        } else if (state.pvpRemoteActive && !state.iAmPlayer1InRemote) {
            if (state.currentHostPeerId && window.peerJsMultiplayer?.connect) {
                console.log(`PeerJS: Joiner's peer ID is ${id}. Attempting to connect to host: ${state.currentHostPeerId}`);
                window.peerJsMultiplayer.connect(state.currentHostPeerId);
            } else {
                console.error("PeerConnection: Host ID not set for joiner, or peerJsMultiplayer.connect not available.");
                ui.showOverlay("Error: No se pudo conectar al host.");
                state.resetRemoteState();
                gameLogic.updateAllUITogglesHandler();
            }
        }
    },
    onNewConnection: (conn) => {
        console.log('PeerConnection: Incoming connection from', conn.peer);
        ui.hideQRCode();
        ui.showOverlay("Jugador 2 conectándose...");
        ui.updateStatus("Jugador 2 está conectándose...");
    },
    onConnectionOpen: () => {
        console.log("PeerConnection: Data connection opened with peer.");
        state.setGamePaired(true);
        ui.hideOverlay();
        ui.hideQRCode();
        player.determineEffectiveIcons();
        if (window.peerJsMultiplayer?.send) {
            window.peerJsMultiplayer.send({
                type: 'player_info',
                name: state.myPlayerName,
                icon: state.myEffectiveIcon
            });
        }
        ui.updateStatus("¡Conectado! Iniciando partida...");
        sound.playSound('win');
        gameLogic.init(); // Initialize game for both players on connection
    },
    onDataReceived: (data) => {
        console.log(`PeerConnection: RX @ ${new Date().toLocaleTimeString()}:`, JSON.parse(JSON.stringify(data)));

        if (data.type === 'player_info') {
            state.setOpponentPlayerName(data.name || 'Oponente Remoto');
            state.setOpponentPlayerIcon(data.icon);
            player.determineEffectiveIcons();
            ui.updateScoreboard();
            if (state.gameActive) {
                ui.updateStatus(state.isMyTurnInRemote ?
                    `Tu Turno ${player.getPlayerName(state.currentPlayer)}` :
                    `Esperando a ${player.getPlayerName(state.currentPlayer)}...`);
            }
            return;
        }

        // MODIFICATION FOR BUG 2: Handle 'move_piece' packet
        if (data.type === 'move_piece') {
            if (!state.gameActive || state.isMyTurnInRemote) { // Should only process if expecting opponent's move
                console.warn("PeerConnection: Received 'move_piece' but not expecting it or it's my turn.", data);
                return;
            }
            console.log("[P2P] Processing move_piece received:", data);
            const ok = gameLogic.movePiece(
                data.from,
                data.to,
                state.opponentEffectiveIcon // The player who sent the slide (the opponent)
            );
            if (!ok) {
                console.warn('[P2P] Desync: Illegal slide received via move_piece', data);
                // Potentially request a full state sync here if desync is detected
            }
            // After gameLogic.movePiece, state.currentPlayer is now the local player (receiver)
            // The UI update status and board clickability is handled by gameLogic.movePiece's call to switchPlayer -> showEasyModeHint
            // and the subsequent CPU move logic if applicable, or enabling board for human.
            // Explicitly ensure local player knows it's their turn.
            if(state.currentPlayer === state.myEffectiveIcon && state.gameActive) {
                state.setIsMyTurnInRemote(true);
                ui.setBoardClickable(true);
                // Status update is handled by movePiece -> switchPlayer
                 if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE && state.gamePhase === state.GAME_PHASES.MOVING) {
                    ui.updateStatus(`${player.getPlayerName(state.currentPlayer)}: Selecciona tu pieza para mover.`);
                } else {
                    ui.updateStatus(`Turno del ${player.getPlayerName(state.currentPlayer)}`);
                }
                gameLogic.showEasyModeHint?.();
            }
            return;
        }


        if (data.type === 'full_state_update') {
            console.log('[P2P] Processing full_state_update received:', data);

            if (!data.board || !Array.isArray(data.board) || data.board.length !== 9 ||
                !data.currentPlayer || !data.gamePhase || typeof data.gameActive !== 'boolean') {
                console.error("[P2P] Received invalid full_state_update. Ignoring.", data);
                return;
            }
             // If it's my turn according to the incoming state, but I thought it wasn't, log for debugging.
            if (data.currentPlayer === state.myEffectiveIcon && !state.isMyTurnInRemote && state.gameActive) {
                console.log("[P2P] Full state update indicates it's now my turn.");
            }


            state.setBoard([...data.board]);
            state.setCurrentPlayer(data.currentPlayer);
            state.setGamePhase(data.gamePhase);
            state.setGameActive(data.gameActive);

            ui.clearBoardUI();
            state.board.forEach((symbol, index) => {
                ui.updateCellUI(index, symbol || null);
            });
            ui.updateScoreboard?.();

            if (!state.gameActive) {
                ui.setBoardClickable(false); // Ensure board is not clickable
                if (data.winner) {
                    console.log("[P2P] Game ended per received state. Winner:", data.winner);
                    state.setLastWinner(data.winner); // Make sure local state reflects winner
                    ui.updateStatus(`${player.getPlayerName(data.winner)} GANA!`);
                    const winningCells = gameLogic.checkWin(data.winner, state.board);
                    if(winningCells) ui.highlightWinner(winningCells);
                    ui.launchConfetti?.();
                     // Score update should happen here based on received winner
                    if (data.winner === state.myEffectiveIcon) state.setMyWins(state.myWins + 1); // Assuming state.myWins was current
                    else state.setOpponentWins(state.opponentWins + 1);
                    localStorage.setItem('myWinsTateti', state.myWins.toString());
                    localStorage.setItem('opponentWinsTateti', state.opponentWins.toString());
                    updateScoreboardHandler();

                } else if (data.draw) {
                    console.log("[P2P] Game ended in a draw per received state.");
                    state.setLastWinner(null);
                    ui.updateStatus('¡EMPATE!');
                    ui.playDrawAnimation?.();
                    state.setDraws(state.draws + 1); // Assuming state.draws was current
                    localStorage.setItem('drawsTateti', state.draws.toString());
                    updateScoreboardHandler();
                } else {
                     console.log("[P2P] Received inactive game state without winner/draw.");
                     ui.updateStatus("Juego terminado.");
                }
                 // Game restart is now handled by restart_request/ack flow initiated from gameLogic.js
                return;
            }

            const myTurnNow = (state.currentPlayer === state.myEffectiveIcon);
            state.setIsMyTurnInRemote(myTurnNow);

            console.log(`[P2P] State applied. My turn: ${myTurnNow}. Current player: ${state.currentPlayer}. Phase: ${state.gamePhase}`);

            if (myTurnNow) {
                let statusMsg = `Tu Turno ${player.getPlayerName(state.currentPlayer)}`;
                if(state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
                    if (state.gamePhase === state.GAME_PHASES.MOVING) {
                        statusMsg = `${player.getPlayerName(state.currentPlayer)}: Selecciona tu pieza para mover.`;
                    } else if (state.gamePhase === state.GAME_PHASES.PLACING) {
                        const placed = state.board.filter(s => s === state.currentPlayer).length;
                        const displayCount = Math.min(placed + 1, state.MAX_PIECES_PER_PLAYER);
                        statusMsg = `${player.getPlayerName(state.currentPlayer)}: Coloca tu pieza (${displayCount}/3).`;
                    }
                }
                ui.updateStatus(statusMsg);
                ui.setBoardClickable(true);
                gameLogic.showEasyModeHint?.();
            } else {
                ui.updateStatus(`Esperando a ${player.getPlayerName(state.currentPlayer)}…`);
                ui.setBoardClickable(false);
            }
            return;
        }

        // MODIFICATION FOR BUG 1: Synchronised restarts
        if (data.type === 'restart_request') {
            const requesterName = state.opponentPlayerName || "El oponente";
            ui.showOverlay(`${requesterName} quiere reiniciar. Aceptando...`);
            if (window.peerJsMultiplayer?.send) {
                window.peerJsMultiplayer.send({ type: 'restart_ack' });
            }
            // Receiver of request also inits
            setTimeout(() => {
                ui.hideOverlay();
                gameLogic.init();
            }, 1500); // UX delay
            return; // Added return
        }

        if (data.type === 'restart_ack') {
            // Requester (who sent restart_request) now inits upon receiving ack
            ui.showOverlay("Reinicio aceptado. Nueva partida...");
            setTimeout(() => {
                ui.hideOverlay();
                gameLogic.init();
            }, 1500); // UX delay
            return; // Added return
        }

        // Fallback for other data types or unexpected data
        if (state.isMyTurnInRemote && data.type !== 'player_info') {
             console.warn("PeerConnection: RX data but it's my turn or unhandled type.", {
                isMyTurnInRemote: state.isMyTurnInRemote, gameActive: state.gameActive,
                dataType: data.type
            });
            // return; // Commented out to allow processing other packet types if needed.
        }


        console.warn("PeerConnection: Received unhandled data type or unexpected data:", data.type, data);
    },
    onConnectionClose: () => {
        console.log("PeerConnection: Connection closed.");
        if (state.pvpRemoteActive) { // Only show overlay if it was an active P2P game
            ui.showOverlay("El oponente se ha desconectado.");
            ui.updateStatus("Conexión perdida.");
        }
        state.resetRemoteState();
        gameLogic.updateAllUITogglesHandler(); // Update UI to reflect disconnected state
        // Consider calling gameLogic.init() to reset to a local state or show main menu options
    },
    onError: (err) => {
        console.error('PeerConnection: PeerJS Error Object:', err);
        ui.showOverlay(`Error de conexión: ${err.type || err.message || 'desconocido'}`);
        state.resetRemoteState();
        gameLogic.updateAllUITogglesHandler();
        ui.hideQRCode();
    }
};

export function initializePeerAsHost(stopPreviousGameCallback) {
    stopPreviousGameCallback();
    state.setVsCPU(false);
    state.setPvpRemoteActive(true);
    state.setIAmPlayer1InRemote(true);
    state.setGamePaired(false);
    state.setCurrentHostPeerId(null);

    gameLogic.updateAllUITogglesHandler();
    ui.updateStatus("Estableciendo conexión como Host...");

    if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.init === 'function') {
        window.peerJsMultiplayer.init(null, peerJsCallbacks);
    } else {
        console.error("PeerConnection: peerJsMultiplayer.init not found when trying to host.");
        peerJsCallbacks.onError?.({type: 'init_failed', message: 'Módulo multijugador (PeerJS) no encontrado.'});
    }
}

export function initializePeerAsJoiner(hostIdFromUrl, stopPreviousGameCallback) {
    stopPreviousGameCallback();
    state.setVsCPU(false);
    state.setPvpRemoteActive(true);
    state.setIAmPlayer1InRemote(false);
    state.setGamePaired(false);

    gameLogic.updateAllUITogglesHandler();

    const hostIdInput = hostIdFromUrl || prompt("Ingresa el ID del Host al que deseas unirte:");
    if (!hostIdInput || hostIdInput.trim() === "") {
        ui.showOverlay("ID del Host no ingresado. Operación cancelada.");
        ui.updateStatus("Cancelado. Ingresa un ID para unirte.");
        state.setPvpRemoteActive(false);
        gameLogic.updateAllUITogglesHandler();
        return;
    }
    state.setCurrentHostPeerId(hostIdInput.trim());

    ui.showOverlay(`Conectando al Host ID: ${state.currentHostPeerId}...`);
    ui.updateStatus(`Intentando conectar a ${state.currentHostPeerId}...`);

    if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.init === 'function') {
        window.peerJsMultiplayer.init(null, peerJsCallbacks);
    } else {
        console.error("PeerConnection: peerJsMultiplayer.init not found when trying to join.");
        peerJsCallbacks.onError?.({type: 'init_failed', message: 'Módulo multijugador (PeerJS) no encontrado.'});
    }
}

export function sendPeerData(data) {
    if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.send === 'function' && state.gamePaired) { // Ensure game is paired
        console.log(`PeerConnection: TX @ ${new Date().toLocaleTimeString()}:`, JSON.parse(JSON.stringify(data)));
        window.peerJsMultiplayer.send(data);
    } else {
        console.error("PeerConnection: peerJsMultiplayer.send not available or game not paired.");
    }
}

export function closePeerSession() {
    if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.close === 'function') {
        window.peerJsMultiplayer.close(); // This will trigger onConnectionClose on the other side if connected
    }
    // Local state reset should happen in onConnectionClose or when explicitly stopping a game.
}