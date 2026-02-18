# GameCenter — Claude Code Development Prompt

You are building **GameCenter**, a self-hosted multiplayer card/table game platform with two deployment targets: a **Proxmox VM** (public internet) and a **Raspberry Pi 4** (portable, offline-capable). The codebase is **100% shared** between both targets — deployment differences are handled via environment config only.

---

## Tech Stack

- **Runtime:** Node.js (LTS)
- **Framework:** Express.js
- **Realtime:** Socket.io
- **Database:** SQLite via `better-sqlite3` (synchronous, no ORM)
- **Reverse Proxy:** Caddy (external, not in codebase)
- **Frontend:** Vanilla HTML/CSS/JS — no frontend framework. Single page app driven by Socket.io events.
- **CSS:** CSS custom properties (tokens) for all colors, spacing, and typography. No hardcoded values.
- **Package Manager:** npm

Do not use TypeScript. Do not use React, Vue, or any frontend framework. Do not use Prisma or any ORM. Do not use any cloud services.

---

## Project Structure

Build exactly this structure. Do not deviate:

```
/gamecenter
  /server
    index.js              ← Express + Socket.io entry point
    db.js                 ← SQLite connection and migrations
    sync.js               ← Pi-to-Proxmox sync logic
    lobby-manager.js      ← Lobby lifecycle, join codes, host transfer
    session-manager.js    ← Player session cookies, reconnect logic
    achievement-engine.js ← Universal achievement checker
    game-runner.js        ← Loads game modules, calls standard interface
    bot-runner.js         ← Invokes getBotAction(), schedules bot turns
    /routes
      admin.js            ← Protected admin panel routes
      status.js           ← /health and /status endpoints
      join.js             ← /join/:code invite URL handler
    /middleware
      rate-limit.js       ← Join code brute force protection
      auth.js             ← Session PIN validation
  /games
    /poker
      index.js
      bot.js
      achievements.js
      tutorial.js
      README.md
    /blackjack
      index.js
      bot.js
      achievements.js
      tutorial.js
      README.md
    /bs
      index.js
      bot.js
      achievements.js
      tutorial.js
      README.md
    /global
      achievements.js     ← Cross-game achievements
  /client
    index.html            ← Single HTML shell, all views injected by JS
    app.js                ← Client-side router and Socket.io client
    /views
      home.js             ← Landing, login, guest mode
      lobby.js            ← Waiting room, ready-up, settings
      game.js             ← In-game shell, delegates to game renderers
      profile.js          ← Player stats dashboard
      leaderboard.js      ← Global and per-game leaderboards
      postgame.js         ← Results, achievements, rematch vote
      admin.js            ← Admin panel UI
    /renderers
      poker.js            ← Poker-specific game UI
      blackjack.js        ← Blackjack-specific game UI
      bs.js               ← BS-specific game UI
    /components
      chat.js             ← Reusable chat component
      timer.js            ← Turn timer component
      achievement-toast.js
      spectator-badge.js
      ready-indicator.js
    style.css             ← All styles. Token-based. Light + dark mode.
  /config
    default.js            ← All config with defaults
    schema.js             ← Config validation
  .env.example
  package.json
  README.md
```

---

## Database Schema

Run all of the following on first start via `db.js` using `CREATE TABLE IF NOT EXISTS`. Never drop tables. Never use migrations files — all schema is idempotent SQL in `db.js`.

```sql
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
```

---

## Game Module Interface

Every game module at `/games/[gametype]/index.js` must export exactly these functions. No exceptions. The `game-runner.js` calls these and nothing else:

```js
module.exports = {
  version: '1.0.0',                          // string, stored on session start

  initGame(lobbySettings, players),
  // Returns: { state: Object, currentPlayerId: String }
  // state is the full authoritative game state stored in memory

  handleAction(state, playerId, action),
  // action: { type: String, payload: Object }
  // Returns: { state: Object, events: Array, error: String|null }
  // events: array of { type, playerId, metadata } logged to game_events

  getState(state, playerId),
  // Returns a filtered view of state safe for this specific player to see
  // Must never leak hidden info (other players' cards, deck, etc.)

  isTurnValid(state, playerId),
  // Returns: Boolean

  isGameOver(state),
  // Returns: null if game ongoing
  // Returns: { placements: [{ playerId, placement, result }] } if game over

  getBotAction(state, botPlayer, difficulty),
  // difficulty: 'easy' | 'medium' | 'hard'
  // Returns: { type: String, payload: Object } — same shape as handleAction action

  getPostGameSummary(state, results),
  // Returns: Array of { label: String, value: String } highlight stats
  // Return empty array if not implemented
};
```

