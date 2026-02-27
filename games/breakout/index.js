'use strict';

const DIFFICULTY_SETTINGS = {
  easy:   { rows: 3, cols: 8, lives: 5, ballSpeed: 3, brickDurability: [1, 1, 1] },
  medium: { rows: 4, cols: 9, lives: 4, ballSpeed: 4, brickDurability: [1, 2, 2, 2] },
  hard:   { rows: 5, cols: 10, lives: 3, ballSpeed: 5, brickDurability: [1, 2, 3, 3, 3] },
};

const BRICK_COLORS = ['#ff4560', '#ff9800', '#30d890', '#4090ff', '#9060ff'];
const BRICK_POINTS = [10, 20, 30, 40, 50];

const POWERUP_TYPES = {
  wide: { color: '#f0c040', symbol: '↔', duration: 10000 },
  slow: { color: '#00ccff', symbol: '🐢', duration: 8000 },
  extra: { color: '#ff69b4', symbol: '✦', duration: 0 },
};

function createPowerUp(x, y) {
  const types = Object.keys(POWERUP_TYPES);
  const type = types[Math.floor(Math.random() * types.length)];
  return {
    x,
    y,
    type,
    ...POWERUP_TYPES[type],
    speed: 2,
    width: 24,
    height: 24,
  };
}

function getDifficultySettings(difficulty) {
  return DIFFICULTY_SETTINGS[difficulty] || DIFFICULTY_SETTINGS.easy;
}

function createBricks(difficulty) {
  const cfg = getDifficultySettings(difficulty);
  const bricks = [];
  const brickWidth = 70;
  const brickHeight = 20;
  const padding = 8;
  const offsetTop = 60;
  const offsetLeft = (800 - (cfg.cols * (brickWidth + padding) - padding)) / 2;
  
  for (let row = 0; row < cfg.rows; row++) {
    for (let col = 0; col < cfg.cols; col++) {
      const tier = Math.min(row, cfg.brickDurability.length - 1);
      bricks.push({
        x: offsetLeft + col * (brickWidth + padding),
        y: offsetTop + row * (brickHeight + padding),
        width: brickWidth,
        height: brickHeight,
        durability: cfg.brickDurability[tier],
        maxDurability: cfg.brickDurability[tier],
        color: BRICK_COLORS[tier],
        points: BRICK_POINTS[tier],
        alive: true,
      });
    }
  }
  return bricks;
}

function initGame(difficulty) {
  const cfg = getDifficultySettings(difficulty);
  
  return {
    width: 800,
    height: 500,
    paddleWidth: 100,
    paddleHeight: 15,
    ballRadius: 8,
    paddleX: 400,
    ballX: 400,
    ballY: 400,
    ballVX: cfg.ballSpeed * (Math.random() > 0.5 ? 1 : -1),
    ballVY: -cfg.ballSpeed,
    lives: cfg.lives,
    score: 0,
    highScore: 0,
    level: 1,
    difficulty,
    bricks: createBricks(difficulty),
    phase: 'ready',
    paused: false,
    ballAttached: true,
    powerUps: [],
    activePowerUps: {},
  };
}

function movePaddle(state, dx) {
  const newX = Math.max(state.paddleWidth / 2, Math.min(state.width - state.paddleWidth / 2, state.paddleX + dx));
  let newBallX = state.ballX;
  if (state.ballAttached) {
    newBallX = newX;
  }
  return { ...state, paddleX: newX, ballX: newBallX };
}

function launchBall(state) {
  if (!state.ballAttached) return state;
  const cfg = getDifficultySettings(state.difficulty);
  return {
    ...state,
    ballAttached: false,
    ballVX: cfg.ballSpeed * (Math.random() > 0.5 ? 1 : -1),
    ballVY: -cfg.ballSpeed,
  };
}

