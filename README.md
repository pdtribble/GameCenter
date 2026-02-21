# GameCenter

Self-hosted multiplayer card and table game platform. The engine is fully game-agnostic — all rules live in pluggable game modules. Runs identically on a **Proxmox VM** (public internet via Cloudflare Tunnel) and a **Raspberry Pi 4** (portable, offline-capable, Wi-Fi hotspot).

Install to home screen on iOS or Android as a full-screen PWA — no app store required.

---

## Tech Stack

- **Server:** Node.js 20 + Express + Socket.io + SQLite (`better-sqlite3`)
- **Client:** Vanilla JS ES modules, no frontend framework
- **Layout:** Fixed-dimension scale canvas (1280×720 landscape / 414×896 portrait), transform:scale to fit any window
- **PWA:** Web App Manifest + Service Worker for installable full-screen experience

---

## Games

| Game | Status |
|---|---|
| Highest Card | ✅ Included (test/reference module) |
| Blackjack | 🔜 Planned |
| Texas Hold'em | 🔜 Planned |
| BS (Cheat) | 🔜 Planned |

Games are drop-in modules. See CLAUDE.md for the full module interface and step-by-step instructions for adding new ones.

---

## Folder Structure

```
/server
  index.js              — Express app, Socket.io setup, all socket event wiring
  db.js                 — SQLite schema, seed data, DB singleton
  game-runner.js        — Core engine: session lifecycle, intermission, bot fill
  bot-runner.js         — Schedules bot turns (works for sequential + simultaneous games)
  lobby-manager.js      — Lobby create/join/start/kick/host-transfer logic
  session-manager.js    — Cookie-based player sessions (cookie: gc_session)
  sync.js               — Pi → Proxmox sync system
  auth.js               — Rate limiting, admin PIN middleware
  routes/
    status.js           — /api/games, /api/lobbies, /api/me/stats, /health, /status
    admin.js            — Admin panel routes (server-rendered HTML)
    join.js             — /join/:code redirect handler

/games
  highest-card/
    index.js            — Reference game module (minimal, fully documented)
  <your-game>/
    index.js            — Drop in any new game here

/client
  index.html            — App shell, PWA meta tags, Google Fonts, SW registration
  app.js                — Socket lifecycle, view router, scale layout system
  manifest.json         — PWA manifest (display: fullscreen, orientation: any)
  sw.js                 — Service worker (caches shell, passes through API + sockets)
  style.css             — Design system: legacy --color-* tokens + gc-* lobby tokens
  views/
    home.js             — Lobby browser with phone/web dual layout
    lobby.js            — Pre-game waiting room
    game.js             — In-game shell + intermission overlay
    postgame.js         — Results screen
    profile.js          — Player profile
  renderers/
    highest-card.js     — Game renderer for Highest Card
  components/
    chat.js             — Chat component (lobby + in-game)
    timer.js            — Countdown timer
    spectator-badge.js  — Spectator indicator

/config
  default.js            — Config defaults and env var parsing
  schema.js             — Config validation schema
```

---

## Quick Start

### Prerequisites

- Node.js 20+
- npm

### Install and Run

```bash
git clone https://github.com/pdtribble/GameCenter.git
cd GameCenter
npm install
cp .env.example .env
# Edit .env — set SESSION_SECRET and ADMIN_PIN at minimum
node server/index.js
```

Open `http://localhost:3000`. On first start you'll be redirected to the setup wizard.

### First-Run Wizard

Navigate to `/` — you'll be redirected to `/setup`. Enter:

- **Server Name** — displayed in the admin panel and at `/status`
- **Admin PIN** — protects `/admin`
- **Optional first player account**

After completing setup the wizard is permanently disabled.

---

## Environment Variables

All variables are in `.env`. Copy `.env.example` to get started.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port the server listens on |
| `NODE_ENV` | `production` | `production` or `development` |
| `DEPLOYMENT` | `proxmox` | `proxmox` or `pi` — affects sync and hotspot logic |
| `DB_PATH` | `./gamecenter.db` | Absolute or relative path to the SQLite database file |
| `SESSION_SECRET` | *(required)* | Secret for signing session cookies. Use 64+ random hex chars |
| `ADMIN_PIN` | *(required)* | PIN to access `/admin` |
| `SYNC_ENABLED` | `false` | Enable Pi → Proxmox sync |
| `SYNC_TARGET_URL` | — | Full URL of the Proxmox server e.g. `https://yourdomain.com` |
| `SYNC_API_KEY` | — | Shared secret sent as `x-sync-key` header |
| `SYNC_INTERVAL_MS` | `120000` | How often to attempt sync (ms) |
| `HOTSPOT_MODE` | `false` | Set `true` on Pi to enable Wi-Fi access point mode |
| `LOBBY_IDLE_TIMEOUT_MS` | `1800000` | Close empty lobbies after this many ms of inactivity (30 min) |
| `DISCONNECT_HOLD_MS` | `120000` | Keep a player's seat for this long after disconnect (2 min) |
| `LOW_POWER_IDLE_MS` | `600000` | Pi low-power idle threshold (10 min) |

Generate a secure `SESSION_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Proxmox VM Deployment

This is the primary public-facing deployment. Uses a Cloudflare Tunnel instead of port forwarding — Cox residential ISPs block ports 80/443 and Cloudflare Tunnel bypasses all of that.

### LXC Container Setup

Create a Debian 12 LXC container on Proxmox (2 cores, 1GB RAM, 8GB storage recommended), then:

```bash
apt update && apt upgrade -y
apt install -y curl git
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
useradd -m -s /bin/bash gamecenter
```

### Clone and Configure

```bash
su - gamecenter
git clone https://github.com/pdtribble/GameCenter.git
cd GameCenter
npm install
cp .env.example .env
nano .env   # set SESSION_SECRET, ADMIN_PIN, DB_PATH
```

Recommended `.env` for Proxmox:

```env
NODE_ENV=production
DEPLOYMENT=proxmox
PORT=3000
SESSION_SECRET=<64-char-hex>
ADMIN_PIN=<your-pin>
DB_PATH=/home/gamecenter/GameCenter/gamecenter.db
```

### Systemd Service

Create `/etc/systemd/system/gamecenter.service`:

```ini
[Unit]
Description=GameCenter
After=network.target

