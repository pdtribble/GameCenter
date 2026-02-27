// Wordle renderer — dark phosphor-green terminal aesthetic
// Imports game logic from games/wordle/index.js

import { initGame, inputLetter, deleteLetter, submitGuess, getDailyWord, getShareText, serializeState, deserializeState } from '../../games/wordle/index.js';

let containerEl = null;
let state = null;
let optionsRef = null;
let wordList = [];
let validGuesses = [];
let styleTag = null;
let keyHandler = null;
let gameMode = 'daily';

function injectStyles() {
  if (document.getElementById('wl-styles')) return;
  const st = document.createElement('style');
  st.id = 'wl-styles';
  st.textContent = `
    #wl-root {
      --wl-bg: #0d1117;
      --wl-surface: #161b22;
      --wl-accent: #538d4e;
      --wl-present: #b59f3b;
      --wl-absent: #3a3a3c;
      --wl-border: #30363d;
      --wl-text: #ffffff;
      --wl-text-dim: #818384;
      --wl-font: 'DM Mono','Courier New',monospace;
      background: var(--wl-bg);
      color: var(--wl-text);
      font-family: var(--wl-font);
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
      user-select: none;
      -webkit-user-select: none;
    }
    #wl-header {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 10px 16px;
      background: var(--wl-surface);
      border-bottom: 1px solid var(--wl-border);
      flex-shrink: 0;
    }
    #wl-back {
      background: transparent;
      border: 1px solid var(--wl-border);
      color: #8b949e;
      font-family: var(--wl-font);
      font-size: 0.72rem;
      padding: 6px 12px;
      cursor: pointer;
      letter-spacing: 0.05em;
      border-radius: 6px;
      transition: all 0.15s;
    }
    #wl-back:hover { border-color: #58a6ff; color: #58a6ff; }
    #wl-title {
      font-size: 0.9rem;
      font-weight: 700;
      letter-spacing: 0.15em;
      color: var(--wl-text);
      text-transform: uppercase;
    }
    #wl-mode-toggle {
      background: transparent;
      border: 1px solid var(--wl-border);
      color: #8b949e;
      font-family: var(--wl-font);
      font-size: 0.65rem;
      padding: 5px 10px;
      cursor: pointer;
      letter-spacing: 0.4em;
      border-radius: 6px;
      transition: all 0.15s;
    }
    #wl-mode-toggle:hover { border-color: #58a6ff; color: #58a6ff; }

    #wl-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 16px;
      gap: 16px;
    }

    #wl-board {
      display: grid;
      grid-template-rows: repeat(6, 1fr);
      gap: 5px;
    }
    .wl-row {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 5px;
    }
    .wl-tile {
      width: 52px;
      height: 52px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.8rem;
      font-weight: 700;
      text-transform: uppercase;
      background: var(--wl-surface);
      border: 2px solid var(--wl-border);
      border-radius: 4px;
      transition: all 0.15s;
    }
    .wl-tile.filled {
      border-color: #565758;
      animation: wl-pop 0.1s ease;
    }
    .wl-tile.correct {
      background: var(--wl-accent);
      border-color: var(--wl-accent);
    }
    .wl-tile.present {
      background: var(--wl-present);
      border-color: var(--wl-present);
    }
    .wl-tile.absent {
      background: var(--wl-absent);
      border-color: var(--wl-absent);
    }
    .wl-tile.current {
      border-color: #818384;
    }
    .wl-tile.reveal {
      animation: wl-reveal 0.5s ease forwards;
    }
    @keyframes wl-pop {
      0% { transform: scale(1); }
      50% { transform: scale(1.1); }
      100% { transform: scale(1); }
    }
    @keyframes wl-reveal {
      0% { transform: rotateX(0); }
      50% { transform: rotateX(90deg); }
      100% { transform: rotateX(0); }
    }

    #wl-keyboard {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 8px;
    }
    .wl-key-row {
      display: flex;
      justify-content: center;
      gap: 6px;
    }
    .wl-key {
      min-width: 40px;
      height: 52px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      background: #818384;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      color: #fff;
      transition: all 0.1s;
    }
    .wl-key:hover { filter: brightness(1.2); }
    .wl-key:active { transform: scale(0.95); }
    .wl-key.wide { min-width: 65px; font-size: 0.65rem; }
    .wl-key.correct { background: var(--wl-accent); }
    .wl-key.present { background: var(--wl-present); }
    .wl-key.absent { background: var(--wl-absent); }

    #wl-message {
      position: fixed;
      top: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: #fff;
      color: #000;
      padding: 12px 20px;
      border-radius: 4px;
      font-weight: 600;
      font-size: 0.8rem;
      z-index: 100;
      animation: wl-fade 2s ease forwards;
    }
    @keyframes wl-fade {
      0% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
      10% { opacity: 1; transform: translateX(-50%) translateY(0); }
      90% { opacity: 1; }
      100% { opacity: 0; }
    }

    #wl-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      background: rgba(13,17,23,0.92);
      backdrop-filter: blur(8px);
      z-index: 50;
    }
    #wl-overlay-title {
      font-size: 2rem;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    #wl-overlay-title.win { 
      color: var(--wl-accent); 
      text-shadow: 0 0 30px rgba(83,141,78,0.5);
    }
    #wl-overlay-title.lose { 
      color: #f85149; 
      text-shadow: 0 0 30px rgba(248,81,73,0.5);
    }
    #wl-overlay-word {
      font-size: 1.2rem;
      letter-spacing: 0.2em;
      color: #8b949e;
    }
    #wl-overlay-stats {
      display: flex;
      gap: 16px;
      margin-top: 8px;
    }
    .wl-stat-box {
      background: var(--wl-surface);
      border: 1px solid var(--wl-border);
      border-radius: 6px;
      padding: 8px 16px;
      text-align: center;
    }
    .wl-stat-val {
      font-size: 1.4rem;
      font-weight: 700;
      color: var(--wl-text);
    }
    .wl-stat-label {
      font-size: 0.6rem;
      color: #8b949e;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    #wl-overlay-btn {
      background: var(--wl-accent);
      border: none;
      color: #fff;
      font-family: var(--wl-font);
      font-size: 0.8rem;
      font-weight: 700;
      padding: 12px 28px;
      cursor: pointer;
      letter-spacing: 0.08em;
      border-radius: 8px;
      margin-top: 12px;
      transition: all 0.15s, transform 0.1s;
    }
    #wl-overlay-btn:hover { filter: brightness(1.1); transform: translateY(-2px); }
    #wl-share-btn {
      background: var(--wl-surface);
      border: 1px solid var(--wl-border);
      color: var(--wl-text);
      font-family: var(--wl-font);
      font-size: 0.75rem;
      font-weight: 600;
      padding: 10px 20px;
      cursor: pointer;
      letter-spacing: 0.05em;
      border-radius: 8px;
      transition: all 0.15s;
    }
    #wl-share-btn:hover { border-color: #58a6ff; color: #58a6ff; }

    #wl-footer {
      padding: 8px;
      text-align: center;
      font-size: 0.6rem;
      color: #484f58;
      letter-spacing: 0.05em;
      background: var(--wl-surface);
      border-top: 1px solid var(--wl-border);
    }
  `;
  document.head.appendChild(st);
  styleTag = st;
}

