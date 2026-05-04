import {
  LEVELS, EMPTY, SOLID, FOOD, EXIT,
  initLevel, processInput,
} from '../../games/snake-puzzle/index.js';

let containerEl = null;
let optRef = null;
let state = null;
let completedLevels = new Set();

let screen = 'levelSelect'; // 'levelSelect' | 'playing'
let selectedLevel = 0;

let canvasEl = null;
let ctx = null;
let dpr = 1;
let cellSize = 20;
let logicalW = 0, logicalH = 0;

let rafId = null;
let lastFrameTime = 0;
let foodGlowPhase = 0;
let exitGlowPhase = 0;
let particles = [];
let overlayAnim = null;

let keyHandlerRef = null;
let touchStartX = null;
let touchStartY = null;
let resizeObserverRef = null;

function computeLayout() {
  if (!canvasEl || !state) return;

  const wrap = containerEl.querySelector('#snp-canvas-wrap');
  if (!wrap) return;

  const W = wrap.clientWidth;
  const H = wrap.clientHeight;

  const byW = Math.floor(W / state.width);
  const byH = Math.floor(H / state.height);
  cellSize = Math.max(12, Math.min(byW, byH, 40));

  logicalW = state.width * cellSize;
  logicalH = state.height * cellSize;

  dpr = window.devicePixelRatio || 1;
  canvasEl.width = logicalW * dpr;
  canvasEl.height = logicalH * dpr;
  canvasEl.style.width = logicalW + 'px';
  canvasEl.style.height = logicalH + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function roundedRect(x, y, w, h, r) {
  if (!ctx.roundRect) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  } else {
    ctx.roundRect(x, y, w, h, r);
  }
}

function clearCanvas() {
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, logicalW, logicalH);

  const grad = ctx.createRadialGradient(logicalW/2, logicalH/2, 0, logicalW/2, logicalH/2, Math.hypot(logicalW, logicalH)/2);
  grad.addColorStop(0, 'rgba(30,50,80,0)');
  grad.addColorStop(1, 'rgba(30,50,80,0.15)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, logicalW, logicalH);
}