[Service]
Type=simple
User=gamecenter
WorkingDirectory=/home/gamecenter/GameCenter
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
EnvironmentFile=/home/gamecenter/GameCenter/.env

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable --now gamecenter
systemctl status gamecenter
```

### Cloudflare Tunnel Setup

No port forwarding needed. Cox blocks ports 80/443 anyway.

1. Create a free Cloudflare account at cloudflare.com
2. Install `cloudflared` in the container:

```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
dpkg -i cloudflared.deb
```

3. Authenticate and create the tunnel:

```bash
cloudflared tunnel login
cloudflared tunnel create gamecenter
```

4. Create `/etc/cloudflared/config.yml`:

```yaml
tunnel: <tunnel-id-from-previous-step>
credentials-file: /root/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: gamecenter.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

5. Route DNS and install as service:

```bash
cloudflared tunnel route dns gamecenter gamecenter.yourdomain.com
cloudflared service install
systemctl enable --now cloudflared
```

Players access the site at `https://gamecenter.yourdomain.com` — no VPN, no port forwarding, automatic HTTPS.

---

## Raspberry Pi 4 Deployment

The Pi is the portable/offline deployment. Players connect to the Pi's Wi-Fi hotspot and access GameCenter at a local IP. No internet required during play.

### Setup

```bash
# Same Node.js install as Proxmox
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs git
git clone https://github.com/pdtribble/GameCenter.git
cd GameCenter
npm install
cp .env.example .env
```

Recommended `.env` for Pi:

```env
NODE_ENV=production
DEPLOYMENT=pi
PORT=3000
SESSION_SECRET=<random-string>
ADMIN_PIN=<your-pin>
DB_PATH=/home/pi/GameCenter/gamecenter.db
HOTSPOT_MODE=true
SYNC_ENABLED=false
```

Use the same systemd service setup as Proxmox (adjust `User` and `WorkingDirectory`).

### Wi-Fi Hotspot Mode

Set `HOTSPOT_MODE=true`. The server will configure the Pi as a Wi-Fi access point using `hostapd` and `dnsmasq`. Players connect to the Pi's network and access the app at `http://192.168.4.1:3000`.

This runs entirely offline — no internet connection required during play.

### Pi → Proxmox Sync

When the Pi has internet access, it can sync game results to the Proxmox server:

```env
SYNC_ENABLED=true
SYNC_TARGET_URL=https://gamecenter.yourdomain.com
SYNC_API_KEY=<shared-secret-matching-proxmox-env>
SYNC_INTERVAL_MS=120000
```

How it works:
1. Every `SYNC_INTERVAL_MS`, the Pi checks `SYNC_TARGET_URL/health`
2. Pending records from `sync_queue` are POSTed to `SYNC_TARGET_URL/api/sync`
3. Records are marked synced on `200` response; retried on failure
4. Records are never deleted from the queue — safe to re-sync

Set the same `SYNC_API_KEY` in the Proxmox `.env` as well. The sync endpoint rejects requests with a missing or wrong key.

---

## PWA — Install to Home Screen

GameCenter is a full PWA. On iPhone: open in Safari → Share → Add to Home Screen. On Android: browser menu → Install App.

Once installed it launches full-screen with no browser chrome, like a native app.

The service worker caches the app shell (`/`, `/app.js`, `/style.css`, `/socket.io/socket.io.js`) for instant offline loading. Game data is always fetched live from the server.

---

## Admin Panel

Navigate to `/admin` (or `/admin?pin=<your-pin>` to auto-authenticate). Features:

- View all active lobbies and their current status
- View all connected players
- Broadcast an announcement to all connected players
- Force-end any active game session
- Kick any player (disconnects them)
- Server statistics
- Sync status and queue size (Pi deployment)

---

## HTTP API

| Endpoint | Description |
|---|---|
| `GET /health` | Uptime, active lobbies, connected player count |
| `GET /status` | Extended server stats |
| `GET /api/games` | All registered game modules with metadata and setup config |
| `GET /api/lobbies` | All open lobbies with player count and host info |
| `GET /api/me/stats` | Current player's stats from session cookie |
| `GET /join/:code` | Redirect to `/?join=:code` (shareable lobby links) |
| `POST /api/sync` | Receive sync records from Pi (requires `x-sync-key` header) |

---

## Security

- Session cookies: `httpOnly`, `sameSite: strict`, `secure` in production
- Admin PIN checked on every request to `/admin`
- All user-supplied strings sanitized (HTML stripped, length-limited)
- Sync endpoint rejects requests with missing or incorrect `x-sync-key`
- Rate limiting on join code attempts (10/min) and admin login (5 failures → 15 min lockout)

---

## Adding a New Game

See **CLAUDE.md** for the full game module interface spec and a step-by-step walkthrough. The short version:

1. Create `games/<gameType>/index.js` and implement the module interface
2. Add a seed entry in `server/db.js`
3. Add an accent color in `client/views/home.js` `GAME_ACCENTS`
4. Create `client/renderers/<gameType>.js` with `render`, `update`, `destroy`

One human player + bots is enough to test end-to-end before adding multiplayer polish.
