const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/default');
const path = require('path');

const dbPath = path.resolve(config.DB_PATH);
const db = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      avatar_emoji TEXT DEFAULT '🎮',
      avatar_color TEXT DEFAULT '#6366f1',
      pin_hash TEXT,
      is_bot INTEGER DEFAULT 0,
      is_guest INTEGER DEFAULT 0,
      privacy_public INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      last_seen TEXT
    );

    CREATE TABLE IF NOT EXISTS groups_table (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_by TEXT REFERENCES players(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT REFERENCES groups_table(id),
      player_id TEXT REFERENCES players(id),
      joined_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (group_id, player_id)
    );

    CREATE TABLE IF NOT EXISTS game_registry (
      game_type TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      min_players INTEGER NOT NULL,
      max_players INTEGER NOT NULL,
      added_at TEXT DEFAULT (datetime('now')),
      config TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS lobbies (
      id TEXT PRIMARY KEY,
      join_code TEXT UNIQUE NOT NULL,
      game_type TEXT REFERENCES game_registry(game_type),
      host_player_id TEXT REFERENCES players(id),
      status TEXT DEFAULT 'waiting',
      settings TEXT DEFAULT '{}',
      name TEXT,
      is_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      last_activity TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lobby_players (
      lobby_id TEXT REFERENCES lobbies(id),
      player_id TEXT REFERENCES players(id),
      role TEXT DEFAULT 'player',
      is_ready INTEGER DEFAULT 0,
      joined_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (lobby_id, player_id)
    );

    CREATE TABLE IF NOT EXISTS game_sessions (
      id TEXT PRIMARY KEY,
      lobby_id TEXT REFERENCES lobbies(id),
      game_type TEXT NOT NULL,
      module_version TEXT NOT NULL,
      started_at TEXT DEFAULT (datetime('now')),
      ended_at TEXT,
      location TEXT DEFAULT 'online'
    );

    CREATE TABLE IF NOT EXISTS game_results (
      id TEXT PRIMARY KEY,
      session_id TEXT REFERENCES game_sessions(id),
      player_id TEXT REFERENCES players(id),
      placement INTEGER,
      result TEXT,
      synced INTEGER DEFAULT 0,
      played_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS game_events (
      id TEXT PRIMARY KEY,
      session_id TEXT REFERENCES game_sessions(id),
      player_id TEXT REFERENCES players(id),
      event_type TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      timestamp TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS presets (
      id TEXT PRIMARY KEY,
      player_id TEXT REFERENCES players(id),
      name TEXT NOT NULL,
      game_type TEXT NOT NULL,
      settings TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS server_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sp_game_saves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL,
      game_type TEXT NOT NULL,
      save_slot TEXT NOT NULL,
      save_data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(player_id, game_type, save_slot)
    );

    CREATE TABLE IF NOT EXISTS sp_game_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL,
      game_type TEXT NOT NULL,
      mode TEXT NOT NULL,
      result TEXT NOT NULL,
      stats TEXT NOT NULL,
      played_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sp_saves_player ON sp_game_saves(player_id, game_type);
    CREATE INDEX IF NOT EXISTS idx_sp_history_player ON sp_game_history(player_id, game_type);

    CREATE TABLE IF NOT EXISTS mp_game_stats (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id    TEXT NOT NULL,
      game_type    TEXT NOT NULL,
      result       TEXT NOT NULL,
      stats        TEXT NOT NULL,
      played_at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mp_stats_player ON mp_game_stats(player_id, game_type);
  `);

  // Add new lobbies columns for existing databases (idempotent — throws if already present)
  try { db.exec('ALTER TABLE lobbies ADD COLUMN name TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE lobbies ADD COLUMN is_default INTEGER DEFAULT 0'); } catch (_) {}

  // Seed game registry — modules define their own metadata via exports;
  // registry rows are minimal anchors for the lobby system.
  const seedGames = db.prepare(`
    INSERT OR IGNORE INTO game_registry (game_type, display_name, min_players, max_players)
    VALUES (?, ?, ?, ?)
  `);
  seedGames.run('blackjack', 'Blackjack', 1, 6);
  seedGames.run('bs', 'BS', 2, 6);

  // Remove deprecated game types (idempotent DELETEs)
  for (const gt of ['highest-card', 'game_night']) {
    db.exec(`DELETE FROM lobby_players WHERE lobby_id IN (SELECT id FROM lobbies WHERE game_type = '${gt}')`);
    db.exec(`DELETE FROM lobbies WHERE game_type = '${gt}'`);
    db.exec(`DELETE FROM game_registry WHERE game_type = '${gt}'`);
  }

  console.log('[db] Schema migration complete');
}

// ── Join code generator ────────────────────────────────────────────────────────
function generateJoinCode() {
  // Omit O, 0, I, 1 to avoid visual confusion
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ── Default lobby seeding ──────────────────────────────────────────────────────
// Called on every server start.
// Step 1 (once): purges all pre-existing lobbies to clean up legacy data.
// Step 2 (every start): ensures one default lobby per registered game type.
function ensureDefaultLobbies() {
  // One-time purge — tracked by server_config so it only runs once
  const purgeFlag = db.prepare("SELECT value FROM server_config WHERE key = 'default_lobbies_v1'").get();
  if (!purgeFlag) {
    // Delete in FK-safe order: lobby_players first, then lobbies
    db.exec('DELETE FROM lobby_players');
    db.exec('DELETE FROM lobbies');
    db.prepare("INSERT OR REPLACE INTO server_config (key, value) VALUES ('default_lobbies_v1', 'done')").run();
    console.log('[db] Purged old lobbies for default lobby migration');
  }

  // Self-heal: create a default lobby for any game type that doesn't have one
  const games = db.prepare('SELECT game_type, display_name FROM game_registry').all();
  for (const game of games) {
    const existing = db.prepare(
      "SELECT id FROM lobbies WHERE game_type = ? AND is_default = 1 AND status = 'waiting'"
    ).get(game.game_type);

    if (!existing) {
      // Generate a unique 4-char join code
      let code;
      let tries = 0;
      do {
        code = generateJoinCode();
        tries++;
      } while (db.prepare('SELECT 1 FROM lobbies WHERE join_code = ?').get(code) && tries < 50);

      db.prepare(
        "INSERT INTO lobbies (id, join_code, game_type, host_player_id, status, is_default, name) VALUES (?, ?, ?, NULL, 'waiting', 1, ?)"
      ).run(uuidv4(), code, game.game_type, `${game.display_name} - Default`);

      console.log(`[db] Created default lobby: ${game.game_type} (${code})`);
    }
  }
}

migrate();
ensureDefaultLobbies();

module.exports = db;
