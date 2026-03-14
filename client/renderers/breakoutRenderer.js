import * as breakout from '../../games/breakout/index.js';

let containerEl = null;
let canvasEl = null;
let ctx = null;
let state = null;
let animationId = null;
let playerId = null;
let navigateFn = null;
let difficulty = 'medium';
let highScore = 0;
let keysPressed = {};
let particles = [];
let ballTrail = [];
let soundEnabled = false;
let screenShake = 0;

function playSound(type) {
  if (!soundEnabled) return;
  console.log(`[breakout sound] ${type}`);
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  return soundEnabled;
}

function injectStyles() {
  if (document.getElementById('breakout-styles')) return;
  const s = document.createElement('style');
  s.id = 'breakout-styles';
  s.textContent = `
    #breakout-root {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      background: #050a05;
      font-family: 'DM Mono', monospace;
    }
    #breakout-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: linear-gradient(180deg, rgba(57,255,20,0.08) 0%, transparent 100%);
      border-bottom: 1px solid #1a2e1a;
      flex-shrink: 0;
    }
    #breakout-back {
      background: transparent;
      border: 1px solid #39ff14;
      color: #39ff14;
      padding: 6px 12px;
      font-family: inherit;
      font-size: 12px;
      cursor: pointer;
      border-radius: 4px;
    }
    #breakout-back:hover { background: rgba(57,255,20,0.1); }
    #breakout-title {
      color: #39ff14;
      font-size: 14px;
      letter-spacing: 2px;
    }
    #breakout-mute {
      background: transparent;
      border: none;
      color: #39ff14;
      font-size: 16px;
      cursor: pointer;
      padding: 4px 8px;
    }
    #breakout-stats {
      display: flex;
      gap: 20px;
      justify-content: center;
      padding: 8px;
      background: #0a0f0a;
      border-bottom: 1px solid #1a2e1a;
      color: #a8ffa8;
      font-size: 11px;
      flex-shrink: 0;
    }
    #breakout-stats span { color: #39ff14; }
    #breakout-canvas-wrap {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: hidden;
    }
    #breakout-canvas {
      background: #000;
      border: 2px solid #1a2e1a;
      max-width: 100%;
      max-height: 100%;
    }
    #breakout-overlay {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: rgba(5,10,5,0.9);
      color: #39ff14;
      gap: 16px;
    }
    #breakout-overlay.hidden { display: none; }
    #breakout-overlay h2 {
      font-size: 28px;
      margin: 0;
      text-shadow: 0 0 20px #39ff14;
    }
    #breakout-overlay p {
      color: #a8ffa8;
      margin: 0;
      font-size: 14px;
    }
    #breakout-start-btn, #breakout-replay-btn, #breakout-retry-btn {
      background: #39ff14;
      border: none;
      color: #050a05;
      padding: 12px 32px;
      font-family: inherit;
      font-size: 14px;
      font-weight: bold;
      cursor: pointer;
      border-radius: 4px;
      margin-top: 8px;
    }
    #breakout-start-btn:hover, #breakout-replay-btn:hover, #breakout-retry-btn:hover {
      background: #50ff30;
    }
    #breakout-difficulty {
      background: #0a0f0a;
      border: 1px solid #39ff14;
      color: #39ff14;
      padding: 8px 16px;
      font-family: inherit;
      font-size: 12px;
      cursor: pointer;
      border-radius: 4px;
      margin-top: 8px;
    }
    #breakout-difficulty:hover { background: rgba(57,255,20,0.1); }
    #breakout-controls-hint {
      position: absolute;
      bottom: 10px;
      left: 50%;
      transform: translateX(-50%);
      color: rgba(168,255,168,0.4);
      font-size: 10px;
    }
  `;
  document.head.appendChild(s);
}

function saveProgress() {
  if (playerId) {
    fetch('/api/sp/saves/breakout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot: 'stats', data: { highScore } }),
    }).catch(() => {});
  }
  localStorage.setItem('breakout_hs', String(highScore));
}

function loadProgress() {
  const stored = localStorage.getItem('breakout_hs');
  highScore = stored ? parseInt(stored, 10) : 0;
  
  if (playerId) {
    fetch('/api/sp/saves/breakout').then(r => r.ok ? r.json() : []).then(saves => {
      const stats = saves.find(s => s.slot === 'stats');
      if (stats?.data?.highScore) {
        highScore = Math.max(highScore, stats.data.highScore);
        const bestEl = document.getElementById('breakout-best');
        if (bestEl) bestEl.textContent = highScore;
      }
    }).catch(() => {});
  }
}

