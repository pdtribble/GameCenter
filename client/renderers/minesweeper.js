// Minesweeper renderer — dark phosphor-green terminal aesthetic
// Self-contained: includes all game logic inline (no server-side imports).

// ── Inline game logic (mirrors games/minesweeper/index.js) ───────────────────

function mulberry32(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCell() {
  return { mine: false, adjacency: 0, state: 'hidden', revealOrigin: null };
}

function makeBoard(width, height) {
  const cells = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) row.push(makeCell());
    cells.push(row);
  }
  return { width, height, cells, mineCount: 0, state: 'playing', firstClickDone: false, startTime: null, endTime: null, flagCount: 0, revealCount: 0 };
}

function inBounds(b, x, y) { return x >= 0 && y >= 0 && x < b.width && y < b.height; }

function neighbors(b, x, y) {
  const r = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (dx === 0 && dy === 0) continue;
    if (inBounds(b, x + dx, y + dy)) r.push({ x: x + dx, y: y + dy });
  }
  return r;
}

function computeAdjacency(b) {
  for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) {
    if (b.cells[y][x].mine) { b.cells[y][x].adjacency = -1; continue; }
    b.cells[y][x].adjacency = neighbors(b, x, y).filter(n => b.cells[n.y][n.x].mine).length;
  }
}

function placeMines(b, count, sx, sy, rng) {
  const safe = new Set([`${sx},${sy}`]);
  for (const n of neighbors(b, sx, sy)) safe.add(`${n.x},${n.y}`);
  const cands = [];
  for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) if (!safe.has(`${x},${y}`)) cands.push({ x, y });
  const needed = Math.min(count, cands.length);
  for (let i = 0; i < needed; i++) {
    const j = i + Math.floor(rng() * (cands.length - i));
    [cands[i], cands[j]] = [cands[j], cands[i]];
    b.cells[cands[i].y][cands[i].x].mine = true;
  }
  b.mineCount = needed;
  computeAdjacency(b);
}

function bfsReveal(b, sx, sy) {
  const out = [];
  const q = [{ x: sx, y: sy, dist: 0 }];
  const seen = new Set([`${sx},${sy}`]);
  while (q.length) {
    const { x, y, dist } = q.shift();
    const c = b.cells[y][x];
    if (c.state === 'revealed' || c.state === 'flagged' || c.mine) continue;
    c.state = 'revealed'; c.revealOrigin = dist; out.push({ x, y, dist }); b.revealCount++;
    if (c.adjacency === 0) for (const n of neighbors(b, x, y)) {
      const k = `${n.x},${n.y}`;
      if (!seen.has(k) && b.cells[n.y][n.x].state === 'hidden') { seen.add(k); q.push({ x: n.x, y: n.y, dist: dist + 1 }); }
    }
  }
  return out;
}

function checkWin(b) { return b.revealCount >= b.width * b.height - b.mineCount; }

function flagAllMines(b) {
  for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) {
    if (b.cells[y][x].mine && b.cells[y][x].state !== 'flagged') { b.cells[y][x].state = 'flagged'; b.flagCount++; }
  }
}

const DIFFICULTIES = {
  beginner:     { width: 9,  height: 9,  mines: 10 },
  intermediate: { width: 16, height: 16, mines: 40 },
  expert:       { width: 30, height: 16, mines: 99 },
};

function newClassicState(difficulty) {
  const cfg = DIFFICULTIES[difficulty] || DIFFICULTIES.beginner;
  return { difficulty, board: makeBoard(cfg.width, cfg.height), mines: cfg.mines };
}

function doFirstClick(cs, fx, fy) {
  const rng = mulberry32(((fx * 73856093) ^ (fy * 19349663) ^ (Date.now() & 0xffff)) >>> 0);
  placeMines(cs.board, cs.mines, fx, fy, rng);
  cs.board.firstClickDone = true;
  cs.board.startTime = Date.now();
  bfsReveal(cs.board, fx, fy);
  if (checkWin(cs.board)) { cs.board.state = 'won'; cs.board.endTime = Date.now(); flagAllMines(cs.board); }
  return cs;
}

function doReveal(cs, x, y) {
  const b = cs.board;
  if (b.state !== 'playing') return { revealed: [], exploded: false };
  const c = b.cells[y][x];
  if (c.state !== 'hidden') return { revealed: [], exploded: false };
  if (c.mine) {
    c.state = 'revealed'; b.state = 'lost'; b.endTime = Date.now();
    for (let r = 0; r < b.height; r++) for (let col = 0; col < b.width; col++) {
      if (b.cells[r][col].mine && b.cells[r][col].state !== 'flagged') b.cells[r][col].state = 'revealed';
    }
    return { revealed: [{ x, y, dist: 0 }], exploded: true };
  }
  const revealed = bfsReveal(b, x, y);
  if (checkWin(b)) { b.state = 'won'; b.endTime = Date.now(); flagAllMines(b); }
  return { revealed, exploded: false };
}

function doToggleFlag(cs, x, y) {
  const b = cs.board; if (b.state !== 'playing') return;
  const c = b.cells[y][x];
  if (c.state === 'hidden') { c.state = 'flagged'; b.flagCount++; }
  else if (c.state === 'flagged') { c.state = 'hidden'; b.flagCount--; }
}

