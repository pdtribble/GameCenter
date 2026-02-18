# GameCenter

Self-hosted multiplayer card & table game platform. Runs identically on a **Proxmox VM** (public internet) and a **Raspberry Pi 4** (portable, offline-capable, Wi-Fi hotspot).

## Games
- **Blackjack** — Classic dealer vs. players
- **Texas Hold'em Poker** — No-limit, blinds, full hand evaluation
- **BS (Cheat)** — Bluffing card game, call BS on other players
- **Game Night** — Playlist of multiple games with cumulative scoring

---

## Tech Stack
- Node.js LTS + Express + Socket.io
- SQLite via `better-sqlite3`
- Vanilla HTML/CSS/JS (no frontend framework)
- CSS custom properties for full light/dark theme support

---

## Quick Start

### Prerequisites
- Node.js 18+
- npm

### Install & Run

```bash
cd gamecenter
npm install
cp .env.example .env
# Edit .env with your settings
node server/index.js
```

Open `http://localhost:3000` — you'll be redirected to the first-run wizard.

### First-Run Wizard
On first start, navigate to `/` and you'll be redirected to `/setup`. Enter:
- **Server Name** — displayed in the admin panel and status endpoint
- **Admin PIN** — protects `/admin`
- **Optional first player account**

After setup, the wizard is permanently disabled.

---

## Proxmox VM Deployment

```bash
# .env
NODE_ENV=production
DEPLOYMENT=proxmox
PORT=3000
SESSION_SECRET=<random-64-char-string>
ADMIN_PIN=<secure-pin>
DB_PATH=/opt/gamecenter/gamecenter.db
```

### Caddy reverse proxy (recommended)

```
yourdomain.com {
    reverse_proxy localhost:3000
}
```

### Systemd service

```ini
[Unit]
Description=GameCenter
After=network.target

[Service]
Type=simple
User=gamecenter
WorkingDirectory=/opt/gamecenter
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
EnvironmentFile=/opt/gamecenter/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now gamecenter
```

---

## Raspberry Pi 4 Deployment

### Wi-Fi Hotspot Mode
Set `HOTSPOT_MODE=true` to configure the Pi as a local access point. Players connect to the Pi's Wi-Fi network and access GameCenter at `http://192.168.4.1:3000`.

```bash
# .env (Pi)
NODE_ENV=production
DEPLOYMENT=pi
PORT=3000
SESSION_SECRET=<random-string>
ADMIN_PIN=<pin>
DB_PATH=/home/pi/gamecenter/gamecenter.db
HOTSPOT_MODE=true
SYNC_ENABLED=false
```

### Pi → Proxmox Sync (optional)
Sync game results to the Proxmox server when internet is available:

```bash
# .env (Pi, sync enabled)
SYNC_ENABLED=true
SYNC_TARGET_URL=https://yourdomain.com
SYNC_API_KEY=<shared-secret>
SYNC_INTERVAL_MS=120000
```

The sync system:
1. Checks `SYNC_TARGET_URL/health` at startup and every `SYNC_INTERVAL_MS`
2. POSTs pending `sync_queue` records to `SYNC_TARGET_URL/api/sync`
3. Marks records synced on 200 response; retries on failure (records are never deleted)
4. Emits sync status to all connected clients

---

## Endpoints

| Route | Description |
|-------|-------------|
| `GET /health` | Uptime, active lobbies, connected players |
| `GET /status` | Server stats — total games, players, etc. |
| `GET /join/:code` | Redirect to client with join code pre-filled |
| `GET /admin?pin=...` | Admin panel (server-rendered) |
| `POST /api/sync` | Receive sync records from Pi (requires `x-sync-key` header) |

---

## Admin Panel

Navigate to `/admin` and enter your `ADMIN_PIN`. Features:
- View all active lobbies
- View connected players
- Broadcast announcement to all players
- Force-end any active session
- Kick any player (disconnects for 1 hour by IP)
- Server stats
- Sync status (Pi deployment only)

---

## Game Module Interface

Every game at `/games/<type>/index.js` must export:

```js
{ version, initGame, handleAction, getState, isTurnValid, isGameOver, getBotAction, getPostGameSummary }
```

See [gamecenter-claude-code-prompt.md](./gamecenter-claude-code-prompt.md) for full interface spec.

---

## Environment Variables

See [`.env.example`](./.env.example) for all options with defaults.

---

## Project Structure

```
/server          — Express + Socket.io server
/games           — Game modules (blackjack, poker, bs, global achievements)
/client          — Vanilla JS SPA (views, renderers, components, CSS)
/config          — Config defaults and validation
```

---

## Security Notes
- Session cookies: `httpOnly`, `sameSite: strict`, `secure` in production
- Admin PIN checked on every request
- All user-supplied strings sanitized (HTML stripped, length limited)
- Sync endpoint rejects requests missing valid `x-sync-key`
- Rate limiting on join code attempts (10/min) and admin login (5 failures → 15min lockout)
