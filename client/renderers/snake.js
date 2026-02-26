// Snake renderer — dark phosphor-green terminal aesthetic
// Self-contained: includes all game logic inline

// ── Game logic (pure functions) ─────────────────────────────────────────────────

const DIFFICULTY_SETTINGS = {
  easy:   { width: 20, height: 20, startSpeed: 200, minSpeed: 100, speedStep: 5 },
  medium: { width: 25, height: 25, startSpeed: 150, minSpeed: 70, speedStep: 4 },
  hard:   { width: 30, height: 30, startSpeed: 100, minSpeed: 40, speedStep: 3 },
};

function getDifficultySettings(difficulty) {
  return DIFFICULTY_SETTINGS[difficulty] || DIFFICULTY_SETTINGS.easy;
}

function getSpeedStep(difficulty) {
  return getDifficultySettings(difficulty).speedStep;
}

function initGame(difficulty) {
  const cfg = getDifficultySettings(difficulty);
  const cx = Math.floor(cfg.width / 2);
  const cy = Math.floor(cfg.height / 2);
  
  return {
    width: cfg.width,
    height: cfg.height,
    snake: [
      { x: cx, y: cy },
      { x: cx - 1, y: cy },
      { x: cx - 2, y: cy },
    ],
    direction: 'right',
    nextDirection: 'right',
    food: null,
    phase: 'ready',
    score: 0,
    highScore: 0,
    tickCount: 0,
    speed: cfg.startSpeed,
    difficulty,
  };
}

function placeFood(state, rngFn) {
  const { width, height, snake } = state;
  const snakeSet = new Set(snake.map(p => `${p.x},${p.y}`));
  
  const candidates = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!snakeSet.has(`${x},${y}`)) {
        candidates.push({ x, y });
      }
    }
  }
  
  if (candidates.length === 0) return null;
  
  const idx = Math.floor(rngFn() * candidates.length);
  return candidates[idx];
}

function queueDirection(state, direction) {
  const opposites = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const currentDir = state.direction;
  const nextDir = state.nextDirection;
  
  if (direction === opposites[currentDir]) return state;
  if (direction === nextDir) return state;
  
  return { ...state, nextDirection: direction };
}

function tick(state, rngFn) {
  if (state.phase !== 'playing') return state;
  
  const cfg = getDifficultySettings(state.difficulty);
  const newDir = state.nextDirection;
  
  const head = state.snake[0];
  let newHead = { x: head.x, y: head.y };
  
  switch (newDir) {
    case 'up':    newHead.y -= 1; break;
    case 'down':  newHead.y += 1; break;
    case 'left':  newHead.x -= 1; break;
    case 'right': newHead.x += 1; break;
  }
  
  if (newHead.x < 0 || newHead.x >= state.width ||
      newHead.y < 0 || newHead.y >= state.height) {
    return { ...state, phase: 'dead', tickCount: state.tickCount + 1 };
  }
  
  const snakeSet = new Set(state.snake.map(p => `${p.x},${p.y}`));
  if (snakeSet.has(`${newHead.x},${newHead.y}`)) {
    return { ...state, phase: 'dead', tickCount: state.tickCount + 1 };
  }
  
  let newSnake = [newHead, ...state.snake];
  let newScore = state.score;
  let newSpeed = state.speed;
  let newFood = state.food;
  
  const isEating = newFood && newHead.x === newFood.x && newHead.y === newFood.y;
  
  if (isEating) {
    newScore += 1;
    const speedDrop = cfg.speedStep;
    newSpeed = Math.max(cfg.minSpeed, cfg.startSpeed - newScore * speedDrop);
    newFood = placeFood(state, rngFn);
  } else {
    newSnake.pop();
    if (!newFood) {
      newFood = placeFood(state, rngFn);
    }
  }
  
  return {
    ...state,
    snake: newSnake,
    direction: newDir,
    food: newFood,
    phase: 'playing',
    score: newScore,
    tickCount: state.tickCount + 1,
    speed: newSpeed,
  };
}

