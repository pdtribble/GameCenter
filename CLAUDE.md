# CLAUDE.md — GameCenter Developer Reference

Quick-reference for AI assistants. Read the full README.md for a deeper explanation of any section. **Do not recreate the achievement engine — it was intentionally removed.**

---

## Project Overview

GameCenter is a self-hosted game platform with two subsystems:

- **Multiplayer** (3 games: Blackjack, BS, Poker) — socket-based, game modules in `/games`, rendered by `game.js` shell + per-game renderer
- **Singleplayer** (13 games) — REST + localStorage, pure-logic modules in `/games`, rendered directly in browser by per-game renderer

**Tech stack:** Node.js + Express + Socket.io + SQLite (better-sqlite3) + Vanilla JS SPA (ES modules, no framework)

---

## Project Structure

```
/server
  index.js              — Express + Socket.io wiring. ALL socket events registered here.
  db.js                 — SQLite schema + migrations + seedGames. Run on every start.
  game-runner.js        — MP session lifecycle, intermission, bot fill, state emit (30/sec cap)
  bot-runner.js         — Bot turn scheduling via getValidActions() (800-1500ms delay)
  lobby-manager.js      — Lobby create/join/start/kick. In-memory Maps for timers.
  session-manager.js    — gc_session cookie auth. Guest 1-day, registered 30-day. sameSite:'lax'.
  sync.js               — Pi → Proxmox game-result sync via sync_queue table
  middleware/
    auth.js             — requireAdmin(socket,data,cb) + requireSession(req,res,next)
    rate-limit.js       — joinLimiter (10/60s), adminLimiter (5fail/15min), checkJoinRateSocket
  routes/
    status.js           — GET /health, /status, /api/games, /api/lobbies, /api/me/stats
    singleplayer.js     — GET/POST/DELETE /api/sp/saves/:gameType, GET /api/sp/stats/:gameType
    chips.js            — GET/POST /api/chips, POST /api/chips/bet, /api/chips/reset, PATCH /api/me/card-theme
    player.js           — PATCH /api/me
    auth.js             — POST /api/auth/login, /api/auth/logout
    admin.js            — Admin panel routes
    join.js             — GET /join/:code → redirect to /?join=CODE

/games
  blackjack/index.js    — MP Blackjack (CommonJS module.exports)
  poker/index.js        — MP Texas Hold'em (CommonJS)
  bs/index.js           — MP Bull$hit card game (CommonJS)
  minesweeper/index.js  — SP Minesweeper logic: classic + endless mode (CommonJS)
  snake/index.js        — SP Snake logic (CommonJS — has dual export bug, see Known Issues)
  2048/index.js         — SP 2048 logic (CommonJS)
  wordle/index.js       — SP Wordle logic (ES6 export — browser only, not Node-safe)
  sudoku/index.js       — SP Sudoku logic (CommonJS) — notes field uses Set, not JSON-safe
  pacman/index.js       — SP Pac-Man logic (ES6 export — browser only)
  tetris/index.js       — SP Tetris logic (ES6 export — browser only)
  pong/index.js         — SP Pong logic (CommonJS)
  breakout/index.js     — SP Breakout logic (CommonJS)
  spaceInvaders/index.js — SP Space Invaders (CommonJS)
  asteroids/index.js    — SP Asteroids (CommonJS, uses Math.random — not seeded)
  idleClicker/index.js  — SP Idle Clicker (ES6 export — browser only)
  treasure-tower/index.js — SP Treasure Tower (CommonJS)

/client
  index.html            — App shell. Loads Phaser 3.60 from CDN. Google Fonts (Anybody + DM Mono). 3-tab bottom nav.
  app.js                — Socket lifecycle, view router, applyScale(), isPortrait()
  style.css             — Two design systems: --color-* (game/lobby/postgame) + --gc-* (home/profile)
  sw.js                 — Service worker: caches shell, bypasses /api/ and /socket.io/
  manifest.json         — PWA manifest (fullscreen, any orientation)
  views/
    home.js             — MP lobby browser (mp-game-card grid, lobby panel, create/join modals)
    singleplayer.js     — SP hub (game card grid, stat strip, score listener)
    lobby.js            — Pre-game waiting room (ready/unready, chat, start)
    game.js             — In-game shell: lazy-loads renderer, handles intermission overlay
    postgame.js         — Results screen
    profile.js          — Player stats + settings (gc-* tokens)
    admin.js            — Admin panel view
    {gameType}.js       — Thin wrapper: creates container, calls renderer render/update/destroy
  renderers/
    blackjack.js        — MP Blackjack renderer (DOM-heavy)
    bs.js               — MP BS renderer
    poker.js            — MP Poker renderer
    minesweeper.js      — SP Minesweeper (DOM grid, classic + endless modes)
    snake.js            — SP Snake (Canvas 2D)
    2048.js             — SP 2048 (Canvas 2D with tile animations)
    wordle.js           — SP Wordle (DOM keyboard)
    sudoku.js           — SP Sudoku (DOM grid + numpad)
    pacman.js           — SP Pac-Man (Canvas 2D, pixel art, ~20px cells)
    tetris.js           — SP Tetris (Canvas 2D, hold/next panels, ghost piece)
    pongRenderer.js     — SP Pong (Canvas 800×500, AI opponent)
    breakoutRenderer.js — SP Breakout (Canvas, powerups)
    asteroidsRenderer.js — SP Asteroids (Canvas, vector-style)
    spaceInvadersRenderer.js — SP Space Invaders (Canvas, Web Audio)
    idleClickerRenderer.js — SP Idle Clicker (DOM + CSS)
    treasure-tower.js   — SP Treasure Tower (DOM, door grid + multiplier)
  components/
    chat.js             — ChatComponent class: channel='lobby'|'game', channelId=lobbyId|sessionId
    timer.js            — TimerComponent: update({remainingMs,playerId,totalMs}), red at <25%
    achievement-toast.js — Floating toast notification
    spectator-badge.js  — Eye icon for spectator players
    ready-indicator.js  — Ready state dot per player
    auth-modal.js       — Admin PIN / player auth dialog
    chip-reset-modal.js — Chip reset confirmation dialog

/config
  default.js            — All env vars with defaults
  schema.js             — Config validation (fatal on startup if invalid)
```

