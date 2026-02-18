// Home view — landing, login, guest mode, create/join lobby

export function renderHome(container, socket, state, navigate) {
  // Pre-fill join code from URL if present
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
              <option value="blackjack">Blackjack</option>
              <option value="poker">Texas Hold'em Poker</option>
              <option value="bs">BS (Cheat)</option>
              <option value="game_night">🌙 Game Night (multi-game)</option>
            </select>
          </div>
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

        <div style="display:flex;gap:var(--spacing-sm);justify-content:center">
          <button class="btn btn-secondary btn-sm" id="btn-leaderboard">🏆 Leaderboard</button>
        </div>
      </div>
    </div>`;

  // Clear URL params
  if (prefillCode) history.replaceState({}, '', '/');

  const nameInput = container.querySelector('#input-name');
  const pinInput = container.querySelector('#input-pin');
  const gameTypeSelect = container.querySelector('#input-game-type');
  const joinCodeInput = container.querySelector('#input-join-code');
  const authError = container.querySelector('#auth-error');
  const joinError = container.querySelector('#join-error');

  joinCodeInput.addEventListener('input', () => {
    joinCodeInput.value = joinCodeInput.value.toUpperCase();
  });

  container.querySelector('#btn-create').addEventListener('click', () => {
    clearErrors();
    socket.emit('lobby:create', {
      gameType: gameTypeSelect.value,
      playerName: nameInput.value.trim(),
      pin: pinInput.value,
    });
  });

  container.querySelector('#btn-join').addEventListener('click', () => {
    clearErrors();
    const code = joinCodeInput.value.trim().toUpperCase();
    if (!code || code.length !== 4) {
      showError(joinError, 'Please enter a 4-character join code.');
      return;
    }
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
    if (!code || code.length !== 4) {
      showError(joinError, 'Please enter a 4-character join code.');
      return;
    }
    socket.emit('lobby:join', {
      joinCode: code,
      playerName: nameInput.value.trim(),
      pin: pinInput.value,
      asSpectator: true,
    });
  });

  container.querySelector('#btn-leaderboard').addEventListener('click', () => navigate('leaderboard'));

  function clearErrors() { authError.style.display = 'none'; joinError.style.display = 'none'; }
  function showError(el, msg) { el.textContent = msg; el.style.display = 'block'; }

  return {
    onError(code, message) { showError(authError, message); },
    destroy() {},
  };
}
