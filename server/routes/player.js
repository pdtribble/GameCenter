'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');

function requirePlayer(req, res) {
  const playerId = req.cookies?.gc_session;
  if (!playerId) { res.status(401).json({ error: 'Not logged in.' }); return null; }
  const player = db.prepare('SELECT id FROM players WHERE id = ?').get(playerId);
  if (!player) { res.status(401).json({ error: 'Not logged in.' }); return null; }
  return player.id;
}

// GET /api/me — current player info
router.get('/api/me', (req, res) => {
  const playerId = requirePlayer(req, res);
  if (!playerId) return;
  const player = db.prepare(
    'SELECT id, username, display_name, avatar_color, avatar_emoji, created_at FROM players WHERE id = ?'
  ).get(playerId);
  res.json(player);
});

// PATCH /api/me — update display_name and/or avatar_color
router.patch('/api/me', (req, res) => {
  const playerId = requirePlayer(req, res);
  if (!playerId) return;
  const { display_name, avatar_color } = req.body;
  const updates = {};
  if (display_name && typeof display_name === 'string') {
    updates.display_name = display_name.replace(/<[^>]*>/g, '').trim().slice(0, 32) || null;
  }
  if (avatar_color && /^#[0-9a-fA-F]{6}$/.test(avatar_color)) {
    updates.avatar_color = avatar_color;
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Nothing to update.' });
  }
  const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE players SET ${sets} WHERE id = ?`).run(...Object.values(updates), playerId);
  const updated = db.prepare(
    'SELECT id, username, display_name, avatar_color, avatar_emoji, created_at FROM players WHERE id = ?'
  ).get(playerId);
  res.json(updated);
});

// GET /api/me/history — last 30 mp + sp records combined
router.get('/api/me/history', (req, res) => {
  const playerId = requirePlayer(req, res);
  if (!playerId) return;

  const mpRows = db.prepare(`
    SELECT gs.game_type, gr.result, gr.played_at, 'mp' AS type, NULL AS mode
    FROM game_results gr
    JOIN game_sessions gs ON gs.id = gr.session_id
    WHERE gr.player_id = ?
    ORDER BY gr.played_at DESC
    LIMIT 30
  `).all(playerId);

  const spRows = db.prepare(`
    SELECT game_type, result, played_at, 'sp' AS type, mode
    FROM sp_game_history
    WHERE player_id = ?
    ORDER BY played_at DESC
    LIMIT 30
  `).all(playerId);

  const combined = [...mpRows, ...spRows]
    .sort((a, b) => {
      const ta = typeof a.played_at === 'string' ? new Date(a.played_at).getTime() : a.played_at;
      const tb = typeof b.played_at === 'string' ? new Date(b.played_at).getTime() : b.played_at;
      return tb - ta;
    })
    .slice(0, 30);

  res.json(combined);
});

module.exports = router;
