# GameCenter

A self-hosted multiplayer and singleplayer game platform. Runs on a Proxmox VM (public, via Cloudflare Tunnel) and a Raspberry Pi 4 (local hotspot). No internet required for local play. Install to home screen on iOS or Android as a full-screen PWA — no app store required.

**Tech stack:** Node.js · Express · Socket.io · SQLite (better-sqlite3) · Vanilla JS SPA (no framework)

---

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment config
cp .env.example .env

# Start the server
npm start
```

Open `http://localhost:3000`. The first-run setup wizard runs automatically and creates the admin PIN + optional first registered user.

---

## Configuration

All configuration is via environment variables (see `.env.example`):

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `NODE_ENV` | `development` | `production` enables secure cookies |
| `DEPLOYMENT` | `local` | `proxmox` or `pi` — logged on startup |
| `SESSION_SECRET` | `change-me` | Cookie signing secret |
| `ADMIN_PIN` | *(none)* | Override admin PIN (set via setup wizard instead) |
| `SYNC_ENABLED` | `false` | Enable Pi → Proxmox game-result sync |
| `SYNC_TARGET_URL` | *(none)* | Proxmox server URL for sync pushes |
| `SYNC_SECRET` | *(none)* | Shared secret for sync authentication |
| `DB_PATH` | `./data/gamecenter.db` | SQLite database file path |

---

## Architecture

```
GameCenter
├── /server                  — Node.js Express + Socket.io backend
│   ├── index.js             — App entry point, all socket event wiring
│   ├── db.js                — SQLite schema, migrations, DB singleton
│   ├── game-runner.js       — MP session lifecycle, intermission, bot fill, state emission
│   ├── bot-runner.js        — Bot turn scheduling (uses getValidActions)
│   ├── lobby-manager.js     — Lobby create/join/start/kick lifecycle
│   ├── session-manager.js   — Cookie-based player sessions
│   ├── sync.js              — Pi → Proxmox result sync
│   ├── middleware/
│   │   ├── auth.js          — Admin PIN + session validation
│   │   └── rate-limit.js    — Join (10/60s) and admin (5 fail/15min) rate limits
│   └── routes/
│       ├── auth.js          — Login/register/logout
│       ├── status.js        — /api/games, /api/lobbies, /api/me/stats, /health
│       ├── singleplayer.js  — /api/sp/saves/:game, /api/sp/stats/:game
│       ├── chips.js         — /api/chips, /api/chips/bet, /api/chips/reset, card theme
│       ├── player.js        — /api/me (player profile update)
│       ├── admin.js         — Admin panel routes
│       └── join.js          — GET /join/:code redirect
│
├── /games                   — Game logic modules (pure functions, no side effects)
│   ├── blackjack/           — Blackjack (multiplayer)
│   ├── poker/               — Texas Hold'em Poker (multiplayer)
│   ├── bs/                  — Bull$hit card game (multiplayer)
│   ├── minesweeper/         — Classic + Endless minesweeper (singleplayer)
│   ├── snake/               — Classic snake (singleplayer)
│   ├── 2048/                — 2048 tile game (singleplayer)
│   ├── wordle/              — Daily word game (singleplayer)
│   ├── sudoku/              — Seeded daily Sudoku (singleplayer)
│   ├── pacman/              — Pac-Man with ghost AI (singleplayer)
│   ├── tetris/              — Tetris with hold/ghost piece (singleplayer)
│   ├── pong/                — Pong vs AI (singleplayer)
│   ├── breakout/            — Breakout with powerups (singleplayer)
│   ├── asteroids/           — Asteroids with wave progression (singleplayer)
│   ├── spaceInvaders/       — Space Invaders (singleplayer)
│   ├── idleClicker/         — Idle clicker with upgrades (singleplayer)
│   └── treasure-tower/      — Risk/reward tower climb with chip economy (singleplayer)
│
├── /client                  — Vanilla JS SPA (ES modules)
│   ├── index.html           — App shell, Phaser 3.60 CDN, Google Fonts
│   ├── app.js               — Socket lifecycle, view router, scale layout system
│   ├── style.css            — Design system (--color-* legacy + --gc-* tokens)
│   ├── sw.js                — Service worker (shell cache, bypasses /api/ and /socket.io/)
│   ├── manifest.json        — PWA manifest
│   ├── views/               — One JS file per view/screen
│   ├── renderers/           — One JS file per game renderer
│   └── components/          — Reusable UI (chat, timer, modals, etc.)
│
└── /config
    ├── default.js           — Config values with env var parsing
    └── schema.js            — Config validation (runs at startup)
```

