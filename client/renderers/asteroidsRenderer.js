import { tick, setKey, initGame } from '../../games/asteroids/index.js';

// ─── Audio ────────────────────────────────────────────────────────────────────

function createAudio() {
  let ctx = null;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (_) {
    // No audio support
  }

  function beep(freq, dur, type, vol) {
    if (!ctx) return;
    type = type || 'square';
    vol  = vol  || 0.12;
    try {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + dur);
    } catch (_) {
      // Ignore audio errors
    }
  }

  function resumeCtx() {
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }

  return { beep, resumeCtx };
}

// ─── Drawing helpers ──────────────────────────────────────────────────────────

function drawShip(ctx, ship, invulnTimer, frame) {
  if (invulnTimer > 0 && frame % 6 < 3) return; // blink

  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);

  // Main hull triangle
  ctx.beginPath();
  ctx.moveTo(SHIP_RADIUS_DRAW, 0);
  ctx.lineTo(-SHIP_RADIUS_DRAW * 0.65, -SHIP_RADIUS_DRAW * 0.6);
  ctx.lineTo(-SHIP_RADIUS_DRAW * 0.35, 0);
  ctx.lineTo(-SHIP_RADIUS_DRAW * 0.65, SHIP_RADIUS_DRAW * 0.6);
  ctx.closePath();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Thruster glow
  if (ship.thrusting) {
    const flickerLen = 8 + Math.random() * 6;
    ctx.beginPath();
    ctx.moveTo(-SHIP_RADIUS_DRAW * 0.35, -4);
    ctx.lineTo(-SHIP_RADIUS_DRAW * 0.35 - flickerLen, 0);
    ctx.lineTo(-SHIP_RADIUS_DRAW * 0.35, 4);
    ctx.strokeStyle = '#ff6600';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Inner brighter flicker
    ctx.beginPath();
    ctx.moveTo(-SHIP_RADIUS_DRAW * 0.35, -2);
    ctx.lineTo(-SHIP_RADIUS_DRAW * 0.35 - flickerLen * 0.6, 0);
    ctx.lineTo(-SHIP_RADIUS_DRAW * 0.35, 2);
    ctx.strokeStyle = '#ffdd00';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.restore();
}

// Draw constant matches the game logic constant
const SHIP_RADIUS_DRAW = 14;

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

  ctx.fillStyle = '#0a0a08';
  ctx.fill();
  ctx.strokeStyle = '#bbbbbb';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

function drawBullet(ctx, b) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.fromUfo ? 3 : 2.5, 0, Math.PI * 2);
  ctx.fillStyle = b.fromUfo ? '#ff4444' : '#39ff14';
  ctx.fill();

  // Glow
  ctx.shadowBlur = 8;
  ctx.shadowColor = b.fromUfo ? '#ff0000' : '#39ff14';
  ctx.fill();

  ctx.restore();
}

function drawUfo(ctx, ufo) {
  ctx.save();
  ctx.translate(ufo.x, ufo.y);

  // Bottom dome
  ctx.beginPath();
  ctx.ellipse(0, 4, ufo.radius, 7, 0, 0, Math.PI);
  ctx.fillStyle = '#334433';
  ctx.fill();
  ctx.strokeStyle = '#88ff88';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Top bubble
  ctx.beginPath();
  ctx.ellipse(0, 2, ufo.radius * 0.55, 10, 0, Math.PI, 0);
  ctx.fillStyle = '#1a2e1a';
  ctx.fill();
  ctx.strokeStyle = '#88ff88';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Middle band (widest part)
  ctx.beginPath();
  ctx.ellipse(0, 4, ufo.radius, 5, 0, 0, Math.PI * 2);
  ctx.strokeStyle = '#aaffaa';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
}

function drawParticles(ctx, particles) {
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.restore();
  }
}

function drawHUD(ctx, state, w, h) {
  ctx.save();

  // Score — top left
  ctx.font = 'bold 20px "DM Mono", monospace';
  ctx.fillStyle = '#39ff14';
  ctx.textAlign = 'left';
  ctx.fillText(String(state.score).padStart(6, '0'), 16, 32);

  // High score — below score
  if (state.highScore > 0) {
    ctx.font = '12px "DM Mono", monospace';
    ctx.fillStyle = '#1a8f1a';
    ctx.fillText('HI ' + String(state.highScore).padStart(6, '0'), 16, 50);
  }

  // Level — top center
  ctx.font = '14px "DM Mono", monospace';
  ctx.fillStyle = '#39ff14';
  ctx.textAlign = 'center';
  ctx.fillText('LVL ' + state.level, w / 2, 26);

  // Lives — top right as triangle icons
  const lifeW = 14;
  const lifeGap = 4;
  const startX = w - 16 - (state.lives - 1) * (lifeW + lifeGap);
  for (let i = 0; i < state.lives; i++) {
    const lx = startX + i * (lifeW + lifeGap);
    const ly = 14;
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
  // Clear
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);

  ctx.save();

  // Pass 8: screen shake
  if (state.screenShake > 0.5) {
    const sx = (Math.random() - 0.5) * state.screenShake;
    const sy = (Math.random() - 0.5) * state.screenShake;
    ctx.translate(sx, sy);
  }

  // Asteroids
  for (let i = 0; i < state.asteroids.length; i++) {
    drawAsteroid(ctx, state.asteroids[i]);
  }

  // Bullets
  for (let i = 0; i < state.bullets.length; i++) {
    drawBullet(ctx, state.bullets[i]);
  }

  // UFO
  if (state.ufo) {
    drawUfo(ctx, state.ufo);
  }

  // Particles
  drawParticles(ctx, state.particles);

  // Ship (not drawn while dead)
  if (state.phase !== 'dead' && state.phase !== 'gameover') {
    drawShip(ctx, state.ship, state.invulnTimer, frame);
  }

  ctx.restore();

  // HUD drawn without shake
  drawHUD(ctx, state, w, h);
}

