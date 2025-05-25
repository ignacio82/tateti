/****************************************************
 * GAME LOGIC (with WebRTC Multiplayer + Firebase Signaling) *
 ***************************************************/
document.addEventListener('DOMContentLoaded', () => {
    /* ----------  ELEMENTOS DEL DOM  ---------- */
    const cells             = document.querySelectorAll('.cell');
    const statusDiv         = document.getElementById('status');
    // ... (other DOM elements remain the same as your previous full game.js)
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

    // QR Code related DOM Elements (repurposed for Room ID display by Host)
    const qrDisplayArea     = document.getElementById('qr-display-area');
    const qrCodeCanvas      = document.getElementById('qr-code-canvas');
    const qrTextData        = document.getElementById('qr-text-data');
    // const qrInputArea       = document.getElementById('qr-input-area'); // No longer needed for SDP/ICE
    // const qrScannedData     = document.getElementById('qr-scanned-data');
    // const qrSubmitScannedData = document.getElementById('qr-submit-scanned-data');


    // WebRTC functions from rtcMultiplayer object (exposed by webrtc-multiplayer.js)
    // Access via window.rtcMultiplayer.initSession(...) etc.
    const { showStatusOverlay: showOverlay, hideStatusOverlay: hideOverlay } = window; // Assuming these are still globally exposed by webrtc-multiplayer or another script


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
    // accumulatedLocalICECandidates is no longer needed here, firebase-signaling handles ICE

    let soundEnabled = !(localStorage.getItem('soundDisabled') === 'true');
    // ... (symbolSet, currentSymbolIndex, currentSymbols, scores, whoGoesFirstSetting, lastWinner, previousGameExists, AUTO_RESTART_DELAYs remain the same)
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


    /* ----------  AUDIO CONTEXT & OTHER HELPERS  ---------- */
    // getAudioContext, initAudioOnInteraction, launchConfetti, removeConfetti, playDrawAnimation,
    // setBoardClickable, getPlayerName remain the same as your previous full game.js
    let audioCtx;
    function getAudioContext(){ 
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
    function launchConfetti(){ 
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
    function playDrawAnimation(){
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
    function setBoardClickable(clickable){
        cells.forEach(cellNode =>{ 
            if(clickable){ 
                board[cellNode.dataset.index] === null ? cellNode.classList.remove('disabled') : cellNode.classList.add('disabled');
            } else {
                cellNode.classList.add('disabled');
            }
        });
    }
    function getPlayerName(sym){
        if(sym===currentSymbols.player1)return `${sym} ${sym==='🦄'?'Unicornio':sym==='🐱'?'Gatito':sym==='🌞'?'Sol':'Equis'}`;
        if(sym===currentSymbols.player2)return `${sym} ${sym==='❤️'?'Corazón':sym==='🐶'?'Perrito':sym==='🌙'?'Luna':'Círculo'}`;
        return sym; 
    }

    function updateAllUIToggleButtons(){
        pvpLocalBtn.classList.toggle('active', !vsCPU && !pvpRemoteActive);
        hostGameBtn.classList.toggle('active', pvpRemoteActive && iAmPlayer1InRemote && !gamePaired);
        joinGameBtn.classList.toggle('active', pvpRemoteActive && !iAmPlayer1InRemote && !gamePaired);
        cpuBtn.classList.toggle('active', vsCPU);

        const showGameElements = !(pvpRemoteActive && !gamePaired);
        document.getElementById('game').style.display = showGameElements ? 'grid' : 'none';
        document.getElementById('results').style.display = showGameElements ? 'block' : 'none';
        
        // Only show QR display area if hosting and not yet paired (for Room ID)
        qrDisplayArea.style.display = (pvpRemoteActive && iAmPlayer1InRemote && !gamePaired) ? 'block' : 'none';
        // qrInputArea.style.display = 'none'; // Generally not needed now

        difficultyDiv.style.display = vsCPU ? 'flex' : 'none';
        // ... (rest of difficulty, game-start-options, theme/sound toggles remain the same)
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

    function init(){
        removeConfetti();
        hideOverlay();
        qrDisplayArea.style.display = 'none'; // Ensure QR display for Room ID is hidden on general init
        
        if (pvpRemoteActive && !gamePaired && window.rtcMultiplayer && typeof window.rtcMultiplayer.closeSession === "function") { 
            window.rtcMultiplayer.closeSession(); // Clean up RTC if trying to init while in a non-paired remote state
        }

        board=Array(9).fill(null);
        // ... (rest of init logic for difficulty, gameActive, currentPlayer setup for local/CPU modes remains the same)
        difficulty = easyBtn.classList.contains('active')?'easy':hardBtn.classList.contains('active')?'hard':'medium';
        gameActive = false; 

        if (pvpRemoteActive && gamePaired) {
            currentPlayer = iAmPlayer1InRemote ? currentSymbols.player1 : currentSymbols.player2;
            isMyTurnInRemote = iAmPlayer1InRemote; 
            statusDiv.textContent = isMyTurnInRemote ? `Tu Turno ${getPlayerName(currentPlayer)}` : `Esperando a ${getPlayerName(currentPlayer)}...`;
            setBoardClickable(isMyTurnInRemote);
            gameActive = true;
        } else if (pvpRemoteActive && !gamePaired) {
            statusDiv.textContent = iAmPlayer1InRemote ? "Host: Comparte el ID de Sala." : "Join: Ingresa el ID de Sala.";
            setBoardClickable(false);
        } else if (vsCPU) {
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
        } else { // Local PvP
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
        // ... (rest of UI reset remains the same)
        statusDiv.classList.remove('highlight','highlight-draw-flash');
        gameBoardEl.classList.remove('highlight-draw-border');
        gameBoardEl.style.borderColor='';gameBoardEl.style.boxShadow='';
        
        updateAllUIToggleButtons();
        if(gameActive && !(pvpRemoteActive && !isMyTurnInRemote)) playSound('reset');
        
        sideMenu.classList.remove('open');
    }

    function stopAnyGameInProgress() {
        gameActive = false;
        if (window.rtcMultiplayer && typeof window.rtcMultiplayer.closeSession === "function") {
            window.rtcMultiplayer.closeSession();
        }
        board = Array(9).fill(null); 
        cells.forEach(c => { c.querySelector('span').textContent = ''; c.classList.remove('rainbow', 'disabled'); });
        removeConfetti();
        hideOverlay();
        qrDisplayArea.style.display = 'none';
    }

    // ----- WebRTC Callbacks for game.js -----
    const rtcExternalCallbacks = {
        onDataChannelOpen: () => {
            console.log("GAME.JS (FB): Data channel opened!");
            gamePaired = true;
            hideOverlay();
            qrDisplayArea.style.display = 'none'; // Hide Room ID QR once connected
            statusDiv.textContent = `¡Conectado! ${iAmPlayer1InRemote ? "Eres Jugador 1 (🦄)." : "Eres Jugador 2 (❤️)."}`;
            playSound('win');
            init(); // Re-initialize game board for the remote session (sets turns etc.)
        },
        onDataReceived: (data) => {
            console.log("GAME.JS (FB): Data received:", data);
            if (!gameActive || !pvpRemoteActive || isMyTurnInRemote || !gamePaired) {
                 console.warn("GAME.JS (FB): Received data but not expecting it or game not in correct state.", {isMyTurnInRemote, gameActive, pvpRemoteActive, gamePaired});
                 return;
            }
            if (data.type === 'move' && typeof data.index === 'number') {
                handleRemoteMoveDetected(data.index);
            } else if (data.type === 'restart_request') {
                if(confirm("Oponente quiere reiniciar. ¿Aceptar?")){ // [TODO] Use a nicer modal
                    sendRTCMessage({ type: 'restart_ack' }); // Send ack before init for other player
                    init(); // Local init
                }
            } else if (data.type === 'restart_ack') {
                alert("Reinicio aceptado por oponente."); // [TODO] Use a nicer modal
                init();
            }
        },
        onConnectionStateChange: (state) => {
            console.log("GAME.JS (FB): Connection state changed:", state);
            statusDiv.textContent = `RTC Estado: ${state}`;
            if (state !== 'connected' && state !== 'connecting' && state !== 'new') { // 'new' is initial state
                showOverlay(`Conexión: ${state}`);
            }

            if (state === 'connected') {
                hideOverlay();
                qrDisplayArea.style.display = 'none'; // Ensure QR area is hidden
            } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
                showOverlay(`Desconectado o falló la conexión.`);
                qrDisplayArea.style.display = 'none';
                if (pvpRemoteActive) { 
                    // alert("La conexión con el otro jugador se perdió o falló."); // Can be disruptive
                    pvpRemoteActive = false; gamePaired = false;
                    init(); // Reset to local mode
                }
            }
        }
    };
    
    // Helper to generate a simple Room ID
    function generateRoomId(length = 6) {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed I,O,0,1 for less confusion
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // Function to display Room ID as QR (optional)
    function displayRoomIDForQR(title, dataString) {
        if (!qrCodeCanvas || !qrTextData || !qrDisplayArea) {
            console.warn("QR display elements for Room ID not found!");
            return;
        }
        qrTextData.value = dataString; // Show Room ID as text
        try {
            new QRious({
                element: qrCodeCanvas,
                value: dataString, // Room ID
                size: 150, // Smaller QR for Room ID
                padding: 5,
                level: 'M' // Medium error correction
            });
            qrDisplayArea.querySelector('h3').textContent = title;
            qrDisplayArea.style.display = 'block';
        } catch (e) {
            console.error("Error generating QR for Room ID:", e);
            qrCodeCanvas.getContext('2d').clearRect(0,0,qrCodeCanvas.width, qrCodeCanvas.height);
            qrDisplayArea.querySelector('h3').textContent = title + " (Error al generar QR)";
            qrDisplayArea.style.display = 'block'; // Still show text
        }
    }


    async function handleHostGame() {
        stopAnyGameInProgress();
        pvpRemoteActive = true; vsCPU = false; iAmPlayer1InRemote = true; gamePaired = false;
        updateAllUIToggleButtons();

        const roomId = generateRoomId();
        statusDiv.textContent = `Host: Tu ID de Sala es: ${roomId}`;
        showOverlay(`Comparte este ID de Sala: ${roomId}\nEsperando que Jugador 2 se una...`);
        
        // Display Room ID as text and optionally QR
        displayRoomIDForQR(`ID de Sala (Comparte con Jugador 2):`, roomId);

        if (!window.rtcMultiplayer || !window.rtcMultiplayer.initSession || !window.rtcMultiplayer.createOffer) {
            console.error("Funciones RTC no disponibles. Revisa la carga de webrtc-multiplayer.js.");
            showOverlay("Error: Funciones RTC no encontradas.");
            return;
        }

        window.rtcMultiplayer.initSession(true /* isHost */, roomId, rtcExternalCallbacks);
        await window.rtcMultiplayer.createOffer(); // Host creates and sends offer via Firebase
    }

    async function handleJoinGame() {
        stopAnyGameInProgress();
        pvpRemoteActive = true; vsCPU = false; iAmPlayer1InRemote = false; gamePaired = false;
        updateAllUIToggleButtons();
        qrDisplayArea.style.display = 'none'; // Joiner doesn't show QR initially

        const roomId = prompt("Jugador 2: Ingresa el ID de Sala proporcionado por el Host:");
        if (!roomId || roomId.trim() === "") {
            alert("ID de Sala inválido o cancelado.");
            pvpRemoteActive = false; 
            init(); // Reset to a known state
            return;
        }

        statusDiv.textContent = `Uniéndote a la sala ${roomId}...`;
        showOverlay(`Intentando unirse a la sala ${roomId}...`);

        if (!window.rtcMultiplayer || !window.rtcMultiplayer.initSession) {
            console.error("Funciones RTC no disponibles. Revisa la carga de webrtc-multiplayer.js.");
            showOverlay("Error: Funciones RTC no encontradas.");
            return;
        }
        
        // Joiner initializes session; offer will be received via Firebase callback
        window.rtcMultiplayer.initSession(false /* isHost */, roomId, rtcExternalCallbacks);
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
    function handleCellClick(e){
        const idx = +e.currentTarget.dataset.index;
        if (!gameActive || board[idx] !== null ) return;
        if (pvpRemoteActive && (!isMyTurnInRemote || !gamePaired)) {
            if (gamePaired) alert("No es tu turno."); else alert("El juego no está emparejado aún o esperando al otro jugador.");
            return;
        }

        if (!makeMove(idx, currentPlayer)) return; 

        if (pvpRemoteActive && gamePaired) {
            if (window.rtcMultiplayer && typeof window.rtcMultiplayer.sendMessage === "function") {
                window.rtcMultiplayer.sendMessage({ type: 'move', index: idx }); 
            } else {
                 console.error("rtcMultiplayer.sendMessage is not defined!");
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
    
    // cpuMove, randomMove, bestMove, checkWin, checkDraw, endGame, endDraw, switchPlayer,
    // updateScoreboard, playSound, toggleTheme, toggleSound, changeSymbols
    // remain the same as your previous full game.js, but ensure endGame/endDraw call closeSession
    function cpuMove(){ 
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
    function randomMove(){
        const a=board.map((v,i)=>v===null?i:null).filter(v=>v!==null);
        return a.length? a[Math.floor(Math.random()*a.length)] : null;
    }
    function bestMove(){
        for(let i=0;i<9;i++)if(!board[i]){board[i]=currentSymbols.player2;if(checkWin(currentSymbols.player2)){board[i]=null;return i;}board[i]=null;}
        for(let i=0;i<9;i++)if(!board[i]){board[i]=currentSymbols.player1;if(checkWin(currentSymbols.player1)){board[i]=null;return i;}board[i]=null;}
        if(board[4]===null) return 4;
        const corners=[0,2,6,8].filter(i=>board[i]===null);
        if(corners.length) return corners[Math.floor(Math.random()*corners.length)];
        return randomMove();
    }
    function checkWin(playerSymbol, currentBoard = board){
        const c=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
        return c.find(combo=>combo.every(i=>currentBoard[i]===playerSymbol))||null;
    }
    function checkDraw(currentBoard = board){ 
        return currentBoard.every(cell=>cell!==null) && !checkWin(currentSymbols.player1, currentBoard) && !checkWin(currentSymbols.player2, currentBoard);
    }
    function endGame(playerSymbol, winningCells){
        if(!gameActive && !(pvpRemoteActive && gamePaired)) return; 
        gameActive=false; 
        setBoardClickable(false);
        hideOverlay();
        qrDisplayArea.style.display = 'none';
        
        if (pvpRemoteActive && gamePaired && window.rtcMultiplayer && typeof window.rtcMultiplayer.closeSession === "function") { 
             setTimeout(() => window.rtcMultiplayer.closeSession(), 1000); 
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
    function endDraw(){
        if(!gameActive && !(pvpRemoteActive && gamePaired)) return;
        gameActive=false; 
        setBoardClickable(false);
        hideOverlay();
        qrDisplayArea.style.display = 'none';

        if (pvpRemoteActive && gamePaired && window.rtcMultiplayer && typeof window.rtcMultiplayer.closeSession === "function") {
             setTimeout(() => window.rtcMultiplayer.closeSession(), 1000);
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
    function switchPlayer(){
        currentPlayer = (currentPlayer===currentSymbols.player1)?currentSymbols.player2:currentSymbols.player1;
    }
    function updateScoreboard(){
        unicornSpan.textContent=unicornWins;heartSpan.textContent=heartWins;drawsSpan.textContent=draws;
    }
    function playSound(type){
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
    function toggleTheme(){
        document.body.classList.toggle('dark-theme');
        localStorage.setItem('darkTheme',document.body.classList.contains('dark-theme'));
        updateAllUIToggleButtons(); playSound('move');
    }
    function toggleSound(){
        soundEnabled=!soundEnabled;localStorage.setItem('soundDisabled',!soundEnabled);
        if(soundEnabled) initAudioOnInteraction(); else {
            if(audioCtx&&audioCtx.state==='running') audioCtx.suspend().catch(e => console.error("Error suspending audio context:", e));
            hideOverlay(); 
        }
        updateAllUIToggleButtons(); if(soundEnabled) playSound('move');
    }
    function changeSymbols(){
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
    // Event listeners for cells, restartBtn, restartIcon, pvpLocalBtn, hostGameBtn, joinGameBtn, cpuBtn,
    // difficulty buttons, start-option buttons, changeSymbolsBtn, themeToggle, soundToggle
    // remain the same as your previous full game.js
    cells.forEach(c=>{c.addEventListener('click',handleCellClick);c.setAttribute('tabindex','0');c.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();c.click();}});});
    const restartBtn = document.getElementById('restartBtn'); // Ensure it's defined if used, though it's hidden
    if(restartBtn) restartBtn.addEventListener('click',init); 
    
    restartIcon.addEventListener('click', () => { 
        stopAnyGameInProgress(); 
        if (pvpRemoteActive) { 
            pvpRemoteActive = false; gamePaired = false;      
        }
        init(); 
        if (sideMenu.classList.contains('open')) sideMenu.classList.remove('open');
    });
    pvpLocalBtn.addEventListener('click',()=>{ 
        stopAnyGameInProgress();
        vsCPU=false;
        if (pvpRemoteActive) { }
        pvpRemoteActive = false; gamePaired = false;
        init(); 
    });
    hostGameBtn.addEventListener('click', handleHostGame);
    joinGameBtn.addEventListener('click', handleJoinGame);
    cpuBtn.addEventListener('click',()=>{ 
        stopAnyGameInProgress();
        vsCPU=true;
        if (pvpRemoteActive) {}
        pvpRemoteActive = false; gamePaired = false;
        init(); 
    });
    [easyBtn,mediumBtn,hardBtn].forEach(btn=>btn.addEventListener('click',e=>{ 
        difficulty=e.target.id.replace('Btn','');
        updateAllUIToggleButtons();
        playSound('move');
        if(!gameActive || vsCPU) init(); 
    }));
    [player1StartsBtn,randomStartsBtn,loserStartsBtn].forEach(btn=>btn.addEventListener('click',e=>{ 
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
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('./sw.js') // Assuming sw.js is still relevant
      .then(reg => console.log('SW registered!', reg))
      .catch(err=>console.error('SW registration failed:',err));
  });
}