---

## HTTP API

All endpoints return JSON unless noted. Authentication uses the `gc_session` cookie.

### Player & Session

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/me/stats` | guest ok | Current player info + win/game counts. Returns `{ loggedIn, playerId, displayName, avatarEmoji, wins, gamesPlayed, onlineCount }` |
| `POST` | `/api/auth/login` | — | Login or register `{ username, pin, displayName }`. Sets `gc_session` cookie |
| `POST` | `/api/auth/logout` | — | Clears `gc_session` cookie |
| `PATCH` | `/api/me` | session | Update display name / avatar |

### Games & Lobbies

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/games` | guest ok | List registered MP game modules: `gameType`, `label`, `description`, `icon`, `minPlayers`, `maxPlayers`, `botFillAllowed`, `botFillMin`, `config[]` |
| `GET` | `/api/lobbies` | guest ok | List open lobbies: `id`, `joinCode`, `gameType`, `gameLabel`, `hostName`, `playerCount`, `maxPlayers` |
| `GET` | `/join/:code` | — | Redirect to `/?join=CODE` (shareable lobby link) |
| `GET` | `/health` | — | Server health check |
| `GET` | `/status` | — | Server status + active session count |

### Singleplayer

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/sp/saves/:gameType` | session | Load saved SP game state |
| `POST` | `/api/sp/saves/:gameType` | session | Save SP game state `{ state }` |
| `DELETE` | `/api/sp/saves/:gameType` | session | Delete save |
| `GET` | `/api/sp/stats/:gameType` | session | SP stats for a specific game |

### Chips

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/chips` | session | Current chip balance |
| `POST` | `/api/chips/bet` | session | Deduct chips `{ amount }` — used by Treasure Tower |
| `POST` | `/api/chips` | session | Award chips `{ amount }` — used by Treasure Tower |
| `POST` | `/api/chips/reset` | session | Reset to 1000 chips — 24h cooldown, only when balance is 0 |
| `PATCH` | `/api/me/card-theme` | session | Set preferred card theme `{ theme }` |
| `GET` | `/api/card-themes` | guest ok | List available card themes |

---

## Socket Events

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `lobby:create` | `{ gameType, playerName, pin, settings }` | Create a new lobby |
| `lobby:join` | `{ joinCode, playerName, pin, asSpectator }` | Join existing lobby |
| `lobby:leave` | `{ lobbyId }` | Leave a lobby |
| `lobby:ready` | `{ lobbyId }` | Mark ready in waiting room |
| `lobby:unready` | `{ lobbyId }` | Unmark ready |
| `lobby:start` | `{ lobbyId }` | Host starts the game |
| `lobby:kick` | `{ lobbyId, targetPlayerId }` | Host kicks a player |
| `lobby:transfer_host` | `{ lobbyId, targetPlayerId }` | Transfer host role |
| `lobby:settings` | `{ lobbyId, settings }` | Update lobby settings |
| `lobby:chat` | `{ lobbyId, message }` | Send lobby chat message |
| `game:action` | `{ sessionId, action }` | Submit a game action |
| `game:ready` | `{ sessionId }` | Ready for next round (intermission) |
| `game:sit_out` | `{ sessionId }` | Sit out next round |
| `game:sit_in` | `{ sessionId }` | Rejoin from sitting out |
| `game:chat` | `{ sessionId, message }` | Send in-game chat |
| `player:update` | `{ displayName?, avatarEmoji?, avatarColor? }` | Update player profile live |
| `client:rejoin_check` | — | Re-attach to active session on reconnect |
| `spectator:join` | `{ lobbyId }` | Join as spectator |
| `admin:broadcast` | `{ adminPin, message }` | Server-wide announcement |
| `admin:kick_player` | `{ adminPin, playerId }` | Admin kick a player |
| `admin:end_session` | `{ adminPin, sessionId }` | Force-end a game session |

