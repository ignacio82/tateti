// ui.js
import * as state from './state.js'; // For accessing game state needed for UI updates
import * as player from './player.js'; // For getPlayerName and determineEffectiveIcons

// ----------  ELEMENTOS DEL DOM (already defined)  ----------
export const cells = document.querySelectorAll('.cell');
export const statusDiv = document.getElementById('status');
export const pvpLocalBtn = document.getElementById('pvpLocalBtn');
export const threePieceBtn = document.getElementById('threePieceBtn');
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

// QR Modal Elements
export const qrDisplayArea = document.getElementById('qr-display-area');
export const qrCodeCanvas = document.getElementById('qr-code-canvas');
const qrModalCloseBtn = document.getElementById('qrModalCloseBtn');
const copyHostIdBtn = document.getElementById('copyHostIdBtn');

export const playerNameInput = document.getElementById('playerNameInput');
export const iconSelectionDiv = document.getElementById('iconSelection');
export const savePlayerPrefsBtn = document.getElementById('savePlayerPrefsBtn');
export const resultsDiv = document.getElementById('results');

// ----------  UI HELPER FUNCTIONS  ----------

export function showOverlay(text) {
    const overlayId = 'gameOverlay';
    let overlay = document.getElementById(overlayId);
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = overlayId;
        // ... (styles as before) ...
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0,0,0,0.7)';
        overlay.style.color = 'white';
        overlay.style.display = 'flex';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.zIndex = '2000';
        overlay.style.fontSize = '2em';
        overlay.style.textAlign = 'center';
        document.body.appendChild(overlay);
    }
    overlay.textContent = text;
    overlay.style.display = 'flex';
}

export function hideOverlay() {
    const overlayId = 'gameOverlay';
    let overlay = document.getElementById(overlayId);
    if (overlay) {
        overlay.style.display = 'none';
    }
    const statusOverlay = document.getElementById('statusOverlay');
    if (statusOverlay) statusOverlay.style.display = 'none';
}

export function setBoardClickable(clickable) {
    if (gameBoardEl) {
        gameBoardEl.style.pointerEvents = clickable ? 'auto' : 'none';
        cells.forEach(cell => {
            if (clickable) {
                cell.classList.remove('disabled');
                if (cell.querySelector('span')?.textContent === '') cell.style.cursor = 'pointer';
            } else {
                cell.classList.add('disabled');
                cell.style.cursor = 'default';
            }
        });
    }
}

export function playDrawAnimation() {
    if (statusDiv) statusDiv.classList.add('highlight-draw-flash');
    if (gameBoardEl) gameBoardEl.classList.add('highlight-draw-border');
    setTimeout(() => {
        if (statusDiv) statusDiv.classList.remove('highlight-draw-flash');
        if (gameBoardEl) gameBoardEl.classList.remove('highlight-draw-border');
    }, 1800);
}

const confettiContainerId = 'confetti-container';

export function launchConfetti() {
    let container = document.getElementById(confettiContainerId);
    if (!container) {
        container = document.createElement('div');
        container.id = confettiContainerId;
        // ... (styles as before) ...
        container.style.position = 'fixed';
        container.style.top = '0';
        container.style.left = '0';
        container.style.width = '100vw';
        container.style.height = '100vh';
        container.style.overflow = 'hidden';
        container.style.pointerEvents = 'none';
        container.style.zIndex = '3000';
        document.body.appendChild(container);
    }
    container.innerHTML = '';

    const confettiCount = 100;
    const colors = ['#ff69b4', '#ffc0cb', '#ff1493', '#ffe4e1', '#db7093'];

    for (let i = 0; i < confettiCount; i++) {
        const confetti = document.createElement('div');
        confetti.classList.add('confetti');
        // ... (styles as before) ...
        confetti.style.left = Math.random() * 100 + 'vw';
        confetti.style.top = Math.random() * -100 + 'vh';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.width = (Math.random() * 10 + 5) + 'px';
        confetti.style.height = (Math.random() * 20 + 10) + 'px';
        confetti.style.opacity = Math.random() * 0.5 + 0.5;
        
        const duration = (Math.random() * 2 + 2.5).toFixed(2);
        const delay = (Math.random() * 1).toFixed(2);

        confetti.style.animationName = 'fall';
        confetti.style.animationDuration = `${duration}s`;
        confetti.style.animationDelay = `${delay}s`;
        confetti.style.animationTimingFunction = 'linear';
        confetti.style.animationIterationCount = '1';
        confetti.style.animationFillMode = 'forwards';
        container.appendChild(confetti);
        setTimeout(() => {
            confetti.remove();
        }, (parseFloat(duration) + parseFloat(delay) + 0.5) * 1000);
    }
}

export function removeConfetti() {
    const container = document.getElementById(confettiContainerId);
    if (container) {
        container.innerHTML = '';
    }
}

