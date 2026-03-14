// Pac-Man renderer — arcade-authentic canvas-based singleplayer renderer

import {
  MAP_COLS, MAP_ROWS,
  EMPTY, WALL, DOT, PELLET, DOOR, HOUSE,
  initGame, queueDirection, tick, respawn, nextLevel, getTickInterval,
} from '../../games/pacman/index.js';

// ── RNG ──────────────────────────────────────────────────────────────────────

function mulberry32(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Module-level state ────────────────────────────────────────────────────────

let containerEl = null;
let canvasEl    = null;
let ctx         = null;
let state       = null;
let optRef      = null;
let tickTimer   = null;
let rafId       = null;
let roRef       = null;
let styleTag    = null;
let rngFn       = mulberry32(Date.now() >>> 0);

let highScore   = 0;
let cellSize    = 20;

// Phase timing
let phaseTimer  = null;   // setTimeout handle for phase transitions
let dying       = false;  // guard against double-fire
let mouthAngle  = 0;      // 0..1 oscillation for pacman mouth
let pelletPulse = 0;      // 0..1 for pellet opacity pulse
let frameCount  = 0;

// Touch state
let touchStartX = 0;
let touchStartY = 0;

// Bound handler references for cleanup
let keyHandlerRef   = null;
let touchStartRef   = null;
let touchEndRef     = null;

// ── Style injection ───────────────────────────────────────────────────────────

function injectStyles() {
  if (document.getElementById('pm-styles')) return;
  const st = document.createElement('style');
  st.id = 'pm-styles';
  st.textContent = `
    #pm-root {
      --pm-bg:        #000000;
      --pm-surface:   #0d0d1a;
      --pm-border:    rgba(26,26,255,0.35);
      --pm-gold:      #ffff00;
      --pm-blue:      #1a1aff;
      --pm-pink:      #ffb8d1;
      --pm-text:      #f0f0f8;
      --pm-muted:     rgba(240,240,248,0.45);
      --pm-danger:    #ff4560;
      --pm-font:      'DM Mono','Courier New',monospace;
      background: var(--pm-bg);
      color: var(--pm-text);
      font-family: var(--pm-font);
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      overflow: hidden;
      user-select: none;
      -webkit-user-select: none;
    }

    /* ── Header ── */
    #pm-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 14px;
      height: 52px;
      min-height: 52px;
      background: var(--pm-surface);
      border-bottom: 1px solid var(--pm-border);
      flex-shrink: 0;
      position: relative;
      z-index: 2;
    }
    #pm-back {
      background: transparent;
      border: 1px solid rgba(26,26,255,0.5);
      color: var(--pm-muted);
      font-family: var(--pm-font);
      font-size: 0.7rem;
      padding: 5px 11px;
      cursor: pointer;
      letter-spacing: 0.06em;
      border-radius: 6px;
      transition: border-color 0.15s, color 0.15s;
      flex-shrink: 0;
    }
    #pm-back:hover {
      border-color: var(--pm-blue);
      color: #6666ff;
    }
    #pm-header-title {
      font-size: 0.85rem;
      font-weight: 700;
      letter-spacing: 0.18em;
      color: var(--pm-gold);
      text-shadow: 0 0 14px rgba(255,255,0,0.6);
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      pointer-events: none;
    }
    #pm-header-right {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .pm-hud-group {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }
    .pm-hud-label {
      font-size: 0.52rem;
      font-weight: 600;
      letter-spacing: 0.1em;
      color: var(--pm-muted);
      text-transform: uppercase;
    }
    .pm-hud-val {
      font-size: 0.95rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: var(--pm-text);
      line-height: 1.1;
    }
    #pm-score-val { color: var(--pm-gold); }
    #pm-level-val { color: #6699ff; }

    #pm-lives {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .pm-life {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--pm-gold);
      clip-path: polygon(100% 50%, 20% 20%, 20% 80%);
      transition: opacity 0.3s;
      flex-shrink: 0;
    }
    .pm-life.lost {
      opacity: 0.18;
    }

    /* ── Canvas wrap ── */
    #pm-canvas-wrap {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: var(--pm-bg);
      position: relative;
    }
    #pm-canvas {
      display: block;
      image-rendering: pixelated;
      image-rendering: crisp-edges;
    }

    /* ── Overlays ── */
    #pm-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 14px;
      pointer-events: none;
      z-index: 5;
    }
    .pm-overlay-box {
      background: rgba(0,0,0,0.82);
      border: 1px solid rgba(26,26,255,0.5);
      border-radius: 12px;
      padding: 28px 40px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      box-shadow:
        0 0 40px rgba(26,26,255,0.25),
        0 8px 32px rgba(0,0,0,0.8);
      pointer-events: auto;
    }
    .pm-overlay-box.hidden {
      display: none;
    }
    #pm-overlay-title {
      font-size: 1.8rem;
      font-weight: 800;
      letter-spacing: 0.15em;
      text-align: center;
      text-transform: uppercase;
    }
    #pm-overlay-title.ready    { color: var(--pm-gold); text-shadow: 0 0 24px rgba(255,255,0,0.6); }
    #pm-overlay-title.dying    { color: var(--pm-danger); text-shadow: 0 0 24px rgba(255,69,96,0.7); }
    #pm-overlay-title.over     { color: var(--pm-danger); text-shadow: 0 0 24px rgba(255,69,96,0.7); }
    #pm-overlay-title.clear    { color: #44ff88; text-shadow: 0 0 24px rgba(68,255,136,0.6); }

    #pm-overlay-sub {
      font-size: 0.88rem;
      color: var(--pm-muted);
      letter-spacing: 0.08em;
      text-align: center;
    }
    #pm-overlay-score-line {
      font-size: 1.05rem;
      color: var(--pm-text);
      letter-spacing: 0.05em;
      text-align: center;
    }
    #pm-overlay-hs-line {
      font-size: 0.82rem;
      color: #d4a820;
      letter-spacing: 0.06em;
    }
    #pm-overlay-new-hs {
      font-size: 0.75rem;
      color: #44ff88;
      letter-spacing: 0.12em;
      font-weight: 700;
      text-transform: uppercase;
      display: none;
    }

    .pm-btn {
      background: var(--pm-blue);
      border: none;
      color: #ffffff;
      font-family: var(--pm-font);
      font-size: 0.78rem;
      font-weight: 700;
      padding: 10px 28px;
      cursor: pointer;
      letter-spacing: 0.1em;
      border-radius: 8px;
      text-transform: uppercase;
      transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
      margin-top: 4px;
    }
    .pm-btn:hover {
      background: #3333ff;
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(26,26,255,0.5);
    }
    .pm-btn:active { transform: scale(0.96); }
    .pm-btn.secondary {
      background: transparent;
      border: 1px solid rgba(240,240,248,0.2);
      color: var(--pm-muted);
    }
    .pm-btn.secondary:hover {
      border-color: rgba(240,240,248,0.4);
      color: var(--pm-text);
      background: rgba(255,255,255,0.05);
      box-shadow: none;
    }
    .pm-btn-row {
      display: flex;
      gap: 10px;
      margin-top: 4px;
    }

    /* ── Controls hint ── */
    #pm-controls-hint {
      font-size: 0.58rem;
      letter-spacing: 0.1em;
      text-align: center;
      padding: 8px;
      color: rgba(240,240,248,0.22);
      background: var(--pm-surface);
      border-top: 1px solid var(--pm-border);
      flex-shrink: 0;
    }

    /* ── New high score flash ── */
    @keyframes pm-hs-flash {
      0%, 100% { color: #d4a820; }
      50% { color: #fff; text-shadow: 0 0 16px rgba(255,255,0,0.8); }
    }
    .pm-hs-anim { animation: pm-hs-flash 0.35s ease 4; }

    /* ── Overlay entrance ── */
    @keyframes pm-overlay-in {
      from { opacity: 0; transform: scale(0.88); }
      to   { opacity: 1; transform: scale(1); }
    }
    .pm-overlay-box:not(.hidden) {
      animation: pm-overlay-in 0.22s cubic-bezier(0.34,1.56,0.64,1);
    }
  `;
  document.head.appendChild(st);
  styleTag = st;
}

// ── DOM construction ──────────────────────────────────────────────────────────

function buildDOM(container) {
  container.innerHTML = `
    <div id="pm-root">
      <div id="pm-header">
        <button id="pm-back">← BACK</button>
        <div id="pm-header-title">PAC-MAN</div>
        <div id="pm-header-right">
          <div class="pm-hud-group">
            <span class="pm-hud-label">SCORE</span>
            <span class="pm-hud-val" id="pm-score-val">0</span>
          </div>
          <div class="pm-hud-group">
            <span class="pm-hud-label">BEST</span>
            <span class="pm-hud-val" id="pm-hs-val">0</span>
          </div>
          <div id="pm-lives">
            <div class="pm-life" id="pm-life-0"></div>
            <div class="pm-life" id="pm-life-1"></div>
            <div class="pm-life" id="pm-life-2"></div>
          </div>
          <div class="pm-hud-group">
            <span class="pm-hud-label">LEVEL</span>
            <span class="pm-hud-val" id="pm-level-val">1</span>
          </div>
        </div>
      </div>

      <div id="pm-canvas-wrap">
        <canvas id="pm-canvas"></canvas>
        <div id="pm-overlay">
          <div class="pm-overlay-box" id="pm-overlay-box">
            <div id="pm-overlay-title" class="ready">READY!</div>
            <div id="pm-overlay-sub">GET SET...</div>
            <div id="pm-overlay-score-line" style="display:none"></div>
            <div id="pm-overlay-hs-line" style="display:none"></div>
            <div id="pm-overlay-new-hs">NEW HIGH SCORE!</div>
            <div class="pm-btn-row" id="pm-btn-row" style="display:none">
              <button class="pm-btn" id="pm-play-again">PLAY AGAIN</button>
              <button class="pm-btn secondary" id="pm-back-btn-over">BACK</button>
            </div>
          </div>
        </div>
      </div>

      <div id="pm-controls-hint">ARROW KEYS / WASD &nbsp;·&nbsp; SWIPE ON TOUCH</div>
    </div>`;
}

// ── Header updates (surgical DOM patches) ────────────────────────────────────

function updateHeader() {
  if (!containerEl || !state) return;
  containerEl.querySelector('#pm-score-val').textContent = state.score;
  containerEl.querySelector('#pm-hs-val').textContent = highScore;
  containerEl.querySelector('#pm-level-val').textContent = state.level;

  // Lives — max display is 3 icons; dim lost ones
  const maxIcons = 3;
  for (let i = 0; i < maxIcons; i++) {
    const el = containerEl.querySelector(`#pm-life-${i}`);
    if (!el) continue;
    // lives is total remaining; icon i is "alive" when i < lives
    el.classList.toggle('lost', i >= state.lives);
  }
}

// ── Overlay management ────────────────────────────────────────────────────────

function showOverlay(titleText, titleClass, subText, showScore, showBtns) {
  const box   = containerEl.querySelector('#pm-overlay-box');
  const title = containerEl.querySelector('#pm-overlay-title');
  const sub   = containerEl.querySelector('#pm-overlay-sub');
  const scoreLine = containerEl.querySelector('#pm-overlay-score-line');
  const hsLine    = containerEl.querySelector('#pm-overlay-hs-line');
  const newHsEl   = containerEl.querySelector('#pm-overlay-new-hs');
  const btnRow    = containerEl.querySelector('#pm-btn-row');

  title.textContent = titleText;
  title.className   = titleClass;
  sub.textContent   = subText;
  sub.style.display = subText ? '' : 'none';

  if (showScore) {
    scoreLine.textContent = `SCORE  ${state.score}`;
    scoreLine.style.display = '';
    const isNewHS = state.score > 0 && state.score >= highScore;
    hsLine.textContent  = `BEST  ${highScore}`;
    hsLine.style.display = '';
    newHsEl.style.display = isNewHS && state.score > 0 ? '' : 'none';
    if (isNewHS && state.score > 0) {
      hsLine.classList.add('pm-hs-anim');
      setTimeout(() => hsLine.classList.remove('pm-hs-anim'), 1400);
    }
  } else {
    scoreLine.style.display = 'none';
    hsLine.style.display    = 'none';
    newHsEl.style.display   = 'none';
  }

  btnRow.style.display = showBtns ? '' : 'none';
  box.classList.remove('hidden');
}

function hideOverlay() {
  const box = containerEl.querySelector('#pm-overlay-box');
  box.classList.add('hidden');
}

// ── Canvas sizing ─────────────────────────────────────────────────────────────

function computeLayout() {
  const wrap = containerEl.querySelector('#pm-canvas-wrap');
  if (!wrap) return;
  const W = wrap.clientWidth;
  const H = wrap.clientHeight;
  const byW = Math.floor(W / MAP_COLS);
  const byH = Math.floor(H / MAP_ROWS);
  cellSize = Math.max(8, Math.min(byW, byH));
  canvasEl.width  = MAP_COLS * cellSize;
  canvasEl.height = MAP_ROWS * cellSize;
}

// ── Drawing helpers ───────────────────────────────────────────────────────────

const CORNER_R_WALL  = 2;   // px — wall corner rounding

function drawBoard() {
  const map = state.map;
  const cs  = cellSize;

  for (let r = 0; r < MAP_ROWS; r++) {
    for (let c = 0; c < MAP_COLS; c++) {
      const tile = map[r][c];
      const x = c * cs;
      const y = r * cs;

      if (tile === WALL) {
        // Solid blue wall with slight rounded corners
        ctx.fillStyle = '#1a1aff';
        const r2 = Math.min(CORNER_R_WALL, cs * 0.18);
        roundRect(ctx, x + 1, y + 1, cs - 2, cs - 2, r2);
        ctx.fill();
        // Subtle highlight on top/left edge
        ctx.fillStyle = 'rgba(120,120,255,0.28)';
        roundRect(ctx, x + 1, y + 1, cs - 2, 2, 1);
        ctx.fill();

      } else if (tile === HOUSE) {
        ctx.fillStyle = '#000033';
        ctx.fillRect(x, y, cs, cs);

      } else if (tile === DOOR) {
        // Pink horizontal bar in the middle third
        const barH = Math.max(2, Math.round(cs * 0.22));
        const barY = y + Math.round((cs - barH) / 2);
        ctx.fillStyle = '#ffb8d1';
        ctx.fillRect(x, barY, cs, barH);

      } else if (tile === DOT) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x + cs / 2, y + cs / 2, Math.max(1.5, cs * 0.12), 0, Math.PI * 2);
        ctx.fill();

      } else if (tile === PELLET) {
        // Pulsing opacity
        const alpha = 0.65 + 0.35 * Math.sin(pelletPulse * Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x + cs / 2, y + cs / 2, Math.max(3, cs * 0.28), 0, Math.PI * 2);
        ctx.fill();
      }
      // EMPTY — nothing drawn; black bg shows through
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ── Pacman drawing ───────────────────────────────────────────────────────────

function dirToAngle(dir) {
  switch (dir) {
    case 'right': return 0;
    case 'down':  return Math.PI / 2;
    case 'left':  return Math.PI;
    case 'up':    return -Math.PI / 2;
    default:      return 0;
  }
}

function drawPacman() {
  const pac = state.pacman;
  const cs  = cellSize;
  const cx  = pac.x * cs + cs / 2;
  const cy  = pac.y * cs + cs / 2;
  const radius = cs * 0.44;

  // Mouth angle: 0 = closed, ~30° = open
  const maxMouth = 0.28; // fraction of PI
  const mouth = pac.moving
    ? maxMouth * Math.abs(Math.sin(mouthAngle * Math.PI))
    : 0.04;

  const angle = dirToAngle(pac.dir);
  const startA = angle + mouth * Math.PI;
  const endA   = angle + (2 - mouth) * Math.PI;

  ctx.fillStyle = '#ffff00';
  ctx.shadowColor = 'rgba(255,255,0,0.45)';
  ctx.shadowBlur  = cs * 0.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, radius, startA, endA);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  // Eye — small dark circle above center
  if (state.phase !== 'dying') {
    const eyeOffset = cs * 0.16;
    // Eye sits perpendicular to direction of travel
    const perpAngle = angle - Math.PI / 2;
    const ex = cx + Math.cos(perpAngle) * eyeOffset * 0.7;
    const ey = cy + Math.sin(perpAngle) * eyeOffset * 0.7;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(ex, ey, Math.max(1.5, cs * 0.07), 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Ghost drawing ─────────────────────────────────────────────────────────────

function drawGhost(ghost, t) {
  if (ghost.inHouse) return; // don't render inside the house box

  const cs = cellSize;
  const cx = ghost.x * cs + cs / 2;
  const cy = ghost.y * cs + cs / 2;
  const r  = cs * 0.42;

  // Blink logic: alternate between frightened/normal when timer < 10
  let isFrightened = ghost.mode === 'frightened';
  if (isFrightened && state.frightenedTimer < 10) {
    // Flash every ~6 frames
    isFrightened = Math.floor(frameCount / 6) % 2 === 0;
  }

  const isEaten = ghost.mode === 'eaten';

  if (isEaten) {
    drawGhostEyes(cx, cy, cs, '#ffffff');
    return;
  }

  // Body color
  const bodyColor = isFrightened ? '#0000cc' : ghost.color;

  ctx.fillStyle = bodyColor;
  ctx.shadowColor = isFrightened ? 'rgba(0,0,200,0.4)' : 'rgba(0,0,0,0.5)';
  ctx.shadowBlur  = cs * 0.3;

  // Classic ghost silhouette:
  // — semicircle top
  // — rectangle body
  // — wavy bottom (3 bumps)
  const bodyTop = cy - r;
  const bodyBot = cy + r;
  const bodyL   = cx - r;
  const bodyR   = cx + r;
  const bumpH   = cs * 0.2;
  const bumpW   = (bodyR - bodyL) / 3;

  ctx.beginPath();
  // Top semicircle
  ctx.arc(cx, bodyTop + r * 0.05, r, Math.PI, 0, false);
  // Right side straight down
  ctx.lineTo(bodyR, bodyBot - bumpH);
  // Wavy bottom — 3 bumps from right to left
  for (let i = 2; i >= 0; i--) {
    const bx = bodyL + bumpW * i;
    const bxm = bx + bumpW / 2;
    const bxe = bx + bumpW;
    // Concave at right, convex at peak
    ctx.quadraticCurveTo(bxe - bumpW * 0.25, bodyBot, bxe - bumpW * 0.5, bodyBot - bumpH);
    ctx.quadraticCurveTo(bxe - bumpW * 0.75, bodyBot - bumpH * 2, bx, bodyBot - bumpH);
  }
  // Left side back up
  ctx.lineTo(bodyL, bodyTop + r);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur  = 0;
  ctx.shadowColor = 'transparent';

  if (isFrightened) {
    // Scared face — white wavy mouth + dots for eyes
    const mouthY = cy + cs * 0.08;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = Math.max(1.5, cs * 0.08);
    ctx.beginPath();
    const mL = cx - cs * 0.22;
    const mR = cx + cs * 0.22;
    const segs = 4;
    ctx.moveTo(mL, mouthY);
    for (let i = 0; i < segs; i++) {
      const x0 = mL + (mR - mL) * i / segs;
      const x1 = mL + (mR - mL) * (i + 0.5) / segs;
      const x2 = mL + (mR - mL) * (i + 1) / segs;
      const zig = (i % 2 === 0) ? cs * 0.07 : -cs * 0.07;
      ctx.lineTo(x1, mouthY + zig);
      ctx.lineTo(x2, mouthY);
    }
    ctx.stroke();

    // Scared white dot eyes
    ctx.fillStyle = '#aaaaff';
    ctx.beginPath();
    ctx.arc(cx - cs * 0.14, cy - cs * 0.1, Math.max(1.5, cs * 0.07), 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + cs * 0.14, cy - cs * 0.1, Math.max(1.5, cs * 0.07), 0, Math.PI * 2);
    ctx.fill();
  } else {
    drawGhostEyes(cx, cy, cs, '#ffffff');
  }
}

function drawGhostEyes(cx, cy, cs, whiteColor) {
  const eyeY   = cy - cs * 0.12;
  const eyeR   = Math.max(2, cs * 0.1);
  const pupilR = Math.max(1, cs * 0.06);

  // Left eye white
  ctx.fillStyle = whiteColor;
  ctx.beginPath();
  ctx.arc(cx - cs * 0.15, eyeY, eyeR, 0, Math.PI * 2);
  ctx.fill();

  // Right eye white
  ctx.beginPath();
  ctx.arc(cx + cs * 0.15, eyeY, eyeR, 0, Math.PI * 2);
  ctx.fill();

  // Pupils (dark blue) — look toward pacman if state is available
  const pupilColor = '#0000aa';
  ctx.fillStyle = pupilColor;
  ctx.beginPath();
  ctx.arc(cx - cs * 0.15, eyeY + pupilR * 0.5, pupilR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + cs * 0.15, eyeY + pupilR * 0.5, pupilR, 0, Math.PI * 2);
  ctx.fill();
}

// ── Score pop (ghost eaten) ───────────────────────────────────────────────────

let scorePops = [];  // [{x, y, val, alpha, age}]

function addScorePop(gx, gy, val) {
  scorePops.push({ x: gx, y: gy, val, alpha: 1, age: 0 });
}

function drawScorePops() {
  const cs = cellSize;
  ctx.font = `bold ${Math.max(8, cs * 0.5)}px 'DM Mono', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const toRemove = [];
  for (let i = 0; i < scorePops.length; i++) {
    const p = scorePops[i];
    p.age++;
    p.alpha = Math.max(0, 1 - p.age / 30);
    if (p.alpha <= 0) { toRemove.push(i); continue; }
    const px = p.x * cs + cs / 2;
    const py = p.y * cs + cs / 2 - p.age * (cs * 0.05);
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(p.val, px, py);
  }
  ctx.globalAlpha = 1;
  for (let i = toRemove.length - 1; i >= 0; i--) scorePops.splice(toRemove[i], 1);
}

// ── Death animation ───────────────────────────────────────────────────────────

let deathProgress = 0;  // 0 → 1 over dying animation
let deathAnimId   = null;

function drawDyingPacman() {
  const pac = state.pacman;
  const cs  = cellSize;
  const cx  = pac.x * cs + cs / 2;
  const cy  = pac.y * cs + cs / 2;
  const radius = cs * 0.44 * (1 - deathProgress * 0.7);
  if (radius < 1) return;

  // Mouth closes then vanishes
  const closingMouth = (0.3 + deathProgress * 0.7) * Math.PI; // grows from 30° to full
  ctx.fillStyle = '#ffff00';
  ctx.shadowColor = 'rgba(255,255,0,0.4)';
  ctx.shadowBlur  = cs * 0.4 * (1 - deathProgress);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, radius, closingMouth, 2 * Math.PI - closingMouth + Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur  = 0;
  ctx.shadowColor = 'transparent';
}

// ── Main draw frame ───────────────────────────────────────────────────────────

function drawFrame(ts) {
  if (!canvasEl || !state) { rafId = requestAnimationFrame(drawFrame); return; }

  frameCount++;
  pelletPulse = (frameCount % 90) / 90;
  mouthAngle  = (frameCount % 20) / 20;

  // Clear
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);

  drawBoard();

  if (state.phase === 'dying') {
    drawDyingPacman();
  } else {
    drawPacman();
  }

  for (const ghost of state.ghosts) {
    drawGhost(ghost, ts);
  }

  drawScorePops();

  rafId = requestAnimationFrame(drawFrame);
}

// ── Game tick ─────────────────────────────────────────────────────────────────

function gameTick() {
  if (!state) return;
  if (state.phase !== 'playing') return;

  const prev = state;
  state = tick(state, rngFn);

  // Score pops for ghost eats
  if (state.ghostsEaten && state.ghostsEaten.length > 0) {
    for (const gid of state.ghostsEaten) {
      const g = prev.ghosts.find(g => g.id === gid);
      if (g) {
        const combo = state.ghosts.reduce((acc, gh) => acc + (gh.mode === 'eaten' ? 1 : 0), 0);
        const pts = 200 * Math.pow(2, combo - 1);
        addScorePop(g.x, g.y, pts);
      }
    }
  }

  updateHeader();
  handlePhaseChange(prev.phase, state.phase);
}

function handlePhaseChange(oldPhase, newPhase) {
  if (oldPhase === newPhase) return;

  if (newPhase === 'dying') {
    stopTick();
    startDeathAnimation();

  } else if (newPhase === 'over') {
    stopTick();
    onGameOver();

  } else if (newPhase === 'levelclear') {
    stopTick();
    onLevelClear();
  }
}

// ── Phase handlers ────────────────────────────────────────────────────────────

function startDeathAnimation() {
  if (dying) return;
  dying = true;
  deathProgress = 0;

  const startT = performance.now();
  const duration = 1500;

  function animStep(t) {
    deathProgress = Math.min(1, (t - startT) / duration);
    if (deathProgress < 1) {
      deathAnimId = requestAnimationFrame(animStep);
    } else {
      deathAnimId = null;
      dying = false;
      afterDeath();
    }
  }
  deathAnimId = requestAnimationFrame(animStep);
}

function afterDeath() {
  if (!state) return;
  if (state.lives <= 0 || state.phase === 'over') {
    onGameOver();
  } else {
    // respawn and continue
    state = respawn(state);
    updateHeader();
    scheduleReadyPhase();
  }
}

function scheduleReadyPhase() {
  hideOverlay();
  showOverlay('READY!', 'ready', 'GET SET...', false, false);
  phaseTimer = setTimeout(() => {
    hideOverlay();
    state = { ...state, phase: 'playing' };
    startTick();
  }, 2000);
}

function onGameOver() {
  stopTick();
  // Save high score if beaten
  if (state.score > highScore) {
    highScore = state.score;
    saveHighScore();
  }
  updateHeader();
  showOverlay('GAME OVER', 'over', '', true, true);
}

function onLevelClear() {
  stopTick();
  showOverlay('LEVEL CLEAR!', 'clear', `LEVEL ${state.level} COMPLETE`, false, false);
  phaseTimer = setTimeout(() => {
    hideOverlay();
    state = nextLevel(state);
    updateHeader();
    scheduleReadyPhase();
  }, 2000);
}

// ── Tick control ──────────────────────────────────────────────────────────────

function startTick() {
  stopTick();
  const interval = getTickInterval(state ? state.level : 1);
  tickTimer = setInterval(gameTick, interval);
}

function stopTick() {
  if (tickTimer !== null) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

// ── New game / restart ────────────────────────────────────────────────────────

function startNewGame() {
  stopTick();
  if (phaseTimer !== null) { clearTimeout(phaseTimer); phaseTimer = null; }
  if (deathAnimId !== null) { cancelAnimationFrame(deathAnimId); deathAnimId = null; }
  dying = false;
  scorePops = [];

  state = initGame(1);
  updateHeader();
  showOverlay('READY!', 'ready', 'GET SET...', false, false);

  phaseTimer = setTimeout(() => {
    hideOverlay();
    state = { ...state, phase: 'playing' };
    startTick();
  }, 2000);
}

// ── High score persistence ────────────────────────────────────────────────────

function saveHighScore() {
  localStorage.setItem('pacman_hs', String(state.score));
  fetch('/api/sp/saves/pacman', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slot: 'highscore', data: { highScore: state.score } }),
  }).catch(() => {});
}

// ── Input ─────────────────────────────────────────────────────────────────────

function handleKey(e) {
  const key = e.key.toLowerCase();

  if (key === 'escape') {
    if (optRef?.navigate) optRef.navigate('singleplayer');
    return;
  }

  if (!state) return;

  if (state.phase === 'over') {
    if (key === ' ' || e.code === 'Space' || key === 'enter') {
      e.preventDefault();
      startNewGame();
    }
    return;
  }

  if (state.phase !== 'playing') return;

  let dir = null;
  if (key === 'arrowleft'  || key === 'a') dir = 'left';
  else if (key === 'arrowright' || key === 'd') dir = 'right';
  else if (key === 'arrowup'    || key === 'w') dir = 'up';
  else if (key === 'arrowdown'  || key === 's') dir = 'down';

  if (dir) {
    e.preventDefault();
    state = queueDirection(state, dir);
  }
}

function handleTouchStart(e) {
  const t = e.touches[0];
  touchStartX = t.clientX;
  touchStartY = t.clientY;
}

function handleTouchEnd(e) {
  if (!state || state.phase !== 'playing') return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;
  const MIN = 30;

  if (Math.abs(dx) < MIN && Math.abs(dy) < MIN) return;

  let dir = null;
  if (Math.abs(dx) > Math.abs(dy)) {
    dir = dx > 0 ? 'right' : 'left';
  } else {
    dir = dy > 0 ? 'down' : 'up';
  }

  if (dir) {
    e.preventDefault();
    state = queueDirection(state, dir);
  }
}

// ── ResizeObserver ────────────────────────────────────────────────────────────

function setupResizeObserver() {
  const wrap = containerEl.querySelector('#pm-canvas-wrap');
  if (!wrap) return;
  roRef = new ResizeObserver(() => {
    computeLayout();
  });
  roRef.observe(wrap);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function render(container, options) {
  optRef      = options || {};
  containerEl = container;

  highScore = optRef.initialSave?.highscore?.highScore ?? 0;

  injectStyles();
  buildDOM(container);

  canvasEl = container.querySelector('#pm-canvas');
  ctx      = canvasEl.getContext('2d');

  // Single delegated click listener on root for all buttons
  container.querySelector('#pm-root').addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.id === 'pm-back' || btn.id === 'pm-back-btn-over') {
      if (optRef?.navigate) optRef.navigate('singleplayer');
    } else if (btn.id === 'pm-play-again') {
      startNewGame();
    }
  });

  // Input
  keyHandlerRef   = handleKey;
  touchStartRef   = handleTouchStart;
  touchEndRef     = handleTouchEnd;
  document.addEventListener('keydown', keyHandlerRef);
  container.addEventListener('touchstart', touchStartRef, { passive: true });
  container.addEventListener('touchend',   touchEndRef,   { passive: false });

  // Layout & start
  computeLayout();
  setupResizeObserver();

  startNewGame();

  // RAF draw loop
  rafId = requestAnimationFrame(drawFrame);
}

export function destroy() {
  stopTick();

  if (phaseTimer !== null)  { clearTimeout(phaseTimer);       phaseTimer = null; }
  if (deathAnimId !== null) { cancelAnimationFrame(deathAnimId); deathAnimId = null; }
  if (rafId !== null)       { cancelAnimationFrame(rafId);     rafId = null; }

  if (keyHandlerRef) {
    document.removeEventListener('keydown', keyHandlerRef);
    keyHandlerRef = null;
  }
  if (containerEl) {
    if (touchStartRef) containerEl.removeEventListener('touchstart', touchStartRef);
    if (touchEndRef)   containerEl.removeEventListener('touchend',   touchEndRef);
  }
  touchStartRef = null;
  touchEndRef   = null;

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

  // Reset module-level variables
  state       = null;
  canvasEl    = null;
  ctx         = null;
  optRef      = null;
  scorePops   = [];
  dying       = false;
  deathProgress = 0;
  frameCount  = 0;
  mouthAngle  = 0;
  pelletPulse = 0;
  highScore   = 0;
}
