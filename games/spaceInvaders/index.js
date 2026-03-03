// games/spaceInvaders/index.js — Pure game logic. No DOM, no canvas.

const COLS = 11;
const ROWS = 5;
const ENEMY_W = 30;
const ENEMY_H = 20;
const ENEMY_PAD_X = 14;
const ENEMY_PAD_Y = 14;
const GRID_START_X = 80;
const GRID_START_Y = 80;
const PLAYER_SPEED = 240;  // pixels per second (was 4 per frame at 60fps)
const BULLET_SPEED = 540; // pixels per second (was 9 per frame at 60fps)
const UFO_INTERVAL = 700;

function rectHit(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function addParticles(particles, x, y, count, colors, speed) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const s = speed * (0.5 + Math.random() * 0.8);
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * s,
      vy: Math.sin(angle) * s,
      life: 1,
      decay: 0.03 + Math.random() * 0.04,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 2 + Math.random() * 3,
    });
  }
}

function tickParticles(particles) {
  const alive = [];
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.1;
    p.life -= p.decay;
    if (p.life > 0) alive.push(p);
  }
  return alive;
}

function createBarriers(width, height) {
  const barriers = [];
  const bw = 60;
  const bh = 40;
  const blockW = 5;
  const blockH = 5;
  const bCols = 12;
  const bRows = 8;
  const spacing = width / 5;

  for (let b = 0; b < 4; b++) {
    const centerX = spacing + b * spacing;
    const startY = height - 120;
    const startX = centerX - bw / 2;
    const blocks = [];

    for (let row = 0; row < bRows; row++) {
      for (let col = 0; col < bCols; col++) {
        // Remove bottom-center arch: rows 6-7, cols 4-7
        if (row >= 6 && col >= 4 && col <= 7) continue;
        // Remove bottom corner rounding: rows 6-7, cols 0-1 and 10-11
        if (row >= 6 && (col <= 1 || col >= 10)) continue;

        blocks.push({
          x: startX + col * blockW,
          y: startY + row * blockH,
          w: blockW,
          h: blockH,
          health: 3,
          alive: true,
        });
      }
    }

    barriers.push({ centerX, blocks });
  }

  return barriers;
}

function buildEnemies() {
  const enemies = [];
  for (let row = 0; row < ROWS; row++) {
    let type, points;
    if (row === 0) {
      type = 'helmet';
      points = 30;
    } else if (row <= 2) {
      type = 'crab';
      points = 20;
    } else {
      type = 'squid';
      points = 10;
    }
    for (let col = 0; col < COLS; col++) {
      enemies.push({ row, col, type, points, alive: true, frame: 0 });
    }
  }
  return enemies;
}

function initGame(width = 800, height = 560) {
  return {
    player: { x: width / 2, y: height - 50, w: 36, h: 18 },
    enemies: buildEnemies(),
    gridX: GRID_START_X,
    gridY: GRID_START_Y,
    gridDir: 1,
    gridStep: 16,
    enemyMoveInterval: 60,
    enemyMoveTimer: 60,
    playerBullet: null,
    enemyBullets: [],
    barriers: createBarriers(width, height),
    ufo: null,
    ufoTimer: UFO_INTERVAL,
    score: 0,
    lives: 3,
    wave: 1,
    phase: 'playing',
    deadTimer: 0,
    invulnTimer: 0,
    waveClearTimer: 0,
    fireCooldown: 0,
    enemyFireTimer: 60,
    particles: [],
    keys: {},
    width,
    height,
    flashTimer: 0,
    soundEvent: null,
  };
}

function getAliveEnemies(state) {
  return state.enemies.filter(e => e.alive);
}

function getEnemyPos(state, enemy) {
  return {
    x: state.gridX + enemy.col * (ENEMY_W + ENEMY_PAD_X),
    y: state.gridY + enemy.row * (ENEMY_H + ENEMY_PAD_Y),
  };
}

