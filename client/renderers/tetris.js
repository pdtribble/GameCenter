// Tetris renderer — canvas-based arcade aesthetic
// Imports pure logic from games/tetris/index.js

import {
  COLS, ROWS,
  initGame,
  moveLeft, moveRight, moveDown, hardDrop,
  rotate, holdPiece,
  getGhostPiece,
  getDropInterval,
} from '../../games/tetris/index.js';

// ── Constants ────────────────────────────────────────────────────────────────

// Color by index 1-7: I=cyan, O=yellow, T=purple, S=green, Z=red, L=orange, J=blue
const COLORS = [
  '',           // 0 = empty
  '#00cfcf',   // 1 = I (cyan)
  '#cfcf00',   // 2 = O (yellow)
  '#9f00cf',   // 3 = T (purple)
  '#00cf00',   // 4 = S (green)
  '#cf0000',   // 5 = Z (red)
  '#cf6f00',   // 6 = L (orange)
  '#0000cf',   // 7 = J (blue)
];

// Brighter highlight color for top-left bevel edge (1-7)
const COLORS_LIGHT = [
  '',
  '#40ffff',
  '#ffff40',
  '#cf60ff',
  '#40ff40',
  '#ff4040',
  '#ffaa40',
  '#4040ff',
];

// Darker shadow color for bottom-right bevel edge (1-7)
const COLORS_DARK = [
  '',
  '#006f6f',
  '#6f6f00',
  '#50006f',
  '#006f00',
  '#6f0000',
  '#6f3000',
  '#00006f',
];

// ── Module-level state ────────────────────────────────────────────────────────

let containerEl   = null;
let canvas        = null;
let ctx           = null;
let state         = null;
let rng           = null;
let optRef        = null;
let playerId      = null;
let highScore     = 0;
let styleTag      = null;

// Layout computed by computeLayout()
let cellSize      = 0;
let boardX        = 0;   // canvas pixel x of board left edge
let boardY        = 0;   // canvas pixel y of board top edge
let holdX         = 0;   // canvas pixel x of hold panel left
let holdY         = 0;
let nextX         = 0;   // canvas pixel x of next panel left
let nextY         = 0;
let statsX        = 0;   // canvas pixel x of stats text
let statsY        = 0;
let panelCellSize = 0;   // cell size for mini panels

// Animation
let rafId         = null;
let gravityId     = null;
let flashTimer    = 0;    // ms remaining for line-clear flash
let lastFrameTime = 0;

// Input
let keyHandler    = null;
let touchStartX   = 0;
let touchStartY   = 0;
let touchStartT   = 0;
let touchMovedFar = false;
let touchStartHandler   = null;
let touchMoveHandler    = null;
let touchEndHandler     = null;

// ResizeObserver
let roRef = null;

// ── RNG ──────────────────────────────────────────────────────────────────────

