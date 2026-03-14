# GameCenter — Codebase Audit Report

**Date:** 2026-03-03
**Scope:** Full codebase — all source files read before writing
**Auditor:** Automated via Claude Code

---

## Executive Summary

GameCenter is a well-structured, self-hosted game platform with two largely independent subsystems: a **multiplayer engine** (3 games: Blackjack, BS, Poker) and a **singleplayer hub** (13 games). The overall architecture is clean and the separation of concerns is good. However, documentation (README and CLAUDE.md) was severely outdated, referencing a removed reference game (`highest-card`), a non-existent lobby browser UI (described as `gc-*` component-heavy when the actual home view is a simpler card grid), and missing the entire singleplayer system.

One critical bug was found in the multiplayer join flow. Several medium-severity issues exist around state management, module consistency, and undocumented behavior. No security vulnerabilities beyond one low-severity insecure default were found.

---

## Architecture Overview

```
Server (Node.js + Express + Socket.io + SQLite)
  ├── Multiplayer engine  → game modules in games/{type}/index.js
  ├── Singleplayer REST   → SP logic in games/{type}/index.js, served as static
  ├── Cookie auth         → gc_session UUID cookie (guest: 1-day, registered: 30-day)
  └── Chip economy        → SQLite-backed, in-memory session tracking

Client (Vanilla JS SPA, ES modules, no framework)
  ├── Multiplayer view    → client/views/home.js → lobby.js → game.js
  ├── Singleplayer view   → client/views/singleplayer.js → views/{game}.js → renderers/{game}.js
  ├── Profile             → client/views/profile.js
  └── Scale system        → #app-root transform:scale (1280×720 / 414×896)
```

**Multiplayer games:** Blackjack, BS (Bull$hit), Poker
**Singleplayer games:** Minesweeper, Snake, 2048, Wordle, Sudoku, Pacman, Tetris, Treasure Tower, Pong, Breakout, Asteroids, Space Invaders, Idle Clicker

**Rendering technologies used:**
- Canvas 2D: Tetris, Pacman, Pong, 2048, Breakout, Asteroids, Space Invaders, Snake
- DOM-based: Minesweeper, Wordle, Sudoku, Idle Clicker
- DOM + canvas hybrid: Treasure Tower

---

## Issues

### CRITICAL

---

**[C-1] Spectators incorrectly charged buy-in chips**
**File:** `server/lobby-manager.js` ~line 220
**Severity:** CRITICAL
**Impact:** Any spectator joining a chip game (Blackjack, Poker) is charged the full buy-in amount, even though they should watch for free.

**Root Cause:** The `role` variable (assigned around line 238 via `data.asSpectator ? 'spectator' : 'player'`) is referenced *before* it is declared at line 220 in the chip deduction block. JavaScript `var` hoisting means the variable exists but is `undefined`, so `undefined !== 'spectator'` evaluates `true` — the condition always passes and all joiners are charged.

**Fix:** Move the `role` assignment above the chip deduction check, or reorder the logic so `role` is computed before it is used.

---

### HIGH

---

**[H-1] `game-night.js` is dead code — never imported**
**File:** `server/game-night.js`
**Severity:** HIGH
**Impact:** A complete playlist-orchestration system (multi-game event scheduling) exists but is wired to nothing. It cannot be reached at runtime. Any bugs in it are invisible. It confuses future developers.
**Fix:** Either wire it into `server/index.js` to make it functional, or delete it if it is not planned.

---

**[H-2] `/api/me/stats` only tracks Minesweeper for singleplayer**
**File:** `server/routes/status.js`
**Severity:** HIGH
**Impact:** The stats endpoint that powers the Profile view's singleplayer section only returns Minesweeper stats. All other SP games (Snake, 2048, Wordle, Sudoku, Pacman, Tetris, Pong, Breakout, Asteroids, Space Invaders, Idle Clicker, Treasure Tower) show no server-side history — even if the player has saves. The Profile screen's "SP stats" section is incomplete for 12 of 13 games.
**Fix:** Extend the query to include `sp_game_history` rows for all game types, or expose a generic `/api/sp/history` endpoint the Profile view can query per-game.

