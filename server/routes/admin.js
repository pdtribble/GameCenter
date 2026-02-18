const express = require('express');
const router = express.Router();
const db = require('../db');
const config = require('../../config/default');
const sync = require('../sync');

const startTime = Date.now();

// Admin PIN check on every request
router.use((req, res, next) => {
  const pin = req.query.pin || req.body?.pin || req.headers['x-admin-pin'];
  const storedPin = db.prepare("SELECT value FROM server_config WHERE key = 'admin_pin'").get()?.value || config.ADMIN_PIN;

  if (pin !== storedPin) {
    if (req.method === 'GET' && !pin) {
      return res.send(loginPage(''));
    }
    return res.status(403).send(loginPage('Incorrect PIN.'));
  }
  req.adminPin = pin;
  next();
});

// GET /admin
router.get('/', (req, res) => {
  const lobbies = db.prepare(`
    SELECT l.*, p.display_name as host_name,
      (SELECT COUNT(*) FROM lobby_players lp WHERE lp.lobby_id = l.id) as player_count
    FROM lobbies l
    LEFT JOIN players p ON l.host_player_id = p.id
    WHERE l.status IN ('waiting', 'active')
    ORDER BY l.created_at DESC
  `).all();

  const io = req.app.get('io');
  const connectedCount = io ? io.sockets.sockets.size : 0;
  const connectedPlayers = [];
  if (io) {
    for (const [, socket] of io.sockets.sockets) {
      if (socket.playerId) {
        const p = db.prepare('SELECT id, display_name, username FROM players WHERE id = ?').get(socket.playerId);
        if (p) connectedPlayers.push({ ...p, socketId: socket.id });
      }
    }
  }

  const totalGames = db.prepare('SELECT COUNT(*) as c FROM game_sessions WHERE ended_at IS NOT NULL').get().c;
  const totalPlayers = db.prepare('SELECT COUNT(*) as c FROM players WHERE is_guest = 0').get().c;
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  const serverName = db.prepare("SELECT value FROM server_config WHERE key = 'server_name'").get()?.value || 'GameCenter';
  const syncStatus = sync.getStatus();

  res.send(adminPage({
    lobbies,
    connectedPlayers,
    totalGames,
    totalPlayers,
    uptime,
    serverName,
    syncStatus,
    pin: req.adminPin,
    deployment: config.DEPLOYMENT,
  }));
});

// POST /admin/broadcast
router.post('/broadcast', express.urlencoded({ extended: false }), (req, res) => {
  const { message } = req.body;
  const io = req.app.get('io');
  if (io && message) {
    io.emit('server:announcement', { message: message.slice(0, 280) });
  }
  res.redirect(`/admin?pin=${req.adminPin}`);
});

// POST /admin/end-session/:id
router.post('/end-session/:id', (req, res) => {
  const gameRunner = require('../game-runner');
  const io = req.app.get('io');
  gameRunner.forceEndSession(io, req.params.id);
  res.redirect(`/admin?pin=${req.adminPin}`);
});

// POST /admin/kick/:playerId
router.post('/kick/:playerId', (req, res) => {
  const io = req.app.get('io');
  if (io) {
    for (const [, socket] of io.sockets.sockets) {
      if (socket.playerId === req.params.playerId) {
        socket.emit('server:error', { code: 'ADMIN_KICK', message: 'You have been removed by an admin.' });
        socket.disconnect(true);
      }
    }
  }
  res.redirect(`/admin?pin=${req.adminPin}`);
});

