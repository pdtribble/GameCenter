// client/renderers/spaceInvadersRenderer.js
// ONLY export: startRenderer

import { tick, setKey, initGame, COLS, ROWS, ENEMY_W, ENEMY_H, ENEMY_PAD_X, ENEMY_PAD_Y } from '../../games/spaceInvaders/index.js';

// ── Audio ─────────────────────────────────────────────────────────────────────

function createAudio() {
  let ctx = null;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (_) { /* no audio */ }

  function tone(freq, type, duration, gainVal = 0.18, pitchEnd = null) {
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (pitchEnd !== null) {
        osc.frequency.linearRampToValueAtTime(pitchEnd, ctx.currentTime + duration);
      }
      gain.gain.setValueAtTime(gainVal, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch (_) { /* ignore */ }
  }

  return {
    play(event) {
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      switch (event) {
        case 'shoot':      tone(200, 'square', 0.08); break;
        case 'enemyHit':   tone(180, 'sawtooth', 0.1, 0.18, 60); break;
        case 'playerHit':  tone(60,  'sawtooth', 0.4, 0.25); break;
        case 'ufoHit':     tone(440, 'sine',     0.15, 0.22); break;
        case 'waveClear':  tone(220, 'sine',     0.5, 0.20, 880); break;
      }
    },
    march() {
      tone(80, 'square', 0.05, 0.12);
    },
  };
}

// ── Drawing helpers ────────────────────────────────────────────────────────────

function drawPlayer(ctx, state) {
  if (state.phase === 'dead') return;
  const { x, y, w, h } = state.player;

  // Invuln flicker
  if (state.invulnTimer > 0 && Math.floor(state.invulnTimer / 6) % 2 === 0) return;

  ctx.save();
  // Base
  ctx.fillStyle = '#39ff14';
  ctx.fillRect(x - w / 2, y - h / 2 + 6, w, h - 6);
  // Barrel
  ctx.fillRect(x - 3, y - h / 2 - 6, 6, 12);
  ctx.restore();
}

function drawEnemy(ctx, e, ex, ey) {
  const f = e.frame;
  ctx.save();
  ctx.translate(ex, ey);

  if (e.type === 'helmet') {
    ctx.fillStyle = '#ff4560';
    // Dome body
    ctx.fillRect(4, 4, 22, 12);
    // Dome top
    ctx.fillRect(8, 0, 14, 6);
    // Eyes
    ctx.fillStyle = '#000';
    ctx.fillRect(7, 6, 4, 4);
    ctx.fillRect(19, 6, 4, 4);
    // Antennae
    if (f === 0) {
      ctx.fillStyle = '#ff4560';
      ctx.fillRect(6, -4, 2, 5);
      ctx.fillRect(22, -4, 2, 5);
    } else {
      ctx.fillStyle = '#ff4560';
      ctx.fillRect(4, -3, 2, 4);
      ctx.fillRect(24, -3, 2, 4);
    }
    // Legs
    ctx.fillStyle = '#ff4560';
    ctx.fillRect(2, 16, 4, 3);
    ctx.fillRect(24, 16, 4, 3);

  } else if (e.type === 'crab') {
    ctx.fillStyle = '#4090ff';
    // Body
    ctx.fillRect(4, 4, 22, 12);
    // Eyes
    ctx.fillStyle = '#000';
    ctx.fillRect(7, 6, 4, 4);
    ctx.fillRect(19, 6, 4, 4);
    // Claws
    ctx.fillStyle = '#4090ff';
    if (f === 0) {
      // Extended
      ctx.fillRect(0, 2, 4, 8);
      ctx.fillRect(0, 0, 6, 4);
      ctx.fillRect(26, 2, 4, 8);
      ctx.fillRect(24, 0, 6, 4);
    } else {
      // Retracted
      ctx.fillRect(1, 4, 3, 6);
      ctx.fillRect(0, 3, 4, 4);
      ctx.fillRect(26, 4, 3, 6);
      ctx.fillRect(26, 3, 4, 4);
    }
    // Bottom legs
    ctx.fillRect(4, 16, 3, 4);
    ctx.fillRect(10, 17, 3, 3);
    ctx.fillRect(17, 17, 3, 3);
    ctx.fillRect(23, 16, 3, 4);

  } else {
    // squid
    ctx.fillStyle = '#39ff14';
    // Body
    ctx.fillRect(6, 2, 18, 12);
    // Top spikes
    ctx.fillRect(4, 0, 4, 4);
    ctx.fillRect(12, 0, 6, 3);
    ctx.fillRect(22, 0, 4, 4);
    // Eyes
    ctx.fillStyle = '#000';
    ctx.fillRect(8, 5, 4, 4);
    ctx.fillRect(18, 5, 4, 4);
    // Tentacles
    ctx.fillStyle = '#39ff14';
    if (f === 0) {
      ctx.fillRect(2, 14, 3, 5);
      ctx.fillRect(8, 15, 3, 4);
      ctx.fillRect(19, 15, 3, 4);
      ctx.fillRect(25, 14, 3, 5);
    } else {
      ctx.fillRect(4, 14, 3, 4);
      ctx.fillRect(10, 15, 3, 5);
      ctx.fillRect(17, 15, 3, 5);
      ctx.fillRect(23, 14, 3, 4);
    }
  }

  ctx.restore();
}

function drawEnemyGrid(ctx, state) {
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const ex = state.gridX + e.col * (ENEMY_W + ENEMY_PAD_X);
    const ey = state.gridY + e.row * (ENEMY_H + ENEMY_PAD_Y);
    drawEnemy(ctx, e, ex, ey);
  }
}