// ── Module-level state ─────────────────────────────────────────────────────────

let containerEl = null;
let state = null;
let loop = null;
let keyHandler = null;
let roRef = null;
let audioCtx = null;
let styleTag = null;
let currentDifficulty = 'easy';
let highScore = 0;
let playerId = null;
let optRef = null;
let cells = null;
let currentCellSize = 0;

// ── CSS injection ─────────────────────────────────────────────────────────────

function injectStyles() {
  if (document.getElementById('sk-styles')) return;
  const st = document.createElement('style');
  st.id = 'sk-styles';
  st.textContent = `
    #sk-root {
      --sk-bg: #050a05;
      --sk-surface: #091209;
      --sk-green: #39ff14;
      --sk-green-dim: rgba(57,255,20,0.18);
      --sk-green-mid: rgba(57,255,20,0.45);
      --sk-green-head: #39ff14;
      --sk-green-body: #1a8f00;
      --sk-green-tail: #0f5500;
      --sk-food: #ff2222;
      --sk-border: rgba(57,255,20,0.12);
      --sk-font: 'DM Mono','Courier New',monospace;
      --sk-cell: 20px;
      background: var(--sk-bg);
      color: var(--sk-green);
      font-family: var(--sk-font);
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
      user-select: none;
      -webkit-user-select: none;
    }
    #sk-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 14px;
      border-bottom: 1px solid var(--sk-border);
      flex-shrink: 0;
    }
    #sk-back {
      background: none;
      border: 1px solid var(--sk-border);
      color: var(--sk-green);
      font-family: var(--sk-font);
      font-size: 0.72rem;
      padding: 4px 10px;
      cursor: pointer;
      letter-spacing: 0.05em;
      border-radius: 2px;
      transition: border-color 0.15s, color 0.15s;
    }
    #sk-back:hover { border-color: var(--sk-green); color: #fff; }
    #sk-title {
      font-size: 0.78rem;
      letter-spacing: 0.15em;
      color: var(--sk-green);
      opacity: 0.85;
      text-transform: uppercase;
    }
    #sk-mute {
      background: none;
      border: none;
      color: var(--sk-green);
      font-family: var(--sk-font);
      font-size: 0.8rem;
      cursor: pointer;
      opacity: 0.6;
      padding: 4px 8px;
      margin-left: auto;
    }
    #sk-mute:hover { opacity: 1; }

    #sk-difficulty-bar {
      display: flex;
      gap: 6px;
      padding: 8px 14px;
      border-bottom: 1px solid var(--sk-border);
      flex-shrink: 0;
    }
    .sk-diff {
      background: none;
      border: 1px solid var(--sk-border);
      color: var(--sk-green);
      font-family: var(--sk-font);
      font-size: 0.65rem;
      padding: 4px 10px;
      cursor: pointer;
      letter-spacing: 0.08em;
      border-radius: 2px;
      transition: all 0.12s;
      text-transform: uppercase;
    }
    .sk-diff:hover { border-color: var(--sk-green); }
    .sk-diff.active {
      background: var(--sk-green-dim);
      border-color: var(--sk-green);
      font-weight: 700;
    }

    #sk-hud {
      display: flex;
      justify-content: center;
      gap: 24px;
      padding: 10px 14px;
      border-bottom: 1px solid var(--sk-border);
      flex-shrink: 0;
    }
    #sk-score-box, #sk-highscore-box, #sk-speed-box {
      text-align: center;
    }
    .sk-hud-label {
      font-size: 0.55rem;
      letter-spacing: 0.1em;
      opacity: 0.5;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    #sk-score, #sk-highscore, #sk-speed {
      font-size: 1.1rem;
      font-weight: 700;
      letter-spacing: 0.05em;
    }
    #sk-highscore { opacity: 0.7; }

    #sk-board-wrap {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      position: relative;
      padding: 16px;
    }
    #sk-board {
      display: grid;
      gap: 1px;
      background: var(--sk-border);
      border: 2px solid var(--sk-border);
      box-shadow: 0 0 30px rgba(57,255,20,0.08);
    }
    .sk-cell {
      width: var(--sk-cell);
      height: var(--sk-cell);
      background: var(--sk-bg);
      transition: background 0.05s;
    }
    .sk-cell.snake-head {
      background: var(--sk-green-head);
      box-shadow: 0 0 8px rgba(57,255,20,0.8);
    }
    .sk-cell.snake-body {
      background: var(--sk-green-body);
    }
    .sk-cell.snake-tail {
      background: var(--sk-green-tail);
    }
    .sk-cell.food {
      background: var(--sk-food);
      box-shadow: 0 0 10px rgba(255,34,34,0.6);
      animation: sk-food-pulse 0.8s ease-in-out infinite;
    }
    @keyframes sk-food-pulse {
      0%,100% { box-shadow: 0 0 6px rgba(255,34,34,0.4); }
      50%     { box-shadow: 0 0 16px rgba(255,34,34,0.9); }
    }

    #sk-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 14px;
      background: rgba(5,10,5,0.88);
      z-index: 10;
    }
    #sk-overlay-title {
      font-size: 1.8rem;
      font-weight: 900;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    #sk-overlay-score {
      font-size: 1rem;
      opacity: 0.8;
    }
    #sk-overlay-best {
      font-size: 0.85rem;
    }
    #sk-overlay-btn {
      background: none;
      border: 1px solid var(--sk-green);
      color: var(--sk-green);
      font-family: var(--sk-font);
      font-size: 0.8rem;
      padding: 8px 24px;
      cursor: pointer;
      letter-spacing: 0.1em;
      border-radius: 2px;
      margin-top: 8px;
    }
    #sk-overlay-btn:hover { background: var(--sk-green-dim); }
    #sk-overlay-change {
      background: none;
      border: none;
      color: var(--sk-green);
      font-family: var(--sk-font);
      font-size: 0.7rem;
      cursor: pointer;
      opacity: 0.6;
      letter-spacing: 0.05em;
    }
    #sk-overlay-change:hover { opacity: 1; }

    #sk-controls-hint {
      font-size: 0.6rem;
      letter-spacing: 0.08em;
      text-align: center;
      padding: 8px;
      opacity: 0.35;
      border-top: 1px solid var(--sk-border);
      flex-shrink: 0;
    }

    @keyframes sk-flash {
      0%, 100% { color: var(--sk-green); text-shadow: none; }
      50% { color: #fff; text-shadow: 0 0 20px rgba(57,255,20,0.9); }
    }
    .sk-high-flash {
      animation: sk-flash 0.4s ease 3;
    }
  `;
  document.head.appendChild(st);
  styleTag = st;
}

