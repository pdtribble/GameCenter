// Minesweeper renderer — dark phosphor-green terminal aesthetic
// Self-contained: includes all game logic inline (no server-side imports).

// ── Inline classic game logic ─────────────────────────────────────────────────

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

// ── Endless mode (new) — 8×8 section-based canvas world ─────────────────────

const EW_SS = 8;                    // section size in cells
const EW_MINES = 10;                // mines per section
const EW_CELL_MIN = 14, EW_CELL_MAX = 48, EW_CELL_DEFAULT = 28;
const EW_NUM_COLORS = ['', '#58a6ff','#3fb950','#f85149','#1f6feb','#da3633','#2ea043','#8b949e','#30363d'];
const EW_C = {
  bgWorld: '#0d1117', locked: '#21262d', unrevealed: '#1c2128', revealed: '#0d1117',
  borderInner: 'rgba(48,54,61,0.8)', borderSect: 'rgba(88,166,255,0.4)',
  clearedDim: 'rgba(0,0,0,0.22)', failedDim: 'rgba(180,0,0,0.25)',
  flag: '#f78166', mine: '#ff6b6b', text: '#e6edf3',
};

// ── Endless world logic functions ─────────────────────────────────────────────

function ewToSect(x, y) {
  const sX = Math.floor(x / EW_SS);
  const sY = Math.floor(y / EW_SS);
  const localX = ((x % EW_SS) + EW_SS) % EW_SS;
  const localY = ((y % EW_SS) + EW_SS) % EW_SS;
  return { sX, sY, localX, localY };
}

function ewGetSect(world, sX, sY) {
  const key = `${sX},${sY}`;
  if (!world.sections.has(key)) {
    world.sections.set(key, { sX, sY, status: (sX === 0 && sY === 0) ? 'active' : 'locked', resetCount: 0, mines: new Set() });
  }
  return world.sections.get(key);
}

function ewGenMines(world, sX, sY, resetCount, safeSet) {
  let seed = world.seed ^ (sX * 1000003) ^ (sY * 999983);
  if (resetCount > 0) seed ^= resetCount * 7919;
  const rng = mulberry32(seed >>> 0);
  const positions = [];
  for (let i = 0; i < 64; i++) positions.push(i);
  for (let i = 63; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  const mines = new Set();
  for (const pos of positions) {
    if (mines.size >= EW_MINES) break;
    const lx = pos % EW_SS, ly = Math.floor(pos / EW_SS);
    if (!safeSet || !safeSet.has(`${lx},${ly}`)) mines.add(`${lx},${ly}`);
  }
  return mines;
}

function ewIsMine(world, x, y) {
  const { sX, sY, localX, localY } = ewToSect(x, y);
  const sect = world.sections.get(`${sX},${sY}`);
  if (!sect || sect.status === 'locked') return false;
  return sect.mines.has(`${localX},${localY}`);
}

function ewGetCell(world, x, y) {
  const key = `${x},${y}`;
  if (!world.cells.has(key)) {
    world.cells.set(key, { x, y, mine: ewIsMine(world, x, y), adjacency: 0, state: 'hidden', flagged: false });
  }
  return world.cells.get(key);
}

function ewCalcAdj(world, x, y) {
  const cell = ewGetCell(world, x, y);
  if (cell.mine) return -1;
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (ewIsMine(world, x + dx, y + dy)) count++;
    }
  }
  cell.adjacency = count;
  return count;
}

function ewReveal(world, sx, sy) {
  const revealed = [];
  const q = [{ x: sx, y: sy, dist: 0 }];
  const seen = new Set([`${sx},${sy}`]);
  while (q.length) {
    const { x, y, dist } = q.shift();
    const cell = ewGetCell(world, x, y);
    if (cell.state === 'revealed' || cell.flagged || cell.mine) continue;
    cell.state = 'revealed';
    revealed.push({ x, y, dist });
    ewCalcAdj(world, x, y);
    if (cell.adjacency === 0) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx, ny = y + dy;
          const { sX, sY } = ewToSect(nx, ny);
          const ns = world.sections.get(`${sX},${sY}`);
          if (!ns || ns.status === 'locked') continue;
          const k = `${nx},${ny}`;
          if (!seen.has(k) && !ewGetCell(world, nx, ny).flagged) {
            seen.add(k);
            q.push({ x: nx, y: ny, dist: dist + 1 });
          }
        }
      }
    }
  }
  return revealed;
}

