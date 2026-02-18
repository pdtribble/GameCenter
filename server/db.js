const Database = require('better-sqlite3');
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

    CREATE TABLE IF NOT EXISTS achievements (
      id TEXT PRIMARY KEY,
      player_id TEXT REFERENCES players(id),
      achievement_key TEXT NOT NULL,
      game_type TEXT,
      unlocked_at TEXT DEFAULT (datetime('now')),
      UNIQUE(player_id, achievement_key)
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
  `);

  // Seed game registry with the three supported games
  const seedGames = db.prepare(`
    INSERT OR IGNORE INTO game_registry (game_type, display_name, min_players, max_players)
    VALUES (?, ?, ?, ?)
  `);
  seedGames.run('blackjack', 'Blackjack', 1, 7);
  seedGames.run('poker', 'Texas Hold\'em Poker', 2, 8);
  seedGames.run('bs', 'BS (Cheat)', 2, 8);
  seedGames.run('game_night', 'Game Night', 2, 8);

  console.log('[db] Schema migration complete');
}

migrate();

module.exports = db;