// ── Audio ─────────────────────────────────────────────────────────────────────

function initAudio() {
  if (audioCtx) return;
  if (localStorage.getItem('gc_mute') === '1') return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) { audioCtx = null; }
}

function playTone(freqs, duration, type, vol) {
  if (!audioCtx || localStorage.getItem('gc_mute') === '1') return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const now = audioCtx.currentTime;
  freqs.forEach((f, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = f;
    gain.gain.setValueAtTime(vol, now + i * duration);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (i + 1) * duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now + i * duration);
    osc.stop(now + (i + 1) * duration);
  });
}

function playEat() { playTone([400, 500], 0.06, 'sine', 0.12); }
function playDeath() { playTone([300, 200, 100], 0.1, 'sawtooth', 0.2); }
function playStart() { playTone([200, 300], 0.08, 'square', 0.1); }
function playHS() { playTone([523, 659, 784, 1047], 0.08, 'triangle', 0.15); }

// ── Rendering ───────────────────────────────────────────────────────────────

function computeCellSize() {
  const wrap = containerEl.querySelector('#sk-board-wrap');
  if (!wrap) return 20;
  const availW = wrap.clientWidth - 32;
  const availH = wrap.clientHeight - 32;
  const cfg = getDifficultySettings(currentDifficulty);
  const byW = Math.floor(availW / cfg.width);
  const byH = Math.floor(availH / cfg.height);
  return Math.max(8, Math.min(byW, byH, 28));
}

