# CLAUDE.md — GameCenter Developer Reference

This file contains everything needed to understand the codebase and add new games. Read this before touching any engine code.

---

## Project Overview

GameCenter is a self-hosted multiplayer card and table game platform. The engine knows nothing about individual games — all game logic lives in pluggable game modules. The server runs identically on a Proxmox VM (public internet via Cloudflare Tunnel) and a Raspberry Pi 4 (local hotspot, no internet required).

**Tech stack:** Node.js + Express + Socket.io + SQLite (better-sqlite3) + Vanilla JS SPA (no frontend framework)

---

## Project Structure

```
/server
  index.js              — Express app, Socket.io setup, all socket event wiring
  db.js                 — SQLite schema, migrations, DB singleton
  game-runner.js        — Core engine: session lifecycle, intermission, bot fill, state emission
  bot-runner.js         — Schedules bot turns using getValidActions() (supports simultaneous + sequential games)
  lobby-manager.js      — Lobby create/join/start/kick logic
  session-manager.js    — Cookie-based player sessions (cookie name: gc_session)
  achievement-engine.js — REMOVED. Do not recreate.
  sync.js               — Pi → Proxmox sync system
  auth.js               — Middleware: rate limiting, admin PIN
  routes/
    status.js           — GET /health, /status, /api/games, /api/lobbies, /api/me/stats
    admin.js            — Admin panel routes
    join.js             — GET /join/:code redirect

/games
  highest-card/
    index.js            — Minimal test game module (proves interface end-to-end)
  <your-game>/
    index.js            — Your game module (see interface spec below)

/client
  index.html            — App shell, PWA meta tags, Google Fonts (Anybody + DM Mono), SW registration
  app.js                — Socket lifecycle, view router, scale layout system, body.layout-* toggling
  sw.js                 — Service worker (shell caching, bypasses /api/ and /socket.io/)
  manifest.json         — PWA manifest (display: fullscreen, orientation: any)
  style.css             — Full design system: legacy --color-* tokens + gc-* lobby design system
  views/
    home.js             — Lobby browser: phone/web dual layout, lobby cards, create/join modals
    lobby.js            — Pre-game waiting room (bot fill info, ready/unready, start)
    game.js             — In-game shell, loads renderer by gameType, intermission overlay
    postgame.js         — Results screen (scores from getRoundSummary)
    profile.js          — Player profile (uses gc-* design tokens)
  renderers/
    highest-card.js     — Renderer for the test game
    <game-type>.js      — Your game renderer (see renderer spec below)
  components/
    chat.js             — Chat widget (used in lobby + game views)
    timer.js            — Countdown timer component
    spectator-badge.js  — Spectator indicator
    ready-indicator.js  — Ready state dot

/config
  default.js            — Config defaults and env var parsing
  schema.js             — Config validation

/games/highest-card/index.js   — Reference implementation of the full game module interface
```

---

## Game Module Interface

Every game lives at `games/<gameType>/index.js` and must export the following. The engine calls these functions — the module never calls the engine.

