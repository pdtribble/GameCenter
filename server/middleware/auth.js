const db = require('../db');
const config = require('../../config/default');

// Validate admin PIN from socket event data
function requireAdmin(socket, data, next) {
  const pin = data?.adminPin || data?.pin;
  const storedPin = db.prepare("SELECT value FROM server_config WHERE key = 'admin_pin'").get()?.value || config.ADMIN_PIN;

  if (!pin || pin !== storedPin) {
    socket.emit('server:error', { code: 'UNAUTHORIZED', message: 'Admin PIN required.' });
    return;
  }

  next();
}

// Express middleware: checks session cookie for a valid player
function requireSession(req, res, next) {
  const sessionId = req.cookies?.gc_session;
  if (!sessionId) return res.status(401).json({ error: 'Not authenticated.' });

  const player = db.prepare('SELECT id FROM players WHERE id = ?').get(sessionId);
  if (!player) return res.status(401).json({ error: 'Invalid session.' });

  req.playerId = player.id;
  next();
}

module.exports = { requireAdmin, requireSession };
