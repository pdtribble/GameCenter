export const EMPTY = 0;
export const SOLID = 1;
export const FOOD = 2;
export const EXIT = 3;

export const LEVELS = [
  {
    id: 0,
    name: 'Gravity',
    description: 'Learn to fall',
    grid: [
      '##############',
      '#S..F........#',
      '###########..#',
      '###########..#',
      '###########E.#',
      '##############',
    ],
  },
  {
    id: 1,
    name: 'The Drop',
    description: 'Fall through shaft',
    grid: [
      '################',
      '#S..FF.........#',
      '#########......#',
      '#########......#',
      '#########......#',
      '#########.E....#',
      '################',
    ],
  },
  {
    id: 2,
    name: 'Deep Shaft',
    description: 'Vertical descent',
    grid: [
      '################',
      '#S..FFF........#',
      '###########....#',
      '###########....#',
      '###########....#',
      '###########....#',
      '###########....#',
      '###########.E..#',
      '################',
    ],
  },
  {
    id: 3,
    name: 'Two Drops',
    description: 'Double descent',
    grid: [
      '################',
      '#S...FFF.......#',
      '##########.....#',
      '##########.....#',
      '##########.....#',
      '######.....#####',
      '######.....#####',
      '######E....#####',
      '######.....#####',
      '################',
    ],
  },
  {
    id: 4,
    name: 'Canyon Path',
    description: 'Navigate canyon',
    grid: [
      '##################',
      '#S...FFF..........#',
      '##########......##',
      '##########......##',
      '##########......##',
      '########........##',
      '########........##',
      '########.E......##',
      '##################',
    ],
  },
  {
    id: 5,
    name: 'The Gauntlet',
    description: 'Complex puzzle',
    grid: [
      '####################',
      '#S....FFFF.........#',
      '############......##',
      '############......##',
      '########............#',
      '########.....#######',
      '########.....#......',
      '..........#..#......',
      '##########.E.#######',
      '####################',
    ],
  },
  {
    id: 6,
    name: 'Spiral Tower',
    description: 'Spiral descent',
    grid: [
      '####################',
      '#S.....FFFFF.......#',
      '################...#',
      '################...#',
      '..................##',
      '################...#',
      '################...#',
      '..................##',
      '################...#',
      '################E..#',
      '####################',
    ],
  },
  {
    id: 7,
    name: 'The Nightmare',
    description: 'Ultimate challenge',
    grid: [
      '########################',
      '#S......FFFFFF.........#',
      '####################..##',
      '####################..##',
      '................########',
      '##########........#####',
      '##########........#....',
      '##########...#...#....#',
      '##........#...#...####.',
      '##......#...#...........#',
      '##....#...#...E.########',
      '########################',
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

  while (!isGrounded(snake, tiles, height)) {
    for (const segment of snake) {
      segment.y += 1;
    }

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

  if (direction === 'up' && !isGrounded(state.snake, state.tiles, state.height)) {
    return state;
  }

  let newState = { ...state, direction, moveCount: state.moveCount + 1 };
  const head = newState.snake[0];
  const newHead = { ...head };

  if (direction === 'left') newHead.x -= 1;
  else if (direction === 'right') newHead.x += 1;
  else if (direction === 'up') newHead.y -= 1;
  else if (direction === 'down') newHead.y += 1;

  if (newHead.x < 0 || newHead.x >= newState.width ||
      newHead.y < 0 || newHead.y >= newState.height) {
    return { ...newState, phase: 'dead' };
  }

  const tileAtHead = newState.tiles[newHead.y][newHead.x];

  if (tileAtHead === SOLID) {
    return { ...newState, phase: 'dead' };
  }

  for (const segment of newState.snake) {
    if (segment.x === newHead.x && segment.y === newHead.y) {
      return { ...newState, phase: 'dead' };
    }
  }

  if (tileAtHead === EXIT) {
    return { ...newState, phase: 'won', snake: [newHead, ...newState.snake.slice(0, -1)] };
  }

  const newSnake = [newHead, ...newState.snake];

  if (tileAtHead === FOOD) {
    newState.tiles[newHead.y][newHead.x] = EMPTY;
    newState.totalFoodEaten += 1;
  } else {
    newSnake.pop();
  }

  newState.snake = newSnake;
  newState = applyGravity(newState);

  return newState;
}
