// ─── Constants ───────────────────────────────────────────────────────────────
const SHIP_RADIUS   = 14;
const BULLET_SPEED  = 9;
const BULLET_LIFE   = 55;
const FIRE_COOLDOWN = 10;
const TURN_SPEED    = 0.065;
const THRUST        = 0.16;
const FRICTION      = 0.982;
const UFO_SPAWN     = 900;
const UFO_SPEED     = 2.2;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rnd(min, max) {
  return min + Math.random() * (max - min);
}

function rndInt(min, max) {
  return Math.floor(rnd(min, max + 1));
}

function circleHit(ax, ay, ar, bx, by, br) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.hypot(dx, dy) < ar + br;
}

function wrap(val, min, max) {
  const range = max - min;
  while (val < min) val += range;
  while (val >= max) val -= range;
  return val;
}

// ─── Asteroid generation ──────────────────────────────────────────────────────

const SIZE_RADIUS = { large: 52, medium: 26, small: 13 };
const SIZE_SCORE  = { large: 20, medium: 50, small: 100 };

function randomVertices(sides) {
  const verts = [];
  for (let i = 0; i < sides; i++) {
    const baseAngle = (i / sides) * Math.PI * 2;
    const jitter = rnd(-0.35, 0.35) * (Math.PI * 2 / sides);
    verts.push({ a: baseAngle + jitter, r: rnd(0.6, 1.0) });
  }
  return verts;
}

function makeAsteroid(x, y, size, inheritVx, inheritVy) {
  inheritVx = inheritVx || 0;
  inheritVy = inheritVy || 0;

  const radius = SIZE_RADIUS[size];
  const speed  = rnd(0.5, 1.6) + (size === 'small' ? 0.4 : 0);
  const angle  = rnd(0, Math.PI * 2);

  return {
    x,
    y,
    vx: Math.cos(angle) * speed + inheritVx * 0.4,
    vy: Math.sin(angle) * speed + inheritVy * 0.4,
    radius,
    size,
    angle: rnd(0, Math.PI * 2),
    rotSpeed: rnd(-0.028, 0.028) || 0.01,
    vertices: randomVertices(rndInt(7, 12)),
  };
}

function spawnWave(width, height, level) {
  const count = 2 + level + (level / 3 | 0);
  const cx = width / 2;
  const cy = height / 2;
  const asteroids = [];

  for (let i = 0; i < count; i++) {
    let x, y;
    let attempts = 0;
    do {
      x = rnd(0, width);
      y = rnd(0, height);
      attempts++;
    } while (Math.hypot(x - cx, y - cy) < 140 && attempts < 50);

    asteroids.push(makeAsteroid(x, y, 'large'));
  }
  return asteroids;
}

// ─── Particles ───────────────────────────────────────────────────────────────

function addParticles(particles, x, y, count, colorsArray, speed) {
  for (let i = 0; i < count; i++) {
    const angle = rnd(0, Math.PI * 2);
    const spd   = rnd(speed * 0.3, speed);
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      life: rnd(0.6, 1.0),
      decay: rnd(0.018, 0.038),
      color: colorsArray[rndInt(0, colorsArray.length - 1)],
      size: rnd(1.5, 3.5),
    });
  }
}

function tickParticles(particles) {
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.x    += p.vx;
    p.y    += p.vy;
    p.vx   *= 0.97;
    p.vy   *= 0.97;
    p.life -= p.decay;
  }
  // filter in place
  let write = 0;
  for (let i = 0; i < particles.length; i++) {
    if (particles[i].life > 0) particles[write++] = particles[i];
  }
  particles.length = write;
}

// ─── UFO ─────────────────────────────────────────────────────────────────────

function makeUfo(width, height) {
  const fromLeft = Math.random() < 0.5;
  return {
    x: fromLeft ? -30 : width + 30,
    y: rnd(60, height - 60),
    vx: fromLeft ? UFO_SPEED : -UFO_SPEED,
    vy: 0,
    radius: 18,
    fireCooldown: 80,
  };
}