```js
module.exports = {

  // ── Metadata (static, read at server start) ──────────────────────────────

  name: String,           // Display name e.g. "Texas Hold'em"
  description: String,    // Short description shown in lobby browser
  icon: String,           // Single emoji representing the game e.g. "♠️"
  minPlayers: Number,     // Minimum human players required to start
  maxPlayers: Number,     // Maximum total seats (humans + bots)
  botFillAllowed: Boolean,// If true, engine adds bots when under minPlayers
  botFillMin: Number,     // Target player count when bot filling
  version: String,        // Semver string e.g. "1.0.0"

  // ── Setup ────────────────────────────────────────────────────────────────

  getSetupConfig(),
  // Returns an array of field definitions shown in the Create Lobby modal.
  // Return [] if the game has no configurable settings.
  // → FieldDefinition[]

  // ── Lifecycle ────────────────────────────────────────────────────────────

  initGame(players, config),
  // Called once when the game starts. Players are already bot-filled by engine.
  // players: PlayerObject[]  (see PlayerObject spec below)
  // config:  Object          (values from getSetupConfig fields)
  // → GameState              (any serializable object — the engine stores it opaquely)

  startNextRound(state, activePlayers),
  // Called by engine when all non-sitting-out players are ready for next round.
  // activePlayers excludes sitting-out players.
  // → GameState              (new state for the next round)

  // ── Per-turn ─────────────────────────────────────────────────────────────

  handleAction(state, playerId, action),
  // Apply a player action to the state.
  // action: { type: String, ...payload }
  // → { state: GameState, error?: String }
  // Return { state, error: 'message' } to reject without changing state.

  getValidActions(state, playerId),
  // Return the list of valid action types for this player right now.
  // Used by both the client (to show/hide buttons) and bot-runner (to check if bot can act).
  // → String[]   e.g. ['flip'] or ['hit', 'stand', 'double'] or []

  isTurnValid(state, playerId, action),
  // Quick boolean check before calling handleAction.
  // → Boolean

  // ── Phase checks ─────────────────────────────────────────────────────────

  isRoundOver(state),
  // Return true when the current round is complete and intermission should begin.
  // → Boolean

  isGameOver(state),
  // Return true when the entire game is definitively over (e.g. winTarget reached).
  // Return false for endless games.
  // → Boolean

  // ── Bots ─────────────────────────────────────────────────────────────────

  getBotAction(state, botId),
  // Return the action a bot should take. Called by bot-runner after getValidActions confirms
  // the bot has valid moves. No difficulty parameter — read from state.config if needed.
  // → { type: String, ...payload }

  // ── State projection ──────────────────────────────────────────────────────

  getPublicState(state, playerId),
  // Strip hidden information before sending state to a specific player.
  // e.g. hide other players' hole cards in poker, hide unflipped cards in highest-card.
  // playerId is null for spectators — show everything or a neutral view.
  // → GameState  (a new object, never mutate the original)

  getRoundSummary(state),
  // Called at end of round and at game over.
  // Used to populate the intermission overlay and the postgame screen.
  // → { winner?: String, winnerName?: String, scores: Object, round: Number, ...any }
};
```

### PlayerObject

```js
{
  id: String,           // UUID (ephemeral for bots: "bot-<uuid>")
  display_name: String, // Display name
  displayName: String,  // Same value, camelCase alias
  is_bot: 0 | 1,        // 1 for bot players
  role: 'player' | 'spectator',
}
```

### FieldDefinition (returned by getSetupConfig)

```js
{
  key: String,           // Used as the settings object key e.g. 'winTarget'
  type: 'number' | 'select' | 'boolean',
  label: String,         // Shown in the Create Lobby modal
  default: any,          // Default value
  // Number-specific:
  min?: Number,
  max?: Number,
  step?: Number,
  // Select-specific:
  options?: String[],    // Array of option values
}
```

---

## Engine Architecture

### Session Object (in-memory, server-side)

```js
{
  module,          // Loaded game module object
  state,           // Current GameState (mutable)
  gameType,        // String e.g. 'highest-card'
  lobbyId,         // UUID
  players,         // PlayerObject[] — includes ephemeral bots
  spectators,      // PlayerObject[]
  config,          // Settings from lobby creation
  enginePhase,     // 'playing' | 'intermission'
  readySet,        // Set<playerId> — players ready for next round
  sittingOut,      // Set<playerId> — players skipping this round
  io,              // Socket.io server reference
}
```

### Enhanced Client State

The engine augments `module.getPublicState()` before emitting to clients:

```js
{
  ...publicState,
  gameType,
  enginePhase,              // 'playing' | 'intermission'
  readyPlayers: [...readySet],
  sittingOut: [...sittingOut],
  roundSummary: enginePhase === 'intermission' ? module.getRoundSummary(state) : null,
}
```

### Round Lifecycle

```
startGame(players, config)
  └─ bot fill to botFillMin if botFillAllowed
  └─ module.initGame(players, config)
  └─ enginePhase = 'playing'
  └─ emit server:game_started to all players

game:action event
  └─ isTurnValid check
  └─ module.handleAction → { state, error? }
  └─ check module.isGameOver → finishGame()
  └─ check module.isRoundOver → enterIntermission()
  └─ scheduleIfBot (for any bot with valid actions)

enterIntermission()
  └─ enginePhase = 'intermission'
  └─ bots auto-ready (200–1200ms delay)
  └─ 30s AFK timer: sit out non-ready humans → advanceRound()

game:ready event
  └─ readySet.add(playerId)
  └─ if all non-bot non-sittingOut ready → advanceRound()

advanceRound()
  └─ module.startNextRound(state, activePlayers)
  └─ enginePhase = 'playing'
  └─ readySet.clear()

finishGame()
  └─ writes game_results to DB for human players only
  └─ emits server:game_over
  └─ cleans up session
```

