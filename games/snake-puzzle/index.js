// Tile types
export const EMPTY = 0;
export const SOLID = 1;
export const FOOD = 2;
export const EXIT = 3;

export const LEVELS = [
  {
    id: 0,
    name: 'Gravity 101',
    description: 'Learn to fall',
    grid: [
      '#########',
      '#S.F....#',
      '#########',
      '#....E..#',
      '#########',
    ],
  },
  {
    id: 1,
    name: 'The Drop',
    description: 'Navigate a gap',
    grid: [
      '##########',
      '#S.F.....#',
      '####.#####',
      '.....E...',
      '##########',
    ],
  },
  {
    id: 2,
    name: 'The Shaft',
    description: 'Fill the vertical shaft (need length 4)',
    grid: [
      '##########',
      '##.....##',
      '##E....##',
      '##.....##',
      '##.....##',
      'S.FFF....#',
      '##########',
    ],
  },
  {
    id: 3,
    name: 'The Overhang',
    description: 'Hang off the edge (need length 4)',
    grid: [
      '###########',
      '#S..FFFF..#',
      '########..#',
      '########..#',
      '########E.#',
      '#...###########',
    ],
  },
  {
    id: 4,
    name: 'The Deep Wrap',
    description: 'Complete the U-shape (need length 5)',
    grid: [
      '##########',
      '#S.FFFFF.#',
      '########.#',
      '########.#',
      '########.#',
      '........E#',
      '##########',
    ],
  },
];

function parseTiles(grid) {
  const tiles = [];
  let startPos = null;

  for (let row = 0; row < grid.length; row++) {
    const line = grid[row];
    tiles[row] = [];
    for (let col = 0; col < line.length; col++) {
      const char = line[col];
      if (char === '#') tiles[row][col] = SOLID;
      else if (char === 'F') tiles[row][col] = FOOD;
      else if (char === 'E') tiles[row][col] = EXIT;
      else if (char === 'S') {
        tiles[row][col] = EMPTY;
        startPos = { x: col, y: row };
      } else tiles[row][col] = EMPTY;
    }
  }

  return { tiles, startPos };
}

export function initLevel(levelIndex) {
  const level = LEVELS[levelIndex];
  const { tiles, startPos } = parseTiles(level.grid);
  const height = tiles.length;
  const width = tiles[0].length;

  // Count food for total length needed
  let foodCount = 0;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (tiles[row][col] === FOOD) foodCount++;
    }
  }

  return {
    levelIndex,
    levelName: level.name,
    tiles,
    width,
    height,
    snake: [startPos],
    direction: 'right',
    phase: 'playing',
    moveCount: 0,
    foodCount,
    totalFoodEaten: 0,
  };
}

function isGrounded(snake, tiles, height) {
  // Check if any segment has a solid tile directly below it
  for (const segment of snake) {
    const below = segment.y + 1;
    if (below < height && tiles[below] && tiles[below][segment.x] === SOLID) {
      return true;
    }
  }
  return false;
}

function applyGravity(state) {
  const { snake, tiles, height } = state;

  // Fall until grounded or out of bounds
  while (!isGrounded(snake, tiles, height)) {
    // Move all segments down 1
    for (const segment of snake) {
      segment.y += 1;
    }

    // Check if any segment is out of bounds (off bottom)
    for (const segment of snake) {
      if (segment.y >= height) {
        return { ...state, phase: 'dead' };
      }
    }
  }

  return state;
}

export function processInput(state, direction) {
  if (state.phase !== 'playing') return state;

  // Can only jump when grounded
  if (direction === 'up' && !isGrounded(state.snake, state.tiles, state.height)) {
    return state;
  }

  let newState = { ...state, direction, moveCount: state.moveCount + 1 };
  const head = newState.snake[0];
  const newHead = { ...head };

  // Move head in direction
  if (direction === 'left') newHead.x -= 1;
  else if (direction === 'right') newHead.x += 1;
  else if (direction === 'up') newHead.y -= 1;
  else if (direction === 'down') newHead.y += 1;

  // Bounds check
  if (newHead.x < 0 || newHead.x >= newState.width ||
      newHead.y < 0 || newHead.y >= newState.height) {
    return { ...newState, phase: 'dead' };
  }

  const tileAtHead = newState.tiles[newHead.y][newHead.x];

  // Hit solid wall
  if (tileAtHead === SOLID) {
    return { ...newState, phase: 'dead' };
  }

  // Self collision
  for (const segment of newState.snake) {
    if (segment.x === newHead.x && segment.y === newHead.y) {
      return { ...newState, phase: 'dead' };
    }
  }

  // Check win BEFORE gravity (important!)
  if (tileAtHead === EXIT) {
    return { ...newState, phase: 'won', snake: [newHead, ...newState.snake.slice(0, -1)] };
  }

  // Add new head, remove tail (unless eating food)
  const newSnake = [newHead, ...newState.snake];

  if (tileAtHead === FOOD) {
    // Eat food: don't remove tail, mark tile as empty
    newState.tiles[newHead.y][newHead.x] = EMPTY;
    newState.totalFoodEaten += 1;
  } else {
    // Normal move: remove tail
    newSnake.pop();
  }

  newState.snake = newSnake;

  // Apply gravity
  newState = applyGravity(newState);

  return newState;
}