---

## Config System

`/config/default.js` exports a single config object. All values must be overridable by environment variables. Never hardcode ports, paths, secrets, or URLs anywhere outside this file:

```js
module.exports = {
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  DEPLOYMENT: process.env.DEPLOYMENT || 'proxmox',       // 'proxmox' | 'pi'
  DB_PATH: process.env.DB_PATH || './gamecenter.db',
  SESSION_SECRET: process.env.SESSION_SECRET || 'changeme',
  SYNC_ENABLED: process.env.SYNC_ENABLED === 'true' || false,
  SYNC_TARGET_URL: process.env.SYNC_TARGET_URL || '',
  SYNC_API_KEY: process.env.SYNC_API_KEY || '',
  SYNC_INTERVAL_MS: parseInt(process.env.SYNC_INTERVAL_MS) || 120000,
  HOTSPOT_MODE: process.env.HOTSPOT_MODE === 'true' || false,
  LOBBY_IDLE_TIMEOUT_MS: parseInt(process.env.LOBBY_IDLE_TIMEOUT_MS) || 1800000,
  DISCONNECT_HOLD_MS: parseInt(process.env.DISCONNECT_HOLD_MS) || 120000,
  JOIN_CODE_LENGTH: 4,
  ADMIN_PIN: process.env.ADMIN_PIN || 'admin',
  LOW_POWER_IDLE_MS: parseInt(process.env.LOW_POWER_IDLE_MS) || 600000,
};
```

---

## Socket.io Event Contracts

All realtime communication uses Socket.io. Define and implement all of the following events. Client emits are prefixed with no namespace. Server emits are prefixed with `server:`.

**Client → Server:**
```
lobby:create        { gameType, playerName, pin }
lobby:join          { joinCode, playerName, pin, asSpectator }
lobby:ready         { lobbyId }
lobby:unready       { lobbyId }
lobby:start         { lobbyId }
lobby:kick          { lobbyId, targetPlayerId }
lobby:transfer_host { lobbyId, targetPlayerId }
lobby:settings      { lobbyId, settings }
lobby:chat          { lobbyId, message }
game:action         { sessionId, action }
game:chat           { sessionId, message }
player:update       { displayName, avatarEmoji, avatarColor }
postgame:rematch    { sessionId }
postgame:new_lobby  { sessionId }
spectator:join      { lobbyId }
admin:broadcast     { message }
admin:kick_player   { playerId }
admin:end_session   { sessionId }
```

**Server → Client:**
```
server:lobby_created      { lobby, joinCode, inviteUrl }
server:lobby_updated      { lobby, players }
server:lobby_chat         { playerId, displayName, message, timestamp }
server:game_started       { sessionId, state }
server:game_state         { state }
server:game_event         { event }
server:game_chat          { playerId, displayName, message, timestamp, isSpectator }
server:game_over          { results, postGameSummary }
server:achievement        { achievement }
server:host_transferred   { newHostId }
server:player_joined      { player, role }
server:player_left        { playerId }
server:player_reconnected { playerId }
server:error              { code, message }
server:announcement       { message }
server:turn_timer         { remainingMs, playerId }
```

---

## Lobby Lifecycle Rules

Implement exactly as follows. No shortcuts:

1. `lobby:create` generates a 4-character uppercase alphanumeric join code. Retry on collision. Store in DB. Creator becomes host with role `host`.
2. All players in a lobby must emit `lobby:ready` before host can emit `lobby:start`. Host can start only when all non-bot, non-spectator players are ready.
3. `lobby:start` calls `game-runner.js` which loads the correct game module, calls `initGame()`, stores session in DB, and begins the game loop.
4. If host disconnects, `lobby-manager.js` waits 10 seconds then transfers host to the longest-present non-spectator player. Emit `server:host_transferred`.
5. If any non-host player disconnects, hold their slot for `DISCONNECT_HOLD_MS`. If it's their turn, pause the game and emit `server:game_state` with a `pausedForReconnect` flag. If they reconnect within the window, restore full state. If not, treat as forfeit.
6. Lobbies with no activity for `LOBBY_IDLE_TIMEOUT_MS` are cleaned up automatically. Set `status = 'abandoned'` in DB, disconnect all sockets.
7. Kicked players are stored in a `kicked` set per lobby in memory. Reject any join attempt from a kicked player for the lifetime of that lobby.
8. Join codes are case-insensitive on input, always stored and displayed uppercase.