function mulberry32(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── CSS injection ─────────────────────────────────────────────────────────────

function injectStyles() {
  if (document.getElementById('tr-styles')) {
    styleTag = document.getElementById('tr-styles');
    return;
  }
  styleTag = document.createElement('style');
  styleTag.id = 'tr-styles';
  styleTag.textContent = `
    :root {
      --tr-bg:      #0d1117;
      --tr-surface: #161b22;
      --tr-border:  #30363d;
      --tr-accent:  #58a6ff;
      --tr-gold:    #d29922;
      --tr-red:     #f85149;
      --tr-green:   #3fb950;
      --tr-font:    'DM Mono','Courier New',monospace;
    }

    #tr-root {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      background: var(--tr-bg);
      font-family: var(--tr-font);
      color: #c9d1d9;
      overflow: hidden;
      user-select: none;
      -webkit-user-select: none;
    }

    #tr-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      background: var(--tr-surface);
      border-bottom: 1px solid var(--tr-border);
      flex-shrink: 0;
    }

    #tr-back {
      background: transparent;
      border: 1px solid var(--tr-border);
      color: #8b949e;
      font-family: var(--tr-font);
      font-size: 0.72rem;
      padding: 6px 12px;
      cursor: pointer;
      letter-spacing: 0.05em;
      border-radius: 6px;
      transition: border-color 0.15s, color 0.15s;
    }
    #tr-back:hover {
      border-color: var(--tr-accent);
      color: var(--tr-accent);
    }

    #tr-title {
      font-size: 0.82rem;
      font-weight: 700;
      letter-spacing: 0.14em;
      color: var(--tr-accent);
      text-transform: uppercase;
    }

    #tr-new {
      margin-left: auto;
      background: transparent;
      border: 1px solid var(--tr-border);
      color: #8b949e;
      font-family: var(--tr-font);
      font-size: 0.68rem;
      padding: 6px 12px;
      cursor: pointer;
      letter-spacing: 0.05em;
      border-radius: 6px;
      transition: border-color 0.15s, color 0.15s;
    }
    #tr-new:hover {
      border-color: var(--tr-accent);
      color: var(--tr-accent);
    }

    #tr-canvas-wrap {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: hidden;
      background: radial-gradient(ellipse at center, rgba(88,166,255,0.04) 0%, transparent 70%), var(--tr-bg);
    }

    #tr-canvas {
      display: block;
      image-rendering: pixelated;
    }

    #tr-overlay {
      position: absolute;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      background: rgba(13,17,23,0.88);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      z-index: 10;
    }
    #tr-overlay.tr-overlay-show {
      display: flex;
    }

    .tr-overlay-inner {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      padding: 32px 40px;
      background: var(--tr-surface);
      border: 1px solid var(--tr-border);
      border-radius: 12px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.5);
      text-align: center;
    }

    #tr-overlay-title {
      font-size: clamp(1.2rem, 4vw, 2rem);
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    #tr-overlay-title.ready { color: var(--tr-accent); text-shadow: 0 0 30px rgba(88,166,255,0.4); }
    #tr-overlay-title.over  { color: var(--tr-red);    text-shadow: 0 0 30px rgba(248,81,73,0.4); }

    #tr-overlay-sub {
      font-size: 0.78rem;
      color: #8b949e;
      letter-spacing: 0.06em;
    }

    #tr-overlay-score {
      font-size: 1rem;
      font-weight: 700;
      color: #c9d1d9;
      letter-spacing: 0.04em;
    }

    #tr-overlay-best {
      font-size: 0.82rem;
      color: var(--tr-gold);
      letter-spacing: 0.04em;
    }
    #tr-overlay-best.tr-new-hs {
      animation: tr-hs-flash 0.35s ease 3;
    }
    @keyframes tr-hs-flash {
      0%,100% { color: var(--tr-gold); }
      50%      { color: #fff; text-shadow: 0 0 20px rgba(210,153,34,0.9); }
    }

    .tr-overlay-buttons {
      display: flex;
      gap: 10px;
      margin-top: 6px;
    }

    .tr-overlay-btn {
      background: transparent;
      border: 1px solid var(--tr-border);
      color: #8b949e;
      font-family: var(--tr-font);
      font-size: 0.75rem;
      font-weight: 600;
      padding: 8px 20px;
      cursor: pointer;
      letter-spacing: 0.06em;
      border-radius: 8px;
      transition: all 0.15s, transform 0.1s;
    }
    .tr-overlay-btn:active { transform: scale(0.96); }

    #tr-overlay-btn-play {
      background: var(--tr-accent);
      border-color: var(--tr-accent);
      color: #0d1117;
    }
    #tr-overlay-btn-play:hover {
      background: #79c0ff;
      border-color: #79c0ff;
      transform: translateY(-2px);
      box-shadow: 0 4px 16px rgba(88,166,255,0.4);
    }

    #tr-overlay-btn-back:hover {
      border-color: var(--tr-accent);
      color: var(--tr-accent);
    }

    #tr-hint {
      flex-shrink: 0;
      text-align: center;
      padding: 8px 16px;
      font-size: 0.58rem;
      letter-spacing: 0.1em;
      color: #484f58;
      background: var(--tr-surface);
      border-top: 1px solid var(--tr-border);
    }
  `;
  document.head.appendChild(styleTag);
}

// ── Layout computation ────────────────────────────────────────────────────────

function computeLayout() {
  if (!canvas) return;

  const wrap = containerEl.querySelector('#tr-canvas-wrap');
  if (!wrap) return;

  const wrapW = wrap.clientWidth;
  const wrapH = wrap.clientHeight;

  // Cell size: fill 90% of height across ROWS, and ~50% of width across COLS
  // Left panel: 4 cells wide, right panel: 5 cells wide, board: 10 cells
  // Total: 19 cells wide + gaps
  const byHeight = Math.floor((wrapH * 0.92) / ROWS);
  const byWidth  = Math.floor((wrapW * 0.88) / (COLS + 10)); // 10 = 4 hold + 1 gap + 5 next
  cellSize = Math.max(14, Math.min(byHeight, byWidth, 32));

  panelCellSize = Math.max(10, Math.floor(cellSize * 0.85));

  const holdPanelW  = 4 * cellSize;
  const boardW      = COLS * cellSize;
  const nextPanelW  = 5 * cellSize;
  const gap         = Math.round(cellSize * 0.5);

  const totalW = holdPanelW + gap + boardW + gap + nextPanelW;
  const totalH = ROWS * cellSize;

  const canvasW = totalW;
  const canvasH = totalH;

  canvas.width  = canvasW;
  canvas.height = canvasH;

  boardX = holdPanelW + gap;
  boardY = 0;

  holdX = 0;
  holdY = 0;

  nextX = boardX + boardW + gap;
  nextY = 0;

  statsX = nextX;
  statsY = Math.round(cellSize * 5);
}

// ── Drawing primitives ────────────────────────────────────────────────────────

// Draw a single bevel-shaded Tetris block at canvas pixel position (px, py)
function drawBlock(px, py, cs, colorIdx, alpha) {
  if (!ctx) return;

  const base  = COLORS[colorIdx]      || '#333';
  const light = COLORS_LIGHT[colorIdx] || '#666';
  const dark  = COLORS_DARK[colorIdx]  || '#111';
  const bevel = Math.max(2, Math.floor(cs * 0.12));

  ctx.globalAlpha = alpha !== undefined ? alpha : 1;

  // Main face
  ctx.fillStyle = base;
  ctx.fillRect(px, py, cs, cs);

  // Top-left highlight (bevel)
  ctx.fillStyle = light;
  ctx.fillRect(px, py, cs, bevel);           // top edge
  ctx.fillRect(px, py, bevel, cs);           // left edge

  // Bottom-right shadow (bevel)
  ctx.fillStyle = dark;
  ctx.fillRect(px, py + cs - bevel, cs, bevel);   // bottom edge
  ctx.fillRect(px + cs - bevel, py, bevel, cs);   // right edge

  ctx.globalAlpha = 1;
}

// Draw a mini block for HOLD / NEXT panels
function drawMiniBlock(px, py, colorIdx) {
  drawBlock(px, py, panelCellSize, colorIdx, 1);
}

// Draw an empty cell grid line
function drawEmptyCell(col, row) {
  const px = boardX + col * cellSize;
  const py = boardY + row * cellSize;
  ctx.strokeStyle = '#1a1a2e';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(px + 0.5, py + 0.5, cellSize - 1, cellSize - 1);
}

// Draw a piece's cells given absolute board {x, y} coordinates
function drawPieceCells(cells, colorIdx, alpha) {
  for (const c of cells) {
    if (c.y < 0) continue;
    const px = boardX + c.x * cellSize;
    const py = boardY + c.y * cellSize;
    drawBlock(px, py, cellSize, colorIdx, alpha);
  }
}

// ── Panel label helper ────────────────────────────────────────────────────────

function drawPanelLabel(text, px, py) {
  ctx.font = `600 ${Math.max(8, Math.floor(cellSize * 0.38))}px 'DM Mono', monospace`;
  ctx.fillStyle = '#484f58';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(text, px, py);
}

// Draw a mini piece centered in a bounding box
function drawMiniPiece(piece, centerX, centerY) {
  if (!piece) return;

  const cs = panelCellSize;
  const cells = piece.cells;

  // Find bounding box of piece cells
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const c of cells) {
    minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
  }
  const pw = (maxX - minX + 1) * cs;
  const ph = (maxY - minY + 1) * cs;
  const startX = Math.round(centerX - pw / 2);
  const startY = Math.round(centerY - ph / 2);

  for (const c of cells) {
    const px = startX + (c.x - minX) * cs;
    const py = startY + (c.y - minY) * cs;
    drawMiniBlock(px, py, piece.color);
  }
}

