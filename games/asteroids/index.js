// Classic Asteroids - Vector-style arcade game

const SHIP_RADIUS = 14;
const BULLET_SPEED = 400;   // pixels per second (slightly slower)
const BULLET_LIFE = 1.0;    // seconds
const FIRE_COOLDOWN = 0.28; // seconds between shots (~280ms classic style)
const TURN_SPEED = 3.0;     // radians per second (slower rotation)
const THRUST = 180;         // pixels per second squared (gentler accel)
const MAX_VELOCITY = 250;   // max ship speed (pixels/sec)
const FRICTION = 0.3;       // slight space friction for playability

const SIZE_RADIUS = { large: 52, medium: 26, small: 13 };
const SIZE_SCORE = { small: 20, medium: 50, large: 100 };

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

function randomVertices(sides) {
  const verts = [];
  for (let i = 0; i < sides; i++) {
    const baseAngle = (i / sides) * Math.PI * 2;
    const jitter = rnd(-0.35, 0.35) * (Math.PI * 2 / sides);
    verts.push({ a: baseAngle + jitter, r: rnd(0.6, 1.0) });
  }
  return verts;
}

function makeAsteroid(x, y, size, level) {
  const radius = SIZE_RADIUS[size];
  // Classic-style speeds: large=slow, medium=medium, small=fast
  const sizeSpeed = size === 'large' ? 30 : size === 'medium' ? 45 : 60;
  const speed = rnd(sizeSpeed * 0.7, sizeSpeed * 1.3);
  const angle = rnd(0, Math.PI * 2);

  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius,
    size,
    angle: rnd(0, Math.PI * 2),
    rotSpeed: rnd(-1.5, 1.5),
    vertices: randomVertices(rndInt(7, 12)),
  };
}

function spawnWave(width, height, level) {
  const count = 3 + level;
  const asteroids = [];
  const safeZone = 150;

  for (let i = 0; i < count; i++) {
    let x, y;
    let attempts = 0;
    const centerX = width / 2;
    const centerY = height / 2;
    
    do {
      x = rnd(0, width);
      y = rnd(0, height);
      attempts++;
    } while (Math.hypot(x - centerX, y - centerY) < safeZone && attempts < 50);

    asteroids.push(makeAsteroid(x, y, 'large', level));
  }
  return asteroids;
}

function initGame(width, height) {
  width = width || 800;
  height = height || 520;

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
    fireCooldown: 0,
    invulnTimer: 3,
    deadTimer: 0,
    score: 0,
    lives: 3,
    level: 1,
    phase: 'playing',
    keys: {},
    width,
    height,
  };
}

