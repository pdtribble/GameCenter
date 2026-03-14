const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const config = require('../config/default');

const DISPLAY_NAME_MAX = 32;

// ── Helpers ───────────────────────────────────────────────────────────────────
function hashPin(pin) {
  return crypto.createHash('sha256').update(String(pin)).digest('hex');
}

function sanitizeName(name) {
  if (typeof name !== 'string') return 'Player';
  return name.replace(/<[^>]*>/g, '').trim().slice(0, DISPLAY_NAME_MAX) || 'Player';
}

function generateGuestUsername() {
  return `guest_${crypto.randomBytes(4).toString('hex')}`;
}

// ── Attach session to socket ──────────────────────────────────────────────────
// Called as Socket.io middleware — reads the session cookie or creates a guest.
function attachSession(socket, next) {
  const cookieHeader = socket.request.headers.cookie || '';
  const cookies = parseCookies(cookieHeader);
  const sessionId = cookies['gc_session'];

  if (sessionId) {
    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(sessionId);
    if (player) {
      socket.playerId = player.id;
      socket.playerData = player;
      return next();
    }
  }

  // Create a guest player
  const guestId = uuidv4();
  const guestUsername = generateGuestUsername();
  db.prepare(`
    INSERT INTO players (id, username, display_name, is_guest)
    VALUES (?, ?, ?, 1)
  `).run(guestId, guestUsername, 'Guest');

  socket.playerId = guestId;
  socket.playerData = db.prepare('SELECT * FROM players WHERE id = ?').get(guestId);

  // Set cookie on upgrade (best-effort)
  socket.handshake.auth = socket.handshake.auth || {};
  socket.guestSession = true;
  next();
}

// ── Named account login / register via socket ─────────────────────────────────
function loginOrRegister(socket, { username, pin, displayName }) {
  if (!username) return { error: 'Username is required' };

  const clean = username.trim().toLowerCase().slice(0, 32);
  const existing = db.prepare('SELECT * FROM players WHERE username = ?').get(clean);

  if (existing) {
    if (existing.pin_hash) {
      if (!pin) return { error: 'PIN required for this account' };
      if (hashPin(pin) !== existing.pin_hash) return { error: 'Incorrect PIN' };
    }
    socket.playerId = existing.id;
    socket.playerData = existing;
    db.prepare("UPDATE players SET last_seen = datetime('now') WHERE id = ?").run(existing.id);
    return { player: safePlayer(existing) };
  }

  // Register new player
  const newId = uuidv4();
  const pinHash = pin ? hashPin(pin) : null;
  const name = displayName ? sanitizeName(displayName) : clean;
  db.prepare(`
    INSERT INTO players (id, username, display_name, pin_hash)
    VALUES (?, ?, ?, ?)
  `).run(newId, clean, name, pinHash);

  const newPlayer = db.prepare('SELECT * FROM players WHERE id = ?').get(newId);
  socket.playerId = newId;
  socket.playerData = newPlayer;
  return { player: safePlayer(newPlayer) };
}

// ── Player profile update ─────────────────────────────────────────────────────
function handlePlayerUpdate(socket, io, data) {
  if (!socket.playerId) {
    return socket.emit('server:error', { code: 'NOT_LOGGED_IN', message: 'Not authenticated.' });
  }

  const { displayName, avatarEmoji, avatarColor } = data;
  const updates = {};
  if (displayName) updates.display_name = sanitizeName(displayName);
  if (avatarEmoji && typeof avatarEmoji === 'string') updates.avatar_emoji = avatarEmoji.slice(0, 8);
  if (avatarColor && /^#[0-9a-fA-F]{6}$/.test(avatarColor)) updates.avatar_color = avatarColor;

  if (Object.keys(updates).length === 0) return;

  const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE players SET ${sets} WHERE id = ?`).run(...Object.values(updates), socket.playerId);
  socket.playerData = db.prepare('SELECT * FROM players WHERE id = ?').get(socket.playerId);
}

// ── Safe player object (no pin_hash) ─────────────────────────────────────────
function safePlayer(player) {
  const { pin_hash, ...safe } = player;
  return safe;
}

// ── Get player by ID ──────────────────────────────────────────────────────────
function getPlayer(playerId) {
  const p = db.prepare('SELECT * FROM players WHERE id = ?').get(playerId);
  return p ? safePlayer(p) : null;
}

// ── Cookie parser util ────────────────────────────────────────────────────────
function parseCookies(header) {
  const result = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key) result[key.trim()] = decodeURIComponent(rest.join('=').trim());
  }
  return result;
}

// ── Session cookie helpers (used by routes) ───────────────────────────────────

// For registered (non-guest) users: persistent 30-day cookie.
// sameSite:'lax' (not 'strict') so the cookie is sent on top-level cross-site
// navigation (e.g. clicking a link from Discord/email). 'strict' would cause the
// auto-guest middleware to fire on that first request and overwrite the session.
function setSessionCookie(res, playerId) {
  const isProd = config.NODE_ENV === 'production';
  res.cookie('gc_session', playerId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
}

// For ephemeral guest sessions: short-lived 1-day cookie.
function setGuestCookie(res, guestId) {
  const isProd = config.NODE_ENV === 'production';
  res.cookie('gc_session', guestId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 24 * 60 * 60 * 1000, // 1 day
  });
}

function clearSessionCookie(res) {
  res.clearCookie('gc_session');
}

module.exports = {
  attachSession,
  loginOrRegister,
  handlePlayerUpdate,
  safePlayer,
  getPlayer,
  hashPin,
  setSessionCookie,
  setGuestCookie,
  clearSessionCookie,
};