function updateBall(state) {
  if (state.ballAttached) return state;
  
  let { ballX, ballY, ballVX, ballVY, score } = state;
  
  ballX += ballVX;
  ballY += ballVY;
  
  // Wall collision (left/right)
  if (ballX - state.ballRadius <= 0) {
    ballX = state.ballRadius;
    ballVX = -ballVX;
  }
  if (ballX + state.ballRadius >= state.width) {
    ballX = state.width - state.ballRadius;
    ballVX = -ballVX;
  }
  
  // Ceiling collision
  if (ballY - state.ballRadius <= 0) {
    ballY = state.ballRadius;
    ballVY = -ballVY;
  }
  
  // Paddle collision
  if (ballVY > 0 &&
      ballY + state.ballRadius >= state.height - 30 - state.paddleHeight &&
      ballY - state.ballRadius <= state.height - 30 &&
      ballX >= state.paddleX - state.paddleWidth / 2 &&
      ballX <= state.paddleX + state.paddleWidth / 2) {
    ballY = state.height - 30 - state.paddleHeight - state.ballRadius;
    ballVY = -ballVY;
    
    // Add angle based on where ball hit paddle
    const hitPos = (ballX - state.paddleX) / (state.paddleWidth / 2);
    ballVX = hitPos * 4 + ballVX * 0.5;
  }
  
  // Brick collision
  let newBricks = state.bricks.map(brick => {
    if (!brick.alive) return brick;
    
    if (ballX + state.ballRadius > brick.x &&
        ballX - state.ballRadius < brick.x + brick.width &&
        ballY + state.ballRadius > brick.y &&
        ballY - state.ballRadius < brick.y + brick.height) {
      
      // Determine collision side
      const overlapLeft = ballX + state.ballRadius - brick.x;
      const overlapRight = brick.x + brick.width - (ballX - state.ballRadius);
      const overlapTop = ballY + state.ballRadius - brick.y;
      const overlapBottom = brick.y + brick.height - (ballY - state.ballRadius);
      
      const minOverlapX = Math.min(overlapLeft, overlapRight);
      const minOverlapY = Math.min(overlapTop, overlapBottom);
      
      if (minOverlapX < minOverlapY) {
        ballVX = -ballVX;
      } else {
        ballVY = -ballVY;
      }
      
      return {
        ...brick,
        durability: brick.durability - 1,
        alive: brick.durability - 1 > 0,
      };
    }
    return brick;
  });
  
  // Calculate score from destroyed bricks
  const oldBricks = state.bricks;
  let pointsGained = 0;
  let newPowerUps = [...(state.powerUps || [])];
  
  for (let i = 0; i < newBricks.length; i++) {
    if (oldBricks[i].alive && !newBricks[i].alive) {
      pointsGained += oldBricks[i].points * state.level;
      // 20% chance to spawn powerup
      if (Math.random() < 0.2) {
        newPowerUps.push(createPowerUp(
          oldBricks[i].x + oldBricks[i].width / 2,
          oldBricks[i].y + oldBricks[i].height
        ));
      }
    }
  }
  score += pointsGained;
  
  // Update powerups
  newPowerUps = newPowerUps.map(p => ({ ...p, y: p.y + p.speed }));
  
  // Collect powerups with paddle
  const paddleTop = state.height - 30 - state.paddleHeight;
  const currentPaddleWidth = (state.activePowerUps?.wide) ? state.paddleWidth * 1.5 : state.paddleWidth;
  newPowerUps = newPowerUps.filter(p => {
    if (p.y + p.height >= paddleTop &&
        p.x + p.width / 2 >= state.paddleX - currentPaddleWidth / 2 &&
        p.x - p.width / 2 <= state.paddleX + currentPaddleWidth / 2) {
      // Activate powerup
      if (p.type === 'wide') {
        return false; // wide is handled in renderer
      }
      if (p.type === 'slow') {
        return false;
      }
      if (p.type === 'extra') {
        return false;
      }
    }
    return p.y < state.height;
  });
  
  // Check if ball fell
  if (ballY > state.height) {
    const newLives = state.lives - 1;
    if (newLives <= 0) {
      return { ...state, phase: 'lost' };
    }
    return {
      ...state,
      lives: newLives,
      ballX: state.paddleX,
      ballY: state.height - 30 - state.paddleHeight - state.ballRadius - 2,
      ballVX: getDifficultySettings(state.difficulty).ballSpeed,
      ballVY: 0,
      ballAttached: true,
      powerUps: [],
      activePowerUps: {},
    };
  }
  
  // Check if all bricks destroyed (level complete)
  const aliveBricks = newBricks.filter(b => b.alive);
  if (aliveBricks.length === 0) {
    const newLevel = state.level + 1;
    const cfg = getDifficultySettings(state.difficulty);
    const newSpeed = cfg.ballSpeed + newLevel * 0.5;
    return {
      ...state,
      level: newLevel,
      score,
      bricks: createBricks(state.difficulty),
      ballX: state.paddleX,
      ballY: state.height - 30 - state.paddleHeight - state.ballRadius - 2,
      ballVX: newSpeed * (Math.random() > 0.5 ? 1 : -1),
      ballVY: 0,
      ballAttached: true,
      powerUps: [],
    };
  }
  
  return { ...state, bricks: newBricks, ballX, ballY, ballVX, ballVY, score, powerUps: newPowerUps };
}

function tick(state) {
  if (state.phase !== 'playing' || state.paused) return state;
  
  const newState = updateBall(state);
  
  if (newState.phase === 'lost') {
    return { ...newState, highScore: Math.max(newState.score, newState.highScore) };
  }
  
  return newState;
}

function serializeState(state) {
  return JSON.stringify(state);
}

function deserializeState(json) {
  return JSON.parse(json);
}

module.exports = {
  DIFFICULTY_SETTINGS,
  POWERUP_TYPES,
  getDifficultySettings,
  initGame,
  createBricks,
  createPowerUp,
  movePaddle,
  launchBall,
  updateBall,
  tick,
  serializeState,
  deserializeState,
};

if (typeof exports !== 'undefined') {
  Object.keys(module.exports).forEach(key => {
    exports[key] = module.exports[key];
  });
}