function tick(state, dt = 1/60) {
  if (state.phase === 'gameover') return state;

  const s = {
    ...state,
    bullets: state.bullets.slice(),
    asteroids: state.asteroids.slice(),
    ship: { ...state.ship },
  };

  const { width, height, keys } = s;

  if (s.phase === 'dead') {
    s.deadTimer -= dt;
    if (s.deadTimer <= 0) {
      s.ship = {
        x: width / 2,
        y: height / 2,
        vx: 0,
        vy: 0,
        angle: -Math.PI / 2,
        thrusting: false,
        radius: SHIP_RADIUS,
      };
      s.invulnTimer = 3;
      s.phase = 'playing';
    }
    return s;
  }

  if (s.phase === 'levelup') {
    s.level++;
    s.asteroids = spawnWave(width, height, s.level);
    s.phase = 'playing';
    return s;
  }

  if (s.fireCooldown > 0) s.fireCooldown -= dt;

  const left = keys['ArrowLeft'] || keys['a'] || keys['A'];
  const right = keys['ArrowRight'] || keys['d'] || keys['D'];
  const up = keys['ArrowUp'] || keys['w'] || keys['W'];
  const fire = keys[' '];

  if (left) s.ship.angle -= TURN_SPEED * dt;
  if (right) s.ship.angle += TURN_SPEED * dt;

  s.ship.thrusting = false;
  if (up) {
    s.ship.vx += Math.cos(s.ship.angle) * THRUST * dt;
    s.ship.vy += Math.sin(s.ship.angle) * THRUST * dt;
    s.ship.thrusting = true;
  }

  // Apply slight friction/damping for playability
  if (!up) {
    s.ship.vx *= (1 - FRICTION * dt);
    s.ship.vy *= (1 - FRICTION * dt);
  }

  // Cap max velocity
  const speed = Math.hypot(s.ship.vx, s.ship.vy);
  if (speed > MAX_VELOCITY) {
    const scale = MAX_VELOCITY / speed;
    s.ship.vx *= scale;
    s.ship.vy *= scale;
  }

  s.ship.x = wrap(s.ship.x + s.ship.vx * dt, 0, width);
  s.ship.y = wrap(s.ship.y + s.ship.vy * dt, 0, height);

  if (fire && s.fireCooldown <= 0) {
    s.bullets.push({
      x: s.ship.x + Math.cos(s.ship.angle) * SHIP_RADIUS,
      y: s.ship.y + Math.sin(s.ship.angle) * SHIP_RADIUS,
      vx: Math.cos(s.ship.angle) * BULLET_SPEED + s.ship.vx * 0.5,
      vy: Math.sin(s.ship.angle) * BULLET_SPEED + s.ship.vy * 0.5,
      life: BULLET_LIFE,
    });
    s.fireCooldown = FIRE_COOLDOWN;
  }

  const liveBullets = [];
  for (let i = 0; i < s.bullets.length; i++) {
    const b = s.bullets[i];
    b.x = wrap(b.x + b.vx * dt, 0, width);
    b.y = wrap(b.y + b.vy * dt, 0, height);
    b.life -= dt;
    if (b.life > 0) liveBullets.push(b);
  }
  s.bullets = liveBullets;

  for (let i = 0; i < s.asteroids.length; i++) {
    const a = s.asteroids[i];
    a.x = wrap(a.x + a.vx * dt, 0, width);
    a.y = wrap(a.y + a.vy * dt, 0, height);
    a.angle += a.rotSpeed * dt;
  }

  if (s.invulnTimer > 0) s.invulnTimer -= dt;

  const remainingAsteroids = [];
  const newAsteroids = [];

  for (let ai = 0; ai < s.asteroids.length; ai++) {
    const a = s.asteroids[ai];
    let hit = false;

    for (let bi = 0; bi < s.bullets.length; bi++) {
      const b = s.bullets[bi];
      if (circleHit(a.x, a.y, a.radius, b.x, b.y, 3)) {
        hit = true;
        b.life = 0;

        s.score += SIZE_SCORE[a.size];

        if (a.size === 'large') {
          newAsteroids.push(makeAsteroid(a.x, a.y, 'medium', s.level));
          newAsteroids.push(makeAsteroid(a.x, a.y, 'medium', s.level));
        } else if (a.size === 'medium') {
          newAsteroids.push(makeAsteroid(a.x, a.y, 'small', s.level));
          newAsteroids.push(makeAsteroid(a.x, a.y, 'small', s.level));
        }

        break;
      }
    }

    if (!hit) remainingAsteroids.push(a);
  }

  s.asteroids = remainingAsteroids.concat(newAsteroids);
  s.bullets = s.bullets.filter(b => b.life > 0);

  if (s.invulnTimer <= 0 && s.phase === 'playing') {
    for (let ai = 0; ai < s.asteroids.length; ai++) {
      const a = s.asteroids[ai];
      if (circleHit(s.ship.x, s.ship.y, s.ship.radius, a.x, a.y, a.radius)) {
        s.lives--;
        if (s.lives <= 0) {
          s.phase = 'gameover';
        } else {
          s.phase = 'dead';
          s.deadTimer = 2;
          s.ship.vx = 0;
          s.ship.vy = 0;
        }
        break;
      }
    }
  }

  if (s.phase === 'playing' && s.asteroids.length === 0) {
    s.phase = 'levelup';
  }

  return s;
}

function setKey(state, key, down) {
  return { ...state, keys: { ...state.keys, [key]: down } };
}

export { initGame, tick, setKey };
