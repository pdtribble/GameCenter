import { LEVELS, EMPTY, SOLID, FOOD, EXIT, initLevel, processInput } from '../../games/snake-puzzle/index.js';

let containerEl = null, optRef = null, state = null;
let completedLevels = new Set();
let screen = 'levelSelect';

let canvasEl = null, ctx = null, dpr = 1;
let cellSize = 20, logicalW = 0, logicalH = 0;

let rafId = null, lastFrameTime = 0;
let foodGlowPhase = 0, exitGlowPhase = 0;
let particles = [];
let overlayAnim = null;

let anim = null;

let keyHandlerRef = null, touchStartX = null, touchStartY = null, resizeObserverRef = null;

const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

function computeLayout() {
  if (!canvasEl || !state) return;
  const wrap = containerEl.querySelector('#snp-canvas-wrap');
  if (!wrap) return;

  const W = wrap.clientWidth, H = wrap.clientHeight;
  const byW = Math.floor(W / state.width), byH = Math.floor(H / state.height);
  cellSize = Math.max(12, Math.min(byW, byH, 50));

  logicalW = state.width * cellSize;
  logicalH = state.height * cellSize;

  dpr = window.devicePixelRatio || 1;
  canvasEl.width = logicalW * dpr;
  canvasEl.height = logicalH * dpr;
  canvasEl.style.width = logicalW + 'px';
  canvasEl.style.height = logicalH + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function clearCanvas() {
  ctx.fillStyle = '#060612';
  ctx.fillRect(0, 0, logicalW, logicalH);

  const grad = ctx.createRadialGradient(logicalW/2, logicalH/2, logicalW*0.3, logicalW/2, logicalH/2, Math.hypot(logicalW, logicalH)*0.6);
  grad.addColorStop(0, 'rgba(30,50,100,0.1)');
  grad.addColorStop(1, 'rgba(10,20,50,0.05)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, logicalW, logicalH);
}

function drawFloor() {
  if (cellSize < 14) return;
  ctx.fillStyle = 'rgba(60,80,160,0.08)';
  for (let row = 0; row < state.height; row++) {
    for (let col = 0; col < state.width; col++) {
      if (state.tiles[row][col] === EMPTY) {
        const x = col * cellSize + cellSize / 2;
        const y = row * cellSize + cellSize / 2;
        ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
      }
    }
  }
}

function drawWalls() {
  ctx.shadowBlur = 0;
  for (let row = 0; row < state.height; row++) {
    for (let col = 0; col < state.width; col++) {
      if (state.tiles[row][col] === SOLID) {
        const x = col * cellSize, y = row * cellSize;

        ctx.fillStyle = '#1e1e35';
        ctx.fillRect(x, y, cellSize, cellSize);

        ctx.fillStyle = 'rgba(100,120,200,0.25)';
        ctx.fillRect(x, y, cellSize, 2);
        ctx.fillStyle = 'rgba(80,100,180,0.12)';
        ctx.fillRect(x, y, 2, cellSize);

        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(x, y + cellSize - 2, cellSize, 2);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(x + cellSize - 2, y, 2, cellSize);
      }
    }
  }
}

function drawFood() {
  for (let row = 0; row < state.height; row++) {
    for (let col = 0; col < state.width; col++) {
      if (state.tiles[row][col] === FOOD) {
        const x = col * cellSize + cellSize / 2;
        const y = row * cellSize + cellSize / 2;
        const size = cellSize * 0.35;

        ctx.shadowBlur = 12 + 6 * Math.sin(foodGlowPhase);
        ctx.shadowColor = '#ff9500';

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(foodGlowPhase * 0.3);
        ctx.fillStyle = '#ffc533';
        ctx.fillRect(-size, -size, size*2, size*2);
        ctx.restore();

        ctx.shadowBlur = 0;
      }
    }
  }
}

function drawExit() {
  for (let row = 0; row < state.height; row++) {
    for (let col = 0; col < state.width; col++) {
      if (state.tiles[row][col] === EXIT) {
        const x = col * cellSize + cellSize / 2;
        const y = row * cellSize + cellSize / 2;
        const r1 = cellSize * 0.2;
        const r2 = cellSize * 0.32;

        ctx.shadowBlur = 20;
        ctx.shadowColor = 'rgba(57,255,20,0.5)';

        ctx.strokeStyle = 'rgba(57,255,20,0.3)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, r2, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = '#39ff14';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r1, exitGlowPhase, exitGlowPhase + Math.PI * 1.2);
        ctx.stroke();

        ctx.fillStyle = '#39ff14';
        ctx.beginPath();
        ctx.arc(x, y, cellSize * 0.08, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
      }
    }
  }
}

function getSnakeDrawPositions() {
  if (!anim || anim.t >= 1) {
    return state.snake.map(s => ({ x: s.x * cellSize, y: s.y * cellSize }));
  }

  const t = easeOutCubic(anim.t);
  const positions = [];

  for (let i = 0; i < state.snake.length; i++) {
    const next = state.snake[i];
    const prev = anim.prev[i] || anim.prev[Math.max(0, anim.prev.length - 1)];

    positions.push({
      x: lerp(prev.x * cellSize, next.x * cellSize, t),
      y: lerp(prev.y * cellSize, next.y * cellSize, t),
    });
  }

  return positions;
}

function drawSnake() {
  if (state.snake.length === 0) return;

  const positions = getSnakeDrawPositions();
  const len = positions.length;

  ctx.shadowBlur = 0;

  for (let i = len - 1; i >= 0; i--) {
    const t = i / (len - 1);
    const r = Math.floor(0 + t * 68);
    const g = Math.floor(200 - t * 136);
    const b = Math.floor(224 - t * 164);

    const pos = positions[i];
    const x = pos.x - cellSize / 2, y = pos.y - cellSize / 2;
    const pad = cellSize * 0.2;

    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath();
    ctx.roundRect(x + pad, y + pad, cellSize - 2 * pad, cellSize - 2 * pad, cellSize * 0.3);
    ctx.fill();
  }

  ctx.shadowBlur = 12;
  ctx.shadowColor = 'rgba(0,200,255,0.4)';
  const headPos = positions[0];
  const hx = headPos.x - cellSize / 2, hy = headPos.y - cellSize / 2;
  const hpad = cellSize * 0.15;

  ctx.fillStyle = '#00eaff';
  ctx.beginPath();
  ctx.roundRect(hx + hpad, hy + hpad, cellSize - 2 * hpad, cellSize - 2 * hpad, cellSize * 0.35);
  ctx.fill();

  const eyeRadius = cellSize * 0.1;
  const eyeX1 = hx + cellSize * 0.35, eyeX2 = hx + cellSize * 0.65;
  const eyeY = hy + cellSize * 0.5;

  ctx.fillStyle = '#001a1a';
  ctx.beginPath();
  ctx.arc(eyeX1, eyeY - cellSize * 0.1, eyeRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(eyeX2, eyeY - cellSize * 0.1, eyeRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(eyeX1 + cellSize * 0.04, eyeY - cellSize * 0.12, cellSize * 0.04, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(eyeX2 + cellSize * 0.04, eyeY - cellSize * 0.12, cellSize * 0.04, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
}

function spawnParticles(tileX, tileY) {
  const x = tileX * cellSize + cellSize / 2;
  const y = tileY * cellSize + cellSize / 2;

  for (let i = 0; i < 10; i++) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * cellSize * 0.4,
      vy: (Math.random() - 0.5) * cellSize * 0.4 - cellSize * 0.15,
      life: 1,
      decay: 0.04 + Math.random() * 0.04,
      size: cellSize * 0.1 + Math.random() * cellSize * 0.1,
      color: Math.random() > 0.5 ? '#ffc533' : '#ffffff',
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= p.decay;
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.4;

    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawOverlay() {
  if (!overlayAnim) return;

  const elapsed = performance.now() - overlayAnim.startTime;
  const t = Math.min(1, elapsed / overlayAnim.duration);

  if (overlayAnim.type === 'won') {
    ctx.fillStyle = `rgba(57,255,20,${t * 0.2})`;
    ctx.fillRect(0, 0, logicalW, logicalH);

    if (t > 0.3) {
      ctx.shadowBlur = 25;
      ctx.shadowColor = '#39ff14';
      ctx.fillStyle = '#39ff14';
      ctx.font = `bold ${cellSize * 2}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('LEVEL COMPLETE!', logicalW / 2, logicalH / 2 - cellSize);

      ctx.shadowBlur = 0;
      ctx.font = `${cellSize * 0.9}px monospace`;
      ctx.fillStyle = '#39ff14';
      ctx.fillText('Press N for next  R to retry', logicalW / 2, logicalH / 2 + cellSize * 1.5);
    }
  } else if (overlayAnim.type === 'dead') {
    const shake = Math.sin(t * 50) * 4 * (1 - t);
    ctx.translate(shake, 0);

    ctx.fillStyle = `rgba(255,80,100,${t * 0.25})`;
    ctx.fillRect(0, 0, logicalW, logicalH);

    ctx.translate(-shake, 0);

    if (t > 0.4) {
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#ff5588';
      ctx.fillStyle = '#ff6688';
      ctx.font = `bold ${cellSize * 2}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('CRASHED', logicalW / 2, logicalH / 2 - cellSize);

      ctx.shadowBlur = 0;
      ctx.font = `${cellSize * 0.9}px monospace`;
      ctx.fillStyle = '#ff6688';
      ctx.fillText('Press R to retry  Esc for menu', logicalW / 2, logicalH / 2 + cellSize * 1.5);
    }
  }
}

function drawFrame() {
  if (!ctx || !state) return;

  clearCanvas();
  drawFloor();
  drawWalls();
  drawFood();
  drawExit();
  drawSnake();
  drawParticles();
  drawOverlay();
}

function updateHUDContent() {
  const hud = containerEl.querySelector('#snp-hud');
  if (!hud) return;

  const levelNum = state.levelIndex + 1;
  const totalLevels = LEVELS.length;
  const food = state.totalFoodEaten;
  const foodNeeded = state.foodCount;

  hud.querySelector('.snp-hud-level').textContent = `Lv ${levelNum}/${totalLevels}`;
  hud.querySelector('.snp-hud-food').textContent = `Food ${food}/${foodNeeded}`;
  hud.querySelector('.snp-hud-moves').textContent = `${state.moveCount}`;
}

function handleDirection(direction) {
  if (state.phase !== 'playing') return;
  if (anim && anim.t < 1) return;

  if (direction === 'up' && !isGrounded(state.snake, state.tiles, state.height)) return;

  const head = state.snake[0];
  let nx = head.x, ny = head.y;

  if (direction === 'left') nx--;
  else if (direction === 'right') nx++;
  else if (direction === 'up') ny--;
  else if (direction === 'down') ny++;

  const willEat = state.tiles[ny]?.[nx] === FOOD;

  const prevSnake = state.snake.map(s => ({ x: s.x, y: s.y }));
  state = processInput(state, direction);
  const nextSnake = state.snake.map(s => ({ x: s.x, y: s.y }));

  anim = { prev: prevSnake, next: nextSnake, t: 0, dur: 180 };

  if (willEat && state.phase !== 'dead') spawnParticles(nx, ny);
  updateHUDContent();

  if (state.phase === 'won') {
    overlayAnim = { type: 'won', startTime: performance.now(), duration: 2500 };
    saveProgress();
  } else if (state.phase === 'dead') {
    overlayAnim = { type: 'dead', startTime: performance.now(), duration: 1500 };
  }
}

function isGrounded(snake, tiles, height) {
  for (const segment of snake) {
    const below = segment.y + 1;
    if (below < height && tiles[below] && tiles[below][segment.x] === SOLID) return true;
  }
  return false;
}

function handleKey(e) {
  if (screen !== 'playing') return;

  if (overlayAnim) {
    const elapsed = performance.now() - overlayAnim.startTime;
    if (elapsed < 800) return;

    if (overlayAnim.type === 'won') {
      if ((e.key === 'n' || e.key === 'N') && state.levelIndex < LEVELS.length - 1) {
        e.preventDefault();
        startLevel(state.levelIndex + 1);
        return;
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        startLevel(state.levelIndex);
        return;
      }
    } else if (overlayAnim.type === 'dead') {
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        startLevel(state.levelIndex);
        return;
      }
    }
  }

  if (e.key === 'Escape') {
    e.preventDefault();
    showLevelSelect();
    return;
  }

  if (state.phase === 'playing') {
    let direction = null;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      direction = 'left';
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      e.preventDefault();
      direction = 'right';
    } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      e.preventDefault();
      direction = 'up';
    } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      e.preventDefault();
      direction = 'down';
    }

    if (direction) handleDirection(direction);
  }
}

function handleTouchStart(e) {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}

function handleTouchEnd(e) {
  if (touchStartX === null || touchStartY === null) return;

  const deltaX = e.changedTouches[0].clientX - touchStartX;
  const deltaY = e.changedTouches[0].clientY - touchStartY;
  const absDeltaX = Math.abs(deltaX), absDeltaY = Math.abs(deltaY);
  const threshold = 30;

  if (absDeltaX > absDeltaY && absDeltaX > threshold) {
    const evt = new KeyboardEvent('keydown', { key: deltaX > 0 ? 'ArrowRight' : 'ArrowLeft' });
    handleKey(evt);
  } else if (absDeltaY > absDeltaX && absDeltaY > threshold) {
    const evt = new KeyboardEvent('keydown', { key: deltaY > 0 ? 'ArrowDown' : 'ArrowUp' });
    handleKey(evt);
  }

  touchStartX = null;
  touchStartY = null;
}

function saveProgress() {
  if (state.phase === 'won' && !completedLevels.has(state.levelIndex)) {
    completedLevels.add(state.levelIndex);
  }

  if (optRef.onSave) {
    optRef.onSave('progress', {
      currentLevel: state.levelIndex,
      completedLevels: Array.from(completedLevels),
      bestMoves: { [state.levelIndex]: state.moveCount },
    });
  }
}

function startLevel(idx) {
  screen = 'playing';
  state = initLevel(idx);

  const root = containerEl.querySelector('#snp-root');
  const levelSelectHTML = root.querySelector('#snp-ls-body');
  if (levelSelectHTML) levelSelectHTML.remove();

  const wrap = root.querySelector('#snp-canvas-wrap');
  if (!wrap) {
    const hudDiv = document.createElement('div');
    hudDiv.id = 'snp-hud';
    hudDiv.innerHTML = `
      <button id="snp-back-btn" style="background:transparent; border:1px solid rgba(0,234,255,0.3); color:rgba(0,234,255,0.7); font-family:monospace; padding:4px 10px; font-size:0.7rem; cursor:pointer; border-radius:3px; transition:all 0.2s;">← LEVELS</button>
      <div style="flex:1; text-align:center;">
        <div class="snp-hud-level" style="color:#39ff14; font-weight:700; font-size:0.8rem;"></div>
        <div class="snp-hud-food" style="color:#ffc533; font-size:0.65rem;"></div>
      </div>
      <div class="snp-hud-moves" style="color:#00eaff; font-weight:700;"></div>
    `;

    const hint = root.querySelector('#snp-hint');
    hint.insertAdjacentElement('beforebegin', hudDiv);

    const canvasWrap = document.createElement('div');
    canvasWrap.id = 'snp-canvas-wrap';
    canvasWrap.style.cssText = 'flex:1; display:flex; align-items:center; justify-content:center; overflow:hidden;';
    canvasEl = document.createElement('canvas');
    canvasEl.id = 'snp-canvas';
    canvasEl.style.cssText = 'display:block; image-rendering:pixelated;';
    canvasWrap.appendChild(canvasEl);
    hint.insertAdjacentElement('beforebegin', canvasWrap);

    ctx = canvasEl.getContext('2d');
    hudDiv.querySelector('#snp-back-btn').addEventListener('click', showLevelSelect);
  }

  computeLayout();
  updateHUDContent();

  resizeObserverRef = new ResizeObserver(() => {
    computeLayout();
  });
  resizeObserverRef.observe(root.querySelector('#snp-canvas-wrap'));

  startRAF();
  drawFrame();
}

function showLevelSelect() {
  screen = 'levelSelect';
  stopRAF();

  if (canvasEl) {
    canvasEl.parentElement.remove();
    canvasEl = null;
    ctx = null;
  }

  const hud = containerEl.querySelector('#snp-hud');
  if (hud) hud.remove();

  if (resizeObserverRef) {
    resizeObserverRef.disconnect();
    resizeObserverRef = null;
  }

  const root = containerEl.querySelector('#snp-root');
  buildLevelSelect(root);
}

function buildLevelSelect(root) {
  let html = '<div id="snp-ls-body" style="flex:1; overflow-y:auto; padding:16px; display:grid; grid-template-columns:repeat(auto-fill, minmax(120px,1fr)); gap:12px; align-content:start;">';

  for (let i = 0; i < LEVELS.length; i++) {
    const level = LEVELS[i];
    const unlocked = i === 0 || completedLevels.has(i - 1);
    const completed = completedLevels.has(i);

    html += `
      <div style="background:rgba(30,30,50,0.8); border:1px solid rgba(0,234,255,${unlocked?0.3:0.1}); border-radius:8px; padding:12px; cursor:${unlocked?'pointer':'not-allowed'}; transition:all 0.2s; opacity:${unlocked?1:0.4};" data-level="${i}">
        <div style="font-size:2rem; font-weight:800; color:${unlocked?'#39ff14':'#666'}; line-height:1; margin-bottom:6px;">${i + 1}</div>
        <div style="font-size:0.6rem; letter-spacing:1px; color:rgba(240,240,250,0.6); text-transform:uppercase; margin-bottom:4px;">${level.name}</div>
        ${completed ? '<div style="color:#39ff14; font-size:0.7rem;">✓ DONE</div>' : ''}
      </div>
    `;
  }

  html += '</div>';

  const hint = root.querySelector('#snp-hint');
  hint.insertAdjacentHTML('beforebegin', html);

  const body = root.querySelector('#snp-ls-body');
  body.querySelectorAll('[data-level]').forEach(card => {
    const idx = parseInt(card.dataset.level);
    const unlocked = idx === 0 || completedLevels.has(idx - 1);
    if (unlocked) {
      card.addEventListener('click', () => startLevel(idx));
      card.addEventListener('mouseenter', () => {
        card.style.borderColor = 'rgba(0,234,255,0.6)';
        card.style.transform = 'translateY(-2px)';
      });
      card.addEventListener('mouseleave', () => {
        card.style.borderColor = 'rgba(0,234,255,0.3)';
        card.style.transform = 'translateY(0)';
      });
    }
  });
}

function startRAF() {
  function loop(now) {
    const dt = now - (lastFrameTime || now);
    lastFrameTime = now;

    if (anim && anim.t < 1) {
      anim.t = Math.min(1, anim.t + dt / anim.dur);
    }

    foodGlowPhase += dt * 0.003;
    exitGlowPhase += dt * 0.002;

    updateParticles(dt);

    if (screen === 'playing') {
      drawFrame();
    }

    rafId = requestAnimationFrame(loop);
  }
  rafId = requestAnimationFrame(loop);
}

function stopRAF() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

export function render(container, options) {
  containerEl = container;
  optRef = options || {};

  const style = document.createElement('style');
  style.id = 'snp-style';
  style.textContent = `
    #snp-root { width:100%; height:100%; display:flex; flex-direction:column; background:#060612; font-family:monospace; overflow:hidden; user-select:none; color:#f0f0f8; }
    #snp-header { display:flex; align-items:center; padding:10px 16px; background:rgba(10,20,50,0.5); border-bottom:1px solid rgba(0,234,255,0.15); flex-shrink:0; }
    #snp-title { font-size:0.85rem; font-weight:700; letter-spacing:3px; color:#39ff14; text-shadow:0 0 15px rgba(57,255,20,0.3); }
    #snp-hud { display:flex; align-items:center; justify-content:space-between; padding:8px 16px; background:rgba(10,20,50,0.3); border-bottom:1px solid rgba(0,234,255,0.1); flex-shrink:0; height:52px; font-size:0.7rem; }
    #snp-canvas-wrap { flex:1; display:flex; align-items:center; justify-content:center; overflow:hidden; background:rgba(6,6,18,0.8); }
    #snp-hint { flex-shrink:0; text-align:center; padding:6px 12px; font-size:0.55rem; letter-spacing:1px; color:#666; background:rgba(10,20,50,0.3); border-top:1px solid rgba(0,234,255,0.1); }
    body.layout-phone #snp-ls-body { grid-template-columns:repeat(2,1fr)!important; }
  `;
  document.head.appendChild(style);

  containerEl.innerHTML = `<div id="snp-root"><div id="snp-header"><div id="snp-title">⚡ SNAKE PUZZLE</div></div><div id="snp-hint">ARROWS / WASD · SWIPE on mobile</div></div>`;

  const root = containerEl.querySelector('#snp-root');

  if (optRef.initialSave) {
    completedLevels = new Set(optRef.initialSave.completedLevels || []);
  }

  keyHandlerRef = handleKey;
  document.addEventListener('keydown', keyHandlerRef);

  containerEl.addEventListener('touchstart', handleTouchStart);
  containerEl.addEventListener('touchend', handleTouchEnd);

  buildLevelSelect(root);
}

export function update() {}

export function destroy() {
  stopRAF();

  document.removeEventListener('keydown', keyHandlerRef);
  containerEl.removeEventListener('touchstart', handleTouchStart);
  containerEl.removeEventListener('touchend', handleTouchEnd);

  if (resizeObserverRef) resizeObserverRef.disconnect();

  const style = document.querySelector('#snp-style');
  if (style) style.remove();

  containerEl.innerHTML = '';

  canvasEl = null;
  ctx = null;
  state = null;
  containerEl = null;
  optRef = null;
  particles = [];
  completedLevels.clear();
}
