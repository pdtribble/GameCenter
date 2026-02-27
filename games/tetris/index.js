// Tetris — pure game logic, zero DOM, zero timers, zero side effects

const COLS = 10;
const ROWS = 20;

const PIECES = {
  I: { cells: [[-1,0],[0,0],[1,0],[2,0]], color: 1 },
  O: { cells: [[0,0],[1,0],[0,1],[1,1]], color: 2 },
  T: { cells: [[-1,0],[0,0],[1,0],[0,1]], color: 3 },
  S: { cells: [[0,0],[1,0],[-1,1],[0,1]], color: 4 },
  Z: { cells: [[-1,0],[0,0],[0,1],[1,1]], color: 5 },
  L: { cells: [[-1,0],[0,0],[1,0],[1,1]], color: 6 },
  J: { cells: [[-1,0],[0,0],[1,0],[-1,1]], color: 7 },
};

const PIECE_TYPES = ['I','O','T','S','Z','L','J'];

const WALL_KICKS = [[0,0],[1,0],[-1,0],[2,0],[-2,0]];

function createEmptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function randomPieceType(rngFn) {
  return PIECE_TYPES[Math.floor(rngFn() * PIECE_TYPES.length)];
}

function makePiece(type) {
  const def = PIECES[type];
  return {
    type,
    rotation: 0,
    x: 4,
    y: 0,
    cells: def.cells.map(([cx,cy]) => ({ x: cx, y: cy })),
    color: def.color,
  };
}

function getAbsoluteCells(piece) {
  return piece.cells.map(c => ({ x: piece.x + c.x, y: piece.y + c.y }));
}

function isValidPosition(cells, board) {
  for (const c of cells) {
    if (c.x < 0 || c.x >= COLS || c.y < 0 || c.y >= ROWS) return false;
    if (c.y >= 0 && board[c.y][c.x] !== 0) return false;
  }
  return true;
}

function rotateCells(cells, direction) {
  return cells.map(c =>
    direction === 'cw' ? { x: -c.y, y: c.x } : { x: c.y, y: -c.x }
  );
}

function initGame(rngFn) {
  const board = createEmptyBoard();
  const currentType = randomPieceType(rngFn);
  const nextType = randomPieceType(rngFn);
  const current = makePiece(currentType);

  return {
    board,
    current,
    next: makePiece(nextType),
    held: null,
    canHold: true,
    score: 0,
    level: 1,
    lines: 0,
    phase: 'ready',
    lastClear: null,
    combo: 0,
  };
}

function spawnPiece(type, board) {
  const piece = makePiece(type);
  const absCells = getAbsoluteCells(piece);
  if (!isValidPosition(absCells, board)) {
    return { piece, board, phase: 'over' };
  }
  return { piece, board, phase: 'playing' };
}

function moveLeft(state) {
  if (state.phase !== 'playing') return state;
  const newPiece = { ...state.current, x: state.current.x - 1 };
  const absCells = getAbsoluteCells(newPiece);
  if (!isValidPosition(absCells, state.board)) return state;
  return { ...state, current: newPiece };
}

function moveRight(state) {
  if (state.phase !== 'playing') return state;
  const newPiece = { ...state.current, x: state.current.x + 1 };
  const absCells = getAbsoluteCells(newPiece);
  if (!isValidPosition(absCells, state.board)) return state;
  return { ...state, current: newPiece };
}

function lockPiece(state, rngFn) {
  const board = state.board.map(r => [...r]);
  const absCells = getAbsoluteCells(state.current);
  for (const c of absCells) {
    if (c.y >= 0 && c.y < ROWS && c.x >= 0 && c.x < COLS) {
      board[c.y][c.x] = state.current.color;
    }
  }

  // Clear lines
  const fullRows = [];
  for (let r = 0; r < ROWS; r++) {
    if (board[r].every(v => v !== 0)) fullRows.push(r);
  }

  const clearedBoard = board.filter((_, i) => !fullRows.includes(i));
  while (clearedBoard.length < ROWS) {
    clearedBoard.unshift(Array(COLS).fill(0));
  }

  const cleared = fullRows.length;
  const clearNames = [null, 'single', 'double', 'triple', 'tetris'];
  const scoreTable = [0, 100, 300, 500, 800];
  let newScore = state.score + (scoreTable[cleared] || 0) * state.level;
  let newCombo = state.combo;
  if (cleared > 0) {
    newCombo++;
    newScore += 50 * newCombo * state.level;
  } else {
    newCombo = 0;
  }

  const newLines = state.lines + cleared;
  const newLevel = Math.floor(newLines / 10) + 1;

  // Spawn next piece
  const nextType = randomPieceType(rngFn);
  const spawn = spawnPiece(state.next.type, clearedBoard);

  return {
    ...state,
    board: clearedBoard,
    current: spawn.piece,
    next: makePiece(nextType),
    canHold: true,
    score: newScore,
    level: newLevel,
    lines: newLines,
    lastClear: clearNames[cleared] || null,
    combo: newCombo,
    phase: spawn.phase,
    clearedRows: fullRows,
  };
}