### Sitting Out / Sitting In

- **Mid-round join**: player added to `sittingOut` automatically
- **AFK at intermission**: player added to `sittingOut` after 30s timer
- `game:sit_out` event → engine adds player to `sittingOut`
- `game:sit_in` event → engine removes player from `sittingOut`
- Sitting-out players are excluded from `activePlayers` passed to `startNextRound()`

### Bot Fill

Bots are created in-memory inside `startGame()`:

```js
if (mod.botFillAllowed) {
  while (activePlayers.length < mod.botFillMin) {
    activePlayers.push({
      id: `bot-${uuidv4()}`,
      display_name: `Bot ${n}`,
      displayName: `Bot ${n}`,
      is_bot: 1,
      role: 'player',
    });
  }
}
```

Bots are **never persisted to the database**. `game_results` inserts skip bot players.

---

## Responsive Layout System

### Scale System

`#app-root` is a fixed-dimension container scaled to fit any window:

```js
// In client/app.js
const LANDSCAPE_W = 1280, LANDSCAPE_H = 720;
const PORTRAIT_W  = 414,  PORTRAIT_H  = 896;

function applyScale() {
  const portrait = window.innerWidth < window.innerHeight || window.innerWidth < 600;
  const baseW = portrait ? PORTRAIT_W : LANDSCAPE_W;
  const baseH = portrait ? PORTRAIT_H : LANDSCAPE_H;
  const scale = Math.min(window.innerWidth / baseW, window.innerHeight / baseH);
  const root = document.getElementById('app-root');
  root.style.width  = baseW + 'px';
  root.style.height = baseH + 'px';
  root.style.transform = `scale(${scale})`;
  root.style.transformOrigin = 'top left';
  root.style.left = Math.round((window.innerWidth  - baseW * scale) / 2) + 'px';
  root.style.top  = Math.round((window.innerHeight - baseH * scale) / 2) + 'px';
  document.documentElement.dataset.layout = portrait ? 'portrait' : 'landscape';
  document.body.classList.toggle('layout-phone', portrait);
  document.body.classList.toggle('layout-web', !portrait);
}
window.addEventListener('resize', applyScale);
applyScale();

export function isPortrait() {
  return document.documentElement.dataset.layout === 'portrait';
}
```

### Layout Classes

CSS uses `body.layout-phone` and `body.layout-web` to switch between layouts. All layout decisions cascade from this single body class — no media queries needed.

### Game Renderer Layout Contract

Each renderer file at `client/renderers/<gameType>.js` must export:

```js
export function render(container, state, socket, playerId, hostPlayerId) {}
// Initial render. Called once when game view loads.

export function update(state, playerId, hostPlayerId) {}
// Called on every server:game_state event.
// Check state.enginePhase to know if in 'playing' or 'intermission'.
// The intermission overlay (Ready/Sit Out buttons) is handled by game.js — 
// the renderer only needs to show the game board state.

export function destroy() {}
// Cleanup: remove event listeners, clear timers.
```

The renderer should check `isPortrait()` (imported from app.js) or inspect `document.body.classList` to decide which layout to render. Both layouts must be implemented.

---

## Design Token System

### Legacy tokens (used in game, lobby waiting room, postgame views)

```css
--color-bg-primary       /* Main background */
--color-bg-secondary     /* Card/surface background */
--color-bg-card          /* Elevated card background */
--color-text-primary     /* Primary text */
--color-text-secondary   /* Muted text */
--color-accent           /* Primary accent (indigo) */
--color-border           /* Subtle border */
--color-success          /* Green */
--color-danger           /* Red */
```

### gc-* tokens (lobby browser, profile, home view)

```css
--gc-bg:       #0a0a0f    /* Page background */
--gc-surface:  #12121a    /* Card / sidebar background */
--gc-surface2: #1a1a26    /* Elevated surface, input background */
--gc-border:   rgba(255,255,255,0.06)  /* Subtle border */
--gc-gold:     #f0c040    /* Primary accent — active states, CTAs */
--gc-gold2:    #e8a020    /* Gold hover state */
--gc-green:    #30d890    /* Success, live dot, wins */
--gc-red:      #ff4560    /* Error, danger actions */
--gc-blue:     #4090ff    /* Info, counts */
--gc-purple:   #9060ff    /* Secondary accent */
--gc-text:     #f0f0f8    /* Primary text */
--gc-muted:    rgba(240,240,248,0.4)  /* Muted / secondary text */
--gc-font:     'Anybody', system-ui, sans-serif
--gc-mono:     'DM Mono', 'Courier New', monospace
```

