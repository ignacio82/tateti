// state.js

// ---------- GAME MODE CONSTANTS ----------
export const GAME_VARIANTS = {
    CLASSIC: 'classic',
    THREE_PIECE: 'threePiece'
};

export const GAME_PHASES = {
    PLACING: 'placing',
    MOVING: 'moving',
    GAME_OVER: 'gameOver' // General game over phase
};

// ----------  GAME STATE  ----------
export let board = Array(9).fill(null);
export let currentPlayer = null;
export let gameActive = false;
export let vsCPU = false;
export let difficulty = 'medium'; // easy, medium, hard
export let gameVariant = GAME_VARIANTS.CLASSIC; // Default to classic Tic-Tac-Toe
export let gamePhase = GAME_PHASES.PLACING; // Initial phase

// For THREE_PIECE variant
export let playerPiecesOnBoard = {}; // e.g., { '🦄': 0, '❤️': 0 }
export let selectedPieceIndex = null; // Index of the piece selected to be moved

// NEW: Add turn counter
export let turnCounter = 0;


// ----------  PVP REMOTE STATE  ----------
export let pvpRemoteActive = false;
export let isMyTurnInRemote = true;
export let iAmPlayer1InRemote = true;
export let gamePaired = false;
export let currentHostPeerId = null;

// ----------  PLAYER CUSTOMIZATION STATE  ----------
export let myPlayerName = 'Jugador';
export let myPlayerIcon = null;
export let opponentPlayerName = 'Oponente';
export let opponentPlayerIcon = null;

export let myEffectiveIcon = null;
export let opponentEffectiveIcon = null;
export let gameP1Icon = null;
export let gameP2Icon = null;

// ----------  SYMBOLS & SCORE STATE  ----------
export const symbolSet = [
    {player1:'🦄',player2:'❤️', nameP1: 'Unicornio', nameP2: 'Corazón'},
    {player1:'🐱',player2:'🐶', nameP1: 'Gatito', nameP2: 'Perrito'},
    {player1:'🌞',player2:'🌙', nameP1: 'Sol', nameP2: 'Luna'},
    {player1:'❌',player2:'⭕', nameP1: 'Equis', nameP2: 'Círculo'}
];
export let currentSymbolIndex = 0;
export let currentSymbols = symbolSet[currentSymbolIndex];

export let myWins = 0;
export let opponentWins = 0;
export let draws = 0;

// ----------  GAME FLOW STATE  ----------
export let whoGoesFirstSetting = 'player1';
export let lastWinner = null;
export let previousGameExists = false;

// ----------  SETTINGS  ----------
export let soundEnabled = true;

// ----------  CONSTANTS  ----------
export const AUTO_RESTART_DELAY_WIN = 5000;
export const AUTO_RESTART_DELAY_DRAW = 3000;
export const MAX_PIECES_PER_PLAYER = 3; // For THREE_PIECE variant

// ---------- STATE MUTATORS/UPDATERS ----------
export function setBoard(newBoard) { board = newBoard; }
export function setCurrentPlayer(player) { currentPlayer = player; }
export function setGameActive(isActive) { gameActive = isActive; }
export function setVsCPU(isVsCPU) { vsCPU = isVsCPU; }
export function setDifficulty(newDifficulty) { difficulty = newDifficulty; }

export function setGameVariant(variant) { gameVariant = variant; }

export function setGamePhase(phase) {
    // DEBUGGING LOG: Track all calls to setGamePhase
    console.log(`state.js: setGamePhase CALLED. Old phase: ${gamePhase}, New phase: ${phase}. Timestamp: ${new Date().toISOString()}`);
    // console.log(new Error().stack); // Optional: uncomment for full call stack
    gamePhase = phase;
}

export function setPlayerPiecesOnBoard(playerSymbol, count) { playerPiecesOnBoard[playerSymbol] = count; }
export function setSelectedPieceIndex(index) { selectedPieceIndex = index; }
export function resetPlayerPiecesOnBoard() { playerPiecesOnBoard = {}; }


