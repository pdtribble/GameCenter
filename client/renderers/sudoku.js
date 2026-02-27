// Sudoku renderer — dark phosphor-green terminal aesthetic

import { createInitialState, selectCell, inputNumber, toggleNote, useHint, eraseCell, newGame, serializeState, deserializeState } from '../../games/sudoku/index.js';

let containerEl = null;
let state = null;
let optionsRef = null;
let styleTag = null;
let timerInterval = null;

function injectStyles() {
  if (document.getElementById('sd-styles')) return;
  const st = document.createElement('style');
  st.id = 'sd-styles';
  st.textContent = `
    #sd-root {
      --sd-bg: #0d1117;
      --sd-surface: #161b22;
      --sd-accent: #58a6ff;
      --sd-green: #3fb950;
      --sd-red: #f85149;
      --sd-border: #30363d;
      --sd-border-thick: #8b949e;
      --sd-text: #c9d1d9;
      --sd-text-dim: #484f58;
      --sd-font: 'DM Mono','Courier New',monospace;
      background: var(--sd-bg);
      color: var(--sd-text);
      font-family: var(--sd-font);
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
      user-select: none;
      -webkit-user-select: none;
    }
    #sd-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      background: var(--sd-surface);
      border-bottom: 1px solid var(--sd-border);
      flex-shrink: 0;
    }
    #sd-back {
      background: transparent;
      border: 1px solid var(--sd-border);
      color: #8b949e;
      font-family: var(--sd-font);
      font-size: 0.72rem;
      padding: 6px 12px;
      cursor: pointer;
      letter-spacing: 0.05em;
      border-radius: 6px;
      transition: all 0.15s;
    }
    #sd-back:hover { border-color: var(--sd-accent); color: var(--sd-accent); }
    #sd-title {
      font-size: 0.82rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      color: var(--sd-accent);
      text-transform: uppercase;
    }
    .sd-spacer { flex: 1; }
    #sd-timer {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--sd-text-dim);
      letter-spacing: 0.05em;
    }
    #sd-mistakes {
      font-size: 0.75rem;
      color: var(--sd-red);
      letter-spacing: 0.05em;
    }

    #sd-difficulty-bar {
      display: flex;
      gap: 8px;
      padding: 8px 16px;
      background: var(--sd-surface);
      border-bottom: 1px solid var(--sd-border);
      flex-shrink: 0;
    }
    .sd-diff {
      background: var(--sd-bg);
      border: 1px solid var(--sd-border);
      color: #8b949e;
      font-family: var(--sd-font);
      font-size: 0.65rem;
      font-weight: 600;
      padding: 5px 12px;
      cursor: pointer;
      letter-spacing: 0.06em;
      border-radius: 20px;
      transition: all 0.15s;
      text-transform: uppercase;
    }
    .sd-diff:hover { border-color: #6e7681; color: #c9d1d9; }
    .sd-diff.active {
      background: var(--sd-accent);
      border-color: var(--sd-accent);
      color: #0d1117;
    }

    #sd-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 16px;
      gap: 12px;
      overflow: hidden;
    }

    #sd-board {
      display: grid;
      grid-template-columns: repeat(9, 1fr);
      gap: 1px;
      background: var(--sd-border);
      border: 2px solid var(--sd-border-thick);
      border-radius: 4px;
    }
    .sd-cell {
      width: 36px;
      height: 36px;
      background: var(--sd-surface);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.1s;
      position: relative;
    }
    .sd-cell.given {
      color: #8b949e;
    }
    .sd-cell.user-fill {
      color: var(--sd-text);
    }
    .sd-cell.correct {
      color: var(--sd-green);
    }
    .sd-cell.wrong {
      color: var(--sd-red);
    }
    .sd-cell.selected {
      background: rgba(88,166,255,0.25);
    }
    .sd-cell.highlighted {
      background: rgba(88,166,255,0.1);
    }
    .sd-cell.same-number {
      background: rgba(88,166,255,0.2);
    }
    .sd-cell:nth-child(3n) { border-right: 2px solid var(--sd-border-thick); }
    .sd-cell:nth-child(9n) { border-right: none; }
    .sd-cell:nth-child(n+19):nth-child(-n+27),
    .sd-cell:nth-child(n+46):nth-child(-n+54) {
      border-bottom: 2px solid var(--sd-border-thick);
    }

    .sd-notes {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      grid-template-rows: repeat(3, 1fr);
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .sd-note {
      font-size: 0.45rem;
      color: #6e7681;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    #sd-number-bar {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      justify-content: center;
      max-width: 340px;
    }
    .sd-num {
      width: 34px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1rem;
      font-weight: 700;
      background: var(--sd-surface);
      border: 1px solid var(--sd-border);
      border-radius: 4px;
      cursor: pointer;
      color: var(--sd-text);
      transition: all 0.1s;
    }
    .sd-num:hover { background: var(--sd-border); }
    .sd-num:active { transform: scale(0.95); }
    .sd-num.used {
      color: #484f58;
    }

    #sd-tools {
      display: flex;
      gap: 8px;
    }
    .sd-tool {
      background: var(--sd-surface);
      border: 1px solid var(--sd-border);
      color: #8b949e;
      font-family: var(--sd-font);
      font-size: 0.7rem;
      padding: 8px 14px;
      cursor: pointer;
      letter-spacing: 0.04em;
      border-radius: 6px;
      transition: all 0.15s;
    }
    .sd-tool:hover { border-color: var(--sd-accent); color: var(--sd-accent); }
    .sd-tool.active {
      background: var(--sd-accent);
      border-color: var(--sd-accent);
      color: #0d1117;
    }

    #sd-overlay {
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
    #sd-overlay-title {
      font-size: 2rem;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    #sd-overlay-title.win { 
      color: var(--sd-green); 
      text-shadow: 0 0 30px rgba(63,185,80,0.5);
    }
    #sd-overlay-title.lose { 
      color: var(--sd-red); 
      text-shadow: 0 0 30px rgba(248,81,73,0.5);
    }
    #sd-overlay-stats {
      display: flex;
      gap: 16px;
    }
    .sd-stat-box {
      background: var(--sd-surface);
      border: 1px solid var(--sd-border);
      border-radius: 6px;
      padding: 8px 16px;
      text-align: center;
    }
    .sd-stat-val {
      font-size: 1.4rem;
      font-weight: 700;
      color: var(--sd-text);
    }
    .sd-stat-label {
      font-size: 0.6rem;
      color: #8b949e;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    #sd-overlay-btn {
      background: var(--sd-accent);
      border: none;
      color: #fff;
      font-family: var(--sd-font);
      font-size: 0.8rem;
      font-weight: 700;
      padding: 12px 28px;
      cursor: pointer;
      letter-spacing: 0.08em;
      border-radius: 8px;
      margin-top: 12px;
      transition: all 0.15s, transform 0.1s;
    }
    #sd-overlay-btn:hover { filter: brightness(1.1); transform: translateY(-2px); }

    #sd-footer {
      padding: 8px;
      text-align: center;
      font-size: 0.6rem;
      color: #484f58;
      letter-spacing: 0.05em;
      background: var(--sd-surface);
      border-top: 1px solid var(--sd-border);
    }

    @keyframes sd-shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-4px); }
      75% { transform: translateX(4px); }
    }
    .sd-shake { animation: sd-shake 0.2s ease; }
  `;
  document.head.appendChild(st);
  styleTag = st;
}