### Server → Client

| Event | Payload | Description |
|---|---|---|
| `server:lobby_joined` | `{ lobby, players, myPlayerId }` | Joined lobby successfully |
| `server:lobby_updated` | `{ lobby, players }` | Lobby state changed |
| `server:game_started` | `{ sessionId, state, joinCode, hostPlayerId }` | Game began |
| `server:game_state` | `{ state }` | Updated game state (debounced, max 30/sec) |
| `server:game_over` | `{ results, postGameSummary }` | Game ended |
| `server:lobby_chat` | `{ playerId, displayName, message, timestamp }` | Lobby chat message |
| `server:game_chat` | `{ playerId, displayName, message, timestamp, isSpectator }` | In-game chat |
| `server:announcement` | `{ message }` | Server-wide announcement |
| `server:error` | `{ code, message }` | Error response |

---

## Database Schema

### `players`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `username` | TEXT UNIQUE | lowercase, max 32 chars |
| `display_name` | TEXT | max 32 chars |
| `pin_hash` | TEXT | SHA-256 of PIN (null = no PIN) |
| `is_guest` | INTEGER | 1 for auto-created guests |
| `chips` | INTEGER | Default 1000 |
| `last_chip_reset` | TEXT | ISO timestamp |
| `avatar_emoji` | TEXT | |
| `avatar_color` | TEXT | Hex color |
| `preferred_card_theme` | TEXT | Theme ID |
| `last_seen` | TEXT | ISO timestamp |
| `created_at` | TEXT | ISO timestamp |

### `game_registry`
Only MP games are registered here. SP games are not in this table.

| Column | Type |
|---|---|
| `game_type` | TEXT PK |
| `label` | TEXT |
| `min_players` | INTEGER |
| `max_players` | INTEGER |

### `lobbies` / `lobby_players`
Standard join table. `lobby_players.role` is `'player'` or `'spectator'`.

### `game_sessions` / `game_results`
`game_results` is written only for human players (bots excluded). `chip_delta` records chips won/lost per session.

### `sp_game_saves`
PK is `(player_id, game_type)`. State stored as JSON blob.

### `sp_game_history`
One row per completed SP session. Includes score and game-specific metadata JSON.

### `mp_game_stats`
PK is `(player_id, game_type)`. Tracks cumulative wins and games played.

### `chip_transactions`
Append-only ledger of all chip credits/debits.

### `server_config`
Key-value store. Keys: `setup_complete`, `server_name`, `admin_pin`.

### `sync_queue`
Pi → Proxmox pending sync records. Managed by `server/sync.js`.

---

## Multiplayer Game Module Interface

Every MP game lives at `games/<gameType>/index.js` (CommonJS `module.exports`):

```js
module.exports = {
  // Metadata
  name: String,
  description: String,
  icon: String,           // Single emoji
  minPlayers: Number,
  maxPlayers: Number,
  botFillAllowed: Boolean,
  botFillMin: Number,
  version: String,        // semver

  getSetupConfig(),       // → FieldDefinition[]

  initGame(players, config),         // → GameState
  startNextRound(state, activePlayers), // → GameState

  handleAction(state, playerId, action),   // → { state, error? }
  getValidActions(state, playerId),         // → String[]
  isTurnValid(state, playerId, action),     // → Boolean

  isRoundOver(state),   // → Boolean
  isGameOver(state),    // → Boolean

  getBotAction(state, botId),    // → { type, ...payload }

  getPublicState(state, playerId),  // → GameState (new object)
  getRoundSummary(state),
  // → { winner?, winnerName?, scores: Object, round: Number, ...any }
};
```

**FieldDefinition:**
```js
{ key, type: 'number'|'select'|'boolean', label, default,
  min?, max?, step?,      // number only
  options?: String[] }    // select only
```