function moveDown(state, rngFn) {
  if (state.phase !== 'playing') return state;
  const newPiece = { ...state.current, y: state.current.y + 1 };
  const absCells = getAbsoluteCells(newPiece);
  if (!isValidPosition(absCells, state.board)) {
    return lockPiece(state, rngFn);
  }
  return { ...state, current: newPiece };
}

function hardDrop(state, rngFn) {
  if (state.phase !== 'playing') return state;
  let piece = { ...state.current };
  let dropDist = 0;
  while (true) {
    const next = { ...piece, y: piece.y + 1 };
    const absCells = getAbsoluteCells(next);
    if (!isValidPosition(absCells, state.board)) break;
    piece = next;
    dropDist++;
  }
  const newState = { ...state, current: piece, score: state.score + dropDist * 2 };
  return lockPiece(newState, rngFn);
}

function rotate(state, direction) {
  if (state.phase !== 'playing') return state;
  if (state.current.type === 'O') return state;

  const newCells = rotateCells(state.current.cells, direction);
  const newRotation = (state.current.rotation + (direction === 'cw' ? 1 : 3)) % 4;

  for (const [dx, dy] of WALL_KICKS) {
    const testPiece = {
      ...state.current,
      cells: newCells,
      rotation: newRotation,
      x: state.current.x + dx,
      y: state.current.y + dy,
    };
    if (isValidPosition(getAbsoluteCells(testPiece), state.board)) {
      return { ...state, current: testPiece };
    }
  }
  return state;
}

function holdPiece(state, rngFn) {
  if (state.phase !== 'playing') return state;
  if (!state.canHold) return state;

  const heldType = state.current.type;
  let newCurrent;
  let newNext = state.next;

  if (state.held) {
    const spawn = spawnPiece(state.held.type, state.board);
    newCurrent = spawn.piece;
    if (spawn.phase === 'over') {
      return { ...state, phase: 'over' };
    }
  } else {
    const spawn = spawnPiece(state.next.type, state.board);
    newCurrent = spawn.piece;
    newNext = makePiece(randomPieceType(rngFn));
    if (spawn.phase === 'over') {
      return { ...state, phase: 'over' };
    }
  }

  return {
    ...state,
    current: newCurrent,
    held: makePiece(heldType),
    next: newNext,
    canHold: false,
  };
}

function getGhostPiece(state) {
  if (!state.current || state.phase === 'over') return [];
  let piece = { ...state.current };
  while (true) {
    const next = { ...piece, y: piece.y + 1 };
    if (!isValidPosition(getAbsoluteCells(next), state.board)) break;
    piece = next;
  }
  return getAbsoluteCells(piece);
}

function getDropInterval(level) {
  const speeds = [800, 720, 630, 550, 470, 380, 300, 220, 130, 100];
  return speeds[Math.min(level - 1, speeds.length - 1)];
}

function serializeState(state) {
  return JSON.stringify(state);
}

function deserializeState(json) {
  return JSON.parse(json);
}

export {
  COLS, ROWS, PIECES, PIECE_TYPES,
  createEmptyBoard, randomPieceType, makePiece,
  getAbsoluteCells, isValidPosition, rotateCells,
  initGame, spawnPiece,
  moveLeft, moveRight, moveDown, hardDrop,
  rotate, holdPiece, lockPiece,
  getGhostPiece, getDropInterval,
  serializeState, deserializeState,
};