### gc-* component classes

| Class | Description |
|---|---|
| `.gc-home` | Home view root. Dark background + three-layer gradient mesh + noise texture |
| `.gc-lobby-card` | Lobby card. Uses `--gc-card-accent` for top highlight and corner glow |
| `.gc-card-badge` | Colored pill tag inside a card (game type label) |
| `.gc-card-join-btn` | Gold join button. Add `.watch` class for the muted spectator variant |
| `.gc-pill` | Filter pill. Add `.active` for gold selected state |
| `.gc-stats-strip` | Three-cell stat display with dividers |
| `.gc-stat-cell` / `.gc-stat-val` / `.gc-stat-key` | Cells inside the stats strip |
| `.gc-create-card` | "Create a Lobby" tap target card |
| `.gc-section-label` | Uppercase monospace section header |
| `.gc-live-dot` | Pulsing green dot (used next to "Active Lobbies") |
| `.gc-modal-backdrop` | Full-screen overlay; bottom-sheet on phone, centered on web |
| `.gc-modal` | Modal panel with slide-up animation |
| `.gc-modal-handle` | Drag handle bar at top of modal |
| `.gc-input` | Dark-themed text input |
| `.gc-select` | Dark-themed select with custom arrow |
| `.gc-label` | Uppercase monospace field label |
| `.gc-btn-gold` | Full-width gold primary button |
| `.gc-btn-ghost` | Full-width ghost secondary button |
| `.gc-error-msg` | Red error message box inside modals |
| `.gc-empty` | Empty state message inside lobby grid |

### Background gradient

`.gc-home::before` applies the three-layer mesh (purple top-left, green bottom-right, gold center). `.gc-home::after` applies a subtle noise texture overlay. Both are `pointer-events: none; z-index: 0`. All direct children of `.gc-home` need `position: relative; z-index: 1` to appear above these pseudo-elements — handled by `.gc-home > *`.

Lobby cards use a `--gc-card-accent` CSS variable scoped to the card element. Set it inline:

```html
<div class="gc-lobby-card" style="--gc-card-accent: #30d890">
```

The accent controls the top-edge highlight line (`::before`) and the corner glow (`::after`).

---

## Adding a New Game — Step by Step

### 1. Create the module

```bash
mkdir games/my-game
touch games/my-game/index.js
```

Implement the full module interface. Use `games/highest-card/index.js` as a reference — it's intentionally minimal and well-commented.

Make sure to include the `icon` field in your metadata:

```js
module.exports = {
  name: 'My Game',
  description: 'Short description for the lobby browser.',
  icon: '🎯',          // shown on filter pills and lobby cards
  minPlayers: 2,
  maxPlayers: 6,
  botFillAllowed: true,
  botFillMin: 2,
  version: '1.0.0',
  // ...rest of interface
};
```

### 2. Register it in the database

In `server/db.js`, find the `seedGames` block and add:

```js
seedGames.run('my-game', 'My Game', minPlayers, maxPlayers);
```

The seed uses `INSERT OR IGNORE` so re-running the server won't duplicate it.

### 3. Add an accent color

In `client/views/home.js`, add an entry to the `GAME_ACCENTS` map:

```js
const GAME_ACCENTS = {
  'highest-card': '#9060ff',
  'my-game':      '#4090ff',   // ← add this
};
```

This controls the top-edge highlight and corner glow on lobby cards.

### 4. Create the client renderer

```bash
touch client/renderers/my-game.js
```

Export `render`, `update`, `destroy`. Check `document.body.classList.contains('layout-phone')` to switch between portrait and landscape layouts. The intermission overlay (Ready / Sit Out) is handled by `game.js` — don't duplicate it.

### 5. Test with bots

Set `botFillAllowed: true` and `botFillMin: 2` in your module. Create a lobby as a single human — bots will fill automatically. Watch the browser console for engine logs (`[game] started`, `[game] ended`).

### 6. Test mid-round join

Start a game, then open a second browser tab and join the same lobby. Confirm the new player appears as sitting out and is dealt in on the next round.

### 7. Test the intermission cycle

Play through a complete round. Verify:
- `isRoundOver()` fires correctly
- The intermission overlay appears
- Clicking Ready advances to the next round
- Bot auto-readies within ~1 second
- The 30-second AFK timer sits out non-ready humans and advances