function ewIsSectionCleared(world, sX, sY) {
  const sect = ewGetSect(world, sX, sY);
  for (let ly = 0; ly < EW_SS; ly++) {
    for (let lx = 0; lx < EW_SS; lx++) {
      const key = `${sX * EW_SS + lx},${sY * EW_SS + ly}`;
      const cell = world.cells.get(key);
      if (!cell) return false;
      if (!cell.mine && cell.state !== 'revealed') return false;
    }
  }
  return true;
}

function ewUnlockNeighbors(world, sX, sY) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nSX = sX + dx, nSY = sY + dy;
      const ns = ewGetSect(world, nSX, nSY);
      if (ns.status === 'locked') {
        ns.status = 'active';
        ns.mines = ewGenMines(world, nSX, nSY, 0, null);
      }
    }
  }
}

function ewRecalcBorders(world, sX, sY) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nSX = sX + dx, nSY = sY + dy;
      const ns = world.sections.get(`${nSX},${nSY}`);
      if (!ns || ns.status === 'locked') continue;
      for (let lx = 0; lx < EW_SS; lx++) {
        for (let ly = 0; ly < EW_SS; ly++) {
          const x = nSX * EW_SS + lx, y = nSY * EW_SS + ly;
          const cell = ewGetCell(world, x, y);
          if (cell.state === 'revealed') ewCalcAdj(world, x, y);
        }
      }
    }
  }
}

function ewCheckClear(world, sX, sY) {
  if (ewIsSectionCleared(world, sX, sY)) {
    const sect = ewGetSect(world, sX, sY);
    sect.status = 'cleared';
    ewUnlockNeighbors(world, sX, sY);
    ewRecalcBorders(world, sX, sY);
    sect.clearTime = Date.now();
  }
}

function ewFlag(world, x, y) {
  const { sX, sY } = ewToSect(x, y);
  const sect = ewGetSect(world, sX, sY);
  if (sect.status === 'locked' || sect.status === 'failed') return;
  const cell = ewGetCell(world, x, y);
  cell.flagged = !cell.flagged;
  if (cell.flagged) world.flagCount++;
  else world.flagCount--;
}

function ewChord(world, x, y) {
  const cell = ewGetCell(world, x, y);
  if (cell.state !== 'revealed' || cell.adjacency <= 0) return { revealed: [], exploded: false };
  let flagged = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (ewGetCell(world, x + dx, y + dy).flagged) flagged++;
    }
  }
  if (flagged !== cell.adjacency) return { revealed: [], exploded: false };
  let allRevealed = [], anyExploded = false;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      const nc = ewGetCell(world, nx, ny);
      if (nc.state === 'hidden' && !nc.flagged) {
        if (nc.mine) { nc.state = 'revealed'; anyExploded = true; }
        else {
          const r = ewReveal(world, nx, ny);
          allRevealed = allRevealed.concat(r);
        }
      }
    }
  }
  return { revealed: allRevealed, exploded: anyExploded };
}

function ewRetry(world, sX, sY) {
  const sect = ewGetSect(world, sX, sY);
  sect.resetCount++;
  sect.status = 'active';
  sect.mines = ewGenMines(world, sX, sY, sect.resetCount, null);
  for (let ly = 0; ly < EW_SS; ly++) {
    for (let lx = 0; lx < EW_SS; lx++) {
      const key = `${sX * EW_SS + lx},${sY * EW_SS + ly}`;
      const cell = world.cells.get(key);
      if (cell) {
        cell.state = 'hidden';
        cell.flagged = false;
        cell.mine = ewIsMine(world, cell.x, cell.y);
        cell.adjacency = 0;
      }
    }
  }
  world.failureUI = null;
  ewRecalcBorders(world, sX, sY);
}

function ewNewWorld(seed) {
  return {
    seed: seed >>> 0,
    sections: new Map(),
    cells: new Map(),
    phase: 'playing',
    firstClick: true,
    flagCount: 0,
    failureUI: null,
    startTime: null,
  };
}