function doChord(cs, x, y) {
  const b = cs.board; if (b.state !== 'playing') return { revealed: [], exploded: false };
  const c = b.cells[y][x];
  if (c.state !== 'revealed' || c.adjacency <= 0) return { revealed: [], exploded: false };
  const ns = neighbors(b, x, y);
  const flagged = ns.filter(n => b.cells[n.y][n.x].state === 'flagged').length;
  if (flagged !== c.adjacency) return { revealed: [], exploded: false };
  let all = [], boom = false;
  for (const n of ns) if (b.cells[n.y][n.x].state === 'hidden') {
    const r = doReveal(cs, n.x, n.y); all = all.concat(r.revealed); if (r.exploded) boom = true;
  }
  return { revealed: all, exploded: boom };
}

// Endless helpers
function sectionKey(x, y) { return `${x},${y}`; }
function chebyshev(x, y) { return Math.max(Math.abs(x), Math.abs(y)); }
function minesFor(d) { return d === 0 ? 8 : d <= 2 ? 12 : d <= 5 ? 15 : 18; }

function makeSectionBoard(worldSeed, gx, gy, failCount) {
  const mines = minesFor(chebyshev(gx, gy));
  const seed = ((worldSeed ^ (gx * 73856093) ^ (gy * 19349663) ^ (failCount * 83492791)) >>> 0);
  const rng = mulberry32(seed);
  const b = makeBoard(9, 9); b.mineCount = mines; b.firstClickDone = true;
  const pos = [];
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) pos.push({ x, y });
  for (let i = pos.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pos[i], pos[j]] = [pos[j], pos[i]]; }
  for (let i = 0; i < mines; i++) b.cells[pos[i].y][pos[i].x].mine = true;
  computeAdjacency(b);
  return b;
}

function newEndlessWorld(seed) {
  const w = { seed, currentSection: { x: 0, y: 0 }, sections: {} };
  w.sections[sectionKey(0, 0)] = { x: 0, y: 0, status: 'active', failCount: 0, board: makeSectionBoard(seed, 0, 0, 0) };
  return w;
}

function endlessClear(world, gx, gy) {
  const k = sectionKey(gx, gy); if (!world.sections[k]) return;
  world.sections[k].status = 'cleared'; world.sections[k].board = null;
  for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
    const nk = sectionKey(gx + dx, gy + dy);
    if (!world.sections[nk]) {
      const nx = gx + dx, ny = gy + dy;
      world.sections[nk] = { x: nx, y: ny, status: 'active', failCount: 0, board: makeSectionBoard(world.seed, nx, ny, 0) };
    }
  }
}

function endlessFail(world, gx, gy) {
  const k = sectionKey(gx, gy); if (!world.sections[k]) return;
  const s = world.sections[k]; s.failCount++; s.status = 'active';
  s.board = makeSectionBoard(world.seed, gx, gy, s.failCount);
}

// ── Renderer state ────────────────────────────────────────────────────────────

let containerEl = null;
let timerInterval = null;
let classicState = null;
let endlessWorld = null;
let activeMode = null;       // 'classic' | 'endless'
let activeDifficulty = 'beginner';
let currentSection = null;   // { x, y } for endless
let optRef = null;

// ── CSS injection ─────────────────────────────────────────────────────────────