function renderBoard() {
  const boardEl = containerEl.querySelector('#sd-board');
  if (!boardEl) return;
  
  boardEl.innerHTML = '';
  
  for (let i = 0; i < 81; i++) {
    const cellEl = document.createElement('div');
    cellEl.className = 'sd-cell';
    cellEl.dataset.index = i;
    
    const value = state.board[i];
    const puzzle = state.puzzle[i];
    const notes = state.notes[i];
    const isGiven = puzzle !== 0;
    const isSelected = state.selectedCell === i;
    const isHighlighted = state.highlightedCells.includes(i);
    
    if (isSelected) cellEl.classList.add('selected');
    else if (isHighlighted) cellEl.classList.add('highlighted');
    
    if (value !== 0) {
      if (isGiven) {
        cellEl.classList.add('given');
      } else {
        cellEl.classList.add('user-fill');
        if (value === state.solution[i]) {
          cellEl.classList.add('correct');
        } else {
          cellEl.classList.add('wrong');
        }
      }
      cellEl.textContent = value;
    } else if (notes && notes.size > 0) {
      const notesEl = document.createElement('div');
      notesEl.className = 'sd-notes';
      for (let n = 1; n <= 9; n++) {
        const noteCell = document.createElement('div');
        noteCell.className = 'sd-note';
        noteCell.textContent = notes.has(n) ? n : '';
        notesEl.appendChild(noteCell);
      }
      cellEl.appendChild(notesEl);
    }
    
    boardEl.appendChild(cellEl);
  }
}