function ewSerialize(world, viewX, viewY, cellSize) {
  const sections = {}, cells = {};
  for (const [k, s] of world.sections) {
    sections[k] = { sX: s.sX, sY: s.sY, status: s.status, resetCount: s.resetCount, mines: Array.from(s.mines) };
  }
  for (const [k, c] of world.cells) {
    cells[k] = { x: c.x, y: c.y, mine: c.mine, adjacency: c.adjacency, state: c.state, flagged: c.flagged };
  }
  return { seed: world.seed, sections, cells, phase: world.phase, firstClick: world.firstClick, flagCount: world.flagCount, startTime: world.startTime, viewX, viewY, cellSize };
}

function ewDeserialize(data) {
  if (!data?.seed) return null;
  const world = ewNewWorld(data.seed);
  world.phase = data.phase || 'playing';
  world.firstClick = data.firstClick !== false;
  world.flagCount = data.flagCount || 0;
  world.startTime = data.startTime || null;
  if (data.sections) {
    for (const [k, s] of Object.entries(data.sections)) {
      world.sections.set(k, { sX: s.sX, sY: s.sY, status: s.status, resetCount: s.resetCount, mines: new Set(s.mines) });
    }
  }
  if (data.cells) {
    for (const [k, c] of Object.entries(data.cells)) {
      world.cells.set(k, { x: c.x, y: c.y, mine: c.mine, adjacency: c.adjacency, state: c.state, flagged: c.flagged });
    }
  }
  return { world, viewX: data.viewX || 0, viewY: data.viewY || 0, cellSize: data.cellSize || EW_CELL_DEFAULT };
}

// ── Renderer state ────────────────────────────────────────────────────────────

let containerEl   = null;
let timerInterval = null;
let classicState  = null;
let activeMode    = null;
let activeDifficulty = 'beginner';
let optRef        = null;

