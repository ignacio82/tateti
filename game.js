/****************************************************
 * GAME LOGIC (with PeerJS Multiplayer + Player Customization Phase 1) *
 ***************************************************/
document.addEventListener('DOMContentLoaded', () => {
    /* ----------  ELEMENTOS DEL DOM  ---------- */
    const cells             = document.querySelectorAll('.cell');
    const statusDiv         = document.getElementById('status');
    const pvpLocalBtn       = document.getElementById('pvpLocalBtn');
    const hostGameBtn       = document.getElementById('hostGameBtn');
    const joinGameBtn       = document.getElementById('joinGameBtn');
    const cpuBtn            = document.getElementById('cpuBtn');
    const difficultyDiv     = document.querySelector('.difficulty');
    const easyBtn           = document.getElementById('easyBtn');
    const mediumBtn         = document.getElementById('mediumBtn');
    const hardBtn           = document.getElementById('hardBtn');
    const themeToggle       = document.getElementById('themeToggle');
    const soundToggle       = document.getElementById('soundToggle');
    const changeSymbolsBtn  = document.getElementById('changeSymbolsBtn');
    const player1StartsBtn  = document.getElementById('player1StartsBtn');
    const randomStartsBtn   = document.getElementById('randomStartsBtn');
    const loserStartsBtn    = document.getElementById('loserStartsBtn');
    const gameBoardEl       = document.getElementById('game');
    const menuToggle        = document.getElementById('menu-toggle');
    const sideMenu          = document.getElementById('side-menu');
    const restartIcon       = document.getElementById('restart-icon');

    const qrDisplayArea     = document.getElementById('qr-display-area');
    const qrCodeCanvas      = document.getElementById('qr-code-canvas');
    const qrTextData        = document.getElementById('qr-text-data');
    const qrTitle           = document.getElementById('qr-title');

    const playerNameInput   = document.getElementById('playerNameInput');
    const iconSelectionDiv  = document.getElementById('iconSelection');
    const savePlayerPrefsBtn = document.getElementById('savePlayerPrefsBtn');

    const showOverlay = window.showStatusOverlay || function(text) {
        const overlay = document.getElementById('statusOverlay');
        if (overlay) {
            overlay.textContent = text;
            overlay.style.display = 'block';
        } else { console.log("Overlay (fallback):", text); }
    };
    const hideOverlay = window.hideStatusOverlay || function() {
        const overlay = document.getElementById('statusOverlay');
        if (overlay) {
            overlay.style.display = 'none';
        } else { console.log("Hide Overlay (fallback)"); }
    };

    menuToggle.addEventListener('click', () => sideMenu.classList.toggle('open'));
    document.addEventListener('click', e => {
        if (!sideMenu.contains(e.target) && !menuToggle.contains(e.target) && sideMenu.classList.contains('open')) {
            sideMenu.classList.remove('open');
        }
    });

    /* ----------  ESTADO  ---------- */
    let board, currentPlayer, gameActive, vsCPU = false, difficulty = 'medium';
    let pvpRemoteActive = false;
    let isMyTurnInRemote = true;
    let iAmPlayer1InRemote = true;
    let gamePaired = false;
    let currentHostPeerId = null;

    let myPlayerName = localStorage.getItem('tatetiPlayerName') || 'Jugador';
    let myPlayerIcon = localStorage.getItem('tatetiPlayerIcon') || null;

    let opponentPlayerName = 'Oponente';
    let opponentPlayerIcon = null;

    let myEffectiveIcon;
    let opponentEffectiveIcon;
    let gameP1Icon; // Icon of Player 1 on the board (Host in remote, or P1 in local/CPU)
    let gameP2Icon; // Icon of Player 2 on the board (Joiner in remote, or P2/CPU in local/CPU)

    let soundEnabled = !(localStorage.getItem('soundDisabled') === 'true');
    const symbolSet = [
        {player1:'🦄',player2:'❤️', nameP1: 'Unicornio', nameP2: 'Corazón'},
        {player1:'🐱',player2:'🐶', nameP1: 'Gatito', nameP2: 'Perrito'},
        {player1:'🌞',player2:'🌙', nameP1: 'Sol', nameP2: 'Luna'},
        {player1:'❌',player2:'⭕', nameP1: 'Equis', nameP2: 'Círculo'}
    ];
    let currentSymbolIndex = +(localStorage.getItem('currentSymbolIndex') || 0);
    let currentSymbols = symbolSet[currentSymbolIndex];

    // `myWins` and `opponentWins` will store scores, replacing unicornWins/heartWins for clarity
    let myWins = +localStorage.getItem('myWinsTateti') || 0;
    let opponentWins = +localStorage.getItem('opponentWinsTateti') || 0;
    let draws = +localStorage.getItem('drawsTateti') || 0;

    let whoGoesFirstSetting = localStorage.getItem('whoGoesFirstSetting') || 'player1';
    let lastWinner = null; // Stores the *icon* of the last winner
    let previousGameExists = (myWins + opponentWins + draws) > 0;
    const AUTO_RESTART_DELAY_WIN = 5000; // milliseconds
    const AUTO_RESTART_DELAY_DRAW = 3000; // milliseconds

    /* ---------- PLAYER CUSTOMIZATION LOGIC ---------- */
    function populateIconSelection() {
        if (!iconSelectionDiv) return;
        iconSelectionDiv.innerHTML = '';
        const uniqueIcons = new Set();
        symbolSet.forEach(pair => { uniqueIcons.add(pair.player1); uniqueIcons.add(pair.player2); });
        uniqueIcons.forEach(icon => {
            const button = document.createElement('button');
            button.classList.add('icon-choice-btn', 'std');
            button.textContent = icon;
            button.dataset.icon = icon;
            if (icon === myPlayerIcon) button.classList.add('active');
            button.addEventListener('click', () => {
                myPlayerIcon = icon;
                iconSelectionDiv.querySelectorAll('.icon-choice-btn').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
            });
            iconSelectionDiv.appendChild(button);
        });
    }

    function loadPlayerPreferences() {
        myPlayerName = localStorage.getItem('tatetiPlayerName') || 'Jugador';
        myPlayerIcon = localStorage.getItem('tatetiPlayerIcon') || null;
        if (playerNameInput) playerNameInput.value = myPlayerName;
        populateIconSelection();
    }

    if (savePlayerPrefsBtn) {
        savePlayerPrefsBtn.addEventListener('click', () => {
            if (playerNameInput) myPlayerName = playerNameInput.value.trim() || 'Jugador';
            localStorage.setItem('tatetiPlayerName', myPlayerName);
            if (myPlayerIcon) localStorage.setItem('tatetiPlayerIcon', myPlayerIcon);
            else localStorage.removeItem('tatetiPlayerIcon'); // Clear if no icon selected, to allow default
            alert("Preferencias guardadas!");
            sideMenu.classList.remove('open');
            if (!gameActive) {
                determineEffectiveIcons(); // Update effective icons based on new prefs
                updateScoreboard();
                // Update status based on who would start if a game began now
                statusDiv.textContent = `Turno del ${getPlayerName(gameP1Icon)}`; // Default to P1 starting
            }
        });
    }

    /* ----------  AUDIO CONTEXT & OTHER HELPERS  ---------- */
    let audioCtx;
    function getAudioContext(){ if(!audioCtx && (window.AudioContext||window.webkitAudioContext)){audioCtx=new(window.AudioContext||window.webkitAudioContext)()}return audioCtx }
    function initAudioOnInteraction(){const ctx=getAudioContext();if(ctx&&ctx.state==='suspended'){ctx.resume()}document.removeEventListener('click',initAudioOnInteraction)}
    const confettiColors=['#ff69b4','#ff1493','#ffc0cb','#ffe4e1','#f0f8ff'];let confettiInterval;
    function launchConfetti(){removeConfetti();const num=100,arr=[];for(let i=0;i<num;i++){const c=document.createElement('div');c.classList.add('confetti');c.style.background=confettiColors[Math.floor(Math.random()*confettiColors.length)];c.style.left=Math.random()*100+'vw';c.style.animation=`fall ${2+Math.random()*2}s linear ${Math.random()*1}s forwards`;c.style.width=Math.random()*8+4+'px';c.style.height=c.style.width;c.style.opacity=Math.random()+.5;document.body.appendChild(c);arr.push(c)}confettiInterval=setTimeout(removeConfetti,4000);return arr}
    function removeConfetti(){clearTimeout(confettiInterval);document.querySelectorAll('.confetti').forEach(c=>c.remove())}
    function playDrawAnimation(){statusDiv.classList.add('highlight-draw-flash');gameBoardEl.classList.add('highlight-draw-border');setTimeout(()=>{statusDiv.classList.remove('highlight-draw-flash');gameBoardEl.classList.remove('highlight-draw-border')},1800)}
    function setBoardClickable(clickable){cells.forEach(c=>c.style.pointerEvents=clickable?'auto':'none')}

    function getPlayerName(sym){
        // Use effective icons to determine which name to show
        if (sym === myEffectiveIcon) return `${myPlayerName} (${sym})`;
        if (sym === opponentEffectiveIcon && (pvpRemoteActive || vsCPU)) return `${opponentPlayerName} (${sym})`;
        // For local PvP, opponentEffectiveIcon is P2's icon. We need a P2 name concept if we want to customize it.
        // For now, local P2 will use a default name if their icon isn't myEffectiveIcon.
        if (!pvpRemoteActive && !vsCPU && sym === opponentEffectiveIcon) return `Jugador 2 (${sym})`;


        // Fallback to default names from symbolSet if symbol doesn't match effective icons
        // This might happen if icons are not yet fully determined or for some edge cases
        for (const set of symbolSet) {
            if (sym === set.player1) return `${set.nameP1} (${sym})`;
            if (sym === set.player2) return `${set.nameP2} (${sym})`;
        }
        return `Jugador (${sym})`; // Generic fallback
    }

    function updateAllUIToggleButtons() {
        [pvpLocalBtn, hostGameBtn, joinGameBtn, cpuBtn].forEach(btn => btn?.classList.remove('active'));
        if (pvpRemoteActive) {
            if (iAmPlayer1InRemote && hostGameBtn) hostGameBtn.classList.add('active');
            else if (!iAmPlayer1InRemote && joinGameBtn) joinGameBtn.classList.add('active');
        } else if (vsCPU && cpuBtn) {
            cpuBtn.classList.add('active');
        } else if (pvpLocalBtn) {
            pvpLocalBtn.classList.add('active');
        }

        if (difficultyDiv) difficultyDiv.style.display = vsCPU ? 'flex' : 'none';
        [easyBtn, mediumBtn, hardBtn].forEach(btn => btn?.classList.remove('active'));
        if (vsCPU) {
            if (difficulty === 'easy' && easyBtn) easyBtn.classList.add('active');
            else if (difficulty === 'hard' && hardBtn) hardBtn.classList.add('active');
            else if (mediumBtn) mediumBtn.classList.add('active');
        }

        [player1StartsBtn, randomStartsBtn, loserStartsBtn].forEach(btn => btn?.classList.remove('active'));
        const startSettingMap = { 'player1': player1StartsBtn, 'random': randomStartsBtn, 'loser': loserStartsBtn };
        if (startSettingMap[whoGoesFirstSetting]) startSettingMap[whoGoesFirstSetting].classList.add('active');
        else if (player1StartsBtn) player1StartsBtn.classList.add('active');

        if(soundToggle) soundToggle.textContent = soundEnabled ? '🔊' : '🔇';
        if(themeToggle) themeToggle.textContent = document.body.classList.contains('dark-theme') ? '☀️' : '🌙';
    }

    function stopAnyGameInProgress() {
        console.log("GAME.JS: stopAnyGameInProgress called");
        if (pvpRemoteActive && window.peerJsMultiplayer && typeof window.peerJsMultiplayer.close === "function") {
            console.log("GAME.JS: Closing PeerJS connection from stopAnyGameInProgress");
            window.peerJsMultiplayer.close();
        }
        gameActive = false;
        pvpRemoteActive = false;
        gamePaired = false;
        vsCPU = false;
        currentHostPeerId = null;

        hideOverlay();
        if (qrDisplayArea) qrDisplayArea.style.display = 'none';

        if (hostGameBtn) hostGameBtn.classList.remove('active');
        if (joinGameBtn) joinGameBtn.classList.remove('active');
        if (pvpLocalBtn) pvpLocalBtn.classList.remove('active');
        if (cpuBtn) cpuBtn.classList.remove('active');
        if (difficultyDiv) difficultyDiv.style.display = 'none';

        console.log("GAME.JS: Game progress stopped and state reset.");
    }

    const peerJsCallbacks = {
        onPeerOpen: (id) => {
            if (pvpRemoteActive && iAmPlayer1InRemote) { // Host logic
                currentHostPeerId = id;
                const desiredBaseUrl = 'https://tateti.martinez.fyi';
                const gameLink = `${desiredBaseUrl}/?room=${id}`;
                statusDiv.textContent = `Comparte el enlace o ID: ${id}`;
                showOverlay(`Tu ID de Host: ${id}. Esperando conexión...`);
                if (qrTextData) qrTextData.value = gameLink;
                if (qrCodeCanvas && typeof QRious !== 'undefined') {
                    try {
                        new QRious({ element: qrCodeCanvas, value: gameLink, size: 180, padding: 5 });
                        if (qrTitle) qrTitle.textContent = "Invita al Jugador 2:";
                        if (qrDisplayArea) qrDisplayArea.style.display = 'block';
                    } catch (e) {
                        console.error("GAME.JS: QRious error:", e);
                        if (qrTextData) qrTextData.value = gameLink;
                        if (qrTitle) qrTitle.textContent = "Comparte este enlace (error en QR):";
                        if (qrDisplayArea) qrDisplayArea.style.display = 'block';
                        statusDiv.textContent = `Error al generar QR. ID: ${id}`;
                     }
                } else { // Fallback if QRious not available
                     if (qrTextData) qrTextData.value = gameLink;
                     if (qrTitle) qrTitle.textContent = "Invita con este enlace:";
                     if (qrDisplayArea) qrDisplayArea.style.display = 'block';
                     console.warn("GAME.JS: QRious library not found or qrCodeCanvas not available.");
                }
            } else if (pvpRemoteActive && !iAmPlayer1InRemote) { // Joiner logic
                 if (currentHostPeerId) {
                    window.peerJsMultiplayer.connect(currentHostPeerId);
                 } else {
                    console.error("GAME.JS (Joiner): Host ID not set. Cannot connect.");
                    peerJsCallbacks.onError({type: 'connect_failed', message: "ID del Host no especificado para unirse."});
                 }
            }
        },
        onNewConnection: (conn) => { // Host receives connection
            console.log("GAME.JS: PeerJS new connection received by Host:", conn);
            showOverlay("Jugador 2 conectándose...");
            statusDiv.textContent = "Jugador 2 está conectándose...";
        },
        onConnectionOpen: () => { // Both Host and Joiner
            console.log("GAME.JS: PeerJS connection abierta!");
            gamePaired = true;
            hideOverlay();
            if (qrDisplayArea) qrDisplayArea.style.display = 'none';

            determineEffectiveIcons(); // Determine myEffectiveIcon before sending
            if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.send === "function") {
                window.peerJsMultiplayer.send({
                    type: 'player_info',
                    name: myPlayerName,
                    icon: myEffectiveIcon // Send determined effective icon
                });
            }
            statusDiv.textContent = "¡Conectado! Iniciando partida...";
            playSound('win'); // Or a 'connected' sound
            init(); // Initialize game board and turns
        },
        onDataReceived: (data) => {
            console.log("GAME.JS: Data received via PeerJS:", data);
            if(data.type === 'player_info') {
                opponentPlayerName = data.name || 'Oponente Remoto';
                opponentPlayerIcon = data.icon; // Expecting opponent to send their determined effective icon
                console.log("GAME.JS: Opponent info received:", opponentPlayerName, opponentPlayerIcon);
                determineEffectiveIcons(); // Re-determine all effective icons with new opponent info
                updateScoreboard();
                // Update status if game is already active (e.g., if info came late)
                if (gameActive && !isMyTurnInRemote) {
                    statusDiv.textContent = `Esperando a ${getPlayerName(currentPlayer)}...`;
                } else if (gameActive && isMyTurnInRemote) {
                    statusDiv.textContent = `Tu Turno ${getPlayerName(currentPlayer)}`;
                }
                // If connection was established but init hadn't run fully (e.g. waiting for player_info)
                if(!gameActive && pvpRemoteActive && gamePaired) {
                    init();
                }
                return;
            }

            if (!gameActive || !pvpRemoteActive || (pvpRemoteActive && isMyTurnInRemote) || !gamePaired) {
                 console.warn("GAME.JS: Received data but not expecting it.", {isMyTurnInRemote, gameActive, pvpRemoteActive, gamePaired, receivedDataType: data.type});
                 return;
            }

            if (data.type === 'move' && typeof data.index === 'number') {
                handleRemoteMoveDetected(data.index);
            } else if (data.type === 'restart_request') {
                console.log("GAME.JS: Received restart request.");
                // Use opponentEffectiveIcon if available, otherwise a generic name.
                const requesterName = opponentPlayerIcon ? getPlayerName(opponentEffectiveIcon) : "El oponente";
                showOverlay(`${requesterName} quiere reiniciar.`);
                if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.send === "function") {
                    window.peerJsMultiplayer.send({ type: 'restart_ack' });
                }
                // Both sides will call init upon receiving ack or sending it.
                // For this manual request flow, let's assume init happens after ack.
                setTimeout(() => { hideOverlay(); init(); }, 2000); // Receiver also inits
            } else if (data.type === 'restart_ack') {
                console.log("GAME.JS: Received restart acknowledgement.");
                showOverlay("Reinicio aceptado. Nueva partida.");
                 setTimeout(() => { hideOverlay(); init(); }, 1500); // Requester inits
            }
        },
        onConnectionClose: () => {
            console.log("GAME.JS: PeerJS connection closed.");
            showOverlay("El oponente se ha desconectado.");
            statusDiv.textContent = "Conexión perdida.";
            pvpRemoteActive = false;
            gamePaired = false;
            if (hostGameBtn) hostGameBtn.classList.remove('active');
            if (joinGameBtn) joinGameBtn.classList.remove('active');
            // init(); // Optionally reset to a default local state
        },
        onError: (err) => { /* ... (same comprehensive error handler from before) ... */ }
    };

    async function handleHostGame() {
        console.log("GAME.JS: handleHostGame called");
        stopAnyGameInProgress();
        vsCPU = false;
        pvpRemoteActive = true;
        iAmPlayer1InRemote = true;
        gamePaired = false;
        currentHostPeerId = null;

        if (hostGameBtn) hostGameBtn.classList.add('active');
        if (joinGameBtn) joinGameBtn.classList.remove('active');
        if (pvpLocalBtn) pvpLocalBtn.classList.remove('active');
        if (cpuBtn) cpuBtn.classList.remove('active');
        if (difficultyDiv) difficultyDiv.style.display = 'none';

        showOverlay("Configurando partida remota como Host...");
        statusDiv.textContent = "Estableciendo conexión como Host...";

        if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.init === "function") {
            window.peerJsMultiplayer.init(null, peerJsCallbacks);
        } else {
            console.error("GAME.JS: PeerJS multiplayer module not found or init function missing.");
            peerJsCallbacks.onError({type: 'init_failed', message: 'Módulo multijugador (PeerJS) no encontrado.'});
        }
    }

    async function handleJoinGame(roomIdFromUrl = null) {
        console.log("GAME.JS: handleJoinGame called. roomIdFromUrl:", roomIdFromUrl);
        stopAnyGameInProgress();
        vsCPU = false;
        pvpRemoteActive = true;
        iAmPlayer1InRemote = false;
        gamePaired = false;

        if (joinGameBtn) joinGameBtn.classList.add('active');
        if (hostGameBtn) hostGameBtn.classList.remove('active');
        if (pvpLocalBtn) pvpLocalBtn.classList.remove('active');
        if (cpuBtn) cpuBtn.classList.remove('active');
        if (difficultyDiv) difficultyDiv.style.display = 'none';

        const hostIdInput = roomIdFromUrl ? roomIdFromUrl : prompt("Ingresa el ID del Host al que deseas unirte:");
        if (!hostIdInput || hostIdInput.trim() === "") {
            showOverlay("ID del Host no ingresado. Operación cancelada.");
            statusDiv.textContent = "Cancelado. Ingresa un ID para unirte.";
            pvpRemoteActive = false;
            if (joinGameBtn) joinGameBtn.classList.remove('active');
            return;
        }
        currentHostPeerId = hostIdInput.trim();

        showOverlay(`Conectando al Host ID: ${currentHostPeerId}...`);
        statusDiv.textContent = `Intentando conectar a ${currentHostPeerId}...`;

        if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.init === "function" && typeof window.peerJsMultiplayer.connect === "function") {
            window.peerJsMultiplayer.init(null, peerJsCallbacks);
        } else {
            console.error("GAME.JS: PeerJS multiplayer module not found or init/connect function missing.");
            peerJsCallbacks.onError({type: 'init_failed', message: 'Módulo multijugador (PeerJS) no encontrado.'});
        }
    }

    function determineEffectiveIcons() {
        // My chosen icon, or a default based on role in remote, or P1 in local/CPU
        myEffectiveIcon = myPlayerIcon ||
                          (pvpRemoteActive ? (iAmPlayer1InRemote ? currentSymbols.player1 : currentSymbols.player2)
                                           : currentSymbols.player1);

        if (pvpRemoteActive) {
            // Opponent's chosen icon if received, otherwise a default distinct from mine
            if (opponentPlayerIcon) {
                opponentEffectiveIcon = opponentPlayerIcon;
            } else {
                // If myEffectiveIcon is P1's symbol, opponent gets P2's, and vice-versa
                opponentEffectiveIcon = (myEffectiveIcon === currentSymbols.player1) ? currentSymbols.player2 : currentSymbols.player1;
            }
        } else if (vsCPU) {
            // CPU gets the other default symbol from current set, distinct from myEffectiveIcon
            opponentEffectiveIcon = (myEffectiveIcon === currentSymbols.player1) ? currentSymbols.player2 : currentSymbols.player1;
        } else { // Local PvP
            // Local P2 gets the other default symbol, distinct from myEffectiveIcon (local P1)
            opponentEffectiveIcon = (myEffectiveIcon === currentSymbols.player1) ? currentSymbols.player2 : currentSymbols.player1;
        }

        // Assign icons for game board positions (gameP1Icon is always who moves first by convention if not random)
        if (pvpRemoteActive) { // Host is P1 on board, Joiner is P2 on board
            gameP1Icon = iAmPlayer1InRemote ? myEffectiveIcon : opponentEffectiveIcon;
            gameP2Icon = iAmPlayer1InRemote ? opponentEffectiveIcon : myEffectiveIcon;
        } else if (vsCPU) { // Player is P1, CPU is P2
            gameP1Icon = myEffectiveIcon;
            gameP2Icon = opponentEffectiveIcon;
        } else { // Local PvP: P1 is me, P2 is the other local player
            gameP1Icon = myEffectiveIcon;
            gameP2Icon = opponentEffectiveIcon;
        }
    }

    function init(){
        removeConfetti(); hideOverlay(); if(qrDisplayArea) qrDisplayArea.style.display = 'none';
        const isHostBtnActive = hostGameBtn?.classList.contains('active');
        const isJoinBtnActive = joinGameBtn?.classList.contains('active');

        if (!isHostBtnActive && !isJoinBtnActive) { // If not in a remote setup phase
            if (pvpRemoteActive && window.peerJsMultiplayer?.close) { // Close active session if any
                 window.peerJsMultiplayer.close();
            }
            pvpRemoteActive = false; gamePaired = false; // Reset remote flags
        }
        // For ongoing remote games (gamePaired=true), pvpRemoteActive remains true.

        board = Array(9).fill(null);
        difficulty = easyBtn.classList.contains('active')?'easy':hardBtn.classList.contains('active')?'hard':'medium';
        gameActive = false; // Will be set true if game starts

        determineEffectiveIcons(); // Crucial: sets myEffectiveIcon, opponentEffectiveIcon, gameP1Icon, gameP2Icon

        if (pvpRemoteActive && gamePaired) {
            currentPlayer = gameP1Icon; // Host (gameP1Icon on board) always starts a new remote round
            isMyTurnInRemote = (currentPlayer === myEffectiveIcon); // Is it my turn?
            statusDiv.textContent = isMyTurnInRemote ? `Tu Turno ${getPlayerName(currentPlayer)}` : `Esperando a ${getPlayerName(currentPlayer)}...`;
            setBoardClickable(isMyTurnInRemote);
            gameActive = true;
        } else if (pvpRemoteActive && !gamePaired) { // Waiting for connection
            setBoardClickable(false); gameActive = false;
            // Status like "Waiting for connection" should be set by handleHostGame/handleJoinGame or onPeerOpen
        } else { // Local PvP or Vs CPU
            gameActive = true;
            let startingPlayer;
            // Determine who starts based on settings (P1 on board is gameP1Icon, P2 is gameP2Icon)
            if (whoGoesFirstSetting === 'random') {
                startingPlayer = Math.random() < 0.5 ? gameP1Icon : gameP2Icon;
            } else if (whoGoesFirstSetting === 'loser' && previousGameExists && lastWinner !== null) {
                startingPlayer = (lastWinner === gameP1Icon) ? gameP2Icon : gameP1Icon;
            } else { // Default to P1 (gameP1Icon)
                startingPlayer = gameP1Icon;
            }
            currentPlayer = startingPlayer;
            statusDiv.textContent = `Turno del ${getPlayerName(currentPlayer)}`;

            if (vsCPU && currentPlayer === gameP2Icon) { // If CPU (gameP2Icon) starts
                setBoardClickable(false);
                setTimeout(() => { if(gameActive) cpuMove(); if(gameActive) setBoardClickable(true); }, 700 + Math.random() * 300);
            } else { // Player starts (vs CPU) or Local PvP turn
                setBoardClickable(true);
            }
        }

        cells.forEach(c=>{c.querySelector('span').textContent='';c.classList.remove('rainbow','disabled');});
        statusDiv.classList.remove('highlight','highlight-draw-flash');
        gameBoardEl.classList.remove('highlight-draw-border');
        gameBoardEl.style.borderColor='';gameBoardEl.style.boxShadow='';

        updateAllUIToggleButtons();
        updateScoreboard();
        // Play sound only if game is truly starting and not just waiting for remote pairing
        if(gameActive && !(pvpRemoteActive && !gamePaired)) {
            playSound('reset');
        }
        sideMenu.classList.remove('open');
    }

    function makeMove(index, playerSymbolToPlace){
        if (board[index] !== null || !gameActive) return false;
        board[index] = playerSymbolToPlace;
        cells[index].querySelector('span').textContent = playerSymbolToPlace;
        cells[index].classList.add('disabled');
        cells[index].style.animation='cellSelectAnim .3s ease';
        setTimeout(()=>cells[index].style.animation='',300);
        playSound('move');
        return true;
    }

    function handleRemoteMoveDetected(index) {
        hideOverlay();
        if (typeof index !== 'number' || index < 0 || index > 8 || !gameActive) return;
        // Move is from opponent, so use opponentEffectiveIcon
        if (!makeMove(index, opponentEffectiveIcon)) return;

        const win = checkWin(opponentEffectiveIcon);
        if (win) { endGame(opponentEffectiveIcon, win); return; }
        if (checkDraw()) { endDraw(); return; }

        currentPlayer = myEffectiveIcon; // My turn now
        isMyTurnInRemote = true;
        statusDiv.textContent = `Tu Turno ${getPlayerName(currentPlayer)}`;
        setBoardClickable(true);
    }

    function handleCellClick(e){
        const idx = +e.currentTarget.dataset.index;
        if (!gameActive || board[idx] !== null ) return;

        // If it's remote play and not my turn, or if it's CPU's turn, do nothing.
        if ( (pvpRemoteActive && !isMyTurnInRemote) || (vsCPU && currentPlayer === gameP2Icon /* CPU's icon */ ) ) {
            return;
        }

        // If it's my turn (either local, vs CPU, or remote), the icon to place is currentPlayer.
        // **MODIFIED LINE BELOW**
        if (!makeMove(idx, currentPlayer)) return;

        // If remote play and it was my turn, send the move.
        if (pvpRemoteActive && gamePaired) { // isMyTurnInRemote was true to get here
            window.peerJsMultiplayer?.send({ type: 'move', index: idx });
        }

        const win = checkWin(currentPlayer); // Check win for the player who just moved
        if(win){ endGame(currentPlayer,win); return; }
        if(checkDraw()){ endDraw(); return; }

        switchPlayer(); // Determine next player

        // Update UI for next turn
        if (pvpRemoteActive && gamePaired) { // After my move, it's opponent's turn
            isMyTurnInRemote = false;
            statusDiv.textContent = `Esperando a ${getPlayerName(currentPlayer)}...`; // currentPlayer is now opponent's icon
            setBoardClickable(false);
        } else if(vsCPU && currentPlayer === gameP2Icon){ // CPU's turn
            statusDiv.textContent = `Turno del ${getPlayerName(currentPlayer)}`;
            setBoardClickable(false);
            setTimeout(()=>{ if(gameActive) cpuMove(); if(gameActive) setBoardClickable(true);},700+Math.random()*300);
        } else { // Local PvP turn switch, or Player's turn (vs CPU) after CPU moved
            statusDiv.textContent = `Turno del ${getPlayerName(currentPlayer)}`;
            // Ensure board is clickable for local PvP next turn
            setBoardClickable(true);
        }
    }

    function cpuMove(){
        if(!gameActive || !vsCPU) return;
        // CPU uses gameP2Icon (which is opponentEffectiveIcon in vs CPU mode)
        let idx = bestMove(gameP2Icon, gameP1Icon); // cpu icon, human icon
        if(idx === null || board[idx]!==null) idx=randomMove(gameP2Icon); // Fallback
        if(idx===null){ if(checkDraw()) endDraw(); return; } // No moves left

        makeMove(idx, gameP2Icon); // CPU places its icon
        const win=checkWin(gameP2Icon);
        if(win){ endGame(gameP2Icon,win); return; }
        if(checkDraw()){ endDraw(); return; }
        switchPlayer(); // Switches to player's turn (currentPlayer becomes gameP1Icon/myEffectiveIcon)
        statusDiv.textContent = `Turno del ${getPlayerName(currentPlayer)}`;
    }

    function randomMove(playerIcon){const a=board.map((v,i)=>v===null?i:null).filter(v=>v!==null); return a.length? a[Math.floor(Math.random()*a.length)] : null; }
    function bestMove(cpuIconToPlace, humanIconToBlock){ // cpu is 'me' for this function, human is 'opponent'
        // Check for winning move
        for(let i=0;i<9;i++)if(!board[i]){board[i]=cpuIconToPlace;if(checkWin(cpuIconToPlace,board)){board[i]=null;return i;}board[i]=null;}
        // Check for blocking move
        for(let i=0;i<9;i++)if(!board[i]){board[i]=humanIconToBlock;if(checkWin(humanIconToBlock,board)){board[i]=null;return i;}board[i]=null;}
        if(board[4]===null) return 4; // Take center
        const corners=[0,2,6,8].filter(i=>board[i]===null); if(corners.length) return corners[Math.floor(Math.random()*corners.length)]; // Take corner
        return randomMove(cpuIconToPlace); // Take random available
    }

    function checkWin(playerSymbol, currentBoard = board){ const c=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]; return c.find(combo=>combo.every(i=>currentBoard[i]===playerSymbol))||null;}
    function checkDraw(currentBoard = board){ // Uses gameP1Icon and gameP2Icon for current match configuration
        return currentBoard.every(cell=>cell!==null) && !checkWin(gameP1Icon, currentBoard) && !checkWin(gameP2Icon, currentBoard);
    }

    function endGame(winnerSymbol, winningCells){
        gameActive=false; setBoardClickable(false); launchConfetti(); playSound('win');
        winningCells.forEach(i=>cells[i].classList.add('rainbow'));
        statusDiv.textContent = `${getPlayerName(winnerSymbol)} GANA!`; statusDiv.classList.add('highlight');
        lastWinner = winnerSymbol; previousGameExists = true;

        // Determine who the winnerSymbol corresponds to for score update
        if (pvpRemoteActive || vsCPU) { // For remote or CPU games
             if(winnerSymbol === myEffectiveIcon) myWins++;
             else if (winnerSymbol === opponentEffectiveIcon) opponentWins++;
        } else { // For local PvP games
            if (winnerSymbol === gameP1Icon) myWins++; // P1 on board is effectively "my" score slot
            else if (winnerSymbol === gameP2Icon) opponentWins++; // P2 on board is effectively "opponent" score slot
        }


        localStorage.setItem('myWinsTateti',myWins); localStorage.setItem('opponentWinsTateti',opponentWins);
        updateScoreboard();

        const delay = AUTO_RESTART_DELAY_WIN;
        if (pvpRemoteActive && gamePaired) {
            showOverlay(`${getPlayerName(winnerSymbol)} GANA! Nueva partida en ${delay / 1000}s...`);
            setTimeout(init, delay); // AUTOMATIC RESTART for remote games
        } else { // Local or CPU games
            setTimeout(init, delay);
        }
    }
    function endDraw(){
        gameActive=false; setBoardClickable(false); playDrawAnimation(); playSound('draw');
        statusDiv.textContent="¡EMPATE!"; draws++; lastWinner=null; previousGameExists=true;
        localStorage.setItem('drawsTateti',draws); updateScoreboard();

        const delay = AUTO_RESTART_DELAY_DRAW;
        if (pvpRemoteActive && gamePaired) {
            showOverlay(`¡EMPATE! Nueva partida en ${delay / 1000}s...`);
            setTimeout(init, delay); // AUTOMATIC RESTART for remote games
        } else { // Local or CPU games
            setTimeout(init, delay);
        }
    }

    function switchPlayer(){
        // Switches currentPlayer between the two icons active in the current game (gameP1Icon and gameP2Icon)
        currentPlayer = (currentPlayer === gameP1Icon) ? gameP2Icon : gameP1Icon;
    }

    function updateScoreboard(){
        // Ensure effective icons are determined, especially if this is called early
        if (!myEffectiveIcon || (!opponentEffectiveIcon && (vsCPU || pvpRemoteActive))) {
             determineEffectiveIcons();
        }

        // Scoreboard consistently shows "my" info first, then "opponent's" info
        let myDisplayName = getPlayerName(myEffectiveIcon); // This is always "me" the user of the device
        let opponentDisplayName;

        if (pvpRemoteActive) {
            opponentDisplayName = getPlayerName(opponentEffectiveIcon); // The remote opponent
        } else if (vsCPU) {
            opponentDisplayName = getPlayerName(opponentEffectiveIcon); // The CPU
        } else { // Local PvP
            // We need to show Player 1 (gameP1Icon) and Player 2 (gameP2Icon) on the scoreboard
            // If myEffectiveIcon is gameP1Icon, then "my" score is P1's, and "opponent" is P2's
            // If myEffectiveIcon is gameP2Icon (e.g. P2 selected it), then "my" score is P2's, and "opponent" is P1's
            // This gets a bit complex. For local PvP, it's simpler to just display based on gameP1Icon and gameP2Icon directly.
            // Let's assume "my" score display always corresponds to gameP1Icon, and "opponent" to gameP2Icon for local.
            myDisplayName = getPlayerName(gameP1Icon); // Player 1 on the board
            opponentDisplayName = getPlayerName(gameP2Icon); // Player 2 on the board
        }


        const resultsDiv = document.getElementById('results');
        if (resultsDiv) {
            // myWins and opponentWins are always from the perspective of the device user vs "other".
            // For local PvP, we need to decide if myWins/opponentWins should map to P1/P2 or stay as user-centric.
            // The current endGame logic for local PvP maps gameP1Icon win to myWins, gameP2Icon win to opponentWins.
            // So, this display should be consistent with that.
            resultsDiv.innerHTML = `${myDisplayName} <span id="myWinsSpan">${myWins}</span> – ${opponentDisplayName} <span id="opponentWinsSpan">${opponentWins}</span> – 🤝 <span id="drawsSpan">${draws}</span>`;
        }
    }

    function playSound(type){ if(!soundEnabled)return;const ctx=getAudioContext();if(!ctx)return; const o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination); if(type==='move'){o.type='sine';o.frequency.setValueAtTime(200,ctx.currentTime);g.gain.setValueAtTime(.3,ctx.currentTime);o.frequency.exponentialRampToValueAtTime(300,ctx.currentTime+.1);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.1)} else if(type==='win'){o.type='triangle';o.frequency.setValueAtTime(300,ctx.currentTime);g.gain.setValueAtTime(.3,ctx.currentTime);o.frequency.exponentialRampToValueAtTime(600,ctx.currentTime+.3);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.3)} else if(type==='draw'){o.type='sawtooth';o.frequency.setValueAtTime(200,ctx.currentTime);g.gain.setValueAtTime(.2,ctx.currentTime);o.frequency.exponentialRampToValueAtTime(100,ctx.currentTime+.3);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.3)} else if(type==='reset'){o.type='square';o.frequency.setValueAtTime(150,ctx.currentTime);g.gain.setValueAtTime(.2,ctx.currentTime);o.frequency.exponentialRampToValueAtTime(80,ctx.currentTime+.2);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.2)} o.start(ctx.currentTime);o.stop(ctx.currentTime+.5); }
    function toggleTheme(){document.body.classList.toggle('dark-theme');localStorage.setItem('darkTheme',document.body.classList.contains('dark-theme'));updateAllUIToggleButtons();playSound('move')}
    function toggleSound(){soundEnabled=!soundEnabled;localStorage.setItem('soundDisabled',!soundEnabled);updateAllUIToggleButtons();if(soundEnabled)playSound('reset')}
    function changeSymbolsBtnHandler(){
        currentSymbolIndex=(currentSymbolIndex+1)%symbolSet.length;localStorage.setItem('currentSymbolIndex',currentSymbolIndex);
        currentSymbols=symbolSet[currentSymbolIndex];
        // If player had not chosen an icon, their effective icon might change.
        // If they had chosen one, it remains.
        if (!localStorage.getItem('tatetiPlayerIcon')) { // If icon was default
            myPlayerIcon = null; // Let determineEffectiveIcons pick new default
        }
        playSound('move');
        populateIconSelection(); // Update icon choices if needed (though symbolSet itself isn't changing here)
        init(); // Re-initialize game, which will redetermine effective icons.
    }
    if(changeSymbolsBtn) changeSymbolsBtn.addEventListener('click',changeSymbolsBtnHandler);

    function checkUrlForRoomAndJoin() {
        const urlParams = new URLSearchParams(window.location.search);
        const roomId = urlParams.get('room');
        if (roomId) {
            console.log("GAME.JS: Room ID found in URL:", roomId);
            handleJoinGame(roomId); // Attempt to join this room
            window.history.replaceState({}, document.title, window.location.pathname); // Clean URL
        } else {
            init(); // Standard initialization if no room ID
        }
    }

    /* ----------  EVENT LISTENERS  ---------- */
    cells.forEach(c=>{c.addEventListener('click',handleCellClick);c.setAttribute('tabindex','0');c.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();c.click();}});});
    const restartBtn = document.getElementById('restartBtn'); // Hidden, but referenced
    if(restartBtn) restartBtn.addEventListener('click', () => { // For potential future use or if icon triggers it
        if (pvpRemoteActive && gamePaired && window.peerJsMultiplayer && typeof window.peerJsMultiplayer.send === "function") {
            window.peerJsMultiplayer.send({ type: 'restart_request' });
            showOverlay("Solicitud de reinicio enviada...");
        } else { // Local or CPU game, or remote not paired
            init();
        }
    });
    restartIcon.addEventListener('click', () => { // Visible restart button
        if (pvpRemoteActive && gamePaired && window.peerJsMultiplayer && typeof window.peerJsMultiplayer.send === "function") {
            // For manual restart during a remote game, send a request
            window.peerJsMultiplayer.send({ type: 'restart_request' });
            showOverlay("Solicitud de reinicio enviada...");
        } else { // For local/CPU games, or if remote not paired, just restart locally immediately
             stopAnyGameInProgress(); // Ensure clean state
             init();
        }
        if (sideMenu.classList.contains('open')) sideMenu.classList.remove('open');
    });

    pvpLocalBtn.addEventListener('click',()=>{ stopAnyGameInProgress(); vsCPU=false; pvpRemoteActive = false; init(); });
    if (hostGameBtn) hostGameBtn.addEventListener('click', handleHostGame);
    if (joinGameBtn) joinGameBtn.addEventListener('click', () => handleJoinGame()); // Prompts for ID
    cpuBtn.addEventListener('click',()=>{ stopAnyGameInProgress(); vsCPU=true; pvpRemoteActive = false; init(); });

    [easyBtn,mediumBtn,hardBtn].forEach(btn=>btn?.addEventListener('click',e=>{ difficulty=e.target.id.replace('Btn',''); updateAllUIToggleButtons(); playSound('move'); if(!gameActive || vsCPU || (gameActive && board.every(c=>c===null)) ) init(); }));
    [player1StartsBtn,randomStartsBtn,loserStartsBtn].forEach(btn=>btn?.addEventListener('click',e=>{ whoGoesFirstSetting=e.target.id.replace('StartsBtn',''); localStorage.setItem('whoGoesFirstSetting',whoGoesFirstSetting); updateAllUIToggleButtons(); playSound('move'); if(!gameActive || board.every(c=>c===null)) init(); }));

    themeToggle.addEventListener('click',toggleTheme);
    soundToggle.addEventListener('click',toggleSound);
    document.addEventListener('click', initAudioOnInteraction, { once: true });
    document.addEventListener('dblclick',e=>e.preventDefault(),{passive:false});

    /* ----------  INICIALIZACIÓN  ---------- */
    if(localStorage.getItem('darkTheme')==='true') document.body.classList.add('dark-theme');
    loadPlayerPreferences();    // Load custom name/icon first
    // init() will be called by checkUrlForRoomAndJoin(), which also calls determineEffectiveIcons()
    checkUrlForRoomAndJoin();
});

/* ----------  PWA bootstrap  ---------- */
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    if (location.protocol === 'http:' || location.protocol === 'https:') { // Ensure it's http/https
        navigator.serviceWorker.register('./sw.js')
          .then(reg => console.log('SW registered!', reg))
          .catch(err=>console.error('SW registration failed:',err));
    } else {
        console.warn('Service Worker not registered. (Requires HTTP/HTTPS or localhost)');
    }
  });
}