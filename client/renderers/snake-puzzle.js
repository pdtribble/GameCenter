import {
  LEVELS, EMPTY, SOLID, FOOD, EXIT,
  initLevel, processInput,
} from '../../games/snake-puzzle/index.js';

let state = null;
let containerEl = null;
let canvasEl = null;
let ctx = null;
let cellSize = 20;
let hudHeight = 60;

let keyHandlerRef = null;
let touchStartX = null;
let touchStartY = null;
let rafId = null;
let resizeObserverRef = null;

let optRef = {};

function computeLayout() {
  if (!containerEl) return;
  const wrap = containerEl.querySelector('#snp-canvas-wrap');
  if (!wrap) return;

  const W = wrap.clientWidth;
  const H = wrap.clientHeight - hudHeight;

  const cellsByWidth = Math.floor(W / (state.width + 2)); // +2 for padding
  const cellsByHeight = Math.floor(H / (state.height + 2));
  cellSize = Math.max(8, Math.min(cellsByWidth, cellsByHeight));

  canvasEl.width = state.width * cellSize;
  canvasEl.height = state.height * cellSize;
}

function drawFrame() {
  if (!ctx || !state) return;

  // Background
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);

  // Draw tiles
  for (let row = 0; row < state.height; row++) {
    for (let col = 0; col < state.width; col++) {
      const tile = state.tiles[row][col];
      const x = col * cellSize;
      const y = row * cellSize;

      if (tile === SOLID) {
        ctx.fillStyle = '#404050';
        ctx.fillRect(x, y, cellSize, cellSize);
        ctx.strokeStyle = '#606070';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, cellSize, cellSize);
      } else if (tile === FOOD) {
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(x + cellSize / 2, y + cellSize / 2, cellSize / 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (tile === EXIT) {
        ctx.fillStyle = '#00ff88';
        ctx.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, cellSize, cellSize);
      }
    }
  }

  // Draw snake
  const snakeLen = state.snake.length;
  for (let i = 0; i < snakeLen; i++) {
    const segment = state.snake[i];
    const x = segment.x * cellSize;
    const y = segment.y * cellSize;

    if (i === 0) {
      // Head: bright green
      ctx.fillStyle = '#00ff44';
    } else {
      // Body: gradient from head to tail
      const ratio = i / snakeLen;
      const green = Math.floor(255 - ratio * 200);
      ctx.fillStyle = `rgb(0, ${green}, 50)`;
    }

    ctx.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
  }

  // Draw HUD (overlay on top in container)
  // (HUD is drawn in HTML, not on canvas)

  // Game over overlays
  if (state.phase === 'won') {
    ctx.fillStyle = 'rgba(0, 255, 136, 0.2)';
    ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.fillStyle = '#00ff88';
    ctx.font = `bold ${cellSize * 2}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LEVEL COMPLETE!', canvasEl.width / 2, canvasEl.height / 2);
    ctx.font = `${cellSize}px Arial`;
    ctx.fillText('Press N for next, R to retry', canvasEl.width / 2, canvasEl.height / 2 + cellSize * 2.5);
  } else if (state.phase === 'dead') {
    ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
    ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.fillStyle = '#ff4444';
    ctx.font = `bold ${cellSize * 2}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('YOU DIED', canvasEl.width / 2, canvasEl.height / 2);
    ctx.font = `${cellSize}px Arial`;
    ctx.fillText('Press R to retry', canvasEl.width / 2, canvasEl.height / 2 + cellSize * 2.5);
  }
}

function updateHUD() {
  const hudEl = containerEl.querySelector('#snp-hud');
  if (hudEl) {
    const levelNumber = state.levelIndex + 1;
    const totalLevels = LEVELS.length;
    const length = state.snake.length;
    const moves = state.moveCount;
    hudEl.textContent = `${state.levelName} | Length: ${length} | Moves: ${moves}`;
  }
}