function renderBoard() {
  const boardEl = containerEl.querySelector('#wl-board');
  if (!boardEl) return;
  
  boardEl.innerHTML = '';
  
  for (let row = 0; row < 6; row++) {
    const rowEl = document.createElement('div');
    rowEl.className = 'wl-row';
    
    for (let col = 0; col < 5; col++) {
      const tileEl = document.createElement('div');
      tileEl.className = 'wl-tile';
      tileEl.dataset.row = row;
      tileEl.dataset.col = col;
      
      const guess = state.guesses[row];
      const isCurrentRow = row === state.guesses.length;
      const currentInput = state.currentInput;
      
      if (guess) {
        tileEl.textContent = guess.word[col];
        tileEl.classList.add(guess.result[col]);
      } else if (isCurrentRow && col < currentInput.length) {
        tileEl.textContent = currentInput[col];
        tileEl.classList.add('filled', 'current');
      }
      
      rowEl.appendChild(tileEl);
    }
    
    boardEl.appendChild(rowEl);
  }
}

function renderKeyboard() {
  const kbEl = containerEl.querySelector('#wl-keyboard');
  if (!kbEl) return;
  
  const rows = [
    ['Q','W','E','R','T','Y','U','I','O','P'],
    ['A','S','D','F','G','H','J','K','L'],
    ['ENTER','Z','X','C','V','B','N','M','⌫'],
  ];
  
  kbEl.innerHTML = '';
  
  for (const row of rows) {
    const rowEl = document.createElement('div');
    rowEl.className = 'wl-key-row';
    
    for (const key of row) {
      const keyEl = document.createElement('button');
      keyEl.className = 'wl-key';
      if (key === 'ENTER' || key === '⌫') keyEl.classList.add('wide');
      keyEl.textContent = key;
      keyEl.dataset.key = key;
      rowEl.appendChild(keyEl);
    }
    
    kbEl.appendChild(rowEl);
  }
  
  updateKeyboardColors();
}