---

## Socket Events Reference

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `lobby:create` | `{ gameType, playerName, pin, settings }` | Create a new lobby |
| `lobby:join` | `{ joinCode, playerName, pin, asSpectator }` | Join existing lobby |
| `lobby:start` | `{ lobbyId }` | Host starts the game |
| `lobby:ready` | `{ lobbyId }` | Mark ready in waiting room |
| `lobby:unready` | `{ lobbyId }` | Unmark ready |
| `lobby:kick` | `{ lobbyId, targetPlayerId }` | Host kicks a player |
| `lobby:chat` | `{ lobbyId, message }` | Send lobby chat message |
| `game:action` | `{ sessionId, action }` | Submit a game action |
| `game:ready` | `{ sessionId }` | Ready for next round (intermission) |
| `game:sit_out` | `{ sessionId }` | Sit out next round |
| `game:sit_in` | `{ sessionId }` | Rejoin from sitting out |
| `game:chat` | `{ sessionId, message }` | Send in-game chat |
| `client:rejoin_check` | — | Re-attach to active session on reconnect |

### Server → Client

| Event | Payload | Description |
|---|---|---|
| `server:lobby_joined` | `{ lobby, players, myPlayerId }` | Joined lobby successfully |
| `server:lobby_updated` | `{ lobby, players }` | Lobby state changed |
| `server:game_started` | `{ sessionId, state, joinCode, hostPlayerId }` | Game began |
| `server:game_state` | `{ state }` | Updated game state (enhanced with engine metadata) |
| `server:game_over` | `{ results, postGameSummary }` | Game ended |
| `server:lobby_chat` | `{ playerId, displayName, message, timestamp }` | Chat message |
| `server:game_chat` | `{ playerId, displayName, message, timestamp, isSpectator }` | In-game chat |
| `server:announcement` | `{ message }` | Server-wide announcement |
| `server:error` | `{ code, message }` | Error response |

---

## HTTP API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/games` | List all registered game modules with metadata: `gameType`, `label`, `description`, `minPlayers`, `maxPlayers`, `botFillAllowed`, `botFillMin`, `config[]` |
| `GET /api/lobbies` | List all open (`status='waiting'`) lobbies with `id`, `joinCode`, `gameType`, `gameLabel`, `hostName`, `playerCount`, `maxPlayers` |
| `GET /api/me/stats` | Current player stats from `gc_session` cookie: `{ loggedIn, playerId, displayName, avatarEmoji, wins, gamesPlayed, onlineCount }`. Returns `{ loggedIn: false, onlineCount }` for unauthenticated requests |
| `GET /health` | Server health check |
| `GET /status` | Server status and active session count |
| `GET /join/:code` | Redirects to `/?join=:code` for shareable lobby links |

---

## Lobby UI — Home View Architecture

The home view (`client/views/home.js`) is a full lobby browser with dual phone/web layout driven by `body.layout-phone` / `body.layout-web`.

### Layout detection

`applyScale()` in `app.js` sets both CSS classes and the scale transform on every resize:

```js
document.body.classList.toggle('layout-phone', portrait);
document.body.classList.toggle('layout-web', !portrait);
```

Portrait is triggered when `window.innerWidth < window.innerHeight || window.innerWidth < 600`.

### Phone layout structure

```
.gc-home (flex column)
  .gc-di-spacer           — Dynamic Island / status bar spacer (40px)
  .gc-header              — Logo left, avatar button right
  .gc-main > .gc-scroll   — Scrollable content:
    .gc-stats-strip         — Wins / Games / Online stat cells
    .gc-filter-wrap         — Horizontal-scroll game type pills
    .gc-create-card         — "Create a Lobby" tap target
    .gc-section-label       — "Active Lobbies" + live dot
    .gc-lobby-grid          — Vertical stack of lobby cards
  .gc-bottom-nav          — Lobby / Profile / Settings tabs
```

### Web layout structure

```
.gc-home (flex row)
  .gc-sidebar (240px fixed)
    logo, nav items, stats, user avatar
  .gc-main (flex: 1, scrollable)
    .gc-topbar              — Filter pills left, "+ Create Lobby" button right
    .gc-section-label
    .gc-lobby-grid          — CSS grid, auto-fill minmax(270px, 1fr)
```

### Data flow

