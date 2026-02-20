// Home view — lobby browser with phone/web dual layout
// Reads body.layout-phone / body.layout-web set by app.js applyScale()

// Accent colors per game type (fallback to purple)
const GAME_ACCENTS = {
  'highest-card': '#9060ff',
  'blackjack':    '#4090ff',
  'poker':        '#30d890',
  'bs':           '#ff4560',
};

function gameAccent(gameType) {
  return GAME_ACCENTS[gameType] || '#9060ff';
}

// Plural-safe label
function seatLabel(count, max) {
  return `${count}/${max} seated`;
}

export function renderHome(container, socket, state, navigate) {
  const params = new URLSearchParams(location.search);
  const prefillCode = params.get('join') || '';
  if (prefillCode) history.replaceState({}, '', '/');

  // ── HTML skeleton (works for both layouts) ─────────────────────────────────
  container.innerHTML = `
    <div class="gc-home">

      <!-- PHONE: top spacer for Dynamic Island -->
      <div class="gc-di-spacer"></div>

      <!-- PHONE: header row -->
      <div class="gc-header">
        <div class="gc-logo">Game<span>Center</span></div>
        <button class="gc-avatar-btn" id="gc-avatar-btn" title="Profile">🎮</button>
      </div>

      <!-- WEB: sidebar -->
      <div class="gc-sidebar">
        <div class="gc-sidebar-logo">Game<span>Center</span></div>

        <button class="gc-sidebar-nav-item active" id="gc-sb-lobby">
          <span class="gc-nav-icon">🎲</span> Lobby
        </button>
        <button class="gc-sidebar-nav-item" id="gc-sb-profile">
          <span class="gc-nav-icon">👤</span> Profile
        </button>
        <button class="gc-sidebar-nav-item" id="gc-sb-settings">
          <span class="gc-nav-icon">⚙️</span> Settings
        </button>

        <div class="gc-sidebar-spacer"></div>

        <div class="gc-sidebar-stats" id="gc-sidebar-stats" style="display:none">
          <div class="gc-sidebar-stat">
            <span class="gc-sidebar-stat-label">Wins</span>
            <span class="gc-sidebar-stat-val" id="gc-sb-wins">—</span>
          </div>
          <div class="gc-sidebar-stat">
            <span class="gc-sidebar-stat-label">Games</span>
            <span class="gc-sidebar-stat-val" id="gc-sb-games">—</span>
          </div>
          <div class="gc-sidebar-stat">
            <span class="gc-sidebar-stat-label">Online</span>
            <span class="gc-sidebar-stat-val" id="gc-sb-online">—</span>
          </div>
        </div>

        <div class="gc-sidebar-user" id="gc-sidebar-user">
          <div class="gc-sidebar-avatar" id="gc-sb-avatar">🎮</div>
          <div class="gc-sidebar-username" id="gc-sb-username">Guest</div>
        </div>
      </div>

      <!-- Scrollable main content (phone: flex column; web: display:contents inside .gc-main) -->
      <div class="gc-main" id="gc-main-area">
        <div class="gc-scroll" id="gc-scroll">

          <!-- PHONE: stats strip -->
          <div class="gc-stats-strip" id="gc-stats-strip">
            <div class="gc-stat-cell">
              <div class="gc-stat-val" id="stat-wins">—</div>
              <div class="gc-stat-key">Wins</div>
            </div>
            <div class="gc-stat-cell">
              <div class="gc-stat-val" id="stat-games">—</div>
              <div class="gc-stat-key">Games</div>
            </div>
            <div class="gc-stat-cell">
              <div class="gc-stat-val" id="stat-online">—</div>
              <div class="gc-stat-key">Online</div>
            </div>
          </div>

          <!-- WEB: filter pills + create button in topbar -->
          <div class="gc-topbar" id="gc-topbar-web">
            <div class="gc-filter-wrap" id="gc-pills-web"></div>
            <button class="gc-create-web-btn" id="gc-create-web-btn">＋ Create Lobby</button>
          </div>

          <!-- PHONE: filter pills -->
          <div class="gc-filter-wrap" id="gc-pills-phone"></div>

          <!-- PHONE: create lobby card -->
          <div class="gc-create-card" id="gc-create-phone-btn">
            <div class="gc-create-icon">＋</div>
            <div>
              <div class="gc-create-label">Create a Lobby</div>
              <div class="gc-create-sub">Start a new game for others to join</div>
            </div>
          </div>

          <!-- Active lobbies section -->
          <div class="gc-section-label">
            <div class="gc-live-dot"></div>
            Active Lobbies
          </div>

          <div id="gc-lobby-grid" class="gc-lobby-grid"></div>

        </div><!-- /.gc-scroll -->
      </div><!-- /.gc-main -->

      <!-- PHONE: bottom nav -->
      <div class="gc-bottom-nav">
        <button class="gc-nav-item active" id="gc-nav-lobby">
          <span class="gc-nav-icon">🎲</span>
          Lobby
        </button>
        <button class="gc-nav-item" id="gc-nav-profile">
          <span class="gc-nav-icon">👤</span>
          Profile
        </button>
        <button class="gc-nav-item" id="gc-nav-settings">
          <span class="gc-nav-icon">⚙️</span>
          Settings
        </button>
      </div>

    </div>`;

  // ── Element refs ──────────────────────────────────────────────────────────
  const gcHome         = container.querySelector('.gc-home');
  const lobbyGrid      = container.querySelector('#gc-lobby-grid');
  const pillsPhone     = container.querySelector('#gc-pills-phone');
  const pillsWeb       = container.querySelector('#gc-pills-web');
  const statWins       = container.querySelector('#stat-wins');
  const statGames      = container.querySelector('#stat-games');
  const statOnline     = container.querySelector('#stat-online');
  const sbWins         = container.querySelector('#gc-sb-wins');
  const sbGames        = container.querySelector('#gc-sb-games');
  const sbOnline       = container.querySelector('#gc-sb-online');
  const sbAvatar       = container.querySelector('#gc-sb-avatar');
  const sbUsername     = container.querySelector('#gc-sb-username');
  const gcAvatarBtn    = container.querySelector('#gc-avatar-btn');

  // Web layout: the .gc-main needs to be direct child of .gc-home (it's sibling to sidebar)
  // Move .gc-main adjacent to sidebar for web layout
  const mainArea = container.querySelector('#gc-main-area');
  const gcSidebar = container.querySelector('.gc-sidebar');
  gcHome.insertBefore(mainArea, gcSidebar.nextSibling);

  // ── State ─────────────────────────────────────────────────────────────────
  let allLobbies = [];
  let activeFilter = 'all';
  let gamesList = [];    // [{gameType, label, ...}]
  let gameConfigs = {};  // gameType → config[]
  let gameMeta = {};     // gameType → metadata

  let playerInfo = null; // from /api/me/stats

  // ── Fetch player stats ────────────────────────────────────────────────────
  fetch('/api/me/stats')
    .then(r => r.json())
    .then(data => {
      playerInfo = data;
      // Stats strip (phone)
      if (statWins) statWins.textContent = data.wins ?? '—';
      if (statGames) statGames.textContent = data.gamesPlayed ?? '—';
      if (statOnline) statOnline.textContent = data.onlineCount ?? '—';
      // Sidebar (web)
      if (sbWins) sbWins.textContent = data.wins ?? '—';
      if (sbGames) sbGames.textContent = data.gamesPlayed ?? '—';
      if (sbOnline) sbOnline.textContent = data.onlineCount ?? '—';
      if (data.loggedIn) {
        if (sbAvatar) sbAvatar.textContent = data.avatarEmoji || '🎮';
        if (sbUsername) sbUsername.textContent = data.displayName || 'Player';
        if (gcAvatarBtn) gcAvatarBtn.textContent = data.avatarEmoji || '🎮';
        container.querySelector('#gc-sidebar-stats').style.display = 'flex';
      }
    })
    .catch(() => {});

  // ── Fetch games metadata ──────────────────────────────────────────────────
  fetch('/api/games')
    .then(r => r.json())
    .then(games => {
      gamesList = games || [];
      for (const g of gamesList) {
        gameConfigs[g.gameType] = g.config || [];
        gameMeta[g.gameType] = g;
      }
      renderPills();
    })
    .catch(() => {});

  // ── Fetch and render lobbies ──────────────────────────────────────────────
  function loadLobbies() {
    fetch('/api/lobbies')
      .then(r => r.json())
      .then(data => {
        allLobbies = data || [];
        renderLobbies();
      })
      .catch(() => { allLobbies = []; renderLobbies(); });
  }
  loadLobbies();

  // Poll every 8 seconds
  const pollTimer = setInterval(loadLobbies, 8000);

  // ── Pill rendering ────────────────────────────────────────────────────────
  function renderPills() {
    const pills = [{ id: 'all', label: 'All' }, ...gamesList.map(g => ({ id: g.gameType, label: g.label }))];
    const html = pills.map((p, i) =>
      `<button class="gc-pill${p.id === activeFilter ? ' active' : ''}" data-filter="${escHtml(p.id)}"
        style="animation-delay:${i * 40}ms">${escHtml(p.label)}</button>`
    ).join('');
    if (pillsPhone) pillsPhone.innerHTML = html;
    if (pillsWeb) pillsWeb.innerHTML = html;

    // Attach events to all pills
    container.querySelectorAll('.gc-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        activeFilter = pill.dataset.filter;
        container.querySelectorAll('.gc-pill').forEach(p => p.classList.toggle('active', p.dataset.filter === activeFilter));
        renderLobbies();
      });
    });
  }

  // ── Lobby card rendering ──────────────────────────────────────────────────
  function renderLobbies() {
    const filtered = activeFilter === 'all'
      ? allLobbies
      : allLobbies.filter(l => l.gameType === activeFilter);

    if (filtered.length === 0) {
      lobbyGrid.innerHTML = `<div class="gc-empty">No active lobbies${activeFilter !== 'all' ? ' for this game' : ''}.<br>Be the first to create one!</div>`;
      return;
    }

    lobbyGrid.innerHTML = filtered.map((lobby, idx) => {
      const accent = gameAccent(lobby.gameType);
      const seats  = seatLabel(lobby.playerCount, lobby.maxPlayers);
      const isFull = lobby.playerCount >= lobby.maxPlayers;

      // Avatar dots (up to 4 placeholder dots)
      const dots = Array.from({ length: Math.min(lobby.playerCount, 4) }, (_, i) =>
        `<div class="gc-card-avatar-dot" style="background:hsl(${(i * 67 + 210) % 360},55%,40%)">●</div>`
      ).join('');

      return `<div class="gc-lobby-card" data-lobby-id="${escHtml(lobby.id)}"
          style="--gc-card-accent:${accent};animation-delay:${idx * 50}ms">
        <div class="gc-card-header">
          <span class="gc-card-badge">${escHtml(lobby.gameLabel || lobby.gameType)}</span>
          <span class="gc-card-name">${escHtml(lobby.hostName)}'s Lobby</span>
        </div>
        <div class="gc-card-host">Host: ${escHtml(lobby.hostName)}</div>
        <div class="gc-card-footer">
          <div class="gc-card-avatars">${dots}</div>
          <span class="gc-card-seats">${escHtml(seats)}</span>
          <button class="gc-card-join-btn${isFull ? ' watch' : ''}" data-join-code="${escHtml(lobby.joinCode)}" data-spectate="${isFull}">
            ${isFull ? 'Watch' : 'Join'}
          </button>
        </div>
      </div>`;
    }).join('');

    // Attach join button handlers
    lobbyGrid.querySelectorAll('.gc-card-join-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const code = btn.dataset.joinCode;
        const spectate = btn.dataset.spectate === 'true';
        openJoinModal(code, spectate);
      });
    });

    // Card click also opens join
    lobbyGrid.querySelectorAll('.gc-lobby-card').forEach(card => {
      card.addEventListener('click', () => {
        const btn = card.querySelector('.gc-card-join-btn');
        if (btn) btn.click();
      });
    });
  }

  // ── Create modal ──────────────────────────────────────────────────────────
  function openCreateModal() {
    if (container.querySelector('.gc-modal-backdrop')) return;

    const gameOptions = gamesList.map(g =>
      `<option value="${escHtml(g.gameType)}">${escHtml(g.label)}</option>`
    ).join('') || '<option value="">No games available</option>';

    const backdrop = document.createElement('div');
    backdrop.className = 'gc-modal-backdrop';
    backdrop.innerHTML = `
      <div class="gc-modal" id="gc-create-modal">
        <div class="gc-modal-handle"></div>
        <div class="gc-modal-title">Create a Lobby</div>

        <div class="gc-modal-fields">
          <div>
            <label class="gc-label">Your Name</label>
            <input class="gc-input" id="cm-name" type="text" placeholder="Enter username" maxlength="32" autocomplete="username">
          </div>
          <div>
            <label class="gc-label">PIN (optional)</label>
            <input class="gc-input" id="cm-pin" type="password" placeholder="Leave blank for guest" maxlength="32">
          </div>
          <div>
            <label class="gc-label">Game</label>
            <select class="gc-input gc-select" id="cm-game">${gameOptions}</select>
          </div>
          <div id="cm-bot-info" class="gc-section-label" style="display:none;font-size:0.67rem;padding:6px 0"></div>
          <div id="cm-settings"></div>
        </div>

        <div class="gc-error-msg" id="cm-error"></div>
        <button class="gc-btn-gold" id="cm-submit">Create Lobby</button>
        <button class="gc-btn-ghost" id="cm-cancel" style="margin-top:10px">Cancel</button>
      </div>`;

    gcHome.appendChild(backdrop);

    const cmGame     = backdrop.querySelector('#cm-game');
    const cmSettings = backdrop.querySelector('#cm-settings');
    const cmBotInfo  = backdrop.querySelector('#cm-bot-info');
    const cmError    = backdrop.querySelector('#cm-error');

    function updateCmSettings() {
      const gt = cmGame.value;
      const meta = gameMeta[gt];
      const config = gameConfigs[gt] || [];

      if (meta?.botFillAllowed) {
        cmBotInfo.style.display = 'flex';
        cmBotInfo.textContent = `Bots fill automatically to ${meta.botFillMin} players`;
      } else {
        cmBotInfo.style.display = 'none';
      }

      if (config.length === 0) { cmSettings.innerHTML = ''; return; }
      cmSettings.innerHTML = config.map(field => {
        if (field.type === 'number') {
          return `<div>
            <label class="gc-label">${escHtml(field.label)}</label>
            <input class="gc-input" id="cms-${escHtml(field.key)}" type="number"
              value="${field.default ?? 0}" min="${field.min ?? 0}" step="${field.step || 1}">
          </div>`;
        }
        if (field.type === 'select') {
          const opts = (field.options || []).map(v =>
            `<option value="${escHtml(v)}"${v === field.default ? ' selected' : ''}>${escHtml(v)}</option>`
          ).join('');
          return `<div>
            <label class="gc-label">${escHtml(field.label)}</label>
            <select class="gc-input gc-select" id="cms-${escHtml(field.key)}">${opts}</select>
          </div>`;
        }
        if (field.type === 'boolean') {
          return `<div style="display:flex;align-items:center;gap:10px;padding:4px 0">
            <input type="checkbox" id="cms-${escHtml(field.key)}"${field.default ? ' checked' : ''} style="width:auto;accent-color:var(--gc-gold)">
            <label class="gc-label" for="cms-${escHtml(field.key)}" style="margin:0;text-transform:none;letter-spacing:0">${escHtml(field.label)}</label>
          </div>`;
        }
        return '';
      }).join('');
    }

    if (gamesList.length > 0) updateCmSettings();
    cmGame.addEventListener('change', updateCmSettings);

    backdrop.querySelector('#cm-submit').addEventListener('click', () => {
      const nameEl = backdrop.querySelector('#cm-name');
      const pinEl  = backdrop.querySelector('#cm-pin');
      const gt     = cmGame.value;
      if (!gt) { showModalError(cmError, 'Please select a game.'); return; }

      const settings = collectSettings(backdrop, gt);
      cmError.style.display = 'none';

      socket.emit('lobby:create', {
        gameType: gt,
        playerName: nameEl.value.trim(),
        pin: pinEl.value,
        settings,
      });
      closeModal(backdrop);
    });

    backdrop.querySelector('#cm-cancel').addEventListener('click', () => closeModal(backdrop));
    backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(backdrop); });
  }

  // ── Join modal ────────────────────────────────────────────────────────────
  function openJoinModal(prefillCode = '', asSpectate = false) {
    if (container.querySelector('.gc-modal-backdrop')) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'gc-modal-backdrop';
    backdrop.innerHTML = `
      <div class="gc-modal" id="gc-join-modal">
        <div class="gc-modal-handle"></div>
        <div class="gc-modal-title">${asSpectate ? 'Watch a Lobby' : 'Join a Lobby'}</div>

        <div class="gc-modal-fields">
          <div>
            <label class="gc-label">Your Name</label>
            <input class="gc-input" id="jm-name" type="text" placeholder="Enter username" maxlength="32" autocomplete="username">
          </div>
          <div>
            <label class="gc-label">PIN (optional)</label>
            <input class="gc-input" id="jm-pin" type="password" placeholder="Leave blank for guest" maxlength="32">
          </div>
          <div>
            <label class="gc-label">Join Code</label>
            <input class="gc-input" id="jm-code" type="text" placeholder="e.g. AB3X" maxlength="4"
              value="${escHtml(prefillCode)}"
              style="text-transform:uppercase;letter-spacing:4px;font-size:1.1rem;font-weight:700;text-align:center">
          </div>
        </div>

        <div class="gc-error-msg" id="jm-error"></div>
        <button class="gc-btn-gold" id="jm-submit">${asSpectate ? 'Watch' : 'Join Lobby'}</button>
        <button class="gc-btn-ghost" id="jm-cancel" style="margin-top:10px">Cancel</button>
      </div>`;

    gcHome.appendChild(backdrop);

    const jmCode  = backdrop.querySelector('#jm-code');
    const jmError = backdrop.querySelector('#jm-error');

    jmCode.addEventListener('input', () => { jmCode.value = jmCode.value.toUpperCase(); });

    backdrop.querySelector('#jm-submit').addEventListener('click', () => {
      const code = jmCode.value.trim().toUpperCase();
      if (!code || code.length < 2) { showModalError(jmError, 'Please enter a valid join code.'); return; }
      jmError.style.display = 'none';

      socket.emit('lobby:join', {
        joinCode: code,
        playerName: backdrop.querySelector('#jm-name').value.trim(),
        pin: backdrop.querySelector('#jm-pin').value,
        asSpectator: asSpectate,
      });
      closeModal(backdrop);
    });

    backdrop.querySelector('#jm-cancel').addEventListener('click', () => closeModal(backdrop));
    backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(backdrop); });

    // Pre-fill from URL param if present
    if (prefillCode) jmCode.focus();
    else backdrop.querySelector('#jm-name').focus();
  }

  // ── Modal helpers ─────────────────────────────────────────────────────────
  function closeModal(backdrop) {
    backdrop.remove();
  }

  function showModalError(el, msg) {
    el.textContent = msg;
    el.style.display = 'block';
  }

  function collectSettings(root, gameType) {
    const config = gameConfigs[gameType] || [];
    const settings = {};
    for (const field of config) {
      const el = root.querySelector(`#cms-${field.key}`);
      if (!el) continue;
      if (field.type === 'number') settings[field.key] = parseFloat(el.value) || field.default || 0;
      else if (field.type === 'select') settings[field.key] = el.value;
      else if (field.type === 'boolean') settings[field.key] = el.checked;
    }
    return settings;
  }

  // ── Button wiring ─────────────────────────────────────────────────────────
  container.querySelector('#gc-create-phone-btn')?.addEventListener('click', openCreateModal);
  container.querySelector('#gc-create-web-btn')?.addEventListener('click', openCreateModal);
  container.querySelector('#gc-avatar-btn')?.addEventListener('click', () => navigate('profile'));
  container.querySelector('#gc-sidebar-user')?.addEventListener('click', () => navigate('profile'));
  container.querySelector('#gc-sb-profile')?.addEventListener('click', () => navigate('profile'));
  container.querySelector('#gc-nav-profile')?.addEventListener('click', () => navigate('profile'));

  // If there's a prefill join code open join modal automatically
  if (prefillCode) {
    setTimeout(() => openJoinModal(prefillCode, false), 150);
  }

  // ── Socket error ─────────────────────────────────────────────────────────
  function onError(code, message) {
    const modal = container.querySelector('.gc-modal-backdrop');
    if (modal) {
      const errEl = modal.querySelector('.gc-error-msg');
      if (errEl) showModalError(errEl, message);
    }
  }

  return {
    onError,
    destroy() { clearInterval(pollTimer); },
  };
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
