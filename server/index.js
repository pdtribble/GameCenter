require('../config/schema'); // validate config on startup
const config = require('../config/default');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cookieParser = require('cookie-parser');
const path = require('path');

const db = require('./db');
const sessionManager = require('./session-manager');
const lobbyManager = require('./lobby-manager');
const gameRunner = require('./game-runner');
const syncRunner = require('./sync');

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const statusRouter = require('./routes/status');
const adminRouter = require('./routes/admin');
const joinRouter = require('./routes/join');
const spRouter = require('./routes/singleplayer');
const playerRouter = require('./routes/player');
const authRouter = require('./routes/auth');
const chipsRouter = require('./routes/chips');
const rateLimitMiddleware = require('./middleware/rate-limit');
const authMiddleware = require('./middleware/auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: false },
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser(config.SESSION_SECRET));

// First-run wizard gate — redirect everything except /setup and static assets
app.use((req, res, next) => {
  const setupDone = db.prepare('SELECT value FROM server_config WHERE key = ?').get('setup_complete');
  if (!setupDone && !req.path.startsWith('/setup') && !req.path.startsWith('/assets')) {
    return res.redirect('/setup');
  }
  if (setupDone && req.path.startsWith('/setup')) {
    return res.redirect('/');
  }
  next();
});

// Auto-create guest HTTP session on first page load (before static files)
app.use((req, res, next) => {
  if (!req.cookies?.gc_session && req.method === 'GET'
      && (req.path === '/' || req.path === '/index.html')) {
    const guestId = uuidv4();
    const username = 'guest_' + crypto.randomBytes(4).toString('hex');
    db.prepare('INSERT INTO players (id, username, display_name, is_guest) VALUES (?, ?, ?, 1)')
      .run(guestId, username, 'Guest');
    sessionManager.setSessionCookie(res, guestId);
    req.cookies = { ...req.cookies, gc_session: guestId };
  }
  next();
});

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'client')));
app.use('/data', express.static(path.join(__dirname, '..', 'public', 'data')));
app.use('/games', express.static(path.join(__dirname, '..', 'games')));
app.use('/cards', express.static(path.join(__dirname, '..', 'client', 'cards')));