---

## Scale Layout System

`#app-root` is fixed-dimension, scaled to fit any screen via `transform: scale()`:

```js
// app.js — applyScale()
LANDSCAPE: 1280×720   (body.layout-web)
PORTRAIT:  414×896    (body.layout-phone, triggers when width < 600 or width < height)

scale = Math.min(window.innerWidth / baseW, window.innerHeight / baseH)
```

- `isPortrait()` exported from `app.js` — use it in renderers
- `body.layout-phone` / `body.layout-web` toggled on every resize
- No media queries needed — cascade from these classes
- Game renderers MUST handle both layouts

---

## Two Design Systems

**Do not mix them.**

### `--color-*` tokens — game renderers, lobby waiting room, postgame
```css
--color-bg-primary      --color-bg-secondary    --color-bg-card
--color-text-primary    --color-text-secondary
--color-accent          --color-accent-hover
--color-border          --color-success         --color-danger
```

### `--gc-*` tokens — home view, singleplayer hub, profile
```css
--gc-bg: #0a0a0f        --gc-surface: #12121a   --gc-surface2: #1a1a26
--gc-border: rgba(255,255,255,0.06)
--gc-gold: #f0c040      --gc-gold2: #e8a020
--gc-green: #30d890     --gc-red: #ff4560
--gc-blue: #4090ff      --gc-purple: #9060ff
--gc-text: #f0f0f8      --gc-muted: rgba(240,240,248,0.4)
--gc-font: 'Anybody'    --gc-mono: 'DM Mono'
```

### gc-* component classes
`.gc-home`, `.gc-lobby-card`, `.gc-card-badge`, `.gc-card-join-btn (.watch)`, `.gc-pill (.active)`,
`.gc-stats-strip`, `.gc-stat-cell`, `.gc-stat-val`, `.gc-stat-key`, `.gc-section-label`, `.gc-live-dot`,
`.gc-modal-backdrop`, `.gc-modal`, `.gc-modal-handle`, `.gc-input`, `.gc-select`, `.gc-label`,
`.gc-btn-gold`, `.gc-btn-ghost`, `.gc-error-msg`, `.gc-empty`

---

## Database Tables (Quick Reference)

| Table | Key Columns | Notes |
|---|---|---|
| `players` | id, username, display_name, pin_hash, is_guest, chips | chips default 1000 |
| `game_registry` | game_type PK, label, min_players, max_players | MP games only |
| `lobbies` | id, join_code (4-char), game_type, host_player_id, status, settings (JSON) | |
| `lobby_players` | lobby_id, player_id, role ('player'\|'spectator'), ready | |
| `game_sessions` | id, lobby_id, game_type, started_at, ended_at | |
| `game_results` | session_id, player_id, placement, score, chip_delta | humans only, no bots |
| `sp_game_saves` | PK=(player_id, game_type), state (JSON) | |
| `sp_game_history` | player_id, game_type, score, metadata (JSON), played_at | |
| `mp_game_stats` | PK=(player_id, game_type), wins, games_played | |
| `chip_transactions` | player_id, amount, reason, created_at | append-only ledger |
| `server_config` | key, value | setup_complete, server_name, admin_pin |
| `sync_queue` | — | Pi → Proxmox pending records |

