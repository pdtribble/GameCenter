// 2048 renderer — slide and merge tiles to reach 2048
// Game logic inlined (games/ is server-side only)

// ── Game logic (pure functions) ─────────────────────────────────────────────────

function createEmptyBoard(size = 4) {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

function getEmptyCells(board) {
  const cells = [];
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      if (board[r][c] === 0) cells.push({ row: r, col: c });
    }
  }
  return cells;
}

function addRandomTile(board, rngFn) {
  const empties = getEmptyCells(board);
  if (empties.length === 0) return board;
  
  const idx = Math.floor(rngFn() * empties.length);
  const { row, col } = empties[idx];
  const value = rngFn() < 0.9 ? 2 : 4;
  
  const newBoard = board.map(r => [...r]);
  newBoard[row][col] = value;
  return newBoard;
}

function hasMovesRemaining(board) {
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      if (board[r][c] === 0) return true;
    }
  }
  const size = board.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const val = board[r][c];
      if (c + 1 < size && board[r][c + 1] === val) return true;
      if (r + 1 < size && board[r + 1][c] === val) return true;
    }
  }
  return false;
}

function slideRow(row) {
  let filtered = row.filter(v => v !== 0);
  const merged = [];
  let i = 0;
  while (i < filtered.length) {
    if (i + 1 < filtered.length && filtered[i] === filtered[i + 1]) {
      merged.push(filtered[i] * 2);
      i += 2;
    } else {
      merged.push(filtered[i]);
      i++;
    }
  }
  while (merged.length < row.length) merged.push(0);
  return merged;
}

function rotateLeft(board) {
  const size = board.length;
  const result = createEmptyBoard(size);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      result[r][c] = board[c][size - 1 - r];
    }
  }
  return result;
}

function rotateRight(board) {
  const size = board.length;
  const result = createEmptyBoard(size);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      result[r][c] = board[size - 1 - c][r];
    }
  }
  return result;
}

function applyMove(board, direction, rngFn) {
  let rotated;
  let scoreGain = 0;
  let moved = false;
  
  switch (direction) {
    case 'left':   rotated = board; break;
    case 'right':  rotated = rotateRight(rotateRight(board)); break;
    case 'up':     rotated = rotateLeft(board); break;
    case 'down':   rotated = rotateRight(board); break;
    default:        return { board, scoreGain: 0, moved: false };
  }
  
  const newBoard = rotated.map((row, ri) => {
    const oldStr = row.join(',');
    const newRow = slideRow(row);
    const newStr = newRow.join(',');
    if (oldStr !== newStr) moved = true;
    for (let i = 0; i < row.length; i++) {
      if (row[i] !== 0 && newRow[i] !== row[i]) {
        scoreGain += newRow[i] - row[i];
      }
    }
    return newRow;
  });
  
  let finalBoard;
  switch (direction) {
    case 'left':   finalBoard = newBoard; break;
    case 'right':  finalBoard = rotateRight(rotateRight(newBoard)); break;
    case 'up':     finalBoard = rotateRight(newBoard); break;
    case 'down':   finalBoard = rotateLeft(newBoard); break;
  }
  
  if (moved) {
    finalBoard = addRandomTile(finalBoard, rngFn);
  }
  
  return { board: finalBoard, scoreGain: Math.max(0, scoreGain), moved };
}

function checkWin(board) {
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      if (board[r][c] === 2048) return true;
    }
  }
  return false;
}

function initGame(rngFn = Math.random) {
  let board = createEmptyBoard(4);
  board = addRandomTile(board, rngFn);
  board = addRandomTile(board, rngFn);
  return {
    board,
    score: 0,
    best: 0,
    phase: 'playing',
    moved: false,
    won2048: false,
    continuing: false,
    size: 4,
  };
}