function buildBoard() {
  const boardEl = containerEl.querySelector('#sk-board');
  const cfg = getDifficultySettings(currentDifficulty);
  const cellSize = computeCellSize();
  currentCellSize = cellSize;
  
  boardEl.style.gridTemplateColumns = `repeat(${cfg.width}, ${cellSize}px)`;
  boardEl.style.gridTemplateRows = `repeat(${cfg.height}, ${cellSize}px)`;
  
  boardEl.innerHTML = '';
  cells = [];
  
  const frag = document.createDocumentFragment();
  for (let y = 0; y < cfg.height; y++) {
    for (let x = 0; x < cfg.width; x++) {
      const el = document.createElement('div');
      el.className = 'sk-cell';
      el.dataset.x = x;
      el.dataset.y = y;
      frag.appendChild(el);
      cells[y * cfg.width + x] = el;
    }
  }
  boardEl.appendChild(frag);
}

function updateCells(oldState, newState) {
  if (!cells) return;
  const cfg = getDifficultySettings(currentDifficulty);
  const w = cfg.width;
  const h = cfg.height;
  
  const oldSnakeSet = new Set((oldState?.snake || []).map(p => `${p.x},${p.y}`));
  const newSnakeSet = new Set(newState.snake.map(p => `${p.x},${p.y}`));
  const oldFood = oldState?.food;
  const newFood = newState.food;
  
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const el = cells[idx];
      const key = `${x},${y}`;
      
      let newClass = 'sk-cell';
      
      if (newFood && x === newFood.x && y === newFood.y) {
        newClass += ' food';
      } else if (newSnakeSet.has(key)) {
        const snakeIdx = newState.snake.findIndex(p => p.x === x && p.y === y);
        if (snakeIdx === 0) newClass += ' snake-head';
        else if (snakeIdx === newState.snake.length - 1) newClass += ' snake-tail';
        else newClass += ' snake-body';
      }
      
      el.className = newClass;
    }
  }
}

function updateHUD() {
  if (!state) return;
  const cfg = getDifficultySettings(currentDifficulty);
  const speedLevel = Math.floor((cfg.startSpeed - state.speed) / cfg.speedStep) + 1;
  
  containerEl.querySelector('#sk-score').textContent = String(state.score).padStart(3, '0');
  containerEl.querySelector('#sk-highscore').textContent = String(state.highScore).padStart(3, '0');
  containerEl.querySelector('#sk-speed').textContent = Math.min(10, speedLevel);
}

// ── Game loop ───────────────────────────────────────────────────────────────

function startLoop() {
  stopLoop();
  loop = setInterval(gameTick, state.speed);
}

function stopLoop() {
  if (loop) {
    clearInterval(loop);
    loop = null;
  }
}

function gameTick() {
  const oldState = JSON.parse(JSON.stringify(state));
  state = tick(state, Math.random);
  updateCells(oldState, state);
  updateHUD();
  
  if (state.phase === 'dead') {
    stopLoop();
    onDead();
  } else if (state.phase === 'playing' && oldState.speed !== state.speed) {
    startLoop();
  }
}

