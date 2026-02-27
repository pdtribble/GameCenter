// Sudoku — pure game logic, zero side effects

function shuffle(array, rng) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function mulberry32(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getBoxIndex(row, col) {
  return Math.floor(row / 3) * 3 + Math.floor(col / 3);
}

function isValidPlacement(board, row, col, num) {
  // Check row
  for (let c = 0; c < 9; c++) {
    if (board[row * 9 + c] === num) return false;
  }
  // Check column
  for (let r = 0; r < 9; r++) {
    if (board[r * 9 + col] === num) return false;
  }
  // Check 3x3 box
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let r = boxRow; r < boxRow + 3; r++) {
    for (let c = boxCol; c < boxCol + 3; c++) {
      if (board[r * 9 + c] === num) return false;
    }
  }
  return true;
}

function solveSudoku(board, rng) {
  const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng);
  
  function solve(pos) {
    if (pos === 81) return true;
    
    const row = Math.floor(pos / 9);
    const col = pos % 9;
    
    if (board[pos] !== 0) return solve(pos + 1);
    
    for (const num of nums) {
      if (isValidPlacement(board, row, col, num)) {
        board[pos] = num;
        if (solve(pos + 1)) return true;
        board[pos] = 0;
      }
    }
    
    return false;
  }
  
  return solve(0) ? board : null;
}

function generatePuzzle(seed, difficulty) {
  const rng = mulberry32(seed);
  
  // Create empty board
  const board = new Array(81).fill(0);
  
  // Fill diagonal boxes first (independent)
  for (let box = 0; box < 9; box += 4) {
    const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng);
    let idx = 0;
    for (let r = Math.floor(box / 3) * 3; r < Math.floor(box / 3) * 3 + 3; r++) {
      for (let c = (box % 3) * 3; c < (box % 3) * 3 + 3; c++) {
        board[r * 9 + c] = nums[idx++];
      }
    }
  }
  
  // Solve the rest
  solveSudoku(board, rng);
  
  // Remove numbers based on difficulty
  const attempts = { easy: 35, medium: 45, hard: 55 }[difficulty] || 40;
  
  const positions = shuffle([...Array(81).keys()], rng);
  let removed = 0;
  
  for (const pos of positions) {
    if (removed >= attempts) break;
    const backup = board[pos];
    board[pos] = 0;
    removed++;
  }
  
  return board;
}

function createInitialState(difficulty = 'medium', seed = null) {
  const puzzleSeed = seed || Math.floor(Math.random() * 1000000);
  const puzzle = generatePuzzle(puzzleSeed, difficulty);
  
  // Deep copy for solution
  const solution = [...puzzle];
  solveSudoku(solution, mulberry32(puzzleSeed));
  
  return {
    puzzle,
    solution,
    board: [...puzzle],
    phase: 'playing',
    mistakes: 0,
    maxMistakes: 3,
    difficulty,
    seed: puzzleSeed,
    notes: new Array(81).fill(null).map(() => new Set()),
    selectedCell: null,
    highlightedCells: [],
    timer: 0,
    hintsUsed: 0,
  };
}

function selectCell(state, index) {
  if (index < 0 || index > 80) return { ...state, selectedCell: null, highlightedCells: [] };
  
  const row = Math.floor(index / 9);
  const col = index % 9;
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  
  // Highlight same number, row, column, and box
  const highlighted = new Set();
  const value = state.board[index];
  
  if (value !== 0) {
    for (let i = 0; i < 81; i++) {
      const r = Math.floor(i / 9);
      const c = i % 9;
      if (state.board[i] === value) highlighted.add(i);
    }
  }
  
  // Add row, col, box
  for (let i = 0; i < 9; i++) highlighted.add(row * 9 + i);
  for (let i = 0; i < 9; i++) highlighted.add(i * 9 + col);
  for (let r = boxRow; r < boxRow + 3; r++) {
    for (let c = boxCol; c < boxCol + 3; c++) {
      highlighted.add(r * 9 + c);
    }
  }
  
  return {
    ...state,
    selectedCell: index,
    highlightedCells: [...highlighted],
  };
}

function inputNumber(state, number) {
  if (state.phase !== 'playing' || state.selectedCell === null) return state;
  
  const idx = state.selectedCell;
  const row = Math.floor(idx / 9);
  const col = idx % 9;
  
  // Can't modify initial puzzle cells
  if (state.puzzle[idx] !== 0) return state;
  
  const newBoard = [...state.board];
  const newNotes = state.notes.map(n => new Set(n));
  
  if (number === 0) {
    // Clear cell
    newBoard[idx] = 0;
    newNotes[idx].clear();
  } else {
    const correct = state.solution[idx];
    if (number === correct) {
      newBoard[idx] = number;
      newNotes[idx].clear();
      
      // Check for win
      if (!newBoard.includes(0)) {
        return {
          ...state,
          board: newBoard,
          notes: newNotes,
          phase: 'won',
        };
      }
    } else {
      const newMistakes = state.mistakes + 1;
      const newPhase = newMistakes >= state.maxMistakes ? 'lost' : 'playing';
      return {
        ...state,
        board: newBoard,
        mistakes: newMistakes,
        phase: newPhase,
      };
    }
  }
  
  return {
    ...state,
    board: newBoard,
    notes: newNotes,
  };
}

function toggleNote(state, number) {
  if (state.phase !== 'playing' || state.selectedCell === null) return state;
  if (state.board[state.selectedCell] !== 0) return state;
  
  const idx = state.selectedCell;
  const newNotes = state.notes.map(n => new Set(n));
  
  if (newNotes[idx].has(number)) {
    newNotes[idx].delete(number);
  } else {
    newNotes[idx].add(number);
  }
  
  return {
    ...state,
    notes: newNotes,
  };
}

function useHint(state) {
  if (state.phase !== 'playing') return state;
  
  // Find an empty cell
  const emptyCells = state.board.map((v, i) => v === 0 ? i : -1).filter(i => i >= 0);
  if (emptyCells.length === 0) return state;
  
  // Pick a random empty cell
  const idx = emptyCells[Math.floor(Math.random() * emptyCells.length)];
  const correct = state.solution[idx];
  
  const newBoard = [...state.board];
  newBoard[idx] = correct;
  
  const newNotes = state.notes.map(n => new Set(n));
  newNotes[idx].clear();
  
  return {
    ...state,
    board: newBoard,
    notes: newNotes,
    hintsUsed: state.hintsUsed + 1,
    selectedCell: idx,
    highlightedCells: [],
  };
}

function eraseCell(state) {
  return inputNumber(state, 0);
}

function newGame(difficulty, seed) {
  return createInitialState(difficulty, seed);
}

function getEasyScore(state) {
  if (state.phase !== 'won') return 0;
  const base = 1000;
  const timePenalty = Math.floor(state.timer / 10);
  const hintPenalty = state.hintsUsed * 50;
  return Math.max(0, base - timePenalty - hintPenalty);
}

function serializeState(state) {
  const serializable = {
    ...state,
    notes: state.notes.map(n => [...n]),
  };
  return JSON.stringify(serializable);
}

function deserializeState(json) {
  try {
    const parsed = JSON.parse(json);
    return {
      ...parsed,
      notes: parsed.notes.map(n => new Set(n)),
    };
  } catch {
    return null;
  }
}

module.exports = {
  mulberry32,
  generatePuzzle,
  createInitialState,
  selectCell,
  inputNumber,
  toggleNote,
  useHint,
  eraseCell,
  newGame,
  getEasyScore,
  serializeState,
  deserializeState,
};