function move(state, direction, rngFn = Math.random) {
  if (state.phase !== 'playing') return state;
  
  const { board: newBoard, scoreGain, moved } = applyMove(state.board, direction, rngFn);
  const newScore = state.score + scoreGain;
  const newBest = Math.max(state.best, newScore);
  const won2048 = state.won2048 || checkWin(newBoard);
  
  let newPhase = state.phase;
  if (won2048 && !state.won2048 && !state.continuing) {
    newPhase = 'won';
  } else if (!hasMovesRemaining(newBoard)) {
    newPhase = 'over';
  }
  
  return {
    ...state,
    board: newBoard,
    score: newScore,
    best: newBest,
    phase: newPhase,
    moved,
    won2048,
  };
}

function continueGame(state) {
  return { ...state, phase: 'playing', continuing: true };
}

function serializeState(state) {
  return JSON.stringify(state);
}

function deserializeState(json) {
  try { return JSON.parse(json); } catch { return null; }
}

let containerEl = null;
let state = null;
let keyHandler = null;
let touchHandlerStart = null;
let touchHandlerEnd = null;
let audioCtx = null;
let styleTag = null;
let playerId = null;
let bestScore = 0;
let cells = [];

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function injectStyles() {
  if (document.getElementById('t48-styles')) {
    styleTag = document.getElementById('t48-styles');
    return;
  }
  styleTag = document.createElement('style');
  styleTag.id = 't48-styles';
  styleTag.textContent = `
    @keyframes t48-pulse {
      0%,100% { box-shadow: 0 0 15px rgba(255,255,255,0.5); }
      50%     { box-shadow: 0 0 30px rgba(255,255,255,0.9), 0 0 50px rgba(57,255,20,0.5); }
    }
    @keyframes t48-appear {
      from { transform: scale(0.4); opacity: 0.5; }
      to   { transform: scale(1);   opacity: 1; }
    }
    @keyframes t48-pop {
      0%   { transform: scale(1); }
      50%  { transform: scale(1.15); }
      100% { transform: scale(1); }
    }
    @keyframes t48-score-float {
      0%   { transform: translateY(0); opacity: 1; }
      100% { transform: translateY(-20px); opacity: 0; }
    }
    #t48-root {
      width: 100%; height: 100%;
      display: flex; flex-direction: column;
      background: var(--gc-bg, #050a05);
      font-family: var(--gc-mono, 'DM Mono', monospace);
      overflow: hidden;
    }
    #t48-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 12px; flex-shrink: 0;
      background: rgba(0,0,0,0.3);
    }
    #t48-back, #t48-new {
      background: rgba(255,255,255,0.08);
      border: 1px solid var(--gc-border, #1a2e1a);
      color: var(--gc-text, #a8ffa8);
      padding: 6px 12px; border-radius: 6px;
      font-family: inherit; font-size: 0.75rem;
      cursor: pointer;
    }
    #t48-back:hover, #t48-new:hover {
      background: rgba(255,255,255,0.12);
    }
    #t48-title {
      font-size: 1rem; font-weight: bold;
      color: var(--gc-text, #a8ffa8);
      letter-spacing: 2px;
    }
    #t48-hud {
      display: flex; justify-content: center; gap: 20px; padding: 12px;
      flex-shrink: 0;
    }
    .t48-score-box {
      background: rgba(0,0,0,0.4);
      border: 1px solid var(--gc-border, #1a2e1a);
      border-radius: 8px; padding: 8px 20px;
      text-align: center; min-width: 70px;
    }
    .t48-hud-label {
      font-size: 0.6rem; color: var(--gc-muted, rgba(168,255,168,0.4));
      letter-spacing: 1px; margin-bottom: 2px;
    }
    #t48-score, #t48-best {
      font-size: 1.1rem; font-weight: bold;
      color: var(--gc-green, #39ff14);
    }
    #t48-best.flash { animation: t48-pulse 0.4s ease; }
    #t48-board-wrap {
      flex: 1; display: flex; align-items: center; justify-content: center;
      position: relative; padding: 10px;
    }
    #t48-board {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      grid-template-rows: repeat(4, 1fr);
      gap: 8px;
      padding: 8px;
      background: #0f1a0f;
      border-radius: 8px;
      border: 2px solid var(--gc-border, #1a2e1a);
      width: min(85vw, 420px);
      height: min(85vw, 420px);
    }
    .t48-cell {
      background: rgba(255,255,255,0.03);
      border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
    }
    .t48-tile {
      width: 100%; height: 100%;
      display: flex; align-items: center; justify-content: center;
      border-radius: 6px;
      font-weight: bold;
      transition: background 0.1s ease;
    }
    .t48-tile-new { animation: t48-appear 0.15s ease-out; }
    .t48-tile-merged { animation: t48-pop 0.15s ease-out; }
    .t48-tile-2    { background: #0d2b0d; color: #a8ffa8; }
    .t48-tile-4    { background: #1a3d1a; color: #a8ffa8; }
    .t48-tile-8    { background: #1f5c1f; color: #39ff14; }
    .t48-tile-16   { background: #267326; color: #39ff14; }
    .t48-tile-32   { background: #2d8a2d; color: #050a05; }
    .t48-tile-64   { background: #39ff14; color: #050a05; }
    .t48-tile-128  { background: #5cff3a; color: #050a05; }
    .t48-tile-256  { background: #7fff50; color: #050a05; }
    .t48-tile-512  { background: #a3ff6b; color: #050a05; }
    .t48-tile-1024 { background: #c8ff8f; color: #050a05; }
    .t48-tile-2048 { 
      background: #ffffff; color: #050a05; 
      box-shadow: 0 0 20px rgba(255,255,255,0.6), 0 0 40px rgba(57,255,20,0.4);
      animation: t48-pulse 1s ease-in-out infinite;
    }
    .t48-tile-4096 { 
      background: #39ff14; color: #050a05;
      box-shadow: 0 0 25px rgba(57,255,20,0.7);
    }
    #t48-overlay {
      position: absolute; inset: 10px;
      background: rgba(5, 10, 5, 0.88);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      flex-direction: column;
      z-index: 10;
    }
    #t48-overlay-content {
      text-align: center;
    }
    .t48-overlay-title {
      font-size: 1.4rem; font-weight: bold; margin-bottom: 10px;
    }
    .t48-overlay-title.won { color: #ffd700; }
    .t48-overlay-title.over { color: #ff4444; }
    .t48-overlay-score { color: var(--gc-text, #a8ffa8); margin-bottom: 16px; font-size: 0.9rem; }
    .t48-overlay-btn {
      background: rgba(255,255,255,0.1);
      border: 1px solid var(--gc-border, #1a2e1a);
      color: var(--gc-text, #a8ffa8);
      padding: 10px 24px; border-radius: 6px;
      font-family: inherit; font-size: 0.85rem;
      cursor: pointer; margin: 0 6px;
    }
    .t48-overlay-btn:hover { background: rgba(255,255,255,0.15); }
    .t48-overlay-btn.primary {
      background: var(--gc-green, #39ff14);
      color: #050a05; border-color: var(--gc-green, #39ff14);
    }
    #t48-hint {
      text-align: center; padding: 12px;
      color: var(--gc-muted, rgba(168,255,168,0.3));
      font-size: 0.7rem; letter-spacing: 1px;
      flex-shrink: 0;
    }
    .t48-score-delta {
      position: absolute;
      color: var(--gc-green, #39ff14);
      font-weight: bold;
      animation: t48-score-float 0.6s ease-out forwards;
      pointer-events: none;
    }
    .t48-toast {
      position: absolute; top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.8);
      border: 1px solid var(--gc-green, #39ff14);
      color: var(--gc-green, #39ff14);
      padding: 10px 20px; border-radius: 6px;
      font-size: 0.85rem;
      z-index: 20;
      animation: t48-appear 0.2s ease-out;
    }
  `;
  document.head.appendChild(styleTag);
}

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playSound(type) {
  if (localStorage.getItem('gc_mute') === '1') return;
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    const vol = 0.1;
    
    if (type === 'move') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 220;
      osc.type = 'sine';
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.start(now); osc.stop(now + 0.04);
    } else if (type === 'merge') {
      [330, 440].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(vol, now + i * 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07 + i * 0.02);
        osc.start(now + i * 0.02); osc.stop(now + 0.09);
      });
    } else if (type === 'big') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'triangle';
      gain.gain.setValueAtTime(vol * 1.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.start(now); osc.stop(now + 0.12);
    } else if (type === 'win') {
      [523, 659, 784, 1047].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'triangle';
        gain.gain.setValueAtTime(0.15, now + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1 + i * 0.08);
        osc.start(now + i * 0.08); osc.stop(now + 0.18 + i * 0.08);
      });
    } else if (type === 'over') {
      [300, 250, 200, 150].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sawtooth';
        gain.gain.setValueAtTime(0.18, now + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1 + i * 0.08);
        osc.start(now + i * 0.08); osc.stop(now + 0.18 + i * 0.08);
      });
    }
  } catch (e) {}
}