export function updateStatus(message) {
    if (statusDiv) statusDiv.textContent = message;
}

export function highlightWinner(winningCells) {
    winningCells.forEach(index => {
        cells[index]?.classList.add('rainbow');
    });
}

export function clearBoardUI() {
    cells.forEach(cell => {
        const span = cell.querySelector('span');
        if (span) span.textContent = '';
        cell.classList.remove('rainbow', 'disabled', 'selected-piece-to-move'); // Add selected-piece-to-move
        cell.style.cursor = 'pointer';
    });
    removeConfetti();
}

export function updateCellUI(index, symbol) {
    if (cells[index]) {
        const span = cells[index].querySelector('span');
        if (span) {
            span.textContent = symbol || ''; // Ensure empty string if symbol is null/undefined
        } else {
            cells[index].textContent = symbol || '';
        }
        // If a symbol is placed, it's not just selected for moving, it's taken.
        // If symbol is null (clearing a cell), it should become clickable if game allows.
        if (symbol) {
            cells[index].style.cursor = 'default';
            cells[index].classList.add('disabled');
        } else {
            cells[index].style.cursor = 'pointer';
            cells[index].classList.remove('disabled');
        }
        cells[index].classList.remove('rainbow'); 
        cells[index].classList.remove('selected-piece-to-move'); // Remove selection highlight

        if (symbol) { // Only animate if placing a new symbol
            cells[index].style.animation = 'cellSelectAnim 0.2s ease-out';
            setTimeout(() => {
                if (cells[index]) cells[index].style.animation = '';
            }, 200);
        }
    }
}

// --- Functions for Suggested Move Hint ---
export function highlightSuggestedMove(index) {
    clearSuggestedMoveHighlight();
    if (cells[index] && cells[index].querySelector('span')?.textContent === '') {
        cells[index].classList.add('rainbow');
    }
}

export function clearSuggestedMoveHighlight() {
    cells.forEach(cell => {
        cell.classList.remove('rainbow');
    });
}
// --- End Functions for Suggested Move Hint ---

// --- Functions for Highlighting Selected Piece in Three Piece Mode ---
export function highlightSelectedPiece(index) {
    clearSelectedPieceHighlight(); // Clear any previously selected piece
    if (cells[index]) {
        cells[index].classList.add('selected-piece-to-move');
    }
}

export function clearSelectedPieceHighlight() {
    cells.forEach(cell => {
        cell.classList.remove('selected-piece-to-move');
    });
}
// --- End Functions for Highlighting Selected Piece ---


export function displayQRCode(gameLink) {
    if (qrDisplayArea && qrCodeCanvas && window.QRious) {
        new QRious({
            element: qrCodeCanvas,
            value: gameLink,
            size: 180,
            padding: 10,
            level: 'H',
            foreground: '#ff1493',
            background: '#fff8fb'
        });

        if (copyHostIdBtn) {
            copyHostIdBtn.textContent = "Copiar Enlace del Juego";
            copyHostIdBtn.dataset.gameLink = gameLink;
            copyHostIdBtn.classList.remove('copied');
        }

        qrDisplayArea.classList.add('modal');
        qrDisplayArea.style.display = 'flex';

    } else {
        console.warn("QR Code modal essentials (display area, canvas, or QRious library) not found.");
        if (qrDisplayArea) {
            qrDisplayArea.classList.add('modal');
            qrDisplayArea.style.display = 'flex';
            if(copyHostIdBtn) copyHostIdBtn.textContent = "Error generando enlace";
        }
    }
}

export function hideQRCode() {
    if (qrDisplayArea) {
        qrDisplayArea.style.display = 'none';
        qrDisplayArea.classList.remove('modal');
    }
    if (copyHostIdBtn) {
        copyHostIdBtn.textContent = "Copiar Enlace del Juego";
        copyHostIdBtn.classList.remove('copied');
    }
}

export function toggleMenu() {
    if (sideMenu) sideMenu.classList.toggle('open');
}

export function closeMenuIfNeeded(eventTarget) {
    if (sideMenu && menuToggle && !sideMenu.contains(eventTarget) && !menuToggle.contains(eventTarget) && sideMenu.classList.contains('open')) {
        sideMenu.classList.remove('open');
    }
}
export function updateThemeToggleButton(isDarkTheme) {
    if (themeToggle) themeToggle.textContent = isDarkTheme ? '☀️' : '🌙';
}
export function updateSoundToggleButton(soundEnabled) {
    if (soundToggle) soundToggle.textContent = soundEnabled ? '🔊' : '🔇';
}