function renderNumberBar() {
  const barEl = containerEl.querySelector('#sd-number-bar');
  if (!barEl) return;
  
  barEl.innerHTML = '';
  
  const usedNumbers = new Set();
  for (let i = 0; i < 81; i++) {
    if (state.board[i] !== 0) usedNumbers.add(state.board[i]);
  }
  
  for (let n = 1; n <= 9; n++) {
    const numEl = document.createElement('button');
    numEl.className = 'sd-num';
    if (usedNumbers.has(n)) numEl.classList.add('used');
    numEl.textContent = n;
    numEl.dataset.num = n;
    barEl.appendChild(numEl);
  }
  
  // Add erase button
  const eraseEl = document.createElement('button');
  eraseEl.className = 'sd-num';
  eraseEl.innerHTML = '⌫';
  eraseEl.dataset.num = '0';
  barEl.appendChild(eraseEl);
}

function updateTimer() {
  const timerEl = containerEl.querySelector('#sd-timer');
  if (!timerEl) return;
  
  const mins = Math.floor(state.timer / 60);
  const secs = state.timer % 60;
  timerEl.textContent = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
}

function updateMistakes() {
  const mistakesEl = containerEl.querySelector('#sd-mistakes');
  if (!mistakesEl) return;
  
  const remaining = state.maxMistakes - state.mistakes;
  mistakesEl.textContent = `❤️${remaining}`;
}