function getTileFontSize(value) {
  if (value >= 1024) return 'clamp(12px, 3vw, 17px)';
  if (value >= 128) return 'clamp(15px, 4vw, 22px)';
  return 'clamp(18px, 5vw, 28px)';
}

function buildBoard() {
  const boardEl = document.getElementById('t48-board');
  if (!boardEl) return;
  
  cells = [];
  const frag = document.createDocumentFragment();
  
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const cell = document.createElement('div');
      cell.className = 't48-cell';
      cell.dataset.row = r;
      cell.dataset.col = c;
      cells.push(cell);
      frag.appendChild(cell);
    }
  }
  
  boardEl.appendChild(frag);
}

function updateBoard(prevBoard) {
  const board = state.board;
  if (!board) return;
  
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const idx = r * 4 + c;
      const cell = cells[idx];
      const val = board[r][c];
      const prevVal = prevBoard ? prevBoard[r][c] : 0;
      
      cell.innerHTML = '';
      
      if (val > 0) {
        const tile = document.createElement('div');
        tile.className = 't48-tile';
        
        if (val <= 4096) {
          tile.classList.add(`t48-tile-${val}`);
        } else {
          tile.classList.add('t48-tile-4096');
        }
        
        tile.textContent = val;
        tile.style.fontSize = getTileFontSize(val);
        
        // Animation classes
        if (prevVal === 0) {
          tile.classList.add('t48-tile-new');
        } else if (val !== prevVal && prevVal * 2 === val) {
          tile.classList.add('t48-tile-merged');
        }
        
        cell.appendChild(tile);
      }
    }
  }
}