---

## HTTP API Quick Reference

```
GET  /api/me/stats               — { loggedIn, playerId, displayName, chips, wins, gamesPlayed, onlineCount }
GET  /api/games                  — MP game list with metadata
GET  /api/lobbies                — Open lobbies
GET  /join/:code                 — Redirect to /?join=CODE

GET  /api/sp/saves/:gameType     — Load SP save (requires session)
POST /api/sp/saves/:gameType     — Save SP state { state } (requires session)
DEL  /api/sp/saves/:gameType     — Delete SP save

GET  /api/chips                  — Chip balance
POST /api/chips/bet              — Deduct { amount } (Treasure Tower)
POST /api/chips                  — Award { amount } (Treasure Tower)
POST /api/chips/reset            — Reset to 1000 (24h cooldown, only at 0)
PATCH /api/me/card-theme         — Set card theme { theme }
GET  /api/card-themes            — List themes (hardcoded: classic/minimal/neon/stained-glass/dark-casino/art-deco)

GET  /health                     — Health check
GET  /status                     — Status + session count
```

---

## Socket Events Quick Reference

### Client → Server (all require valid gc_session socket)
```
lobby:create   { gameType, playerName, pin, settings }
lobby:join     { joinCode, playerName, pin, asSpectator }
lobby:leave    { lobbyId }
lobby:ready    { lobbyId }
lobby:unready  { lobbyId }
lobby:start    { lobbyId }
lobby:kick     { lobbyId, targetPlayerId }
lobby:transfer_host { lobbyId, targetPlayerId }
lobby:settings { lobbyId, settings }
lobby:chat     { lobbyId, message }

game:action    { sessionId, action }
game:ready     { sessionId }
game:sit_out   { sessionId }
game:sit_in    { sessionId }
game:chat      { sessionId, message }

player:update  { displayName?, avatarEmoji?, avatarColor? }
client:rejoin_check  (no payload) — emitted on every connect
spectator:join { lobbyId }

admin:broadcast    { adminPin, message }
admin:kick_player  { adminPin, playerId }
admin:end_session  { adminPin, sessionId }
```

### Server → Client
```
server:lobby_joined   { lobby, players, myPlayerId }
server:lobby_updated  { lobby, players }
server:game_started   { sessionId, state, joinCode, hostPlayerId }
server:game_state     { state }   — debounced, max 30/sec
server:game_over      { results, postGameSummary }
server:lobby_chat     { playerId, displayName, message, timestamp }
server:game_chat      { playerId, displayName, message, timestamp, isSpectator }
server:announcement   { message }
server:error          { code, message }
```

---

## Multiplayer Game Module Interface

Every MP game: `games/<gameType>/index.js`, CommonJS `module.exports`.

```js
module.exports = {
  name, description, icon, minPlayers, maxPlayers,
  botFillAllowed, botFillMin, version,

  getSetupConfig(),          // → FieldDefinition[]
  initGame(players, config), // → GameState
  startNextRound(state, activePlayers), // → GameState

  handleAction(state, playerId, action),  // → { state, error? }
  getValidActions(state, playerId),        // → String[]
  isTurnValid(state, playerId, action),    // → Boolean

  isRoundOver(state),  // → Boolean
  isGameOver(state),   // → Boolean

  getBotAction(state, botId),              // → { type, ...payload }
  getPublicState(state, playerId),         // → new GameState (never mutate original)
  getRoundSummary(state),
  // → { winner?, winnerName?, scores: Object, round: Number }
};
```

**FieldDefinition:** `{ key, type:'number'|'select'|'boolean', label, default, min?, max?, step?, options? }`

**PlayerObject:** `{ id, display_name, displayName, is_bot: 0|1, role: 'player'|'spectator' }`

**Engine-augmented state (emitted to clients):**
```js
{ ...getPublicState(state, playerId), gameType, enginePhase,
  readyPlayers, sittingOut,
  roundSummary: enginePhase==='intermission' ? getRoundSummary(state) : null }
```

---

## MP Engine Round Lifecycle

```
startGame → bot fill → module.initGame → enginePhase='playing' → emit server:game_started

game:action → isTurnValid → handleAction → isGameOver? → finishGame
                                                        → isRoundOver? → enterIntermission
                                                        → scheduleIfBot

enterIntermission → enginePhase='intermission' → bots auto-ready (200-1200ms)
                 → 30s AFK timer → sit out non-ready → advanceRound

game:ready → readySet.add → all non-sitting-out ready? → advanceRound

advanceRound → startNextRound(state, activePlayers) → enginePhase='playing' → readySet.clear

finishGame → settle chips (blackjack/poker only) → write game_results (humans only)
           → emit server:game_over → cleanup session
```