function tick(state, dt = 1/60) {
  // Deep-copy mutable parts
  state = {
    ...state,
    player: { ...state.player },
    enemies: state.enemies.map(e => ({ ...e })),
    enemyBullets: state.enemyBullets.map(b => ({ ...b })),
    playerBullet: state.playerBullet ? { ...state.playerBullet } : null,
    barriers: state.barriers.map(b => ({ ...b, blocks: b.blocks.map(bl => ({ ...bl })) })),
    ufo: state.ufo ? { ...state.ufo } : null,
    particles: state.particles.map(p => ({ ...p })),
    keys: { ...state.keys },
    soundEvent: null,
  };

  if (state.phase === 'gameover') return state;

  // ── Phase: dead countdown ────────────────────────────────────────────────
  if (state.phase === 'dead') {
    state.deadTimer--;
    if (state.deadTimer <= 0) {
      state.lives--;
      if (state.lives <= 0) {
        state.phase = 'gameover';
      } else {
        state.phase = 'playing';
        state.invulnTimer = 120;
        state.player.x = state.width / 2;
        state.playerBullet = null;
        state.enemyBullets = [];
      }
    }
    state.particles = tickParticles(state.particles);
    return state;
  }

  // ── Phase: waveclear countdown ───────────────────────────────────────────
  if (state.phase === 'waveclear') {
    state.waveClearTimer--;
    state.flashTimer = Math.max(0, state.flashTimer - 1);
    if (state.waveClearTimer <= 0) {
      state.wave++;
      state.enemies = buildEnemies();
      state.gridX = GRID_START_X;
      state.gridY = GRID_START_Y;
      state.gridDir = 1;
      state.enemyMoveInterval = 60;
      state.enemyMoveTimer = 60;
      state.playerBullet = null;
      state.enemyBullets = [];
      state.barriers = createBarriers(state.width, state.height);
      state.ufo = null;
      state.ufoTimer = UFO_INTERVAL;
      state.phase = 'playing';
      state.fireCooldown = 0;
    }
    state.particles = tickParticles(state.particles);
    return state;
  }

  // ── Invulnerability timer ────────────────────────────────────────────────
  if (state.invulnTimer > 0) state.invulnTimer--;

  // ── Fire cooldown ────────────────────────────────────────────────────────
  if (state.fireCooldown > 0) state.fireCooldown--;

  // ── Player movement ──────────────────────────────────────────────────────
  const halfW = state.player.w / 2;
  const playerSpeed = PLAYER_SPEED * dt;
  if ((state.keys['ArrowLeft'] || state.keys['a'] || state.keys['A']) && state.player.x - halfW > 0) {
    state.player.x -= playerSpeed;
  }
  if ((state.keys['ArrowRight'] || state.keys['d'] || state.keys['D']) && state.player.x + halfW < state.width) {
    state.player.x += playerSpeed;
  }

  // ── Player fire ──────────────────────────────────────────────────────────
  if ((state.keys[' '] || state.keys['Enter']) && state.fireCooldown === 0 && !state.playerBullet) {
    state.playerBullet = {
      x: state.player.x,
      y: state.player.y - state.player.h / 2,
      w: 3,
      h: 12,
    };
    state.fireCooldown = 18;
    state.soundEvent = 'shoot';
  }

  // ── Player bullet movement ───────────────────────────────────────────────
  if (state.playerBullet) {
    state.playerBullet.y -= BULLET_SPEED * dt;
    if (state.playerBullet.y + state.playerBullet.h < 0) {
      state.playerBullet = null;
    }
  }

  // ── PASS 1: Enemy fire cooldown ──────────────────────────────────────────
  state.enemyFireTimer--;
  if (state.enemyFireTimer <= 0) {
    // Find alive enemies, pick bottom-most in random column
    const aliveCols = [];
    for (let col = 0; col < COLS; col++) {
      let bottomEnemy = null;
      for (let row = ROWS - 1; row >= 0; row--) {
        const idx = row * COLS + col;
        if (state.enemies[idx] && state.enemies[idx].alive) {
          bottomEnemy = state.enemies[idx];
          break;
        }
      }
      if (bottomEnemy) aliveCols.push(bottomEnemy);
    }
    if (aliveCols.length > 0) {
      const shooter = aliveCols[Math.floor(Math.random() * aliveCols.length)];
      const pos = getEnemyPos(state, shooter);
      state.enemyBullets.push({
        x: pos.x + ENEMY_W / 2,
        y: pos.y + ENEMY_H,
        w: 3,
        h: 10,
        speed: (3 + state.wave * 0.4) * 60, // per second
      });
    }
    state.enemyFireTimer = Math.max(20, 80 - state.wave * 5);
  }

  // ── Enemy bullets movement ───────────────────────────────────────────────
  const survivingEnemyBullets = [];
  for (const b of state.enemyBullets) {
    b.y += b.speed * dt;
    if (b.y < state.height + 20) survivingEnemyBullets.push(b);
  }
  state.enemyBullets = survivingEnemyBullets;

  // ── PASS 2: Enemy animation ──────────────────────────────────────────────
  // (frame toggle happens on each grid step — handled below in grid movement)

  // ── PASS 4: Enemy speed based on alive count ─────────────────────────────
  const aliveCount = getAliveEnemies(state).length;
  state.enemyMoveInterval = Math.max(4, 60 - (55 - aliveCount) * 1.1);

  // ── Enemy grid movement ──────────────────────────────────────────────────
  state.enemyMoveTimer -= dt;
  let didStep = false;
  if (state.enemyMoveTimer <= 0) {
    state.gridX += state.gridDir * state.gridStep * dt * 60; // scale for 60fps baseline
    didStep = true;

    // Toggle frame on each step (PASS 2)
    for (const e of state.enemies) {
      e.frame = e.frame === 0 ? 1 : 0;
    }

    state.enemyMoveTimer = state.enemyMoveInterval;

    // Check edges
    let hitRight = false;
    let hitLeft = false;
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const ex = state.gridX + e.col * (ENEMY_W + ENEMY_PAD_X);
      if (state.gridDir === 1 && ex + ENEMY_W > state.width - 30) hitRight = true;
      if (state.gridDir === -1 && ex < 30) hitLeft = true;
    }

    if (hitRight || hitLeft) {
      state.gridDir *= -1;
      state.gridY += 18 * dt * 60;
    }

    // Check if enemies reached player
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const ey = state.gridY + e.row * (ENEMY_H + ENEMY_PAD_Y);
      if (ey + ENEMY_H >= state.player.y - 20) {
        state.phase = 'gameover';
        return state;
      }
    }
  }

  // ── PASS 5: UFO mystery saucer ───────────────────────────────────────────
  if (!state.ufo) {
    state.ufoTimer--;
    if (state.ufoTimer <= 0) {
      state.ufo = { x: -30, y: 30, w: 40, h: 16, speed: 120 }; // per second
      state.ufoTimer = UFO_INTERVAL;
    }
  } else {
    state.ufo.x += state.ufo.speed * dt;
    if (state.ufo.x > state.width + 50) {
      state.ufo = null;
    }
  }

  // ── PASS 3: Collision detection ───────────────────────────────────────────
  // Player bullet vs enemies
  if (state.playerBullet) {
    const pb = state.playerBullet;
    let hit = false;
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const ex = state.gridX + e.col * (ENEMY_W + ENEMY_PAD_X);
      const ey = state.gridY + e.row * (ENEMY_H + ENEMY_PAD_Y);
      if (rectHit(pb.x - pb.w / 2, pb.y, pb.w, pb.h, ex, ey, ENEMY_W, ENEMY_H)) {
        e.alive = false;
        state.score += e.points;
        addParticles(state.particles, ex + ENEMY_W / 2, ey + ENEMY_H / 2, 12,
          e.type === 'helmet' ? ['#ff4560', '#ff8099', '#fff'] :
          e.type === 'crab'   ? ['#4090ff', '#80b8ff', '#fff'] :
                                ['#39ff14', '#a0ff80', '#fff'],
          3);
        state.playerBullet = null;
        state.soundEvent = 'enemyHit';
        hit = true;
        break;
      }
    }

    // Player bullet vs UFO
    if (!hit && state.playerBullet && state.ufo) {
      const pb2 = state.playerBullet;
      if (rectHit(pb2.x - pb2.w / 2, pb2.y, pb2.w, pb2.h, state.ufo.x, state.ufo.y, state.ufo.w, state.ufo.h)) {
        const ufoPts = [50, 100, 150, 300][Math.floor(Math.random() * 4)];
        state.score += ufoPts;
        addParticles(state.particles, state.ufo.x + state.ufo.w / 2, state.ufo.y + state.ufo.h / 2, 16,
          ['#ff4560', '#ff8800', '#fff'], 4);
        state.ufo = null;
        state.playerBullet = null;
        state.soundEvent = 'ufoHit';
        hit = true;
      }
    }

    // Player bullet vs barriers
    if (!hit && state.playerBullet) {
      const pb3 = state.playerBullet;
      outer: for (const barrier of state.barriers) {
        for (const block of barrier.blocks) {
          if (!block.alive) continue;
          if (rectHit(pb3.x - pb3.w / 2, pb3.y, pb3.w, pb3.h, block.x, block.y, block.w, block.h)) {
            block.health--;
            if (block.health <= 0) block.alive = false;
            state.playerBullet = null;
            hit = true;
            break outer;
          }
        }
      }
    }
  }

  // Enemy bullets vs player
  if (state.invulnTimer === 0 && state.phase === 'playing') {
    const px = state.player.x - state.player.w / 2;
    const py = state.player.y - state.player.h / 2;
    const newEnemyBullets = [];
    let playerHit = false;
    for (const b of state.enemyBullets) {
      if (!playerHit && rectHit(b.x - b.w / 2, b.y, b.w, b.h, px, py, state.player.w, state.player.h)) {
        playerHit = true;
        addParticles(state.particles, state.player.x, state.player.y, 20,
          ['#39ff14', '#80ff40', '#fff', '#ffff00'], 4);
        state.soundEvent = 'playerHit';
      } else {
        newEnemyBullets.push(b);
      }
    }
    if (playerHit) {
      state.enemyBullets = newEnemyBullets;
      state.phase = 'dead';
      state.deadTimer = 90;
      state.playerBullet = null;
    }
  }

  // Enemy bullets vs barriers
  const newEnemyBulletsAfterBarrier = [];
  for (const b of state.enemyBullets) {
    let hitBarrier = false;
    outer2: for (const barrier of state.barriers) {
      for (const block of barrier.blocks) {
        if (!block.alive) continue;
        if (rectHit(b.x - b.w / 2, b.y, b.w, b.h, block.x, block.y, block.w, block.h)) {
          block.health--;
          if (block.health <= 0) block.alive = false;
          hitBarrier = true;
          break outer2;
        }
      }
    }
    if (!hitBarrier) newEnemyBulletsAfterBarrier.push(b);
  }
  state.enemyBullets = newEnemyBulletsAfterBarrier;

  // ── PASS 6: Particles ────────────────────────────────────────────────────
  state.particles = tickParticles(state.particles);

  // ── PASS 7: Wave progression ─────────────────────────────────────────────
  const stillAlive = getAliveEnemies(state).length;
  if (stillAlive === 0 && state.phase === 'playing') {
    state.phase = 'waveclear';
    state.waveClearTimer = 90;
    state.flashTimer = 30;
    state.soundEvent = 'waveClear';
  }

  // ── Flash timer ──────────────────────────────────────────────────────────
  if (state.flashTimer > 0) state.flashTimer--;

  return state;
}

function setKey(state, key, down) {
  return { ...state, keys: { ...state.keys, [key]: down } };
}

export { initGame, tick, setKey, COLS, ROWS, ENEMY_W, ENEMY_H, ENEMY_PAD_X, ENEMY_PAD_Y };