---

**[H-3] `reload_chips` action in Blackjack has no server-side authorization**
**File:** `games/blackjack/index.js`
**Severity:** HIGH
**Impact:** Any client can emit `game:action { type: 'reload_chips' }` at any time during a Blackjack game to grant themselves 500 chips — no PIN, no admin check, no rate limit. This is exploitable by any user who can read client source.
**Fix:** Move the chip grant to a dedicated server-side handler (e.g. `POST /api/chips/reload`) with a cooldown per player. Do not allow game module `handleAction` to award real chips.

---

### MEDIUM

---

**[M-1] Inconsistent module export syntax across SP game modules**
**Severity:** MEDIUM
**Impact:** Some SP game modules use CommonJS (`module.exports = { ... }`) while others use ES6 named exports (`export { initGame, tick }`). Modules using ES6 `export` syntax (pacman, tetris, wordle, idle-clicker) cannot be `require()`'d by Node.js without a transpiler. They work only because they are served as static files and `import()`'d by the browser. This makes it impossible to reuse SP game logic server-side (e.g. for seeded daily challenges, server-side validation), and creates confusion about which modules are Node-safe.
**Games affected:** pacman, tetris, wordle, idle-clicker (ES6 export); 2048, pong, breakout, snake, sudoku, treasure-tower (CommonJS)
**Fix:** Standardize on CommonJS for all modules under `games/`. The client imports them as static files via `<script type=module>` anyway, so no bundler change is needed — but the server-side team should declare which convention wins.

---

**[M-2] Asteroids RNG is non-deterministic**
**File:** `games/asteroids/index.js`
**Severity:** MEDIUM
**Impact:** Asteroid generation uses `Math.random()` with no seeding. Unlike Minesweeper (mulberry32 seeded on world coordinates), Sudoku (mulberry32 seeded daily), and Wordle (mulberry32 seeded by day-from-epoch), Asteroids cannot reproduce a specific run. Save/reload will not restore the same asteroid positions. A daily-seeded "challenge" mode is impossible without this.
**Fix:** Replace `Math.random()` calls in asteroid/UFO generation with a seeded mulberry32 RNG. Seed can be derived from Date or session start time.

---

**[M-3] No portrait-layout handling in several canvas renderers**
**Files:** `client/renderers/pongRenderer.js`, `client/renderers/breakoutRenderer.js`, `client/renderers/tetris.js`
**Severity:** MEDIUM
**Impact:** These renderers do not check `document.body.classList.contains('layout-phone')` or `isPortrait()`. On portrait screens (< 600px wide), they render at landscape dimensions inside the 414×896 scale canvas. Pong and Breakout are playable but visually cramped. Tetris works better due to its tall aspect ratio, but controls are not adapted for touch portrait.
**Fix:** Add portrait layout branches to affected renderers. At minimum: scale game canvas to fit 414px width, move controls/HUD to below the play area.

---

**[M-4] In-memory lobby/session state lost on server restart**
**Files:** `server/lobby-manager.js`, `server/game-runner.js`
**Severity:** MEDIUM
**Impact:** `activeSessions`, `kickedPlayers`, `disconnectTimers`, `hostTransferTimers`, and `idleTimers` are all in-memory Maps. A server restart during an active game silently loses all in-flight game state. Players attempting to reconnect receive no game state. The `client:rejoin_check` socket event will find no session and leave the client stuck.
**Note:** This is a known architectural tradeoff (not a new bug), but it is undocumented.
**Fix (minimal):** Document this behavior in comments and CLAUDE.md. Add a graceful shutdown handler that broadcasts `server:error { code: 'SERVER_RESTART' }` to all connected clients before exiting.

---