**Sitting out:** Mid-round joiners auto-added to sittingOut. AFK at intermission → sittingOut after 30s.

**Bot fill:** In-memory only, never persisted. `bot-N` ids are ephemeral.

---

## Renderer Interface

```js
// client/renderers/<gameType>.js
export function render(container, state, socket, playerId, hostPlayerId) {}
export function update(state, playerId, hostPlayerId) {}
export function destroy() {}
```

- `game.js` handles intermission overlay (Ready/Sit Out) — do not duplicate in renderer
- Check `document.body.classList.contains('layout-phone')` for portrait
- Portrait canvas: ~390px wide. Landscape canvas: ~760px wide.

---

## Adding a Multiplayer Game

1. `games/<gameType>/index.js` — implement full MP interface (CommonJS)
2. `server/db.js` — add `seedGames.run('<gameType>', 'Label', min, max)` in seedGames block
3. `client/views/home.js` — add `'<gameType>': '#hexcolor'` to `GAME_ACCENTS`
4. `client/renderers/<gameType>.js` — export `render`, `update`, `destroy`
5. Test bot fill: `botFillAllowed: true`, `botFillMin: 2`, create solo lobby

---

## Adding a Singleplayer Game

1. `games/<gameType>/index.js` — pure logic, CommonJS, JSON-serializable state
2. `client/renderers/<gameType>.js` — export `render`, `update`, `destroy`
3. `client/views/<gameType>.js` — thin wrapper (see any existing SP view for pattern)
4. `client/app.js` — import view, add to views map, add to `FULLSCREEN_VIEWS` set
5. `client/views/singleplayer.js` — add game card entry to the game list array
6. `server/routes/singleplayer.js` — add `'<gameType>'` to allowed game types list

---

## Chip Economy

| Action | Mechanism |
|---|---|
| Starting chips | 1000, set in `players.chips` default |
| MP buy-in deduct | `lobby-manager.js` on `lobby:join` |
| MP win award | `game-runner.js → finishGame()` (blackjack/poker only) |
| SP Treasure Tower | REST: `POST /api/chips/bet` deduct, `POST /api/chips` award |
| Reset | `POST /api/chips/reset` — 24h cooldown, only when chips === 0 |

---

## Session / Auth

- Cookie name: `gc_session` (player UUID)
- Guest: created on first HTTP GET `/` or `/index.html`, 1-day cookie
- Registered: login via `POST /api/auth/login`, 30-day cookie
- `session-manager.js` handles both SHA-256 and bcrypt PIN hashes
- Admin: PIN checked against `server_config.admin_pin` in DB, falls back to `config.ADMIN_PIN` env var

---

## Known Issues

1. **[CRITICAL] Spectators charged buy-in** — `lobby-manager.js`: `role` variable used before it's defined. Fix: move role assignment above the chip deduction check.
2. **`game-night.js` is dead code** — never imported in `server/index.js`. Delete or wire it.
3. **`reload_chips` in Blackjack has no server auth** — any player can grant themselves 500 chips mid-game.
4. **Sudoku notes not JSON-serializable** — `state.notes` is `Set[]`. Save/load silently drops all pencil marks. Fix: serialize as `Array[]`.
5. **`/api/me/stats` only shows Minesweeper SP stats** — 12 other SP games return no server-side history.
6. **Inconsistent module syntax** — wordle, pacman, tetris, idle-clicker use ES6 `export` (browser only). Others use CommonJS. Cannot `require()` the ES6 modules server-side.
7. **Asteroids uses `Math.random()`** — not seeded, runs are not reproducible.
8. **Several canvas renderers lack portrait layout** — pong, breakout, tetris don't check `isPortrait()`.
9. **Breakout wide/slow powerups not applied** — visual only; `handlePowerup` only applies extra-life.
10. **Card themes hardcoded** — `/api/card-themes` returns a static array, not auto-discovered from filesystem.

---

## Important Constraints

- **No achievement engine** — it was removed. Do not recreate it.
- **No rematch system** — games loop continuously. Players click Ready for next round.
- **No chipless mode** — chips are always on. If a game doesn't use chips, don't include a buy-in field in `getSetupConfig()`.
- **Bots are ephemeral** — never write bot IDs to the database.
- **Engine owns intermission** — modules only signal `isRoundOver()`. Do not implement ready-handling in modules.
- **Two design systems coexist** — `--color-*` for game views, `--gc-*` for home/profile. Do not mix.
- **Scale layout, not media queries** — `body.layout-phone/layout-web` drives all layout decisions.
- **Cloudflare Tunnel over port forwarding** — do not suggest port forwarding for deployment.