// ── Main draw routines ────────────────────────────────────────────────────────

function drawBackground() {
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawBoardOutline() {
  const boardW = COLS * cellSize;
  const boardH = ROWS * cellSize;
  ctx.strokeStyle = '#30363d';
  ctx.lineWidth = 2;
  ctx.strokeRect(boardX - 1, boardY - 1, boardW + 2, boardH + 2);
}

function drawBoard() {
  if (!state) return;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const colorIdx = state.board[r][c];
      if (colorIdx === 0) {
        drawEmptyCell(c, r);
      } else {
        const px = boardX + c * cellSize;
        const py = boardY + r * cellSize;
        drawBlock(px, py, cellSize, colorIdx);
      }
    }
  }
}

function drawGhost() {
  if (!state || state.phase !== 'playing') return;
  const ghostCells = getGhostPiece(state);
  const colorIdx = state.current.color;
  for (const c of ghostCells) {
    if (c.y < 0) continue;
    const px = boardX + c.x * cellSize;
    const py = boardY + c.y * cellSize;
    // Ghost: very faint fill + faint outline of piece color
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = COLORS[colorIdx] || '#fff';
    ctx.fillRect(px, py, cellSize, cellSize);
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = COLORS[colorIdx] || '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, cellSize - 1, cellSize - 1);
    ctx.globalAlpha = 1;
  }
}

