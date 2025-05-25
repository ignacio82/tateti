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
    // const unicornSpan       = document.getElementById('unicornWins'); // Referenced in updateScoreboard
    // const heartSpan         = document.getElementById('heartWins');   // Referenced in updateScoreboard
    // const drawsSpan         = document.getElementById('draws');       // Referenced in updateScoreboard
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

    // QR Code related DOM Elements
    const qrDisplayArea     = document.getElementById('qr-display-area');
    const qrCodeCanvas      = document.getElementById('qr-code-canvas');
    const qrTextData        = document.getElementById('qr-text-data');
    const qrTitle           = document.getElementById('qr-title');

    // Player Customization DOM Elements
    const playerNameInput   = document.getElementById('playerNameInput');
    const iconSelectionDiv  = document.getElementById('iconSelection');
    const savePlayerPrefsBtn = document.getElementById('savePlayerPrefsBtn');

    // Ensure showOverlay and hideOverlay are defined globally or passed if they come from main.js (which isn't loaded in index.html)
    // For now, using the provided fallback/definitions from game.js
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
    let iAmPlayer1InRemote = true; // True if host, false if joiner
    let gamePaired = false; // True if PeerJS connection is established
    let currentHostPeerId = null; // Stores the ID of the host when joining/hosting

    // Player Preferences
    let myPlayerName = localStorage.getItem('tatetiPlayerName') || 'Jugador';
    let myPlayerIcon = localStorage.getItem('tatetiPlayerIcon') || null;

    // Opponent's preferences (for multiplayer)
    let opponentPlayerName = 'Oponente';
    let opponentPlayerIcon = null;


    let soundEnabled = !(localStorage.getItem('soundDisabled') === 'true');
    const symbolSet = [
        {player1:'🦄',player2:'❤️', nameP1: 'Unicornio', nameP2: 'Corazón'},
        {player1:'🐱',player2:'🐶', nameP1: 'Gatito', nameP2: 'Perrito'},
        {player1:'🌞',player2:'🌙', nameP1: 'Sol', nameP2: 'Luna'},
        {player1:'❌',player2:'⭕', nameP1: 'Equis', nameP2: 'Círculo'}
    ];
    let currentSymbolIndex = +(localStorage.getItem('currentSymbolIndex') || 0);
    let currentSymbols = symbolSet[currentSymbolIndex];

    let unicornWins = +localStorage.getItem('unicornWins') || 0;
    let heartWins   = +localStorage.getItem('heartWins') || 0;
    let draws       = +localStorage.getItem('draws') || 0;
    let whoGoesFirstSetting = localStorage.getItem('whoGoesFirstSetting') || 'player1';
    let lastWinner = null;
    let previousGameExists = (unicornWins + heartWins + draws) > 0;
    const AUTO_RESTART_DELAY_WIN = 5000;
    const AUTO_RESTART_DELAY_DRAW = 3000;

    /* ---------- PLAYER CUSTOMIZATION LOGIC ---------- */
    function populateIconSelection() {
        if (!iconSelectionDiv) return;
        iconSelectionDiv.innerHTML = '';
        const uniqueIcons = new Set();
        symbolSet.forEach(pair => {
            uniqueIcons.add(pair.player1);
            uniqueIcons.add(pair.player2);
        });

        uniqueIcons.forEach(icon => {
            const button = document.createElement('button');
            button.classList.add('icon-choice-btn', 'std');
            button.textContent = icon;
            button.dataset.icon = icon;
            if (icon === myPlayerIcon) {
                button.classList.add('active');
            }
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
        myPlayerIcon = localStorage.getItem('tatetiPlayerIcon') || symbolSet[currentSymbolIndex].player1;
        if (playerNameInput) {
            playerNameInput.value = myPlayerName;
        }
        populateIconSelection();
    }

    if (savePlayerPrefsBtn) {
        savePlayerPrefsBtn.addEventListener('click', () => {
            if (playerNameInput) {
                myPlayerName = playerNameInput.value.trim() || 'Jugador';
                localStorage.setItem('tatetiPlayerName', myPlayerName);
            }
            if (myPlayerIcon) {
                localStorage.setItem('tatetiPlayerIcon', myPlayerIcon);
            }
            alert("Preferencias guardadas!"); // Consider a less obtrusive notification
            sideMenu.classList.remove('open');
            if (!gameActive) {
                updateScoreboard();
                statusDiv.textContent = `Turno del ${getPlayerName(myPlayerIcon || currentSymbols.player1)}`;
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
        if (sym === myPlayerIcon && (!pvpRemoteActive || (pvpRemoteActive && iAmPlayer1InRemote))) return `${myPlayerName} (${sym})`;
        if (sym === opponentPlayerIcon && pvpRemoteActive) return `${opponentPlayerName} (${sym})`;
        // Fallback to default names from symbolSet if customized names/icons aren't directly matching
        for (const set of symbolSet) {
            if (sym === set.player1) return `${set.nameP1} (${sym})`;
            if (sym === set.player2) return `${set.nameP2} (${sym})`;
        }
        return `Jugador (${sym})`;
    }
    
    function updateAllUIToggleButtons() {
        [pvpLocalBtn, hostGameBtn, joinGameBtn, cpuBtn].forEach(btn => btn?.classList.remove('active'));
        if (pvpRemoteActive) {
            if (iAmPlayer1InRemote && hostGameBtn) hostGameBtn.classList.add('active');
            else if (!iAmPlayer1InRemote && joinGameBtn) joinGameBtn.classList.add('active');
        } else if (vsCPU && cpuBtn) {
            cpuBtn.classList.add('active');
        } else if (pvpLocalBtn) { // Default to local PvP if no other mode active
            pvpLocalBtn.classList.add('active');
        }

        if (difficultyDiv) difficultyDiv.style.display = vsCPU ? 'flex' : 'none';
        [easyBtn, mediumBtn, hardBtn].forEach(btn => btn?.classList.remove('active'));
        if (vsCPU) {
            if (difficulty === 'easy' && easyBtn) easyBtn.classList.add('active');
            else if (difficulty === 'hard' && hardBtn) hardBtn.classList.add('active');
            else if (mediumBtn) mediumBtn.classList.add('active'); // Default to medium
        }

        [player1StartsBtn, randomStartsBtn, loserStartsBtn].forEach(btn => btn?.classList.remove('active'));
        const startSettingMap = { 'player1': player1StartsBtn, 'random': randomStartsBtn, 'loser': loserStartsBtn };
        if (startSettingMap[whoGoesFirstSetting]) startSettingMap[whoGoesFirstSetting].classList.add('active');
        else if (player1StartsBtn) player1StartsBtn.classList.add('active'); // Default

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
        vsCPU = false; // Reset this flag too
        currentHostPeerId = null;


        hideOverlay();
        if (qrDisplayArea) qrDisplayArea.style.display = 'none';

        // Deactivate all mode buttons; the new mode's handler or init() will activate the correct one.
        if (hostGameBtn) hostGameBtn.classList.remove('active');
        if (joinGameBtn) joinGameBtn.classList.remove('active');
        if (pvpLocalBtn) pvpLocalBtn.classList.remove('active');
        if (cpuBtn) cpuBtn.classList.remove('active');
        if (difficultyDiv) difficultyDiv.style.display = 'none';

        console.log("GAME.JS: Game progress stopped and state reset.");
    }


    const peerJsCallbacks = {
        onPeerOpen: (id) => {
            if (pvpRemoteActive && iAmPlayer1InRemote) { // Host specific logic
                console.log("GAME.JS: Host Peer ID:", id);
                currentHostPeerId = id; 
                const gameLinkBase = window.location.origin + window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
                const gameLink = `${gameLinkBase}?room=${id}`;

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
                        if (qrDisplayArea) qrDisplayArea.style.display = 'none';
                        statusDiv.textContent = `Error al generar QR. ID: ${id}`;
                    }
                } else {
                     if (qrTextData) qrTextData.value = id;
                     if (qrTitle) qrTitle.textContent = "Tu ID de Host (sin QR):";
                     if (qrDisplayArea) qrDisplayArea.style.display = 'block';
                     console.warn("GAME.JS: QRious library not found or qrCodeCanvas not available.");
                }
            } else if (pvpRemoteActive && !iAmPlayer1InRemote) { // Joiner specific logic after their peer opens
                 console.log("GAME.JS (Joiner): My Peer ID is " + id + ". Attempting to connect to Host: " + currentHostPeerId);
                 if (currentHostPeerId) { 
                    window.peerJsMultiplayer.connect(currentHostPeerId);
                 } else {
                    console.error("GAME.JS (Joiner): Host ID not set. Cannot connect.");
                    peerJsCallbacks.onError({type: 'connect_failed', message: "ID del Host no especificado para unirse."});
                 }
            }
        },
        onNewConnection: (conn) => { // Host receives a connection
            console.log("GAME.JS: PeerJS new connection received by Host:", conn);
            showOverlay("Jugador 2 conectándose...");
            statusDiv.textContent = "Jugador 2 está conectándose...";
        },
        onConnectionOpen: () => {
            console.log("GAME.JS: PeerJS connection abierta!");
            gamePaired = true;
            hideOverlay();
            if (qrDisplayArea) qrDisplayArea.style.display = 'none';

            if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.send === "function") {
                window.peerJsMultiplayer.send({
                    type: 'player_info',
                    name: myPlayerName,
                    icon: myPlayerIcon || (iAmPlayer1InRemote ? currentSymbols.player1 : currentSymbols.player2)
                });
            }
            statusDiv.textContent = "¡Conectado! Iniciando partida...";
            playSound('win');
            init(); 
        },
        onDataReceived: (data) => {
            console.log("GAME.JS: Data received via PeerJS:", data);
            if(data.type === 'player_info') {
                opponentPlayerName = data.name || 'Oponente';
                opponentPlayerIcon = data.icon || (iAmPlayer1InRemote ? currentSymbols.player2 : currentSymbols.player1);
                console.log("GAME.JS: Opponent info received:", opponentPlayerName, opponentPlayerIcon);
                updateScoreboard();
                if (gameActive && !isMyTurnInRemote) {
                    statusDiv.textContent = `Esperando a ${getPlayerName(currentPlayer)}...`;
                } else if (gameActive && isMyTurnInRemote) {
                    statusDiv.textContent = `Tu Turno ${getPlayerName(currentPlayer)}`;
                }
                return;
            }

            if (!gameActive || !pvpRemoteActive || (pvpRemoteActive && isMyTurnInRemote) || !gamePaired) {
                 console.warn("GAME.JS: Received data but not expecting it (e.g. it's my turn or game not active/paired).", {isMyTurnInRemote, gameActive, pvpRemoteActive, gamePaired, receivedDataType: data.type});
                 return;
            }
            if (data.type === 'move' && typeof data.index === 'number') {
                handleRemoteMoveDetected(data.index);
            } else if (data.type === 'restart_request') {
                console.log("GAME.JS: Received restart request.");
                showOverlay(`${getPlayerName(opponentPlayerIcon || (iAmPlayer1InRemote ? currentSymbols.player2 : currentSymbols.player1))} quiere reiniciar.`);
                if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.send === "function") {
                    window.peerJsMultiplayer.send({ type: 'restart_ack' });
                }
                setTimeout(() => { hideOverlay(); init();}, 2000); // Auto-accept and restart
            } else if (data.type === 'restart_ack') {
                console.log("GAME.JS: Received restart acknowledgement.");
                showOverlay("Reinicio aceptado. Nueva partida.");
                 setTimeout(() => { hideOverlay(); init();}, 1500);
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
            // init(); // Could reset to local PvP
        },
        onError: (err) => {
            console.error("GAME.JS: PeerJS Error received:", err);
            let userMessage = "Error de conexión PeerJS. ";
            if (typeof err === 'object' && err !== null) {
                if (err.type) {
                    switch (err.type) {
                        case 'network': userMessage += "Problema de red. Verifica tu conexión a internet."; break;
                        case 'unavailable-id': userMessage += `El ID de sala ya está en uso. Intenta de nuevo.`; break;
                        case 'peer-unavailable': userMessage += `No se pudo conectar al otro jugador. Verifica el ID e inténtalo de nuevo.`; break;
                        case 'server-error': userMessage += "Error del servidor de conexión. Intenta más tarde."; break;
                        case 'socket-error': userMessage += "Error de comunicación. Verifica tu conexión e intenta de nuevo."; break;
                        case 'webrtc': userMessage += "Error de WebRTC. Tu navegador podría no ser compatible o estar bloqueando la conexión."; break;
                        case 'browser-incompatible': userMessage += "Tu navegador no es compatible con PeerJS."; break;
                        case 'disconnected': userMessage += "Desconectado del servidor PeerJS. Reintentando..."; break;
                        case 'init_failed': userMessage += "No se pudo inicializar el módulo PeerJS."; break;
                        case 'not_initialized': userMessage += "PeerJS no está inicializado."; break;
                        case 'connect_failed': userMessage += "Falló al intentar conectar al Host."; break;
                        case 'connect_exception': userMessage += "Excepción al conectar al Host."; break;
                        case 'send_error': userMessage += "Error al enviar datos al oponente."; break;
                        case 'send_error_no_connection': userMessage += "No hay conexión para enviar datos."; break;
                        default: userMessage += (err.message || "Error desconocido. Revisa la consola para más detalles.");
                    }
                } else if (err.message) {
                    userMessage += err.message;
                } else {
                    userMessage += "Error desconocido. Revisa la consola.";
                }
            } else {
                 userMessage += "Error desconocido o no especificado. Revisa la consola.";
            }

            showOverlay(userMessage);
            statusDiv.textContent = "Error de conexión.";
            console.error("Full PeerJS error object for debugging:", err);

            if (pvpRemoteActive) {
                if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.close === "function") {
                    window.peerJsMultiplayer.close();
                }
                pvpRemoteActive = false;
                gamePaired = false;
                if (hostGameBtn) hostGameBtn.classList.remove('active');
                if (joinGameBtn) joinGameBtn.classList.remove('active');
            }
        }
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
            peerJsCallbacks.onError({type: 'init_failed', message: 'Módulo multijugador (PeerJS) no encontrado o función init ausente.'});
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
            // init(); // Optionally reset to default
            return;
        }
        currentHostPeerId = hostIdInput.trim();

        showOverlay(`Conectando al Host ID: ${currentHostPeerId}...`);
        statusDiv.textContent = `Intentando conectar a ${currentHostPeerId}...`;

        if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.init === "function" && typeof window.peerJsMultiplayer.connect === "function") {
            window.peerJsMultiplayer.init(null, peerJsCallbacks);
        } else {
            console.error("GAME.JS: PeerJS multiplayer module not found or init/connect function missing.");
            peerJsCallbacks.onError({type: 'init_failed', message: 'Módulo multijugador (PeerJS) no encontrado o funciones init/connect ausentes.'});
        }
    }
    
    function init(){
        removeConfetti();
        hideOverlay();
        if(qrDisplayArea) qrDisplayArea.style.display = 'none';

        const isHostBtnActive = hostGameBtn && hostGameBtn.classList.contains('active');
        const isJoinBtnActive = joinGameBtn && joinGameBtn.classList.contains('active');

        // If init is called and we are NOT actively trying to host or join, ensure pvpRemote is off.
        if (!isHostBtnActive && !isJoinBtnActive) {
            if (pvpRemoteActive && window.peerJsMultiplayer && typeof window.peerJsMultiplayer.close === "function") {
                 window.peerJsMultiplayer.close();
            }
            pvpRemoteActive = false; // Reset if not in a remote setup process
            gamePaired = false;
        }

        board = Array(9).fill(null);
        difficulty = easyBtn.classList.contains('active')?'easy':hardBtn.classList.contains('active')?'hard':'medium';
        gameActive = false; // Will be set to true below if conditions met

        // Determine P1 and P2 icons based on mode and customization
        let p1Icon, p2Icon;

        if (pvpRemoteActive && gamePaired) {
            p1Icon = iAmPlayer1InRemote ? (myPlayerIcon || currentSymbols.player1) : (opponentPlayerIcon || currentSymbols.player2);
            p2Icon = iAmPlayer1InRemote ? (opponentPlayerIcon || currentSymbols.player2) : (myPlayerIcon || currentSymbols.player1);
            currentPlayer = iAmPlayer1InRemote ? p1Icon : p2Icon; // Host (P1) or Joiner (P2) starts based on role
            isMyTurnInRemote = iAmPlayer1InRemote; // Host starts or joiner waits.
            statusDiv.textContent = isMyTurnInRemote ? `Tu Turno ${getPlayerName(currentPlayer)}` : `Esperando a ${getPlayerName(currentPlayer)}...`;
            setBoardClickable(isMyTurnInRemote);
            gameActive = true;
        } else if (pvpRemoteActive && !gamePaired) {
            // Waiting for connection, board not active yet
            statusDiv.textContent = iAmPlayer1InRemote ? "Host: Compartiendo ID..." : "Join: Ingresa ID del Host...";
            setBoardClickable(false);
            gameActive = false; // Game not truly active until paired
        } else if (vsCPU) {
            p1Icon = myPlayerIcon || currentSymbols.player1;
            p2Icon = currentSymbols.player2; // CPU uses default P2 of the set
            gameActive = true;
            let startingPlayer;
            switch(whoGoesFirstSetting){
                case 'random': startingPlayer = Math.random() < 0.5 ? p1Icon : p2Icon; break;
                case 'loser': startingPlayer = (!previousGameExists || lastWinner === null) ? p1Icon : (lastWinner === p1Icon ? p2Icon : p1Icon); break;
                default: startingPlayer = p1Icon;
            }
            currentPlayer = startingPlayer;
            statusDiv.textContent = `Turno del ${getPlayerName(currentPlayer)}`;
            if(currentPlayer === p2Icon){
                setBoardClickable(false);
                setTimeout(() => { if(gameActive) cpuMove(); if(gameActive) setBoardClickable(true); }, 700 + Math.random() * 300);
            } else { setBoardClickable(true); }
        } else { // Local PvP
            p1Icon = myPlayerIcon || currentSymbols.player1;
            // For local P2, if P1 chose P2's default icon, P2 takes P1's default. Otherwise P2 takes default P2.
            if (p1Icon === currentSymbols.player2) {
                p2Icon = currentSymbols.player1;
            } else {
                p2Icon = currentSymbols.player2;
            }
            gameActive = true;
            let startingPlayer;
             switch(whoGoesFirstSetting){
                case 'random': startingPlayer = Math.random() < 0.5 ? p1Icon : p2Icon; break;
                case 'loser': startingPlayer = (!previousGameExists || lastWinner === null) ? p1Icon : (lastWinner === p1Icon ? p2Icon : p1Icon); break;
                default: startingPlayer = p1Icon;
            }
            currentPlayer = startingPlayer;
            statusDiv.textContent = `Turno del ${getPlayerName(currentPlayer)}`;
            setBoardClickable(true);
        }

        cells.forEach(c=>{c.querySelector('span').textContent='';c.classList.remove('rainbow','disabled');});
        statusDiv.classList.remove('highlight','highlight-draw-flash');
        gameBoardEl.classList.remove('highlight-draw-border');
        gameBoardEl.style.borderColor='';gameBoardEl.style.boxShadow='';

        updateAllUIToggleButtons(); // Reflects current game mode and settings
        updateScoreboard();
        // Play sound only if game is starting and not waiting for remote player
        if(gameActive && !(pvpRemoteActive && !isMyTurnInRemote && gamePaired) && !(pvpRemoteActive && !gamePaired)) {
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

        // When a remote move is detected, currentPlayer should represent the icon of the opponent
        let remotePlayerActualIcon = opponentPlayerIcon || (iAmPlayer1InRemote ? currentSymbols.player2 : currentSymbols.player1);

        if (!makeMove(index, remotePlayerActualIcon)) {
            console.error("GAME.JS: Failed to make remote move on board for icon:", remotePlayerActualIcon);
            return;
        }
        const win = checkWin(remotePlayerActualIcon);
        if (win) { endGame(remotePlayerActualIcon, win); return; }
        if (checkDraw()) { endDraw(); return; }

        // It's now the local player's turn. Update currentPlayer to local player's icon.
        currentPlayer = myPlayerIcon || (iAmPlayer1InRemote ? currentSymbols.player1 : currentSymbols.player2);
        isMyTurnInRemote = true;
        statusDiv.textContent = `Tu Turno ${getPlayerName(currentPlayer)}`;
        setBoardClickable(true);
    }

    function handleCellClick(e){
        const idx = +e.currentTarget.dataset.index;
        if (!gameActive || board[idx] !== null ) return;

        if (pvpRemoteActive && (!gamePaired || !isMyTurnInRemote)) {
            console.log("GAME.JS: Cell clicked but not local player's turn or game not paired in remote PvP.");
            return;
        }

        // Determine the icon to place based on current player and mode
        let iconToPlace = currentPlayer; // This should be the current player's icon
        if (pvpRemoteActive && gamePaired) {
             // For remote games, the local player making a move uses their chosen icon
             iconToPlace = myPlayerIcon || (iAmPlayer1InRemote ? currentSymbols.player1 : currentSymbols.player2);
        } else if (vsCPU) {
            // Player's turn against CPU, use their chosen icon or default P1
            iconToPlace = myPlayerIcon || currentSymbols.player1;
        } else { // Local PvP
            // currentPlayer already correctly holds P1 or P2's icon for local PvP
        }


        if (!makeMove(idx, iconToPlace)) return;

        if (pvpRemoteActive && gamePaired && isMyTurnInRemote) {
            if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.send === "function") {
                window.peerJsMultiplayer.send({ type: 'move', index: idx });
            } else {
                console.error("GAME.JS: PeerJS multiplayer module not available to send move.");
                peerJsCallbacks.onError({type: 'send_error_no_connection', message: 'No se pudo enviar el movimiento.'});
            }
        }

        const win = checkWin(iconToPlace);
        if(win){ endGame(iconToPlace,win); return; }
        if(checkDraw()){ endDraw(); return; }

        switchPlayer(); // Switches currentPlayer to the *other* player's icon

        if (pvpRemoteActive && gamePaired) {
            isMyTurnInRemote = false;
            statusDiv.textContent = `Esperando a ${getPlayerName(currentPlayer)}...`; // currentPlayer is now opponent
            setBoardClickable(false);
        } else if(vsCPU && currentPlayer === (currentSymbols.player2)){ // CPU's turn
            statusDiv.textContent = `Turno del ${getPlayerName(currentPlayer)}`;
            setBoardClickable(false);
            setTimeout(()=>{ if(gameActive) cpuMove(); if(gameActive) setBoardClickable(true);},700+Math.random()*300);
        } else { // Local PvP or Player's turn vs CPU (after CPU moved and switched back)
            statusDiv.textContent = `Turno del ${getPlayerName(currentPlayer)}`;
        }
    }

    function cpuMove(){
        if(!gameActive || !vsCPU) return;
        let cpuIcon = currentSymbols.player2; // CPU always uses default P2 icon of current set
        let idx;
        switch(difficulty){
            case 'easy': idx = randomMove(cpuIcon); break;
            case 'medium': idx = Math.random() < 0.75 ? bestMove(cpuIcon) : randomMove(cpuIcon); break;
            default: idx = bestMove(cpuIcon); // hard
        }
        if(idx === null || board[idx] !== null) idx = randomMove(cpuIcon); // Fallback if bestMove fails or returns occupied
        if(idx === null){ if(checkDraw()) endDraw(); return; } // No moves left

        makeMove(idx, cpuIcon);
        const win = checkWin(cpuIcon);
        if(win){ endGame(cpuIcon,win); return; }
        if(checkDraw()){ endDraw(); return; }
        switchPlayer(); // Switches to player's turn
        statusDiv.textContent = `Turno del ${getPlayerName(currentPlayer)}`;
    }

    function randomMove(playerIconForEval){ const a=board.map((v,i)=>v===null?i:null).filter(v=>v!==null); return a.length? a[Math.floor(Math.random()*a.length)] : null; }
    function bestMove(cpuIcon){
        let humanIcon = myPlayerIcon || currentSymbols.player1;
        // Check for winning move
        for(let i=0;i<9;i++)if(!board[i]){board[i]=cpuIcon;if(checkWin(cpuIcon,board)){board[i]=null;return i;}board[i]=null;}
        // Check for blocking move
        for(let i=0;i<9;i++)if(!board[i]){board[i]=humanIcon;if(checkWin(humanIcon,board)){board[i]=null;return i;}board[i]=null;}
        // Take center if available
        if(board[4]===null) return 4;
        // Take random corner if available
        const corners=[0,2,6,8].filter(i=>board[i]===null); if(corners.length) return corners[Math.floor(Math.random()*corners.length)];
        // Take random available side
        return randomMove(cpuIcon);
    }

    function checkWin(playerSymbol, currentBoard = board){ const c=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]; return c.find(combo=>combo.every(i=>currentBoard[i]===playerSymbol))||null;}
    function checkDraw(currentBoard = board){
        let p1DrawCheck = myPlayerIcon || currentSymbols.player1;
        let p2DrawCheck;
        if (pvpRemoteActive) {
            p2DrawCheck = opponentPlayerIcon || (iAmPlayer1InRemote ? currentSymbols.player2 : currentSymbols.player1);
        } else if (vsCPU) {
            p2DrawCheck = currentSymbols.player2;
        } else { // Local PvP
            p2DrawCheck = (p1DrawCheck === currentSymbols.player1) ? currentSymbols.player2 : currentSymbols.player1;
        }
        return currentBoard.every(cell=>cell!==null) && !checkWin(p1DrawCheck, currentBoard) && !checkWin(p2DrawCheck, currentBoard);
    }

    function endGame(playerSymbol, winningCells){
        gameActive=false;setBoardClickable(false);launchConfetti();playSound('win');
        winningCells.forEach(i=>cells[i].classList.add('rainbow'));
        statusDiv.textContent = `${getPlayerName(playerSymbol)} GANA!`; statusDiv.classList.add('highlight');
        lastWinner = playerSymbol; previousGameExists = true;

        let p1EffectiveIcon = myPlayerIcon || currentSymbols.player1;
        let p2EffectiveIcon;
        if (pvpRemoteActive) {
             p1EffectiveIcon = iAmPlayer1InRemote ? (myPlayerIcon || currentSymbols.player1) : (opponentPlayerIcon || currentSymbols.player2);
             p2EffectiveIcon = iAmPlayer1InRemote ? (opponentPlayerIcon || currentSymbols.player2) : (myPlayerIcon || currentSymbols.player1);
        } else if (vsCPU) {
            p2EffectiveIcon = currentSymbols.player2;
        } else { // Local PvP
             p2EffectiveIcon = (p1EffectiveIcon === currentSymbols.player1) ? currentSymbols.player2 : currentSymbols.player1;
        }


        if(playerSymbol === p1EffectiveIcon) unicornWins++; else if(playerSymbol === p2EffectiveIcon) heartWins++;
        localStorage.setItem('unicornWins',unicornWins);localStorage.setItem('heartWins',heartWins);
        updateScoreboard();

        if (pvpRemoteActive && gamePaired) {
            // In remote, might not auto-restart or depends on agreement
            // For now, host can initiate restart via button, or player can request.
            showOverlay(`${getPlayerName(playerSymbol)} GANA! Esperando para reiniciar...`);
        } else {
            setTimeout(init, AUTO_RESTART_DELAY_WIN);
        }
    }
    function endDraw(){
        gameActive=false;setBoardClickable(false);playDrawAnimation();playSound('draw');
        statusDiv.textContent="¡EMPATE!";draws++;lastWinner=null;previousGameExists=true;
        localStorage.setItem('draws',draws);updateScoreboard();

        if (pvpRemoteActive && gamePaired) {
             showOverlay(`¡EMPATE! Esperando para reiniciar...`);
        } else {
            setTimeout(init, AUTO_RESTART_DELAY_DRAW);
        }
    }

    function switchPlayer(){
        let p1IconToUse, p2IconToUse;

        if (pvpRemoteActive && gamePaired) {
            p1IconToUse = iAmPlayer1InRemote ? (myPlayerIcon || currentSymbols.player1) : (opponentPlayerIcon || currentSymbols.player2);
            p2IconToUse = iAmPlayer1InRemote ? (opponentPlayerIcon || currentSymbols.player2) : (myPlayerIcon || currentSymbols.player1);
        } else if (vsCPU) {
            p1IconToUse = myPlayerIcon || currentSymbols.player1;
            p2IconToUse = currentSymbols.player2;
        } else { // Local PvP
            p1IconToUse = myPlayerIcon || currentSymbols.player1;
            // P2's icon is the other from the current set, unless P1 chose P2's default
            p2IconToUse = (p1IconToUse === currentSymbols.player1) ? currentSymbols.player2 : currentSymbols.player1;
            if (p1IconToUse === currentSymbols.player2) p2IconToUse = currentSymbols.player1; // ensure it's the other
        }

        currentPlayer = (currentPlayer === p1IconToUse) ? p2IconToUse : p1IconToUse;
    }


    function updateScoreboard(){
        let p1DisplayIcon = myPlayerIcon || currentSymbols.player1;
        let p2DisplayIcon;

        if (pvpRemoteActive && gamePaired) {
            p1DisplayIcon = iAmPlayer1InRemote ? (myPlayerIcon || currentSymbols.player1) : (opponentPlayerIcon || currentSymbols.player2);
            p2DisplayIcon = iAmPlayer1InRemote ? (opponentPlayerIcon || currentSymbols.player2) : (myPlayerIcon || currentSymbols.player1);
        } else if (vsCPU) {
            p2DisplayIcon = currentSymbols.player2;
        } else { // Local PvP
            if (p1DisplayIcon === currentSymbols.player1) {
                p2DisplayIcon = currentSymbols.player2;
            } else if (p1DisplayIcon === currentSymbols.player2) {
                p2DisplayIcon = currentSymbols.player1;
            } else { // Player 1 chose a non-default icon from the set
                p2DisplayIcon = currentSymbols.player2; // P2 defaults to player2 of the set
            }
        }
        if (!p1DisplayIcon) p1DisplayIcon = currentSymbols.player1; // Fallback
        if (!p2DisplayIcon) p2DisplayIcon = currentSymbols.player2; // Fallback

        const resultsDiv = document.getElementById('results');
        if (resultsDiv) { // Check if element exists
            resultsDiv.innerHTML = `${p1DisplayIcon} <span id="unicornWins">${unicornWins}</span> – ${p2DisplayIcon} <span id="heartWins">${heartWins}</span> – 🤝 <span id="draws">${draws}</span>`;
        }
    }

    function playSound(type){
        if(!soundEnabled)return;const ctx=getAudioContext();if(!ctx)return;
        const o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);
        if(type==='move'){o.type='sine';o.frequency.setValueAtTime(200,ctx.currentTime);g.gain.setValueAtTime(.3,ctx.currentTime);o.frequency.exponentialRampToValueAtTime(300,ctx.currentTime+.1);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.1)}
        else if(type==='win'){o.type='triangle';o.frequency.setValueAtTime(300,ctx.currentTime);g.gain.setValueAtTime(.3,ctx.currentTime);o.frequency.exponentialRampToValueAtTime(600,ctx.currentTime+.3);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.3)}
        else if(type==='draw'){o.type='sawtooth';o.frequency.setValueAtTime(200,ctx.currentTime);g.gain.setValueAtTime(.2,ctx.currentTime);o.frequency.exponentialRampToValueAtTime(100,ctx.currentTime+.3);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.3)}
        else if(type==='reset'){o.type='square';o.frequency.setValueAtTime(150,ctx.currentTime);g.gain.setValueAtTime(.2,ctx.currentTime);o.frequency.exponentialRampToValueAtTime(80,ctx.currentTime+.2);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.2)}
        o.start(ctx.currentTime);o.stop(ctx.currentTime+.5);
    }
    function toggleTheme(){document.body.classList.toggle('dark-theme');localStorage.setItem('darkTheme',document.body.classList.contains('dark-theme'));updateAllUIToggleButtons();playSound('move')}
    function toggleSound(){soundEnabled=!soundEnabled;localStorage.setItem('soundDisabled',!soundEnabled);updateAllUIToggleButtons();if(soundEnabled)playSound('reset')}
    function changeSymbolsBtnHandler(){
        currentSymbolIndex=(currentSymbolIndex+1)%symbolSet.length;localStorage.setItem('currentSymbolIndex',currentSymbolIndex);
        currentSymbols=symbolSet[currentSymbolIndex];
        if (!localStorage.getItem('tatetiPlayerIcon')) { // Only change myPlayerIcon if it wasn't explicitly set
            myPlayerIcon = currentSymbols.player1;
        }
        // Opponent icon default for remote play or CPU would also need to consider this change if not customized by opponent.
        // This primarily affects local games or default appearances before customization.
        playSound('move');
        populateIconSelection(); // Re-populate to reflect new defaults & current selection
        init(); // Re-initialize the game to apply new default symbols if active
    }
    if(changeSymbolsBtn) changeSymbolsBtn.addEventListener('click',changeSymbolsBtnHandler);

    function checkUrlForRoomAndJoin() {
        const urlParams = new URLSearchParams(window.location.search);
        const roomId = urlParams.get('room');
        if (roomId) {
            console.log("GAME.JS: Room ID found in URL:", roomId);
            // Attempt to join this room
            // Need to make sure UI is ready for this (e.g., joinGameBtn might not be clicked by user)
            // So, directly call handleJoinGame with the roomId
            handleJoinGame(roomId);
            // Clean the URL
            window.history.replaceState({}, document.title, window.location.pathname);
        } else {
            init(); // Standard initialization if no room ID
        }
    }

    /* ----------  EVENT LISTENERS  ---------- */
    cells.forEach(c=>{c.addEventListener('click',handleCellClick);c.setAttribute('tabindex','0');c.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();c.click();}});});
    const restartBtn = document.getElementById('restartBtn'); // This button is hidden by default in HTML
    if(restartBtn) restartBtn.addEventListener('click', () => {
        if (pvpRemoteActive && gamePaired && window.peerJsMultiplayer && typeof window.peerJsMultiplayer.send === "function") {
            window.peerJsMultiplayer.send({ type: 'restart_request' });
            showOverlay("Solicitud de reinicio enviada...");
        } else {
            init(); // Local restart
        }
    });
    restartIcon.addEventListener('click', () => {
        if (pvpRemoteActive && gamePaired && window.peerJsMultiplayer && typeof window.peerJsMultiplayer.send === "function") {
            window.peerJsMultiplayer.send({ type: 'restart_request' });
            showOverlay("Solicitud de reinicio enviada...");
            // Opponent needs to ack for remote restart. For now, host-initiated restart via this button
            // will send request. Actual restart happens on ack or if both press.
            // For simplicity here, init() might be called by host, opponent gets request.
        } else {
             stopAnyGameInProgress(); // Clear any state thoroughly
             init(); // Then re-initialize for a fresh local game or menu state.
        }
        if (sideMenu.classList.contains('open')) sideMenu.classList.remove('open');
    });

    pvpLocalBtn.addEventListener('click',()=>{ stopAnyGameInProgress(); vsCPU=false; pvpRemoteActive = false; init(); });
    if (hostGameBtn) hostGameBtn.addEventListener('click', handleHostGame);
    if (joinGameBtn) joinGameBtn.addEventListener('click', () => handleJoinGame()); // Pass null, will prompt for ID
    cpuBtn.addEventListener('click',()=>{ stopAnyGameInProgress(); vsCPU=true; pvpRemoteActive = false; init(); });
    [easyBtn,mediumBtn,hardBtn].forEach(btn=>btn.addEventListener('click',e=>{ difficulty=e.target.id.replace('Btn',''); updateAllUIToggleButtons(); playSound('move'); if(!gameActive || vsCPU || (gameActive && board.every(c=>c===null)) ) init(); })); // Re-init if game not active, or if vs CPU and board is clear
    [player1StartsBtn,randomStartsBtn,loserStartsBtn].forEach(btn=>btn.addEventListener('click',e=>{ whoGoesFirstSetting=e.target.id.replace('StartsBtn',''); localStorage.setItem('whoGoesFirstSetting',whoGoesFirstSetting); updateAllUIToggleButtons(); playSound('move'); if(!gameActive || board.every(c=>c===null)) init(); }));

    themeToggle.addEventListener('click',toggleTheme);
    soundToggle.addEventListener('click',toggleSound);
    document.addEventListener('click', initAudioOnInteraction, { once: true });
    document.addEventListener('dblclick',e=>e.preventDefault(),{passive:false}); // Prevent double-click zoom

    /* ----------  INICIALIZACIÓN  ---------- */
    if(localStorage.getItem('darkTheme')==='true') document.body.classList.add('dark-theme');
    loadPlayerPreferences(); // Load player name/icon preferences
    updateAllUIToggleButtons(); // Set initial UI state for buttons
    checkUrlForRoomAndJoin(); // Checks for room ID in URL, otherwise calls init()
});

/* ----------  PWA bootstrap  ---------- */
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    if (location.protocol === 'http:' || location.protocol === 'https:') {
        navigator.serviceWorker.register('./sw.js')
          .then(reg => console.log('SW registered!', reg))
          .catch(err=>console.error('SW registration failed:',err));
    } else {
        console.warn('Service Worker not registered. (Requires HTTP/HTTPS or localhost)');
    }
  });
}