// ---------- NEWLY MOVED UI UPDATE FUNCTIONS ----------
// ... (updateScoreboard and updateAllUIToggleButtons remain the same as last version) ...
export function updateScoreboard() {
    if (!state.myEffectiveIcon || (!state.opponentEffectiveIcon && (state.vsCPU || state.pvpRemoteActive))) {
         player.determineEffectiveIcons();
    }

    let myDisplayName = player.getPlayerName(state.myEffectiveIcon);
    let opponentDisplayName;

    if (state.pvpRemoteActive || state.vsCPU) {
        opponentDisplayName = player.getPlayerName(state.opponentEffectiveIcon);
    } else { // Local PvP (Classic or ThreePiece)
        myDisplayName = player.getPlayerName(state.gameP1Icon);
        opponentDisplayName = player.getPlayerName(state.gameP2Icon);
    }

    if (resultsDiv) {
        resultsDiv.innerHTML = `${myDisplayName} <span id="myWinsSpan">${state.myWins}</span> – ${opponentDisplayName} <span id="opponentWinsSpan">${state.opponentWins}</span> – 🤝 <span id="drawsSpan">${state.draws}</span>`;
    }
}

export function updateAllUIToggleButtons() {
    // Game Mode Buttons
    [pvpLocalBtn, threePieceBtn, hostGameBtn, joinGameBtn, cpuBtn].forEach(btn => btn?.classList.remove('active'));
    
    if (state.pvpRemoteActive) {
        if (state.iAmPlayer1InRemote && hostGameBtn) hostGameBtn.classList.add('active');
        else if (!state.iAmPlayer1InRemote && joinGameBtn) joinGameBtn.classList.add('active');
    } else if (state.vsCPU) {
        if (cpuBtn) cpuBtn.classList.add('active');
    } else if (state.gameVariant === state.GAME_VARIANTS.THREE_PIECE) {
        if (threePieceBtn) threePieceBtn.classList.add('active');
    } else { 
        if (pvpLocalBtn) pvpLocalBtn.classList.add('active');
    }

    const showDifficulty = state.vsCPU && state.gameVariant === state.GAME_VARIANTS.CLASSIC;
    if (difficultyDiv) difficultyDiv.style.display = showDifficulty ? 'flex' : 'none';
    
    if (showDifficulty) {
        [easyBtn, mediumBtn, hardBtn].forEach(btn => btn?.classList.remove('active'));
        if (state.difficulty === 'easy' && easyBtn) easyBtn.classList.add('active');
        else if (state.difficulty === 'hard' && hardBtn) hardBtn.classList.add('active');
        else if (mediumBtn) mediumBtn.classList.add('active'); 
    }

    const showStartOptions = !state.pvpRemoteActive; 
    const gameStartOptionsEl = document.querySelector('.game-start-options'); 
    const gameStartOptionsTitle = gameStartOptionsEl?.previousElementSibling; 

    if (gameStartOptionsEl) gameStartOptionsEl.style.display = showStartOptions ? 'flex' : 'none';
    if (gameStartOptionsTitle) gameStartOptionsTitle.style.display = showStartOptions ? 'block' : 'none';

    if (showStartOptions) {
        [player1StartsBtn, randomStartsBtn, loserStartsBtn].forEach(btn => btn?.classList.remove('active'));
        const startSettingMap = { 'player1': player1StartsBtn, 'random': randomStartsBtn, 'loser': loserStartsBtn };
        if (startSettingMap[state.whoGoesFirstSetting]) {
            startSettingMap[state.whoGoesFirstSetting].classList.add('active');
        } else if (player1StartsBtn) { 
            player1StartsBtn.classList.add('active');
        }
    }
    
    updateThemeToggleButton(document.body.classList.contains('dark-theme'));
    updateSoundToggleButton(state.soundEnabled);
}


// --- Event Listeners for UI elements defined in this module ---
if (qrModalCloseBtn) {
    qrModalCloseBtn.addEventListener('click', hideQRCode);
}

if (qrDisplayArea) {
    qrDisplayArea.addEventListener('click', function(event) {
        if (event.target === qrDisplayArea) {
            hideQRCode();
        }
    });
}

if (copyHostIdBtn) {
    copyHostIdBtn.addEventListener('click', function() {
        const gameLinkToCopy = this.dataset.gameLink;
        if (gameLinkToCopy && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(gameLinkToCopy)
                .then(() => {
                    const originalText = this.textContent;
                    this.textContent = '¡Enlace Copiado!';
                    this.classList.add('copied');
                    setTimeout(() => {
                        this.textContent = originalText;
                        this.classList.remove('copied');
                    }, 2000);
                })
                .catch(err => {
                    console.error('Error al copiar enlace al portapapeles:', err);
                    alert('No se pudo copiar el enlace. Intenta manualmente.');
                });
        } else if (gameLinkToCopy) {
            console.warn('navigator.clipboard.writeText no disponible. Intenta copiar manualmente.');
            alert('Función de copiar no disponible. El enlace es: ' + gameLinkToCopy);
        } else {
            console.warn('No game link found to copy.');
            alert('No hay enlace para copiar.');
        }
    });
}