function drawCurrentPiece() {
  if (!state || state.phase !== 'playing') return;
  const piece = state.current;
  const absCells = piece.cells.map(c => ({ x: piece.x + c.x, y: piece.y + c.y }));
  drawPieceCells(absCells, piece.color, 1);
}

function drawHoldPanel() {
  if (!state) return;

  const panelW = 4 * cellSize;
  const labelY = holdY + Math.floor(cellSize * 0.25);

  // Panel background
  ctx.fillStyle = '#161b22';
  ctx.fillRect(holdX, holdY, panelW, Math.floor(cellSize * 3.5));
  ctx.strokeStyle = '#21262d';
  ctx.lineWidth = 1;
  ctx.strokeRect(holdX, holdY, panelW, Math.floor(cellSize * 3.5));

  drawPanelLabel('HOLD', holdX + Math.floor(cellSize * 0.2), labelY);

  if (state.held) {
    const centerX = holdX + panelW / 2;
    const centerY = holdY + Math.floor(cellSize * 2.1);
    const alpha = state.canHold ? 1 : 0.35;
    ctx.globalAlpha = alpha;
    drawMiniPiece(state.held, centerX, centerY);
    ctx.globalAlpha = 1;
  }
}

function drawNextPanel() {
  if (!state) return;

  const panelW = 5 * cellSize;
  const labelY = nextY + Math.floor(cellSize * 0.25);

  // Panel background
  ctx.fillStyle = '#161b22';
  ctx.fillRect(nextX, nextY, panelW, Math.floor(cellSize * 3.5));
  ctx.strokeStyle = '#21262d';
  ctx.lineWidth = 1;
  ctx.strokeRect(nextX, nextY, panelW, Math.floor(cellSize * 3.5));

  drawPanelLabel('NEXT', nextX + Math.floor(cellSize * 0.2), labelY);

  if (state.next) {
    const centerX = nextX + panelW / 2;
    const centerY = nextY + Math.floor(cellSize * 2.1);
    drawMiniPiece(state.next, centerX, centerY);
  }
}