**PlayerObject:**
```js
{ id, display_name, displayName, is_bot: 0|1, role: 'player'|'spectator' }
```

**Enhanced client state** (engine wraps getPublicState output):
```js
{ ...publicState, gameType, enginePhase, readyPlayers, sittingOut,
  roundSummary: enginePhase==='intermission' ? getRoundSummary(state) : null }
```

---

## Singleplayer Game Modules

SP modules at `games/<gameType>/index.js` are **pure function libraries** — no DOM, no timers, no side effects. They are served as static files and imported by the browser renderer. There is no fixed interface — each module exports what its renderer needs.

Common exports: `initGame`, `tick`, `handleInput`, `serializeState`, `deserializeState`.

SP saves: `POST /api/sp/saves/:gameType` (server-side, requires session) + localStorage fallback.

---

## Client Renderer Interface

```js
// client/renderers/<gameType>.js
export function render(container, state, socket, playerId, hostPlayerId) {}
// Initial render — called once when game view loads.

export function update(state, playerId, hostPlayerId) {}
// Called on every state update.
// For MP games: check state.enginePhase ('playing' | 'intermission').
// Intermission overlay (Ready/Sit Out) is handled by game.js — do not duplicate.

export function destroy() {}
// Cleanup: remove listeners, cancel animation frames, clear timers.
```

Check `document.body.classList.contains('layout-phone')` for portrait layout. Both portrait (414×896) and landscape (1280×720) must be handled.

---

## Chip Economy

- Players start with **1000 chips**.
- Multiplayer buy-in is deducted on lobby join (Blackjack, Poker).
- Winnings are settled in `game-runner.js → finishGame()`.
- Treasure Tower uses REST: `POST /api/chips/bet` to bet, `POST /api/chips` to collect winnings.
- At 0 chips: `POST /api/chips/reset` resets to 1000 (24h cooldown).
- Bots never have or use chips.

---

## Bot System

Bots are in-memory only — never persisted:
```js
{ id: `bot-${uuid}`, display_name: `Bot N`, displayName: `Bot N`, is_bot: 1, role: 'player' }
```

`bot-runner.js` schedules turns at 800–1500ms after each state change. At intermission, bots auto-ready in 200–1200ms.

---

## Pi ↔ Proxmox Sync

Set `SYNC_ENABLED=true` on the Pi. After each completed game, results are written to `sync_queue` then pushed to `SYNC_TARGET_URL/api/sync` with `Authorization: Bearer SYNC_SECRET`. Failed pushes retry on the next cycle.

---

## Adding a New Multiplayer Game

1. Create `games/<gameType>/index.js` — implement the full MP interface above.
2. Add to `seedGames` in `server/db.js`.
3. Add an accent color to `GAME_ACCENTS` in `client/views/home.js`.
4. Create `client/renderers/<gameType>.js` — export `render`, `update`, `destroy`.
5. Test with bots (set `botFillAllowed: true`, `botFillMin: 2`).
6. Test mid-round join and intermission cycle.

## Adding a New Singleplayer Game

1. Create `games/<gameType>/index.js` — pure logic, CommonJS exports, JSON-serializable state.
2. Create `client/renderers/<gameType>.js` — export `render`, `update`, `destroy`.
3. Create `client/views/<gameType>.js` — thin wrapper following existing SP view pattern.
4. Register the view in `client/app.js` (import + add to views map + FULLSCREEN_VIEWS set).
5. Add a card to `client/views/singleplayer.js` game list.
6. Confirm `'<gameType>'` is in the allowed list in `server/routes/singleplayer.js`.

---

## Deployment

### Local (Raspberry Pi)
```bash
NODE_ENV=production DEPLOYMENT=pi npm start
```

### Public (Proxmox + Cloudflare Tunnel)
```bash
NODE_ENV=production DEPLOYMENT=proxmox npm start
# Cloudflare Tunnel handles HTTPS automatically — no port forwarding needed
```

### Process Management
```bash
pm2 start server/index.js --name gamecenter
pm2 save && pm2 startup
```
