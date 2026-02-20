// Home view — landing, login, guest mode, create/join lobby

export function renderHome(container, socket, state, navigate) {
  const params = new URLSearchParams(location.search);
  const prefillCode = params.get('join') || '';

  container.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:var(--spacing-md);">
      <div style="width:100%;max-width:440px;display:flex;flex-direction:column;gap:var(--spacing-md);">
        <div class="text-center" style="margin-bottom:var(--spacing-md)">
          <div style="font-size:3rem;margin-bottom:var(--spacing-sm)">🎮</div>
          <h1 style="font-size:var(--font-size-xl);font-weight:800;color:var(--color-accent)">GameCenter</h1>
          <p class="text-muted">Multiplayer card &amp; table games</p>
        </div>

        <div class="card" id="auth-section">
          <h2 class="section-heading" style="font-size:var(--font-size-lg)">Who are you?</h2>
          <div class="form-group">
            <label for="input-name">Username</label>
            <input class="input" id="input-name" type="text" placeholder="Enter username" maxlength="32" autocomplete="username">
          </div>
          <div class="form-group">
            <label for="input-pin">PIN (optional — creates/authenticates account)</label>
            <input class="input" id="input-pin" type="password" placeholder="Leave blank for guest" maxlength="32">
          </div>
          <div id="auth-error" class="error-msg" style="display:none"></div>
        </div>

        <div class="card">
          <h2 class="section-heading" style="font-size:var(--font-size-lg)">Create a Lobby</h2>
          <div class="form-group">
            <label for="input-game-type">Game</label>
            <select class="input" id="input-game-type">
              <option value="" disabled selected>Loading games...</option>
            </select>
          </div>
          <div id="bot-fill-info" class="text-muted" style="font-size:var(--font-size-sm);margin-bottom:var(--spacing-sm);display:none"></div>
          <div id="game-settings-fields"></div>
          <button class="btn btn-primary btn-full" id="btn-create">Create Lobby</button>
        </div>

        <div class="card">
          <h2 class="section-heading" style="font-size:var(--font-size-lg)">Join a Lobby</h2>
          <div class="form-group">
            <label for="input-join-code">Join Code</label>
            <input class="input" id="input-join-code" type="text" placeholder="e.g. AB3X"
              maxlength="4" autocomplete="off" value="${prefillCode}"
              style="text-transform:uppercase;letter-spacing:4px;font-size:var(--font-size-lg);font-weight:700;text-align:center">
          </div>
          <div id="join-error" class="error-msg" style="display:none"></div>
          <div style="display:flex;gap:var(--spacing-sm)">
            <button class="btn btn-secondary btn-full" id="btn-join-spectate">Watch</button>
            <button class="btn btn-primary btn-full" id="btn-join">Join</button>
          </div>
        </div>
      </div>
    </div>`;

  if (prefillCode) history.replaceState({}, '', '/');

  const nameInput = container.querySelector('#input-name');
  const pinInput = container.querySelector('#input-pin');
  const gameTypeSelect = container.querySelector('#input-game-type');
  const joinCodeInput = container.querySelector('#input-join-code');
  const authError = container.querySelector('#auth-error');
  const joinError = container.querySelector('#join-error');
  const settingsFields = container.querySelector('#game-settings-fields');
  const botFillInfo = container.querySelector('#bot-fill-info');

  let gameConfigs = {};
  let gameMeta = {};

  fetch('/api/games')
    .then(r => r.json())
    .then(games => {
      if (!games || games.length === 0) {
        gameTypeSelect.innerHTML = '<option value="" disabled>No games available</option>';
        return;
      }
      gameTypeSelect.innerHTML = games.map(g =>
        `<option value="${escHtml(g.gameType)}">${escHtml(g.label)}</option>`
      ).join('');
      for (const g of games) {
        gameConfigs[g.gameType] = g.config || [];
        gameMeta[g.gameType] = g;
      }
      renderSettingsFields(games[0].gameType);
      updateBotFillInfo(games[0].gameType);
    })
    .catch(() => {
      gameTypeSelect.innerHTML = '<option value="" disabled>Failed to load games</option>';
    });

  function updateBotFillInfo(gameType) {
    const meta = gameMeta[gameType];
    if (meta && meta.botFillAllowed) {
      botFillInfo.textContent = `Bots will fill automatically to reach ${meta.botFillMin} players minimum.`;
      botFillInfo.style.display = 'block';
    } else {
      botFillInfo.style.display = 'none';
    }
  }

  function renderSettingsFields(gameType) {
    const config = gameConfigs[gameType] || [];
    if (config.length === 0) { settingsFields.innerHTML = ''; return; }

    settingsFields.innerHTML = config.map(field => {
      if (field.type === 'number') {
        return `<div class="form-group">
          <label>${escHtml(field.label)}</label>
          <input class="input" id="gs-${escHtml(field.key)}" type="number"
            value="${field.default ?? 0}" min="${field.min ?? 0}" step="${field.step || 1}">
        </div>`;
      }
      if (field.type === 'select') {
        const opts = (field.options || []).map(v =>
          `<option value="${escHtml(v)}"${v === field.default ? ' selected' : ''}>${escHtml(v)}</option>`
        ).join('');
        return `<div class="form-group">
          <label>${escHtml(field.label)}</label>
          <select class="input" id="gs-${escHtml(field.key)}">${opts}</select>
        </div>`;
      }
      if (field.type === 'boolean') {
        return `<div class="form-group" style="flex-direction:row;align-items:center;gap:var(--spacing-sm)">
          <input type="checkbox" id="gs-${escHtml(field.key)}"${field.default ? ' checked' : ''} style="width:auto">
          <label for="gs-${escHtml(field.key)}" style="margin:0">${escHtml(field.label)}</label>
        </div>`;
      }
      return '';
    }).join('');
  }

  function collectSettings(gameType) {
    const config = gameConfigs[gameType] || [];
    const settings = {};
    for (const field of config) {
      const el = container.querySelector(`#gs-${field.key}`);
      if (!el) continue;
      if (field.type === 'number') settings[field.key] = parseFloat(el.value) || field.default || 0;
      else if (field.type === 'select') settings[field.key] = el.value;
      else if (field.type === 'boolean') settings[field.key] = el.checked;
    }
    return settings;
  }

  gameTypeSelect.addEventListener('change', () => {
    renderSettingsFields(gameTypeSelect.value);
    updateBotFillInfo(gameTypeSelect.value);
  });

  joinCodeInput.addEventListener('input', () => {
    joinCodeInput.value = joinCodeInput.value.toUpperCase();
  });

  container.querySelector('#btn-create').addEventListener('click', () => {
    clearErrors();
    const gameType = gameTypeSelect.value;
    if (!gameType) return showError(authError, 'Please select a game.');
    socket.emit('lobby:create', {
      gameType,
      playerName: nameInput.value.trim(),
      pin: pinInput.value,
      settings: collectSettings(gameType),
    });
  });

  container.querySelector('#btn-join').addEventListener('click', () => {
    clearErrors();
    const code = joinCodeInput.value.trim().toUpperCase();
    if (!code) { showError(joinError, 'Please enter a join code.'); return; }
    socket.emit('lobby:join', {
      joinCode: code,
      playerName: nameInput.value.trim(),
      pin: pinInput.value,
      asSpectator: false,
    });
  });

  container.querySelector('#btn-join-spectate').addEventListener('click', () => {
    clearErrors();
    const code = joinCodeInput.value.trim().toUpperCase();
    if (!code) { showError(joinError, 'Please enter a join code.'); return; }
    socket.emit('lobby:join', {
      joinCode: code,
      playerName: nameInput.value.trim(),
      pin: pinInput.value,
      asSpectator: true,
    });
  });

  function clearErrors() { authError.style.display = 'none'; joinError.style.display = 'none'; }
  function showError(el, msg) { el.textContent = msg; el.style.display = 'block'; }

  return {
    onError(code, message) { showError(authError, message); },
    destroy() {},
  };
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