function drawStats() {
  if (!state) return;

  const panelW = 5 * cellSize;
  const fs   = Math.max(8, Math.floor(cellSize * 0.38));
  const valFs = Math.max(10, Math.floor(cellSize * 0.55));
  const lineH = Math.floor(cellSize * 0.95);

  const sections = [
    { label: 'SCORE', value: String(state.score) },
    { label: 'BEST',  value: String(highScore) },
    { label: 'LEVEL', value: String(state.level) },
    { label: 'LINES', value: String(state.lines) },
  ];

  let y = statsY + Math.floor(cellSize * 0.4);

  for (const sec of sections) {
    // Section background
    ctx.fillStyle = '#161b22';
    ctx.fillRect(statsX, y, panelW, Math.floor(lineH * 1.6));
    ctx.strokeStyle = '#21262d';
    ctx.lineWidth = 1;
    ctx.strokeRect(statsX, y, panelW, Math.floor(lineH * 1.6));

    // Label
    ctx.font = `600 ${fs}px 'DM Mono', monospace`;
    ctx.fillStyle = '#484f58';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(sec.label, statsX + Math.floor(cellSize * 0.2), y + Math.floor(lineH * 0.18));

    // Value
    ctx.font = `700 ${valFs}px 'DM Mono', monospace`;
    ctx.fillStyle = sec.label === 'BEST' ? '#d29922' : '#c9d1d9';
    ctx.fillText(sec.value, statsX + Math.floor(cellSize * 0.2), y + Math.floor(lineH * 0.7));

    y += Math.floor(lineH * 1.6) + Math.floor(cellSize * 0.25);
  }

  // Combo display
  if (state.combo > 1) {
    ctx.font = `700 ${Math.max(8, Math.floor(cellSize * 0.42))}px 'DM Mono', monospace`;
    ctx.fillStyle = '#f0c040';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`${state.combo}x COMBO`, statsX + Math.floor(cellSize * 0.2), y + Math.floor(cellSize * 0.2));
  }
}

function drawLineClearFlash() {
  if (flashTimer <= 0) return;
  const intensity = Math.min(1, flashTimer / 80);
  ctx.globalAlpha = intensity * 0.55;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(boardX, boardY, COLS * cellSize, ROWS * cellSize);
  ctx.globalAlpha = 1;
}

function drawFrame(now) {
  if (!ctx || !canvas) return;

  // Update flash timer
  if (lastFrameTime > 0 && flashTimer > 0) {
    const dt = now - lastFrameTime;
    flashTimer = Math.max(0, flashTimer - dt);
  }
  lastFrameTime = now;

  drawBackground();
  drawBoardOutline();
  drawBoard();
  drawGhost();
  drawCurrentPiece();
  drawHoldPanel();
  drawNextPanel();
  drawStats();
  drawLineClearFlash();
}

// ── Animation loop ────────────────────────────────────────────────────────────

function rafLoop(now) {
  drawFrame(now);
  rafId = requestAnimationFrame(rafLoop);
}

function startRaf() {
  if (rafId !== null) return;
  lastFrameTime = 0;
  rafId = requestAnimationFrame(rafLoop);
}

function stopRaf() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

// ── Gravity ───────────────────────────────────────────────────────────────────

function stopGravity() {
  if (gravityId !== null) {
    clearInterval(gravityId);
    gravityId = null;
  }
}

function startGravity() {
  stopGravity();
  if (!state || state.phase !== 'playing') return;
  const interval = getDropInterval(state.level);
  gravityId = setInterval(gravityTick, interval);
}

function gravityTick() {
  if (!state || state.phase !== 'playing') return;

  const prevLevel = state.level;
  const prevLastClear = state.lastClear;
  const prevScore = state.score;

  state = moveDown(state, rng);

  // Line clear flash
  if (state.lastClear && state.lastClear !== prevLastClear) {
    flashTimer = 150;
  }

  // Level up — restart gravity at new speed
  if (state.level !== prevLevel) {
    startGravity();
  }

  // Live high score tracking - save immediately when surpassed
  if (state.score > highScore) {
    highScore = state.score;
    saveHighScore(state.score);
  }

  if (state.phase === 'over') {
    onGameOver();
  }
}

  // Level up — restart gravity at new speed
  if (state.level !== prevLevel) {
    startGravity();
  }

  if (state.phase === 'over') {
    onGameOver();
  }
}