function injectStyles() {
  if (document.getElementById('ms-styles')) return;
  const st = document.createElement('style');
  st.id = 'ms-styles';
  st.textContent = `
    #ms-root {
      --ms-bg: #0d1117;
      --ms-surface: #161b22;
      --ms-accent: #58a6ff;
      --ms-green: #3fb950;
      --ms-red: #f85149;
      --ms-yellow: #d29922;
      --ms-cell-bg: #21262d;
      --ms-cell-hover: #30363d;
      --ms-cell-revealed: #161b22;
      --ms-cell-border: #30363d;
      --ms-flag: #f85149;
      --ms-mine: #f85149;
      --ms-font: 'DM Mono','Courier New',monospace;
      background: var(--ms-bg);
      color: #c9d1d9;
      font-family: var(--ms-font);
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
      user-select: none;
      -webkit-user-select: none;
    }
    #ms-topbar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      background: var(--ms-surface);
      border-bottom: 1px solid var(--ms-cell-border);
      flex-shrink: 0;
    }
    #ms-topbar-title {
      font-size: 0.78rem;
      font-weight: 600;
      letter-spacing: 0.08em;
      color: var(--ms-accent);
      text-transform: uppercase;
    }
    .ms-hud-pill {
      display: flex;
      align-items: center;
      gap: 6px;
      background: var(--ms-cell-bg);
      border: 1px solid var(--ms-cell-border);
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 0.8rem;
      font-weight: 600;
      letter-spacing: 0.05em;
    }
    .ms-hud-pill .ms-icon { font-size: 0.85rem; }
    #ms-flag-count { color: var(--ms-red); }
    #ms-timer { color: var(--ms-accent); }
    .ms-spacer { flex: 1; }
    #ms-reset-btn {
      background: var(--ms-accent);
      border: none;
      color: #0d1117;
      font-family: var(--ms-font);
      font-size: 0.72rem;
      font-weight: 700;
      padding: 6px 14px;
      cursor: pointer;
      letter-spacing: 0.05em;
      border-radius: 6px;
      transition: all 0.15s, transform 0.1s;
    }
    #ms-reset-btn:hover { background: #79c0ff; transform: translateY(-1px); }
    #ms-reset-btn:active { transform: scale(0.96); }
    #ms-home-btn {
      background: transparent;
      border: 1px solid var(--ms-cell-border);
      color: #8b949e;
      font-family: var(--ms-font);
      font-size: 0.72rem;
      padding: 6px 12px;
      cursor: pointer;
      letter-spacing: 0.05em;
      border-radius: 6px;
      transition: all 0.15s;
    }
    #ms-home-btn:hover { border-color: var(--ms-accent); color: var(--ms-accent); }
    #ms-body {
      flex: 1;
      display: flex;
      overflow: hidden;
    }
    body.layout-phone #ms-body { flex-direction: column; }
    body.layout-web #ms-body { flex-direction: row; }

    #ms-sidebar {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 12px;
      background: var(--ms-surface);
      border-right: 1px solid var(--ms-cell-border);
      flex-shrink: 0;
      overflow-y: auto;
    }
    body.layout-phone #ms-sidebar {
      flex-direction: row;
      flex-wrap: wrap;
      border-right: none;
      border-bottom: 1px solid var(--ms-cell-border);
      padding: 8px 10px;
    }
    .ms-mode-btn {
      background: var(--ms-cell-bg);
      border: 1px solid var(--ms-cell-border);
      color: #8b949e;
      font-family: var(--ms-font);
      font-size: 0.68rem;
      padding: 8px 12px;
      cursor: pointer;
      letter-spacing: 0.04em;
      text-align: left;
      border-radius: 6px;
      transition: all 0.15s, transform 0.1s;
      white-space: nowrap;
    }
    .ms-mode-btn:hover, .ms-mode-btn.active {
      background: var(--ms-accent);
      border-color: var(--ms-accent);
      color: #0d1117;
      font-weight: 600;
    }
    .ms-mode-btn:active { transform: scale(0.97); }
    .ms-section-label {
      font-size: 0.6rem;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #484f58;
      padding: 8px 4px 4px;
    }
    body.layout-phone .ms-section-label { display: none; }

    #ms-board-wrap {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      position: relative;
      padding: 16px;
    }
    #ms-board {
      display: grid;
      gap: 2px;
      line-height: 1;
      background: var(--ms-surface);
      padding: 4px;
      border-radius: 8px;
      box-shadow: 
        0 4px 24px rgba(0,0,0,0.4),
        inset 0 1px 0 rgba(255,255,255,0.03);
    }
    #ms-board.shake {
      animation: ms-shake 0.15s ease-out;
    }
    @keyframes ms-shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-4px); }
      75% { transform: translateX(4px); }
    }
    .ms-cell {
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--ms-font);
      font-weight: 700;
      cursor: pointer;
      background: linear-gradient(180deg, #3d444d 0%, #30363d 100%);
      border: 1px solid #484f58;
      border-radius: 4px;
      transition: all 0.08s;
      box-sizing: border-box;
      overflow: hidden;
      box-shadow: 
        inset 0 1px 0 rgba(255,255,255,0.08),
        inset 0 -1px 0 rgba(0,0,0,0.15);
    }
    .ms-cell:not(.revealed):not(.flagged):hover {
      background: linear-gradient(180deg, #484f58 0%, #3d444d 100%);
      border-color: #6e7681;
      transform: translateY(-1px);
    }
    .ms-cell:not(.revealed):not(.flagged):active {
      transform: scale(0.94);
      background: #21262d;
    }
    .ms-cell.revealed {
      background: var(--ms-cell-revealed);
      border-color: #21262d;
      cursor: default;
      box-shadow: inset 0 1px 2px rgba(0,0,0,0.2);
    }
    .ms-cell.flagged {
      background: linear-gradient(180deg, #3d444d 0%, #30363d 100%);
      border-color: var(--ms-flag);
      color: var(--ms-flag);
    }
    .ms-cell.mine-hit {
      background: linear-gradient(180deg, #f85149 0%, #da3633 100%);
      border-color: #ff7b72;
      animation: ms-explode 0.4s ease-out;
    }
    .ms-cell.mine-shown {
      background: rgba(248,81,73,0.15);
      border-color: rgba(248,81,73,0.3);
    }
    @keyframes ms-explode {
      0%  { transform: scale(1.3); background: #f85149; }
      50% { transform: scale(1.1); }
      100%{ transform: scale(1); }
    }
    @keyframes ms-reveal {
      0%  { opacity: 0; transform: scale(0.6); }
      70% { transform: scale(1.05); }
      100%{ opacity: 1; transform: scale(1); }
    }
    .ms-cell.just-revealed { animation: ms-reveal 0.15s ease-out; }

    /* Modern number colors */
    .ms-cell[data-num="1"] { color: #58a6ff; }
    .ms-cell[data-num="2"] { color: #3fb950; }
    .ms-cell[data-num="3"] { color: #f85149; }
    .ms-cell[data-num="4"] { color: #a371f7; }
    .ms-cell[data-num="5"] { color: #db6d28; }
    .ms-cell[data-num="6"] { color: #2ea043; }
    .ms-cell[data-num="7"] { color: #8b949e; }
    .ms-cell[data-num="8"] { color: #6e7681; }

    /* Overlay */
    #ms-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      background: rgba(13,17,23,0.85);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 10;
      border-radius: 8px;
    }
    #ms-overlay-title {
      font-size: 1.8rem;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    #ms-overlay-title.win { 
      color: var(--ms-green); 
      text-shadow: 0 0 30px rgba(63,185,80,0.5);
    }
    #ms-overlay-title.lose { 
      color: var(--ms-red); 
      text-shadow: 0 0 30px rgba(248,81,73,0.5);
    }
    #ms-overlay-sub {
      font-size: 0.82rem;
      color: #8b949e;
      letter-spacing: 0.04em;
    }
    #ms-overlay-btn {
      background: var(--ms-accent);
      border: none;
      color: #0d1117;
      font-family: var(--ms-font);
      font-size: 0.8rem;
      font-weight: 700;
      padding: 10px 28px;
      cursor: pointer;
      letter-spacing: 0.08em;
      border-radius: 8px;
      transition: all 0.15s, transform 0.1s;
    }
    #ms-overlay-btn:hover { background: #79c0ff; transform: translateY(-2px); }
    #ms-overlay-btn:active { transform: scale(0.96); }

    /* Win glow sweep */
    #ms-board.win-glow {
      animation: ms-win-glow 0.8s ease-out;
    }
    @keyframes ms-win-glow {
      0% { box-shadow: 0 0 0 rgba(63,185,80,0); }
      50% { box-shadow: 0 0 40px rgba(63,185,80,0.6), inset 0 0 20px rgba(63,185,80,0.2); }
      100% { box-shadow: 0 4px 24px rgba(0,0,0,0.4); }
    }

    /* Loss red pulse */
    #ms-board.loss-pulse::before {
      content: '';
      position: absolute;
      inset: 0;
      background: rgba(248,81,73,0.15);
      border-radius: 8px;
      animation: ms-loss-pulse 0.3s ease-out;
      pointer-events: none;
    }
    @keyframes ms-loss-pulse {
      0% { opacity: 1; }
      100% { opacity: 0; }
    }

    /* Endless map */
    #ms-map-wrap {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 16px;
      overflow: auto;
    }
    #ms-map { display: grid; gap: 4px; }
    .ms-map-cell {
      width: 32px; height: 32px;
      display: flex; align-items: center; justify-content: center;
      font-size: 0.65rem; font-family: var(--ms-font); font-weight: 600;
      border: 1px solid var(--ms-cell-border);
      background: var(--ms-cell-bg);
      cursor: pointer;
      border-radius: 6px;
      transition: all 0.12s, transform 0.1s;
      box-sizing: border-box;
    }
    .ms-map-cell.cleared { 
      background: linear-gradient(135deg, #238636 0%, #2ea043 100%); 
      border-color: #3fb950; 
      color: #fff; 
    }
    .ms-map-cell.active { 
      border-color: var(--ms-accent); 
      color: var(--ms-accent);
      box-shadow: 0 0 12px rgba(88,166,255,0.3);
    }
    .ms-map-cell.current { 
      background: rgba(88,166,255,0.2); 
      border-color: var(--ms-accent); 
      color: #fff; 
      font-weight: 700;
    }
    .ms-map-cell.locked { opacity: 0.25; cursor: default; }
    .ms-map-cell:not(.locked):hover { 
      background: var(--ms-cell-hover); 
      transform: translateY(-2px);
    }
    .ms-map-label {
      font-size: 0.68rem;
      color: #484f58;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
  `;
  document.head.appendChild(st);
}