function updateHUD(prevScore) {
  const scoreEl = document.getElementById('t48-score');
  const bestEl = document.getElementById('t48-best');
  
  if (scoreEl) scoreEl.textContent = state.score;
  if (bestEl) bestEl.textContent = state.best;
  
  // Score delta animation
  if (prevScore != null && state.score > prevScore) {
    const delta = state.score - prevScore;
    const box = document.querySelector('.t48-score-box');
    if (box) {
      const deltaEl = document.createElement('div');
      deltaEl.className = 't48-score-delta';
      deltaEl.textContent = `+${delta}`;
      deltaEl.style.left = '50%';
      deltaEl.style.top = '0';
      box.appendChild(deltaEl);
      setTimeout(() => deltaEl.remove(), 600);
    }
  }
  
  // Best flash
  if (bestEl && state.best > bestScore) {
    bestScore = state.best;
    bestEl.classList.add('flash');
    setTimeout(() => bestEl.classList.remove('flash'), 400);
  }
}

function showOverlay() {
  const overlay = document.getElementById('t48-overlay');
  const content = document.getElementById('t48-overlay-content');
  if (!overlay || !content) return;
  
  if (state.phase === 'won' && !state.continuing) {
    content.innerHTML = `
      <div class="t48-overlay-title won">🎉 YOU REACHED 2048!</div>
      <div class="t48-overlay-score">Score: ${state.score}</div>
      <button class="t48-overlay-btn primary" id="t48-btn-continue">KEEP GOING</button>
      <button class="t48-overlay-btn" id="t48-btn-new-won">NEW GAME</button>
    `;
    document.getElementById('t48-btn-continue').addEventListener('click', () => {
      state = continueGame(state);
      hideOverlay();
      updateBoard(null);
    });
    document.getElementById('t48-btn-new-won').addEventListener('click', startNewGame);
    playSound('win');
  } else if (state.phase === 'over') {
    content.innerHTML = `
      <div class="t48-overlay-title over">GAME OVER</div>
      <div class="t48-overlay-score">Score: ${state.score}<br>Best: ${state.best}</div>
      <button class="t48-overlay-btn primary" id="t48-btn-restart">NEW GAME</button>
    `;
    document.getElementById('t48-btn-restart').addEventListener('click', startNewGame);
    playSound('over');
    submitHistory();
  }
  
  overlay.style.display = 'flex';
}