function drawBullets(ctx, state) {
  // Player bullet
  if (state.playerBullet) {
    const pb = state.playerBullet;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(pb.x - pb.w / 2, pb.y, pb.w, pb.h);
  }

  // Enemy bullets
  for (const b of state.enemyBullets) {
    ctx.fillStyle = '#ff6060';
    // Zigzag bullet shape
    ctx.fillRect(b.x - 1, b.y, 3, 4);
    ctx.fillRect(b.x - 2, b.y + 3, 2, 3);
    ctx.fillRect(b.x + 1, b.y + 5, 2, 3);
  }
}

function drawBarriers(ctx, state) {
  for (const barrier of state.barriers) {
    for (const block of barrier.blocks) {
      if (!block.alive) continue;
      if (block.health === 3) ctx.fillStyle = '#39ff14';
      else if (block.health === 2) ctx.fillStyle = '#24aa0e';
      else ctx.fillStyle = '#155c09';
      ctx.fillRect(block.x, block.y, block.w, block.h);
    }
  }
}

function drawUfo(ctx, state) {
  if (!state.ufo) return;
  const { x, y, w, h } = state.ufo;
  ctx.save();
  // Body ellipse approximation using rects
  ctx.fillStyle = '#ff4560';
  ctx.fillRect(x + 8, y, w - 16, h);
  ctx.fillRect(x + 4, y + 3, w - 8, h - 2);
  ctx.fillRect(x, y + 6, w, h - 6);
  // Dome
  ctx.fillStyle = '#ff8899';
  ctx.fillRect(x + 12, y - 4, w - 24, 6);
  // Lights
  ctx.fillStyle = '#ffff80';
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(x + 6 + i * 10, y + 8, 4, 4);
  }
  ctx.restore();
}

function drawParticles(ctx, state) {
  for (const p of state.particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    ctx.restore();
  }
}

function drawHUD(ctx, state, w, highScore) {
  ctx.save();
  ctx.font = 'bold 14px "DM Mono", monospace';
  ctx.fillStyle = '#ffffff';

  // Score top-left
  ctx.textAlign = 'left';
  ctx.fillText('SCORE', 14, 20);
  ctx.fillStyle = '#39ff14';
  ctx.fillText(String(state.score).padStart(6, '0'), 14, 38);

  // High score below
  ctx.fillStyle = '#aaaaaa';
  ctx.font = '11px "DM Mono", monospace';
  ctx.fillText('HI', 14, 56);
  ctx.fillStyle = '#ffff60';
  ctx.fillText(String(highScore).padStart(6, '0'), 14, 70);

  // Wave top-center
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px "DM Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('WAVE ' + state.wave, w / 2, 22);

  // Lives top-right — cannon icons
  ctx.textAlign = 'right';
  ctx.fillStyle = '#aaaaaa';
  ctx.font = '11px "DM Mono", monospace';
  ctx.fillText('LIVES', w - 14, 20);
  ctx.fillStyle = '#39ff14';
  for (let i = 0; i < state.lives; i++) {
    const lx = w - 18 - i * 22;
    const ly = 28;
    // Mini cannon
    ctx.fillRect(lx - 7, ly + 4, 14, 6);
    ctx.fillRect(lx - 2, ly, 4, 6);
  }

  ctx.restore();
}