// ── Game flow ──────────────────────────────────────────────────────────────────

function onGameOver() {
  stopGravity();

  const isNewHS = state.score > highScore;

  showOverlay('over', isNewHS);
}

function startGame() {
  state = { ...state, phase: 'playing' };
  hideOverlay();
  startGravity();
  startRaf();
}

function restartGame() {
  stopGravity();
  rng = mulberry32((Date.now() ^ (Math.random() * 0x7fffffff | 0)) >>> 0);
  state = { ...initGame(rng), phase: 'playing' };
  hideOverlay();
  startGravity();
  if (rafId === null) startRaf();
}

// ── Overlay ───────────────────────────────────────────────────────────────────

function showOverlay(phase, isNewHS) {
  const overlay = containerEl.querySelector('#tr-overlay');
  if (!overlay) return;

  const titleEl    = overlay.querySelector('#tr-overlay-title');
  const subEl      = overlay.querySelector('#tr-overlay-sub');
  const scoreEl    = overlay.querySelector('#tr-overlay-score');
  const bestEl     = overlay.querySelector('#tr-overlay-best');
  const playBtn    = overlay.querySelector('#tr-overlay-btn-play');
  const backBtn    = overlay.querySelector('#tr-overlay-btn-back');

  if (phase === 'ready') {
    titleEl.textContent = 'TETRIS';
    titleEl.className = 'ready';
    subEl.textContent  = 'PRESS ANY KEY OR TAP TO START';
    scoreEl.textContent = '';
    bestEl.textContent  = highScore > 0 ? `BEST  ${highScore}` : '';
    bestEl.className    = '';
    playBtn.textContent = 'START GAME';
    backBtn.textContent = '← BACK';
  } else {
    titleEl.textContent = 'GAME OVER';
    titleEl.className = 'over';
    subEl.textContent  = isNewHS ? 'NEW HIGH SCORE!' : '';
    scoreEl.textContent = `SCORE  ${state ? state.score : 0}`;
    bestEl.textContent  = `BEST   ${highScore}`;
    bestEl.className    = isNewHS ? 'tr-new-hs' : '';
    playBtn.textContent = 'PLAY AGAIN';
    backBtn.textContent = '← BACK';

    if (isNewHS) {
      // Remove and re-add class to restart animation
      bestEl.classList.remove('tr-new-hs');
      // Force reflow
      void bestEl.offsetWidth;
      bestEl.classList.add('tr-new-hs');
    }
  }

  overlay.classList.add('tr-overlay-show');
}

function hideOverlay() {
  const overlay = containerEl.querySelector('#tr-overlay');
  if (overlay) overlay.classList.remove('tr-overlay-show');
}

// ── Keyboard input ────────────────────────────────────────────────────────────

