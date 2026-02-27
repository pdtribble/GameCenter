'use strict';

const DIFFICULTY_SETTINGS = {
  easy:   { winScore: 5, aiSpeed: 0.08, ballSpeed: 4 },
  medium: { winScore: 7, aiSpeed: 0.12, ballSpeed: 5 },
  hard:   { winScore: 10, aiSpeed: 0.18, ballSpeed: 6 },
};

function getDifficultySettings(difficulty) {
  return DIFFICULTY_SETTINGS[difficulty] || DIFFICULTY_SETTINGS.easy;
}

function initGame(difficulty) {
  const cfg = getDifficultySettings(difficulty);
  
  return {
    width: 800,
    height: 500,
    paddleWidth: 15,
    paddleHeight: 80,
    ballRadius: 8,
    playerY: 250 - 40,
    aiY: 250 - 40,
    ballX: 400,
    ballY: 250,
    ballVX: cfg.ballSpeed,
    ballVY: cfg.ballSpeed * 0.5,
    playerScore: 0,
    aiScore: 0,
    rally: 0,
    maxRally: 0,
    wins: 0,
    difficulty,
    winScore: cfg.winScore,
    aiSpeed: cfg.aiSpeed,
    baseBallSpeed: cfg.ballSpeed,
    phase: 'ready',
    paused: false,
  };
}

function resetBall(state, scorer) {
  const cfg = getDifficultySettings(state.difficulty);
  const direction = scorer === 'player' ? -1 : 1;
  
  return {
    ...state,
    ballX: state.width / 2,
    ballY: state.height / 2,
    ballVX: direction * cfg.ballSpeed,
    ballVY: (Math.random() - 0.5) * cfg.ballSpeed * 0.8,
    rally: 0,
  };
}

function movePlayer(state, dy) {
  const newY = Math.max(state.paddleHeight / 2, Math.min(state.height - state.paddleHeight / 2, state.playerY + dy));
  return { ...state, playerY: newY };
}

function predictBallY(state) {
  if (state.ballVX <= 0) return state.ballY;
  
  let x = state.ballX;
  let y = state.ballY;
  let vx = state.ballVX;
  let vy = state.ballVY;
  
  while (x < state.width - 30 - state.paddleWidth) {
    x += vx;
    y += vy;
    
    if (y - state.ballRadius <= 0 || y + state.ballRadius >= state.height) {
      vy = -vy;
    }
  }
  
  return y;
}

function moveAI(state) {
  let targetY;
  
  // AI speeds up as rally increases (max 50% increase)
  const rallyMultiplier = 1 + Math.min(state.rally * 0.02, 0.5);
  const currentAISpeed = state.aiSpeed * rallyMultiplier;
  
  if (state.ballVX > 0) {
    targetY = predictBallY(state);
  } else {
    const centerY = state.height / 2;
    const retreatSpeed = 0.3;
    targetY = state.aiY + (centerY - state.aiY) * retreatSpeed;
  }
  
  targetY = targetY - state.paddleHeight / 2;
  
  const diff = targetY - state.aiY;
  const move = Math.sign(diff) * Math.min(Math.abs(diff), currentAISpeed * state.height);
  
  const newY = Math.max(state.paddleHeight / 2, Math.min(state.height - state.paddleHeight / 2, state.aiY + move));
  return { ...state, aiY: newY };
}

function updateBall(state) {
  let { ballX, ballY, ballVX, ballVY, rally, maxRally } = state;
  
  ballX += ballVX;
  ballY += ballVY;
  
  // Wall collision (top/bottom)
  if (ballY - state.ballRadius <= 0) {
    ballY = state.ballRadius;
    ballVY = -ballVY;
  }
  if (ballY + state.ballRadius >= state.height) {
    ballY = state.height - state.ballRadius;
    ballVY = -ballVY;
  }
  
  // Paddle collision
  const playerLeft = 30;
  const playerRight = 30 + state.paddleWidth;
  const aiLeft = state.width - 30 - state.paddleWidth;
  const aiRight = state.width - 30;
  
  // Player paddle
  if (ballVX < 0 &&
      ballX - state.ballRadius <= playerRight &&
      ballX + state.ballRadius >= playerLeft &&
      ballY >= state.playerY - state.paddleHeight / 2 &&
      ballY <= state.playerY + state.paddleHeight / 2) {
    ballX = playerRight + state.ballRadius;
    ballVX = -ballVX * 1.05;
    rally++;
    maxRally = Math.max(maxRally, rally);
    
    // Add spin based on where ball hit paddle
    const hitPos = (ballY - state.playerY) / (state.paddleHeight / 2);
    ballVY += hitPos * 2;
  }
  
  // AI paddle
  if (ballVX > 0 &&
      ballX + state.ballRadius >= aiLeft &&
      ballX - state.ballRadius <= aiRight &&
      ballY >= state.aiY - state.paddleHeight / 2 &&
      ballY <= state.aiY + state.paddleHeight / 2) {
    ballX = aiLeft - state.ballRadius;
    ballVX = -ballVX * 1.05;
    rally++;
    maxRally = Math.max(maxRally, rally);
    
    const hitPos = (ballY - state.aiY) / (state.paddleHeight / 2);
    ballVY += hitPos * 2;
  }
  
  // Score
  if (ballX <= 0) {
    const newState = { ...state, ballX, ballY, ballVX, ballVY, rally, maxRally, aiScore: state.aiScore + 1 };
    return resetBall(newState, 'ai');
  }
  if (ballX >= state.width) {
    const newState = { ...state, ballX, ballY, ballVX, ballVY, rally, maxRally, playerScore: state.playerScore + 1 };
    return resetBall(newState, 'player');
  }
  
  return { ...state, ballX, ballY, ballVX, ballVY, rally, maxRally };
}

function tick(state) {
  if (state.phase !== 'playing' || state.paused) return state;
  
  let newState = updateBall(state);
  newState = moveAI(newState);
  
  // Check win condition
  if (newState.playerScore >= newState.winScore) {
    return { ...newState, phase: 'won', wins: newState.wins + 1 };
  }
  if (newState.aiScore >= newState.winScore) {
    return { ...newState, phase: 'lost' };
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
  getDifficultySettings,
  initGame,
  movePlayer,
  moveAI,
  updateBall,
  tick,
  resetBall,
  serializeState,
  deserializeState,
};

if (typeof exports !== 'undefined') {
  Object.keys(module.exports).forEach(key => {
    exports[key] = module.exports[key];
  });
}