function drawOverlay(ctx, state, w, h) {
  // Wave clear flash
  if (state.phase === 'waveclear' && state.flashTimer > 0) {
    ctx.save();
    ctx.fillStyle = `rgba(100,255,100,${(state.flashTimer / 30) * 0.15})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  if (state.phase === 'waveclear') {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, h / 2 - 44, w, 88);
    ctx.fillStyle = '#39ff14';
    ctx.font = 'bold 32px "DM Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('WAVE CLEAR!', w / 2, h / 2 - 12);
    ctx.fillStyle = '#aaffaa';
    ctx.font = '16px "DM Mono", monospace';
    ctx.fillText('WAVE ' + (state.wave + 1) + ' INCOMING...', w / 2, h / 2 + 18);
    ctx.restore();
    return;
  }

  if (state.phase === 'gameover') {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#ff4560';
    ctx.font = 'bold 42px "DM Mono", monospace';
    ctx.fillText('GAME OVER', w / 2, h / 2 - 50);

    ctx.fillStyle = '#ffffff';
    ctx.font = '18px "DM Mono", monospace';
    ctx.fillText('SCORE: ' + state.score, w / 2, h / 2);

    ctx.fillStyle = '#ffff60';
    ctx.fillText('HI-SCORE: ' + (state.highScore || 0), w / 2, h / 2 + 28);

    ctx.fillStyle = '#4090ff';
    ctx.font = '14px "DM Mono", monospace';
    ctx.fillText('PRESS R TO RESTART', w / 2, h / 2 + 70);

    ctx.restore();
    return;
  }

  if (state.phase === 'dead' && state.phase !== 'gameover') {
    ctx.save();
    ctx.fillStyle = 'rgba(255,60,60,0.12)';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

function paintCanvas(ctx, state, w, h, highScore) {
  // Clear
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);

  // Ground line
  ctx.strokeStyle = '#39ff14';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h - 20);
  ctx.lineTo(w, h - 20);
  ctx.stroke();

  drawHUD(ctx, state, w, highScore);
  drawBarriers(ctx, state);
  drawPlayer(ctx, state);
  drawEnemyGrid(ctx, state);
  drawBullets(ctx, state);
  drawUfo(ctx, state);
  drawParticles(ctx, state);
  drawOverlay(ctx, state, w, h);
}

// ── startRenderer (ONLY export) ───────────────────────────────────────────────

export function startRenderer(initialState, canvas, navigate) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  let state = { ...initialState };
  let rafId = null;
  let highScore = parseInt(localStorage.getItem('si_hs') || '0', 10);
  state.highScore = highScore;
  let lastTime = 0;

  const audio = createAudio();
  let marchBeat = 0;
  let marchInterval = 30;

  function handleKeyDown(e) {
    if (['ArrowLeft', 'ArrowRight', ' ', 'Enter', 'a', 'd', 'A', 'D'].includes(e.key)) {
      e.preventDefault();
    }
    state = setKey(state, e.key, true);
    if ((e.key === 'r' || e.key === 'R') && state.phase === 'gameover') {
      state = { ...initGame(w, h), highScore };
    }
  }

  function handleKeyUp(e) {
    state = setKey(state, e.key, false);
  }

  function loop(timestamp) {
    const dt = lastTime ? Math.min((timestamp - lastTime) / 1000, 0.1) : 1/60;
    lastTime = timestamp;
    
    const prevPhase = state.phase;
    state = tick(state, dt);

    // Live high score tracking - save immediately when surpassed
    if (state.score > highScore) {
      highScore = state.score;
      state.highScore = highScore;
      localStorage.setItem('si_hs', String(highScore));
    }

    if (state.soundEvent) {
      audio.play(state.soundEvent);
    }

    // Enemy march sound tied to alive count
    marchBeat++;
    const aliveCount = state.enemies.filter(e => e.alive).length;
    marchInterval = Math.max(8, 30 - Math.floor((55 - aliveCount) * 0.4));
    if (marchBeat % marchInterval === 0) {
      audio.march();
    }

    // High score update on gameover
    if (state.phase === 'gameover' && prevPhase !== 'gameover') {
      state.highScore = highScore;
    }

    paintCanvas(ctx, state, w, h, highScore);
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
