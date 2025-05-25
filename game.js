/****************************************************
 * GAME LOGIC (Local Play and Player vs CPU Only) *
 ***************************************************/
document.addEventListener('DOMContentLoaded', () => {
    /* ----------  ELEMENTOS DEL DOM  ---------- */
    const cells             = document.querySelectorAll('.cell');
    const statusDiv         = document.getElementById('status');
    // const restartBtn        = document.getElementById('restartBtn'); // This was hidden, can be removed if not used
    const pvpLocalBtn       = document.getElementById('pvpLocalBtn');
    const hostGameBtn       = document.getElementById('hostGameBtn'); // Will be unused or hidden by CSS
    const joinGameBtn       = document.getElementById('joinGameBtn'); // Will be unused or hidden by CSS
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

    // QR Code related DOM Elements (no longer used for remote play)
    const qrDisplayArea     = document.getElementById('qr-display-area');
    // const qrCodeCanvas      = document.getElementById('qr-code-canvas');
    // const qrTextData        = document.getElementById('qr-text-data');


    // Access global show/hide overlay functions if they exist (e.g., from an old script or if you decide to keep them for other purposes)
    const showOverlay = window.showStatusOverlay || function(text) { console.log("Overlay:", text); }; // Fallback
    const hideOverlay = window.hideStatusOverlay || function() { console.log("Hide Overlay"); }; // Fallback


    menuToggle.addEventListener('click', () => sideMenu.classList.toggle('open'));
    document.addEventListener('click', e => {
        if (!sideMenu.contains(e.target) && !menuToggle.contains(e.target) && sideMenu.classList.contains('open')) {
            sideMenu.classList.remove('open');
        }
    });
    
    /* ----------  ESTADO  ---------- */
    let board, currentPlayer, gameActive, vsCPU = false, difficulty = 'medium';
    let pvpRemoteActive = false; // This will now always remain false or be ignored

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


    /* ----------  AUDIO CONTEXT & OTHER HELPERS  ---------- */
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
        pvpRemoteActive = false; // Ensure this is always false now
        pvpLocalBtn.classList.toggle('active', !vsCPU); // Active if not vs CPU
        if(hostGameBtn) hostGameBtn.classList.remove('active'); // No longer active
        if(joinGameBtn) joinGameBtn.classList.remove('active'); // No longer active
        cpuBtn.classList.toggle('active', vsCPU);

        document.getElementById('game').style.display = 'grid'; // Always show game elements
        document.getElementById('results').style.display = 'block';
        
        if(qrDisplayArea) qrDisplayArea.style.display = 'none'; // Hide QR by default

        difficultyDiv.style.display = vsCPU ? 'flex' : 'none';
        easyBtn.classList.toggle('active',difficulty==='easy');
        mediumBtn.classList.toggle('active',difficulty==='medium');
        hardBtn.classList.toggle('active',difficulty==='hard');
        
        document.querySelector('.game-start-options').style.display = 'flex'; // Always show for local/cpu
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
        
        pvpRemoteActive = false; // Ensure this is always false

        board=Array(9).fill(null);
        difficulty = easyBtn.classList.contains('active')?'easy':hardBtn.classList.contains('active')?'hard':'medium';
        gameActive = false; 

        if (vsCPU) {
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
        // No RTC session to close
        board = Array(9).fill(null); 
        cells.forEach(c => { c.querySelector('span').textContent = ''; c.classList.remove('rainbow', 'disabled'); });
        removeConfetti();
        hideOverlay();
        if(qrDisplayArea) qrDisplayArea.style.display = 'none';
    }

    async function handleHostGame() {
        // All remote hosting logic removed
        alert("La función de Hostear Juego Remoto ha sido deshabilitada.");
        pvpRemoteActive = false; // Reset flag
        vsCPU = false; // Default to local PvP if this button was somehow still active
        init(); // Go back to default state
    }

    async function handleJoinGame() {
        // All remote joining logic removed
        alert("La función de Unirse a Juego Remoto ha sido deshabilitada.");
        pvpRemoteActive = false; // Reset flag
        vsCPU = false;
        init(); // Go back to default state
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
    
    // handleRemoteMoveDetected is no longer needed as remote play is removed.
    // function handleRemoteMoveDetected(index) { ... }

    function handleCellClick(e){
        const idx = +e.currentTarget.dataset.index;
        if (!gameActive || board[idx] !== null ) return;
        // Removed checks for pvpRemoteActive

        if (!makeMove(idx, currentPlayer)) return; 

        // Removed sending RTC message

        const win = checkWin(currentPlayer);
        if(win){ endGame(currentPlayer,win); return; }
        if(checkDraw()){ endDraw(); return; }

        switchPlayer(); 
        statusDiv.textContent = `Turno del ${getPlayerName(currentPlayer)}`; // Update status after local move

        if(vsCPU && currentPlayer===currentSymbols.player2){ 
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
        statusDiv.textContent = `Turno del ${getPlayerName(currentPlayer)}`; // Update status after CPU move
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
        hideOverlay();
        if(qrDisplayArea) qrDisplayArea.style.display = 'none';
        
        // No RTC session to close
        if(winningCells) winningCells.forEach(i=>cells[i].classList.add('rainbow'));
        statusDiv.textContent=`¡${getPlayerName(playerSymbol)} ganó!`; statusDiv.classList.add('highlight');
        if(playerSymbol===currentSymbols.player1){unicornWins++;localStorage.setItem('unicornWins',unicornWins);lastWinner=currentSymbols.player1;}
        else{heartWins++;localStorage.setItem('heartWins',heartWins);lastWinner=currentSymbols.player2;}
        previousGameExists=true; 
        updateScoreboard(); 
        playSound('win'); 
        launchConfetti();
        const autoRestartDelay = AUTO_RESTART_DELAY_WIN;
        setTimeout(()=>{
            removeConfetti(); 
            pvpRemoteActive = false; // Ensure reset
            init();
        }, autoRestartDelay);
    }

    function endDraw(){
        if(!gameActive) return;
        gameActive=false; 
        setBoardClickable(false);
        hideOverlay();
        if(qrDisplayArea) qrDisplayArea.style.display = 'none';

        // No RTC session to close
        statusDiv.textContent='¡Empate!'; statusDiv.classList.add('highlight');
        draws++;localStorage.setItem('draws',draws);lastWinner=null;previousGameExists=true;
        updateScoreboard();
        playSound('draw');
        const animationDuration = playDrawAnimation();
        const autoRestartDelay = Math.max(animationDuration + 200, AUTO_RESTART_DELAY_DRAW);
         setTimeout(()=>{
            pvpRemoteActive = false; // Ensure reset
            init();
        }, autoRestartDelay);
    }

    function switchPlayer(){
        currentPlayer = (currentPlayer===currentSymbols.player1)?currentSymbols.player2:currentSymbols.player1;
        // Status update is handled by the calling function (handleCellClick or cpuMove)
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
    cells.forEach(c=>{c.addEventListener('click',handleCellClick);c.setAttribute('tabindex','0');c.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();c.click();}});});
    
    const restartBtn = document.getElementById('restartBtn'); // Defined for completeness, though it's hidden by default in HTML
    if(restartBtn) restartBtn.addEventListener('click',init); 
    
    restartIcon.addEventListener('click', () => { 
        stopAnyGameInProgress(); 
        pvpRemoteActive = false; // Ensure reset
        init(); 
        if (sideMenu.classList.contains('open')) sideMenu.classList.remove('open');
    });

    pvpLocalBtn.addEventListener('click',()=>{ 
        stopAnyGameInProgress();
        vsCPU=false;
        pvpRemoteActive = false;
        init(); 
    });

    // Attach hostGameBtn and joinGameBtn listeners if they exist, though they now just show an alert
    if (hostGameBtn) hostGameBtn.addEventListener('click', handleHostGame);
    if (joinGameBtn) joinGameBtn.addEventListener('click', handleJoinGame);
    
    cpuBtn.addEventListener('click',()=>{ 
        stopAnyGameInProgress();
        vsCPU=true;
        pvpRemoteActive = false;
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
    navigator.serviceWorker.register('./sw.js') // Assuming sw.js is still relevant for PWA features
      .then(reg => console.log('SW registered!', reg))
      .catch(err=>console.error('SW registration failed:',err));
  });
}