function ufoFireAt(ufo, ship, bullets) {
  const dx = ship.x - ufo.x;
  const dy = ship.y - ufo.y;
  const base = Math.atan2(dy, dx);
  const scatter = rnd(-0.4, 0.4);
  const ang = base + scatter;
  bullets.push({
    x: ufo.x,
    y: ufo.y,
    vx: Math.cos(ang) * BULLET_SPEED,
    vy: Math.sin(ang) * BULLET_SPEED,
    life: BULLET_LIFE,
    fromUfo: true,
  });
}

// ─── initGame ────────────────────────────────────────────────────────────────

function initGame(width, height) {
  width  = width  || 800;
  height = height || 560;

  const ship = {
    x: width / 2,
    y: height / 2,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    thrusting: false,
    radius: SHIP_RADIUS,
  };

  return {
    ship,
    bullets: [],
    asteroids: spawnWave(width, height, 1),
    particles: [],
    ufo: null,
    ufoTimer: UFO_SPAWN,
    fireCooldown: 0,
    invulnTimer: 120,
    deadTimer: 0,
    levelUpTimer: 0,
    screenShake: 0,
    score: 0,
    lives: 3,
    level: 1,
    phase: 'playing',
    keys: {},
    width,
    height,
  };
}

// ─── tick ────────────────────────────────────────────────────────────────────