---

## Sync System (Pi → Proxmox)

`sync.js` runs on the Pi when `SYNC_ENABLED=true`. Implement as follows:

1. On startup and every `SYNC_INTERVAL_MS`, check internet by fetching `SYNC_TARGET_URL/health`.
2. If reachable, query `sync_queue WHERE synced = 0` ordered by `created_at ASC`.
3. POST each record to `SYNC_TARGET_URL/api/sync` with header `x-sync-key: SYNC_API_KEY`.
4. On 200 response, mark record `synced = 1`.
5. On failure, log and retry next interval. Never delete sync queue records.
6. The Proxmox server exposes `POST /api/sync` which upserts the received record into its own DB using the record's original UUID — idempotent, safe to receive duplicates.
7. Emit `server:game_state` with `{ syncStatus: 'online'|'offline', lastSyncAt }` to all connected clients on Pi after each sync attempt.

---

## Achievement Engine

`achievement-engine.js` is called after every `game_events` insert and after every `game_results` insert.

1. Load all achievement definitions from `/games/global/achievements.js` and from the relevant game's `achievements.js`.
2. Each definition is `{ key, gameType|null, label, description, badge, check(playerStats, event) }`.
3. Call `check()` for each unearned achievement for the relevant player.
4. If `check()` returns true, insert into `achievements` table (ignore if already exists due to UNIQUE constraint).
5. Emit `server:achievement` to that player's socket with the achievement data.
6. Achievement stats passed to `check()`: `{ gamesPlayed, wins, losses, currentStreak, gameType, gameEvents[] }` — derive all of these from DB queries, never store as counters.

---

## Admin Panel

Route: `/admin` — protected by `ADMIN_PIN` from config. Implement as a simple server-rendered HTML page (no frontend framework). Must include:

- List of all active lobbies with player counts and status
- List of all connected players
- Button to broadcast a server announcement to all sockets
- Button to force-end any active session
- Button to kick any player globally (disconnects them, blocks rejoin for 1 hour by IP)
- Server stats: uptime, total games played, total players registered
- Last sync status and timestamp (Pi deployment only, hide on Proxmox)

---

## Public Endpoints

Implement these HTTP routes in `/routes/status.js`:

```
GET /health   → { status: 'ok', uptime, activeLobbies, connectedPlayers, deployment }
GET /status   → { serverName, totalGamesPlayed, totalPlayers, activeLobbies, deployment }
GET /join/:code → redirect to client app with join code pre-filled
```

---

## Frontend Architecture

Single `index.html` loads `style.css` and `app.js`. All views are JS modules in `/client/views/` that export a `render(container, socket, state)` function and optionally a `destroy()` function for cleanup. `app.js` manages which view is active, handles Socket.io connection lifecycle, and passes socket + shared state to each view.

Game-specific UI lives in `/client/renderers/[gametype].js`. The `game.js` view dynamically imports the correct renderer based on `gameType` from the session state. Renderers export `render(container, gameState, socket, playerId)` and `update(gameState)`.

The chat component in `/client/components/chat.js` is instantiated by both `lobby.js` (lobby chat) and `game.js` (in-game chat). It accepts a `channel` param (`'lobby'|'game'`) and handles the correct socket events automatically.

---

## CSS Token System

Define all of the following CSS custom properties on `:root` in `style.css`. Implement a `[data-theme="dark"]` override block on `html`. All component styles must reference only these tokens — no hardcoded colors anywhere:

```css
:root {
  --color-bg-primary
  --color-bg-secondary
  --color-bg-card
  --color-text-primary
  --color-text-secondary
  --color-text-muted
  --color-accent
  --color-accent-hover
  --color-success
  --color-warning
  --color-danger
  --color-border
  --color-shadow
  --radius-sm
  --radius-md
  --radius-lg
  --spacing-xs
  --spacing-sm
  --spacing-md
  --spacing-lg
  --spacing-xl
  --font-size-sm
  --font-size-md
  --font-size-lg
  --font-size-xl
  --font-family-base
  --transition-fast
  --transition-normal
}
```

---

## First-Run Wizard

On first start, if `server_config` table is empty, serve a setup wizard at `/setup` before allowing any other routes. Wizard collects: server name, admin PIN, and optionally creates the first player account. On submit, write to `server_config` and redirect to `/`. Block `/setup` after first run.

---

