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
      --sk-bg: #0d1117;
      --sk-surface: #161b22;
      --sk-accent: #58a6ff;
      --sk-green: #3fb950;
      --sk-green-head: #56d364;
      --sk-green-body: #238636;
      --sk-green-tail: #196c2e;
      --sk-food: #f85149;
      --sk-border: #30363d;
      --sk-font: 'DM Mono','Courier New',monospace;
      --sk-cell: 20px;
      background: var(--sk-bg);
      color: #c9d1d9;
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
      padding: 10px 16px;
      background: var(--sk-surface);
      border-bottom: 1px solid var(--sk-border);
      flex-shrink: 0;
    }
    #sk-back {
      background: transparent;
      border: 1px solid var(--sk-border);
      color: #8b949e;
      font-family: var(--sk-font);
      font-size: 0.72rem;
      padding: 6px 12px;
      cursor: pointer;
      letter-spacing: 0.05em;
      border-radius: 6px;
      transition: all 0.15s;
    }
    #sk-back:hover { border-color: var(--sk-accent); color: var(--sk-accent); }
    #sk-title {
      font-size: 0.82rem;
      font-weight: 600;
      letter-spacing: 0.12em;
      color: var(--sk-green);
      text-transform: uppercase;
    }
    #sk-mute {
      background: transparent;
      border: none;
      color: #8b949e;
      font-family: var(--sk-font);
      font-size: 0.85rem;
      cursor: pointer;
      padding: 6px 10px;
      margin-left: auto;
      border-radius: 6px;
      transition: all 0.15s;
    }
    #sk-mute:hover { background: var(--sk-border); }

    #sk-difficulty-bar {
      display: flex;
      gap: 8px;
      padding: 10px 16px;
      background: var(--sk-surface);
      border-bottom: 1px solid var(--sk-border);
      flex-shrink: 0;
    }
    .sk-diff {
      background: var(--sk-bg);
      border: 1px solid var(--sk-border);
      color: #8b949e;
      font-family: var(--sk-font);
      font-size: 0.68rem;
      font-weight: 600;
      padding: 6px 14px;
      cursor: pointer;
      letter-spacing: 0.06em;
      border-radius: 20px;
      transition: all 0.15s, transform 0.1s;
      text-transform: uppercase;
    }
    .sk-diff:hover { border-color: #6e7681; color: #c9d1d9; }
    .sk-diff.active {
      background: var(--sk-green);
      border-color: var(--sk-green);
      color: #0d1117;
    }
    .sk-diff:active { transform: scale(0.95); }

    #sk-hud {
      display: flex;
      justify-content: center;
      gap: 16px;
      padding: 12px 16px;
      background: var(--sk-surface);
      border-bottom: 1px solid var(--sk-border);
      flex-shrink: 0;
    }
    .sk-hud-card {
      background: var(--sk-bg);
      border: 1px solid var(--sk-border);
      border-radius: 8px;
      padding: 8px 16px;
      text-align: center;
      min-width: 70px;
    }
    .sk-hud-label {
      font-size: 0.55rem;
      font-weight: 600;
      letter-spacing: 0.1em;
      color: #484f58;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    #sk-score, #sk-highscore, #sk-speed {
      font-size: 1.15rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: #c9d1d9;
    }
    #sk-highscore { color: #d29922; }
    #sk-speed { color: var(--sk-accent); }

    #sk-board-wrap {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      position: relative;
      padding: 20px;
      background: 
        radial-gradient(ellipse at center, rgba(35,134,54,0.05) 0%, transparent 70%),
        var(--sk-bg);
    }
    #sk-board {
      display: grid;
      gap: 0;
      background: #0d1117;
      border: 3px solid var(--sk-border);
      border-radius: 12px;
      box-shadow: 
        0 8px 32px rgba(0,0,0,0.5),
        inset 0 0 60px rgba(0,0,0,0.3),
        inset 0 0 0 1px rgba(255,255,255,0.03);
      overflow: hidden;
    }
    .sk-cell {
      width: var(--sk-cell);
      height: var(--sk-cell);
      background: #161b22;
      transition: background 0.06s;
      position: relative;
    }
    .sk-cell.snake-head {
      background: var(--sk-green-head);
      box-shadow: 
        0 0 12px rgba(86,211,100,0.6),
        inset 0 -2px 4px rgba(0,0,0,0.2);
    }
    .sk-cell.snake-head::before,
    .sk-cell.snake-head::after {
      content: '';
      position: absolute;
      width: 4px;
      height: 4px;
      background: #0d1117;
      border-radius: 50%;
      top: 35%;
    }
    .sk-cell.snake-head::before { left: 25%; }
    .sk-cell.snake-head::after { right: 25%; }
    .sk-cell.snake-body {
      background: linear-gradient(180deg, var(--sk-green-head) 0%, var(--sk-green-body) 100%);
    }
    .sk-cell.snake-tail {
      background: var(--sk-green-tail);
    }
    .sk-cell.food {
      background: radial-gradient(circle at 30% 30%, #ff6b6b, var(--sk-food));
      border-radius: 50%;
      box-shadow: 
        0 0 16px rgba(248,81,73,0.7),
        inset 0 -2px 4px rgba(0,0,0,0.3);
      animation: sk-food-pulse 0.9s ease-in-out infinite;
    }
    @keyframes sk-food-pulse {
      0%, 100% { 
        box-shadow: 0 0 12px rgba(248,81,73,0.5);
        transform: scale(1);
      }
      50% { 
        box-shadow: 0 0 24px rgba(248,81,73,0.9);
        transform: scale(1.1);
      }
    }

    #sk-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      background: rgba(13,17,23,0.82);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      z-index: 10;
      border-radius: 12px;
    }
    #sk-overlay-title {
      font-size: 2rem;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--sk-green);
      text-shadow: 0 0 40px rgba(63,185,80,0.5);
    }
    #sk-overlay-title.dead {
      color: var(--sk-food);
      text-shadow: 0 0 40px rgba(248,81,73,0.5);
    }
    #sk-overlay-score {
      font-size: 1.1rem;
      color: #c9d1d9;
      font-weight: 600;
    }
    #sk-overlay-best {
      font-size: 0.9rem;
      color: #d29922;
      font-weight: 600;
    }
    #sk-overlay-btn {
      background: var(--sk-green);
      border: none;
      color: #0d1117;
      font-family: var(--sk-font);
      font-size: 0.78rem;
      font-weight: 700;
      padding: 10px 28px;
      cursor: pointer;
      letter-spacing: 0.08em;
      border-radius: 8px;
      margin-top: 12px;
      transition: all 0.15s, transform 0.1s;
    }
    #sk-overlay-btn:hover { 
      background: #56d364; 
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(63,185,80,0.4);
    }
    #sk-overlay-btn:active { transform: scale(0.96); }
    #sk-overlay-change {
      background: transparent;
      border: none;
      color: #6e7681;
      font-family: var(--sk-font);
      font-size: 0.72rem;
      cursor: pointer;
      letter-spacing: 0.05em;
      transition: color 0.15s;
    }
    #sk-overlay-change:hover { color: var(--sk-accent); }

    #sk-controls-hint {
      font-size: 0.62rem;
      letter-spacing: 0.1em;
      text-align: center;
      padding: 10px;
      color: #484f58;
      background: var(--sk-surface);
      border-top: 1px solid var(--sk-border);
      flex-shrink: 0;
    }

    /* High score flash */
    @keyframes sk-hs-flash {
      0%, 100% { 
        color: #d29922; 
        text-shadow: none;
        transform: scale(1);
      }
      50% { 
        color: #fff; 
        text-shadow: 0 0 20px rgba(210,153,34,0.8);
        transform: scale(1.1);
      }
    }
    .sk-hs-anim {
      animation: sk-hs-flash 0.35s ease 3;
    }

    /* New high score confetti burst */
    .sk-confetti {
      position: absolute;
      width: 8px;
      height: 8px;
      border-radius: 2px;
      animation: sk-confetti-fall 1s ease-out forwards;
      pointer-events: none;
    }
    @keyframes sk-confetti-fall {
      0% {
        opacity: 1;
        transform: translateY(0) rotate(0deg) scale(1);
      }
      100% {
        opacity: 0;
        transform: translateY(80px) rotate(720deg) scale(0.3);
      }
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

  // Live high score tracking - save immediately when surpassed
  if (state.score > highScore) {
    highScore = state.score;
    state.highScore = highScore;
    saveHighScore();
  }

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
    playHS();
    spawnConfetti();
  }
  
  const title = containerEl.querySelector('#sk-overlay-title');
  title.textContent = 'GAME OVER';
  title.classList.add('dead');
  
  containerEl.querySelector('#sk-overlay-score').textContent = `Score: ${state.score}`;
  
  const bestEl = containerEl.querySelector('#sk-overlay-best');
  bestEl.textContent = `Best: ${highScore}`;
  if (isNewHS) {
    bestEl.classList.add('sk-hs-anim');
    setTimeout(() => bestEl.classList.remove('sk-hs-anim'), 1050);
  }
  
  containerEl.querySelector('#sk-overlay-btn').textContent = 'PRESS SPACE TO RESTART';
  containerEl.querySelector('#sk-overlay-change').style.display = 'inline';
  
  containerEl.querySelector('#sk-overlay').style.display = 'flex';
}

