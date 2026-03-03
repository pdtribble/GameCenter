import { tick, setKey, initGame } from '../../games/asteroids/index.js';

function createAudio() {
  let ctx = null;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (_) {}

  function beep(freq, dur, type, vol) {
    if (!ctx) return;
    type = type || 'square';
    vol = vol || 0.08;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + dur);
    } catch (_) {}
  }

  function resumeCtx() {
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }

  return { beep, resumeCtx };
}

const SHIP_RADIUS_DRAW = 14;

function drawShip(ctx, ship, invulnTimer, frame) {
  if (invulnTimer > 0 && frame % 6 < 3) return;

  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);

  ctx.beginPath();
  ctx.moveTo(SHIP_RADIUS_DRAW, 0);
  ctx.lineTo(-SHIP_RADIUS_DRAW * 0.65, -SHIP_RADIUS_DRAW * 0.6);
  ctx.lineTo(-SHIP_RADIUS_DRAW * 0.35, 0);
  ctx.lineTo(-SHIP_RADIUS_DRAW * 0.65, SHIP_RADIUS_DRAW * 0.6);
  ctx.closePath();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  if (ship.thrusting) {
    ctx.beginPath();
    ctx.moveTo(-SHIP_RADIUS_DRAW * 0.35, -3);
    ctx.lineTo(-SHIP_RADIUS_DRAW * 0.8, 0);
    ctx.lineTo(-SHIP_RADIUS_DRAW * 0.35, 3);
    ctx.strokeStyle = '#ff6600';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.restore();
}

function drawAsteroid(ctx, a) {
  if (!a.vertices || a.vertices.length === 0) return;

  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate(a.angle);

  ctx.beginPath();
  const first = a.vertices[0];
  ctx.moveTo(
    Math.cos(first.a) * a.radius * first.r,
    Math.sin(first.a) * a.radius * first.r
  );
  for (let i = 1; i < a.vertices.length; i++) {
    const v = a.vertices[i];
    ctx.lineTo(
      Math.cos(v.a) * a.radius * v.r,
      Math.sin(v.a) * a.radius * v.r
    );
  }
  ctx.closePath();

  ctx.strokeStyle = '#bbbbbb';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

function drawBullet(ctx, b) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(b.x, b.y, 2, 0, Math.PI * 2);
  ctx.fillStyle = '#39ff14';
  ctx.fill();
  ctx.restore();
}

function drawHUD(ctx, state, w, h) {
  ctx.save();

  ctx.font = 'bold 18px "DM Mono", monospace';
  ctx.fillStyle = '#39ff14';
  ctx.textAlign = 'left';
  ctx.fillText(String(state.score).padStart(6, '0'), 16, 28);

  if (state.highScore > 0) {
    ctx.font = '10px "DM Mono", monospace';
    ctx.fillStyle = '#1a8f1a';
    ctx.fillText('HI ' + String(state.highScore).padStart(6, '0'), 16, 44);
  }

  ctx.font = '14px "DM Mono", monospace';
  ctx.fillStyle = '#39ff14';
  ctx.textAlign = 'center';
  ctx.fillText('WAVE ' + state.level, w / 2, 28);

  const lifeW = 12;
  const lifeGap = 3;
  const startX = w - 16 - (state.lives - 1) * (lifeW + lifeGap);
  for (let i = 0; i < state.lives; i++) {
    const lx = startX + i * (lifeW + lifeGap);
    const ly = 16;
    ctx.beginPath();
    ctx.moveTo(lx + lifeW / 2, ly);
    ctx.lineTo(lx, ly + lifeW);
    ctx.lineTo(lx + lifeW * 0.35, ly + lifeW * 0.65);
    ctx.lineTo(lx + lifeW * 0.65, ly + lifeW * 0.65);
    ctx.closePath();
    ctx.strokeStyle = '#39ff14';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  ctx.restore();
}

function drawScene(ctx, state, w, h, frame) {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < state.asteroids.length; i++) {
    drawAsteroid(ctx, state.asteroids[i]);
  }

  for (let i = 0; i < state.bullets.length; i++) {
    drawBullet(ctx, state.bullets[i]);
  }

  if (state.phase !== 'dead' && state.phase !== 'gameover') {
    drawShip(ctx, state.ship, state.invulnTimer, frame);
  }

  drawHUD(ctx, state, w, h);
}