**[M-5] Card themes hardcoded — not auto-discovered from filesystem**
**File:** `server/index.js` — `/api/card-themes`
**Severity:** MEDIUM
**Impact:** Adding a new card theme (e.g. a new subdirectory under `client/cards/`) requires modifying `server/index.js`. The list of 6 themes is hardcoded. No filesystem scan is performed. Themes in the filesystem that are not listed in the array are silently unavailable.
**Fix:** Replace the hardcoded array with a `fs.readdirSync` of `client/cards/` to auto-discover theme directories. Fall back to the hardcoded list on error.

---

**[M-6] `sudoku/index.js` — `notes` field (Set objects) will silently lose data on JSON round-trip**
**File:** `games/sudoku/index.js`
**Severity:** MEDIUM
**Impact:** `state.notes` is an array of `Set` objects. `JSON.stringify(Set)` produces `{}` — Sets are not serializable. When a Sudoku save is serialized to `/api/sp/saves/sudoku` and deserialized, all pencil marks (notes) are silently lost.
**Fix:** Convert each `Set` to an `Array` before serializing: `notes: state.notes.map(s => [...s])`. Convert back to Sets on deserialization.

---

**[M-7] Idle Clicker save route may not exist**
**File:** `client/renderers/idleClickerRenderer.js`
**Severity:** MEDIUM
**Impact:** The renderer calls `POST /api/sp/saves/idle-clicker` to persist progress. If `server/routes/singleplayer.js` does not include `idle-clicker` in its allowed game types list, all auto-save calls will 404 silently and the renderer will fall back to localStorage. Progress will be lost on a different device/browser.
**Fix:** Confirm `idle-clicker` is in the allowed game types whitelist in `singleplayer.js`. Add it if missing.

---

### LOW

---

**[L-1] Admin PIN default is `'admin'` (insecure)**
**File:** `config/default.js`
**Severity:** LOW
**Impact:** The default `ADMIN_PIN` is the string `'admin'`. Any user who knows the default can access admin endpoints if the operator never changes it. The first-run setup wizard requires an admin PIN to be set, so this only affects deployments that bypass the wizard or set `ADMIN_PIN=admin` explicitly in the environment.
**Fix:** Change the default to `null` or `''` so the server refuses all admin requests if `ADMIN_PIN` was not explicitly configured.

---

**[L-2] Chat component HTML-escapes messages but `escHtml()` is not verified to be XSS-safe in all paths**
**File:** `client/components/chat.js`
**Severity:** LOW
**Impact:** Display names and messages go through `escHtml()` before DOM insertion. If any code path uses `innerHTML` with unescaped data instead of `escHtml()`, a stored XSS is possible via a crafted display name. A brief audit of the component shows one place where raw socket data could reach the DOM if `escHtml()` is accidentally omitted in a future edit.
**Fix:** Use `textContent` assignment rather than `innerHTML` for all user-controlled strings where rich formatting is not needed. Add a lint rule forbidding `innerHTML` in component files.

---

**[L-3] `game-night.js` references non-existent `game_night` type explicitly deleted from DB**
**File:** `server/game-night.js`, `server/db.js`
**Severity:** LOW
**Impact:** `server/db.js` explicitly deletes the `game_night` type from `game_registry` on every server start. `server/game-night.js` exists but is never required. The code is entirely unreachable. Confusing to read.
**Fix:** Delete `server/game-night.js` or rename it to `game-night.js.disabled`.

---

**[L-4] Space Invaders module doesn't export COLS/ROWS constants**
**File:** `games/spaceInvaders/index.js`
**Severity:** LOW
**Impact:** The renderer (`client/renderers/spaceInvadersRenderer.js`) needs grid dimension constants to position sprites. If the renderer re-defines these constants locally, they can drift out of sync with the module if the game logic is ever updated.
**Fix:** Export `COLS`, `ROWS`, `ENEMY_W`, `ENEMY_H` from the module and import them in the renderer.

---

**[L-5] Breakout powerup "wide paddle" and "slow ball" effects appear incomplete**
**File:** `games/breakout/index.js`, `client/renderers/breakoutRenderer.js`
**Severity:** LOW
**Impact:** Powerups (wide, slow, extra-life) spawn and fall, but the game logic module does not apply the wide/slow effects — only extra-life (lives++) is applied in `handlePowerup`. The renderer draws wide/slow powerup icons but the game state does not change paddle width or ball speed when they are collected.
**Fix:** Implement `paddleWidthBonus` and `ballSpeedMultiplier` fields in game state, applied in `handlePowerup`, read by the renderer.

