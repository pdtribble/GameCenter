// In-memory rate limiter — no Redis required

// Structure: Map<ip, { count, resetAt }>
const joinAttempts = new Map();
const adminAttempts = new Map();

const JOIN_MAX = 10;
const JOIN_WINDOW_MS = 60 * 1000;

const ADMIN_MAX = 5;
const ADMIN_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_LOCKOUT_MS = 15 * 60 * 1000;

function getIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

function getSocketIp(socket) {
  return (
    socket.handshake.headers['x-forwarded-for']?.split(',')[0].trim() ||
    socket.handshake.address ||
    'unknown'
  );
}

// ── Join rate limit (HTTP middleware) ─────────────────────────────────────────
function joinLimiter(req, res, next) {
  const ip = getIp(req);
  const now = Date.now();
  const entry = joinAttempts.get(ip) || { count: 0, resetAt: now + JOIN_WINDOW_MS };

  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + JOIN_WINDOW_MS;
  }

  entry.count++;
  joinAttempts.set(ip, entry);

  if (entry.count > JOIN_MAX) {
    return res.status(429).json({
      error: 'Too many join attempts. Please wait a minute.',
    });
  }

  next();
}

// ── Join rate limit (Socket.io middleware) ────────────────────────────────────
function checkJoinRateSocket(socket) {
  const ip = getSocketIp(socket);
  const now = Date.now();
  const entry = joinAttempts.get(ip) || { count: 0, resetAt: now + JOIN_WINDOW_MS };

  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + JOIN_WINDOW_MS;
  }

  entry.count++;
  joinAttempts.set(ip, entry);

  return entry.count <= JOIN_MAX;
}

// ── Admin rate limit ──────────────────────────────────────────────────────────
function adminLimiter(req, res, next) {
  const ip = getIp(req);
  const now = Date.now();
  const entry = adminAttempts.get(ip) || { failures: 0, lockedUntil: 0 };

  if (entry.lockedUntil && now < entry.lockedUntil) {
    const remaining = Math.ceil((entry.lockedUntil - now) / 1000 / 60);
    return res.status(429).send(`Too many failed attempts. Try again in ${remaining} minutes.`);
  }

  // Attach a hook to track failures — the admin router checks PIN and sends 403 on failure
  req._adminRateMeta = { ip, entry };
  const originalSend = res.send.bind(res);
  res.send = function (body) {
    if (res.statusCode === 403) {
      entry.failures++;
      if (entry.failures >= ADMIN_MAX) {
        entry.lockedUntil = now + ADMIN_LOCKOUT_MS;
        console.warn(`[rate-limit] Admin lockout for IP ${ip}`);
      }
      adminAttempts.set(ip, entry);
    } else if (res.statusCode < 400) {
      // Successful auth — reset failures
      entry.failures = 0;
      entry.lockedUntil = 0;
      adminAttempts.set(ip, entry);
    }
    return originalSend(body);
  };

  next();
}

// Periodic cleanup to avoid memory growth
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of joinAttempts) {
    if (now > entry.resetAt) joinAttempts.delete(ip);
  }
  for (const [ip, entry] of adminAttempts) {
    if (!entry.lockedUntil || now > entry.lockedUntil + ADMIN_LOCKOUT_MS) {
      adminAttempts.delete(ip);
    }
  }
}, 5 * 60 * 1000);

module.exports = { joinLimiter, adminLimiter, checkJoinRateSocket };