function drawOverlay(ctx, state, w, h, highScore) {
  if (state.phase === 'gameover') {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';

    ctx.font = 'bold 48px "DM Mono", monospace';
    ctx.fillStyle = '#39ff14';
    ctx.fillText('GAME OVER', w / 2, h / 2 - 50);

    ctx.font = '20px "DM Mono", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('SCORE  ' + state.score, w / 2, h / 2 - 10);

    ctx.font = '16px "DM Mono", monospace';
    ctx.fillStyle = '#888888';
    ctx.fillText('BEST   ' + Math.max(highScore, state.score), w / 2, h / 2 + 20);

    ctx.font = '12px "DM Mono", monospace';
    ctx.fillStyle = '#39ff14';
    ctx.fillText('PRESS R TO RESTART', w / 2, h / 2 + 60);

    ctx.restore();
  } else if (state.phase === 'dead' && state.lives > 0) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '16px "DM Mono", monospace';
    ctx.fillStyle = 'rgba(255,100,100,0.8)';
    ctx.fillText('— ' + state.lives + (state.lives === 1 ? ' LIFE LEFT —' : ' LIVES LEFT —'), w / 2, h / 2 + 40);
    ctx.restore();
  }
}

export function startRenderer(initialState, canvas, navigate) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  let state = { ...initialState, width: w, height: h };
  let rafId = null;
  let frame = 0;
  let highScore = parseInt(localStorage.getItem('asteroids_hs') || '0', 10);
  state.highScore = highScore;
  let lastTime = 0;

  const audio = createAudio();

  let prevAsteroidCount = state.asteroids.length;
  let prevPhase = state.phase;

  function handleKeyDown(e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter',
         'w', 'a', 's', 'd', 'W', 'A', 'S', 'D'].includes(e.key)) {
      e.preventDefault();
    }
    audio.resumeCtx();
    state = setKey(state, e.key, true);
  }

  function handleKeyUp(e) {
    state = setKey(state, e.key, false);
  }

  function loop(timestamp) {
    const dt = lastTime ? Math.min((timestamp - lastTime) / 1000, 0.1) : 1/60;
    lastTime = timestamp;
    
    frame++;

    const prevScore = state.score;
    const curPhase = state.phase;
    const curAsteroidCount = state.asteroids.length;

    state = tick(state, dt);

    if (state.asteroids.length < curAsteroidCount) {
      audio.beep(440, 0.05, 'square', 0.08);
    }

    // Live high score tracking - save immediately when surpassed
    if (state.score > highScore) {
      highScore = state.score;
      state.highScore = highScore;
      localStorage.setItem('asteroids_hs', String(highScore));
    }

    if (state.phase === 'dead' && curPhase === 'playing') {
      audio.beep(80, 0.2, 'sawtooth', 0.12);
    }

    if (state.phase === 'gameover' && curPhase !== 'gameover') {
      audio.beep(60, 0.4, 'sawtooth', 0.15);
    }

    if (state.phase === 'gameover' && (state.keys['r'] || state.keys['R'])) {
      const savedKeys = { ...state.keys };
      state = initGame(w, h);
      state.keys = savedKeys;
      state.highScore = highScore;
      prevAsteroidCount = state.asteroids.length;
      prevPhase = state.phase;
      frame = 0;
    }

    prevAsteroidCount = state.asteroids.length;
    prevPhase = state.phase;

    drawScene(ctx, state, w, h, frame);
    drawOverlay(ctx, state, w, h, highScore);

    rafId = requestAnimationFrame(loop);
  }

  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup', handleKeyUp);
  rafId = requestAnimationFrame(loop);

  return function cleanup() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    document.removeEventListener('keydown', handleKeyDown);
    document.removeEventListener('keyup', handleKeyUp);
  };
}
