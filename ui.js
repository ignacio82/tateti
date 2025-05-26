// ui.js
/*  =========================================================================
    UI helpers & DOM references
    ========================================================================= */

import * as state  from './state.js';   // game state queries
import * as player from './player.js';  // player-name helpers

/* ----------  DOM ELEMENT HANDLES  ---------- */
export const cells            = document.querySelectorAll('.cell');
export const statusDiv        = document.getElementById('status');

export const pvpLocalBtn      = document.getElementById('pvpLocalBtn');   // «Local»
export const hostGameBtn      = document.getElementById('hostGameBtn');
export const joinGameBtn      = document.getElementById('joinGameBtn');
export const cpuBtn           = document.getElementById('cpuBtn');

/* new toggle switch for 3-Piece vs Classic */
export const threePieceToggle = document.getElementById('threePieceToggle');

export const difficultyDiv    = document.querySelector('.difficulty');
export const easyBtn          = document.getElementById('easyBtn');
export const mediumBtn        = document.getElementById('mediumBtn');
export const hardBtn          = document.getElementById('hardBtn');

export const themeToggle      = document.getElementById('themeToggle');
export const soundToggle      = document.getElementById('soundToggle');
export const changeSymbolsBtn = document.getElementById('changeSymbolsBtn');

export const player1StartsBtn = document.getElementById('player1StartsBtn');
export const randomStartsBtn  = document.getElementById('randomStartsBtn');
export const loserStartsBtn   = document.getElementById('loserStartsBtn');

export const gameBoardEl      = document.getElementById('game');
export const menuToggle       = document.getElementById('menu-toggle');
export const sideMenu         = document.getElementById('side-menu');
export const restartIcon      = document.getElementById('restart-icon');

/* ----------  QR modal  ---------- */
export const qrDisplayArea    = document.getElementById('qr-display-area');
export const qrCodeCanvas     = document.getElementById('qr-code-canvas');
const       qrModalCloseBtn   = document.getElementById('qrModalCloseBtn');
const       copyHostIdBtn     = document.getElementById('copyHostIdBtn');

/* ----------  player-prefs  ---------- */
export const playerNameInput  = document.getElementById('playerNameInput');
export const iconSelectionDiv = document.getElementById('iconSelection');
export const savePlayerPrefsBtn = document.getElementById('savePlayerPrefsBtn');

/* ----------  scoreboard  ---------- */
export const resultsDiv       = document.getElementById('results');

/*  =========================================================================
    GENERIC UI HELPERS
    ========================================================================= */

export function showOverlay(text){
    const id = 'gameOverlay';
    let overlay = document.getElementById(id);
    if (!overlay){
        overlay = document.createElement('div');
        overlay.id = id;
        overlay.style.cssText = `
            position:fixed; inset:0;
            display:flex; justify-content:center; align-items:center;
            background:rgba(0,0,0,.7); color:#fff; font-size:2em; text-align:center;
            z-index:2000;`;
        document.body.appendChild(overlay);
    }
    overlay.textContent = text;
    overlay.style.display = 'flex';
}

export function hideOverlay(){
    const ov = document.getElementById('gameOverlay');
    if (ov) ov.style.display = 'none';
    const statusOv = document.getElementById('statusOverlay');
    if (statusOv) statusOv.style.display = 'none';
}

export function setBoardClickable(clickable){
    if (!gameBoardEl) return;
    gameBoardEl.style.pointerEvents = clickable ? 'auto' : 'none';
    cells.forEach(cell=>{
        cell.classList.toggle('disabled', !clickable);
        if (cell.querySelector('span')?.textContent === '')
            cell.style.cursor = clickable ? 'pointer' : 'default';
    });
}

export function playDrawAnimation(){
    statusDiv?.classList.add('highlight-draw-flash');
    gameBoardEl?.classList.add('highlight-draw-border');
    setTimeout(()=>{
        statusDiv?.classList.remove('highlight-draw-flash');
        gameBoardEl?.classList.remove('highlight-draw-border');
    },1800);
}

/* ----------  Confetti  ---------- */
const confettiContainerId='confetti-container';