1. On mount, `fetch('/api/games')` populates filter pills and stores `gameConfigs` + `gameMeta`
2. `fetch('/api/lobbies')` loads lobby cards; polled every 8 seconds
3. `fetch('/api/me/stats')` loads player stats for the stats strip / sidebar
4. Clicking a game pill sets `activeFilter` and re-renders cards client-side
5. **Create modal** — bottom sheet with name/PIN, game selector, dynamic settings fields from `getSetupConfig()`
6. **Join modal** — bottom sheet with name/PIN, join code input; pre-fills from URL `?join=CODE`
7. Both modals emit to `socket.emit('lobby:create', ...)` or `socket.emit('lobby:join', ...)`
8. `onError(code, message)` routes socket errors into the currently open modal's error element

### Lobby card accent colors

Defined in `home.js` `GAME_ACCENTS` map. Add an entry for each new game type:

```js
const GAME_ACCENTS = {
  'highest-card': '#9060ff',
  'blackjack':    '#4090ff',
  'poker':        '#30d890',
  'bs':           '#ff4560',
};
```

The accent is passed as `--gc-card-accent` inline CSS on each card element and controls the top-edge highlight line and corner glow.

---

**Chips always on, no chipless mode.** Removing the toggle simplifies state management and keeps the buy-in flow predictable. If a game doesn't use chips, it simply doesn't include a buy-in field in `getSetupConfig()`.

**No rematch system.** After a game ends, the lobby loops continuously. Players click Ready to start the next round. This removes a class of state sync bugs and keeps all players in the same room without re-joining.

**Per-game setup config.** Each game module declares its own settings via `getSetupConfig()`. The lobby creation UI renders these dynamically. Adding a new game never requires changes to lobby creation code.

**Engine manages intermission, not modules.** The module only signals `isRoundOver()`. The engine owns the ready set, sitting-out logic, AFK timer, and `startNextRound()` call. This means every game gets the same intermission behavior for free.

**Ephemeral bots.** Bot players are created in memory at game start and never written to the database. This keeps the players table clean and avoids orphaned bot records accumulating over time.

**Scale layout over media queries.** The `#app-root` transform:scale approach means the game always renders at its design dimensions (1280×720 or 414×896) and is simply zoomed to fit. This eliminates a whole class of responsive layout bugs inside game renderers — everything just scales uniformly.

**Two design systems coexist.** The `--color-*` legacy tokens are used in game, waiting room, and postgame views. The `--gc-*` tokens power the lobby browser, profile, and home view. Do not mix them. When building new views that match the lobby aesthetic, use `--gc-*`. When building game renderers, use `--color-*`.

**Body class drives layout, not media queries.** `body.layout-phone` / `body.layout-web` are set by `applyScale()` on every resize, derived from the same portrait/landscape detection that controls the scale canvas. All CSS layout decisions cascade from this one class — no `@media` queries needed in component styles.

**Modal bottom-sheets, not centered dialogs.** On phone, modals slide up from the bottom. The same `.gc-modal` class works for both — on web it can be wrapped in `.gc-modal-backdrop.centered` but defaults to bottom-sheet. This matches native mobile feel and avoids keyboard-covering issues.

**Cloudflare Tunnel over port forwarding.** Cox residential ISPs block ports 80/443 and have unreliable port-forwarding UIs. Cloudflare Tunnel requires zero port forwarding, bypasses CGNAT, and provides free HTTPS automatically.

---

## Pending UI Tasks (from design spec)

The following tasks from the lobby redesign spec have been completed:

- **Task 1**: ✅ Phone-only elements (filter pills, create card) hidden on web; web topbar hidden on phone.
- **Task 2**: ✅ Body and `#app-root` background set to `#0a0a0f` for seamless edges.
- **Task 3**: ✅ All `.focus()` calls removed from modal inputs (home.js join/create modals).
- **Task 4**: ✅ Profile screen uses `gc-*` design (`.gc-profile`, `.gc-profile-card`, `.gc-stats-strip`, etc.).
- **Task 5**: ✅ Game Lobby (waiting room) uses `gc-*` design (`.gc-lobby-wait`, `.gc-lobby-wait-card`, chat overrides).
- **Task 6**: ✅ Consistency pass: home, profile, and lobby use same tokens; navbar uses dark theme when on profile/lobby (`body.gc-view`).
- **Task 7**: ✅ Game icons on filter pills (icon + label) and lobby card badges; `/api/games` and `/api/lobbies` return `icon`; modules export `icon`.