// ── Mount ──────────────────────────────────────────────────────────────────────

export function render(container, options) {
  optRef = options || {};
  containerEl = container;
  injectStyles();

  container.innerHTML = `
    <div id="ms-root">
      <div id="ms-topbar">
        <span id="ms-topbar-title">💣 MINESWEEPER</span>
        <div class="ms-hud-pill">
          <span class="ms-icon">🚩</span>
          <span id="ms-flag-count">0</span>
        </div>
        <div class="ms-hud-pill">
          <span class="ms-icon">⏱</span>
          <span id="ms-timer">00:00</span>
        </div>
        <div class="ms-spacer"></div>
        <button id="ms-reset-btn">RESET</button>
        <button id="ms-home-btn">← SOLO</button>
      </div>
      <div id="ms-body">
        <div id="ms-sidebar">
          <span class="ms-section-label">Classic</span>
          <button class="ms-mode-btn active" data-mode="classic" data-diff="beginner">Beginner 9×9</button>
          <button class="ms-mode-btn" data-mode="classic" data-diff="intermediate">Intermediate 16×16</button>
          <button class="ms-mode-btn" data-mode="classic" data-diff="expert">Expert 30×16</button>
          <span class="ms-section-label" style="margin-top:6px">Endless</span>
          <button class="ms-mode-btn" data-mode="endless">Endless World</button>
        </div>
        <div id="ms-board-wrap">
          <div id="ms-board"></div>
          <div id="ms-overlay" style="display:none">
            <div id="ms-overlay-title"></div>
            <div id="ms-overlay-sub"></div>
            <button id="ms-overlay-btn">PLAY AGAIN</button>
          </div>
        </div>
      </div>
    </div>`;

  // Try to restore saves
  const saves = options?.initialSave || {};
  if (saves.endless) {
    try { endlessWorld = JSON.parse(typeof saves.endless === 'string' ? saves.endless : JSON.stringify(saves.endless)); } catch (e) { endlessWorld = null; }
  }

  // Wire events
  const sidebar = container.querySelector('#ms-sidebar');
  sidebar.addEventListener('click', e => {
    const btn = e.target.closest('.ms-mode-btn');
    if (!btn) return;
    const mode = btn.dataset.mode;
    const diff = btn.dataset.diff;
    sidebar.querySelectorAll('.ms-mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (mode === 'classic') startClassic(diff || 'beginner');
    else if (mode === 'endless') startEndless();
  });

  container.querySelector('#ms-reset-btn').addEventListener('click', () => {
    if (activeMode === 'classic') startClassic(activeDifficulty);
    else if (activeMode === 'endless') startEndless(true);
  });

  container.querySelector('#ms-home-btn').addEventListener('click', () => {
    if (options?.navigate) options.navigate('singleplayer');
  });

  container.querySelector('#ms-overlay-btn').addEventListener('click', () => {
    if (activeMode === 'classic') startClassic(activeDifficulty);
    else if (activeMode === 'endless') startEndless(true);
  });

  // Board delegated listener
  const boardEl = container.querySelector('#ms-board');
  boardEl.addEventListener('click', onBoardClick);
  boardEl.addEventListener('contextmenu', onBoardRightClick);
  // Touch hold for flag on mobile
  let touchTimer = null;
  let touchMoved = false;
  boardEl.addEventListener('touchstart', e => {
    touchMoved = false;
    const cell = e.target.closest('.ms-cell');
    if (!cell) return;
    touchTimer = setTimeout(() => {
      if (!touchMoved) flagCell(parseInt(cell.dataset.x), parseInt(cell.dataset.y));
    }, 500);
  }, { passive: true });
  boardEl.addEventListener('touchmove', () => { touchMoved = true; if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; } }, { passive: true });
  boardEl.addEventListener('touchend', () => { if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; } });

  // Default start
  startClassic('beginner');
}