function startTimer() {
  stopTimer();
  timerInterval = setInterval(() => {
    if (state.phase === 'playing') {
      state.timer++;
      updateTimer();
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function showOverlay(phase) {
  const overlay = containerEl.querySelector('#sd-overlay');
  if (!overlay) return;
  
  overlay.style.display = 'flex';
  
  const title = overlay.querySelector('#sd-overlay-title');
  title.textContent = phase === 'won' ? 'SOLVED!' : 'GAME OVER';
  title.className = phase;
  
  const mins = Math.floor(state.timer / 60);
  const secs = state.timer % 60;
  const timeStr = `${mins}:${String(secs).padStart(2,'0')}`;
  
  overlay.querySelector('#sd-overlay-stats').innerHTML = `
    <div class="sd-stat-box">
      <div class="sd-stat-val">${timeStr}</div>
      <div class="sd-stat-label">Time</div>
    </div>
    <div class="sd-stat-box">
      <div class="sd-stat-val">${state.hintsUsed}</div>
      <div class="sd-stat-label">Hints</div>
    </div>
  `;
}

function hideOverlay() {
  const overlay = containerEl.querySelector('#sd-overlay');
  if (overlay) overlay.style.display = 'none';
}

let noteMode = false;

function startNewGame(difficulty) {
  hideOverlay();
  stopTimer();
  
  state = newGame(difficulty);
  noteMode = false;
  
  const diffBtns = containerEl.querySelectorAll('.sd-diff');
  diffBtns.forEach(b => b.classList.toggle('active', b.dataset.diff === difficulty));
  
  renderBoard();
  renderNumberBar();
  updateTimer();
  updateMistakes();
  
  const toolBtns = containerEl.querySelectorAll('.sd-tool');
  toolBtns.forEach(b => b.classList.toggle('active', b.id === 'sd-erase-btn' && b.classList.contains('active')));
  
  startTimer();
  saveGame();
}

function saveGame() {
  if (!optionsRef?.playerId) return;
  
  fetch('/api/sp/saves/sudoku', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slot: 'autosave', data: serializeState(state) }),
  }).catch(() => {});
}

export function render(container, options) {
  optionsRef = options;
  containerEl = container;
  
  injectStyles();
  
  container.innerHTML = `
    <div id="sd-root">
      <div id="sd-header">
        <button id="sd-back">← SOLO</button>
        <span id="sd-title">SUDOKU</span>
        <div class="sd-spacer"></div>
        <span id="sd-timer">00:00</span>
        <span id="sd-mistakes">❤️3</span>
      </div>
      <div id="sd-difficulty-bar">
        <button class="sd-diff" data-diff="easy">EASY</button>
        <button class="sd-diff active" data-diff="medium">MEDIUM</button>
        <button class="sd-diff" data-diff="hard">HARD</button>
      </div>
      <div id="sd-body">
        <div id="sd-board"></div>
        <div id="sd-tools">
          <button class="sd-tool" id="sd-note-btn">✎ NOTES</button>
          <button class="sd-tool" id="sd-erase-btn">⌫ ERASE</button>
          <button class="sd-tool" id="sd-hint-btn">💡 HINT</button>
        </div>
        <div id="sd-number-bar"></div>
      </div>
      <div id="sd-overlay" style="display:none">
        <div id="sd-overlay-title"></div>
        <div id="sd-overlay-stats"></div>
        <button id="sd-overlay-btn">NEW GAME</button>
      </div>
      <div id="sd-footer">FILL THE GRID · NO REPEATS IN ROWS, COLUMNS, OR BOXES</div>
    </div>`;
  
  // Try to load saved game
  const saved = options?.savedState;
  if (saved) {
    try {
      state = deserializeState(saved);
      if (state.phase === 'playing') startTimer();
    } catch {
      startNewGame('medium');
    }
  } else {
    startNewGame('medium');
  }
  
  // Event listeners
  container.querySelector('#sd-back').addEventListener('click', () => {
    if (optionsRef?.navigate) optionsRef.navigate('singleplayer');
  });
  
  container.querySelector('#sd-difficulty-bar').addEventListener('click', e => {
    const btn = e.target.closest('.sd-diff');
    if (!btn) return;
    const diff = btn.dataset.diff;
    startNewGame(diff);
  });
  
  container.querySelector('#sd-board').addEventListener('click', e => {
    const cell = e.target.closest('.sd-cell');
    if (!cell) return;
    const index = parseInt(cell.dataset.index, 10);
    state = selectCell(state, index);
    renderBoard();
  });
  
  container.querySelector('#sd-number-bar').addEventListener('click', e => {
    const num = e.target.closest('.sd-num');
    if (!num) return;
    const numVal = parseInt(num.dataset.num, 10);
    
    if (noteMode && numVal !== 0) {
      state = toggleNote(state, numVal);
    } else if (numVal === 0) {
      state = eraseCell(state);
    } else {
      state = inputNumber(state, numVal);
    }
    
    renderBoard();
    renderNumberBar();
    updateMistakes();
    saveGame();
    
    if (state.phase === 'won' || state.phase === 'lost') {
      stopTimer();
      showOverlay(state.phase);
    }
  });
  
  container.querySelector('#sd-note-btn').addEventListener('click', () => {
    noteMode = !noteMode;
    container.querySelector('#sd-note-btn').classList.toggle('active', noteMode);
    container.querySelector('#sd-erase-btn').classList.remove('active');
  });
  
  container.querySelector('#sd-erase-btn').addEventListener('click', () => {
    if (state.selectedCell !== null && state.board[state.selectedCell] === 0) {
      state = eraseCell(state);
      renderBoard();
      saveGame();
    }
  });
  
  container.querySelector('#sd-hint-btn').addEventListener('click', () => {
    state = useHint(state);
    renderBoard();
    renderNumberBar();
    saveGame();
    
    if (state.phase === 'won') {
      stopTimer();
      showOverlay('won');
    }
  });
  
  container.querySelector('#sd-overlay-btn').addEventListener('click', () => {
    const diff = state.difficulty || 'medium';
    startNewGame(diff);
  });
  
  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeydown);
}

function handleKeydown(e) {
  if (!containerEl) return;
  
  if (e.key >= '1' && e.key <= '9') {
    const num = parseInt(e.key, 10);
    if (noteMode) {
      state = toggleNote(state, num);
    } else {
      state = inputNumber(state, num);
    }
    renderBoard();
    renderNumberBar();
    updateMistakes();
    saveGame();
    
    if (state.phase === 'won' || state.phase === 'lost') {
      stopTimer();
      showOverlay(state.phase);
    }
  } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
    state = eraseCell(state);
    renderBoard();
    saveGame();
  } else if (e.key === 'n' || e.key === 'N') {
    noteMode = !noteMode;
    containerEl.querySelector('#sd-note-btn').classList.toggle('active', noteMode);
  } else if (e.key === 'h' || e.key === 'H') {
    state = useHint(state);
    renderBoard();
    renderNumberBar();
    saveGame();
    
    if (state.phase === 'won') {
      stopTimer();
      showOverlay('won');
    }
  } else if (e.key === 'Escape') {
    if (optionsRef?.navigate) optionsRef.navigate('singleplayer');
  }
}

export function destroy() {
  stopTimer();
  document.removeEventListener('keydown', handleKeydown);
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