function updateKeyboardColors() {
  const keys = containerEl.querySelectorAll('.wl-key');
  for (const key of keys) {
    const letter = key.dataset.key;
    if (letter === 'ENTER' || letter === '⌫') continue;
    
    key.classList.remove('correct', 'present', 'absent');
    const status = state.usedLetters[letter];
    if (status) key.classList.add(status);
  }
}

function showMessage(text, duration = 1500) {
  const existing = containerEl.querySelector('#wl-message');
  if (existing) existing.remove();
  
  const msg = document.createElement('div');
  msg.id = 'wl-message';
  msg.textContent = text;
  containerEl.appendChild(msg);
  
  setTimeout(() => msg.remove(), duration);
}

function handleKey(key) {
  if (state.phase !== 'playing') return;
  
  if (key === 'Enter') {
    const result = submitGuess(state, [...wordList, ...validGuesses]);
    if (result.error) {
      showMessage(result.error === 'not_enough_letters' ? 'Not enough letters' : 'Not in word list');
      shakeRow();
    } else {
      state = result.state;
      renderBoard();
      updateKeyboardColors();
      saveGame();
      
      if (state.phase === 'won' || state.phase === 'lost') {
        setTimeout(() => showOverlay(state.phase), 600);
      }
    }
    return;
  }
  
  if (key === 'Backspace') {
    state = deleteLetter(state);
    renderBoard();
    return;
  }
  
  if (/^[A-Z]$/i.test(key)) {
    state = inputLetter(state, key.toUpperCase());
    renderBoard();
    return;
  }
}

function shakeRow() {
  const row = containerEl.querySelector(`.wl-row:nth-child(${state.guesses.length + 1})`);
  if (row) {
    row.style.animation = 'wl-shake 0.3s ease';
    setTimeout(() => row.style.animation = '', 300);
  }
}

function showOverlay(phase) {
  const overlay = containerEl.querySelector('#wl-overlay');
  if (!overlay) return;
  
  overlay.style.display = 'flex';
  
  const title = overlay.querySelector('#wl-overlay-title');
  title.textContent = phase === 'won' ? 'YOU WIN!' : 'GAME OVER';
  title.className = phase;
  
  const word = overlay.querySelector('#wl-overlay-word');
  word.textContent = state.targetWord;
  word.style.display = phase === 'lost' ? 'block' : 'none';
  
  const played = state.guesses.length;
  const wins = phase === 'won' ? 1 : 0;
  
  overlay.querySelector('#wl-overlay-stats').innerHTML = `
    <div class="wl-stat-box">
      <div class="wl-stat-val">${played}</div>
      <div class="wl-stat-label">Played</div>
    </div>
    <div class="wl-stat-box">
      <div class="wl-stat-val">${wins}</div>
      <div class="wl-stat-label">Wins</div>
    </div>
  `;
  
  overlay.querySelector('#wl-share-btn').style.display = phase === 'won' ? 'inline-block' : 'none';
}

