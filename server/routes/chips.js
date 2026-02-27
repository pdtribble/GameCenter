'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');

const STARTING_CHIPS = 1000;
const RESET_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

function requirePlayer(req, res) {
  const playerId = req.cookies?.gc_session;
  if (!playerId) {
    res.status(401).json({ error: 'Not logged in.' });
    return null;
  }
  const player = db.prepare('SELECT id FROM players WHERE id = ?').get(playerId);
  if (!player) {
    res.status(401).json({ error: 'Not logged in.' });
    return null;
  }
  return player.id;
}

// GET /api/chips — get current chip balance
router.get('/api/chips', (req, res) => {
  const playerId = requirePlayer(req, res);
  if (!playerId) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  const player = db.prepare('SELECT chips FROM players WHERE id = ?').get(playerId);
  res.json({ chips: player?.chips ?? 0 });
});

// POST /api/chips/reset — reset chips (once every 24 hours)
router.post('/api/chips/reset', (req, res) => {
  const playerId = requirePlayer(req, res);
  if (!playerId) {
    return res.status(401).json({ error: 'Not logged in.' });
  }

  const player = db.prepare('SELECT chips, last_chip_reset FROM players WHERE id = ?').get(playerId);
  if (!player) {
    return res.status(404).json({ error: 'Player not found.' });
  }

  if (player.chips > 0) {
    return res.status(400).json({ error: 'You still have chips.' });
  }

  const now = Date.now();
  const lastReset = player.last_chip_reset || 0;
  const nextReset = lastReset + RESET_COOLDOWN_MS;

  if (now < nextReset) {
    const msRemaining = nextReset - now;
    const hrs = Math.floor(msRemaining / 3600000);
    const min = Math.floor((msRemaining % 3600000) / 60000);
    return res.status(400).json({
      error: 'Reset available in ' + hrs + 'h ' + min + 'm',
      nextReset: nextReset
    });
  }

  db.prepare('UPDATE players SET chips = ?, last_chip_reset = ? WHERE id = ?')
    .run(STARTING_CHIPS, now, playerId);

  db.prepare(`
    INSERT INTO chip_transactions (player_id, amount, reason, created_at)
    VALUES (?, ?, 'chip_reset', ?)
  `).run(playerId, STARTING_CHIPS, now);

  res.json({ chips: STARTING_CHIPS, nextReset: null });
});

// PATCH /api/me/card-theme — update preferred card theme
router.patch('/api/me/card-theme', (req, res) => {
  const playerId = requirePlayer(req, res);
  if (!playerId) return;

  const { theme } = req.body;
  if (!theme || typeof theme !== 'string') {
    return res.status(400).json({ error: 'Theme required.' });
  }

  db.prepare('UPDATE players SET preferred_card_theme = ? WHERE id = ?')
    .run(theme, playerId);

  res.json({ ok: true });
});

// GET /api/chips/history — get chip transaction history
router.get('/api/chips/history', (req, res) => {
  const playerId = requirePlayer(req, res);
  if (!playerId) return;

  const transactions = db.prepare(`
    SELECT amount, reason, game_type, created_at
    FROM chip_transactions
    WHERE player_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(playerId);

  res.json(transactions);
});

// POST /api/chips/bet — deduct chips for a bet
router.post('/api/chips/bet', (req, res) => {
  const playerId = requirePlayer(req, res);
  if (!playerId) {
    return res.status(401).json({ error: 'Not logged in.' });
  }

  const { amount, gameType } = req.body;
  if (!amount || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'Valid amount required.' });
  }

  const player = db.prepare('SELECT chips FROM players WHERE id = ?').get(playerId);
  if (!player || player.chips < amount) {
    return res.status(400).json({ error: 'Not enough chips.' });
  }

  const now = Date.now();
  db.prepare('UPDATE players SET chips = chips - ? WHERE id = ?').run(amount, playerId);
  db.prepare(`
    INSERT INTO chip_transactions (player_id, amount, reason, game_type, created_at)
    VALUES (?, ?, 'bet', ?, ?)
  `).run(playerId, -amount, gameType || 'treasure-tower', now);

  const updated = db.prepare('SELECT chips FROM players WHERE id = ?').get(playerId);
  res.json({ chips: updated.chips });
});

// POST /api/chips — award chips (payout, refund, etc.)
router.post('/api/chips', (req, res) => {
  const playerId = requirePlayer(req, res);
  if (!playerId) {
    return res.status(401).json({ error: 'Not logged in.' });
  }

  const { amount, reason, gameType } = req.body;
  if (!amount || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'Valid amount required.' });
  }

  const now = Date.now();
  db.prepare('UPDATE players SET chips = chips + ? WHERE id = ?').run(amount, playerId);
  db.prepare(`
    INSERT INTO chip_transactions (player_id, amount, reason, game_type, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(playerId, amount, reason || 'payout', gameType || 'treasure-tower', now);

  const updated = db.prepare('SELECT chips FROM players WHERE id = ?').get(playerId);
  res.json({ chips: updated.chips });
});

module.exports = router;
module.exports.STARTING_CHIPS = STARTING_CHIPS;
