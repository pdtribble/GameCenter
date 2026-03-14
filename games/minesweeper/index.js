'use strict';

// ── Mulberry32 seeded PRNG ────────────────────────────────────────────────────

function mulberry32(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Cell & Board helpers ──────────────────────────────────────────────────────

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
  return {
    width, height,
    cells,
    mineCount: 0,
    state: 'playing',         // 'playing' | 'won' | 'lost'
    firstClickDone: false,
    startTime: null,
    endTime: null,
    flagCount: 0,
    revealCount: 0,
  };
}

function inBounds(board, x, y) {
  return x >= 0 && y >= 0 && x < board.width && y < board.height;
}

function neighbors(board, x, y) {
  const result = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (inBounds(board, x + dx, y + dy)) result.push({ x: x + dx, y: y + dy });
    }
  }
  return result;
}

function computeAdjacency(board) {
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      if (board.cells[y][x].mine) { board.cells[y][x].adjacency = -1; continue; }
      board.cells[y][x].adjacency = neighbors(board, x, y).filter(n => board.cells[n.y][n.x].mine).length;
    }
  }
}

function placeMines(board, count, safeX, safeY, rng) {
  const safeCells = new Set();
  // Safe zone: clicked cell + all its neighbors
  safeCells.add(`${safeX},${safeY}`);
  for (const n of neighbors(board, safeX, safeY)) safeCells.add(`${n.x},${n.y}`);

  const candidates = [];
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      if (!safeCells.has(`${x},${y}`)) candidates.push({ x, y });
    }
  }
  // Fisher-Yates partial shuffle to pick `count` mines
  const needed = Math.min(count, candidates.length);
  for (let i = 0; i < needed; i++) {
    const j = i + Math.floor(rng() * (candidates.length - i));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    board.cells[candidates[i].y][candidates[i].x].mine = true;
  }
  board.mineCount = needed;
  computeAdjacency(board);
}

// BFS flood-fill reveal; returns list of {x,y,dist} for animation
function bfsReveal(board, startX, startY) {
  const revealed = [];
  const queue = [{ x: startX, y: startY, dist: 0 }];
  const visited = new Set([`${startX},${startY}`]);

  while (queue.length > 0) {
    const { x, y, dist } = queue.shift();
    const cell = board.cells[y][x];
    if (cell.state === 'revealed') continue;
    if (cell.state === 'flagged') continue;
    if (cell.mine) continue;

    cell.state = 'revealed';
    cell.revealOrigin = dist;
    revealed.push({ x, y, dist });
    board.revealCount++;

    if (cell.adjacency === 0) {
      for (const n of neighbors(board, x, y)) {
        const key = `${n.x},${n.y}`;
        if (!visited.has(key) && board.cells[n.y][n.x].state === 'hidden') {
          visited.add(key);
          queue.push({ x: n.x, y: n.y, dist: dist + 1 });
        }
      }
    }
  }
  return revealed;
}

function checkWin(board) {
  const totalSafe = board.width * board.height - board.mineCount;
  return board.revealCount >= totalSafe;
}

// ── Classic mode public API ───────────────────────────────────────────────────

const DIFFICULTIES = {
  beginner:     { width: 9,  height: 9,  mines: 10 },
  intermediate: { width: 16, height: 16, mines: 40 },
  expert:       { width: 30, height: 16, mines: 99 },
};

/**
 * Generate a fresh (mine-less) board for classic mode.
 * Mines are placed on first click via firstClick().
 */
function generateBoard(difficulty) {
  const cfg = DIFFICULTIES[difficulty] || DIFFICULTIES.beginner;
  return { difficulty, board: makeBoard(cfg.width, cfg.height, 0), mines: cfg.mines };
}

/**
 * Place mines (safe around firstX,firstY) and reveal starting cell(s).
 * Returns updated classic state.
 */
function firstClick(classicState, firstX, firstY) {
  const { board, mines } = classicState;
  const rng = mulberry32((firstX * 73856093 ^ firstY * 19349663 ^ Date.now()) >>> 0);
  placeMines(board, mines, firstX, firstY, rng);
  board.firstClickDone = true;
  board.startTime = Date.now();
  bfsReveal(board, firstX, firstY);
  if (checkWin(board)) {
    board.state = 'won';
    board.endTime = Date.now();
    flagAllMines(board);
  }
  return classicState;
}

