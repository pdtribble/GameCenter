const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const sessionManager = require('../session-manager');

// POST /api/auth/login
router.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const clean = username.trim().toLowerCase().slice(0, 32);
    const player = db.prepare('SELECT * FROM players WHERE username = ? AND is_guest = 0').get(clean);
    if (!player) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    let valid = false;
    if (!player.pin_hash) {
      // No password set — allow login for legacy no-pin accounts
      valid = true;
    } else if (player.pin_hash.startsWith('$2b$') || player.pin_hash.startsWith('$2a$')) {
      // bcrypt hash
      valid = await bcrypt.compare(password, player.pin_hash);
    } else {
      // Legacy SHA256 hash
      const sha = crypto.createHash('sha256').update(String(password)).digest('hex');
      valid = sha === player.pin_hash;
    }

    if (!valid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    db.prepare("UPDATE players SET last_seen = datetime('now'), is_guest = 0 WHERE id = ?").run(player.id);
    sessionManager.setSessionCookie(res, player.id);
    return res.json({ ok: true, player: sessionManager.safePlayer(player) });
  } catch (err) {
    console.error('[auth/login]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/signup
router.post('/api/auth/signup', async (req, res) => {
  try {
    const { username, display_name, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const clean = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(clean)) {
      return res.status(400).json({ error: 'Username must be 3–20 characters (letters, numbers, underscores only)' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = db.prepare('SELECT id FROM players WHERE username = ? AND is_guest = 0').get(clean);
    if (existing) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const pinHash = await bcrypt.hash(password, 10);
    const newId = uuidv4();
    const name = display_name ? display_name.trim().slice(0, 32) : clean;

    db.prepare('INSERT INTO players (id, username, display_name, pin_hash, is_guest) VALUES (?, ?, ?, ?, 0)')
      .run(newId, clean, name || clean, pinHash);

    const newPlayer = db.prepare('SELECT * FROM players WHERE id = ?').get(newId);
    sessionManager.setSessionCookie(res, newId);
    return res.json({ ok: true, player: sessionManager.safePlayer(newPlayer) });
  } catch (err) {
    console.error('[auth/signup]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/logout
router.post('/api/auth/logout', (req, res) => {
  sessionManager.clearSessionCookie(res);
  return res.json({ ok: true });
});

module.exports = router;