function spawnConfetti() {
  const overlay = containerEl.querySelector('#sk-overlay');
  if (!overlay) return;
  const colors = ['#f85149', '#d29922', '#3fb950', '#58a6ff', '#a371f7'];
  for (let i = 0; i < 20; i++) {
    const conf = document.createElement('div');
    conf.className = 'sk-confetti';
    conf.style.background = colors[Math.floor(Math.random() * colors.length)];
    conf.style.left = (30 + Math.random() * 40) + '%';
    conf.style.top = (20 + Math.random() * 30) + '%';
    conf.style.animationDelay = (Math.random() * 0.3) + 's';
    overlay.appendChild(conf);
    setTimeout(() => conf.remove(), 1200);
  }
}

function showReadyOverlay() {
  const cfg = getDifficultySettings(currentDifficulty);
  const title = containerEl.querySelector('#sk-overlay-title');
  title.textContent = 'PRESS SPACE TO START';
  title.classList.remove('dead');
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
        <div class="sk-hud-card">
          <div class="sk-hud-label">SCORE</div>
          <div id="sk-score">000</div>
        </div>
        <div class="sk-hud-card">
          <div class="sk-hud-label">BEST</div>
          <div id="sk-highscore">000</div>
        </div>
        <div class="sk-hud-card">
          <div class="sk-hud-label">LEVEL</div>
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
