/****************************************************
 * GAME LOGIC *
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

    // Destructure sound functions from window for clarity and to avoid scope issues
    // Ensure these are available from sound-multiplayer.js
    const {
        sendPairingRequest: sndPairRequest, // Renamed to avoid conflict if local var exists
        startListeningForSounds: listenForSnd,
        sendPairingAccept: sndPairAccept,
        sendHostAck: sndHostAck,
        stopListening: stopSndListening,
        sendMoveViaSound: sndMove,
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

    /* ----------  CONFETTI & DRAW ANIMATION  ---------- */
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

    /* ----------  LÓGICA PRINCIPAL  ---------- */
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

        document.getElementById('game').style.display = (pvpRemoteActive && !gamePaired) ? 'none' : 'grid';
        document.getElementById('results').style.display = (pvpRemoteActive && !gamePaired) ? 'none' : 'block';

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

    function init(){
        removeConfetti();
        if (typeof hideOverlay === "function") hideOverlay(); else console.warn("hideOverlay is not defined");
        if (typeof stopSndListening === "function") stopSndListening();  else console.warn("stopSndListening is not defined");


        board=Array(9).fill(null);
        difficulty = easyBtn.classList.contains('active')?'easy':hardBtn.classList.contains('active')?'hard':'medium';
        gameActive = false; 

        if (pvpRemoteActive && gamePaired) {
            currentPlayer = iAmPlayer1InRemote ? currentSymbols.player1 : currentSymbols.player2;
            isMyTurnInRemote = iAmPlayer1InRemote; 
            statusDiv.textContent = isMyTurnInRemote ? `Tu Turno ${getPlayerName(currentPlayer)}` : `Esperando a ${getPlayerName(currentPlayer)}...`;
            setBoardClickable(isMyTurnInRemote);
            gameActive = true;
            if (!isMyTurnInRemote) {
                listenForRemoteMove();
            }
        } else if (pvpRemoteActive && !gamePaired) {
            // This state is handled by handleHostGame/handleJoinGame UI updates.
            // init() might be called after pairing, so this branch handles if it's called *before* full pairing.
            statusDiv.textContent = iAmPlayer1InRemote ? "Esperando que alguien se una..." : "Buscando juego hosteado...";
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
        statusDiv.classList.remove('highlight','highlight-draw-flash');
        gameBoardEl.classList.remove('highlight-draw-border');
        gameBoardEl.style.borderColor='';gameBoardEl.style.boxShadow='';
        
        updateAllUIToggleButtons();
        if(gameActive) playSound('reset');
        
        sideMenu.classList.remove('open');
    }

    function stopAnyGameInProgress() {
        gameActive = false;
        if (typeof stopSndListening === "function") stopSndListening(); else console.warn("stopSndListening is not defined");
        board = Array(9).fill(null); 
        cells.forEach(c => { c.querySelector('span').textContent = ''; c.classList.remove('rainbow', 'disabled'); });
        removeConfetti();
        if (typeof hideOverlay === "function") hideOverlay(); else console.warn("hideOverlay is not defined");
    }

    function handleHostGame() {
        stopAnyGameInProgress();
        pvpRemoteActive = true;
        vsCPU = false;
        iAmPlayer1InRemote = true;
        gamePaired = false;
        updateAllUIToggleButtons();
        statusDiv.textContent = "Hosteando... Enviando señal de pairing.";
        if (typeof showOverlay === "function") showOverlay("Enviando señal para que otro jugador se una... 🔊"); else console.warn("showOverlay is not defined");
        
        if (typeof sndPairRequest !== "function" || typeof listenForSnd !== "function") {
            console.error("Sound functions (sndPairRequest or listenForSnd) not defined!");
            statusDiv.textContent = "Error: Funciones de sonido no encontradas.";
            if (typeof hideOverlay === "function") hideOverlay();
            return;
        }

        sndPairRequest(); 
        listenForSnd('pair_accept', (signal) => {
            if (signal === 'pair_accept_detected') {
                statusDiv.textContent = "Jugador encontrado! Enviando ACK final...";
                if (typeof sndHostAck !== "function") {
                    console.error("sndHostAck function not defined! Cannot complete handshake.");
                    statusDiv.textContent = "Error crítico en handshake! (ACK)";
                     if (typeof hideOverlay === "function") hideOverlay();
                    return; 
                }
                
                sndHostAck(); // HOST sends final ACK
                
                gamePaired = true;
                if (typeof hideOverlay === "function") hideOverlay();
                playSound('win'); 
                statusDiv.textContent = "¡Conectado! Eres Jugador 1 (🦄). Iniciando...";
                init(); 
            } else {
                // This path might be taken if stopListening was called by another instance
                // or if a non-target sound was strong enough but filtered out by type.
                // Consider adding a timeout or retry limit for robustness.
                // if (gamePaired) return; // Already paired by a rapid subsequent signal.
                console.log("Host: 'pair_accept' not detected or unexpected signal:", signal);
                // statusDiv.textContent = "Esperando aceptación del jugador..."; // Keep UI indicating listening
            }
        });
    }

    function handleJoinGame() {
        stopAnyGameInProgress();
        pvpRemoteActive = true;
        vsCPU = false;
        iAmPlayer1InRemote = false;
        gamePaired = false;
        updateAllUIToggleButtons(); 
        statusDiv.textContent = "Buscando juego... Escuchando señal de pairing.";
        if (typeof showOverlay === "function") showOverlay("Escuchando para unirse a un juego... 🔊"); else console.warn("showOverlay is not defined");


        if (typeof listenForSnd !== "function" || typeof sndPairAccept !== "function") {
            console.error("Sound functions (listenForSnd or sndPairAccept) not defined!");
            statusDiv.textContent = "Error: Funciones de sonido no encontradas.";
            if (typeof hideOverlay === "function") hideOverlay();
            return;
        }

        listenForSnd('pair_request', (signal) => {
            if (signal === 'pair_request_detected') {
                if (typeof hideOverlay === "function") hideOverlay();
                statusDiv.textContent = "Juego encontrado! Enviando aceptación y esperando ACK del Host...";
                playSound('move'); 
                sndPairAccept(); 

                if (typeof showOverlay === "function") showOverlay("Esperando confirmación final del Host... 🔊");
                listenForSnd('host_ack', (ackSignal) => {
                    if (ackSignal === 'host_ack_detected') {
                        gamePaired = true;
                        if (typeof hideOverlay === "function") hideOverlay();
                        playSound('win'); 
                        statusDiv.textContent = "¡Conectado y confirmado! Eres Jugador 2 (❤️). Iniciando...";
                        init(); 
                    } else {
                        console.log("Joiner: 'host_ack' not detected or unexpected signal:", ackSignal);
                        if (typeof showOverlay === "function") showOverlay("Error de confirmación. Intenta unirte de nuevo.");
                        // Consider resetting state:
                        // pvpRemoteActive = false; gamePaired = false; init(); // Go back to main menu essentially
                    }
                });
            } else {
                 console.log("Joiner: 'pair_request' not detected or unexpected signal:", signal);
                // statusDiv.textContent = "No se encontró juego hosteado...";
            }
        });
    }

    function makeMove(index, playerSymbol){
        if (board[index] !== null) return false; 
        board[index]=playerSymbol;
        cells[index].querySelector('span').textContent=playerSymbol;
        cells[index].classList.add('disabled');
        cells[index].style.animation='cellSelectAnim .3s ease';
        setTimeout(()=>cells[index].style.animation='',300);
        playSound('move');
        return true;
    }

    function listenForRemoteMove() {
        if (!pvpRemoteActive || isMyTurnInRemote || !gameActive || !gamePaired) {
            console.log("Not listening for remote move:", {pvpRemoteActive, isMyTurnInRemote, gameActive, gamePaired});
            return;
        }
        if (typeof showOverlay === "function") showOverlay(`Esperando el movimiento de ${getPlayerName(currentPlayer)}... 🔊`); else console.warn("showOverlay is not defined");
        
        if (typeof listenForSnd !== "function") {
            console.error("listenForSnd is not defined!");
            if (typeof hideOverlay === "function") hideOverlay();
            statusDiv.textContent = "Error crítico: Escucha de sonidos no disponible.";
            return;
        }
        listenForSnd('move', handleRemoteMoveDetected);
    }

    function handleRemoteMoveDetected(indexOrSignal) {
        if (typeof hideOverlay === "function") hideOverlay(); else console.warn("hideOverlay is not defined");

        if (typeof indexOrSignal !== 'number' || indexOrSignal < 0 || indexOrSignal > 8) {
            console.warn("Invalid move detected or wrong signal type for move:", indexOrSignal);
            if (gameActive && pvpRemoteActive && !isMyTurnInRemote && gamePaired) {
                 console.log("Re-listening due to invalid signal for move.");
                 listenForRemoteMove(); 
            }
            return;
        }
        
        const index = indexOrSignal;

        if (!gameActive || board[index] !== null || !pvpRemoteActive || isMyTurnInRemote || !gamePaired) {
            console.warn("Remote move ignored due to invalid game state:", {index, gameActive, boardVal: board[index], pvpRemoteActive, isMyTurnInRemote, gamePaired});
            if (gameActive && pvpRemoteActive && !isMyTurnInRemote && gamePaired) {
                console.log("Re-listening due to invalid game state for received move.");
                listenForRemoteMove();
            }
            return;
        }

        if (!makeMove(index, currentPlayer)) { // currentPlayer is the opponent who just made the move
            console.error("Failed to make remote move on board, cell might be taken despite checks.");
             if (gameActive && pvpRemoteActive && !isMyTurnInRemote && gamePaired) listenForRemoteMove();
            return;
        }

        const win = checkWin(currentPlayer); 
        if (win) {
            endGame(currentPlayer, win);
            return;
        }
        if (checkDraw()) {
            endDraw();
            return;
        }

        switchPlayer(); 
        isMyTurnInRemote = true; 
        statusDiv.textContent = `Tu Turno ${getPlayerName(currentPlayer)}`;
        setBoardClickable(true);
    }

    function handleCellClick(e){
        const idx = +e.currentTarget.dataset.index;
        
        if (!gameActive || board[idx] !== null ) return;
        if (pvpRemoteActive && (!isMyTurnInRemote || !gamePaired)) return;

        if (!makeMove(idx, currentPlayer)) return; 

        if (pvpRemoteActive && gamePaired) {
            if (typeof sndMove !== "function") {
                 console.error("sndMove is not defined!");
                 statusDiv.textContent = "Error: Función para enviar sonido no disponible.";
                 return;
            }
            sndMove(idx); 
        }

        const win = checkWin(currentPlayer);
        if(win){ endGame(currentPlayer,win); return; }
        if(checkDraw()){ endDraw(); return; }

        switchPlayer(); 

        if (pvpRemoteActive && gamePaired) {
            isMyTurnInRemote = false; 
            statusDiv.textContent = `Esperando a ${getPlayerName(currentPlayer)}...`; 
            setBoardClickable(false);
            listenForRemoteMove();
        } else if(vsCPU && currentPlayer===currentSymbols.player2){ 
            setBoardClickable(false);
            setTimeout(()=>{ if(gameActive) cpuMove(); if(gameActive) setBoardClickable(true);},700+Math.random()*300);
        }
    }
    
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
        if(!gameActive) return; 
        gameActive=false; 
        setBoardClickable(false);
        if (typeof hideOverlay === "function") hideOverlay(); else console.warn("hideOverlay is not defined");
        if(typeof stopSndListening === "function") stopSndListening(); else console.warn("stopSndListening is not defined");

        if(winningCells) winningCells.forEach(i=>cells[i].classList.add('rainbow'));
        statusDiv.textContent=`¡${getPlayerName(playerSymbol)} ganó!`; statusDiv.classList.add('highlight');
        
        if(playerSymbol===currentSymbols.player1){unicornWins++;localStorage.setItem('unicornWins',unicornWins);lastWinner=currentSymbols.player1;}
        else{heartWins++;localStorage.setItem('heartWins',heartWins);lastWinner=currentSymbols.player2;}
        previousGameExists=true; 
        updateScoreboard(); 
        playSound('win'); 
        launchConfetti();

        const autoRestartDelay = (pvpRemoteActive && gamePaired) ? AUTO_RESTART_DELAY_WIN + 2000 : AUTO_RESTART_DELAY_WIN;
        setTimeout(()=>{removeConfetti(); init();}, autoRestartDelay);
    }

    function endDraw(){
        if(!gameActive) return;
        gameActive=false; 
        setBoardClickable(false);
        if (typeof hideOverlay === "function") hideOverlay(); else console.warn("hideOverlay is not defined");
        if(typeof stopSndListening === "function") stopSndListening(); else console.warn("stopSndListening is not defined");

        statusDiv.textContent='¡Empate!'; statusDiv.classList.add('highlight');
        draws++;localStorage.setItem('draws',draws);lastWinner=null;previousGameExists=true;
        updateScoreboard();
        playSound('draw');
        const animationDuration = playDrawAnimation();

        const autoRestartDelay = (pvpRemoteActive && gamePaired) ? Math.max(animationDuration + 200, AUTO_RESTART_DELAY_DRAW) + 2000 : Math.max(animationDuration + 200, AUTO_RESTART_DELAY_DRAW);
        setTimeout(()=>init(), autoRestartDelay);
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
            if(typeof stopSndListening === "function") stopSndListening(); else console.warn("stopSndListening is not defined");
            if (typeof hideOverlay === "function") hideOverlay(); else console.warn("hideOverlay is not defined");
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
    cells.forEach(c=>{c.addEventListener('click',handleCellClick);c.setAttribute('tabindex','0');c.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();c.click();}});});
    
    restartBtn.addEventListener('click',init); 

    restartIcon.addEventListener('click', () => {
        stopAnyGameInProgress(); 
        if (pvpRemoteActive) { 
            pvpRemoteActive = false; 
            gamePaired = false;      
        }
        init(); 
        if (sideMenu.classList.contains('open')) sideMenu.classList.remove('open');
    });

    pvpLocalBtn.addEventListener('click',()=>{
        stopAnyGameInProgress();
        vsCPU=false;
        pvpRemoteActive = false;
        gamePaired = false;
        init(); 
    });

    hostGameBtn.addEventListener('click', handleHostGame);
    joinGameBtn.addEventListener('click', handleJoinGame);
    
    cpuBtn.addEventListener('click',()=>{
        stopAnyGameInProgress();
        vsCPU=true;
        pvpRemoteActive = false;
        gamePaired = false;
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
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('SW registered!', reg))
      .catch(err=>console.error('SW registration failed:',err));
  });
}