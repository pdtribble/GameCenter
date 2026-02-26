'use strict';

const DIFFICULTY_SETTINGS = {
  easy:   { width: 20, height: 20, startSpeed: 200, minSpeed: 100, speedStep: 5 },
  medium: { width: 25, height: 25, startSpeed: 150, minSpeed: 70, speedStep: 4 },
  hard:   { width: 30, height: 30, startSpeed: 100, minSpeed: 40, speedStep: 3 },
};

function getDifficultySettings(difficulty) {
  return DIFFICULTY_SETTINGS[difficulty] || DIFFICULTY_SETTINGS.easy;
}

function getSpeedStep(difficulty) {
  return getDifficultySettings(difficulty).speedStep;
}

function initGame(difficulty) {
  const cfg = getDifficultySettings(difficulty);
  const cx = Math.floor(cfg.width / 2);
  const cy = Math.floor(cfg.height / 2);
  
  return {
    width: cfg.width,
    height: cfg.height,
    snake: [
      { x: cx, y: cy },
      { x: cx - 1, y: cy },
      { x: cx - 2, y: cy },
    ],
    direction: 'right',
    nextDirection: 'right',
    food: null,
    phase: 'ready',
    score: 0,
    highScore: 0,
    tickCount: 0,
    speed: cfg.startSpeed,
    difficulty,
  };
}

function placeFood(state, rngFn) {
  const { width, height, snake } = state;
  const snakeSet = new Set(snake.map(p => `${p.x},${p.y}`));
  
  const candidates = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!snakeSet.has(`${x},${y}`)) {
        candidates.push({ x, y });
      }
    }
  }
  
  if (candidates.length === 0) return null;
  
  const idx = Math.floor(rngFn() * candidates.length);
  return candidates[idx];
}

function queueDirection(state, direction) {
  const opposites = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const currentDir = state.direction;
  const nextDir = state.nextDirection;
  
  if (direction === opposites[currentDir]) return state;
  if (direction === nextDir) return state;
  
  return { ...state, nextDirection: direction };
}

function tick(state, rngFn) {
  if (state.phase !== 'playing') return state;
  
  const cfg = getDifficultySettings(state.difficulty);
  const newDir = state.nextDirection;
  
  const head = state.snake[0];
  let newHead = { x: head.x, y: head.y };
  
  switch (newDir) {
    case 'up':    newHead.y -= 1; break;
    case 'down':  newHead.y += 1; break;
    case 'left':  newHead.x -= 1; break;
    case 'right': newHead.x += 1; break;
  }
  
  if (newHead.x < 0 || newHead.x >= state.width ||
      newHead.y < 0 || newHead.y >= state.height) {
    return { ...state, phase: 'dead', tickCount: state.tickCount + 1 };
  }
  
  const snakeSet = new Set(state.snake.map(p => `${p.x},${p.y}`));
  if (snakeSet.has(`${newHead.x},${newHead.y}`)) {
    return { ...state, phase: 'dead', tickCount: state.tickCount + 1 };
  }
  
  let newSnake = [newHead, ...state.snake];
  let newScore = state.score;
  let newSpeed = state.speed;
  let newFood = state.food;
  
  const isEating = newFood && newHead.x === newFood.x && newHead.y === newFood.y;
  
  if (isEating) {
    newScore += 1;
    const speedDrop = cfg.speedStep;
    newSpeed = Math.max(cfg.minSpeed, cfg.startSpeed - newScore * speedDrop);
    newFood = placeFood(state, rngFn);
  } else {
    newSnake.pop();
    if (!newFood) {
      newFood = placeFood(state, rngFn);
    }
  }
  
  return {
    ...state,
    snake: newSnake,
    direction: newDir,
    food: newFood,
    phase: 'playing',
    score: newScore,
    tickCount: state.tickCount + 1,
    speed: newSpeed,
  };
}

function serializeState(state) {
  return JSON.stringify(state);
}

function deserializeState(json) {
  return JSON.parse(json);
}

module.exports = {
  DIFFICULTY_SETTINGS,
  getDifficultySettings,
  getSpeedStep,
  initGame,
  queueDirection,
  tick,
  serializeState,
  deserializeState,
};

if (typeof exports !== 'undefined') {
  Object.keys(module.exports).forEach(key => {
    exports[key] = module.exports[key];
  });
}