function handleKey(e) {
  if (!state) return;

  // Phase-agnostic keys
  if (e.key === 'Escape') {
    if (optRef?.navigate) optRef.navigate('singleplayer');
    return;
  }

  // Ready or over: any key starts/restarts
  if (state.phase === 'ready') {
    const ignored = ['Tab', 'CapsLock', 'Shift', 'Control', 'Alt', 'Meta', 'F5', 'F11', 'F12'];
    if (!ignored.includes(e.key)) {
      e.preventDefault();
      startGame();
    }
    return;
  }

  if (state.phase === 'over') {
    const ignored = ['Tab', 'CapsLock', 'Shift', 'Control', 'Alt', 'Meta', 'F5', 'F11', 'F12'];
    if (!ignored.includes(e.key)) {
      e.preventDefault();
      restartGame();
    }
    return;
  }

  if (state.phase !== 'playing') return;

  let consumed = true;
  const prevLevel = state.level;
  const prevLastClear = state.lastClear;

  switch (e.key) {
    case 'ArrowLeft':
    case 'a':
    case 'A':
      state = moveLeft(state);
      break;
    case 'ArrowRight':
    case 'd':
    case 'D':
      state = moveRight(state);
      break;
    case 'ArrowDown':
    case 's':
    case 'S':
      state = moveDown(state, rng);
      break;
    case 'ArrowUp':
    case 'w':
    case 'W':
      state = rotate(state, 'cw');
      break;
    case 'z':
    case 'Z':
      state = rotate(state, 'ccw');
      break;
    case ' ':
      state = hardDrop(state, rng);
      break;
    case 'c':
    case 'C':
    case 'Shift':
      state = holdPiece(state, rng);
      break;
    default:
      consumed = false;
  }

  if (consumed) {
    e.preventDefault();

    if (state.lastClear && state.lastClear !== prevLastClear) {
      flashTimer = 150;
    }
    if (state.level !== prevLevel) {
      startGravity();
    }

    // Live high score tracking - save immediately when surpassed
    if (state.score > highScore) {
      highScore = state.score;
      saveHighScore(state.score);
    }

    if (state.phase === 'over') {
      onGameOver();
    }
  }
}

// ── Touch input ───────────────────────────────────────────────────────────────

function onTouchStart(e) {
  const t = e.touches[0];
  touchStartX = t.clientX;
  touchStartY = t.clientY;
  touchStartT = Date.now();
  touchMovedFar = false;
}

function onTouchMove(e) {
  if (!e.touches[0]) return;
  const dx = Math.abs(e.touches[0].clientX - touchStartX);
  const dy = Math.abs(e.touches[0].clientY - touchStartY);
  if (dx > 12 || dy > 12) touchMovedFar = true;
}

function onTouchEnd(e) {
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;
  const dt = Date.now() - touchStartT;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  // Phase transitions
  if (state) {
    if (state.phase === 'ready') { startGame(); return; }
    if (state.phase === 'over')  { restartGame(); return; }
    if (state.phase !== 'playing') return;
  }

  const SWIPE_THRESH = 30;

  if (!touchMovedFar && dt < 300) {
    // Tap — rotate cw
    state = rotate(state, 'cw');
    return;
  }

  if (absDx > absDy && absDx > SWIPE_THRESH) {
    // Horizontal swipe
    state = dx > 0 ? moveRight(state) : moveLeft(state);
  } else if (absDy > absDx && absDy > SWIPE_THRESH) {
    if (dy > 0) {
      // Swipe down — hard drop
      const prevLastClear = state.lastClear;
      state = hardDrop(state, rng);
      if (state.lastClear && state.lastClear !== prevLastClear) flashTimer = 150;
      if (state.phase === 'over') { onGameOver(); return; }
    } else {
      // Swipe up — rotate cw
      state = rotate(state, 'cw');
    }
  }

  if (state && state.phase === 'over') onGameOver();
}

// ── High score persistence ─────────────────────────────────────────────────────

function saveHighScore(score) {
  // Server save
  fetch('/api/sp/saves/tetris', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slot: 'highscore', data: { highScore: score } }),
  }).catch(() => {});

  // localStorage fallback
  localStorage.setItem('tetris_hs', String(score));
}

function loadLocalHighScore() {
  const stored = localStorage.getItem('tetris_hs');
  return stored ? parseInt(stored, 10) : 0;
}

// ── ResizeObserver ─────────────────────────────────────────────────────────────

