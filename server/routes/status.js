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
        icon: mod.icon || '🎮',
        minPlayers: mod.minPlayers || 2,
        maxPlayers: mod.maxPlayers || 8,
        botFillAllowed: !!mod.botFillAllowed,
        botFillMin: mod.botFillMin || mod.minPlayers || 2,
        config: mod.getSetupConfig ? mod.getSetupConfig() : [],
      };
    } catch (_e) {
      return { gameType: row.game_type, label: row.game_type, description: '', icon: '🎮', minPlayers: 2, maxPlayers: 8, botFillAllowed: false, botFillMin: 2, config: [] };
    }
  });
  res.json(games);
});

// GET /api/lobbies — list open lobbies for the lobby browser
router.get('/api/lobbies', (req, res) => {
  try {
    const lobbies = db.prepare(`
      SELECT
        l.id, l.join_code, l.game_type, l.status,
        p.display_name AS host_name,
        COUNT(lp.player_id) AS player_count
      FROM lobbies l
      LEFT JOIN players p ON p.id = l.host_player_id
      LEFT JOIN lobby_players lp ON lp.lobby_id = l.id AND lp.role = 'player'
      WHERE l.status = 'waiting'
      GROUP BY l.id
      ORDER BY l.created_at DESC
      LIMIT 50
    `).all();

    const gameRegs = db.prepare('SELECT game_type, max_players FROM game_registry').all();
    const maxByType = {};
    for (const g of gameRegs) maxByType[g.game_type] = g.max_players;

    // Augment with module metadata
    const result = lobbies.map(row => {
      let maxPlayers = maxByType[row.game_type] || 8;
      let label = row.game_type;
      let icon = '🎮';
      try {
        const mod = require(require('path').join(__dirname, '../../games', row.game_type, 'index.js'));
        maxPlayers = mod.maxPlayers || maxPlayers;
        label = mod.name || label;
        icon = mod.icon || icon;
      } catch (_e) {}
      return {
        id: row.id,
        joinCode: row.join_code,
        gameType: row.game_type,
        gameLabel: label,
        gameIcon: icon,
        hostName: row.host_name || 'Unknown',
        playerCount: row.player_count || 0,
        maxPlayers,
        status: row.status,
      };
    });

    res.json(result);
  } catch (err) {
    console.error('[api/lobbies]', err);
    res.json([]);
  }
});

// GET /api/me/stats — current player stats from session cookie
router.get('/api/me/stats', (req, res) => {
  const io = req.app.get('io');
  const onlineCount = io ? io.sockets.sockets.size : 0;

  const playerId = req.cookies?.gc_session;
  if (!playerId) {
    return res.json({ loggedIn: false, onlineCount });
  }

  try {
    const player = db.prepare('SELECT id, display_name, avatar_emoji, avatar_color, is_guest FROM players WHERE id = ?').get(playerId);
    if (!player) return res.json({ loggedIn: false, onlineCount });

    const stats = db.prepare(`
      SELECT
        COUNT(*) AS games_played,
        SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS wins
      FROM game_results WHERE player_id = ?
    `).get(playerId);

    // Per-game-type multiplayer breakdown
    const mpRows = db.prepare(`
      SELECT gs.game_type,
        COUNT(*) AS played,
        SUM(CASE WHEN gr.result = 'win' THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN gr.result = 'loss' OR gr.result = 'lose' THEN 1 ELSE 0 END) AS losses
      FROM game_results gr
      JOIN game_sessions gs ON gs.id = gr.session_id
      WHERE gr.player_id = ?
      GROUP BY gs.game_type
    `).all(playerId);
    const multiplayer = {};
    for (const r of mpRows) {
      multiplayer[r.game_type] = { played: r.played, wins: r.wins, losses: r.losses };
    }

    // Singleplayer breakdown
    const spTotal = db.prepare("SELECT COUNT(*) AS c FROM sp_game_history WHERE player_id = ? AND game_type = 'minesweeper'").get(playerId).c;
    const spWins  = db.prepare("SELECT COUNT(*) AS c FROM sp_game_history WHERE player_id = ? AND game_type = 'minesweeper' AND result = 'win'").get(playerId).c;
    const bestDiffs = {};
    for (const diff of ['beginner', 'intermediate', 'expert']) {
      const row = db.prepare(
        "SELECT stats FROM sp_game_history WHERE player_id = ? AND game_type = 'minesweeper' AND result = 'win' AND mode = ? ORDER BY json_extract(stats,'$.timeSeconds') ASC LIMIT 1"
      ).get(playerId, diff);
      if (row) bestDiffs[diff] = JSON.parse(row.stats).timeSeconds ?? null;
    }
    const singleplayer = {
      minesweeper: { played: spTotal, wins: spWins, bestTimes: bestDiffs },
    };

    res.json({
      loggedIn: true,
      isGuest: player.is_guest === 1,
      playerId: player.id,
      displayName: player.display_name,
      avatarEmoji: player.avatar_emoji || '🎮',
      avatarColor: player.avatar_color || '#6366f1',
      gamesPlayed: stats?.games_played || 0,
      wins: stats?.wins || 0,
      onlineCount,
      multiplayer,
      singleplayer,
    });
  } catch (err) {
    console.error('[api/me/stats]', err);
    res.json({ loggedIn: false, onlineCount });
  }
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