function drawFloor() {
  if (cellSize < 14) return;
  ctx.fillStyle = 'rgba(255,255,255,0.02)';
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
  ctx.shadowColor = 'transparent';

  for (let row = 0; row < state.height; row++) {
    for (let col = 0; col < state.width; col++) {
      if (state.tiles[row][col] === SOLID) {
        const x = col * cellSize;
        const y = row * cellSize;

        ctx.fillStyle = '#2a2a3a';
        ctx.fillRect(x, y, cellSize, cellSize);

        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(x, y, cellSize, 2);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(x, y, 2, cellSize);

        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(x, y + cellSize - 2, cellSize, 2);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(x + cellSize - 2, y, 2, cellSize);

        if (cellSize >= 16) {
          ctx.fillStyle = 'rgba(255,255,255,0.03)';
          for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
              const px = x + (i + 0.5) * (cellSize / 4);
              const py = y + (j + 0.5) * (cellSize / 4);
              ctx.fillRect(px - 0.5, py - 0.5, 1, 1);
            }
          }
        }
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

        ctx.fillStyle = 'rgba(0,255,136,0.1)';
        ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);

        ctx.shadowBlur = 16;
        ctx.shadowColor = '#00ff88';
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, cellSize * 0.25, exitGlowPhase, exitGlowPhase + Math.PI * 1.5);
        ctx.stroke();

        ctx.fillStyle = 'rgba(0,255,136,0.3)';
        ctx.beginPath();
        ctx.arc(x, y, cellSize * 0.2, 0, Math.PI * 2);
        ctx.fill();

        if (cellSize >= 20) {
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#00ff88';
          ctx.font = `${cellSize * 0.28}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('EXIT', x, y + cellSize * 0.28);
        }
      }
    }
  }
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
}

function drawFood() {
  for (let row = 0; row < state.height; row++) {
    for (let col = 0; col < state.width; col++) {
      if (state.tiles[row][col] === FOOD) {
        const x = col * cellSize + cellSize / 2;
        const y = row * cellSize + cellSize / 2;
        const radius = cellSize * 0.32;

        ctx.shadowBlur = 12 + 4 * Math.sin(foodGlowPhase);
        ctx.shadowColor = '#ffd700';

        const grad = ctx.createRadialGradient(x - cellSize*0.1, y - cellSize*0.1, 0, x, y, radius);
        grad.addColorStop(0, '#ffed4e');
        grad.addColorStop(1, '#c8890d');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.arc(x - cellSize*0.1, y - cellSize*0.1, cellSize * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.shadowBlur = 0;
}

function drawSnakeBody() {
  if (state.snake.length === 0) return;

  for (let i = 1; i < state.snake.length; i++) {
    const seg = state.snake[i];
    const t = i / (state.snake.length - 1);
    const green = Math.floor(255 - t * 200);

    const x = seg.x * cellSize;
    const y = seg.y * cellSize;
    const padding = cellSize * 0.15;
    const radius = cellSize * 0.4;

    ctx.shadowBlur = 4 + 2 * (1 - t);
    ctx.shadowColor = '#00ff44';
    ctx.fillStyle = `rgb(0, ${green}, 50)`;
    roundedRect(x + padding, y + padding, cellSize - 2*padding, cellSize - 2*padding, radius);
    ctx.fill();
  }

  // Connectors between segments
  for (let i = 0; i < state.snake.length - 1; i++) {
    const curr = state.snake[i];
    const next = state.snake[i + 1];
    const t = i / (state.snake.length - 1);
    const green = Math.floor(255 - t * 200);

    ctx.fillStyle = `rgb(0, ${green}, 50)`;

    if (curr.x === next.x && Math.abs(curr.y - next.y) === 1) {
      const x = curr.x * cellSize + cellSize * 0.15;
      const w = cellSize * 0.7;
      const y = Math.min(curr.y, next.y) * cellSize + cellSize * 0.15;
      const h = cellSize * 0.7 + cellSize;
      ctx.fillRect(x, y, w, h);
    } else if (curr.y === next.y && Math.abs(curr.x - next.x) === 1) {
      const y = curr.y * cellSize + cellSize * 0.15;
      const h = cellSize * 0.7;
      const x = Math.min(curr.x, next.x) * cellSize + cellSize * 0.15;
      const w = cellSize * 0.7 + cellSize;
      ctx.fillRect(x, y, w, h);
    }
  }

  ctx.shadowBlur = 0;
}

function drawSnakeHead() {
  if (state.snake.length === 0) return;

  const head = state.snake[0];
  const x = head.x * cellSize;
  const y = head.y * cellSize;
  const cx = x + cellSize / 2;
  const cy = y + cellSize / 2;

  ctx.shadowBlur = 12;
  ctx.shadowColor = '#00ff88';
  ctx.fillStyle = '#00ff66';
  roundedRect(x + cellSize * 0.1, y + cellSize * 0.1, cellSize * 0.8, cellSize * 0.8, cellSize * 0.4);
  ctx.fill();

  let snoutX = cx, snoutY = cy;
  let eyeYOff = cellSize * 0.2;

  if (state.direction === 'right') {
    snoutX = x + cellSize * 0.8;
    eyeYOff = cellSize * 0.2;
  } else if (state.direction === 'left') {
    snoutX = x + cellSize * 0.2;
    eyeYOff = cellSize * 0.2;
  } else if (state.direction === 'down') {
    snoutY = y + cellSize * 0.8;
    eyeYOff = cellSize * 0;
  } else if (state.direction === 'up') {
    snoutY = y + cellSize * 0.2;
    eyeYOff = cellSize * 0;
  }

  ctx.fillStyle = '#00dd55';
  roundedRect(snoutX - cellSize * 0.125, snoutY - cellSize * 0.175, cellSize * 0.25, cellSize * 0.35, cellSize * 0.1);
  ctx.fill();

  ctx.fillStyle = '#001100';
  const eyeRadius = cellSize * 0.08;
  if (state.direction === 'right' || state.direction === 'left') {
    ctx.beginPath();
    ctx.arc(cx + cellSize * 0.15, cy - eyeYOff, eyeRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + cellSize * 0.15, cy + eyeYOff, eyeRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(cx + cellSize * 0.18, cy - eyeYOff - cellSize * 0.025, cellSize * 0.03, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + cellSize * 0.18, cy + eyeYOff - cellSize * 0.025, cellSize * 0.03, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(cx - eyeRadius * 1.5, cy + cellSize * 0.15, eyeRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + eyeRadius * 1.5, cy + cellSize * 0.15, eyeRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(cx - eyeRadius * 1.5 + cellSize * 0.025, cy + cellSize * 0.12, cellSize * 0.03, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + eyeRadius * 1.5 + cellSize * 0.025, cy + cellSize * 0.12, cellSize * 0.03, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.shadowBlur = 0;
}

function spawnParticles(tileX, tileY) {
  const x = tileX * cellSize + cellSize / 2;
  const y = tileY * cellSize + cellSize / 2;
  const count = 8 + Math.floor(Math.random() * 5);

  for (let i = 0; i < count; i++) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * cellSize * 0.35,
      vy: (Math.random() - 0.5) * cellSize * 0.35 - cellSize * 0.1,
      life: 1.0,
      decay: 0.04 + Math.random() * 0.03,
      size: cellSize * 0.12 + Math.random() * cellSize * 0.08,
      color: Math.random() > 0.5 ? '#ffd700' : '#ff8800',
    });
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= p.decay;
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.3;

    if (p.life <= 0) {
      particles.splice(i, 1);
    }
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
    ctx.fillStyle = `rgba(0,255,136,${t * 0.25})`;
    ctx.fillRect(0, 0, logicalW, logicalH);

    if (t > 0.3) {
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#00ff88';
      ctx.fillStyle = '#00ff88';
      ctx.font = `bold ${cellSize * 2}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('LEVEL COMPLETE!', logicalW / 2, logicalH / 2 - cellSize);

      ctx.shadowBlur = 0;
      ctx.font = `${cellSize}px monospace`;
      ctx.fillStyle = '#00ff88';
      ctx.fillText('Press N for next  R to retry', logicalW / 2, logicalH / 2 + cellSize * 1.5);
    }
  } else if (overlayAnim.type === 'dead') {
    const shake = Math.sin(t * 40) * 3 * (1 - t);
    ctx.translate(shake, 0);

    ctx.fillStyle = `rgba(255,0,80,${t * 0.3})`;
    ctx.fillRect(0, 0, logicalW, logicalH);

    ctx.translate(-shake, 0);

    if (t > 0.4) {
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#ff4444';
      ctx.fillStyle = '#ff4444';
      ctx.font = `bold ${cellSize * 2}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('CRASHED', logicalW / 2, logicalH / 2 - cellSize);

      ctx.shadowBlur = 0;
      ctx.font = `${cellSize}px monospace`;
      ctx.fillStyle = '#ff4444';
      ctx.fillText('Press R to retry  Esc for menu', logicalW / 2, logicalH / 2 + cellSize * 1.5);
    }
  }
}

function drawFrame() {
  if (!ctx || !state) return;

  clearCanvas();
  drawFloor();
  drawWalls();
  drawExit();
  drawFood();
  drawSnakeBody();
  drawSnakeHead();
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

  hud.querySelector('.snp-hud-level').textContent = `Level ${levelNum}/${totalLevels}`;
  hud.querySelector('.snp-hud-food').textContent = `Food ${food}/${foodNeeded}`;
  hud.querySelector('.snp-hud-moves').textContent = `Moves: ${state.moveCount}`;
}

function handleDirection(direction) {
  if (state.phase !== 'playing') return;

  if (direction === 'up' && !isGrounded(state.snake, state.tiles, state.height)) {
    return;
  }

  const head = state.snake[0];
  let nx = head.x, ny = head.y;

  if (direction === 'left') nx--;
  else if (direction === 'right') nx++;
  else if (direction === 'up') ny--;
  else if (direction === 'down') ny++;

  const willEat = state.tiles[ny]?.[nx] === FOOD;

  state = processInput(state, direction);

  if (willEat && state.phase !== 'dead') {
    spawnParticles(nx, ny);
  }

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
    if (below < height && tiles[below] && tiles[below][segment.x] === SOLID) {
      return true;
    }
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

    if (direction) {
      handleDirection(direction);
    }
  }
}

function handleTouchStart(e) {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}

function handleTouchEnd(e) {
  if (touchStartX === null || touchStartY === null) return;

  const touchEndX = e.changedTouches[0].clientX;
  const touchEndY = e.changedTouches[0].clientY;
  const deltaX = touchEndX - touchStartX;
  const deltaY = touchEndY - touchStartY;

  const absDeltaX = Math.abs(deltaX);
  const absDeltaY = Math.abs(deltaY);
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
  selectedLevel = idx;
  screen = 'playing';
  state = initLevel(idx);

  const levelSelectHTML = containerEl.querySelector('#snp-ls-body');
  if (levelSelectHTML) {
    levelSelectHTML.remove();
  }

  const wrap = containerEl.querySelector('#snp-canvas-wrap');
  if (!wrap) {
    const hudDiv = document.createElement('div');
    hudDiv.id = 'snp-hud';
    hudDiv.innerHTML = `
      <button id="snp-back-btn" style="background:transparent; border:1px solid rgba(255,255,255,0.1); color:rgba(240,240,248,0.6); font-family:inherit; padding:4px 8px; font-size:0.7rem; cursor:pointer; border-radius:4px;">← LEVELS</button>
      <div class="snp-hud-center" style="flex:1; text-align:center;">
        <div class="snp-hud-level" style="color:#00ff88; font-weight:700;"></div>
        <div class="snp-hud-food" style="color:rgba(240,240,248,0.4); font-size:0.7rem;"></div>
      </div>
      <div class="snp-hud-moves"></div>
    `;
    containerEl.appendChild(hudDiv);

    const canvasWrap = document.createElement('div');
    canvasWrap.id = 'snp-canvas-wrap';
    canvasWrap.style.cssText = 'flex:1; display:flex; align-items:center; justify-content:center; overflow:hidden;';
    canvasEl = document.createElement('canvas');
    canvasEl.id = 'snp-canvas';
    canvasEl.style.cssText = 'display:block; image-rendering:pixelated;';
    canvasWrap.appendChild(canvasEl);
    containerEl.appendChild(canvasWrap);

    ctx = canvasEl.getContext('2d');

    hudDiv.querySelector('#snp-back-btn').addEventListener('click', showLevelSelect);
  }

  computeLayout();
  updateHUDContent();

  resizeObserverRef = new ResizeObserver(() => {
    computeLayout();
  });
  resizeObserverRef.observe(containerEl.querySelector('#snp-canvas-wrap'));

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

  buildLevelSelect();
}

function buildLevelSelect() {
  let html = '<div id="snp-ls-body" style="flex:1; overflow-y:auto; padding:16px; display:grid; grid-template-columns:repeat(auto-fill, minmax(140px,1fr)); gap:12px; align-content:start;">';

  for (let i = 0; i < LEVELS.length; i++) {
    const level = LEVELS[i];
    const unlocked = i === 0 || completedLevels.has(i - 1);
    const completed = completedLevels.has(i);
    const lockedClass = unlocked ? '' : ' snp-lc--locked';
    const doneClass = completed ? ' snp-lc--done' : '';

    html += `
      <div class="snp-lc${lockedClass}${doneClass}" data-level="${i}" style="background:rgba(10,10,15,0.9); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:12px; cursor:${unlocked?'pointer':'not-allowed'}; transition:all 0.2s ease;">
        <div class="snp-lc-num" style="font-size:2.2rem; font-weight:800; color:${unlocked?'#00ff88':'rgba(255,255,255,0.2)'}; line-height:1;">${i + 1}</div>
        <div class="snp-lc-name" style="font-size:0.65rem; letter-spacing:2px; color:rgba(240,240,248,0.6); text-transform:uppercase;">${level.name}</div>
        ${completed ? '<div class="snp-lc-check" style="position:absolute; top:8px; right:10px; font-size:1rem; color:#00ff88;">✓</div>' : ''}
      </div>
    `;
  }

  html += '</div>';
  containerEl.insertAdjacentHTML('beforeend', html);

  const body = containerEl.querySelector('#snp-ls-body');
  body.querySelectorAll('.snp-lc:not(.snp-lc--locked)').forEach(card => {
    card.addEventListener('click', () => {
      const idx = parseInt(card.dataset.level);
      startLevel(idx);
    });
  });
}

function startRAF() {
  function loop(now) {
    lastFrameTime = now;

    foodGlowPhase += 0.05;
    exitGlowPhase += 0.04;

    updateParticles();

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
    #snp-root { width:100%; height:100%; display:flex; flex-direction:column; background:#0a0a0f; font-family:'DM Mono',monospace; overflow:hidden; user-select:none; color:#f0f0f8; }
    #snp-header { display:flex; align-items:center; padding:10px 16px; background:rgba(0,0,0,0.4); border-bottom:1px solid rgba(0,255,136,0.1); flex-shrink:0; }
    #snp-title { margin-left:16px; font-size:0.85rem; font-weight:700; letter-spacing:3px; color:#00ff88; text-shadow:0 0 20px rgba(0,255,136,0.3); }
    #snp-hud { display:flex; align-items:center; justify-content:space-between; padding:8px 16px; background:rgba(0,0,0,0.3); border-bottom:1px solid rgba(255,255,255,0.05); flex-shrink:0; height:52px; font-size:0.72rem; }
    #snp-canvas-wrap { flex:1; display:flex; align-items:center; justify-content:center; overflow:hidden; }
    #snp-hint { flex-shrink:0; text-align:center; padding:6px; font-size:0.58rem; letter-spacing:0.1em; color:#484f58; background:rgba(0,0,0,0.3); border-top:1px solid rgba(255,255,255,0.04); }
    .snp-lc { position:relative; transition:all 0.2s ease; }
    .snp-lc:hover:not(.snp-lc--locked) { border-color:rgba(0,255,136,0.4)!important; transform:translateY(-3px); box-shadow:0 8px 24px rgba(0,255,136,0.1); }
    .snp-lc--done { border-color:rgba(0,255,136,0.3)!important; }
    body.layout-phone #snp-ls-body { grid-template-columns:repeat(2,1fr)!important; }
  `;
  document.head.appendChild(style);

  containerEl.innerHTML = `<div id="snp-root"><div id="snp-header"><div id="snp-title">SNAKE PUZZLE</div></div><div id="snp-hint">ARROWS / WASD to move · SWIPE on mobile</div></div>`;

  const root = containerEl.querySelector('#snp-root');

  if (optRef.initialSave) {
    completedLevels = new Set(optRef.initialSave.completedLevels || []);
  }

  keyHandlerRef = handleKey;
  document.addEventListener('keydown', keyHandlerRef);

  containerEl.addEventListener('touchstart', handleTouchStart);
  containerEl.addEventListener('touchend', handleTouchEnd);

  buildLevelSelect();
}

export function update() {
  // RAF loop handles updates
}

export function destroy() {
  stopRAF();

  document.removeEventListener('keydown', keyHandlerRef);
  containerEl.removeEventListener('touchstart', handleTouchStart);
  containerEl.removeEventListener('touchend', handleTouchEnd);

  if (resizeObserverRef) {
    resizeObserverRef.disconnect();
  }

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