function flagAllMines(board) {
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      if (board.cells[y][x].mine && board.cells[y][x].state !== 'flagged') {
        board.cells[y][x].state = 'flagged';
        board.flagCount++;
      }
    }
  }
}

/**
 * Reveal a cell. Returns { revealed: [{x,y,dist}], exploded: bool }.
 */
function revealCell(classicState, x, y) {
  const { board } = classicState;
  if (board.state !== 'playing') return { revealed: [], exploded: false };
  const cell = board.cells[y][x];
  if (cell.state !== 'hidden') return { revealed: [], exploded: false };

  if (cell.mine) {
    cell.state = 'revealed';
    board.state = 'lost';
    board.endTime = Date.now();
    // Reveal all mines
    for (let r = 0; r < board.height; r++) {
      for (let c = 0; c < board.width; c++) {
        if (board.cells[r][c].mine && board.cells[r][c].state !== 'flagged') {
          board.cells[r][c].state = 'revealed';
        }
      }
    }
    return { revealed: [{ x, y, dist: 0 }], exploded: true };
  }

  const revealed = bfsReveal(board, x, y);
  if (checkWin(board)) {
    board.state = 'won';
    board.endTime = Date.now();
    flagAllMines(board);
  }
  return { revealed, exploded: false };
}

/**
 * Toggle flag on a hidden cell.
 */
function toggleFlag(classicState, x, y) {
  const { board } = classicState;
  if (board.state !== 'playing') return;
  const cell = board.cells[y][x];
  if (cell.state === 'hidden') { cell.state = 'flagged'; board.flagCount++; }
  else if (cell.state === 'flagged') { cell.state = 'hidden'; board.flagCount--; }
}

/**
 * Chord reveal: if a revealed cell has adjacency = flag count around it,
 * reveal all un-flagged neighbors. Returns same format as revealCell.
 */
function chordReveal(classicState, x, y) {
  const { board } = classicState;
  if (board.state !== 'playing') return { revealed: [], exploded: false };
  const cell = board.cells[y][x];
  if (cell.state !== 'revealed' || cell.adjacency <= 0) return { revealed: [], exploded: false };

  const ns = neighbors(board, x, y);
  const flagged = ns.filter(n => board.cells[n.y][n.x].state === 'flagged').length;
  if (flagged !== cell.adjacency) return { revealed: [], exploded: false };

  let allRevealed = [];
  let anyExploded = false;
  for (const n of ns) {
    if (board.cells[n.y][n.x].state === 'hidden') {
      const res = revealCell(classicState, n.x, n.y);
      allRevealed = allRevealed.concat(res.revealed);
      if (res.exploded) anyExploded = true;
    }
  }
  return { revealed: allRevealed, exploded: anyExploded };
}

// ── Endless mode — section-based infinite grid helpers ────────────────────────

const EL_SECTION_SIZE = 8;
const EL_MINES_PER_SECTION = 10;

/** Convert absolute cell coords to section + local coords. */
function elToSection(absX, absY) {
  const sX = Math.floor(absX / EL_SECTION_SIZE);
  const sY = Math.floor(absY / EL_SECTION_SIZE);
  const localX = ((absX % EL_SECTION_SIZE) + EL_SECTION_SIZE) % EL_SECTION_SIZE;
  const localY = ((absY % EL_SECTION_SIZE) + EL_SECTION_SIZE) % EL_SECTION_SIZE;
  return { sX, sY, localX, localY };
}

/** Generate 10 mines for section (sX,sY) using seeded Fisher-Yates. */
function elGenMines(worldSeed, sX, sY, resetCount, safeSet) {
  let seed = worldSeed ^ (sX * 1000003) ^ (sY * 999983);
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
    if (mines.size >= EL_MINES_PER_SECTION) break;
    const lx = pos % EL_SECTION_SIZE, ly = Math.floor(pos / EL_SECTION_SIZE);
    if (!safeSet || !safeSet.has(`${lx},${ly}`)) mines.add(`${lx},${ly}`);
  }
  return mines;
}

module.exports = {
  // Classic
  generateBoard,
  firstClick,
  revealCell,
  toggleFlag,
  chordReveal,
  // Endless helpers
  elToSection,
  elGenMines,
  EL_SECTION_SIZE,
  EL_MINES_PER_SECTION,
  // Shared helpers
  mulberry32,
  makeBoard,
  computeAdjacency,
  bfsReveal,
  checkWin,
  neighbors,
  DIFFICULTIES,
};