function handleKey(e) {
  if (state.phase === 'won') {
    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      if (state.levelIndex < LEVELS.length - 1) {
        state = initLevel(state.levelIndex + 1);
        computeLayout();
        updateHUD();
      }
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      state = initLevel(state.levelIndex);
      updateHUD();
    }
  } else if (state.phase === 'dead') {
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      state = initLevel(state.levelIndex);
      updateHUD();
    }
  } else if (state.phase === 'playing') {
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
      state = processInput(state, direction);
      updateHUD();

      // Save on win
      if (state.phase === 'won' && optRef.onSave) {
        const completed = Array.from({ length: state.levelIndex + 1 }, (_, i) => i);
        optRef.onSave('progress', {
          currentLevel: state.levelIndex,
          completedLevels: completed,
          bestMoves: state.moveCount,
        });
      }
    }
  }

  // Global
  if (e.key === 'Escape') {
    e.preventDefault();
    if (optRef.navigate) optRef.navigate('singleplayer');
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

function destroy() {
  if (keyHandlerRef) {
    document.removeEventListener('keydown', keyHandlerRef);
  }
  if (containerEl) {
    containerEl.removeEventListener('touchstart', handleTouchStart);
    containerEl.removeEventListener('touchend', handleTouchEnd);
  }
  if (rafId) {
    cancelAnimationFrame(rafId);
  }
  if (resizeObserverRef) {
    resizeObserverRef.disconnect();
  }

  // Remove injected style
  const style = document.querySelector('#snp-style');
  if (style) style.remove();

  // Clear canvas
  if (canvasEl) canvasEl.width = canvasEl.height = 0;

  // Clear references
  state = null;
  containerEl = null;
  canvasEl = null;
  ctx = null;
}

export function render(container, options) {
  containerEl = container;
  optRef = options || {};

  // Inject style
  const style = document.createElement('style');
  style.id = 'snp-style';
  style.textContent = `
    #snp-root {
      width: 100%; height: 100%;
      display: flex; flex-direction: column;
      background: #0a0a0f; color: #fff; font-family: monospace;
    }
    #snp-hud {
      flex-shrink: 0; height: ${hudHeight}px;
      display: flex; align-items: center; justify-content: center;
      background: #12121a; border-bottom: 1px solid #404050;
      font-size: 18px; font-weight: bold;
    }
    #snp-canvas-wrap {
      flex: 1; display: flex; align-items: center; justify-content: center;
      overflow: hidden;
    }
    #snp-canvas {
      max-width: 100%; max-height: 100%;
      image-rendering: pixelated;
      image-rendering: crisp-edges;
    }
  `;
  document.head.appendChild(style);

  // Build HTML
  containerEl.innerHTML = `
    <div id="snp-root">
      <div id="snp-hud"></div>
      <div id="snp-canvas-wrap">
        <canvas id="snp-canvas"></canvas>
      </div>
    </div>
  `;

  const root = containerEl.querySelector('#snp-root');
  canvasEl = containerEl.querySelector('#snp-canvas');
  ctx = canvasEl.getContext('2d');

  // Restore from saved progress if available
  let startLevel = 0;
  if (optRef.initialSave) {
    startLevel = optRef.initialSave.currentLevel || 0;
  }
  state = initLevel(startLevel);

  // Set up resize observer
  const wrap = containerEl.querySelector('#snp-canvas-wrap');
  computeLayout();

  resizeObserverRef = new ResizeObserver(() => {
    computeLayout();
    drawFrame();
  });
  resizeObserverRef.observe(wrap);

  // Set up keyboard
  keyHandlerRef = handleKey;
  document.addEventListener('keydown', keyHandlerRef);

  // Set up touch
  containerEl.addEventListener('touchstart', handleTouchStart);
  containerEl.addEventListener('touchend', handleTouchEnd);

  // Initial draw
  updateHUD();
  drawFrame();

  // RAF loop
  (function rafLoop() {
    drawFrame();
    rafId = requestAnimationFrame(rafLoop);
  })();
}