function hideOverlay() {
  const overlay = document.getElementById('t48-overlay');
  if (overlay) overlay.style.display = 'none';
}

function saveGame() {
  if (!playerId) return;
  try {
    fetch(`/api/sp/saves/2048/autosave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ save_data: serializeState(state) }),
    }).catch(() => {});
  } catch (e) {}
}

function saveBestScore() {
  if (!playerId) return;
  try {
    fetch(`/api/sp/saves/2048/best`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ save_data: JSON.stringify({ best: state.best }) }),
    }).catch(() => {});
  } catch (e) {}
  
  // Also localStorage fallback
  const localBest = parseInt(localStorage.getItem('t48_best') || '0', 10);
  if (state.best > localBest) {
    localStorage.setItem('t48_best', String(state.best));
  }
}

function submitHistory() {
  if (!playerId) return;
  try {
    fetch(`/api/sp/history/2048`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        score: state.score, 
        result: state.phase === 'won' ? 'complete' : 'over',
        metadata: { reached2048: state.won2048 }
      }),
    }).catch(() => {});
  } catch (e) {}
}

function showToast(msg) {
  const wrap = document.getElementById('t48-board-wrap');
  if (!wrap) return;
  const toast = document.createElement('div');
  toast.className = 't48-toast';
  toast.textContent = msg;
  wrap.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

function startNewGame() {
  state = initGame(Math.random);
  bestScore = state.best;
  hideOverlay();
  updateBoard(null);
  updateHUD(null);
  saveGame();
}

function handleMove(direction) {
  if (state.phase !== 'playing') return;
  
  const prevBoard = state.board.map(r => [...r]);
  const prevScore = state.score;
  
  state = move(state, direction, Math.random);
  
  if (state.moved) {
    // Check for merges to play sound
    let hadMerge = false;
    let hadBig = false;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (prevBoard[r][c] > 0 && state.board[r][c] > prevBoard[r][c]) {
          hadMerge = true;
          if (state.board[r][c] >= 1024) hadBig = true;
        }
      }
    }
    
    if (hadMerge) {
      playSound(hadBig ? 'big' : 'merge');
    } else {
      playSound('move');
    }
    
    updateBoard(prevBoard);
    updateHUD(prevScore);
    saveGame();
    
    if (state.phase === 'won' || state.phase === 'over') {
      saveBestScore();
      showOverlay();
    }
  }
}

function handleKey(e) {
  const key = e.key.toLowerCase();
  
  if (key === 'arrowleft' || key === 'a') {
    handleMove('left');
  } else if (key === 'arrowright' || key === 'd') {
    handleMove('right');
  } else if (key === 'arrowup' || key === 'w') {
    handleMove('up');
  } else if (key === 'arrowdown' || key === 's') {
    handleMove('down');
  } else if (key === 'escape') {
    const btn = document.getElementById('t48-back');
    if (btn) btn.click();
  }
}

function handleTouchStart(e) {
  const touch = e.touches[0];
  touchHandlerStart = { x: touch.clientX, y: touch.clientY };
}

function handleTouchEnd(e) {
  if (!touchHandlerStart) return;
  
  const touch = e.changedTouches[0];
  const dx = touch.clientX - touchHandlerStart.x;
  const dy = touch.clientY - touchHandlerStart.y;
  
  if (Math.abs(dx) < 30 && Math.abs(dy) < 30) return;
  
  if (Math.abs(dx) > Math.abs(dy)) {
    handleMove(dx > 0 ? 'right' : 'left');
  } else {
    handleMove(dy > 0 ? 'down' : 'up');
  }
  
  touchHandlerStart = null;
}

export function render(container, options = {}) {
  containerEl = container;
  playerId = options.playerId || null;
  bestScore = options.bestScore || 0;
  
  container.innerHTML = `
    <div id="t48-root">
      <div id="t48-header">
        <button id="t48-back">← GAMES</button>
        <div id="t48-title">2048</div>
        <button id="t48-new">NEW GAME</button>
      </div>
      <div id="t48-hud">
        <div class="t48-score-box">
          <div class="t48-hud-label">SCORE</div>
          <div id="t48-score">0</div>
        </div>
        <div class="t48-score-box">
          <div class="t48-hud-label">BEST</div>
          <div id="t48-best">0</div>
        </div>
      </div>
      <div id="t48-board-wrap">
        <div id="t48-board"></div>
        <div id="t48-overlay" style="display:none">
          <div id="t48-overlay-content"></div>
        </div>
      </div>
      <div id="t48-hint">ARROW KEYS / WASD · SWIPE ON MOBILE</div>
    </div>`;
  
  injectStyles();
  buildBoard();
  
  // Restore or start new
  if (options.savedState) {
    state = deserializeState(options.savedState);
    if (!state || state.phase === 'over') {
      state = initGame(Math.random);
    } else {
      showToast('GAME RESTORED');
    }
  } else {
    state = initGame(Math.random);
  }
  
  bestScore = Math.max(bestScore, state.best);
  const localBest = parseInt(localStorage.getItem('t48_best') || '0', 10);
  bestScore = Math.max(bestScore, localBest);
  
  // Update best display immediately
  const bestEl = document.getElementById('t48-best');
  if (bestEl) bestEl.textContent = bestScore;
  state.best = bestScore;
  
  updateBoard(null);
  updateHUD(null);
  
  // Wire up events
  keyHandler = handleKey;
  document.addEventListener('keydown', keyHandler);
  
  const boardWrap = document.getElementById('t48-board-wrap');
  boardWrap.addEventListener('touchstart', handleTouchStart, { passive: true });
  boardWrap.addEventListener('touchend', handleTouchEnd, { passive: true });
  
  document.getElementById('t48-back').addEventListener('click', () => {
    const { navigate } = options;
    if (navigate) navigate('singleplayer');
  });
  
  document.getElementById('t48-new').addEventListener('click', startNewGame);
}

export function destroy() {
  if (keyHandler) {
    document.removeEventListener('keydown', keyHandler);
    keyHandler = null;
  }
  
  const boardWrap = document.getElementById('t48-board-wrap');
  if (boardWrap) {
    boardWrap.removeEventListener('touchstart', handleTouchStart);
    boardWrap.removeEventListener('touchend', handleTouchEnd);
  }
  
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
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
  cells = [];
}