function spawnParticles(x, y, color, count = 8) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8,
      life: 1,
      color,
      size: Math.random() * 4 + 2,
    });
  }
}

function updateParticles() {
  particles = particles.filter(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.2;
    p.life -= 0.03;
    return p.life > 0;
  });
}

function drawFrame() {
  if (!ctx || !state) return;
  
  const w = canvasEl.width;
  const h = canvasEl.height;
  
  // Update particles
  updateParticles();
  
  // Apply screen shake
  ctx.save();
  if (screenShake > 0) {
    const shakeX = (Math.random() - 0.5) * screenShake;
    const shakeY = (Math.random() - 0.5) * screenShake;
    ctx.translate(shakeX, shakeY);
    screenShake *= 0.9;
    if (screenShake < 0.5) screenShake = 0;
  }
  
  // Clear
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  
  // Draw particles
  for (const p of particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  
  // Draw bricks
  for (const brick of state.bricks) {
    if (!brick.alive) continue;
    
    ctx.fillStyle = brick.color;
    ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
    
    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(brick.x, brick.y, brick.width, 3);
    
    // Durability indicator
    if (brick.durability > 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.font = '10px "DM Mono"';
      ctx.textAlign = 'center';
      ctx.fillText(brick.durability.toString(), brick.x + brick.width / 2, brick.y + brick.height / 2 + 4);
    }
  }
  
  // Paddle
  ctx.fillStyle = '#39ff14';
  ctx.fillRect(state.paddleX - state.paddleWidth / 2, h - 30 - state.paddleHeight, state.paddleWidth, state.paddleHeight);
  
  // Ball trail
  if (state.phase === 'playing' && !state.ballAttached) {
    ballTrail.push({ x: state.ballX, y: state.ballY });
    if (ballTrail.length > 8) ballTrail.shift();
  }
  
  for (let i = 0; i < ballTrail.length; i++) {
    const t = ballTrail[i];
    const alpha = (i / ballTrail.length) * 0.4;
    const radius = state.ballRadius * (i / ballTrail.length) * 0.8;
    ctx.fillStyle = `rgba(57, 255, 20, ${alpha})`;
    ctx.beginPath();
    ctx.arc(t.x, t.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Ball
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(state.ballX, state.ballY, state.ballRadius, 0, Math.PI * 2);
  ctx.fill();
  
  // Ball glow
  ctx.shadowColor = '#39ff14';
  ctx.shadowBlur = 15;
  ctx.fill();
  ctx.shadowBlur = 0;
  
  // HUD
  ctx.font = '16px "DM Mono", monospace';
  ctx.fillStyle = '#39ff14';
  ctx.textAlign = 'left';
  ctx.fillText(`SCORE: ${state.score}`, 20, 30);
  
  ctx.textAlign = 'right';
  ctx.fillText(`LEVEL: ${state.level}`, w - 20, 30);
  
  // Lives
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff4560';
  let livesStr = '';
  for (let i = 0; i < state.lives; i++) livesStr += '♥ ';
  ctx.fillText(livesStr, w / 2, 30);
  
  ctx.restore();
}

function gameLoop() {
  if (!state) return;
  
  // Handle input
  const speed = 10;
  if (keysPressed['ArrowLeft'] || keysPressed['a'] || keysPressed['A']) {
    state = breakout.movePaddle(state, -speed);
  }
  if (keysPressed['ArrowRight'] || keysPressed['d'] || keysPressed['D']) {
    state = breakout.movePaddle(state, speed);
  }
  
  // Track brick destruction for particles
  const oldBricks = state.bricks;
  
  // Tick
  state = breakout.tick(state);

  // Live high score tracking - save immediately when surpassed
  if (state.score > highScore) {
    highScore = state.score;
    state.highScore = highScore;
    saveProgress();
  }
  
  // Spawn particles for destroyed bricks
  for (let i = 0; i < state.bricks.length; i++) {
    if (oldBricks[i]?.alive && !state.bricks[i].alive) {
      spawnParticles(
        oldBricks[i].x + oldBricks[i].width / 2,
        oldBricks[i].y + oldBricks[i].height / 2,
        oldBricks[i].color,
        12
      );
      screenShake = 6;
    }
  }
  
  // Render
  drawFrame();
  
  // Check game over
  if (state.phase === 'lost') {
    showOverlay('lost');
    return;
  }
  
  animationId = requestAnimationFrame(gameLoop);
}

function showOverlay(overlayType) {
  particles = [];
  ballTrail = [];
  screenShake = 0;
  const overlay = containerEl.querySelector('#breakout-overlay');
  if (!overlay) return;
  
  overlay.classList.remove('hidden');
  
  if (overlayType === 'ready') {
    overlay.innerHTML = `
      <h2>🧱 BREAKOUT</h2>
      <p>Clear all bricks to advance!</p>
      <p style="margin-top:8px">Level: ${state.level}</p>
      <button id="breakout-start-btn">START</button>
      <button id="breakout-difficulty">Difficulty: ${difficulty.toUpperCase()}</button>
    `;
    containerEl.querySelector('#breakout-start-btn').addEventListener('click', () => {
      overlay.classList.add('hidden');
      state.phase = 'playing';
      gameLoop();
    });
    containerEl.querySelector('#breakout-difficulty').addEventListener('click', () => {
      const levels = ['easy', 'medium', 'hard'];
      const idx = (levels.indexOf(difficulty) + 1) % levels.length;
      difficulty = levels[idx];
      containerEl.querySelector('#breakout-difficulty').textContent = `Difficulty: ${difficulty.toUpperCase()}`;
    });
  } else if (overlayType === 'lost') {
    overlay.innerHTML = `
      <h2 style="color:#ff4560">GAME OVER</h2>
      <p>Score: ${state.score}</p>
      <p>Level: ${state.level}</p>
      <p>High Score: ${highScore}</p>
      <button id="breakout-retry-btn">TRY AGAIN</button>
    `;
    containerEl.querySelector('#breakout-retry-btn').addEventListener('click', () => {
      state = breakout.initGame(difficulty);
      state.highScore = highScore;
      state.phase = 'playing';
      overlay.classList.add('hidden');
      gameLoop();
    });
  }
}

function handleKeyDown(e) {
  if (['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D', ' '].includes(e.key)) {
    e.preventDefault();
  }
  keysPressed[e.key] = true;
  
  if (e.key === ' ' && state) {
    const overlay = containerEl.querySelector('#breakout-overlay');
    const startBtn = containerEl.querySelector('#breakout-start-btn');
    if (overlay && !overlay.classList.contains('hidden') && startBtn) {
      // Initial start overlay: dismiss, set playing, and launch ball in one press
      overlay.classList.add('hidden');
      state.phase = 'playing';
      state = breakout.launchBall(state);
      if (!animationId) {
        gameLoop();
      }
    } else if (state.ballAttached && state.phase === 'playing') {
      state = breakout.launchBall(state);
    }
  }
}

function handleKeyUp(e) {
  keysPressed[e.key] = false;
}

function setupCanvas() {
  const wrap = containerEl.querySelector('#breakout-canvas-wrap');
  const w = 800;
  const h = 500;
  
  canvasEl = document.createElement('canvas');
  canvasEl.id = 'breakout-canvas';
  canvasEl.width = w;
  canvasEl.height = h;
  
  wrap.appendChild(canvasEl);

  ctx = canvasEl.getContext('2d');
}

export function render(container, options) {
  containerEl = container;
  navigateFn = options?.navigate || (() => {});
  playerId = options?.playerId || null;

  injectStyles();
  loadProgress();

  container.innerHTML = `
    <div id="breakout-root">
      <div id="breakout-header">
        <button id="breakout-back">← SOLO</button>
        <div id="breakout-title">🧱 BREAKOUT</div>
        <button id="breakout-mute">🔊</button>
      </div>
      <div id="breakout-stats">
        <div>High Score: <span id="breakout-best">${highScore}</span></div>
      </div>
      <div id="breakout-canvas-wrap">
        <div id="breakout-overlay"></div>
      </div>
      <div id="breakout-controls-hint">←→ or A/D to move, SPACE to launch</div>
    </div>
  `;
  
  setupCanvas();
  
  state = breakout.initGame(difficulty);
  state.highScore = highScore;
  
  // Event listeners
  container.querySelector('#breakout-back').addEventListener('click', () => navigateFn('singleplayer'));
  container.querySelector('#breakout-mute').addEventListener('click', (e) => {
    const enabled = toggleSound();
    e.target.textContent = enabled ? '🔊' : '🔇';
  });
  
  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup', handleKeyUp);
  
  drawFrame();
  showOverlay('ready');
}

export function destroy() {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  document.removeEventListener('keydown', handleKeyDown);
  document.removeEventListener('keyup', handleKeyUp);
  state = null;
  containerEl = null;
}
