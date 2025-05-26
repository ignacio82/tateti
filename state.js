// state.js

// ----------  GAME STATE  ----------
export let board = Array(9).fill(null);
export let currentPlayer = null; // Will be set by game logic (e.g., init)
export let gameActive = false;
export let vsCPU = false;
export let difficulty = 'medium'; // easy, medium, hard

// ----------  PVP REMOTE STATE  ----------
export let pvpRemoteActive = false;
export let isMyTurnInRemote = true;
export let iAmPlayer1InRemote = true; // True if this client is the host
export let gamePaired = false;
export let currentHostPeerId = null;

// ----------  PLAYER CUSTOMIZATION STATE  ----------
export let myPlayerName = 'Jugador';
export let myPlayerIcon = null; // Player's chosen icon (e.g., '🦄')
export let opponentPlayerName = 'Oponente';
export let opponentPlayerIcon = null; // Opponent's chosen icon

// Effective icons used in the current game on the board
export let myEffectiveIcon = null;
export let opponentEffectiveIcon = null;
export let gameP1Icon = null; // Icon for Player 1's position on the board
export let gameP2Icon = null; // Icon for Player 2's position on the board

// ----------  SYMBOLS & SCORE STATE  ----------
export const symbolSet = [ //
    {player1:'🦄',player2:'❤️', nameP1: 'Unicornio', nameP2: 'Corazón'}, //
    {player1:'🐱',player2:'🐶', nameP1: 'Gatito', nameP2: 'Perrito'}, //
    {player1:'🌞',player2:'🌙', nameP1: 'Sol', nameP2: 'Luna'}, //
    {player1:'❌',player2:'⭕', nameP1: 'Equis', nameP2: 'Círculo'} //
];
export let currentSymbolIndex = 0; //
export let currentSymbols = symbolSet[currentSymbolIndex]; //

export let myWins = 0; //
export let opponentWins = 0; //
export let draws = 0; //

// ----------  GAME FLOW STATE  ----------
export let whoGoesFirstSetting = 'player1'; // player1, random, loser //
export let lastWinner = null; // Stores the *icon* of the last winner //
export let previousGameExists = false; //

// ----------  SETTINGS  ----------
export let soundEnabled = true; //

// ----------  CONSTANTS  ----------
export const AUTO_RESTART_DELAY_WIN = 5000; // milliseconds //
export const AUTO_RESTART_DELAY_DRAW = 3000; // milliseconds //

// ---------- STATE MUTATORS/UPDATERS ----------
// It's often good practice to have functions within the state module
// to update the state, rather than allowing direct mutation from outside.
// This provides a more controlled way to manage state changes.

export function setBoard(newBoard) {
    board = newBoard;
}
export function setCurrentPlayer(player) {
    currentPlayer = player;
}
export function setGameActive(isActive) {
    gameActive = isActive;
}
export function setVsCPU(isVsCPU) {
    vsCPU = isVsCPU;
}
export function setDifficulty(newDifficulty) {
    difficulty = newDifficulty;
}
export function setPvpRemoteActive(isActive) {
    pvpRemoteActive = isActive;
}
export function setIsMyTurnInRemote(isMyTurn) {
    isMyTurnInRemote = isMyTurn;
}
export function setIAmPlayer1InRemote(isPlayer1) {
    iAmPlayer1InRemote = isPlayer1;
}
export function setGamePaired(isPaired) {
    gamePaired = isPaired;
}
export function setCurrentHostPeerId(id) {
    currentHostPeerId = id;
}
export function setMyPlayerName(name) {
    myPlayerName = name;
}
export function setMyPlayerIcon(icon) {
    myPlayerIcon = icon;
}
export function setOpponentPlayerName(name) {
    opponentPlayerName = name;
}
export function setOpponentPlayerIcon(icon) {
    opponentPlayerIcon = icon;
}
export function setMyEffectiveIcon(icon) {
    myEffectiveIcon = icon;
}
export function setOpponentEffectiveIcon(icon) {
    opponentEffectiveIcon = icon;
}
export function setGameP1Icon(icon) {
    gameP1Icon = icon;
}
export function setGameP2Icon(icon) {
    gameP2Icon = icon;
}
export function setCurrentSymbolIndex(index) {
    currentSymbolIndex = index;
    currentSymbols = symbolSet[currentSymbolIndex];
}

// Added setter functions for scores
export function setMyWins(wins) {
    myWins = wins;
}
export function setOpponentWins(wins) {
    opponentWins = wins;
}
export function setDraws(numDraws) {
    draws = numDraws;
}

export function incrementMyWins() {
    myWins++;
}
export function incrementOpponentWins() {
    opponentWins++;
}
export function incrementDraws() {
    draws++;
}
export function setWhoGoesFirstSetting(setting) {
    whoGoesFirstSetting = setting;
}
export function setLastWinner(winner) {
    lastWinner = winner;
}
export function setPreviousGameExists(exists) {
    previousGameExists = exists;
}
export function setSoundEnabled(isEnabled) {
    soundEnabled = isEnabled;
}

export function resetScores() {
    myWins = 0;
    opponentWins = 0;
    draws = 0;
}

export function resetGameFlowState() {
    lastWinner = null;
    previousGameExists = (myWins + opponentWins + draws) > 0;
}

export function resetPlayerIconsAndNames() {
    // Keep myPlayerName and myPlayerIcon from localStorage, reset others
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