function onDead() {
  initAudio();
  playDeath();
  
  const isNewHS = state.score > highScore;
  if (isNewHS) {
    highScore = state.score;
    saveHighScore();
    playHS();
  }
  
  const title = containerEl.querySelector('#sk-overlay-title');
  title.textContent = 'GAME OVER';
  title.style.color = '#ff2240';
  
  containerEl.querySelector('#sk-overlay-score').textContent = `Score: ${state.score}`;
  
  const bestEl = containerEl.querySelector('#sk-overlay-best');
  bestEl.textContent = `Best: ${highScore}`;
  if (isNewHS) {
    bestEl.classList.add('sk-high-flash');
    setTimeout(() => bestEl.classList.remove('sk-high-flash'), 1200);
  }
  
  containerEl.querySelector('#sk-overlay-btn').textContent = 'PRESS SPACE TO RESTART';
  containerEl.querySelector('#sk-overlay-change').style.display = 'inline';
  
  containerEl.querySelector('#sk-overlay').style.display = 'flex';
}

function showReadyOverlay() {
  const cfg = getDifficultySettings(currentDifficulty);
  containerEl.querySelector('#sk-overlay-title').textContent = 'PRESS SPACE TO START';
  containerEl.querySelector('#sk-overlay-title').style.color = 'var(--sk-green)';
  containerEl.querySelector('#sk-overlay-score').textContent = currentDifficulty.toUpperCase();
  containerEl.querySelector('#sk-overlay-best').textContent = '';
  containerEl.querySelector('#sk-overlay-btn').textContent = '';
  containerEl.querySelector('#sk-overlay-change').style.display = 'inline';
  containerEl.querySelector('#sk-overlay').style.display = 'flex';
}

function hideOverlay() {
  containerEl.querySelector('#sk-overlay').style.display = 'none';
}

// ── Input ───────────────────────────────────────────────────────────────────

function handleKey(e) {
  const key = e.key.toLowerCase();
  
  if (key === 'escape') {
    if (optRef?.navigate) optRef.navigate('singleplayer');
    return;
  }
  
  if (key === ' ' || e.code === 'Space') {
    e.preventDefault();
    if (state.phase === 'ready') {
      startGame();
    } else if (state.phase === 'dead') {
      restartGame();
    }
    return;
  }
  
  if (state.phase !== 'playing') return;
  
  let dir = null;
  if (key === 'arrowup' || key === 'w') dir = 'up';
  else if (key === 'arrowdown' || key === 's') dir = 'down';
  else if (key === 'arrowleft' || key === 'a') dir = 'left';
  else if (key === 'arrowright' || key === 'd') dir = 'right';
  
  if (dir) {
    e.preventDefault();
    state = queueDirection(state, dir);
  }
}

function startGame() {
  initAudio();
  playStart();
  state.phase = 'playing';
  hideOverlay();
  startLoop();
}

function restartGame() {
  state = initGame(currentDifficulty);
  state.highScore = highScore;
  buildBoard();
  updateHUD();
  showReadyOverlay();
}

// ── Persistence ─────────────────────────────────────────────────────────────

function saveHighScore() {
  if (playerId) {
    fetch('/api/sp/saves/snake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot: 'highscore', data: { highScore } }),
    }).catch(() => {});
  }
  localStorage.setItem('snake_hs', String(highScore));
}

function loadHighScore() {
  const stored = localStorage.getItem('snake_hs');
  return stored ? parseInt(stored, 10) : 0;
}

// ── Resize handling ─────────────────────────────────────────────────────────

function setupResizeObserver() {
  const wrap = containerEl.querySelector('#sk-board-wrap');
  if (!wrap) return;
  
  roRef = new ResizeObserver(() => {
    const newSize = computeCellSize();
    if (Math.abs(newSize - currentCellSize) > 2) {
      buildBoard();
      updateCells(null, state);
    }
  });
  roRef.observe(wrap);
}

// ── API ─────────────────────────────────────────────────────────────────────