// ── Classic game flow ─────────────────────────────────────────────────────────

function startClassic(difficulty) {
  stopTimer();
  activeMode = 'classic';
  activeDifficulty = difficulty;
  classicState = newClassicState(difficulty);
  hideOverlay();
  showBoard();
  renderBoard();
  updateHUD();
}

function onBoardClick(e) {
  const cell = e.target.closest('.ms-cell');
  if (!cell) return;
  const x = parseInt(cell.dataset.x), y = parseInt(cell.dataset.y);
  if (activeMode === 'classic') handleClassicClick(x, y);
  else if (activeMode === 'endless') handleEndlessClick(x, y);
}

function onBoardRightClick(e) {
  e.preventDefault();
  const cell = e.target.closest('.ms-cell');
  if (!cell) return;
  const x = parseInt(cell.dataset.x), y = parseInt(cell.dataset.y);
  flagCell(x, y);
}

function flagCell(x, y) {
  if (activeMode === 'classic') {
    if (!classicState || classicState.board.state !== 'playing') return;
    doToggleFlag(classicState, x, y);
    const c = classicState.board.cells[y][x];
    const el = getCellEl(x, y);
    if (el) {
      el.className = 'ms-cell' + (c.state === 'flagged' ? ' flagged' : '');
      el.textContent = c.state === 'flagged' ? '⚑' : '';
    }
    updateHUD();
  } else if (activeMode === 'endless') {
    const sect = getActiveSection();
    if (!sect?.board || sect.board.state !== 'playing') return;
    doToggleFlag({ board: sect.board }, x, y);
    const c = sect.board.cells[y][x];
    const el = getCellEl(x, y);
    if (el) {
      el.className = 'ms-cell' + (c.state === 'flagged' ? ' flagged' : '');
      el.textContent = c.state === 'flagged' ? '⚑' : '';
    }
    updateHUD();
  }
}

function handleClassicClick(x, y) {
  if (!classicState) return;
  const b = classicState.board;
  if (b.state !== 'playing') return;
  const c = b.cells[y][x];

  if (!b.firstClickDone) {
    doFirstClick(classicState, x, y);
    startTimer(() => updateHUD());
    renderBoard();
    if (b.state === 'won') onClassicWin();
    return;
  }

  if (c.state === 'revealed') {
    const { revealed, exploded } = doChord(classicState, x, y);
    animateReveal(revealed);
    if (exploded) onClassicLose(x, y);
    else if (b.state === 'won') onClassicWin();
    return;
  }

  const { revealed, exploded } = doReveal(classicState, x, y);
  animateReveal(revealed);
  if (exploded) onClassicLose(x, y);
  else if (b.state === 'won') onClassicWin();
  updateHUD();
}

