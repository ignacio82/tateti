/****************************************************
 * GAME LOGIC (with PeerJS Multiplayer) *
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

    // QR Code related DOM Elements (for Host's PeerJS ID)
    const qrDisplayArea     = document.getElementById('qr-display-area');
    const qrCodeCanvas      = document.getElementById('qr-code-canvas');
    const qrTextData        = document.getElementById('qr-text-data');
    const qrTitle           = document.getElementById('qr-title');


    // PeerJS multiplayer functions from window.peerJsMultiplayer
    // These will be checked for existence before use.

    // Fallback for show/hide overlay if not provided by peerjs-multiplayer.js
    const showOverlay = window.showStatusOverlay || function(text) { 
        const overlay = document.getElementById('statusOverlay');
        if (overlay) {
            overlay.textContent = text;
            overlay.style.display = 'block';
        } else { console.log("Overlay:", text); }
    };
    const hideOverlay = window.hideStatusOverlay || function() { 
        const overlay = document.getElementById('statusOverlay');
        if (overlay) {
            overlay.style.display = 'none';
        } else { console.log("Hide Overlay"); }
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
    let iAmPlayer1InRemote = true; // Host is Player 1, Joiner is Player 2
    let gamePaired = false;        // True when PeerJS data connection is open

    let soundEnabled = !(localStorage.getItem('soundDisabled') === 'true');
    const symbolSet = [ /* ... (same as before) ... */ {player1:'🦄',player2:'❤️'},{player1:'🐱',player2:'🐶'},{player1:'🌞',player2:'🌙'},{player1:'❌',player2:'⭕'}];
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
    // setBoardClickable, getPlayerName remain the same.
    let audioCtx;
    function getAudioContext(){ if(!audioCtx && soundEnabled){try{audioCtx = new (window.AudioContext||window.webkitAudioContext)();}catch(e){console.error("AudioContext error",e);soundEnabled=false;soundToggle.textContent='🔇';localStorage.setItem('soundDisabled',true);return null;}} if(audioCtx && audioCtx.state==='suspended'){audioCtx.resume().catch(err=>console.error("Error resuming AudioContext:", err));} return audioCtx;}
    function initAudioOnInteraction(){ if(soundEnabled && !audioCtx){ getAudioContext(); } }
    function launchConfetti(){ if(!soundEnabled) return; const cC=['#ff3860','#ffdd57','#17d1a2','#3e8ed0','#b86bff','var(--pink)','var(--pink-dark)']; for(let i=0;i<100;i++){const c=document.createElement('div');c.classList.add('confetti');c.style.background=cC[Math.floor(Math.random()*cC.length)];c.style.left=`${Math.random()*100}vw`;c.style.top=`${Math.random()*-80-20}px`; const aD=Math.random()*2+3;const aDel=Math.random()*0.5;c.style.width=`${Math.random()*6+6}px`;c.style.height=`${Math.random()*10+8}px`;c.style.opacity=`${Math.random()*0.4+0.6}`;c.style.transform=`rotate(${Math.random()*360}deg) scale(${Math.random()*0.5+0.5})`;c.style.animation=`fall ${aD}s ease-out ${aDel}s forwards`;document.body.appendChild(c);setTimeout(()=>c.remove(),(aD+aDel)*1000+200);}}
    function removeConfetti(){ document.querySelectorAll('.confetti').forEach(c=>c.remove()); }
    function playDrawAnimation(){ const dur=1800; statusDiv.classList.add('highlight-draw-flash');gameBoardEl.classList.add('highlight-draw-border');setTimeout(()=>{statusDiv.classList.remove('highlight-draw-flash');gameBoardEl.classList.remove('highlight-draw-border');gameBoardEl.style.borderColor=''; gameBoardEl.style.boxShadow='';},dur);return dur;}
    function setBoardClickable(clickable){ cells.forEach(cN =>{ if(clickable){ board[cN.dataset.index] === null ? cN.classList.remove('disabled') : cN.classList.add('disabled');} else {cN.classList.add('disabled');}}); }
    function getPlayerName(sym){ if(sym===currentSymbols.player1)return `${sym} ${sym==='🦄'?'Unicornio':sym==='🐱'?'Gatito':sym==='🌞'?'Sol':'Equis'}`; if(sym===currentSymbols.player2)return `${sym} ${sym==='❤️'?'Corazón':sym==='🐶'?'Perrito':sym==='🌙'?'Luna':'Círculo'}`; return sym; }


    function updateAllUIToggleButtons(){
        pvpLocalBtn.classList.toggle('active', !vsCPU && !pvpRemoteActive);
        hostGameBtn.classList.toggle('active', pvpRemoteActive && iAmPlayer1InRemote && !gamePaired); // Host waiting
        joinGameBtn.classList.toggle('active', pvpRemoteActive && !iAmPlayer1InRemote && !gamePaired); // Joiner waiting
        cpuBtn.classList.toggle('active', vsCPU && !pvpRemoteActive);

        const showGameElements = !pvpRemoteActive || gamePaired; // Show game if local or remote&paired
        document.getElementById('game').style.display = showGameElements ? 'grid' : 'none';
        document.getElementById('results').style.display = showGameElements ? 'block' : 'none';
        
        // Show QR display area for Room ID if hosting and not yet paired
        if(qrDisplayArea) qrDisplayArea.style.display = (pvpRemoteActive && iAmPlayer1InRemote && !gamePaired) ? 'block' : 'none';

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
        hideOverlay();
        if(qrDisplayArea) qrDisplayArea.style.display = 'none';
        
        // If currently in a remote game setup that isn't paired, or if gamePaired, close session.
        if (pvpRemoteActive && window.peerJsMultiplayer && typeof window.peerJsMultiplayer.close === "function") {
            window.peerJsMultiplayer.close();
        }
        // Reset remote play flags for a fresh start if not explicitly set by host/join
        if (!hostGameBtn.classList.contains('active') && !joinGameBtn.classList.contains('active')) {
            pvpRemoteActive = false;
            gamePaired = false;
        }


        board=Array(9).fill(null);
        difficulty = easyBtn.classList.contains('active')?'easy':hardBtn.classList.contains('active')?'hard':'medium';
        gameActive = false; 

        if (pvpRemoteActive && gamePaired) {
            // Player turn and symbols are set when connection opens (onConnectionOpenCallback)
            // For now, Host starts
            currentPlayer = iAmPlayer1InRemote ? currentSymbols.player1 : currentSymbols.player2;
            isMyTurnInRemote = iAmPlayer1InRemote;
            statusDiv.textContent = isMyTurnInRemote ? `Tu Turno ${getPlayerName(currentPlayer)}` : `Esperando a ${getPlayerName(currentPlayer)}...`;
            setBoardClickable(isMyTurnInRemote);
            gameActive = true;
        } else if (pvpRemoteActive && !gamePaired) { // Waiting for connection
            statusDiv.textContent = iAmPlayer1InRemote ? "Host: Compartiendo ID..." : "Join: Ingresa ID del Host...";
            setBoardClickable(false);
        } else if (vsCPU) {
            // ... (CPU logic same as before) ...
            gameActive = true; switch(whoGoesFirstSetting){ case 'random': currentPlayer = Math.random()<.5?currentSymbols.player1:currentSymbols.player2; break; case 'loser': currentPlayer = (!previousGameExists||lastWinner===null)?currentSymbols.player1:(lastWinner===currentSymbols.player1?currentSymbols.player2:currentSymbols.player1); break; default: currentPlayer = currentSymbols.player1; } statusDiv.textContent = `Turno del ${getPlayerName(currentPlayer)}`; if(currentPlayer===currentSymbols.player2){ setBoardClickable(false); setTimeout(()=>{ if(gameActive) cpuMove(); if(gameActive) setBoardClickable(true);},700+Math.random()*300); } else { setBoardClickable(true); }
        } else { // Local PvP
            // ... (Local PvP logic same as before) ...
            gameActive = true; switch(whoGoesFirstSetting){ case 'random': currentPlayer = Math.random()<.5?currentSymbols.player1:currentSymbols.player2; break; case 'loser': currentPlayer = (!previousGameExists||lastWinner===null)?currentSymbols.player1:(lastWinner===currentSymbols.player1?currentSymbols.player2:currentSymbols.player1); break; default: currentPlayer = currentSymbols.player1; } statusDiv.textContent = `Turno del ${getPlayerName(currentPlayer)}`; setBoardClickable(true); }

        cells.forEach(c=>{c.querySelector('span').textContent='';c.classList.remove('rainbow','disabled');});
        statusDiv.classList.remove('highlight','highlight-draw-flash');
        gameBoardEl.classList.remove('highlight-draw-border');
        gameBoardEl.style.borderColor='';gameBoardEl.style.boxShadow='';
        
        updateAllUIToggleButtons();
        if(gameActive && !(pvpRemoteActive && !isMyTurnInRemote && gamePaired)) playSound('reset'); // Avoid sound if waiting for remote player & paired
        
        sideMenu.classList.remove('open');
    }

    function stopAnyGameInProgress() {
        gameActive = false;
        if (pvpRemoteActive && window.peerJsMultiplayer && typeof window.peerJsMultiplayer.close === "function") {
            window.peerJsMultiplayer.close();
        }
        pvpRemoteActive = false; // Reset this flag
        gamePaired = false;      // Reset this flag

        board = Array(9).fill(null); 
        cells.forEach(c => { c.querySelector('span').textContent = ''; c.classList.remove('rainbow', 'disabled'); });
        removeConfetti();
        hideOverlay();
        if(qrDisplayArea) qrDisplayArea.style.display = 'none';
    }

    // ----- PeerJS Callbacks -----
    const peerJsCallbacks = {
        onPeerOpen: (id) => { // Host receives this
            if (iAmPlayer1InRemote) {
                console.log("GAME.JS: Host Peer ID:", id);
                statusDiv.textContent = `Tu ID de Host: ${id}. Comparte con Jugador 2.`;
                showOverlay(`Tu ID de Host: ${id}. Esperando conexión...`);
                if (qrTextData) qrTextData.value = id;
                if (qrCodeCanvas && typeof QRious !== 'undefined') {
                    try {
                        new QRious({ element: qrCodeCanvas, value: id, size: 150, padding: 5, level: 'M' });
                        if(qrTitle) qrTitle.textContent = "Tu ID de Host (Peer ID):";
                        if(qrDisplayArea) qrDisplayArea.style.display = 'block';
                    } catch (e) { console.error("Error generando QR para Peer ID:", e); }
                }
            }
        },
        onNewConnection: (conn) => { // Host receives this when joiner attempts to connect
            console.log("GAME.JS: Nuevo intento de conexión de:", conn.peer);
            showOverlay(`Jugador ${conn.peer.slice(-4)} quiere conectarse...`);
            // Connection will proceed to 'open' if successful, handled by onConnectionOpen
        },
        onConnectionOpen: () => { // Both Host and Joiner receive this
            console.log("GAME.JS: PeerJS connection abierta!");
            gamePaired = true;
            hideOverlay();
            if(qrDisplayArea) qrDisplayArea.style.display = 'none'; // Hide Peer ID display

            // Determine turns: Host (Player 1) starts
            iAmPlayer1InRemote = (window.peerJsMultiplayer && window.peerJsMultiplayer.getLocalId() && currentHostPeerId === window.peerJsMultiplayer.getLocalId());
            // The above logic for iAmPlayer1InRemote might be tricky if currentHostPeerId is not set globally.
            // Simpler: Host is P1, Joiner is P2. Host is the one who didn't call `connectToPeer`.
            // isMyTurnInRemote is set in init() based on iAmPlayer1InRemote after gamePaired is true.
            statusDiv.textContent = "¡Conectado! " + (iAmPlayer1InRemote ? "Empiezas tú (🦄)." : "Empieza el Host (🦄).");
            playSound('win');
            init(); // Re-initialize game board for the remote session
        },
        onDataReceived: (data) => {
            console.log("GAME.JS: Data received via PeerJS:", data);
            if (!gameActive || !pvpRemoteActive || isMyTurnInRemote || !gamePaired) {
                 console.warn("GAME.JS: Received data but not expecting it or game not in correct state.", {isMyTurnInRemote, gameActive, pvpRemoteActive, gamePaired});
                 return;
            }
            if (data.type === 'move' && typeof data.index === 'number') {
                handleRemoteMoveDetected(data.index);
            } else if (data.type === 'restart_request') {
                if(confirm("Oponente quiere reiniciar. ¿Aceptar?")){
                    if(window.peerJsMultiplayer && typeof window.peerJsMultiplayer.send === "function") {
                        window.peerJsMultiplayer.send({ type: 'restart_ack' });
                    }
                    init();
                }
            } else if (data.type === 'restart_ack') {
                alert("Reinicio aceptado por oponente.");
                init();
            }
        },
        onConnectionClose: () => {
            console.log("GAME.JS: PeerJS connection cerrada.");
            showOverlay("El otro jugador se desconectó.");
            alert("Conexión cerrada con el otro jugador.");
            stopAnyGameInProgress(); // This will set pvpRemoteActive = false
            init(); // Reset to main screen
        },
        onError: (err) => {
            console.error("GAME.JS: PeerJS Error:", err);
            let message = "Error de PeerJS: ";
            if (typeof err === 'string') message += err;
            else if (err.type) message += `${err.type} - ${err.message || ''}`;
            else if (err.message) message += err.message;
            else message += "Error desconocido.";
            
            showOverlay(message);
            statusDiv.textContent = message;
            // alert(message); // Can be disruptive
            
            // If connection fails during setup, reset state
            if (!gamePaired && pvpRemoteActive) {
                stopAnyGameInProgress();
                init();
            }
        }
    };
    
    let currentHostPeerId = null; // Store host peer ID for joiner

    async function handleHostGame() {
        stopAnyGameInProgress(); // Close any existing session
        pvpRemoteActive = true; 
        vsCPU = false; 
        iAmPlayer1InRemote = true; // Host is player 1
        gamePaired = false;
        updateAllUIToggleButtons(); // Show "Host: Compartiendo ID..."
        statusDiv.textContent = "Host: Obteniendo ID de PeerJS...";
        showOverlay("Iniciando sesión de Host...");

        if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.init === "function") {
            window.peerJsMultiplayer.init(null, peerJsCallbacks);
            // onPeerOpen callback will display the ID
        } else {
            alert("Error: PeerJS no está cargado correctamente.");
            stopAnyGameInProgress(); init();
        }
    }

    async function handleJoinGame() {
        stopAnyGameInProgress(); // Close any existing session
        pvpRemoteActive = true; 
        vsCPU = false; 
        iAmPlayer1InRemote = false; // Joiner is player 2
        gamePaired = false;
        updateAllUIToggleButtons(); // Show "Join: Ingresa ID del Host..."
        if(qrDisplayArea) qrDisplayArea.style.display = 'none';

        const hostId = prompt("Jugador 2: Ingresa el ID del Host:");
        if (!hostId || hostId.trim() === "") {
            alert("ID de Host inválido o cancelado.");
            stopAnyGameInProgress(); init();
            return;
        }
        currentHostPeerId = hostId.trim(); // Store for potential future use / validation

        statusDiv.textContent = `Uniéndote a ${currentHostPeerId}...`;
        showOverlay(`Intentando conectarse al Host ${currentHostPeerId}...`);

        if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.init === "function" && typeof window.peerJsMultiplayer.connect === "function") {
            // Joiner also needs to init its own peer object first
            window.peerJsMultiplayer.init(null, {
                ...peerJsCallbacks, // Use all standard callbacks
                onPeerOpen: (myId) => { // Joiner gets its own ID too
                    console.log("GAME.JS: Joiner Peer ID:", myId);
                    // Now that joiner's peer is open, try to connect to host
                    window.peerJsMultiplayer.connect(currentHostPeerId);
                }
            });
        } else {
            alert("Error: PeerJS no está cargado correctamente.");
            stopAnyGameInProgress(); init();
        }
    }

    function makeMove(index, playerSymbol){ /* ... (same as before) ... */ if (board[index] !== null) return false; board[index]=playerSymbol; cells[index].querySelector('span').textContent=playerSymbol; cells[index].classList.add('disabled'); cells[index].style.animation='cellSelectAnim .3s ease'; setTimeout(()=>cells[index].style.animation='',300); playSound('move'); return true;}
    
    function handleRemoteMoveDetected(index) {
        hideOverlay(); 
        if (typeof index !== 'number' || index < 0 || index > 8) {
            console.warn("GAME.JS: Invalid remote move index:", index);
            return;
        }
        // CurrentPlayer here is the opponent who made the move (because switchPlayer would have happened on their side)
        if (!makeMove(index, currentPlayer)) { 
            console.error("GAME.JS: Failed to make remote move on board.");
            return;
        }
        const win = checkWin(currentPlayer); 
        if (win) { endGame(currentPlayer, win); return; }
        if (checkDraw()) { endDraw(); return; }
        
        // Switch to local player's turn
        switchPlayer(); 
        isMyTurnInRemote = true; 
        statusDiv.textContent = `Tu Turno ${getPlayerName(currentPlayer)}`;
        setBoardClickable(true);
    }

    function handleCellClick(e){
        const idx = +e.currentTarget.dataset.index;
        if (!gameActive || board[idx] !== null ) return;
        
        if (pvpRemoteActive && (!gamePaired || !isMyTurnInRemote)) {
            if (!gamePaired) alert("Esperando conexión con el otro jugador.");
            else alert("No es tu turno.");
            return;
        }

        if (!makeMove(idx, currentPlayer)) return; 

        if (pvpRemoteActive && gamePaired && isMyTurnInRemote) { // Send move if it's a paired remote game and my turn
            if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.send === "function") {
                window.peerJsMultiplayer.send({ type: 'move', index: idx }); 
            } else {
                 console.error("GAME.JS: peerJsMultiplayer.send is not defined!");
            }
        }

        const win = checkWin(currentPlayer);
        if(win){ endGame(currentPlayer,win); return; }
        if(checkDraw()){ endDraw(); return; }

        switchPlayer(); 
        
        if (pvpRemoteActive && gamePaired) {
            isMyTurnInRemote = false; // After my move, it's not my turn
            statusDiv.textContent = `Esperando a ${getPlayerName(currentPlayer)}...`; 
            setBoardClickable(false);
        } else if(vsCPU && currentPlayer===currentSymbols.player2){ 
            statusDiv.textContent = `Turno del ${getPlayerName(currentPlayer)}`; // Update status
            setBoardClickable(false);
            setTimeout(()=>{ if(gameActive) cpuMove(); if(gameActive) setBoardClickable(true);},700+Math.random()*300);
        } else {
            statusDiv.textContent = `Turno del ${getPlayerName(currentPlayer)}`; // Update for local PvP
        }
    }
    
    function cpuMove(){ /* ... (same as before, ensure statusDiv is updated) ... */ if(!gameActive) return; let idx; switch(difficulty){ case 'easy': idx=randomMove(); break; case 'medium': idx=Math.random()<.75?bestMove():randomMove(); break; default: idx=bestMove(); } if(idx===null || board[idx]!==null) idx=randomMove(); if(idx===null){ if(checkDraw()) endDraw(); return; } makeMove(idx,currentSymbols.player2); const win=checkWin(currentSymbols.player2); if(win){ endGame(currentSymbols.player2,win); return; } if(checkDraw()){ endDraw(); return; } switchPlayer(); statusDiv.textContent = `Turno del ${getPlayerName(currentPlayer)}`; }
    function randomMove(){ /* ... (same as before) ... */ const a=board.map((v,i)=>v===null?i:null).filter(v=>v!==null); return a.length? a[Math.floor(Math.random()*a.length)] : null; }
    function bestMove(){ /* ... (same as before) ... */ for(let i=0;i<9;i++)if(!board[i]){board[i]=currentSymbols.player2;if(checkWin(currentSymbols.player2)){board[i]=null;return i;}board[i]=null;} for(let i=0;i<9;i++)if(!board[i]){board[i]=currentSymbols.player1;if(checkWin(currentSymbols.player1)){board[i]=null;return i;}board[i]=null;} if(board[4]===null) return 4; const corners=[0,2,6,8].filter(i=>board[i]===null); if(corners.length) return corners[Math.floor(Math.random()*corners.length)]; return randomMove(); }
    function checkWin(playerSymbol, currentBoard = board){ /* ... (same as before) ... */ const c=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]; return c.find(combo=>combo.every(i=>currentBoard[i]===playerSymbol))||null;}
    function checkDraw(currentBoard = board){  /* ... (same as before) ... */ return currentBoard.every(cell=>cell!==null) && !checkWin(currentSymbols.player1, currentBoard) && !checkWin(currentSymbols.player2, currentBoard); }
    
    function endGame(playerSymbol, winningCells){ /* ... (ensure pvpRemoteActive is reset) ... */ if(!gameActive && !(pvpRemoteActive && gamePaired)) return; gameActive=false; setBoardClickable(false); hideOverlay(); if(qrDisplayArea) qrDisplayArea.style.display = 'none'; if (pvpRemoteActive && window.peerJsMultiplayer && typeof window.peerJsMultiplayer.close === "function") { setTimeout(() => window.peerJsMultiplayer.close(), 500); } if(winningCells) winningCells.forEach(i=>cells[i].classList.add('rainbow')); statusDiv.textContent=`¡${getPlayerName(playerSymbol)} ganó!`; statusDiv.classList.add('highlight'); if(playerSymbol===currentSymbols.player1){unicornWins++;localStorage.setItem('unicornWins',unicornWins);lastWinner=currentSymbols.player1;} else{heartWins++;localStorage.setItem('heartWins',heartWins);lastWinner=currentSymbols.player2;} previousGameExists=true; updateScoreboard(); playSound('win'); launchConfetti(); const autoRestartDelay = AUTO_RESTART_DELAY_WIN; setTimeout(()=>{ removeConfetti(); pvpRemoteActive = false; gamePaired = false; init(); }, autoRestartDelay); }
    function endDraw(){ /* ... (ensure pvpRemoteActive is reset) ... */ if(!gameActive && !(pvpRemoteActive && gamePaired)) return; gameActive=false; setBoardClickable(false); hideOverlay(); if(qrDisplayArea) qrDisplayArea.style.display = 'none'; if (pvpRemoteActive && window.peerJsMultiplayer && typeof window.peerJsMultiplayer.close === "function") { setTimeout(() => window.peerJsMultiplayer.close(), 500); } statusDiv.textContent='¡Empate!'; statusDiv.classList.add('highlight'); draws++;localStorage.setItem('draws',draws);lastWinner=null;previousGameExists=true; updateScoreboard(); playSound('draw'); const animationDuration = playDrawAnimation(); const autoRestartDelay = Math.max(animationDuration + 200, AUTO_RESTART_DELAY_DRAW); setTimeout(()=>{ pvpRemoteActive = false; gamePaired = false; init(); }, autoRestartDelay); }
    
    function switchPlayer(){ currentPlayer = (currentPlayer===currentSymbols.player1)?currentSymbols.player2:currentSymbols.player1; }
    function updateScoreboard(){ unicornSpan.textContent=unicornWins;heartSpan.textContent=heartWins;drawsSpan.textContent=draws; }
    function playSound(type){ if(!soundEnabled||!getAudioContext()|| (audioCtx && audioCtx.state!=='running') ) return; try{ const o=audioCtx.createOscillator();const g=audioCtx.createGain();o.connect(g);g.connect(audioCtx.destination); let f1=440,t=.2,gV=.08,wT='sine'; switch(type){ case'move':f1=300+Math.random()*200;t=.15;gV=.06;wT='triangle';break; case'win':f1=600;const f2=900,f3=1200;t=.7;gV=.1;wT='sawtooth';o.frequency.setValueAtTime(f1,audioCtx.currentTime);o.frequency.linearRampToValueAtTime(f2,audioCtx.currentTime+t*.33);o.frequency.linearRampToValueAtTime(f3,audioCtx.currentTime+t*.66);break; case'draw':f1=330;const fD2=220;t=.4;gV=.07;wT='square';o.frequency.setValueAtTime(f1,audioCtx.currentTime);o.frequency.linearRampToValueAtTime(fD2,audioCtx.currentTime+t*.5);break; case'reset':f1=500;const fR2=300;t=.25;gV=.05;wT='sine';o.frequency.setValueAtTime(f1,audioCtx.currentTime);o.frequency.linearRampToValueAtTime(fR2,audioCtx.currentTime+t*.5);break; default:return; } o.type=wT;if(!['win','draw','reset'].includes(type)) o.frequency.setValueAtTime(f1,audioCtx.currentTime); g.gain.setValueAtTime(gV,audioCtx.currentTime); o.start();g.gain.exponentialRampToValueAtTime(.00001,audioCtx.currentTime+t);o.stop(audioCtx.currentTime+t+.05); }catch(err){console.error("Error playing sound:",err);}}
    function toggleTheme(){ document.body.classList.toggle('dark-theme');localStorage.setItem('darkTheme',document.body.classList.contains('dark-theme'));updateAllUIToggleButtons(); playSound('move');}
    function toggleSound(){ soundEnabled=!soundEnabled;localStorage.setItem('soundDisabled',!soundEnabled);if(soundEnabled) initAudioOnInteraction(); else { if(audioCtx&&audioCtx.state==='running') audioCtx.suspend().catch(e => console.error("Error suspending audio context:", e)); hideOverlay(); } updateAllUIToggleButtons(); if(soundEnabled) playSound('move');}
    function changeSymbols(){ currentSymbolIndex=(currentSymbolIndex+1)%symbolSet.length;localStorage.setItem('currentSymbolIndex',currentSymbolIndex);currentSymbols=symbolSet[currentSymbolIndex]; const oPS1 = symbolSet[(currentSymbolIndex - 1 + symbolSet.length) % symbolSet.length].player1; const oPS2 = symbolSet[(currentSymbolIndex - 1 + symbolSet.length) % symbolSet.length].player2; if (currentPlayer === oPS1) currentPlayer = currentSymbols.player1; else if (currentPlayer === oPS2) currentPlayer = currentSymbols.player2; const rD=document.getElementById('results');rD.childNodes[0].nodeValue=currentSymbols.player1+' '; rD.childNodes[2].nodeValue=' – '+currentSymbols.player2+' '; playSound('move'); init(); }

    /* ----------  EVENT LISTENERS  ---------- */
    cells.forEach(c=>{c.addEventListener('click',handleCellClick);c.setAttribute('tabindex','0');c.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();c.click();}});});
    const restartBtn = document.getElementById('restartBtn');
    if(restartBtn) restartBtn.addEventListener('click',init); 
    restartIcon.addEventListener('click', () => { stopAnyGameInProgress(); init(); if (sideMenu.classList.contains('open')) sideMenu.classList.remove('open');});
    pvpLocalBtn.addEventListener('click',()=>{ stopAnyGameInProgress(); vsCPU=false; pvpRemoteActive = false; init(); });
    if (hostGameBtn) hostGameBtn.addEventListener('click', handleHostGame); // Keep listener if button exists
    if (joinGameBtn) joinGameBtn.addEventListener('click', handleJoinGame); // Keep listener if button exists
    cpuBtn.addEventListener('click',()=>{ stopAnyGameInProgress(); vsCPU=true; pvpRemoteActive = false; init(); });
    [easyBtn,mediumBtn,hardBtn].forEach(btn=>btn.addEventListener('click',e=>{ difficulty=e.target.id.replace('Btn',''); updateAllUIToggleButtons(); playSound('move'); if(!gameActive || vsCPU) init(); }));
    [player1StartsBtn,randomStartsBtn,loserStartsBtn].forEach(btn=>btn.addEventListener('click',e=>{ whoGoesFirstSetting=e.target.id.replace('StartsBtn',''); localStorage.setItem('whoGoesFirstSetting',whoGoesFirstSetting); updateAllUIToggleButtons(); playSound('move'); if(!gameActive || board.every(c=>c===null)) init(); }));
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