export function launchConfetti(){
    let c=document.getElementById(confettiContainerId);
    if(!c){
        c=document.createElement('div');
        c.id=confettiContainerId;
        c.style.cssText='position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:3000';
        document.body.appendChild(c);
    }
    c.innerHTML='';
    const count=100, colors=['#ff69b4','#ffc0cb','#ff1493','#ffe4e1','#db7093'];
    for(let i=0;i<count;i++){
        const f=document.createElement('div');
        f.className='confetti';
        f.style.cssText=`
            position:absolute;
            left:${Math.random()*100}vw;
            top:${Math.random()*-100}vh;
            width:${Math.random()*10+5}px;
            height:${Math.random()*20+10}px;
            background:${colors[Math.floor(Math.random()*colors.length)]};
            opacity:${Math.random()*0.5+0.5};`;
        const dur=(Math.random()*2+2.5).toFixed(2);
        const del=(Math.random()*1).toFixed(2);
        f.style.animation=`fall ${dur}s linear ${del}s forwards`;
        c.appendChild(f);
        setTimeout(()=>f.remove(),(parseFloat(dur)+parseFloat(del)+.5)*1000);
    }
}
export const removeConfetti=()=>document.getElementById(confettiContainerId)?.remove();

/* ----------  Cell helpers  ---------- */
export function updateCellUI(idx,symbol){
    const cell=cells[idx];
    if(!cell) return;
    const span=cell.querySelector('span');
    (span??cell).textContent=symbol||'';
    if(symbol){
        cell.classList.add('disabled');
        cell.style.cursor='default';
    }else{
        cell.classList.remove('disabled');
        cell.style.cursor='pointer';
    }
    cell.classList.remove('rainbow','selected-piece-to-move');
    if(symbol){
        cell.style.animation='cellSelectAnim .2s ease-out';
        setTimeout(()=>{ if(cell) cell.style.animation=''; },200);
    }
}

export const clearBoardUI=()=>{
    cells.forEach(c=>{
        c.querySelector('span').textContent='';
        c.classList.remove('rainbow','disabled','selected-piece-to-move');
        c.style.cursor='pointer';
    });
    removeConfetti();
};

/* ----------  Selection / hint helpers  ---------- */
export const highlightWinner      = arr=>arr.forEach(i=>cells[i]?.classList.add('rainbow'));
export const highlightSuggestedMove=i=>{
    clearSuggestedMoveHighlight();
    if(cells[i] && cells[i].querySelector('span')?.textContent==='') cells[i].classList.add('rainbow');
};
export const clearSuggestedMoveHighlight=()=>cells.forEach(c=>c.classList.remove('rainbow'));

export const highlightSelectedPiece     =i=>cells[i]?.classList.add('selected-piece-to-move');
export const clearSelectedPieceHighlight=()=>cells.forEach(c=>c.classList.remove('selected-piece-to-move'));

/* ----------  Status & scoreboard  ---------- */
export const updateStatus=msg=>{ if(statusDiv) statusDiv.textContent=msg; };

export function updateScoreboard(){
    if(!state.myEffectiveIcon || (!state.opponentEffectiveIcon && (state.vsCPU || state.pvpRemoteActive))){
        player.determineEffectiveIcons();
    }
    let me  = player.getPlayerName(state.myEffectiveIcon);
    let opp = player.getPlayerName(state.opponentEffectiveIcon);
    if(!state.pvpRemoteActive && !state.vsCPU){   // local PvP
        me  = player.getPlayerName(state.gameP1Icon);
        opp = player.getPlayerName(state.gameP2Icon);
    }
    resultsDiv.innerHTML = `${me} <span id="myWinsSpan">${state.myWins}</span> – ${opp} <span id="opponentWinsSpan">${state.opponentWins}</span> – 🤝 <span id="drawsSpan">${state.draws}</span>`;
}

/* =========================================================================
   CENTRAL: keep all toggle buttons & switch in sync with state
   ========================================================================= */