function onClassicWin() {
  stopTimer();
  const b = classicState.board;
  const elapsed = b.endTime && b.startTime ? Math.round((b.endTime - b.startTime) / 1000) : 0;
  renderBoard();
  const board = containerEl.querySelector('#ms-board');
  if (board) {
    board.classList.add('win-glow');
    setTimeout(() => board.classList.remove('win-glow'), 800);
  }
  showOverlay('✓ CLEARED', `Time: ${formatTime(elapsed)}`, 'PLAY AGAIN');
  optRef?.onGameEnd?.('classic', 'win', { difficulty: activeDifficulty, timeSeconds: elapsed });
}

function onClassicLose(hx, hy) {
  stopTimer();
  renderBoard(hx, hy);
  const board = containerEl.querySelector('#ms-board');
  if (board) {
    board.classList.add('shake', 'loss-pulse');
    setTimeout(() => board.classList.remove('shake', 'loss-pulse'), 300);
  }
  showOverlay('✗ BOOM', 'A mine was triggered.', 'TRY AGAIN');
  optRef?.onGameEnd?.('classic', 'lose', { difficulty: activeDifficulty });
}

// ── Endless game flow ─────────────────────────────────────────────────────────

function startEndless(reset) {
  stopTimer();
  activeMode = 'endless';
  if (reset || !endlessWorld) {
    endlessWorld = newEndlessWorld((Date.now() ^ (Math.random() * 0x7fffffff | 0)) >>> 0);
  }
  currentSection = { ...endlessWorld.currentSection };
  hideOverlay();
  showEndlessMap();
  updateHUD();
}

function showEndlessMap() {
  const boardWrap = containerEl.querySelector('#ms-board-wrap');
  boardWrap.innerHTML = `
    <div id="ms-map-wrap">
      <div class="ms-map-label">World Map — click a section to play</div>
      <div id="ms-map"></div>
    </div>
    <div id="ms-overlay" style="display:none">
      <div id="ms-overlay-title"></div>
      <div id="ms-overlay-sub"></div>
      <button id="ms-overlay-btn">RETRY</button>
    </div>`;

  boardWrap.querySelector('#ms-overlay-btn').addEventListener('click', () => {
    if (activeMode === 'endless') {
      const s = getActiveSection();
      if (s) { endlessFail(endlessWorld, currentSection.x, currentSection.y); saveEndless(); }
      hideOverlay(); showEndlessBoard();
    }
  });

  renderEndlessMap();
  boardWrap.querySelector('#ms-map').addEventListener('click', e => {
    const mc = e.target.closest('.ms-map-cell');
    if (!mc || mc.classList.contains('locked')) return;
    const gx = parseInt(mc.dataset.gx), gy = parseInt(mc.dataset.gy);
    currentSection = { x: gx, y: gy };
    endlessWorld.currentSection = { x: gx, y: gy };
    showEndlessBoard();
  });
}

