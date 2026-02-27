import * as pong from '../../games/pong/index.js';

let containerEl = null;
let canvasEl = null;
let ctx = null;
let state = null;
let animationId = null;
let playerId = null;
let navigateFn = null;
let difficulty = 'medium';
let highScore = 0;
let wins = 0;
let keysPressed = {};
let ballTrail = [];
let soundEnabled = false;
let particles = [];

function playSound(type) {
  if (!soundEnabled) return;
  console.log(`[pong sound] ${type}`);
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  return soundEnabled;
}

function injectStyles() {
  if (document.getElementById('pong-styles')) return;
  const s = document.createElement('style');
  s.id = 'pong-styles';
  s.textContent = `
    #pong-root {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      background: #050a05;
      font-family: 'DM Mono', monospace;
    }
    #pong-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: linear-gradient(180deg, rgba(57,255,20,0.08) 0%, transparent 100%);
      border-bottom: 1px solid #1a2e1a;
      flex-shrink: 0;
    }
    #pong-back {
      background: transparent;
      border: 1px solid #39ff14;
      color: #39ff14;
      padding: 6px 12px;
      font-family: inherit;
      font-size: 12px;
      cursor: pointer;
      border-radius: 4px;
    }
    #pong-back:hover { background: rgba(57,255,20,0.1); }
    #pong-title {
      color: #39ff14;
      font-size: 14px;
      letter-spacing: 2px;
    }
    #pong-mute {
      background: transparent;
      border: none;
      color: #39ff14;
      font-size: 16px;
      cursor: pointer;
      padding: 4px 8px;
    }
    #pong-stats {
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
    #pong-stats span { color: #39ff14; }
    #pong-canvas-wrap {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: hidden;
    }
    #pong-canvas {
      background: #000;
      border: 2px solid #1a2e1a;
      max-width: 100%;
      max-height: 100%;
    }
    #pong-overlay {
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
    #pong-overlay.hidden { display: none; }
    #pong-overlay h2 {
      font-size: 28px;
      margin: 0;
      text-shadow: 0 0 20px #39ff14;
    }
    #pong-overlay p {
      color: #a8ffa8;
      margin: 0;
      font-size: 14px;
    }
    #pong-difficulty {
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
    #pong-difficulty:hover { background: rgba(57,255,20,0.1); }
    #pong-controls-hint {
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
    fetch('/api/sp/saves/pong', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot: 'stats', data: { highScore, wins } }),
    }).catch(() => {});
  }
}

function loadProgress() {
  const stored = localStorage.getItem('pong_hs');
  highScore = stored ? parseInt(stored, 10) : 0;
  wins = 0;
  
  if (playerId) {
    fetch('/api/sp/saves/pong').then(r => r.ok ? r.json() : []).then(saves => {
      const stats = saves.find(s => s.slot === 'stats');
      if (stats?.data) {
        highScore = Math.max(highScore, stats.data.highScore || 0);
        wins = stats.data.wins || 0;
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
  
  // Draw particles
  for (const p of particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  
  // Update ball trail
  if (state.phase === 'playing') {
    ballTrail.push({ x: state.ballX, y: state.ballY });
    if (ballTrail.length > 10) ballTrail.shift();
  }
  
  // Clear
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  
  // Center line
  ctx.strokeStyle = '#1a2e1a';
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w / 2, h);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Draw ball trail
  for (let i = 0; i < ballTrail.length; i++) {
    const t = ballTrail[i];
    const alpha = (i / ballTrail.length) * 0.4;
    const radius = state.ballRadius * (i / ballTrail.length) * 0.8;
    ctx.fillStyle = `rgba(57, 255, 20, ${alpha})`;
    ctx.beginPath();
    ctx.arc(t.x, t.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Player paddle
  ctx.fillStyle = '#39ff14';
  ctx.fillRect(30, state.playerY - state.paddleHeight / 2, state.paddleWidth, state.paddleHeight);
  
  // AI paddle
  ctx.fillStyle = '#ff4560';
  ctx.fillRect(w - 30 - state.paddleWidth, state.aiY - state.paddleHeight / 2, state.paddleWidth, state.paddleHeight);
  
  // Ball
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(state.ballX, state.ballY, state.ballRadius, 0, Math.PI * 2);
  ctx.fill();
  
  // Glow effect on ball
  ctx.shadowColor = '#39ff14';
  ctx.shadowBlur = 15;
  ctx.fill();
  ctx.shadowBlur = 0;
  
  // Scores
  ctx.font = '48px "DM Mono", monospace';
  ctx.fillStyle = '#39ff14';
  ctx.textAlign = 'center';
  ctx.fillText(state.playerScore.toString(), w / 2 - 60, 50);
  ctx.fillStyle = '#ff4560';
  ctx.fillText(state.aiScore.toString(), w / 2 + 60, 50);
  
  // Rally
  if (state.rally > 0) {
    ctx.font = '14px "DM Mono", monospace';
    ctx.fillStyle = 'rgba(57,255,20,0.5)';
    ctx.fillText(`RALLY: ${state.rally}`, w / 2, 80);
  }
}

function gameLoop() {
  if (!state) return;
  
  // Handle input
  const speed = 8;
  if (keysPressed['ArrowUp'] || keysPressed['w'] || keysPressed['W']) {
    state = pong.movePlayer(state, -speed);
  }
  if (keysPressed['ArrowDown'] || keysPressed['s'] || keysPressed['S']) {
    state = pong.movePlayer(state, speed);
  }
  
  // Tick
  const oldRally = state.rally;
  state = pong.tick(state);
  
  // Spawn particles on paddle hit (when rally increases)
  if (state.rally > oldRally) {
    // Determine which paddle was hit based on ball direction
    if (state.ballVX > 0) {
      spawnParticles(state.ballX - state.ballRadius - 5, state.ballY, '#ff4560', 10);
    } else {
      spawnParticles(state.ballX + state.ballRadius + 5, state.ballY, '#39ff14', 10);
    }
  }
  
  // Render
  drawFrame();
  
  // Check game over
  if (state.phase === 'won' || state.phase === 'lost') {
    showOverlay(state.phase);
    if (state.phase === 'won') {
      wins++;
      if (state.rally > highScore) {
        highScore = state.rally;
        saveProgress();
      }
    }
    state.phase = 'gameover';
    return;
  }
  
  animationId = requestAnimationFrame(gameLoop);
}

function showOverlay(overlayType) {
  ballTrail = [];
  particles = [];
  const overlay = containerEl.querySelector('#pong-overlay');
  if (!overlay) return;
  
  overlay.classList.remove('hidden');
  
  if (overlayType === 'ready') {
    overlay.innerHTML = `
      <h2>🏓 PONG</h2>
      <p>First to ${state.winScore} points wins!</p>
      <p style="margin-top:8px">Rally: ${state.rally}</p>
      <button id="pong-start-btn">START</button>
      <button id="pong-difficulty">Difficulty: ${difficulty.toUpperCase()}</button>
    `;
    containerEl.querySelector('#pong-start-btn').addEventListener('click', () => {
      overlay.classList.add('hidden');
      state.phase = 'playing';
      gameLoop();
    });
    containerEl.querySelector('#pong-difficulty').addEventListener('click', () => {
      const levels = ['easy', 'medium', 'hard'];
      const idx = (levels.indexOf(difficulty) + 1) % levels.length;
      difficulty = levels[idx];
      containerEl.querySelector('#pong-difficulty').textContent = `Difficulty: ${difficulty.toUpperCase()}`;
    });
  } else if (overlayType === 'won') {
    overlay.innerHTML = `
      <h2 style="color:#39ff14">YOU WIN!</h2>
      <p>Rally: ${state.rally}</p>
      <p>Wins: ${wins}</p>
      <button id="pong-replay-btn">PLAY AGAIN</button>
    `;
    containerEl.querySelector('#pong-replay-btn').addEventListener('click', () => {
      state = pong.initGame(difficulty);
      state.highScore = highScore;
      state.wins = wins;
      state.phase = 'playing';
      overlay.classList.add('hidden');
      gameLoop();
    });
  } else if (overlayType === 'lost') {
    overlay.innerHTML = `
      <h2 style="color:#ff4560">GAME OVER</h2>
      <p>Score: ${state.playerScore} - ${state.aiScore}</p>
      <p>Best Rally: ${highScore}</p>
      <button id="pong-retry-btn">TRY AGAIN</button>
    `;
    containerEl.querySelector('#pong-retry-btn').addEventListener('click', () => {
      state = pong.initGame(difficulty);
      state.highScore = highScore;
      state.wins = wins;
      state.phase = 'playing';
      overlay.classList.add('hidden');
      gameLoop();
    });
  }
}

function handleKeyDown(e) {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'W', 'a', 'A', 's', 'S'].includes(e.key)) {
    e.preventDefault();
  }
  keysPressed[e.key] = true;
}

function handleKeyUp(e) {
  keysPressed[e.key] = false;
}

function setupCanvas() {
  const wrap = containerEl.querySelector('#pong-canvas-wrap');
  const w = 800;
  const h = 500;
  
  canvasEl = document.createElement('canvas');
  canvasEl.id = 'pong-canvas';
  canvasEl.width = w;
  canvasEl.height = h;
  
  wrap.innerHTML = '';
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
    <div id="pong-root">
      <div id="pong-header">
        <button id="pong-back">← SOLO</button>
        <div id="pong-title">🏓 PONG</div>
        <button id="pong-mute">🔊</button>
      </div>
      <div id="pong-stats">
        <div>Best Rally: <span id="pong-best">${highScore}</span></div>
        <div>Wins: <span id="pong-wins">${wins}</span></div>
      </div>
      <div id="pong-canvas-wrap">
        <div id="pong-overlay"></div>
      </div>
      <div id="pong-controls-hint">↑↓ or W/S to move</div>
    </div>
  `;
  
  setupCanvas();
  
  state = pong.initGame(difficulty);
  state.highScore = highScore;
  state.wins = wins;
  
  // Event listeners
  container.querySelector('#pong-back').addEventListener('click', () => navigateFn('singleplayer'));
  container.querySelector('#pong-mute').addEventListener('click', (e) => {
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