function tick(state) {
  if (state.phase === 'gameover') return state;

  // Shallow-clone top-level mutable collections that we will rebuild
  const s = {
    ...state,
    bullets: state.bullets.slice(),
    asteroids: state.asteroids.slice(),
    particles: state.particles.slice(),
    ship: { ...state.ship },
  };

  const { width, height, keys } = s;

  // ── Phase: dead ──────────────────────────────────────────────────────────
  if (s.phase === 'dead') {
    s.deadTimer--;
    tickParticles(s.particles);
    s.screenShake *= 0.84;
    if (s.deadTimer <= 0) {
      // Respawn
      s.ship = {
        x: width / 2,
        y: height / 2,
        vx: 0,
        vy: 0,
        angle: -Math.PI / 2,
        thrusting: false,
        radius: SHIP_RADIUS,
      };
      s.invulnTimer = 150;
      s.phase = 'playing';
    }
    return s;
  }

  // ── Phase: levelup ───────────────────────────────────────────────────────
  if (s.phase === 'levelup') {
    s.levelUpTimer--;
    tickParticles(s.particles);
    s.screenShake *= 0.84;
    if (s.levelUpTimer <= 0) {
      s.level++;
      s.asteroids = spawnWave(width, height, s.level);
      s.ufo = null;
      s.ufoTimer = UFO_SPAWN;
      s.phase = 'playing';
    }
    return s;
  }

  // ── Pass 1: fire rate limiter ─────────────────────────────────────────────
  if (s.fireCooldown > 0) s.fireCooldown--;

  // ── Ship controls ─────────────────────────────────────────────────────────
  const left  = keys['ArrowLeft']  || keys['a'] || keys['A'];
  const right = keys['ArrowRight'] || keys['d'] || keys['D'];
  const up    = keys['ArrowUp']    || keys['w'] || keys['W'];
  const fire  = keys[' '];

  if (left)  s.ship.angle -= TURN_SPEED;
  if (right) s.ship.angle += TURN_SPEED;

  s.ship.thrusting = false;
  if (up) {
    s.ship.vx += Math.cos(s.ship.angle) * THRUST;
    s.ship.vy += Math.sin(s.ship.angle) * THRUST;
    s.ship.thrusting = true;
  }

  // ── Pass 4: thruster particles ────────────────────────────────────────────
  if (s.ship.thrusting) {
    const tailAngle = s.ship.angle + Math.PI;
    const tx = s.ship.x + Math.cos(tailAngle) * SHIP_RADIUS;
    const ty = s.ship.y + Math.sin(tailAngle) * SHIP_RADIUS;
    for (let i = 0; i < 2; i++) {
      const spreadAngle = tailAngle + rnd(-0.4, 0.4);
      const spd = rnd(1.5, 3.5);
      s.particles.push({
        x: tx + rnd(-2, 2),
        y: ty + rnd(-2, 2),
        vx: Math.cos(spreadAngle) * spd,
        vy: Math.sin(spreadAngle) * spd,
        life: rnd(0.4, 0.7),
        decay: rnd(0.04, 0.08),
        color: Math.random() < 0.5 ? '#ff6600' : '#ff3300',
        size: rnd(1.5, 3.0),
      });
    }
  }

  // Apply friction and move ship
  s.ship.vx *= FRICTION;
  s.ship.vy *= FRICTION;
  s.ship.x = wrap(s.ship.x + s.ship.vx, 0, width);
  s.ship.y = wrap(s.ship.y + s.ship.vy, 0, height);

  // ── Firing ────────────────────────────────────────────────────────────────
  if (fire && s.fireCooldown === 0) {
    s.bullets.push({
      x: s.ship.x + Math.cos(s.ship.angle) * SHIP_RADIUS,
      y: s.ship.y + Math.sin(s.ship.angle) * SHIP_RADIUS,
      vx: Math.cos(s.ship.angle) * BULLET_SPEED + s.ship.vx,
      vy: Math.sin(s.ship.angle) * BULLET_SPEED + s.ship.vy,
      life: BULLET_LIFE,
      fromUfo: false,
    });
    s.fireCooldown = FIRE_COOLDOWN;
  }

  // ── Move bullets ──────────────────────────────────────────────────────────
  const liveBullets = [];
  for (let i = 0; i < s.bullets.length; i++) {
    const b = s.bullets[i];
    b.x    = wrap(b.x + b.vx, 0, width);
    b.y    = wrap(b.y + b.vy, 0, height);
    b.life--;
    if (b.life > 0) liveBullets.push(b);
  }
  s.bullets = liveBullets;

  // ── Move asteroids ────────────────────────────────────────────────────────
  for (let i = 0; i < s.asteroids.length; i++) {
    const a = s.asteroids[i];
    a.x     = wrap(a.x + a.vx, 0, width);
    a.y     = wrap(a.y + a.vy, 0, height);
    a.angle += a.rotSpeed;
  }

  // ── Invulnerability timer ─────────────────────────────────────────────────
  if (s.invulnTimer > 0) s.invulnTimer--;

  // ── Pass 5: collision — bullets vs asteroids ──────────────────────────────
  const remainingAsteroids = [];
  const newAsteroids = [];

  for (let ai = 0; ai < s.asteroids.length; ai++) {
    const a = s.asteroids[ai];
    let hit = false;

    for (let bi = 0; bi < s.bullets.length; bi++) {
      const b = s.bullets[bi];
      if (b.fromUfo) continue; // UFO bullets don't destroy asteroids
      if (circleHit(a.x, a.y, a.radius, b.x, b.y, 3)) {
        hit = true;
        b.life = 0; // kill bullet

        s.score += SIZE_SCORE[a.size];

        // ── Pass 3: particle explosion ──────────────────────────────────────
        addParticles(s.particles, a.x, a.y,
          a.size === 'large' ? 14 : a.size === 'medium' ? 9 : 5,
          ['#aaaaaa', '#888888', '#cccccc', '#666666'],
          a.size === 'large' ? 3.5 : a.size === 'medium' ? 2.5 : 1.8);

        // Split
        if (a.size === 'large') {
          newAsteroids.push(makeAsteroid(a.x, a.y, 'medium', a.vx, a.vy));
          newAsteroids.push(makeAsteroid(a.x, a.y, 'medium', a.vx, a.vy));
        } else if (a.size === 'medium') {
          newAsteroids.push(makeAsteroid(a.x, a.y, 'small', a.vx, a.vy));
          newAsteroids.push(makeAsteroid(a.x, a.y, 'small', a.vx, a.vy));
        }
        // small → destroyed

        break;
      }
    }

    if (!hit) remainingAsteroids.push(a);
  }

  s.asteroids = remainingAsteroids.concat(newAsteroids);

  // Re-filter bullets (some were killed above)
  s.bullets = s.bullets.filter(b => b.life > 0);

  // ── Pass 5: collision — ship vs asteroids ─────────────────────────────────
  if (s.invulnTimer === 0 && s.phase === 'playing') {
    for (let ai = 0; ai < s.asteroids.length; ai++) {
      const a = s.asteroids[ai];
      if (circleHit(s.ship.x, s.ship.y, s.ship.radius, a.x, a.y, a.radius)) {
        // Ship dies
        s.lives--;
        s.screenShake = 18;
        addParticles(s.particles, s.ship.x, s.ship.y, 20,
          ['#ffffff', '#aaaaff', '#ffaa00', '#ff5500'], 4.5);

        if (s.lives <= 0) {
          s.phase = 'gameover';
        } else {
          s.phase = 'dead';
          s.deadTimer = 90;
        }
        break;
      }
    }
  }

  // ── UFO: spawn & move ─────────────────────────────────────────────────────
  if (s.phase === 'playing') {
    if (!s.ufo && s.asteroids.length > 0) {
      s.ufoTimer--;
      if (s.ufoTimer <= 0) {
        s.ufo = makeUfo(width, height);
        s.ufoTimer = UFO_SPAWN + rndInt(0, 300);
      }
    }

    if (s.ufo) {
      s.ufo = { ...s.ufo };
      s.ufo.x += s.ufo.vx;
      s.ufo.y += s.ufo.vy;

      // Gentle sine drift
      s.ufo.y += Math.sin(Date.now() * 0.002) * 0.6;

      // UFO fires at ship
      s.ufo.fireCooldown--;
      if (s.ufo.fireCooldown <= 0) {
        ufoFireAt(s.ufo, s.ship, s.bullets);
        s.ufo.fireCooldown = 60 + rndInt(0, 40);
      }

      // UFO exits off screen
      if (s.ufo.x < -60 || s.ufo.x > width + 60) {
        s.ufo = null;
        s.ufoTimer = UFO_SPAWN;
      }

      // Bullet vs UFO
      if (s.ufo) {
        for (let bi = 0; bi < s.bullets.length; bi++) {
          const b = s.bullets[bi];
          if (b.fromUfo) continue;
          if (circleHit(s.ufo.x, s.ufo.y, s.ufo.radius, b.x, b.y, 3)) {
            s.score += rndInt(100, 300);
            addParticles(s.particles, s.ufo.x, s.ufo.y, 16,
              ['#ffff00', '#ff8800', '#ff4400', '#ffffff'], 3.8);
            s.ufo = null;
            s.ufoTimer = UFO_SPAWN + rndInt(0, 400);
            b.life = 0;
            break;
          }
        }
        s.bullets = s.bullets.filter(b => b.life > 0);
      }

      // UFO bullet hits ship
      if (s.ufo && s.invulnTimer === 0 && s.phase === 'playing') {
        for (let bi = 0; bi < s.bullets.length; bi++) {
          const b = s.bullets[bi];
          if (!b.fromUfo) continue;
          if (circleHit(s.ship.x, s.ship.y, s.ship.radius, b.x, b.y, 4)) {
            s.lives--;
            s.screenShake = 18;
            addParticles(s.particles, s.ship.x, s.ship.y, 20,
              ['#ffffff', '#aaaaff', '#ffaa00', '#ff5500'], 4.5);
            b.life = 0;
            s.bullets = s.bullets.filter(blt => blt.life > 0);

            if (s.lives <= 0) {
              s.phase = 'gameover';
            } else {
              s.phase = 'dead';
              s.deadTimer = 90;
            }
            break;
          }
        }
      }
    }
  }

  // ── Pass 6: level progression ─────────────────────────────────────────────
  if (s.phase === 'playing' && s.asteroids.length === 0 && !s.ufo) {
    s.phase = 'levelup';
    s.levelUpTimer = 100;
    s.ufo = null;
  }

  // ── Particles tick ────────────────────────────────────────────────────────
  tickParticles(s.particles);

  // ── Screen shake decay ────────────────────────────────────────────────────
  s.screenShake *= 0.84;

  return s;
}

// ─── setKey ──────────────────────────────────────────────────────────────────

function setKey(state, key, down) {
  return { ...state, keys: { ...state.keys, [key]: down } };
}

// ─── Exports ──────────────────────────────────────────────────────────────────
export { initGame, tick, setKey };
