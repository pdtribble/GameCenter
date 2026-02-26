// 2048 — pure game logic, zero side effects

function createEmptyBoard(size = 4) {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

function getEmptyCells(board) {
  const cells = [];
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      if (board[r][c] === 0) cells.push({ row: r, col: c });
    }
  }
  return cells;
}

function addRandomTile(board, rngFn) {
  const empties = getEmptyCells(board);
  if (empties.length === 0) return board;
  
  const idx = Math.floor(rngFn() * empties.length);
  const { row, col } = empties[idx];
  const value = rngFn() < 0.9 ? 2 : 4;
  
  const newBoard = board.map(r => [...r]);
  newBoard[row][col] = value;
  return newBoard;
}

function hasMovesRemaining(board) {
  // Check for empty cells
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      if (board[r][c] === 0) return true;
    }
  }
  
  // Check for adjacent equal values
  const size = board.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const val = board[r][c];
      // Check right
      if (c + 1 < size && board[r][c + 1] === val) return true;
      // Check down
      if (r + 1 < size && board[r + 1][c] === val) return true;
    }
  }
  
  return false;
}

function slideRow(row) {
  // Remove zeros
  let filtered = row.filter(v => v !== 0);
  
  // Merge adjacent equals
  const merged = [];
  let i = 0;
  while (i < filtered.length) {
    if (i + 1 < filtered.length && filtered[i] === filtered[i + 1]) {
      merged.push(filtered[i] * 2);
      i += 2;
    } else {
      merged.push(filtered[i]);
      i++;
    }
  }
  
  // Pad with zeros
  while (merged.length < row.length) {
    merged.push(0);
  }
  
  return merged;
}

function rotateLeft(board) {
  const size = board.length;
  const result = createEmptyBoard(size);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      result[r][c] = board[c][size - 1 - r];
    }
  }
  return result;
}

function rotateRight(board) {
  const size = board.length;
  const result = createEmptyBoard(size);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      result[r][c] = board[size - 1 - c][r];
    }
  }
  return result;
}

function applyMove(board, direction, rngFn) {
  let rotated;
  let scoreGain = 0;
  let moved = false;
  
  // Rotate to make direction always "left"
  switch (direction) {
    case 'left':
      rotated = board;
      break;
    case 'right':
      rotated = rotateRight(rotateRight(board));
      break;
    case 'up':
      rotated = rotateLeft(board);
      break;
    case 'down':
      rotated = rotateRight(board);
      break;
    default:
      return { board, scoreGain: 0, moved: false };
  }
  
  // Slide and merge each row
  const newBoard = rotated.map((row, ri) => {
    const oldStr = row.join(',');
    const newRow = slideRow(row);
    const newStr = newRow.join(',');
    if (oldStr !== newStr) moved = true;
    
    // Calculate score gain from this row
    for (let i = 0; i < row.length; i++) {
      if (row[i] !== 0 && newRow[i] !== row[i]) {
        scoreGain += newRow[i] - row[i];
      }
    }
    
    return newRow;
  });
  
  // Rotate back
  let finalBoard;
  switch (direction) {
    case 'left':
      finalBoard = newBoard;
      break;
    case 'right':
      finalBoard = rotateRight(rotateRight(newBoard));
      break;
    case 'up':
      finalBoard = rotateRight(newBoard);
      break;
    case 'down':
      finalBoard = rotateLeft(newBoard);
      break;
  }
  
  // Add random tile if moved
  if (moved) {
    finalBoard = addRandomTile(finalBoard, rngFn);
  }
  
  return { board: finalBoard, scoreGain: Math.max(0, scoreGain), moved };
}

function checkWin(board) {
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      if (board[r][c] === 2048) return true;
    }
  }
  return false;
}

function initGame(rngFn = Math.random) {
  let board = createEmptyBoard(4);
  board = addRandomTile(board, rngFn);
  board = addRandomTile(board, rngFn);
  
  return {
    board,
    score: 0,
    best: 0,
    phase: 'playing',
    moved: false,
    won2048: false,
    continuing: false,
    size: 4,
  };
}

function move(state, direction, rngFn = Math.random) {
  if (state.phase !== 'playing') return state;
  
  const { board: newBoard, scoreGain, moved } = applyMove(state.board, direction, rngFn);
  
  const newScore = state.score + scoreGain;
  const newBest = Math.max(state.best, newScore);
  const won2048 = state.won2048 || checkWin(newBoard);
  
  let newPhase = state.phase;
  if (won2048 && !state.won2048 && !state.continuing) {
    newPhase = 'won';
  } else if (!hasMovesRemaining(newBoard)) {
    newPhase = 'over';
  }
  
  return {
    ...state,
    board: newBoard,
    score: newScore,
    best: newBest,
    phase: newPhase,
    moved,
    won2048,
  };
}

function continueGame(state) {
  return {
    ...state,
    phase: 'playing',
    continuing: true,
  };
}

function serializeState(state) {
  return JSON.stringify(state);
}

function deserializeState(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

module.exports = {
  initGame,
  move,
  continueGame,
  serializeState,
  deserializeState,
  getEmptyCells,
  hasMovesRemaining,
};