let ewWorld       = null;
let ewCanvas      = null;
let ewCtx         = null;
let ewRafId       = null;
let ewDirty       = true;
let ewAutoSaveId  = null;
let ewCellSize    = EW_CELL_DEFAULT;
let ewViewX       = 0;
let ewViewY       = 0;
let ewHoverCell   = null;
let ewHoverSect   = null;
let ewHandlers    = {};
let ewFailRects   = null;

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
    #ms-revealed-count { color: #3fb950; }
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

    .ms-cell[data-num="1"] { color: #58a6ff; }
    .ms-cell[data-num="2"] { color: #3fb950; }
    .ms-cell[data-num="3"] { color: #f85149; }
    .ms-cell[data-num="4"] { color: #a371f7; }
    .ms-cell[data-num="5"] { color: #db6d28; }
    .ms-cell[data-num="6"] { color: #2ea043; }
    .ms-cell[data-num="7"] { color: #8b949e; }
    .ms-cell[data-num="8"] { color: #6e7681; }

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

    #ms-board.win-glow {
      animation: ms-win-glow 0.8s ease-out;
    }
    @keyframes ms-win-glow {
      0% { box-shadow: 0 0 0 rgba(63,185,80,0); }
      50% { box-shadow: 0 0 40px rgba(63,185,80,0.6), inset 0 0 20px rgba(63,185,80,0.2); }
      100% { box-shadow: 0 4px 24px rgba(0,0,0,0.4); }
    }

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

    #ms-ew-wrap { position: relative; flex: 1; overflow: hidden; display: none; }
    #ms-ew-wrap.active { display: flex; }
    #ms-ew-canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; cursor: crosshair; display: block; }
    #ms-ew-canvas.panning { cursor: grabbing; }
    #ms-ew-hud { position: absolute; top: 0; left: 0; right: 0; background: rgba(13,17,23,0.9);
                  border-bottom: 1px solid rgba(88,166,255,0.2); padding: 8px 16px;
                  font: 12px "DM Mono",monospace; color: #e6edf3; letter-spacing: 1px;
                  display: flex; justify-content: space-between; align-items: center; z-index: 5; }
    #ms-ew-coords { position: absolute; top: 40px; left: 0; right: 0; text-align: center; font-size: 10px;
                    color: rgba(230,237,243,0.4); padding: 2px 16px; background: rgba(13,17,23,0.9);
                    letter-spacing: 1px; z-index: 4; }

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
        <div class="ms-hud-pill" id="ms-sections-pill" style="display:none">
          <span class="ms-icon">🔓</span>
          <span id="ms-sections-cleared">0</span>
          <span style="color:rgba(57,255,20,0.5)">SECTIONS</span>
        </div>
        <div class="ms-hud-pill">
          <span class="ms-icon">⏱</span>
          <span id="ms-timer">00:00</span>
        </div>
        <div class="ms-hud-pill" id="ms-revealed-pill" style="display:none">
          <span class="ms-icon" id="ms-revealed-icon">⛏</span>
          <span id="ms-revealed-count">0</span>
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
          <span class="ms-section-label">Endless</span>
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
        <div id="ms-ew-wrap">
          <canvas id="ms-ew-canvas"></canvas>
          <div id="ms-ew-hud"></div>
          <div id="ms-ew-coords"></div>
        </div>
      </div>
    </div>`;

  // Restore endless save if available
  const ewSaveData = options?.initialSave?.endless;
  if (ewSaveData) {
    try {
      const d = typeof ewSaveData === 'string' ? JSON.parse(ewSaveData) : ewSaveData;
      if (d?.seed) {
        const r = ewDeserialize(d);
        if (r) { ewWorld = r.world; ewViewX = r.viewX; ewViewY = r.viewY; ewCellSize = r.cellSize || EW_CELL_DEFAULT; }
      }
    } catch(e) {}
  }

  // Wire sidebar
  const sidebar = container.querySelector('#ms-sidebar');
  sidebar.addEventListener('click', e => {
    const btn = e.target.closest('.ms-mode-btn');
    if (!btn) return;
    sidebar.querySelectorAll('.ms-mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (btn.dataset.mode === 'classic') startClassic(btn.dataset.diff || 'beginner');
    else if (btn.dataset.mode === 'endless') startEndless();
  });

  container.querySelector('#ms-reset-btn').addEventListener('click', () => {
    if (activeMode === 'classic') startClassic(activeDifficulty);
  });

  container.querySelector('#ms-home-btn').addEventListener('click', () => {
    if (options?.navigate) options.navigate('singleplayer');
  });

  // Classic overlay btn (endless has its own death overlay)
  container.querySelector('#ms-overlay-btn').addEventListener('click', () => {
    if (activeMode === 'classic') startClassic(activeDifficulty);
  });

  // Board delegated listeners for classic mode
  const boardEl = container.querySelector('#ms-board');
  boardEl.addEventListener('click', onBoardClick);
  boardEl.addEventListener('contextmenu', onBoardRightClick);
  let touchTimer = null, touchMoved = false;
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

  startClassic('beginner');
}

// ── Classic game flow ─────────────────────────────────────────────────────────

function startClassic(difficulty) {
  stopTimer();
  activeMode = 'classic';
  activeDifficulty = difficulty;

  const rb = containerEl?.querySelector('#ms-reset-btn');
  if (rb) rb.style.display = '';
  const rp = containerEl?.querySelector('#ms-revealed-pill');
  if (rp) rp.style.display = 'none';

  // Restore board-wrap padding for classic
  const bw = containerEl?.querySelector('#ms-board-wrap');
  if (bw) { bw.style.padding = ''; bw.style.alignItems = ''; bw.style.justifyContent = ''; }

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
}

function onBoardRightClick(e) {
  e.preventDefault();
  const cell = e.target.closest('.ms-cell');
  if (!cell) return;
  flagCell(parseInt(cell.dataset.x), parseInt(cell.dataset.y));
}

function flagCell(x, y) {
  if (activeMode !== 'classic' || !classicState || classicState.board.state !== 'playing') return;
  doToggleFlag(classicState, x, y);
  const c = classicState.board.cells[y][x];
  const el = getCellEl(x, y);
  if (el) {
    el.className = 'ms-cell' + (c.state === 'flagged' ? ' flagged' : '');
    el.textContent = c.state === 'flagged' ? '⚑' : '';
  }
  updateHUD();
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
  if (board) { board.classList.add('win-glow'); setTimeout(() => board.classList.remove('win-glow'), 800); }
  showOverlay('✓ CLEARED', `Time: ${formatTime(elapsed)}`, 'PLAY AGAIN');
  optRef?.onGameEnd?.('classic', 'win', { difficulty: activeDifficulty, timeSeconds: elapsed });
}

function onClassicLose(hx, hy) {
  stopTimer();
  renderBoard(hx, hy);
  const board = containerEl.querySelector('#ms-board');
  if (board) { board.classList.add('shake', 'loss-pulse'); setTimeout(() => board.classList.remove('shake', 'loss-pulse'), 300); }
  showOverlay('✗ BOOM', 'A mine was triggered.', 'TRY AGAIN');
  optRef?.onGameEnd?.('classic', 'lose', { difficulty: activeDifficulty });
}

// ── Endless mode (new) — canvas rendering & input ───────────────────────────

function startEndless(reset) {
  stopTimer();
  activeMode = 'endless';

  const rb = containerEl?.querySelector('#ms-reset-btn');
  if (rb) rb.style.display = 'none';
  const rp = containerEl?.querySelector('#ms-revealed-pill');
  if (rp) rp.style.display = 'none';

  ewStop();

  const wrap = containerEl?.querySelector('#ms-ew-wrap');
  if (!wrap) return;
  wrap.classList.add('active');

  if (reset || !ewWorld) {
    ewWorld = ewNewWorld(Math.random() * 0x100000000 >>> 0);
    ewWorld.sections.set('0,0', { sX: 0, sY: 0, status: 'active', resetCount: 0, mines: new Set() });
    ewCellSize = EW_CELL_DEFAULT;
    ewViewX = 0;
    ewViewY = 0;
  }

  ewCanvas = wrap.querySelector('#ms-ew-canvas');
  ewCtx = ewCanvas.getContext('2d', { alpha: false });
  ewDirty = true;
  ewFailRects = null;

  ewInitInput();
  ewRenderLoop();
  ewStartAutoSave();
}

function ewStop() {
  if (ewRafId) { cancelAnimationFrame(ewRafId); ewRafId = null; }
  if (ewCanvas) {
    for (const [evt, handler] of Object.entries(ewHandlers)) {
      ewCanvas.removeEventListener(evt, handler);
    }
    ewHandlers = {};
  }
  const wrap = containerEl?.querySelector('#ms-ew-wrap');
  if (wrap) wrap.classList.remove('active');
}

function ewRenderLoop() {
  const wrap = containerEl?.querySelector('#ms-ew-wrap');
  if (!wrap || !ewCanvas) return;

  const dpr = window.devicePixelRatio || 1;
  const w = wrap.clientWidth, h = wrap.clientHeight;
  if (ewCanvas.width !== w * dpr || ewCanvas.height !== h * dpr) {
    ewCanvas.width = w * dpr;
    ewCanvas.height = h * dpr;
    ewCtx.scale(dpr, dpr);
    ewDirty = true;
  }

  if (ewDirty) {
    ewDraw();
    ewDirty = false;
  }
  ewRafId = requestAnimationFrame(ewRenderLoop);
}

function ewDraw() {
  if (!ewCtx || !ewCanvas || !ewWorld) return;
  const w = ewCanvas.width / (window.devicePixelRatio || 1);
  const h = ewCanvas.height / (window.devicePixelRatio || 1);

  ewCtx.fillStyle = EW_C.bgWorld;
  ewCtx.fillRect(0, 0, w, h);

  const minSX = Math.floor((ewViewX - 0) / EW_SS);
  const maxSX = Math.ceil((ewViewX + w / ewCellSize) / EW_SS);
  const minSY = Math.floor((ewViewY - 0) / EW_SS);
  const maxSY = Math.ceil((ewViewY + h / ewCellSize) / EW_SS);

  ewFailRects = null;
  for (let sX = minSX; sX <= maxSX; sX++) {
    for (let sY = minSY; sY <= maxSY; sY++) {
      const px = (sX * EW_SS - ewViewX) * ewCellSize;
      const py = (sY * EW_SS - ewViewY) * ewCellSize;
      ewDrawSection(sX, sY, px, py);
    }
  }

  ewCtx.strokeStyle = EW_C.borderSect;
  ewCtx.lineWidth = 1.5;
  for (let sX = minSX; sX <= maxSX; sX++) {
    for (let sY = minSY; sY <= maxSY; sY++) {
      const px = (sX * EW_SS - ewViewX) * ewCellSize;
      const py = (sY * EW_SS - ewViewY) * ewCellSize;
      const sz = EW_SS * ewCellSize;
      ewCtx.strokeRect(px, py, sz, sz);
    }
  }

  ewUpdateHUD();
}

function ewDrawSection(sX, sY, px, py) {
  const sect = ewWorld.sections.get(`${sX},${sY}`);
  const sz = EW_SS * ewCellSize;

  if (!sect || sect.status === 'locked') {
    ewCtx.fillStyle = EW_C.locked;
    ewCtx.fillRect(px, py, sz, sz);
    return;
  }

  for (let ly = 0; ly < EW_SS; ly++) {
    for (let lx = 0; lx < EW_SS; lx++) {
      const x = sX * EW_SS + lx, y = sY * EW_SS + ly;
      const cpx = px + lx * ewCellSize, cpy = py + ly * ewCellSize;
      ewDrawCell(x, y, cpx, cpy);
    }
  }

  if (sect.status === 'cleared') {
    ewCtx.fillStyle = EW_C.clearedDim;
    ewCtx.fillRect(px, py, sz, sz);
  }
  if (sect.status === 'failed') {
    ewCtx.fillStyle = EW_C.failedDim;
    ewCtx.fillRect(px, py, sz, sz);
  }
}

function ewDrawCell(x, y, px, py) {
  const cs = ewCellSize;
  const cell = ewGetCell(ewWorld, x, y);

  if (!cell.flagged && cell.state === 'hidden') {
    ewCtx.fillStyle = EW_C.unrevealed;
    ewCtx.fillRect(px, py, cs, cs);
    ewCtx.fillStyle = 'rgba(255,255,255,0.06)';
    ewCtx.fillRect(px, py, cs, 1);
    ewCtx.fillRect(px, py, 1, cs);
    return;
  }

  if (cell.flagged) {
    ewCtx.fillStyle = EW_C.unrevealed;
    ewCtx.fillRect(px, py, cs, cs);
    const fx = px + cs / 2, fy = py + cs / 3;
    ewCtx.fillStyle = EW_C.flag;
    ewCtx.beginPath();
    ewCtx.moveTo(fx - 2, fy);
    ewCtx.lineTo(fx + 2, fy);
    ewCtx.lineTo(fx + 2, fy + 4);
    ewCtx.lineTo(fx - 2, fy + 4);
    ewCtx.closePath();
    ewCtx.fill();
    return;
  }

  if (cell.state !== 'revealed') return;

  ewCtx.fillStyle = EW_C.revealed;
  ewCtx.fillRect(px, py, cs, cs);

  if (cell.mine) {
    ewCtx.fillStyle = EW_C.mine;
    ewCtx.beginPath();
    ewCtx.arc(px + cs / 2, py + cs / 2, cs / 4, 0, Math.PI * 2);
    ewCtx.fill();
    return;
  }

  if (cell.adjacency > 0) {
    ewCtx.fillStyle = EW_NUM_COLORS[Math.min(cell.adjacency, 8)];
    ewCtx.font = `bold ${Math.floor(cs * 0.6)}px DM Mono`;
    ewCtx.textAlign = 'center';
    ewCtx.textBaseline = 'middle';
    ewCtx.fillText(cell.adjacency, px + cs / 2, py + cs / 2);
  }
}

function ewInitInput() {
  if (!ewCanvas) return;

  let panX = 0, panY = 0, panning = false;

  ewHandlers.mousedown = e => {
    const rect = ewCanvas.getBoundingClientRect();
    panX = e.clientX - rect.left;
    panY = e.clientY - rect.top;
    panning = false;
  };

  ewHandlers.mousemove = e => {
    const rect = ewCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (e.buttons === 1 && panX !== undefined) {
      const dx = (x - panX) / ewCellSize;
      const dy = (y - panY) / ewCellSize;
      if (Math.abs(dx) > 0.2 || Math.abs(dy) > 0.2) panning = true;
      if (panning) {
        ewViewX -= dx;
        ewViewY -= dy;
        panX = x;
        panY = y;
        ewCanvas.classList.add('panning');
        ewDirty = true;
      }
    }

    const cx = ewViewX + x / ewCellSize;
    const cy = ewViewY + y / ewCellSize;
    ewHoverCell = { x: Math.floor(cx), y: Math.floor(cy) };
    const { sX, sY } = ewToSect(ewHoverCell.x, ewHoverCell.y);
    ewHoverSect = { sX, sY };
    ewDirty = true;
  };

  ewHandlers.mouseup = () => {
    ewCanvas.classList.remove('panning');
    panning = false;
    panX = undefined;
  };

  ewHandlers.mouseleave = () => {
    ewCanvas.classList.remove('panning');
    panning = false;
    ewHoverCell = null;
    ewHoverSect = null;
    ewDirty = true;
  };

  ewHandlers.contextmenu = e => {
    e.preventDefault();
    const rect = ewCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = ewViewX + x / ewCellSize;
    const cy = ewViewY + y / ewCellSize;
    ewFlag(ewWorld, Math.floor(cx), Math.floor(cy));
    ewDirty = true;
  };

  ewHandlers.wheel = e => {
    e.preventDefault();
    const rect = ewCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = ewViewX + x / ewCellSize;
    const cy = ewViewY + y / ewCellSize;
    const newSize = Math.max(EW_CELL_MIN, Math.min(EW_CELL_MAX, ewCellSize - e.deltaY * 0.01));
    ewCellSize = newSize;
    ewViewX = cx - x / ewCellSize;
    ewViewY = cy - y / ewCellSize;
    ewDirty = true;
  };

  ewHandlers.click = e => {
    const rect = ewCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (ewFailRects) {
      for (const r of ewFailRects) {
        if (x >= r.retryX && x <= r.retryX + r.retryW && y >= r.retryY && y <= r.retryY + r.retryH) {
          ewRetry(ewWorld, r.sX, r.sY);
          ewDirty = true;
          return;
        }
        if (x >= r.leaveX && x <= r.leaveX + r.leaveW && y >= r.leaveY && y <= r.leaveY + r.leaveH) {
          ewWorld.failureUI = null;
          ewDirty = true;
          return;
        }
      }
    }

    const cx = ewViewX + x / ewCellSize;
    const cy = ewViewY + y / ewCellSize;
    ewHandleClick(Math.floor(cx), Math.floor(cy));
  };

  for (const [evt, handler] of Object.entries(ewHandlers)) {
    ewCanvas.addEventListener(evt, handler, evt === 'wheel' || evt === 'contextmenu' ? { passive: false } : {});
  }
}

function ewHandleClick(x, y) {
  if (!ewWorld) return;
  const { sX, sY } = ewToSect(x, y);
  const sect = ewWorld.sections.get(`${sX},${sY}`);
  if (!sect || sect.status === 'locked' || sect.status === 'failed') return;

  const cell = ewGetCell(ewWorld, x, y);

  if (ewWorld.firstClick) {
    ewWorld.firstClick = false;
    ewWorld.startTime = Date.now();
    const safe = new Set();
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const { sX: sx, sY: sy, localX: lx, localY: ly } = ewToSect(x + dx, y + dy);
        safe.add(`${lx},${ly}`);
      }
    }
    sect.mines = ewGenMines(ewWorld, sX, sY, 0, safe);
    for (const [k, c] of ewWorld.cells) {
      c.mine = ewIsMine(ewWorld, c.x, c.y);
    }
    startTimer(() => ewUpdateHUD());
  }

  if (cell.flagged || cell.mine) return;

  if (cell.state === 'revealed' && cell.adjacency > 0) {
    const r = ewChord(ewWorld, x, y);
    if (r.exploded) {
      sect.status = 'failed';
      ewWorld.failureUI = { sX, sY };
    }
  } else if (cell.state === 'hidden') {
    if (cell.mine) {
      cell.state = 'revealed';
      sect.status = 'failed';
      ewWorld.failureUI = { sX, sY };
    } else {
      ewReveal(ewWorld, x, y);
      ewCheckClear(ewWorld, sX, sY);
    }
  }
  ewDirty = true;
}

function ewUpdateHUD() {
  const hud = containerEl?.querySelector('#ms-ew-hud');
  const coord = containerEl?.querySelector('#ms-ew-coords');
  if (hud && ewWorld) {
    const cleared = Array.from(ewWorld.sections.values()).filter(s => s.status === 'cleared').length;
    hud.textContent = `🚩 ${ewWorld.flagCount} | 🔓 ${cleared} sections | ⏱ ${formatTime(ewWorld.startTime ? Math.floor((Date.now() - ewWorld.startTime) / 1000) : 0)}`;
  }
  if (coord && ewHoverCell) {
    coord.textContent = `[${ewHoverCell.x}, ${ewHoverCell.y}] @ section (${ewHoverSect.sX}, ${ewHoverSect.sY})`;
  }
}

function ewStartAutoSave() {
  ewAutoSaveId = setInterval(() => ewSave(), 30000);
}

function ewSave() {
  if (ewWorld) {
    optRef?.onSave?.('endless', ewSerialize(ewWorld, ewViewX, ewViewY, ewCellSize));
  }
}

// ── Classic board rendering ───────────────────────────────────────────────────

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
  });
}

function renderBoard(explodedX, explodedY) {
  const b = classicState?.board;
  if (!b) return;
  const boardEl = containerEl.querySelector('#ms-board');
  if (!boardEl) return;

  const cs = computeCellSize(b.width, b.height);
  boardEl.style.gridTemplateColumns = `repeat(${b.width}, ${cs}px)`;
  boardEl.style.gridTemplateRows    = `repeat(${b.height}, ${cs}px)`;
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
  if (c.state === 'flagged') { el.classList.add('flagged'); el.textContent = '⚑'; return; }
  el.classList.add('revealed');
  if (c.mine) {
    el.classList.add(isExploded ? 'mine-hit' : 'mine-shown');
    el.textContent = '💣';
    return;
  }
  if (c.adjacency > 0) {
    el.textContent = c.adjacency;
    el.setAttribute('data-num', Math.min(c.adjacency, 8));
  }
}

function updateCells(changedCells) {
  const b = classicState?.board;
  if (!b) return;
  for (const { x, y } of changedCells) {
    const el = getCellEl(x, y);
    if (!el) continue;
    applyCellContent(el, b.cells[y][x], false);
  }
}

function animateReveal(revealed) {
  const b = classicState?.board;
  if (!b) return;
  for (const { x, y, dist } of revealed) {
    const el = getCellEl(x, y);
    if (!el) continue;
    applyCellContent(el, b.cells[y][x], false);
    el.style.animationDelay = Math.min(dist * 18, 180) + 'ms';
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
  return Math.max(10, Math.min(Math.floor(availW / w), Math.floor(availH / h), 36));
}

// ── HUD & Timer ───────────────────────────────────────────────────────────────

function updateHUD() {
  const b = classicState?.board;
  const flagEl = containerEl.querySelector('#ms-flag-count');
  const timeEl = containerEl.querySelector('#ms-timer');
  if (!flagEl || !timeEl) return;
  if (!b) { flagEl.textContent = '0'; timeEl.textContent = '00:00'; return; }
  flagEl.textContent = String(b.mineCount - b.flagCount);
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
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// ── Overlay (classic mode) ────────────────────────────────────────────────────

function showOverlay(title, sub, btnLabel) {
  const ov = containerEl.querySelector('#ms-overlay');
  if (!ov) return;
  ov.style.display = 'flex';
  const t = ov.querySelector('#ms-overlay-title');
  const s = ov.querySelector('#ms-overlay-sub');
  const b = ov.querySelector('#ms-overlay-btn');
  if (t) { t.textContent = title; t.className = title.startsWith('✓') ? 'win' : 'lose'; }
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
  ewStop();
  if (ewAutoSaveId) { clearInterval(ewAutoSaveId); ewAutoSaveId = null; }
  if (ewWorld?.startTime) ewSave();
  if (containerEl) { containerEl.innerHTML = ''; containerEl = null; }
  const st = document.getElementById('ms-styles');
  if (st) st.remove();
  classicState   = null;
  activeMode     = null;
  optRef         = null;
  ewWorld        = null;
  ewViewX = ewViewY = 0;
  ewCellSize = EW_CELL_DEFAULT;
  ewHoverCell = ewHoverSect = ewFailRects = null;
}