// API: list available card themes
app.get('/api/card-themes', (req, res) => {
  const themes = [
    { id: 'default', name: 'Classic' },
    { id: 'minimal', name: 'Minimal' },
    { id: 'neon', name: 'Neon' },
    { id: 'stained-glass', name: 'Stained Glass' },
    { id: 'dark-casino', name: 'Dark Casino' },
    { id: 'art-deco', name: 'Art Deco' },
  ];
  res.json(themes);
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/', authRouter);
app.use('/', statusRouter);
app.use('/', spRouter);
app.use('/', playerRouter);
app.use('/', chipsRouter);
app.use('/join', joinRouter);
app.use('/admin', rateLimitMiddleware.adminLimiter, adminRouter);

// ── First-run wizard ──────────────────────────────────────────────────────────
app.get('/setup', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GameCenter Setup</title>
  <link rel="stylesheet" href="/style.css">
  <style>
    body { display:flex; align-items:center; justify-content:center; min-height:100vh; background:var(--color-bg-primary); }
    .setup-card { background:var(--color-bg-card); border-radius:var(--radius-lg); padding:var(--spacing-xl); max-width:480px; width:100%; box-shadow:0 4px 24px var(--color-shadow); }
    h1 { color:var(--color-text-primary); margin-bottom:var(--spacing-md); }
    p  { color:var(--color-text-secondary); margin-bottom:var(--spacing-lg); }
    label { display:block; color:var(--color-text-secondary); font-size:var(--font-size-sm); margin-bottom:var(--spacing-xs); }
    input { width:100%; padding:var(--spacing-sm) var(--spacing-md); border:1px solid var(--color-border); border-radius:var(--radius-md); background:var(--color-bg-secondary); color:var(--color-text-primary); font-size:var(--font-size-md); box-sizing:border-box; margin-bottom:var(--spacing-md); }
    button { width:100%; padding:var(--spacing-sm) var(--spacing-md); background:var(--color-accent); color:#fff; border:none; border-radius:var(--radius-md); font-size:var(--font-size-md); cursor:pointer; }
    button:hover { background:var(--color-accent-hover); }
    .error { color:var(--color-danger); margin-top:var(--spacing-sm); }
  </style>
</head>
<body>
  <div class="setup-card">
    <h1>🎮 Welcome to GameCenter</h1>
    <p>Let's get you set up. This wizard only runs once.</p>
    <form method="POST" action="/setup">
      <label for="server_name">Server Name</label>
      <input type="text" id="server_name" name="server_name" placeholder="My GameCenter" required maxlength="64">
      <label for="admin_pin">Admin PIN</label>
      <input type="password" id="admin_pin" name="admin_pin" placeholder="Choose a secure PIN" required minlength="4">
      <label for="first_username">Your Username (optional)</label>
      <input type="text" id="first_username" name="first_username" placeholder="Leave blank to skip" maxlength="32">
      <label for="first_pin">Your Account PIN (optional)</label>
      <input type="password" id="first_pin" name="first_pin" placeholder="Leave blank for guest-only access" minlength="4">
      <button type="submit">Complete Setup</button>
    </form>
  </div>
</body>
</html>`);
});

app.post('/setup', express.urlencoded({ extended: false }), (req, res) => {
  const { server_name, admin_pin, first_username, first_pin } = req.body;

  if (!server_name || !admin_pin) {
    return res.status(400).send('Server name and admin PIN are required.');
  }

  const upsert = db.prepare('INSERT OR REPLACE INTO server_config (key, value) VALUES (?, ?)');
  const tx = db.transaction(() => {
    upsert.run('setup_complete', 'true');
    upsert.run('server_name', server_name.trim().slice(0, 64));
    upsert.run('admin_pin', admin_pin);

    if (first_username && first_username.trim()) {
      const { v4: uuidv4 } = require('uuid');
      const crypto = require('crypto');
      const pinHash = first_pin ? crypto.createHash('sha256').update(first_pin).digest('hex') : null;
      db.prepare(`
        INSERT OR IGNORE INTO players (id, username, display_name, pin_hash)
        VALUES (?, ?, ?, ?)
      `).run(uuidv4(), first_username.trim().toLowerCase(), first_username.trim(), pinHash);
    }
  });
  tx();

  res.redirect('/');
});

// ── Socket.io ─────────────────────────────────────────────────────────────────
io.use((socket, next) => {
  // Attach session to socket
  sessionManager.attachSession(socket, next);
});

io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id} player: ${socket.playerId || 'unknown'}`);

  // Update last_seen
  if (socket.playerId) {
    db.prepare("UPDATE players SET last_seen = datetime('now') WHERE id = ?").run(socket.playerId);
  }

  // ── Lobby events ────────────────────────────────────────────────────────────
  socket.on('lobby:create', (data) => {
    try { lobbyManager.handleCreate(socket, io, data); }
    catch (err) { handleSocketError(socket, 'lobby:create', err); }
  });

  socket.on('lobby:join', (data) => {
    try { lobbyManager.handleJoin(socket, io, data); }
    catch (err) { handleSocketError(socket, 'lobby:join', err); }
  });

  socket.on('lobby:leave', (data) => {
    try { lobbyManager.handleLeave(socket, io, data); }
    catch (err) { handleSocketError(socket, 'lobby:leave', err); }
  });

  socket.on('lobby:ready', (data) => {
    try { lobbyManager.handleReady(socket, io, data); }
    catch (err) { handleSocketError(socket, 'lobby:ready', err); }
  });

  socket.on('lobby:unready', (data) => {
    try { lobbyManager.handleUnready(socket, io, data); }
    catch (err) { handleSocketError(socket, 'lobby:unready', err); }
  });

  socket.on('lobby:start', (data) => {
    try { lobbyManager.handleStart(socket, io, data, gameRunner); }
    catch (err) { handleSocketError(socket, 'lobby:start', err); }
  });

  socket.on('lobby:kick', (data) => {
    try { lobbyManager.handleKick(socket, io, data); }
    catch (err) { handleSocketError(socket, 'lobby:kick', err); }
  });

  socket.on('lobby:transfer_host', (data) => {
    try { lobbyManager.handleTransferHost(socket, io, data); }
    catch (err) { handleSocketError(socket, 'lobby:transfer_host', err); }
  });

  socket.on('lobby:settings', (data) => {
    try { lobbyManager.handleSettings(socket, io, data); }
    catch (err) { handleSocketError(socket, 'lobby:settings', err); }
  });

  socket.on('lobby:chat', (data) => {
    try { lobbyManager.handleChat(socket, io, data); }
    catch (err) { handleSocketError(socket, 'lobby:chat', err); }
  });

  // ── Game events ─────────────────────────────────────────────────────────────
  socket.on('game:action', (data) => {
    try { gameRunner.handleAction(socket, io, data); }
    catch (err) { handleSocketError(socket, 'game:action', err); }
  });

  socket.on('game:ready', (data) => {
    try { gameRunner.handleReady(socket, io, data); }
    catch (err) { handleSocketError(socket, 'game:ready', err); }
  });

  socket.on('game:sit_out', (data) => {
    try { gameRunner.handleSitOut(socket, io, data); }
    catch (err) { handleSocketError(socket, 'game:sit_out', err); }
  });

  socket.on('game:sit_in', (data) => {
    try { gameRunner.handleSitIn(socket, io, data); }
    catch (err) { handleSocketError(socket, 'game:sit_in', err); }
  });

  socket.on('game:chat', (data) => {
    try { gameRunner.handleChat(socket, io, data); }
    catch (err) { handleSocketError(socket, 'game:chat', err); }
  });

  // ── Player events ───────────────────────────────────────────────────────────
  socket.on('player:update', (data) => {
    try { sessionManager.handlePlayerUpdate(socket, io, data); }
    catch (err) { handleSocketError(socket, 'player:update', err); }
  });

  // ── Rejoin (page reload while game is active) ────────────────────────────────
  socket.on('client:rejoin_check', () => {
    try { gameRunner.handleRejoin(socket, io); }
    catch (err) { handleSocketError(socket, 'client:rejoin_check', err); }
  });

  // ── Spectator events ────────────────────────────────────────────────────────
  socket.on('spectator:join', (data) => {
    try { lobbyManager.handleSpectatorJoin(socket, io, data); }
    catch (err) { handleSocketError(socket, 'spectator:join', err); }
  });

  // ── Admin events ─────────────────────────────────────────────────────────────
  socket.on('admin:broadcast', (data) => {
    try {
      authMiddleware.requireAdmin(socket, data, () => {
        io.emit('server:announcement', { message: sanitize(data.message, 280) });
      });
    } catch (err) { handleSocketError(socket, 'admin:broadcast', err); }
  });

  socket.on('admin:kick_player', (data) => {
    try {
      authMiddleware.requireAdmin(socket, data, () => {
        const targetSocket = findSocketByPlayerId(io, data.playerId);
        if (targetSocket) {
          targetSocket.emit('server:error', { code: 'ADMIN_KICK', message: 'You have been removed by an admin.' });
          targetSocket.disconnect(true);
        }
      });
    } catch (err) { handleSocketError(socket, 'admin:kick_player', err); }
  });

  socket.on('admin:end_session', (data) => {
    try {
      authMiddleware.requireAdmin(socket, data, () => {
        gameRunner.forceEndSession(io, data.sessionId);
      });
    } catch (err) { handleSocketError(socket, 'admin:end_session', err); }
  });

  // ── Disconnect ───────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[socket] disconnected: ${socket.id}`);
    lobbyManager.handleDisconnect(socket, io);
  });
});

// ── Error handling ────────────────────────────────────────────────────────────
function handleSocketError(socket, event, err) {
  console.error(`[error] ${new Date().toISOString()} event=${event} player=${socket.playerId || 'unknown'}`, err);
  socket.emit('server:error', { code: 'SERVER_ERROR', message: 'An unexpected error occurred.' });
}

function findSocketByPlayerId(io, playerId) {
  for (const [, socket] of io.sockets.sockets) {
    if (socket.playerId === playerId) return socket;
  }
  return null;
}

function sanitize(str, maxLen) {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '').trim().slice(0, maxLen);
}

process.on('uncaughtException', (err) => {
  console.error(`[fatal] uncaughtException: ${new Date().toISOString()}`, err);
});

process.on('unhandledRejection', (reason) => {
  console.error(`[fatal] unhandledRejection: ${new Date().toISOString()}`, reason);
});

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(config.PORT, () => {
  console.log(`[server] GameCenter running on port ${config.PORT} (${config.NODE_ENV}, deployment=${config.DEPLOYMENT})`);
  if (config.SYNC_ENABLED) syncRunner.start(io);
});

module.exports = { app, server, io };