function drawOverlay(ctx, state, w, h, highScore) {
  if (state.phase === 'gameover') {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';

    ctx.font = 'bold 52px "DM Mono", monospace';
    ctx.fillStyle = '#39ff14';
    ctx.fillText('GAME OVER', w / 2, h / 2 - 60);

    ctx.font = '24px "DM Mono", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('SCORE  ' + state.score, w / 2, h / 2 - 16);

    ctx.font = '18px "DM Mono", monospace';
    ctx.fillStyle = '#888888';
    ctx.fillText('BEST   ' + Math.max(highScore, state.score), w / 2, h / 2 + 16);

    ctx.font = '14px "DM Mono", monospace';
    ctx.fillStyle = '#39ff14';
    ctx.fillText('[ R ] RESTART     [ ESC ] EXIT', w / 2, h / 2 + 60);

    ctx.restore();
  } else if (state.phase === 'levelup') {
    const alpha = Math.min(1, state.levelUpTimer / 60);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.font = 'bold 48px "DM Mono", monospace';
    ctx.fillStyle = '#39ff14';
    ctx.fillText('LEVEL ' + (state.level + 1) + '!', w / 2, h / 2);
    ctx.restore();
  } else if (state.phase === 'dead' && state.lives > 0) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '20px "DM Mono", monospace';
    ctx.fillStyle = 'rgba(255,100,100,0.85)';
    ctx.fillText('— ' + state.lives + (state.lives === 1 ? ' SHIP LEFT —' : ' SHIPS LEFT —'), w / 2, h / 2 + 50);
    ctx.restore();
  }
}

// ─── startRenderer ───────────────────────────────────────────────────────────

export function startRenderer(initialState, canvas, navigate) {
  const ctx = canvas.getContext('2d');
  const w   = canvas.width;
  const h   = canvas.height;

  let state = { ...initialState, width: w, height: h };
  let rafId = null;
  let frame = 0;
  let highScore = parseInt(localStorage.getItem('asteroids_hs') || '0', 10);
  state.highScore = highScore;

  const audio = createAudio();

  let prevAsteroidCount = state.asteroids.length;
  let prevPhase         = state.phase;
  let prevUfoAlive      = false;

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

  function loop() {
    frame++;

    const prevScore  = state.score;
    const curPhase   = state.phase;
    const curAsteroidCount = state.asteroids.length;
    const curUfoAlive      = !!state.ufo;

    state = tick(state);

    // ── Sound triggers ─────────────────────────────────────────────────────
    if (state.asteroids.length < curAsteroidCount) {
      audio.beep(440, 0.05, 'square', 0.1);
    }

    if (!curUfoAlive && state.ufo) {
      // UFO just spawned
      audio.beep(180, 0.12, 'sawtooth', 0.08);
    }

    if (curUfoAlive && !state.ufo && state.score > prevScore) {
      // UFO destroyed
      audio.beep(300, 0.15, 'sawtooth', 0.14);
    }

    if (state.phase === 'dead' && curPhase === 'playing') {
      audio.beep(80, 0.3, 'sawtooth', 0.18);
    }

    if (state.phase === 'gameover' && curPhase !== 'gameover') {
      if (state.score > highScore) {
        highScore = state.score;
        state.highScore = highScore;
        localStorage.setItem('asteroids_hs', String(highScore));
      }
      audio.beep(60, 0.5, 'sawtooth', 0.2);
    }

    if (state.phase === 'levelup' && curPhase !== 'levelup') {
      audio.beep(660, 0.15, 'square', 0.12);
    }

    // ── Restart when game over and R pressed ───────────────────────────────
    if (state.phase === 'gameover' && (state.keys['r'] || state.keys['R'])) {
      const savedKeys = { ...state.keys };
      state = initGame(w, h);
      state.keys = savedKeys;
      state.highScore = highScore;
      prevAsteroidCount = state.asteroids.length;
      prevPhase = state.phase;
      prevUfoAlive = false;
      frame = 0;
    }

    prevAsteroidCount = state.asteroids.length;
    prevPhase         = state.phase;
    prevUfoAlive      = !!state.ufo;

    // ── Paint ──────────────────────────────────────────────────────────────
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
