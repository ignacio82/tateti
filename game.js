/****************************************************
 * GAME LOGIC (with WebRTC Multiplayer + QR Signaling for Offer/Answer) *
 ***************************************************/
document.addEventListener('DOMContentLoaded', () => {
    /* ----------  ELEMENTOS DEL DOM  ---------- */
    const cells             = document.querySelectorAll('.cell');
    const statusDiv         = document.getElementById('status');
    const restartBtn        = document.getElementById('restartBtn');
    const pvpLocalBtn       = document.getElementById('pvpLocalBtn');
    const hostGameBtn       = document.getElementById('hostGameBtn');
    const joinGameBtn       = document.getElementById('joinGameBtn');
    const cpuBtn            = document.getElementById('cpuBtn');
    const difficultyDiv     = document.querySelector('.difficulty');
    const easyBtn           = document.getElementById('easyBtn');
    const mediumBtn         = document.getElementById('mediumBtn');
    const hardBtn           = document.getElementById('hardBtn');
    const unicornSpan       = document.getElementById('unicornWins');
    const heartSpan         = document.getElementById('heartWins');
    const drawsSpan         = document.getElementById('draws');
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
    const qrInputArea       = document.getElementById('qr-input-area');
    const qrScannedData     = document.getElementById('qr-scanned-data');
    const qrSubmitScannedData = document.getElementById('qr-submit-scanned-data');


    // WebRTC functions from webrtc-multiplayer.js (exposed on window object)
    const {
        initRTCSession,
        createOfferForHost,
        createAnswerForJoiner,
        acceptAnswerFromHost,
        addICECandidateToPeer,
        sendRTCMessage,
        closeRTCSession,
        showStatusOverlay: showOverlay,
        hideStatusOverlay: hideOverlay
    } = window;


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
    let accumulatedLocalICECandidates = []; // To store ICE candidates before manual exchange


    let soundEnabled = !(localStorage.getItem('soundDisabled') === 'true');
    const symbolSet = [
        {player1:'🦄',player2:'❤️'},{player1:'🐱',player2:'🐶'},
        {player1:'🌞',player2:'🌙'},{player1:'❌',player2:'⭕'}
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

    /* ----------  AUDIO CONTEXT  ---------- */
    let audioCtx;
    function getAudioContext(){ /* ... (same as before) ... */ 
        if(!audioCtx && soundEnabled){
            try{audioCtx = new (window.AudioContext||window.webkitAudioContext)();}
            catch(e){console.error("AudioContext error",e);soundEnabled=false;soundToggle.textContent='🔇';localStorage.setItem('soundDisabled',true);return null;}
        }
        if(audioCtx && audioCtx.state==='suspended'){
            audioCtx.resume().catch(err=>console.error("Error resuming AudioContext:", err));
        }
        return audioCtx;
    }
    function initAudioOnInteraction(){ if(soundEnabled && !audioCtx){ getAudioContext(); } }


    /* ----------  CONFETTI & DRAW ANIMATION  ---------- */
    function launchConfetti(){ /* ... (same as before) ... */ 
        if(!soundEnabled) return;
        const confettiColors=['#ff3860','#ffdd57','#17d1a2','#3e8ed0','#b86bff','var(--pink)','var(--pink-dark)'];
        for(let i=0;i<100;i++){
            const c=document.createElement('div');
            c.classList.add('confetti');
            c.style.background=confettiColors[Math.floor(Math.random()*confettiColors.length)];
            c.style.left=`${Math.random()*100}vw`;
            c.style.top=`${Math.random()*-80-20}px`; 
            const animDuration=Math.random()*2+3;
            const animDelay=Math.random()*0.5;
            c.style.width=`${Math.random()*6+6}px`;
            c.style.height=`${Math.random()*10+8}px`;
            c.style.opacity=`${Math.random()*0.4+0.6}`;
            c.style.transform=`rotate(${Math.random()*360}deg) scale(${Math.random()*0.5+0.5})`;
            c.style.animation=`fall ${animDuration}s ease-out ${animDelay}s forwards`;
            document.body.appendChild(c);
            setTimeout(()=>c.remove(),(animDuration+animDelay)*1000+200);
        }
    }
    function removeConfetti(){ document.querySelectorAll('.confetti').forEach(c=>c.remove()); }
    function playDrawAnimation(){ /* ... (same as before) ... */
        const dur=1800; 
        statusDiv.classList.add('highlight-draw-flash');
        gameBoardEl.classList.add('highlight-draw-border');
        setTimeout(()=>{
            statusDiv.classList.remove('highlight-draw-flash');
            gameBoardEl.classList.remove('highlight-draw-border');
            gameBoardEl.style.borderColor=''; gameBoardEl.style.boxShadow=''; 
        },dur);
        return dur; 
    }


    /* ----------  LÓGICA PRINCIPAL  ---------- */
    function setBoardClickable(clickable){ /* ... (same as before) ... */ 
        cells.forEach(cellNode =>{ 
            if(clickable){ 
                board[cellNode.dataset.index] === null ? cellNode.classList.remove('disabled') : cellNode.classList.add('disabled');
            } else {
                cellNode.classList.add('disabled');
            }
        });
    }
    function getPlayerName(sym){ /* ... (same as before) ... */ 
        if(sym===currentSymbols.player1)return `${sym} ${sym==='🦄'?'Unicornio':sym==='🐱'?'Gatito':sym==='🌞'?'Sol':'Equis'}`;
        if(sym===currentSymbols.player2)return `${sym} ${sym==='❤️'?'Corazón':sym==='🐶'?'Perrito':sym==='🌙'?'Luna':'Círculo'}`;
        return sym; 
    }
    function updateAllUIToggleButtons(){ /* ... (same as before) ... */ 
        pvpLocalBtn.classList.toggle('active', !vsCPU && !pvpRemoteActive);
        hostGameBtn.classList.toggle('active', pvpRemoteActive && iAmPlayer1InRemote && !gamePaired);
        joinGameBtn.classList.toggle('active', pvpRemoteActive && !iAmPlayer1InRemote && !gamePaired);
        cpuBtn.classList.toggle('active', vsCPU);

        const showGameElements = !(pvpRemoteActive && !gamePaired);
        document.getElementById('game').style.display = showGameElements ? 'grid' : 'none';
        document.getElementById('results').style.display = showGameElements ? 'block' : 'none';
        qrDisplayArea.style.display = 'none'; // Hide QR by default
        qrInputArea.style.display = 'none';   // Hide QR input by default


        difficultyDiv.style.display = vsCPU ? 'flex' : 'none';
        easyBtn.classList.toggle('active',difficulty==='easy');
        mediumBtn.classList.toggle('active',difficulty==='medium');
        hardBtn.classList.toggle('active',difficulty==='hard');

        document.querySelector('.game-start-options').style.display = pvpRemoteActive ? 'none' : 'flex';
        player1StartsBtn.classList.toggle('active',whoGoesFirstSetting==='player1');
        randomStartsBtn.classList.toggle('active',whoGoesFirstSetting==='random');
        loserStartsBtn.classList.toggle('active',whoGoesFirstSetting==='loser');

        themeToggle.textContent=document.body.classList.contains('dark-theme')?'☀️':'🌙';
        soundToggle.textContent=soundEnabled?'🔊':'🔇';
    }

    function init(){ /* ... (largely same, ensure QR areas are hidden) ... */
        removeConfetti();
        hideOverlay();
        qrDisplayArea.style.display = 'none';
        qrInputArea.style.display = 'none';
        
        if (pvpRemoteActive && !gamePaired) { 
            closeRTCSessionSafely();
        }

        board=Array(9).fill(null);
        difficulty = easyBtn.classList.contains('active')?'easy':hardBtn.classList.contains('active')?'hard':'medium';
        gameActive = false; 

        if (pvpRemoteActive && gamePaired) {
            currentPlayer = iAmPlayer1InRemote ? currentSymbols.player1 : currentSymbols.player2;
            isMyTurnInRemote = iAmPlayer1InRemote; 
            statusDiv.textContent = isMyTurnInRemote ? `Tu Turno ${getPlayerName(currentPlayer)}` : `Esperando a ${getPlayerName(currentPlayer)}...`;
            setBoardClickable(isMyTurnInRemote);
            gameActive = true;
        } else if (pvpRemoteActive && !gamePaired) {
            // UI for this state is handled by host/join functions
            statusDiv.textContent = iAmPlayer1InRemote ? "Hosteando... Generando oferta QR." : "Uniéndote... Esperando oferta QR.";
            setBoardClickable(false);
        } else if (vsCPU) { /* ... (same CPU logic) ... */
            gameActive = true;
            switch(whoGoesFirstSetting){
                case 'random': currentPlayer = Math.random()<.5?currentSymbols.player1:currentSymbols.player2; break;
                case 'loser':
                    currentPlayer = (!previousGameExists||lastWinner===null)?currentSymbols.player1:(lastWinner===currentSymbols.player1?currentSymbols.player2:currentSymbols.player1);
                    break;
                default: currentPlayer = currentSymbols.player1; 
            }
            statusDiv.textContent = `Turno del ${getPlayerName(currentPlayer)}`;
            if(currentPlayer===currentSymbols.player2){ 
                setBoardClickable(false);
                setTimeout(()=>{ if(gameActive) cpuMove(); if(gameActive) setBoardClickable(true);},700+Math.random()*300);
            } else {
                setBoardClickable(true);
            }
        } else { /* ... (same Local PvP logic) ... */ 
            gameActive = true;
             switch(whoGoesFirstSetting){
                case 'random': currentPlayer = Math.random()<.5?currentSymbols.player1:currentSymbols.player2; break;
                case 'loser':
                    currentPlayer = (!previousGameExists||lastWinner===null)?currentSymbols.player1:(lastWinner===currentSymbols.player1?currentSymbols.player2:currentSymbols.player1);
                    break;
                default: currentPlayer = currentSymbols.player1;
            }
            statusDiv.textContent = `Turno del ${getPlayerName(currentPlayer)}`;
            setBoardClickable(true);
        }

        cells.forEach(c=>{c.querySelector('span').textContent='';c.classList.remove('rainbow','disabled');});
        statusDiv.classList.remove('highlight','highlight-draw-flash');
        gameBoardEl.classList.remove('highlight-draw-border');
        gameBoardEl.style.borderColor='';gameBoardEl.style.boxShadow='';
        
        updateAllUIToggleButtons();
        if(gameActive && !(pvpRemoteActive && !isMyTurnInRemote)) playSound('reset');
        
        sideMenu.classList.remove('open');
    }
    function closeRTCSessionSafely() { /* ... (same as before) ... */ 
        if (typeof closeRTCSession === "function") {
            closeRTCSession();
        } else {
            console.warn("closeRTCSession is not defined");
        }
    }
    function stopAnyGameInProgress() { /* ... (same as before) ... */ 
        gameActive = false;
        closeRTCSessionSafely();
        board = Array(9).fill(null); 
        cells.forEach(c => { c.querySelector('span').textContent = ''; c.classList.remove('rainbow', 'disabled'); });
        removeConfetti();
        hideOverlay();
        qrDisplayArea.style.display = 'none';
        qrInputArea.style.display = 'none';
    }

    // ----- QR Code Helper Functions -----
    function displaySignalForQR(title, dataString) {
        if (!qrCodeCanvas || !qrTextData || !qrDisplayArea) {
            console.error("QR display elements not found!");
            alert("Error: Elementos para QR no encontrados. Revisa HTML.\n" + title + "\n" + dataString);
            return;
        }
        qrTextData.value = dataString;
        try {
            new QRious({
                element: qrCodeCanvas,
                value: dataString,
                size: 200,
                padding: 10,
                level: 'L' // Low error correction, for more data
            });
        } catch (e) {
            console.error("Error generating QR code:", e);
            alert("Error al generar QR. El texto podría ser muy largo.");
            qrCodeCanvas.getContext('2d').clearRect(0,0,qrCodeCanvas.width, qrCodeCanvas.height); // Clear if error
        }
        qrDisplayArea.querySelector('h3').textContent = title;
        qrDisplayArea.style.display = 'block';
        qrInputArea.style.display = 'none';
        showOverlay(title.substring(0, 50) + "..."); // Keep overlay brief
    }

    function getInputSignalFromQR(promptMessage) {
        if (!qrInputArea || !qrScannedData || !qrSubmitScannedData) {
            console.error("QR input elements not found!");
            return Promise.reject("QR input elements not found.");
        }
        qrDisplayArea.style.display = 'none';
        qrInputArea.style.display = 'block';
        qrInputArea.querySelector('h3').textContent = promptMessage;
        qrScannedData.value = '';
        showOverlay(promptMessage.substring(0,50) + "...");

        return new Promise((resolve) => {
            const currentButton = qrSubmitScannedData; // Avoid issues if button is re-rendered or listener stacks
            const clickHandler = () => {
                const data = qrScannedData.value.trim();
                if (data) {
                    qrInputArea.style.display = 'none';
                    hideOverlay();
                    currentButton.removeEventListener('click', clickHandler); // Clean up listener
                    resolve(data);
                } else {
                    alert("Por favor, pega los datos escaneados del código QR.");
                }
            };
            currentButton.addEventListener('click', clickHandler, { once: true }); // Use once or manage listener removal
        });
    }


    // ----- WebRTC Multiplayer Logic -----
    const rtcCallbacks = {
        onDataChannelOpen: () => { /* ... (same as before) ... */ 
            console.log("GAME.JS: Data channel opened!");
            gamePaired = true;
            hideOverlay();
            qrDisplayArea.style.display = 'none'; // Hide any QR stuff
            qrInputArea.style.display = 'none';
            statusDiv.textContent = `¡Conectado! ${iAmPlayer1InRemote ? "Eres Jugador 1 (🦄)." : "Eres Jugador 2 (❤️)."}`;
            playSound('win');
            init(); 
        },
        onDataReceived: (data) => { /* ... (same as before) ... */ 
            console.log("GAME.JS: Data received:", data);
            if (!gameActive || !pvpRemoteActive || isMyTurnInRemote || !gamePaired) {
                 console.warn("GAME.JS: Received data but not expecting it or game not in correct state.", {isMyTurnInRemote, gameActive, pvpRemoteActive, gamePaired});
                 return;
            }
            if (data.type === 'move' && typeof data.index === 'number') {
                handleRemoteMoveDetected(data.index);
            } else if (data.type === 'restart_request') {
                if(confirm("Oponente quiere reiniciar. ¿Aceptar?")){
                    init();
                    sendRTCMessage({ type: 'restart_ack' });
                }
            } else if (data.type === 'restart_ack') {
                alert("Reinicio aceptado por oponente.");
                init();
            }
        },
        onConnectionStateChange: (state) => { /* ... (same, ensure QR areas hidden on failure) ... */ 
            console.log("GAME.JS: Connection state changed:", state);
            statusDiv.textContent = `RTC Estado: ${state}`;
            if (state !== 'connected' && state !== 'connecting') showOverlay(`Conexión: ${state}`);

            if (state === 'connected') {
                hideOverlay();
            } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
                showOverlay(`Desconectado o falló la conexión.`);
                qrDisplayArea.style.display = 'none';
                qrInputArea.style.display = 'none';
                if (pvpRemoteActive) { 
                    alert("La conexión con el otro jugador se perdió o falló.");
                    pvpRemoteActive = false;
                    gamePaired = false;
                    init(); 
                }
            }
        },
        onIceCandidate: (candidate) => {
            const candidateString = JSON.stringify(candidate);
            console.log("My ICE Candidate (for manual exchange after QR):", candidateString);
            accumulatedLocalICECandidates.push(candidateString);
            // Inform user to collect them. A better UI would show a list.
            showOverlay("Nuevo CANDIDATO ICE generado. Se agruparán para intercambio manual después de la oferta/respuesta QR.");
        }
    };

    async function handleHostGame() {
        stopAnyGameInProgress();
        pvpRemoteActive = true; vsCPU = false; iAmPlayer1InRemote = true; gamePaired = false;
        accumulatedLocalICECandidates = [];
        updateAllUIToggleButtons();
        
        statusDiv.textContent = "Hosteando... Inicializando sesión RTC.";
        showOverlay("Iniciando sesión RTC como Host...");
        initRTCSession(rtcCallbacks);

        try {
            const offer = await createOfferForHost();
            if (offer) {
                const offerString = JSON.stringify(offer);
                displaySignalForQR("Host: Jugador 2 escanea esta OFERTA", offerString);
                statusDiv.textContent = "Host: Oferta creada (QR). Esperando respuesta del Jugador 2.";

                const answerString = await getInputSignalFromQR("Host: Pega la RESPUESTA (escaneada del QR del Jugador 2) aquí:");
                if (answerString) {
                    try {
                        const answer = JSON.parse(answerString);
                        await acceptAnswerFromHost(answer);
                        statusDiv.textContent = "Host: Respuesta recibida. Intercambiando Candidatos ICE...";
                        showOverlay("Respuesta OK. Ahora intercambia Candidatos ICE manualmente.");

                        // Manual ICE Exchange
                        const allLocalIce = accumulatedLocalICECandidates.join('\n');
                        prompt("Host: COPIA TODOS estos tus Candidatos ICE y envíaselos al Jugador 2:\n\n" + (allLocalIce || "No hay candidatos aún, espera un momento y revisa la consola."), allLocalIce);
                        
                        const remoteIceString = prompt("Host: PEGA TODOS los Candidatos ICE del Jugador 2 aquí (uno por línea si son varios):");
                        if (remoteIceString) {
                            remoteIceString.trim().split('\n').forEach(candStr => {
                                if (candStr.trim()) {
                                    try { addICECandidateToPeer(JSON.parse(candStr.trim())); }
                                    catch (e) { console.error("Error parsing remote ICE candidate:", e, candStr); alert("Error al procesar un candidato ICE remoto: " + candStr);}
                                }
                            });
                        }
                        statusDiv.textContent = "Host: Candidatos procesados. Esperando conexión...";
                    } catch (e) {
                        console.error("Error parsing Answer:", e); alert("Error: La respuesta no es válida.");
                        statusDiv.textContent = "Error en la respuesta."; pvpRemoteActive = false; init();
                    }
                } else { alert("Host: Proceso de respuesta cancelado."); pvpRemoteActive = false; init(); }
            }
        } catch (error) {
            console.error("GAME.JS: Error hosting game:", error);
            statusDiv.textContent = "Error al hostear."; showOverlay("Error al hostear el juego.");
            pvpRemoteActive = false; init();
        }
    }

    async function handleJoinGame() {
        stopAnyGameInProgress();
        pvpRemoteActive = true; vsCPU = false; iAmPlayer1InRemote = false; gamePaired = false;
        accumulatedLocalICECandidates = [];
        updateAllUIToggleButtons();

        statusDiv.textContent = "Uniéndote... Esperando oferta QR del Host.";
        showOverlay("Esperando oferta QR del Host...");
        initRTCSession(rtcCallbacks);

        const offerString = await getInputSignalFromQR("Jugador 2: Pega la OFERTA (escaneada del QR del Host) aquí:");
        if (!offerString) { alert("Joiner: Proceso de unirse cancelado."); pvpRemoteActive = false; init(); return; }

        try {
            const offer = JSON.parse(offerString);
            const answer = await createAnswerForJoiner(offer);

            if (answer) {
                const answerString = JSON.stringify(answer);
                displaySignalForQR("Jugador 2: Host escanea esta RESPUESTA", answerString);
                statusDiv.textContent = "Joiner: Respuesta creada (QR). Esperando que Host la procese e intercambiar Candidatos ICE.";
                showOverlay("Respuesta OK. Host debe escanear. Luego intercambia Candidatos ICE manualmente.");

                // Manual ICE Exchange
                const allLocalIce = accumulatedLocalICECandidates.join('\n');
                prompt("Jugador 2: COPIA TODOS estos tus Candidatos ICE y envíaselos al Host:\n\n" + (allLocalIce || "No hay candidatos aún, espera un momento y revisa la consola."), allLocalIce);

                const remoteIceString = prompt("Jugador 2: PEGA TODOS los Candidatos ICE del Host aquí (uno por línea si son varios):");
                if (remoteIceString) {
                    remoteIceString.trim().split('\n').forEach(candStr => {
                        if (candStr.trim()) {
                           try { addICECandidateToPeer(JSON.parse(candStr.trim())); }
                           catch (e) { console.error("Error parsing remote ICE candidate:", e, candStr); alert("Error al procesar un candidato ICE remoto: " + candStr); }
                        }
                    });
                }
                statusDiv.textContent = "Joiner: Candidatos procesados. Esperando conexión...";
            }
        } catch (error) {
            console.error("GAME.JS: Error joining game:", error);
            alert("Error al unirse: " + error.message);
            statusDiv.textContent = "Error al unirse."; pvpRemoteActive = false; init();
        }
    }

    function makeMove(index, playerSymbol){ /* ... (same as before) ... */ 
        if (board[index] !== null) return false; 
        board[index]=playerSymbol;
        cells[index].querySelector('span').textContent=playerSymbol;
        cells[index].classList.add('disabled');
        cells[index].style.animation='cellSelectAnim .3s ease';
        setTimeout(()=>cells[index].style.animation='',300);
        playSound('move');
        return true;
    }
    function handleRemoteMoveDetected(index) { /* ... (same as before) ... */ 
        hideOverlay(); 
        if (typeof index !== 'number' || index < 0 || index > 8) {
            console.warn("Invalid remote move index:", index);
            return;
        }
        if (!gameActive || board[index] !== null || !pvpRemoteActive || isMyTurnInRemote || !gamePaired) {
            console.warn("Remote move ignored due to invalid game state:", {index, gameActive, boardVal: board[index], pvpRemoteActive, isMyTurnInRemote, gamePaired});
            return;
        }
        if (!makeMove(index, currentPlayer)) { 
            console.error("Failed to make remote move on board, cell might be taken despite checks.");
            return;
        }
        const win = checkWin(currentPlayer); 
        if (win) { endGame(currentPlayer, win); return; }
        if (checkDraw()) { endDraw(); return; }
        switchPlayer(); 
        isMyTurnInRemote = true; 
        statusDiv.textContent = `Tu Turno ${getPlayerName(currentPlayer)}`;
        setBoardClickable(true);
    }
    function handleCellClick(e){ /* ... (same as before) ... */ 
        const idx = +e.currentTarget.dataset.index;
        if (!gameActive || board[idx] !== null ) return;
        if (pvpRemoteActive && (!isMyTurnInRemote || !gamePaired)) {
            if (gamePaired) alert("No es tu turno."); else alert("El juego no está emparejado aún.");
            return;
        }
        if (!makeMove(idx, currentPlayer)) return; 
        if (pvpRemoteActive && gamePaired) {
            if (typeof sendRTCMessage === "function") {
                sendRTCMessage({ type: 'move', index: idx }); 
            } else {
                 console.error("sendRTCMessage is not defined!");
                 statusDiv.textContent = "Error: Función para enviar mensaje RTC no disponible.";
                 return;
            }
        }
        const win = checkWin(currentPlayer);
        if(win){ endGame(currentPlayer,win); return; }
        if(checkDraw()){ endDraw(); return; }
        switchPlayer(); 
        if (pvpRemoteActive && gamePaired) {
            isMyTurnInRemote = false; 
            statusDiv.textContent = `Esperando a ${getPlayerName(currentPlayer)}...`; 
            setBoardClickable(false);
        } else if(vsCPU && currentPlayer===currentSymbols.player2){ 
            setBoardClickable(false);
            setTimeout(()=>{ if(gameActive) cpuMove(); if(gameActive) setBoardClickable(true);},700+Math.random()*300);
        }
    }
    function cpuMove(){ /* ... (same as before) ... */ 
        if(!gameActive) return;
        let idx;
        switch(difficulty){
            case 'easy': idx=randomMove(); break;
            case 'medium': idx=Math.random()<.75?bestMove():randomMove(); break;
            default: idx=bestMove(); 
        }
        if(idx===null || board[idx]!==null) idx=randomMove(); 
        if(idx===null){ if(checkDraw()) endDraw(); return; } 
        makeMove(idx,currentSymbols.player2); 
        const win=checkWin(currentSymbols.player2);
        if(win){ endGame(currentSymbols.player2,win); return; }
        if(checkDraw()){ endDraw(); return; }
        switchPlayer(); 
    }
    function randomMove(){ /* ... (same as before) ... */ 
        const a=board.map((v,i)=>v===null?i:null).filter(v=>v!==null);
        return a.length? a[Math.floor(Math.random()*a.length)] : null;
    }
    function bestMove(){ /* ... (same as before) ... */ 
        for(let i=0;i<9;i++)if(!board[i]){board[i]=currentSymbols.player2;if(checkWin(currentSymbols.player2)){board[i]=null;return i;}board[i]=null;}
        for(let i=0;i<9;i++)if(!board[i]){board[i]=currentSymbols.player1;if(checkWin(currentSymbols.player1)){board[i]=null;return i;}board[i]=null;}
        if(board[4]===null) return 4;
        const corners=[0,2,6,8].filter(i=>board[i]===null);
        if(corners.length) return corners[Math.floor(Math.random()*corners.length)];
        return randomMove();
    }
    function checkWin(playerSymbol, currentBoard = board){ /* ... (same as before) ... */ 
        const c=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
        return c.find(combo=>combo.every(i=>currentBoard[i]===playerSymbol))||null;
    }
    function checkDraw(currentBoard = board){  /* ... (same as before) ... */
        return currentBoard.every(cell=>cell!==null) && !checkWin(currentSymbols.player1, currentBoard) && !checkWin(currentSymbols.player2, currentBoard);
    }
    function endGame(playerSymbol, winningCells){ /* ... (same as before, ensure QR areas hidden) ... */ 
        if(!gameActive && !(pvpRemoteActive && gamePaired)) return; 
        gameActive=false; 
        setBoardClickable(false);
        hideOverlay();
        qrDisplayArea.style.display = 'none';
        qrInputArea.style.display = 'none';
        
        if (pvpRemoteActive && gamePaired) { 
             setTimeout(() => closeRTCSessionSafely(), 1000); 
        }
        if(winningCells) winningCells.forEach(i=>cells[i].classList.add('rainbow'));
        statusDiv.textContent=`¡${getPlayerName(playerSymbol)} ganó!`; statusDiv.classList.add('highlight');
        if(playerSymbol===currentSymbols.player1){unicornWins++;localStorage.setItem('unicornWins',unicornWins);lastWinner=currentSymbols.player1;}
        else{heartWins++;localStorage.setItem('heartWins',heartWins);lastWinner=currentSymbols.player2;}
        previousGameExists=true; 
        updateScoreboard(); 
        playSound('win'); 
        launchConfetti();
        const autoRestartDelay = (pvpRemoteActive && gamePaired) ? AUTO_RESTART_DELAY_WIN + 3000 : AUTO_RESTART_DELAY_WIN;
        setTimeout(()=>{
            removeConfetti(); 
            if (pvpRemoteActive && gamePaired) {
                pvpRemoteActive = false; gamePaired = false;
            }
            init();
        }, autoRestartDelay);
    }
    function endDraw(){ /* ... (same as before, ensure QR areas hidden) ... */ 
        if(!gameActive && !(pvpRemoteActive && gamePaired)) return;
        gameActive=false; 
        setBoardClickable(false);
        hideOverlay();
        qrDisplayArea.style.display = 'none';
        qrInputArea.style.display = 'none';

        if (pvpRemoteActive && gamePaired) {
             setTimeout(() => closeRTCSessionSafely(), 1000);
        }
        statusDiv.textContent='¡Empate!'; statusDiv.classList.add('highlight');
        draws++;localStorage.setItem('draws',draws);lastWinner=null;previousGameExists=true;
        updateScoreboard();
        playSound('draw');
        const animationDuration = playDrawAnimation();
        const autoRestartDelay = (pvpRemoteActive && gamePaired) ? Math.max(animationDuration + 200, AUTO_RESTART_DELAY_DRAW) + 3000 : Math.max(animationDuration + 200, AUTO_RESTART_DELAY_DRAW);
        setTimeout(()=>{
            if (pvpRemoteActive && gamePaired) {
                pvpRemoteActive = false; gamePaired = false;
            }
            init();
        }, autoRestartDelay);
    }
    function switchPlayer(){ /* ... (same as before) ... */ 
        currentPlayer = (currentPlayer===currentSymbols.player1)?currentSymbols.player2:currentSymbols.player1;
    }
    function updateScoreboard(){ /* ... (same as before) ... */ 
        unicornSpan.textContent=unicornWins;heartSpan.textContent=heartWins;drawsSpan.textContent=draws;
    }
    function playSound(type){ /* ... (same as before) ... */ 
        if(!soundEnabled||!getAudioContext()|| (audioCtx && audioCtx.state!=='running') ) return;
        try{
            const o=audioCtx.createOscillator();const g=audioCtx.createGain();o.connect(g);g.connect(audioCtx.destination);
            let f1=440,t=.2,gV=.08,wT='sine'; 
            switch(type){
                case'move':f1=300+Math.random()*200;t=.15;gV=.06;wT='triangle';break;
                case'win':f1=600;const f2=900,f3=1200;t=.7;gV=.1;wT='sawtooth';o.frequency.setValueAtTime(f1,audioCtx.currentTime);o.frequency.linearRampToValueAtTime(f2,audioCtx.currentTime+t*.33);o.frequency.linearRampToValueAtTime(f3,audioCtx.currentTime+t*.66);break;
                case'draw':f1=330;const fD2=220;t=.4;gV=.07;wT='square';o.frequency.setValueAtTime(f1,audioCtx.currentTime);o.frequency.linearRampToValueAtTime(fD2,audioCtx.currentTime+t*.5);break;
                case'reset':f1=500;const fR2=300;t=.25;gV=.05;wT='sine';o.frequency.setValueAtTime(f1,audioCtx.currentTime);o.frequency.linearRampToValueAtTime(fR2,audioCtx.currentTime+t*.5);break;
                default:return; 
            }
            o.type=wT;if(!['win','draw','reset'].includes(type)) o.frequency.setValueAtTime(f1,audioCtx.currentTime); 
            g.gain.setValueAtTime(gV,audioCtx.currentTime);
            o.start();g.gain.exponentialRampToValueAtTime(.00001,audioCtx.currentTime+t);o.stop(audioCtx.currentTime+t+.05);
        }catch(err){console.error("Error playing sound:",err);}
    }
    function toggleTheme(){ /* ... (same as before) ... */ 
        document.body.classList.toggle('dark-theme');
        localStorage.setItem('darkTheme',document.body.classList.contains('dark-theme'));
        updateAllUIToggleButtons(); playSound('move');
    }
    function toggleSound(){ /* ... (same as before) ... */ 
        soundEnabled=!soundEnabled;localStorage.setItem('soundDisabled',!soundEnabled);
        if(soundEnabled) initAudioOnInteraction(); else {
            if(audioCtx&&audioCtx.state==='running') audioCtx.suspend().catch(e => console.error("Error suspending audio context:", e));
            hideOverlay(); 
        }
        updateAllUIToggleButtons(); if(soundEnabled) playSound('move');
    }
    function changeSymbols(){ /* ... (same as before) ... */ 
        currentSymbolIndex=(currentSymbolIndex+1)%symbolSet.length;localStorage.setItem('currentSymbolIndex',currentSymbolIndex);
        currentSymbols=symbolSet[currentSymbolIndex];
        const oldPlayer1Symbol = symbolSet[(currentSymbolIndex - 1 + symbolSet.length) % symbolSet.length].player1;
        const oldPlayer2Symbol = symbolSet[(currentSymbolIndex - 1 + symbolSet.length) % symbolSet.length].player2;
        if (currentPlayer === oldPlayer1Symbol) currentPlayer = currentSymbols.player1;
        else if (currentPlayer === oldPlayer2Symbol) currentPlayer = currentSymbols.player2;
        const rDiv=document.getElementById('results');
        rDiv.childNodes[0].nodeValue=currentSymbols.player1+' '; 
        rDiv.childNodes[2].nodeValue=' – '+currentSymbols.player2+' '; 
        playSound('move'); 
        init(); 
    }

    /* ----------  EVENT LISTENERS  ---------- */
    cells.forEach(c=>{c.addEventListener('click',handleCellClick);c.setAttribute('tabindex','0');c.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();c.click();}});});
    restartBtn.addEventListener('click',init); 
    restartIcon.addEventListener('click', () => { /* ... (same as before) ... */ 
        stopAnyGameInProgress(); 
        if (pvpRemoteActive) { 
            pvpRemoteActive = false; gamePaired = false;      
        }
        init(); 
        if (sideMenu.classList.contains('open')) sideMenu.classList.remove('open');
    });
    pvpLocalBtn.addEventListener('click',()=>{ /* ... (same as before) ... */ 
        stopAnyGameInProgress();
        vsCPU=false;
        if (pvpRemoteActive) { }
        pvpRemoteActive = false; gamePaired = false;
        init(); 
    });
    hostGameBtn.addEventListener('click', handleHostGame);
    joinGameBtn.addEventListener('click', handleJoinGame);
    cpuBtn.addEventListener('click',()=>{ /* ... (same as before) ... */ 
        stopAnyGameInProgress();
        vsCPU=true;
        if (pvpRemoteActive) {}
        pvpRemoteActive = false; gamePaired = false;
        init(); 
    });
    [easyBtn,mediumBtn,hardBtn].forEach(btn=>btn.addEventListener('click',e=>{ /* ... (same as before) ... */ 
        difficulty=e.target.id.replace('Btn','');
        updateAllUIToggleButtons();
        playSound('move');
        if(!gameActive || vsCPU) init(); 
    }));
    [player1StartsBtn,randomStartsBtn,loserStartsBtn].forEach(btn=>btn.addEventListener('click',e=>{ /* ... (same as before) ... */ 
        whoGoesFirstSetting=e.target.id.replace('StartsBtn','');
        localStorage.setItem('whoGoesFirstSetting',whoGoesFirstSetting);
        updateAllUIToggleButtons();
        playSound('move');
        if(!gameActive || board.every(c=>c===null)) init(); 
    }));
    changeSymbolsBtn.addEventListener('click',changeSymbols);
    themeToggle.addEventListener('click',toggleTheme);
    soundToggle.addEventListener('click',toggleSound);
    document.addEventListener('dblclick',e=>e.preventDefault(),{passive:false}); 

    /* ----------  INICIALIZACIÓN  ---------- */
    if(localStorage.getItem('darkTheme')==='true') document.body.classList.add('dark-theme');
    updateScoreboard();
    init(); 
});

/* ----------  PWA bootstrap  ---------- */
if('serviceWorker' in navigator){ /* ... (same as before) ... */ 
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('SW registered!', reg))
      .catch(err=>console.error('SW registration failed:',err));
  });
}