export function render(container, options) {
  optRef = options || {};
  containerEl = container;
  playerId = options?.playerId || null;
  
  highScore = loadHighScore();
  
  injectStyles();
  
  container.innerHTML = `
    <div id="sk-root">
      <div id="sk-header">
        <button id="sk-back">← SOLO</button>
        <div id="sk-title">🐍 SNAKE</div>
        <button id="sk-mute">🔊</button>
      </div>
      <div id="sk-difficulty-bar">
        <button class="sk-diff active" data-diff="easy">EASY</button>
        <button class="sk-diff" data-diff="medium">MEDIUM</button>
        <button class="sk-diff" data-diff="hard">HARD</button>
      </div>
      <div id="sk-hud">
        <div id="sk-score-box">
          <div class="sk-hud-label">SCORE</div>
          <div id="sk-score">000</div>
        </div>
        <div id="sk-highscore-box">
          <div class="sk-hud-label">BEST</div>
          <div id="sk-highscore">000</div>
        </div>
        <div id="sk-speed-box">
          <div class="sk-hud-label">SPEED</div>
          <div id="sk-speed">1</div>
        </div>
      </div>
      <div id="sk-board-wrap">
        <div id="sk-board"></div>
        <div id="sk-overlay">
          <div id="sk-overlay-title">PRESS SPACE TO START</div>
          <div id="sk-overlay-score"></div>
          <div id="sk-overlay-best"></div>
          <button id="sk-overlay-btn"></button>
          <button id="sk-overlay-change">[ CHANGE DIFFICULTY ]</button>
        </div>
      </div>
      <div id="sk-controls-hint">WASD / ARROW KEYS · SPACE TO START</div>
    </div>`;
  
  // Wire events
  container.querySelector('#sk-back').addEventListener('click', () => {
    if (optRef?.navigate) optRef.navigate('singleplayer');
  });
  
  container.querySelector('#sk-mute').addEventListener('click', () => {
    const muted = localStorage.getItem('gc_mute') === '1';
    localStorage.setItem('gc_mute', muted ? '0' : '1');
    container.querySelector('#sk-mute').textContent = muted ? '🔊' : '🔇';
  });
  
  container.querySelector('#sk-difficulty-bar').addEventListener('click', e => {
    const btn = e.target.closest('.sk-diff');
    if (!btn) return;
    const diff = btn.dataset.diff;
    container.querySelectorAll('.sk-diff').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentDifficulty = diff;
    restartGame();
  });
  
  container.querySelector('#sk-overlay-btn').addEventListener('click', () => {
    if (state.phase === 'ready') startGame();
    else if (state.phase === 'dead') restartGame();
  });
  
  container.querySelector('#sk-overlay-change').addEventListener('click', () => {
    if (state.phase === 'dead') {
      container.querySelector('#sk-difficulty-bar').querySelectorAll('.sk-diff').forEach(b => {
        b.classList.toggle('active', b.dataset.diff === currentDifficulty);
      });
    }
    container.querySelector('#sk-overlay-change').style.display = 'none';
    container.querySelector('#sk-overlay').style.display = 'none';
    state = initGame(currentDifficulty);
    state.highScore = highScore;
    buildBoard();
    updateHUD();
  });
  
  // Init game
  state = initGame(currentDifficulty);
  state.highScore = highScore;
  buildBoard();
  updateHUD();
  showReadyOverlay();
  setupResizeObserver();
  
  // Global key handler
  keyHandler = handleKey;
  document.addEventListener('keydown', keyHandler);
  
  // Load API high score if logged in
  if (playerId) {
    fetch('/api/sp/saves/snake')
      .then(r => r.ok ? r.json() : [])
      .then(saves => {
        const hsSave = saves.find(s => s.slot === 'highscore');
        if (hsSave?.data?.highScore && hsSave.data.highScore > highScore) {
          highScore = hsSave.data.highScore;
          localStorage.setItem('snake_hs', String(highScore));
          state.highScore = highScore;
          updateHUD();
        }
      })
      .catch(() => {});
  }
}

export function destroy() {
  stopLoop();
  if (keyHandler) {
    document.removeEventListener('keydown', keyHandler);
    keyHandler = null;
  }
  if (roRef) {
    roRef.disconnect();
    roRef = null;
  }
  if (audioCtx) {
    audioCtx.close();
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
  cells = null;
  optRef = null;
}
