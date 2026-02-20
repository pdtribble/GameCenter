const express = require('express');
const router = express.Router();
const path = require('path');
const db = require('../db');
const config = require('../../config/default');
const sync = require('../sync');

const startTime = Date.now();

// GET /health
router.get('/health', (req, res) => {
  const activeLobbies = db.prepare("SELECT COUNT(*) as c FROM lobbies WHERE status = 'waiting' OR status = 'active'").get().c;

  // Count connected players via io (attached at startup)
  const io = req.app.get('io');
  const connectedPlayers = io ? io.sockets.sockets.size : 0;

  res.json({
    status: 'ok',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    activeLobbies,
    connectedPlayers,
    deployment: config.DEPLOYMENT,
  });
});

// GET /status
router.get('/status', (req, res) => {
  const serverName = db.prepare("SELECT value FROM server_config WHERE key = 'server_name'").get()?.value || 'GameCenter';
  const totalGamesPlayed = db.prepare('SELECT COUNT(*) as c FROM game_sessions WHERE ended_at IS NOT NULL').get().c;
  const totalPlayers = db.prepare('SELECT COUNT(*) as c FROM players WHERE is_guest = 0').get().c;
  const activeLobbies = db.prepare("SELECT COUNT(*) as c FROM lobbies WHERE status = 'waiting' OR status = 'active'").get().c;

  res.json({
    serverName,
    totalGamesPlayed,
    totalPlayers,
    activeLobbies,
    deployment: config.DEPLOYMENT,
  });
});

// GET /api/games — list game types with their setup configs and module metadata
router.get('/api/games', (req, res) => {
  const rows = db.prepare('SELECT game_type, display_name FROM game_registry ORDER BY game_type').all();
  const games = rows.map(row => {
    try {
      const mod = require(path.join(__dirname, '../../games', row.game_type, 'index.js'));
      return {
        gameType: row.game_type,
        label: mod.name || row.display_name || row.game_type,
        description: mod.description || '',
        minPlayers: mod.minPlayers || 2,
        maxPlayers: mod.maxPlayers || 8,
        botFillAllowed: !!mod.botFillAllowed,
        botFillMin: mod.botFillMin || mod.minPlayers || 2,
        config: mod.getSetupConfig ? mod.getSetupConfig() : [],
      };
    } catch (_e) {
      return { gameType: row.game_type, label: row.game_type, description: '', minPlayers: 2, maxPlayers: 8, botFillAllowed: false, botFillMin: 2, config: [] };
    }
  });
  res.json(games);
});

// POST /api/sync — receive sync records from Pi
router.post('/api/sync', (req, res) => {
  const apiKey = req.headers['x-sync-key'];
  if (!apiKey || apiKey !== config.SYNC_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const record = req.body;
  if (!record || !record.id || !record.table_name || !record.record_id || !record.payload) {
    return res.status(400).json({ error: 'Invalid record' });
  }

  try {
    const payload = typeof record.payload === 'string' ? JSON.parse(record.payload) : record.payload;

    // Idempotent upsert — use the original UUID
    db.prepare(`
      INSERT OR REPLACE INTO sync_queue (id, table_name, record_id, payload, created_at, synced)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(record.id, record.table_name, record.record_id, JSON.stringify(payload), record.created_at || new Date().toISOString());

    res.json({ ok: true });
  } catch (err) {
    console.error('[sync] Failed to process incoming sync record', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