// ── HTML helpers ───────────────────────────────────────────────────────────────
function loginPage(error) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Admin Login — GameCenter</title>
<link rel="stylesheet" href="/style.css">
<style>
  body{display:flex;align-items:center;justify-content:center;min-height:100vh;background:var(--color-bg-primary)}
  .card{background:var(--color-bg-card);padding:var(--spacing-xl);border-radius:var(--radius-lg);max-width:360px;width:100%}
  h1{color:var(--color-text-primary);margin-bottom:var(--spacing-md)}
  input{width:100%;padding:var(--spacing-sm);border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-bg-secondary);color:var(--color-text-primary);box-sizing:border-box;margin-bottom:var(--spacing-md)}
  button{width:100%;padding:var(--spacing-sm);background:var(--color-accent);color:#fff;border:none;border-radius:var(--radius-md);cursor:pointer}
  .err{color:var(--color-danger);margin-bottom:var(--spacing-sm)}
</style></head>
<body><div class="card">
  <h1>Admin Panel</h1>
  ${error ? `<p class="err">${error}</p>` : ''}
  <form method="GET">
    <input type="password" name="pin" placeholder="Admin PIN" required autofocus>
    <button type="submit">Login</button>
  </form>
</div></body></html>`;
}

function adminPage({ lobbies, connectedPlayers, totalGames, totalPlayers, uptime, serverName, syncStatus, pin, deployment }) {
  const fmtUptime = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;
  const lobbyRows = lobbies.map(l => `
    <tr>
      <td>${esc(l.join_code)}</td>
      <td>${esc(l.game_type)}</td>
      <td>${esc(l.host_name || '?')}</td>
      <td>${l.player_count}</td>
      <td><span class="badge badge-${l.status}">${l.status}</span></td>
      <td>${l.status === 'active' ? `<form method="POST" action="/admin/end-session/${l.id}?pin=${pin}" style="display:inline"><button class="btn-danger">End</button></form>` : ''}</td>
    </tr>`).join('');

  const playerRows = connectedPlayers.map(p => `
    <tr>
      <td>${esc(p.display_name)}</td>
      <td>${esc(p.username)}</td>
      <td><form method="POST" action="/admin/kick/${p.id}?pin=${pin}" style="display:inline"><button class="btn-danger">Kick</button></form></td>
    </tr>`).join('');

  const syncSection = deployment === 'pi' ? `
    <div class="section">
      <h2>Sync Status</h2>
      <p>Status: <strong>${esc(syncStatus.status)}</strong></p>
      <p>Last sync: ${syncStatus.lastSyncAt ? esc(syncStatus.lastSyncAt) : 'never'}</p>
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Admin — ${esc(serverName)}</title>
<link rel="stylesheet" href="/style.css">
<style>
  body{font-family:var(--font-family-base);background:var(--color-bg-primary);color:var(--color-text-primary);padding:var(--spacing-lg)}
  h1,h2{color:var(--color-text-primary)}
  .section{background:var(--color-bg-card);border-radius:var(--radius-md);padding:var(--spacing-lg);margin-bottom:var(--spacing-lg)}
  table{width:100%;border-collapse:collapse}
  th,td{padding:var(--spacing-sm);border-bottom:1px solid var(--color-border);text-align:left}
  .badge{padding:2px 8px;border-radius:var(--radius-sm);font-size:var(--font-size-sm)}
  .badge-waiting{background:var(--color-warning);color:#000}
  .badge-active{background:var(--color-success);color:#000}
  .btn-danger{background:var(--color-danger);color:#fff;border:none;border-radius:var(--radius-sm);padding:4px 10px;cursor:pointer}
  .stats{display:flex;gap:var(--spacing-lg);flex-wrap:wrap}
  .stat{background:var(--color-bg-secondary);border-radius:var(--radius-md);padding:var(--spacing-md);min-width:120px}
  .stat .label{font-size:var(--font-size-sm);color:var(--color-text-muted)}
  .stat .value{font-size:var(--font-size-xl);font-weight:bold}
  input[type=text]{padding:var(--spacing-sm);border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-bg-secondary);color:var(--color-text-primary);width:300px}
  button.primary{background:var(--color-accent);color:#fff;border:none;border-radius:var(--radius-md);padding:var(--spacing-sm) var(--spacing-md);cursor:pointer;margin-left:var(--spacing-sm)}
</style></head>
<body>
<h1>⚙️ ${esc(serverName)} — Admin Panel</h1>

<div class="section">
  <h2>Server Stats</h2>
  <div class="stats">
    <div class="stat"><div class="label">Uptime</div><div class="value">${fmtUptime}</div></div>
    <div class="stat"><div class="label">Total Games</div><div class="value">${totalGames}</div></div>
    <div class="stat"><div class="label">Registered Players</div><div class="value">${totalPlayers}</div></div>
    <div class="stat"><div class="label">Connected</div><div class="value">${connectedPlayers.length}</div></div>
  </div>
</div>

${syncSection}

<div class="section">
  <h2>Broadcast Announcement</h2>
  <form method="POST" action="/admin/broadcast?pin=${pin}">
    <input type="text" name="message" placeholder="Message to all connected players" maxlength="280" required>
    <button type="submit" class="primary">Send</button>
  </form>
</div>

<div class="section">
  <h2>Active Lobbies</h2>
  ${lobbies.length === 0 ? '<p>No active lobbies.</p>' : `<table><thead><tr><th>Code</th><th>Game</th><th>Host</th><th>Players</th><th>Status</th><th>Action</th></tr></thead><tbody>${lobbyRows}</tbody></table>`}
</div>

<div class="section">
  <h2>Connected Players</h2>
  ${connectedPlayers.length === 0 ? '<p>No players connected.</p>' : `<table><thead><tr><th>Name</th><th>Username</th><th>Action</th></tr></thead><tbody>${playerRows}</tbody></table>`}
</div>
</body></html>`;
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

module.exports = router;
