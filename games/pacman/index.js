// Pac-Man — pure game logic, zero DOM, zero timers, zero side effects

const MAP_COLS = 21;
const MAP_ROWS = 23;

// Tile types
const EMPTY = 0;
const WALL = 1;
const DOT = 2;
const PELLET = 3;
const DOOR = 4;
const HOUSE = 5;

// prettier-ignore
const MASTER_MAP = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,2,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,2,1],
  [1,3,1,1,2,1,1,1,2,1,1,1,2,1,1,1,2,1,1,3,1],
  [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
  [1,2,1,1,2,1,2,1,1,1,1,1,1,1,2,1,2,1,1,2,1],
  [1,2,2,2,2,1,2,2,2,2,1,2,2,2,2,1,2,2,2,2,1],
  [1,1,1,1,2,1,1,1,0,1,1,1,0,1,1,1,2,1,1,1,1],
  [0,0,0,1,2,1,0,0,0,0,0,0,0,0,0,1,2,1,0,0,0],
  [1,1,1,1,2,1,0,1,1,1,4,1,1,1,0,1,2,1,1,1,1],
  [0,0,0,0,2,0,0,1,5,5,5,5,5,1,0,0,2,0,0,0,0],
  [1,1,1,1,2,1,0,1,5,5,5,5,5,1,0,1,2,1,1,1,1],
  [0,0,0,1,2,1,0,1,1,1,1,1,1,1,0,1,2,1,0,0,0],
  [1,1,1,1,2,1,0,0,0,0,0,0,0,0,0,1,2,1,1,1,1],
  [1,2,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,2,1],
  [1,2,1,1,2,1,1,1,2,1,1,1,2,1,1,1,2,1,1,2,1],
  [1,3,2,1,2,2,2,2,2,2,0,2,2,2,2,2,2,1,2,3,1],
  [1,1,2,1,2,1,2,1,1,1,1,1,1,1,2,1,2,1,2,1,1],
  [1,2,2,2,2,1,2,2,2,2,1,2,2,2,2,1,2,2,2,2,1],
  [1,2,1,1,1,1,1,1,2,1,1,1,2,1,1,1,1,1,1,2,1],
  [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
  [1,3,1,1,2,1,1,1,2,1,1,1,2,1,1,1,2,1,1,3,1],
  [1,2,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,2,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

const GHOST_DEFS = [
  { id: 'blinky', color: '#ff0000', scatterX: 19, scatterY: 0,  startX: 10, startY: 9,  inHouse: false },
  { id: 'pinky',  color: '#ffb8ff', scatterX: 1,  scatterY: 0,  startX: 10, startY: 10, inHouse: true },
  { id: 'inky',   color: '#00ffff', scatterX: 19, scatterY: 22, startX: 9,  startY: 10, inHouse: true },
  { id: 'clyde',  color: '#ffb852', scatterX: 1,  scatterY: 22, startX: 11, startY: 10, inHouse: true },
];

const PACMAN_START = { x: 10, y: 17 };

// Scatter/chase schedule (in ticks). Level 1 at 60-ish tps equivalent.
// scatter 7s, chase 20s, scatter 7s, chase 20s, scatter 5s, chase 20s, scatter 5s, chase forever
const MODE_SCHEDULE = [
  { mode: 'scatter', ticks: 47 },
  { mode: 'chase',   ticks: 133 },
  { mode: 'scatter', ticks: 47 },
  { mode: 'chase',   ticks: 133 },
  { mode: 'scatter', ticks: 33 },
  { mode: 'chase',   ticks: 133 },
  { mode: 'scatter', ticks: 33 },
  { mode: 'chase',   ticks: Infinity },
];

function cloneMap(map) {
  return map.map(row => [...row]);
}

function countDots(map) {
  let count = 0;
  for (let r = 0; r < MAP_ROWS; r++) {
    for (let c = 0; c < MAP_COLS; c++) {
      if (map[r][c] === DOT || map[r][c] === PELLET) count++;
    }
  }
  return count;
}

function initGame(level) {
  const map = cloneMap(MASTER_MAP);
  const ghosts = GHOST_DEFS.map(g => ({
    id: g.id,
    x: g.startX, y: g.startY,
    prevX: g.startX, prevY: g.startY,
    dir: g.id === 'blinky' ? 'left' : 'up',
    mode: 'scatter',
    inHouse: g.inHouse,
    color: g.color,
    scatterX: g.scatterX, scatterY: g.scatterY,
    exitDelay: g.id === 'pinky' ? 5 : g.id === 'inky' ? 20 : g.id === 'clyde' ? 35 : 0,
  }));

  return {
    map,
    pacman: {
      x: PACMAN_START.x, y: PACMAN_START.y,
      prevX: PACMAN_START.x, prevY: PACMAN_START.y,
      dir: 'left', nextDir: 'left', moving: false,
    },
    ghosts,
    score: level > 1 ? undefined : 0,  // caller should preserve score
    lives: 3,
    level: level || 1,
    phase: 'ready',
    dotsRemaining: countDots(map),
    frightenedTimer: 0,
    ghostEatCombo: 0,
    modeTimer: 0,
    modePhase: 0,
    tickCount: 0,
  };
}

function isWall(map, x, y) {
  if (x < 0 || x >= MAP_COLS || y < 0 || y >= MAP_ROWS) return true;
  return map[y][x] === WALL;
}

function isPassable(map, x, y, isGhost, ghostMode) {
  // Tunnel wrap
  if (y === 9 && (x < 0 || x >= MAP_COLS)) return true;
  if (x < 0 || x >= MAP_COLS || y < 0 || y >= MAP_ROWS) return false;
  const tile = map[y][x];
  if (tile === WALL) return false;
  if (tile === DOOR) {
    return isGhost && (ghostMode === 'eaten' || ghostMode === 'exiting');
  }
  return true;
}

function getManhattanDist(x1, y1, x2, y2) {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

const DIRS = {
  left:  { dx: -1, dy: 0 },
  right: { dx: 1,  dy: 0 },
  up:    { dx: 0,  dy: -1 },
  down:  { dx: 0,  dy: 1 },
};

const OPPOSITE = { left: 'right', right: 'left', up: 'down', down: 'up' };
const DIR_LIST = ['up', 'left', 'down', 'right'];

function getGhostTarget(ghost, pacman, blinky) {
  if (ghost.mode === 'scatter') {
    return { x: ghost.scatterX, y: ghost.scatterY };
  }
  if (ghost.mode === 'eaten') {
    return { x: 10, y: 9 };
  }

  switch (ghost.id) {
    case 'blinky':
      return { x: pacman.x, y: pacman.y };
    case 'pinky': {
      const d = DIRS[pacman.dir] || DIRS.left;
      return { x: pacman.x + d.dx * 4, y: pacman.y + d.dy * 4 };
    }
    case 'inky': {
      const d = DIRS[pacman.dir] || DIRS.left;
      const aheadX = pacman.x + d.dx * 2;
      const aheadY = pacman.y + d.dy * 2;
      const bx = blinky ? blinky.x : pacman.x;
      const by = blinky ? blinky.y : pacman.y;
      return { x: aheadX + (aheadX - bx), y: aheadY + (aheadY - by) };
    }
    case 'clyde': {
      const dist = getManhattanDist(ghost.x, ghost.y, pacman.x, pacman.y);
      if (dist > 8) return { x: pacman.x, y: pacman.y };
      return { x: ghost.scatterX, y: ghost.scatterY };
    }
    default:
      return { x: pacman.x, y: pacman.y };
  }
}

function moveGhost(ghost, map, pacman, blinky, rngFn) {
  if (ghost.inHouse) {
    if (ghost.exitDelay > 0) {
      return { ...ghost, exitDelay: ghost.exitDelay - 1 };
    }
    // Exit the house: move up toward door
    if (ghost.y > 8) {
      return { ...ghost, prevX: ghost.x, prevY: ghost.y, x: 10, y: ghost.y - 1, dir: 'up', mode: 'exiting' };
    }
    return { ...ghost, inHouse: false, prevX: ghost.x, prevY: ghost.y, x: 10, y: 8, dir: 'up', mode: 'scatter' };
  }

  // If eaten and reached house entrance
  if (ghost.mode === 'eaten' && ghost.x === 10 && ghost.y === 9) {
    return { ...ghost, mode: 'scatter', inHouse: false, prevX: ghost.x, prevY: ghost.y };
  }

  const target = ghost.mode === 'frightened'
    ? null
    : getGhostTarget(ghost, pacman, blinky);

  const speed = ghost.mode === 'eaten' ? 2 : 1;
  let bestDir = ghost.dir;
  let bestDist = Infinity;
  const candidates = [];

  for (const d of DIR_LIST) {
    if (d === OPPOSITE[ghost.dir]) continue;
    const nx = ghost.x + DIRS[d].dx;
    const ny = ghost.y + DIRS[d].dy;
    if (!isPassable(map, nx, ny, true, ghost.mode)) continue;
    candidates.push(d);
    if (target) {
      const dist = getManhattanDist(nx, ny, target.x, target.y);
      if (dist < bestDist) {
        bestDist = dist;
        bestDir = d;
      }
    }
  }

  if (candidates.length === 0) {
    // Can't move forward, try reverse
    const rev = OPPOSITE[ghost.dir];
    const nx = ghost.x + DIRS[rev].dx;
    const ny = ghost.y + DIRS[rev].dy;
    if (isPassable(map, nx, ny, true, ghost.mode)) {
      candidates.push(rev);
      bestDir = rev;
    } else {
      return ghost;
    }
  }

  if (ghost.mode === 'frightened') {
    bestDir = candidates[Math.floor(rngFn() * candidates.length)];
  }

  let nx = ghost.x + DIRS[bestDir].dx;
  let ny = ghost.y + DIRS[bestDir].dy;

  // Tunnel wrap
  if (ny === 9) {
    if (nx < 0) nx = MAP_COLS - 1;
    else if (nx >= MAP_COLS) nx = 0;
  }

  return { ...ghost, prevX: ghost.x, prevY: ghost.y, x: nx, y: ny, dir: bestDir };
}

function queueDirection(state, dir) {
  return { ...state, pacman: { ...state.pacman, nextDir: dir } };
}

function tick(state, rngFn) {
  if (state.phase !== 'playing') return state;

  let s = { ...state, tickCount: state.tickCount + 1 };
  let pac = { ...s.pacman };
  const map = s.map.map(r => [...r]);

  // Try to apply queued direction
  const nd = DIRS[pac.nextDir];
  if (nd) {
    let nx = pac.x + nd.dx;
    let ny = pac.y + nd.dy;
    // Tunnel wrap
    if (ny === 9) {
      if (nx < 0) nx = MAP_COLS - 1;
      else if (nx >= MAP_COLS) nx = 0;
    }
    if (isPassable(map, nx, ny, false)) {
      pac.dir = pac.nextDir;
    }
  }

  // Move pac-man in current direction
  const d = DIRS[pac.dir];
  let newX = pac.x + d.dx;
  let newY = pac.y + d.dy;

  // Tunnel wrap
  if (newY === 9) {
    if (newX < 0) newX = MAP_COLS - 1;
    else if (newX >= MAP_COLS) newX = 0;
  }

  if (isPassable(map, newX, newY, false)) {
    pac.prevX = pac.x;
    pac.prevY = pac.y;
    pac.x = newX;
    pac.y = newY;
    pac.moving = true;
  } else {
    pac.moving = false;
  }

  let score = s.score;
  let dotsRemaining = s.dotsRemaining;
  let frightenedTimer = s.frightenedTimer;
  let ghostEatCombo = s.ghostEatCombo;
  let dotEaten = false;
  let pelletEaten = false;

  // Check dot/pellet collision
  if (pac.x >= 0 && pac.x < MAP_COLS && pac.y >= 0 && pac.y < MAP_ROWS) {
    const tile = map[pac.y][pac.x];
    if (tile === DOT) {
      map[pac.y][pac.x] = EMPTY;
      score += 10;
      dotsRemaining--;
      dotEaten = true;
    } else if (tile === PELLET) {
      map[pac.y][pac.x] = EMPTY;
      score += 50;
      dotsRemaining--;
      pelletEaten = true;
      frightenedTimer = 40; // ~6 seconds at game tick rate
      ghostEatCombo = 0;
    }
  }

  // Move ghosts
  let ghosts = s.ghosts.map(g => {
    let ghost = { ...g };
    if (pelletEaten && ghost.mode !== 'eaten' && !ghost.inHouse) {
      ghost.mode = 'frightened';
      ghost.dir = OPPOSITE[ghost.dir] || ghost.dir;
    }
    return ghost;
  });

  const blinky = ghosts.find(g => g.id === 'blinky');
  ghosts = ghosts.map(g => moveGhost(g, map, pac, blinky, rngFn));

  // Decrement frightened timer
  if (frightenedTimer > 0) {
    frightenedTimer--;
    if (frightenedTimer === 0) {
      ghosts = ghosts.map(g =>
        g.mode === 'frightened' ? { ...g, mode: s.modePhase < MODE_SCHEDULE.length ? MODE_SCHEDULE[s.modePhase].mode : 'chase' } : g
      );
      ghostEatCombo = 0;
    }
  }

  // Mode timer
  let modeTimer = s.modeTimer + 1;
  let modePhase = s.modePhase;
  if (modePhase < MODE_SCHEDULE.length && modeTimer >= MODE_SCHEDULE[modePhase].ticks) {
    modeTimer = 0;
    modePhase++;
    if (modePhase < MODE_SCHEDULE.length) {
      const newMode = MODE_SCHEDULE[modePhase].mode;
      ghosts = ghosts.map(g => {
        if (g.mode !== 'frightened' && g.mode !== 'eaten' && !g.inHouse) {
          return { ...g, mode: newMode, dir: OPPOSITE[g.dir] || g.dir };
        }
        return g;
      });
    }
  }

  // Check pac-ghost collisions
  let lives = s.lives;
  let phase = 'playing';
  let ghostsEaten = [];

  for (let i = 0; i < ghosts.length; i++) {
    const g = ghosts[i];
    if (g.inHouse) continue;
    if (g.x === pac.x && g.y === pac.y) {
      if (g.mode === 'frightened') {
        ghostEatCombo++;
        score += 200 * Math.pow(2, ghostEatCombo - 1);
        ghosts[i] = { ...g, mode: 'eaten' };
        ghostsEaten.push(g.id);
      } else if (g.mode !== 'eaten') {
        lives--;
        phase = 'dying';
        break;
      }
    }
  }

  if (phase === 'dying' && lives <= 0) {
    phase = 'over';
  }

  if (dotsRemaining <= 0) {
    phase = 'levelclear';
  }

  return {
    ...s,
    map,
    pacman: pac,
    ghosts,
    score,
    lives,
    phase,
    dotsRemaining,
    frightenedTimer,
    ghostEatCombo,
    modeTimer,
    modePhase,
    dotEaten,
    pelletEaten,
    ghostsEaten: ghostsEaten.length > 0 ? ghostsEaten : undefined,
  };
}

function respawn(state) {
  const ghosts = GHOST_DEFS.map(g => ({
    id: g.id,
    x: g.startX, y: g.startY,
    prevX: g.startX, prevY: g.startY,
    dir: g.id === 'blinky' ? 'left' : 'up',
    mode: 'scatter',
    inHouse: g.inHouse,
    color: g.color,
    scatterX: g.scatterX, scatterY: g.scatterY,
    exitDelay: g.id === 'pinky' ? 5 : g.id === 'inky' ? 20 : g.id === 'clyde' ? 35 : 0,
  }));

  return {
    ...state,
    pacman: {
      x: PACMAN_START.x, y: PACMAN_START.y,
      prevX: PACMAN_START.x, prevY: PACMAN_START.y,
      dir: 'left', nextDir: 'left', moving: false,
    },
    ghosts,
    phase: 'playing',
    frightenedTimer: 0,
    ghostEatCombo: 0,
    modeTimer: 0,
    modePhase: 0,
  };
}

function nextLevel(state) {
  const fresh = initGame(state.level + 1);
  fresh.score = state.score;
  fresh.lives = state.lives;
  return fresh;
}

function getTickInterval(level) {
  if (level <= 1) return 150;
  if (level === 2) return 130;
  if (level === 3) return 110;
  return 90;
}

function serializeState(state) {
  return JSON.stringify(state);
}

function deserializeState(json) {
  return JSON.parse(json);
}

export {
  MAP_COLS, MAP_ROWS,
  EMPTY, WALL, DOT, PELLET, DOOR, HOUSE,
  MASTER_MAP, GHOST_DEFS, PACMAN_START,
  initGame, isWall, isPassable, getManhattanDist,
  queueDirection, tick, respawn, nextLevel,
  getTickInterval, serializeState, deserializeState,
};