export function updateAllUIToggleButtons(){
    /* clear */
    [pvpLocalBtn, hostGameBtn, joinGameBtn, cpuBtn].forEach(b=>b?.classList.remove('active'));

    if(state.pvpRemoteActive){
        (state.iAmPlayer1InRemote ? hostGameBtn : joinGameBtn)?.classList.add('active');
    }else if(state.vsCPU){
        cpuBtn?.classList.add('active');
    }else{
        pvpLocalBtn?.classList.add('active');     // local PvP (either variant)
    }

    /* CPU difficulty visible only in Classic vs-CPU */
    const showDiff = state.vsCPU && state.gameVariant===state.GAME_VARIANTS.CLASSIC;
    difficultyDiv.style.display = showDiff ? 'flex' : 'none';

    /* highlight difficulty */
    if(showDiff){
        [easyBtn,mediumBtn,hardBtn].forEach(b=>b?.classList.remove('active'));
        ({easy:easyBtn, hard:hardBtn}[state.difficulty] ?? mediumBtn)?.classList.add('active');
    }

    /* start-options hidden for remote games */
    const startWrap = document.querySelector('.game-start-options');
    const startTitle = startWrap?.previousElementSibling;
    const showStart = !state.pvpRemoteActive;
    if(startWrap)  startWrap.style.display  = showStart ? 'flex' :'none';
    if(startTitle) startTitle.style.display = showStart ? 'block':'none';
    if(showStart){
        [player1StartsBtn,randomStartsBtn,loserStartsBtn].forEach(b=>b?.classList.remove('active'));
        ({player1:player1StartsBtn, random:randomStartsBtn, loser:loserStartsBtn}[state.whoGoesFirstSetting] ?? player1StartsBtn)?.classList.add('active');
    }

    /* Disable CPU button in 3-Piece mode */
    const cpuDisabled = state.gameVariant===state.GAME_VARIANTS.THREE_PIECE;
    cpuBtn.disabled = cpuDisabled;
    cpuBtn.classList.toggle('disabled',cpuDisabled);

    /* sync the on/off switch */
    if(threePieceToggle) threePieceToggle.checked = state.gameVariant===state.GAME_VARIANTS.THREE_PIECE;

    /* theme & sound button glyphs */
    updateThemeToggleButton(document.body.classList.contains('dark-theme'));
    updateSoundToggleButton(state.soundEnabled);
}

/* =========================================================================
   Theme / sound glyph helpers
   ========================================================================= */
export const updateThemeToggleButton = isDark =>{
    if(themeToggle) themeToggle.textContent = isDark ? '☀️':'🌙';
};
export const updateSoundToggleButton = sndOn =>{
    if(soundToggle) soundToggle.textContent = sndOn ? '🔊':'🔇';
};

/* =========================================================================
   QR-code modal listeners
   ========================================================================= */
qrModalCloseBtn?.addEventListener('click', hideQRCode);
qrDisplayArea?.addEventListener('click', e=>{
    if(e.target===qrDisplayArea) hideQRCode();
});
copyHostIdBtn?.addEventListener('click',function(){
    const link=this.dataset.gameLink;
    if(!link) return;
    if(navigator.clipboard?.writeText){
        navigator.clipboard.writeText(link).then(()=>{
            const txt=this.textContent;
            this.textContent='¡Enlace Copiado!';
            this.classList.add('copied');
            setTimeout(()=>{ this.textContent=txt; this.classList.remove('copied'); },2000);
        }).catch(()=>alert('No se pudo copiar, copia manualmente: '+link));
    }else{
        alert('Función de copiar no disponible. Enlace: '+link);
    }
});

/* =========================================================================
   QR-code helpers
   ========================================================================= */
export function displayQRCode(gameLink){
    if(!qrDisplayArea||!qrCodeCanvas||!window.QRious){
        console.warn('QR modal assets missing');
        return;
    }
    new QRious({
        element:qrCodeCanvas,value:gameLink,size:180,padding:10,level:'H',
        foreground:'#ff1493',background:'#fff8fb'
    });
    copyHostIdBtn.textContent='Copiar Enlace del Juego';
    copyHostIdBtn.dataset.gameLink=gameLink;
    copyHostIdBtn.classList.remove('copied');
    qrDisplayArea.classList.add('modal');
    qrDisplayArea.style.display='flex';
}
export function hideQRCode(){
    qrDisplayArea.style.display='none';
    qrDisplayArea.classList.remove('modal');
    copyHostIdBtn.textContent='Copiar Enlace del Juego';
    copyHostIdBtn.classList.remove('copied');
}

/* =========================================================================
   Menu toggling
   ========================================================================= */
export const toggleMenu = ()=>sideMenu?.classList.toggle('open');
export function closeMenuIfNeeded(target){
    if(sideMenu && menuToggle && sideMenu.classList.contains('open') &&
       !sideMenu.contains(target) && !menuToggle.contains(target)){
        sideMenu.classList.remove('open');
    }
}
