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

// GET /api/sp/saves/:gameType — list saves for current player
router.get('/api/sp/saves/:gameType', (req, res) => {
  const playerId = requirePlayer(req, res);
  if (!playerId) return;
  const rows = db.prepare(
    'SELECT save_slot, save_data, created_at, updated_at FROM sp_game_saves WHERE player_id = ? AND game_type = ? ORDER BY updated_at DESC'
  ).all(playerId, req.params.gameType);
  res.json(rows.map(r => ({ slot: r.save_slot, data: JSON.parse(r.save_data), createdAt: r.created_at, updatedAt: r.updated_at })));
});

// POST /api/sp/saves/:gameType — upsert a save slot
router.post('/api/sp/saves/:gameType', (req, res) => {
  const playerId = requirePlayer(req, res);
  if (!playerId) return;
  const { slot, data } = req.body;
  if (!slot || data === undefined) return res.status(400).json({ error: 'slot and data required.' });
  const now = Date.now();
  db.prepare(
    `INSERT INTO sp_game_saves (player_id, game_type, save_slot, save_data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(player_id, game_type, save_slot)
     DO UPDATE SET save_data = excluded.save_data, updated_at = excluded.updated_at`
  ).run(playerId, req.params.gameType, slot, JSON.stringify(data), now, now);
  res.json({ ok: true });
});

// DELETE /api/sp/saves/:gameType/:slot — delete a save slot
router.delete('/api/sp/saves/:gameType/:slot', (req, res) => {
  const playerId = requirePlayer(req, res);
  if (!playerId) return;
  db.prepare(
    'DELETE FROM sp_game_saves WHERE player_id = ? AND game_type = ? AND save_slot = ?'
  ).run(playerId, req.params.gameType, req.params.slot);
  res.json({ ok: true });
});

// POST /api/sp/history/:gameType — record a completed game
router.post('/api/sp/history/:gameType', (req, res) => {
  const playerId = requirePlayer(req, res);
  if (!playerId) return;
  const { mode, result, stats } = req.body;
  if (!mode || !result) return res.status(400).json({ error: 'mode and result required.' });
  db.prepare(
    'INSERT INTO sp_game_history (player_id, game_type, mode, result, stats, played_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(playerId, req.params.gameType, mode, result, JSON.stringify(stats || {}), Date.now());
  res.json({ ok: true });
});

// GET /api/sp/history/:gameType — recent game history
router.get('/api/sp/history/:gameType', (req, res) => {
  const playerId = requirePlayer(req, res);
  if (!playerId) return;
  const rows = db.prepare(
    'SELECT mode, result, stats, played_at FROM sp_game_history WHERE player_id = ? AND game_type = ? ORDER BY played_at DESC LIMIT 50'
  ).all(playerId, req.params.gameType);
  res.json(rows.map(r => ({ mode: r.mode, result: r.result, stats: JSON.parse(r.stats), playedAt: r.played_at })));
});

// GET /api/sp/stats/:gameType — aggregate stats
router.get('/api/sp/stats/:gameType', (req, res) => {
  const playerId = requirePlayer(req, res);
  if (!playerId) return;
  const total = db.prepare(
    'SELECT COUNT(*) as c FROM sp_game_history WHERE player_id = ? AND game_type = ?'
  ).get(playerId, req.params.gameType).c;
  const wins = db.prepare(
    "SELECT COUNT(*) as c FROM sp_game_history WHERE player_id = ? AND game_type = ? AND result = 'win'"
  ).get(playerId, req.params.gameType).c;
  const bestRow = db.prepare(
    "SELECT stats FROM sp_game_history WHERE player_id = ? AND game_type = ? AND result = 'win' ORDER BY json_extract(stats,'$.timeSeconds') ASC LIMIT 1"
  ).get(playerId, req.params.gameType);
  const bestTime = bestRow ? (JSON.parse(bestRow.stats).timeSeconds ?? null) : null;
  res.json({ totalGames: total, wins, bestTime });
});

module.exports = router;