function renderEndlessMap() {
  const mapEl = containerEl.querySelector('#ms-map');
  if (!mapEl) return;

  // Find bounds of known sections
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  for (const key of Object.keys(endlessWorld.sections)) {
    const { x, y } = endlessWorld.sections[key];
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  // Pad by 1
  minX--; maxX++; minY--; maxY++;

  const cols = maxX - minX + 1;
  const rows = maxY - minY + 1;
  mapEl.style.gridTemplateColumns = `repeat(${cols}, 32px)`;
  mapEl.style.gridTemplateRows = `repeat(${rows}, 32px)`;
  mapEl.innerHTML = '';

  for (let r = minY; r <= maxY; r++) {
    for (let c = minX; c <= maxX; c++) {
      const el = document.createElement('div');
      el.className = 'ms-map-cell';
      el.dataset.gx = c; el.dataset.gy = r;
      const key = sectionKey(c, r);
      const sect = endlessWorld.sections[key];
      if (!sect) { el.classList.add('locked'); el.textContent = '·'; }
      else if (sect.status === 'cleared') { el.classList.add('cleared'); el.textContent = '✓'; }
      else {
        el.classList.add('active');
        if (currentSection.x === c && currentSection.y === r) el.classList.add('current');
        el.textContent = minesFor(chebyshev(c, r));
      }
      mapEl.appendChild(el);
    }
  }
}

function showEndlessBoard() {
  const boardWrap = containerEl.querySelector('#ms-board-wrap');
  const sect = getActiveSection();
  if (!sect || sect.status === 'cleared') { showEndlessMap(); return; }

  boardWrap.innerHTML = `
    <div id="ms-board"></div>
    <div id="ms-overlay" style="display:none">
      <div id="ms-overlay-title"></div>
      <div id="ms-overlay-sub"></div>
      <button id="ms-overlay-btn">RETRY</button>
    </div>`;

  const boardEl = boardWrap.querySelector('#ms-board');
  boardEl.addEventListener('click', onBoardClick);
  boardEl.addEventListener('contextmenu', onBoardRightClick);

  // Touch hold for flags
  let tt = null, tm = false;
  boardEl.addEventListener('touchstart', e => {
    tm = false;
    const cell = e.target.closest('.ms-cell');
    if (!cell) return;
    tt = setTimeout(() => { if (!tm) flagCell(parseInt(cell.dataset.x), parseInt(cell.dataset.y)); }, 500);
  }, { passive: true });
  boardEl.addEventListener('touchmove', () => { tm = true; if (tt) { clearTimeout(tt); tt = null; } }, { passive: true });
  boardEl.addEventListener('touchend', () => { if (tt) { clearTimeout(tt); tt = null; } });

  boardWrap.querySelector('#ms-overlay-btn').addEventListener('click', () => {
    endlessFail(endlessWorld, currentSection.x, currentSection.y);
    saveEndless();
    hideOverlay();
    showEndlessBoard();
  });

  if (!sect.board.startTime) sect.board.startTime = Date.now();
  startTimer(() => updateHUD());
  renderBoard();
  updateHUD();
}

function handleEndlessClick(x, y) {
  const sect = getActiveSection();
  if (!sect?.board) return;
  const b = sect.board;
  if (b.state !== 'playing') return;
  const c = b.cells[y][x];

  const cs = { board: b };
  if (c.state === 'revealed') {
    const { revealed, exploded } = doChord(cs, x, y);
    animateReveal(revealed);
    if (exploded) onEndlessLose();
    else if (checkWin(b)) onEndlessWin();
    return;
  }

  const { revealed, exploded } = doReveal(cs, x, y);
  animateReveal(revealed);
  if (exploded) onEndlessLose();
  else if (checkWin(b)) onEndlessWin();
  updateHUD();
}

function onEndlessWin() {
  stopTimer();
  const sect = getActiveSection();
  const b = sect?.board;
  const elapsed = b?.endTime && b?.startTime ? Math.round((b.endTime - b.startTime) / 1000) : 0;
  renderBoard();
  showOverlay('✓ SECTION CLEAR', `${minesFor(chebyshev(currentSection.x, currentSection.y))} mines defused in ${formatTime(elapsed)}`, 'MAP');
  endlessClear(endlessWorld, currentSection.x, currentSection.y);
  saveEndless();
  optRef?.onGameEnd?.('endless', 'win', { section: currentSection, timeSeconds: elapsed });
  containerEl.querySelector('#ms-overlay-btn').onclick = () => { hideOverlay(); showEndlessMap(); };
}

function onEndlessLose() {
  stopTimer();
  const sect = getActiveSection();
  if (sect) { sect.board.endTime = Date.now(); }
  renderBoard();
  showOverlay('✗ DETONATED', `Fail #${(getActiveSection()?.failCount || 0) + 1} — board regenerated`, 'RETRY');
  containerEl.querySelector('#ms-overlay-btn').onclick = () => {
    endlessFail(endlessWorld, currentSection.x, currentSection.y);
    saveEndless();
    hideOverlay();
    showEndlessBoard();
  };
}

function getActiveSection() {
  if (!endlessWorld || !currentSection) return null;
  return endlessWorld.sections[sectionKey(currentSection.x, currentSection.y)] || null;
}

function saveEndless() {
  if (!endlessWorld) return;
  optRef?.onSave?.('endless', endlessWorld);
}

// ── Board rendering ───────────────────────────────────────────────────────────

function showBoard() {
  const bw = containerEl.querySelector('#ms-board-wrap');
  bw.innerHTML = `
    <div id="ms-board"></div>
    <div id="ms-overlay" style="display:none">
      <div id="ms-overlay-title"></div>
      <div id="ms-overlay-sub"></div>
      <button id="ms-overlay-btn">PLAY AGAIN</button>
    </div>`;
  const boardEl = bw.querySelector('#ms-board');
  boardEl.addEventListener('click', onBoardClick);
  boardEl.addEventListener('contextmenu', onBoardRightClick);
  let tt = null, tm = false;
  boardEl.addEventListener('touchstart', e => {
    tm = false;
    const cell = e.target.closest('.ms-cell');
    if (!cell) return;
    tt = setTimeout(() => { if (!tm) flagCell(parseInt(cell.dataset.x), parseInt(cell.dataset.y)); }, 500);
  }, { passive: true });
  boardEl.addEventListener('touchmove', () => { tm = true; if (tt) { clearTimeout(tt); tt = null; } }, { passive: true });
  boardEl.addEventListener('touchend', () => { if (tt) { clearTimeout(tt); tt = null; } });
  bw.querySelector('#ms-overlay-btn').addEventListener('click', () => {
    if (activeMode === 'classic') startClassic(activeDifficulty);
    else if (activeMode === 'endless') startEndless(true);
  });
}

function getActiveBoard() {
  if (activeMode === 'classic') return classicState?.board;
  if (activeMode === 'endless') return getActiveSection()?.board;
  return null;
}

function renderBoard(explodedX, explodedY) {
  const b = getActiveBoard();
  if (!b) return;
  const boardEl = containerEl.querySelector('#ms-board');
  if (!boardEl) return;

  const cs = computeCellSize(b.width, b.height);

  boardEl.style.gridTemplateColumns = `repeat(${b.width}, ${cs}px)`;
  boardEl.style.gridTemplateRows = `repeat(${b.height}, ${cs}px)`;
  boardEl.innerHTML = '';

  const frag = document.createDocumentFragment();
  for (let y = 0; y < b.height; y++) {
    for (let x = 0; x < b.width; x++) {
      const c = b.cells[y][x];
      const el = document.createElement('div');
      el.className = 'ms-cell';
      el.dataset.x = x; el.dataset.y = y;
      el.style.width = cs + 'px'; el.style.height = cs + 'px';
      el.style.fontSize = Math.max(9, Math.floor(cs * 0.52)) + 'px';
      applyCellContent(el, c, x === explodedX && y === explodedY);
      frag.appendChild(el);
    }
  }
  boardEl.appendChild(frag);
}

function applyCellContent(el, c, isExploded) {
  el.className = 'ms-cell';
  el.removeAttribute('data-num');
  el.textContent = '';
  if (c.state === 'hidden') return;
  if (c.state === 'flagged') {
    el.classList.add('flagged');
    el.textContent = '🚩';
    return;
  }
  // revealed
  el.classList.add('revealed');
  if (c.mine) {
    if (isExploded) el.classList.add('mine-hit');
    else el.classList.add('mine-shown');
    el.textContent = '💣';
    return;
  }
  if (c.adjacency > 0) {
    el.textContent = c.adjacency;
    el.setAttribute('data-num', c.adjacency);
  }
}

function updateCells(changedCells) {
  // changedCells: [{x, y}] — only patch those divs
  const b = getActiveBoard();
  if (!b) return;
  for (const { x, y } of changedCells) {
    const el = getCellEl(x, y);
    if (!el) continue;
    const c = b.cells[y][x];
    applyCellContent(el, c, false);
  }
}

function animateReveal(revealed) {
  const b = getActiveBoard();
  if (!b) return;
  for (const { x, y, dist } of revealed) {
    const el = getCellEl(x, y);
    if (!el) continue;
    const c = b.cells[y][x];
    applyCellContent(el, c, false);
    const delay = Math.min(dist * 18, 180);
    el.style.animationDelay = delay + 'ms';
    el.classList.add('just-revealed');
    el.addEventListener('animationend', () => el.classList.remove('just-revealed'), { once: true });
  }
}

function getCellEl(x, y) {
  return containerEl.querySelector(`.ms-cell[data-x="${x}"][data-y="${y}"]`);
}

function computeCellSize(w, h) {
  const boardWrap = containerEl.querySelector('#ms-board-wrap');
  if (!boardWrap) return 20;
  const availW = boardWrap.clientWidth - 16;
  const availH = boardWrap.clientHeight - 16;
  const byW = Math.floor(availW / w);
  const byH = Math.floor(availH / h);
  return Math.max(10, Math.min(byW, byH, 36));
}

// ── HUD & Timer ───────────────────────────────────────────────────────────────

function updateHUD() {
  const b = getActiveBoard();
  const flagEl = containerEl.querySelector('#ms-flag-count');
  const timeEl = containerEl.querySelector('#ms-timer');
  if (!flagEl || !timeEl) return;
  if (!b) { flagEl.textContent = '0'; timeEl.textContent = '00:00'; return; }
  const remaining = b.mineCount - b.flagCount;
  flagEl.textContent = String(remaining);
  if (b.startTime) {
    const elapsed = b.endTime ? b.endTime - b.startTime : Date.now() - b.startTime;
    timeEl.textContent = formatTime(Math.floor(elapsed / 1000));
  } else {
    timeEl.textContent = '00:00';
  }
}

function startTimer(cb) {
  stopTimer();
  timerInterval = setInterval(cb, 500);
}

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

function formatTime(s) {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

// ── Overlay ───────────────────────────────────────────────────────────────────

function showOverlay(title, sub, btnLabel) {
  const ov = containerEl.querySelector('#ms-overlay');
  if (!ov) return;
  ov.style.display = 'flex';
  const t = ov.querySelector('#ms-overlay-title');
  const s = ov.querySelector('#ms-overlay-sub');
  const b = ov.querySelector('#ms-overlay-btn');
  if (t) {
    t.textContent = title;
    t.className = title.startsWith('✓') ? 'win' : 'lose';
  }
  if (s) s.textContent = sub;
  if (b) b.textContent = btnLabel;
}

function hideOverlay() {
  const ov = containerEl.querySelector('#ms-overlay');
  if (ov) ov.style.display = 'none';
}

// ── Destroy ───────────────────────────────────────────────────────────────────

export function destroy() {
  stopTimer();
  if (containerEl) { containerEl.innerHTML = ''; containerEl = null; }
  const st = document.getElementById('ms-styles');
  if (st) st.remove();
  classicState = null;
  endlessWorld = null;
  activeMode = null;
  optRef = null;
}