export function setPvpRemoteActive(isActive) { pvpRemoteActive = isActive; }
export function setIsMyTurnInRemote(isMyTurn) { isMyTurnInRemote = isMyTurn; }
export function setIAmPlayer1InRemote(isPlayer1) { iAmPlayer1InRemote = isPlayer1; }
export function setGamePaired(isPaired) { gamePaired = isPaired; }
export function setCurrentHostPeerId(id) { currentHostPeerId = id; }

export function setMyPlayerName(name) { myPlayerName = name; }
export function setMyPlayerIcon(icon) { myPlayerIcon = icon; }
export function setOpponentPlayerName(name) { opponentPlayerName = name; }
export function setOpponentPlayerIcon(icon) { opponentPlayerIcon = icon; }
export function setMyEffectiveIcon(icon) { myEffectiveIcon = icon; }
export function setOpponentEffectiveIcon(icon) { opponentEffectiveIcon = icon; }
export function setGameP1Icon(icon) { gameP1Icon = icon; }
export function setGameP2Icon(icon) { gameP2Icon = icon; }

export function setCurrentSymbolIndex(index) {
    currentSymbolIndex = index;
    currentSymbols = symbolSet[currentSymbolIndex];
}

export function setMyWins(wins) { myWins = wins; }
export function setOpponentWins(wins) { opponentWins = wins; }
export function setDraws(numDraws) { draws = numDraws; }

export function incrementMyWins() { myWins++; }
export function incrementOpponentWins() { opponentWins++; }
export function incrementDraws() { draws++; }

export function setWhoGoesFirstSetting(setting) { whoGoesFirstSetting = setting; }
export function setLastWinner(winner) { lastWinner = winner; }
export function setPreviousGameExists(exists) { previousGameExists = exists; }
export function setSoundEnabled(isEnabled) { soundEnabled = isEnabled; }

// NEW: Mutators for turnCounter
export function incrementTurnCounter() {
    turnCounter++;
    console.log(`state.js: incrementTurnCounter. New TC: ${turnCounter}. Timestamp: ${new Date().toISOString()}`); // DEBUGGING LOG
}
export function setTurnCounter(tc) {
    console.log(`state.js: setTurnCounter CALLED. Old TC: ${turnCounter}, New TC: ${tc}. Timestamp: ${new Date().toISOString()}`); // DEBUGGING LOG
    turnCounter = tc;
}


export function resetScores() {
    myWins = 0;
    opponentWins = 0;
    draws = 0;
}

export function resetGameFlowState() { // Also resets states for the new game variant
    console.log(`state.js: resetGameFlowState CALLED. Current TC before reset: ${turnCounter}. Timestamp: ${new Date().toISOString()}`); // DEBUGGING LOG
    lastWinner = null;
    previousGameExists = (myWins + opponentWins + draws) > 0;
    gamePhase = GAME_PHASES.PLACING;
    resetPlayerPiecesOnBoard();
    selectedPieceIndex = null;
    turnCounter = 0; // <-- NEW: Reset turn counter here
    console.log(`state.js: resetGameFlowState FINISHED. New TC: ${turnCounter}. Timestamp: ${new Date().toISOString()}`); // DEBUGGING LOG
    // gameVariant is typically set by user choice and persists or is reset by mode button clicks
}

export function resetPlayerIconsAndNames() {
    opponentPlayerName = 'Oponente';
    opponentPlayerIcon = null;
    myEffectiveIcon = null;
    opponentEffectiveIcon = null;
    gameP1Icon = null;
    gameP2Icon = null;
}

export function resetRemoteState() {
    pvpRemoteActive = false;
    isMyTurnInRemote = true;
    iAmPlayer1InRemote = true;
    gamePaired = false;
    currentHostPeerId = null;
}