## Game Night Mode

Implement as a special lobby type. Host creates a Game Night session by selecting an ordered list of games with per-game settings. After each game ends, the post-game screen shows cumulative scores and a countdown to the next game. After all games complete, show an overall winner screen. Store Game Night sessions in `lobbies` with `game_type = 'game_night'` and the game playlist in `settings.playlist`.

---

## Rate Limiting

In `/middleware/rate-limit.js`, implement in-memory rate limiting (no Redis) on:
- `POST /lobby/join` and `lobby:join` socket event: max 10 attempts per IP per minute on join code guessing
- `/admin`: max 5 failed PIN attempts per IP per 15 minutes, then 15-minute lockout
- `server:game_state` emission: debounce to max 30 per second per session

---

## Bot System

`bot-runner.js` manages bot turns. After `handleAction()` resolves and `isGameOver()` returns null, if the next player `is_bot = 1`, schedule a `setTimeout` of 800–1500ms (random, feels natural), then call `getBotAction()` on the game module and feed the result back into `handleAction()`. Repeat until a human player's turn. Never run bot logic synchronously — always async with delay.

---

## Error Handling

All Socket.io event handlers wrapped in try/catch. On error, emit `server:error { code, message }` to the originating socket only. Never broadcast errors. Log all errors server-side with timestamp, event name, and player ID. Unhandled promise rejections and uncaught exceptions must log and keep the process alive — do not crash on game logic errors.

---

## Security

- Session cookies: `httpOnly: true`, `sameSite: 'strict'`, `secure: true` in production
- Admin route: PIN checked on every request, not just login
- Sync endpoint: reject requests missing valid `x-sync-key` header
- Never send another player's PIN hash, full session data, or hidden game state over any socket event
- Sanitize all user-supplied strings (display names, chat messages) — strip HTML, limit length: display name 32 chars, chat message 280 chars

---

## Environment Variables (`.env.example`)

```
PORT=3000
NODE_ENV=production
DEPLOYMENT=proxmox
DB_PATH=./gamecenter.db
SESSION_SECRET=replace_with_random_string
SYNC_ENABLED=false
SYNC_TARGET_URL=
SYNC_API_KEY=
SYNC_INTERVAL_MS=120000
HOTSPOT_MODE=false
LOBBY_IDLE_TIMEOUT_MS=1800000
DISCONNECT_HOLD_MS=120000
ADMIN_PIN=replace_with_secure_pin
LOW_POWER_IDLE_MS=600000
```

---

## Build Order

Implement in exactly this order. Do not skip ahead:

1. `package.json`, `config/default.js`, `config/schema.js`
2. `server/db.js` — schema creation, all tables
3. `server/index.js` — Express + Socket.io bootstrap, middleware, route mounting
4. `server/session-manager.js` — cookies, guest sessions, PIN auth
5. `server/lobby-manager.js` — create, join, ready, start, kick, transfer, idle cleanup
6. `server/game-runner.js` — module loader, action dispatcher, state emitter
7. `server/bot-runner.js`
8. `server/achievement-engine.js`
9. `server/sync.js`
10. `/routes/status.js`, `/routes/admin.js`, `/routes/join.js`
11. `/middleware/rate-limit.js`, `/middleware/auth.js`
12. `/games/blackjack/` — simplest game first, validate the module interface works end to end
13. `/games/poker/`
14. `/games/bs/`
15. `/games/global/achievements.js`
16. `client/style.css` — tokens, light + dark mode, base layout
17. `client/app.js` — socket connection, view router
18. `client/views/` — all views
19. `client/renderers/` — all game renderers
20. `client/components/` — chat, timer, toasts, badges
21. First-run wizard
22. Game Night mode
23. `README.md` — setup instructions for both Proxmox and Pi deployments

---

## Definition of Done

The project is complete when:

- All three games are playable end to end with human players and bots
- Lobby system fully works including join codes, invite URLs, ready-up, host transfer, disconnect/rejoin
- Stats and achievements record correctly and display on profiles and leaderboards
- Sync system successfully pushes Pi records to Proxmox when internet is available
- Admin panel accessible and functional
- Light and dark mode work across all views and all game renderers
- First-run wizard completes and blocks on subsequent starts
- `/health` and `/status` return correct data
- Rate limiting rejects excess join code attempts
- No hardcoded values outside `config/default.js`
- No frontend framework dependencies
- All game modules conform exactly to the defined interface

Begin with step 1. Ask no clarifying questions. Build the entire project.