function setupResizeObserver() {
  const wrap = containerEl.querySelector('#tr-canvas-wrap');
  if (!wrap) return;
  roRef = new ResizeObserver(() => {
    computeLayout();
  });
  roRef.observe(wrap);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function render(container, options) {
  optRef     = options || {};
  containerEl = container;
  playerId   = options?.playerId || null;

  // Load high score: initialSave takes priority, then localStorage
  highScore = options?.initialSave?.highscore?.highScore ?? loadLocalHighScore();

  injectStyles();

  container.innerHTML = `
    <div id="tr-root">
      <div id="tr-header">
        <button id="tr-back">← SOLO</button>
        <div id="tr-title">TETRIS</div>
        <button id="tr-new">NEW GAME</button>
      </div>
      <div id="tr-canvas-wrap">
        <canvas id="tr-canvas"></canvas>
        <div id="tr-overlay">
          <div class="tr-overlay-inner">
            <div id="tr-overlay-title" class="ready">TETRIS</div>
            <div id="tr-overlay-sub">PRESS ANY KEY OR TAP TO START</div>
            <div id="tr-overlay-score"></div>
            <div id="tr-overlay-best"></div>
            <div class="tr-overlay-buttons">
              <button class="tr-overlay-btn" id="tr-overlay-btn-play">START GAME</button>
              <button class="tr-overlay-btn" id="tr-overlay-btn-back">← BACK</button>
            </div>
          </div>
        </div>
      </div>
      <div id="tr-hint">ARROWS/WASD · SPACE=DROP · C/SHIFT=HOLD · Z=CCW · SWIPE ON MOBILE</div>
    </div>`;

  canvas = container.querySelector('#tr-canvas');
  ctx    = canvas.getContext('2d');

  // Single delegated click listener on root
  container.querySelector('#tr-root').addEventListener('click', e => {
    const id = e.target.id || (e.target.closest('[id]') || {}).id;
    if (id === 'tr-back' || id === 'tr-overlay-btn-back') {
      if (optRef?.navigate) optRef.navigate('singleplayer');
    } else if (id === 'tr-new') {
      restartGame();
    } else if (id === 'tr-overlay-btn-play') {
      if (!state || state.phase === 'ready') startGame();
      else restartGame();
    }
  });

  // Wire keyboard
  keyHandler = handleKey;
  document.addEventListener('keydown', keyHandler);

  // Wire touch on canvas wrap
  const wrap = container.querySelector('#tr-canvas-wrap');
  touchStartHandler = onTouchStart;
  touchMoveHandler  = onTouchMove;
  touchEndHandler   = onTouchEnd;
  wrap.addEventListener('touchstart', touchStartHandler, { passive: true });
  wrap.addEventListener('touchmove',  touchMoveHandler,  { passive: true });
  wrap.addEventListener('touchend',   touchEndHandler,   { passive: false });

  // Init game state
  rng   = mulberry32((Date.now() ^ (Math.random() * 0x7fffffff | 0)) >>> 0);
  state = initGame(rng);
  // state.phase is 'ready' from initGame

  // Setup layout and start rendering
  setupResizeObserver();
  computeLayout();
  showOverlay('ready', false);
  startRaf();
}

export function destroy() {
  stopGravity();
  stopRaf();

  if (keyHandler) {
    document.removeEventListener('keydown', keyHandler);
    keyHandler = null;
  }

  if (containerEl) {
    const wrap = containerEl.querySelector('#tr-canvas-wrap');
    if (wrap) {
      if (touchStartHandler) wrap.removeEventListener('touchstart', touchStartHandler);
      if (touchMoveHandler)  wrap.removeEventListener('touchmove',  touchMoveHandler);
      if (touchEndHandler)   wrap.removeEventListener('touchend',   touchEndHandler);
    }
  }

  if (roRef) {
    roRef.disconnect();
    roRef = null;
  }

  if (styleTag) {
    styleTag.remove();
    styleTag = null;
  }

  if (containerEl) {
    containerEl.innerHTML = '';
    containerEl = null;
  }

  // Reset all module-level variables
  canvas        = null;
  ctx           = null;
  state         = null;
  rng           = null;
  optRef        = null;
  playerId      = null;
  highScore     = 0;
  cellSize      = 0;
  boardX        = 0;
  boardY        = 0;
  holdX         = 0;
  holdY         = 0;
  nextX         = 0;
  nextY         = 0;
  statsX        = 0;
  statsY        = 0;
  panelCellSize = 0;
  flashTimer    = 0;
  lastFrameTime = 0;
  touchStartX   = 0;
  touchStartY   = 0;
  touchStartT   = 0;
  touchMovedFar = false;
  touchStartHandler  = null;
  touchMoveHandler   = null;
  touchEndHandler    = null;
}