function hideOverlay() {
  const overlay = containerEl.querySelector('#wl-overlay');
  if (overlay) overlay.style.display = 'none';
}

function startNewGame() {
  hideOverlay();
  
  let targetWord, seed, date;
  
  if (gameMode === 'daily') {
    const daily = getDailyWord(wordList);
    targetWord = daily.word;
    seed = daily.seed;
    date = daily.date;
  } else {
    const idx = Math.floor(Math.random() * wordList.length);
    targetWord = wordList[idx].toUpperCase();
    seed = null;
    date = null;
  }
  
  state = initGame(targetWord, gameMode, seed, date);
  renderBoard();
  renderKeyboard();
  saveGame();
}

function saveGame() {
  if (!optionsRef?.playerId) return;
  
  const saveKey = gameMode === 'daily' ? 'dailySave' : 'freeSave';
  fetch('/api/sp/saves/wordle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slot: saveKey, data: serializeState(state) }),
  }).catch(() => {});
}

function loadGame() {
  const saveKey = gameMode === 'daily' ? 'dailySave' : 'freeSave';
  return optionsRef?.[saveKey];
}

export function render(container, options) {
  optionsRef = options;
  containerEl = container;
  
  wordList = options?.wordList || [];
  validGuesses = options?.validGuesses || [];
  gameMode = 'daily';
  
  injectStyles();
  
  container.innerHTML = `
    <div id="wl-root">
      <div id="wl-header">
        <button id="wl-back">← SOLO</button>
        <span id="wl-title">WORDLE</span>
        <button id="wl-mode-toggle">FREE PLAY</button>
      </div>
      <div id="wl-body">
        <div id="wl-board"></div>
        <div id="wl-keyboard"></div>
      </div>
      <div id="wl-overlay" style="display:none">
        <div id="wl-overlay-title"></div>
        <div id="wl-overlay-word"></div>
        <div id="wl-overlay-stats"></div>
        <button id="wl-share-btn">SHARE</button>
        <button id="wl-overlay-btn">PLAY AGAIN</button>
      </div>
      <div id="wl-footer">DAILY PUZZLE — COMING SOON</div>
    </div>`;
  
  const saved = loadGame();
  if (saved) {
    try {
      state = deserializeState(saved);
    } catch {
      startNewGame();
    }
  } else {
    startNewGame();
  }
  
  renderBoard();
  renderKeyboard();
  
  // Event listeners
  container.querySelector('#wl-back').addEventListener('click', () => {
    if (optionsRef?.navigate) optionsRef.navigate('singleplayer');
  });
  
  container.querySelector('#wl-mode-toggle').addEventListener('click', () => {
    gameMode = gameMode === 'daily' ? 'free' : 'daily';
    container.querySelector('#wl-mode-toggle').textContent = 
      gameMode === 'daily' ? 'FREE PLAY' : 'DAILY';
    container.querySelector('#wl-footer').textContent = 
      gameMode === 'daily' ? 'DAILY PUZZLE' : 'FREE PLAY MODE';
    startNewGame();
  });
  
  container.querySelector('#wl-overlay-btn').addEventListener('click', startNewGame);
  
  container.querySelector('#wl-share-btn').addEventListener('click', () => {
    const text = getShareText(state);
    navigator.clipboard.writeText(text).then(() => {
      showMessage('Copied to clipboard!');
    });
  });
  
  container.querySelector('#wl-keyboard').addEventListener('click', e => {
    const key = e.target.closest('.wl-key')?.dataset.key;
    if (key) handleKey(key);
  });
  
  keyHandler = (e) => {
    if (optionsRef?.navigate && e.key === 'Escape') {
      optionsRef.navigate('singleplayer');
      return;
    }
    handleKey(e.key);
  };
  document.addEventListener('keydown', keyHandler);
}

export function destroy() {
  if (keyHandler) {
    document.removeEventListener('keydown', keyHandler);
    keyHandler = null;
  }
  if (styleTag) {
    styleTag.remove();
    styleTag = null;
  }
  if (containerEl) {
    containerEl.innerHTML = '';
    containerEl = null;
  }
  state = null;
  optionsRef = null;
}
