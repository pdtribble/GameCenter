const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

// Cache achievement definitions (reloaded on first call per game type)
const definitionCache = new Map();

function loadDefinitions(gameType) {
  if (definitionCache.has(gameType)) return definitionCache.get(gameType);

  const defs = [];

  // Global achievements
  try {
    const global = require(path.join(__dirname, '..', 'games', 'global', 'achievements.js'));
    defs.push(...global);
  } catch (e) { /* not yet implemented */ }

  // Game-specific achievements
  if (gameType && gameType !== 'game_night') {
    try {
      const gameDefs = require(path.join(__dirname, '..', 'games', gameType, 'achievements.js'));
      defs.push(...gameDefs);
    } catch (e) { /* game has no achievements file yet */ }
  }

  definitionCache.set(gameType, defs);
  return defs;
}

function getPlayerStats(playerId, gameType) {
  const gamesPlayed = db.prepare(`
    SELECT COUNT(*) as c FROM game_results gr
    JOIN game_sessions gs ON gr.session_id = gs.id
    WHERE gr.player_id = ? AND (? IS NULL OR gs.game_type = ?)
  `).get(playerId, gameType || null, gameType || null).c;

  const wins = db.prepare(`
    SELECT COUNT(*) as c FROM game_results gr
    JOIN game_sessions gs ON gr.session_id = gs.id
    WHERE gr.player_id = ? AND gr.result = 'win' AND (? IS NULL OR gs.game_type = ?)
  `).get(playerId, gameType || null, gameType || null).c;

  const losses = db.prepare(`
    SELECT COUNT(*) as c FROM game_results gr
    JOIN game_sessions gs ON gr.session_id = gs.id
    WHERE gr.player_id = ? AND gr.result = 'loss' AND (? IS NULL OR gs.game_type = ?)
  `).get(playerId, gameType || null, gameType || null).c;

  // Current win streak
  const recentResults = db.prepare(`
    SELECT gr.result FROM game_results gr
    JOIN game_sessions gs ON gr.session_id = gs.id
    WHERE gr.player_id = ? AND (? IS NULL OR gs.game_type = ?)
    ORDER BY gr.played_at DESC
    LIMIT 50
  `).all(playerId, gameType || null, gameType || null);

  let currentStreak = 0;
  for (const row of recentResults) {
    if (row.result === 'win') currentStreak++;
    else break;
  }

  return { gamesPlayed, wins, losses, currentStreak, gameType };
}

function checkAndAward(io, playerId, gameType, event, session) {
  const defs = loadDefinitions(gameType);
  const stats = getPlayerStats(playerId, gameType);

  // Load already-earned achievements
  const earned = new Set(
    db.prepare('SELECT achievement_key FROM achievements WHERE player_id = ?')
      .all(playerId).map(r => r.achievement_key)
  );

  // Load game events for context
  const sessionId = session?.id;
  const gameEvents = sessionId
    ? db.prepare('SELECT * FROM game_events WHERE session_id = ? AND player_id = ? ORDER BY timestamp ASC')
        .all(sessionId, playerId)
    : [];

  for (const def of defs) {
    if (earned.has(def.key)) continue;
    if (def.gameType && def.gameType !== gameType) continue;

    let passed = false;
    try {
      passed = def.check({ ...stats, gameEvents }, event || null);
    } catch (err) {
      console.error(`[achievement] check error key=${def.key}`, err);
    }

    if (passed) {
      const achId = uuidv4();
      try {
        db.prepare(`
          INSERT OR IGNORE INTO achievements (id, player_id, achievement_key, game_type)
          VALUES (?, ?, ?, ?)
        `).run(achId, playerId, def.key, gameType || null);

        // Emit to player's sockets
        const sockets = findSocketsByPlayerId(io, playerId);
        for (const s of sockets) {
          s.emit('server:achievement', {
            achievement: {
              key: def.key,
              label: def.label,
              description: def.description,
              badge: def.badge,
              unlockedAt: new Date().toISOString(),
            },
          });
        }

        console.log(`[achievement] awarded ${def.key} to player ${playerId}`);
      } catch (err) {
        // UNIQUE constraint = already earned, ignore
      }
    }
  }
}

function checkAfterEvent(io, session, event) {
  if (!event || !event.playerId) return;
  checkAndAward(io, event.playerId, session.gameType, event, session);
}

function checkAfterResult(io, session, placement) {
  if (!placement || !placement.playerId) return;
  checkAndAward(io, placement.playerId, session.gameType, null, session);
}

function findSocketsByPlayerId(io, playerId) {
  const result = [];
  if (!io) return result;
  for (const [, s] of io.sockets.sockets) {
    if (s.playerId === playerId) result.push(s);
  }
  return result;
}

// Invalidate cache when new game modules are loaded in dev
function clearCache() { definitionCache.clear(); }

module.exports = { checkAfterEvent, checkAfterResult, clearCache };