---

## Priority Fix List

| Priority | Issue | Effort |
|----------|-------|--------|
| 1 | **[C-1]** Spectators charged buy-in — fix `role` definition order | 5 min |
| 2 | **[H-3]** `reload_chips` has no server auth — move to protected route | 2 hrs |
| 3 | **[M-6]** Sudoku notes (Set) lost on save/load | 30 min |
| 4 | **[M-7]** Confirm idle-clicker save route exists | 15 min |
| 5 | **[H-2]** `/api/me/stats` missing 12 SP games | 2 hrs |
| 6 | **[M-1]** Standardize CommonJS vs ES6 module syntax | 1 day |
| 7 | **[M-3]** Add portrait layouts to Pong, Breakout, Tetris renderers | 3 hrs |
| 8 | **[L-5]** Implement Breakout wide/slow powerup effects | 1 hr |
| 9 | **[H-1]** Delete or wire `game-night.js` | 30 min |
| 10 | **[M-2]** Seed Asteroids RNG | 1 hr |

---

## Patterns Worth Standardizing

### SP Game Module Pattern

SP game modules currently vary in:
- Whether they use CommonJS or ES6 exports
- Whether they include their own seeded RNG or rely on `Math.random()`
- Whether their state is JSON-serializable (Sudoku's Set is not)

**Recommended pattern:**
```js
// games/my-sp-game/index.js  (CommonJS — Node-safe + browser-safe)
const mulberry32 = ...;  // copy from minesweeper/index.js

module.exports = {
  initGame(config, seed),          // seed for reproducibility
  tick(state, dt),                  // advance simulation
  handleInput(state, input),        // discrete inputs (moves, clicks)
  serializeState(state),            // JSON.stringify-safe
  deserializeState(json),           // rebuild from JSON
};
```

### SP Save/Load Pattern

SP renderers mix three approaches for persistence:
1. `POST /api/sp/saves/:gameType` (Idle Clicker, Snake, Minesweeper)
2. `localStorage` only (most games)
3. Both with fallback (some)

**Recommended:** All SP games should use the server save endpoint as primary and localStorage as offline fallback. This enables cross-device continuity and server-side history tracking.

### Renderer Export Pattern

All renderers should consistently export:
```js
export function render(container, state, socket, playerId, navigateFn) {}
export function update(state) {}
export function destroy() {}
```

The `hostPlayerId` parameter included in the CLAUDE.md spec is only relevant for multiplayer renderers. SP renderers don't need it but should accept and ignore it for a uniform call signature.

### Portrait Layout Contract

Every renderer must handle portrait mode. Recommended minimum:
```js
const portrait = document.body.classList.contains('layout-phone');
const W = portrait ? 390 : 760;   // canvas width
const H = portrait ? 500 : 480;   // canvas height
```

---

## Files With No Issues Found

- `server/index.js` — clean, well-commented
- `server/session-manager.js` — clean, correct SHA256 + bcrypt dual support
- `server/bot-runner.js` — correct getValidActions loop, no issues
- `server/middleware/rate-limit.js` — correct IP extraction, cleanup timer present
- `server/middleware/auth.js` — correct admin PIN lookup chain
- `games/blackjack/index.js` — complete MP interface, correct chip accounting (except H-3)
- `games/poker/index.js` — full Texas Hold'em, correct pot splitting and showdown
- `games/bs/index.js` — correct per-round entry fee model
- `games/minesweeper/index.js` — well-seeded, correct coordinate math
- `games/sudoku/index.js` — correct backtracking solver (except M-6 notes serialization)
- `client/components/chat.js` — HTML escaping present
- `client/components/timer.js` — correct countdown + fill bar
- `config/default.js` — complete env var list (except L-1 admin PIN default)

---

*End of audit report.*
