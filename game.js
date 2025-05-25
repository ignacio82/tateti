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
    const qrTitle           = document.getElementById('qr-title');

    // Player Customization DOM Elements
    const playerNameInput   = document.getElementById('playerNameInput');
    const iconSelectionDiv  = document.getElementById('iconSelection');
    const savePlayerPrefsBtn = document.getElementById('savePlayerPrefsBtn');

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
    let iAmPlayer1InRemote = true;
    let gamePaired = false;

    // Player Preferences
    let myPlayerName = localStorage.getItem('tatetiPlayerName') || 'Jugador';
    let myPlayerIcon = localStorage.getItem('tatetiPlayerIcon') || null; // Will default to P1/P2 from symbolSet if null

    // Opponent's preferences (for multiplayer) - will be set later
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
    let currentSymbols = symbolSet[currentSymbolIndex]; // Default symbols

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
        iconSelectionDiv.innerHTML = ''; // Clear existing icons
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
                // Update active state for icon buttons
                iconSelectionDiv.querySelectorAll('.icon-choice-btn').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                // No need to save here, savePlayerPrefsBtn will do it.
            });
            iconSelectionDiv.appendChild(button);
        });
    }

    function loadPlayerPreferences() {
        myPlayerName = localStorage.getItem('tatetiPlayerName') || 'Jugador';
        myPlayerIcon = localStorage.getItem('tatetiPlayerIcon') || symbolSet[currentSymbolIndex].player1; // Default to P1 icon of current set
        
        if (playerNameInput) {
            playerNameInput.value = myPlayerName;
        }
        populateIconSelection(); // This will also mark the active icon
    }

    if (savePlayerPrefsBtn) {
        savePlayerPrefsBtn.addEventListener('click', () => {
            if (playerNameInput) {
                myPlayerName = playerNameInput.value.trim() || 'Jugador';
                localStorage.setItem('tatetiPlayerName', myPlayerName);
            }
            if (myPlayerIcon) { // myPlayerIcon is updated directly when an icon button is clicked
                localStorage.setItem('tatetiPlayerIcon', myPlayerIcon);
            }
            alert("Preferencias guardadas!"); // [TODO] Use a nicer notification
            sideMenu.classList.remove('open');
            // Potentially update UI elements that display name/icon if game is not active
            if (!gameActive) {
                updateScoreboard(); // To reflect new P1 icon if changed
                statusDiv.textContent = `Turno del ${getPlayerName(myPlayerIcon)}`;
            }
        });
    }


    /* ----------  AUDIO CONTEXT & OTHER HELPERS  ---------- */
    let audioCtx;
    function getAudioContext(){ /* ... (same) ... */ }
    function initAudioOnInteraction(){ /* ... (same) ... */ }
    function launchConfetti(){ /* ... (same) ... */ }
    function removeConfetti(){ /* ... (same) ... */ }
    function playDrawAnimation(){ /* ... (same) ... */ }
    function setBoardClickable(clickable){ /* ... (same) ... */ }
    
    function getPlayerName(sym){
        // If it's my icon in a non-remote game or if I am P1 in remote (and no opponent data yet)
        if (sym === myPlayerIcon && (!pvpRemoteActive || iAmPlayer1InRemote)) return `${myPlayerName} (${sym})`;
        // If it's opponent's icon in a remote game
        if (sym === opponentPlayerIcon && pvpRemoteActive) return `${opponentPlayerName} (${sym})`;

        // Fallback to default names from symbolSet
        for (const set of symbolSet) {
            if (sym === set.player1) return `${set.nameP1} (${sym})`;
            if (sym === set.player2) return `${set.nameP2} (${sym})`;
        }
        return `Jugador (${sym})`; // Generic fallback
    }

    function updateAllUIToggleButtons(){ /* ... (same as last PeerJS version) ... */ }

    function init(){
        removeConfetti();
        hideOverlay();
        if(qrDisplayArea) qrDisplayArea.style.display = 'none';
        
        const isHostBtnActive = hostGameBtn && hostGameBtn.classList.contains('active');
        const isJoinBtnActive = joinGameBtn && joinGameBtn.classList.contains('active');

        if (pvpRemoteActive && !gamePaired) { // If trying to init while in a non-paired remote state
            if (!isHostBtnActive && !isJoinBtnActive && window.peerJsMultiplayer && typeof window.peerJsMultiplayer.close === "function") {
                 window.peerJsMultiplayer.close(); 
            }
        }
        if (!isHostBtnActive && !isJoinBtnActive) {
            if (pvpRemoteActive && window.peerJsMultiplayer && typeof window.peerJsMultiplayer.close === "function") {
                window.peerJsMultiplayer.close();
            }
            pvpRemoteActive = false;
            gamePaired = false;
        }

        board=Array(9).fill(null);
        difficulty = easyBtn.classList.contains('active')?'easy':hardBtn.classList.contains('active')?'hard':'medium';
        gameActive = false; 

        let p1Icon = myPlayerIcon || currentSymbols.player1;
        let p2Icon = currentSymbols.player2; // CPU or local P2 uses default or opponent's choice later

        if (pvpRemoteActive && gamePaired) {
            // Icons and names would be determined by exchanged player_info
            // For now, host uses their 'myPlayerIcon', joiner will get their 'myPlayerIcon' too.
            // Opponent icons are set via onDataReceived for 'player_info'
            // This part needs refinement once data sharing is in place.
            p1Icon = iAmPlayer1InRemote ? myPlayerIcon : (opponentPlayerIcon || currentSymbols.player1) ;
            p2Icon = iAmPlayer1InRemote ? (opponentPlayerIcon || currentSymbols.player2) : myPlayerIcon;

            currentPlayer = iAmPlayer1InRemote ? p1Icon : p2Icon;
            isMyTurnInRemote = iAmPlayer1InRemote;
            statusDiv.textContent = isMyTurnInRemote ? `Tu Turno ${getPlayerName(currentPlayer)}` : `Esperando a ${getPlayerName(currentPlayer)}...`;
            setBoardClickable(isMyTurnInRemote);
            gameActive = true;
        } else if (pvpRemoteActive && !gamePaired) { 
            statusDiv.textContent = iAmPlayer1InRemote ? "Host: Compartiendo ID..." : "Join: Ingresa ID del Host...";
            setBoardClickable(false);
        } else if (vsCPU) {
            gameActive = true; 
            let startingPlayer;
            switch(whoGoesFirstSetting){ 
                case 'random': startingPlayer = Math.random()<.5 ? p1Icon : p2Icon; break; 
                case 'loser': startingPlayer = (!previousGameExists||lastWinner===null) ? p1Icon : (lastWinner===p1Icon ? p2Icon : p1Icon); break; 
                default: startingPlayer = p1Icon; 
            }
            currentPlayer = startingPlayer;
            statusDiv.textContent = `Turno del ${getPlayerName(currentPlayer)}`; 
            if(currentPlayer === p2Icon){ 
                setBoardClickable(false); 
                setTimeout(()=>{ if(gameActive) cpuMove(); if(gameActive) setBoardClickable(true);},700+Math.random()*300); 
            } else { setBoardClickable(true); }
        } else { // Local PvP
            gameActive = true; 
            let startingPlayer;
             switch(whoGoesFirstSetting){ 
                case 'random': startingPlayer = Math.random()<.5 ? p1Icon : p2Icon; break; 
                case 'loser': startingPlayer = (!previousGameExists||lastWinner===null) ? p1Icon : (lastWinner===p1Icon ? p2Icon : p1Icon); break; 
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
        
        updateAllUIToggleButtons();
        updateScoreboard(); // Update scoreboard to reflect current icons
        if(gameActive && !(pvpRemoteActive && !isMyTurnInRemote && gamePaired)) playSound('reset');
        
        sideMenu.classList.remove('open');
    }

    function stopAnyGameInProgress() { /* ... (same as last PeerJS version) ... */ }

    // ----- PeerJS Callbacks -----
    const peerJsCallbacks = {
        onPeerOpen: (id) => { 
            if (iAmPlayer1InRemote) {
                console.log("GAME.JS: Host Peer ID:", id);
                const gameLinkBase = window.location.origin + window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1) ; // Handles subdirectories if index.html is not at root of domain
                const gameLink = `${gameLinkBase}?room=${id}`;
                
                statusDiv.textContent = `Comparte el enlace o ID: ${id}`;
                showOverlay(`Tu ID de Host: ${id}. Esperando conexión...`);
                
                if (qrTextData) qrTextData.value = gameLink;
                if (qrCodeCanvas && typeof QRious !== 'undefined') {
                    try {
                        new QRious({ element: qrCodeCanvas, value: gameLink, size: 180, padding: 5 });
                        if(qrTitle) qrTitle.textContent = "Invita al Jugador 2:";
                        if(qrDisplayArea) qrDisplayArea.style.display = 'block';
                    } catch (e) { /* ... error handling ... */ }
                } else { /* ... fallback ... */ }
            }
        },
        onNewConnection: (conn) => { /* ... (same as last PeerJS version) ... */ },
        onConnectionOpen: () => { 
            console.log("GAME.JS: PeerJS connection abierta!");
            gamePaired = true;
            hideOverlay();
            if(qrDisplayArea) qrDisplayArea.style.display = 'none';
            
            // Send my player info
            if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.send === "function") {
                window.peerJsMultiplayer.send({ 
                    type: 'player_info', 
                    name: myPlayerName, 
                    icon: myPlayerIcon || (iAmPlayer1InRemote ? currentSymbols.player1 : currentSymbols.player2) 
                });
            }
            // init() will be called which sets status and turns
            // The init() call here ensures board is fresh and turns are set based on iAmPlayer1InRemote
            statusDiv.textContent = "¡Conectado!"; // Temp status
            playSound('win');
            init(); 
        },
        onDataReceived: (data) => {
            console.log("GAME.JS: Data received via PeerJS:", data);
            if(data.type === 'player_info') {
                opponentPlayerName = data.name || 'Oponente';
                opponentPlayerIcon = data.icon || (iAmPlayer1InRemote ? currentSymbols.player2 : currentSymbols.player1);
                console.log("GAME.JS: Opponent info received:", opponentPlayerName, opponentPlayerIcon);
                updateScoreboard(); // Update scoreboard with new opponent info
                // If game already started, update status if it's opponent's turn display
                if (gameActive && !isMyTurnInRemote) {
                    statusDiv.textContent = `Esperando a ${getPlayerName(currentPlayer)}...`;
                } else if (gameActive && isMyTurnInRemote) {
                    statusDiv.textContent = `Tu Turno ${getPlayerName(currentPlayer)}`;
                }
                return; // Don't process as a move if it's player_info
            }

            if (!gameActive || !pvpRemoteActive || (pvpRemoteActive && isMyTurnInRemote) || !gamePaired) {
                 console.warn("GAME.JS: Received data but not expecting it (e.g. it's my turn or game not active/paired).", {isMyTurnInRemote, gameActive, pvpRemoteActive, gamePaired, receivedDataType: data.type});
                 return;
            }
            if (data.type === 'move' && typeof data.index === 'number') {
                handleRemoteMoveDetected(data.index);
            } else if (data.type === 'restart_request') { /* ... (same) ... */ }
            else if (data.type === 'restart_ack') { /* ... (same) ... */ }
        },
        onConnectionClose: () => { /* ... (same as last PeerJS version) ... */ },
        onError: (err) => { /* ... (same as last PeerJS version) ... */ }
    };
    
    let currentHostPeerId = null; 

    async function handleHostGame() { /* ... (same as last PeerJS version) ... */ }
    async function handleJoinGame(roomIdFromUrl = null) { /* ... (same as last PeerJS version, ensure currentHostPeerId is set before peerJsMultiplayer.init if used in its onPeerOpen) ... */ }
    
    function makeMove(index, playerSymbolToPlace){
        // PlayerSymbolToPlace is the icon of the player making the move
        if (board[index] !== null) return false; 
        board[index]=playerSymbolToPlace;
        cells[index].querySelector('span').textContent=playerSymbolToPlace;
        cells[index].classList.add('disabled');
        cells[index].style.animation='cellSelectAnim .3s ease';
        setTimeout(()=>cells[index].style.animation='',300);
        playSound('move');
        return true;
    }
    
    function handleRemoteMoveDetected(index) {
        hideOverlay(); 
        if (typeof index !== 'number' || index < 0 || index > 8) { /* ... */ return; }
        
        // 'currentPlayer' should be the opponent's icon when their move is received
        let remotePlayerActualIcon = opponentPlayerIcon || (iAmPlayer1InRemote ? currentSymbols.player2 : currentSymbols.player1);

        if (!makeMove(index, remotePlayerActualIcon)) { 
            console.error("GAME.JS: Failed to make remote move on board for icon:", remotePlayerActualIcon);
            return;
        }
        const win = checkWin(remotePlayerActualIcon); 
        if (win) { endGame(remotePlayerActualIcon, win); return; }
        if (checkDraw()) { endDraw(); return; }
        
        // It's now the local player's turn. currentPlayer should be their icon.
        currentPlayer = myPlayerIcon || (iAmPlayer1InRemote ? currentSymbols.player1 : currentSymbols.player2);
        isMyTurnInRemote = true; 
        statusDiv.textContent = `Tu Turno ${getPlayerName(currentPlayer)}`;
        setBoardClickable(true);
    }

    function handleCellClick(e){
        const idx = +e.currentTarget.dataset.index;
        if (!gameActive || board[idx] !== null ) return;
        
        if (pvpRemoteActive && (!gamePaired || !isMyTurnInRemote)) { /* ... */ return; }

        let iconToPlace = currentPlayer; // This should be the local player's chosen icon
        if (pvpRemoteActive && gamePaired) {
             iconToPlace = myPlayerIcon || (iAmPlayer1InRemote ? currentSymbols.player1 : currentSymbols.player2);
        } else if (!vsCPU) { // Local PvP
            // currentPlayer already holds the correct p1/p2 icon for local
        } else { // vs CPU, player's turn
             iconToPlace = myPlayerIcon || currentSymbols.player1;
        }


        if (!makeMove(idx, iconToPlace)) return; 

        if (pvpRemoteActive && gamePaired && isMyTurnInRemote) {
            if (window.peerJsMultiplayer && typeof window.peerJsMultiplayer.send === "function") {
                window.peerJsMultiplayer.send({ type: 'move', index: idx }); 
            } else { /* ... error ... */ }
        }

        const win = checkWin(iconToPlace);
        if(win){ endGame(iconToPlace,win); return; }
        if(checkDraw()){ endDraw(); return; }

        switchPlayer(); // Switches currentPlayer to the *other* player's icon for the next turn
        
        if (pvpRemoteActive && gamePaired) {
            isMyTurnInRemote = false; 
            statusDiv.textContent = `Esperando a ${getPlayerName(currentPlayer)}...`; // currentPlayer is now opponent
            setBoardClickable(false);
        } else if(vsCPU && currentPlayer === (currentSymbols.player2)){ // Check against default P2 if myPlayerIcon is P1
            statusDiv.textContent = `Turno del ${getPlayerName(currentPlayer)}`;
            setBoardClickable(false);
            setTimeout(()=>{ if(gameActive) cpuMove(); if(gameActive) setBoardClickable(true);},700+Math.random()*300);
        } else {
            statusDiv.textContent = `Turno del ${getPlayerName(currentPlayer)}`;
        }
    }
    
    function cpuMove(){ 
        if(!gameActive) return; 
        let cpuIcon = currentSymbols.player2; // CPU uses default P2 icon
        let idx; 
        // ... (CPU move logic for idx) ...
        switch(difficulty){ case 'easy': idx=randomMove(cpuIcon); break; case 'medium': idx=Math.random()<.75?bestMove(cpuIcon):randomMove(cpuIcon); break; default: idx=bestMove(cpuIcon); } if(idx===null || board[idx]!==null) idx=randomMove(cpuIcon); if(idx===null){ if(checkDraw()) endDraw(); return; }

        makeMove(idx, cpuIcon); 
        const win=checkWin(cpuIcon); 
        if(win){ endGame(cpuIcon,win); return; } 
        if(checkDraw()){ endDraw(); return; } 
        switchPlayer(); // Switches to player's turn, currentPlayer becomes player's icon
        statusDiv.textContent = `Turno del ${getPlayerName(currentPlayer)}`; 
    }

    function randomMove(playerIconForEval){ /* ... (can optionally take playerIcon if needed for strategy, not strictly for random) ... */ const a=board.map((v,i)=>v===null?i:null).filter(v=>v!==null); return a.length? a[Math.floor(Math.random()*a.length)] : null; }
    function bestMove(cpuIcon){ 
        let humanIcon = myPlayerIcon || currentSymbols.player1;
        for(let i=0;i<9;i++)if(!board[i]){board[i]=cpuIcon;if(checkWin(cpuIcon)){board[i]=null;return i;}board[i]=null;} 
        for(let i=0;i<9;i++)if(!board[i]){board[i]=humanIcon;if(checkWin(humanIcon)){board[i]=null;return i;}board[i]=null;} 
        if(board[4]===null) return 4; 
        const corners=[0,2,6,8].filter(i=>board[i]===null); if(corners.length) return corners[Math.floor(Math.random()*corners.length)]; 
        return randomMove(cpuIcon); 
    }
    
    // checkWin, checkDraw remain mostly the same but use symbols passed to them
    function checkWin(playerSymbol, currentBoard = board){ const c=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]; return c.find(combo=>combo.every(i=>currentBoard[i]===playerSymbol))||null;}
    function checkDraw(currentBoard = board){
        let p1ForDrawCheck = myPlayerIcon || currentSymbols.player1;
        let p2ForDrawCheck = opponentPlayerIcon || currentSymbols.player2; // Adjust if CPU
        if (vsCPU && !pvpRemoteActive) p2ForDrawCheck = currentSymbols.player2;

        return currentBoard.every(cell=>cell!==null) && !checkWin(p1ForDrawCheck, currentBoard) && !checkWin(p2ForDrawCheck, currentBoard);
    }
    
    function endGame(playerSymbol, winningCells){ /* ... (ensure pvpRemoteActive is reset) ... */ }
    function endDraw(){ /* ... (ensure pvpRemoteActive is reset) ... */ }
    
    function switchPlayer(){ 
        let p1IconToUse = myPlayerIcon || (iAmPlayer1InRemote || !pvpRemoteActive ? currentSymbols.player1 : opponentPlayerIcon);
        let p2IconToUse = opponentPlayerIcon || (iAmPlayer1InRemote ? currentSymbols.player2 : myPlayerIcon);
        if (vsCPU && !pvpRemoteActive) { // Override for CPU mode
             p1IconToUse = myPlayerIcon || currentSymbols.player1;
             p2IconToUse = currentSymbols.player2;
        } else if (!pvpRemoteActive && !vsCPU) { // Local PvP
            p1IconToUse = myPlayerIcon || currentSymbols.player1; // P1 uses their preference or default P1
            // For P2 in local PvP, need a way to select their icon or use default P2 if P1 picked P1's default icon
            // This part is tricky if both local players want to customize from the same single "myPlayerIcon" pref.
            // For now, assume P1 is myPlayerIcon, P2 is default from currentSymbols.
            if (currentPlayer === p1IconToUse) {
                 p2IconToUse = (p1IconToUse === currentSymbols.player1) ? currentSymbols.player2 : currentSymbols.player1;
            } else { // currentPlayer was p2IconToUse
                 p2IconToUse = (currentPlayer === currentSymbols.player1) ? currentSymbols.player2 : currentSymbols.player1; // this logic is flawed for local PvP icon assignment.
            }
             // Simpler for local PvP: just toggle between default P1 and P2 of current symbolSet, myPlayerIcon might override P1.
            if (currentPlayer === (myPlayerIcon || currentSymbols.player1)) {
                currentPlayer = ( (myPlayerIcon || currentSymbols.player1) === currentSymbols.player1 ) ? currentSymbols.player2 : currentSymbols.player1;
            } else {
                currentPlayer = (myPlayerIcon || currentSymbols.player1);
            }
            return;
        }


        if (currentPlayer === p1IconToUse) {
            currentPlayer = p2IconToUse;
        } else {
            currentPlayer = p1IconToUse;
        }
    }

    function updateScoreboard(){
        // This needs to be more dynamic based on chosen icons for P1 and P2 (opponent)
        let p1DisplayIcon = myPlayerIcon || currentSymbols.player1;
        let p2DisplayIcon;

        if (pvpRemoteActive && gamePaired) {
            p1DisplayIcon = iAmPlayer1InRemote ? myPlayerIcon : (opponentPlayerIcon || 'P2');
            p2DisplayIcon = iAmPlayer1InRemote ? (opponentPlayerIcon || 'P1') : myPlayerIcon;
        } else if (vsCPU) {
            p2DisplayIcon = currentSymbols.player2; // CPU uses default P2
        } else { // Local PvP
            // If P1 chose an icon, P2 takes the other from the default pair, or just use defaults
            if (p1DisplayIcon === currentSymbols.player1) {
                p2DisplayIcon = currentSymbols.player2;
            } else if (p1DisplayIcon === currentSymbols.player2) {
                p2DisplayIcon = currentSymbols.player1;
            } else { // Player 1 chose a non-default icon, P2 takes default P2
                p2DisplayIcon = currentSymbols.player2;
            }
        }
        if (!p1DisplayIcon) p1DisplayIcon = 'P1'; // Fallback
        if (!p2DisplayIcon) p2DisplayIcon = 'P2'; // Fallback


        const resultsDiv = document.getElementById('results');
        resultsDiv.innerHTML = `${p1DisplayIcon} <span id="unicornWins">${unicornWins}</span> – ${p2DisplayIcon} <span id="heartWins">${heartWins}</span> – 🤝 <span id="draws">${draws}</span>`;
    }
    function playSound(type){ /* ... (same) ... */ }
    function toggleTheme(){ /* ... (same) ... */ }
    function toggleSound(){ /* ... (same) ... */ }
    function changeSymbolsBtnHandler(){ // Renamed from changeSymbols to avoid conflict if you had a global var
        currentSymbolIndex=(currentSymbolIndex+1)%symbolSet.length;localStorage.setItem('currentSymbolIndex',currentSymbolIndex);
        currentSymbols=symbolSet[currentSymbolIndex];
        
        // If no specific icon chosen by player, update myPlayerIcon to new default P1
        if (!localStorage.getItem('tatetiPlayerIcon')) { 
            myPlayerIcon = currentSymbols.player1;
        }
        // Opponent icon default for remote play or CPU would also need to consider this change if not customized.
        // This primarily affects local games or default appearances before customization.
        
        playSound('move'); 
        populateIconSelection(); // Re-populate to reflect new defaults if needed and current selection
        init(); // Re-initialize the game
    }
    if(changeSymbolsBtn) changeSymbolsBtn.addEventListener('click',changeSymbolsBtnHandler);


    function checkUrlForRoomAndJoin() { /* ... (same as last PeerJS version) ... */ }

    /* ----------  EVENT LISTENERS  ---------- */
    cells.forEach(c=>{c.addEventListener('click',handleCellClick);c.setAttribute('tabindex','0');c.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();c.click();}});});
    const restartBtn = document.getElementById('restartBtn');
    if(restartBtn) restartBtn.addEventListener('click',init); 
    restartIcon.addEventListener('click', () => { stopAnyGameInProgress(); init(); if (sideMenu.classList.contains('open')) sideMenu.classList.remove('open');});
    pvpLocalBtn.addEventListener('click',()=>{ stopAnyGameInProgress(); vsCPU=false; pvpRemoteActive = false; init(); });
    if (hostGameBtn) hostGameBtn.addEventListener('click', handleHostGame);
    if (joinGameBtn) joinGameBtn.addEventListener('click', () => handleJoinGame());
    cpuBtn.addEventListener('click',()=>{ stopAnyGameInProgress(); vsCPU=true; pvpRemoteActive = false; init(); });
    [easyBtn,mediumBtn,hardBtn].forEach(btn=>btn.addEventListener('click',e=>{ difficulty=e.target.id.replace('Btn',''); updateAllUIToggleButtons(); playSound('move'); if(!gameActive || vsCPU) init(); }));
    [player1StartsBtn,randomStartsBtn,loserStartsBtn].forEach(btn=>btn.addEventListener('click',e=>{ whoGoesFirstSetting=e.target.id.replace('StartsBtn',''); localStorage.setItem('whoGoesFirstSetting',whoGoesFirstSetting); updateAllUIToggleButtons(); playSound('move'); if(!gameActive || board.every(c=>c===null)) init(); }));
    // changeSymbolsBtn listener is now changeSymbolsBtnHandler
    themeToggle.addEventListener('click',toggleTheme);
    soundToggle.addEventListener('click',toggleSound);
    document.addEventListener('click', initAudioOnInteraction, { once: true });
    document.addEventListener('dblclick',e=>e.preventDefault(),{passive:false}); 

    /* ----------  INICIALIZACIÓN  ---------- */
    if(localStorage.getItem('darkTheme')==='true') document.body.classList.add('dark-theme');
    loadPlayerPreferences(); // Load preferences on start
    updateScoreboard(); // Initial scoreboard update
    checkUrlForRoomAndJoin(); // This will call init() if no room ID in URL
});

/* ----------  PWA bootstrap  ---------- */
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    // Serve via HTTP/HTTPS for SW to work
    if (location.protocol === 'http:' || location.protocol === 'https:') {
        navigator.serviceWorker.register('./sw.js') 
          .then(reg => console.log('SW registered!', reg))
          .catch(err=>console.error('SW registration failed:',err));
    } else {
        console.warn('Service Worker not registered. (Requires HTTP/HTTPS or localhost)');
    }
  });
}