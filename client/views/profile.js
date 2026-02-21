// Profile view — player stats dashboard (gc-* design system)

export function renderProfile(container, socket, state, navigate) {
  container.innerHTML = `
    <div class="gc-profile">
      <div class="gc-profile-inner">
        <div class="gc-profile-card">
          <h1 class="gc-section-label" style="margin-bottom:14px;font-size:0.7rem">Your Profile</h1>
          <div class="gc-profile-header">
            <div class="gc-profile-avatar" id="profile-avatar">🎮</div>
            <div class="gc-profile-info">
              <div class="gc-profile-name" id="profile-name">Loading...</div>
              <div class="gc-profile-muted" id="profile-username"></div>
            </div>
          </div>

          <h2 class="gc-section-label" style="margin:20px 0 12px;font-size:0.65rem">Customize</h2>
          <div class="gc-modal-fields">
            <div>
              <label class="gc-label">Display Name</label>
              <input class="gc-input" id="edit-name" type="text" maxlength="32" placeholder="Display name">
            </div>
            <div>
              <label class="gc-label">Avatar Emoji</label>
              <input class="gc-input" id="edit-emoji" type="text" maxlength="4" placeholder="🎮">
            </div>
            <div>
              <label class="gc-label">Avatar Color</label>
              <input class="gc-input" id="edit-color" type="color" value="#6366f1" style="height:40px;padding:4px;cursor:pointer">
            </div>
          </div>
          <button class="gc-btn-gold" id="btn-save">Save Changes</button>
        </div>

        <div class="gc-profile-card">
          <h2 class="gc-section-label" style="margin-bottom:14px;font-size:0.7rem">Stats</h2>
          <div id="stats-section"><div class="gc-spinner"></div></div>
        </div>

        <div class="gc-profile-card">
          <h2 class="gc-section-label" style="margin-bottom:14px;font-size:0.7rem">Achievements</h2>
          <div id="achievements-section"><div class="gc-spinner"></div></div>
        </div>
      </div>
    </div>`;

  // Fetch profile data from status endpoint
  fetch('/status').then(r => r.json()).then(serverData => {
    document.querySelector('#stats-section').innerHTML = `
      <div class="gc-stats-strip" style="margin:0">
        <div class="gc-stat-cell">
          <div class="gc-stat-val">—</div>
          <div class="gc-stat-key">Games Played</div>
        </div>
        <div class="gc-stat-cell">
          <div class="gc-stat-val">—</div>
          <div class="gc-stat-key">Wins</div>
        </div>
        <div class="gc-stat-cell">
          <div class="gc-stat-val">—</div>
          <div class="gc-stat-key">Win Streak</div>
        </div>
      </div>`;
    document.querySelector('#achievements-section').innerHTML = '<p class="gc-muted-text">Earn achievements by playing games.</p>';
  }).catch(() => {});

  // Load /api/me/stats for display name and avatar
  fetch('/api/me/stats')
    .then(r => r.json())
    .then(data => {
      const nameEl = container.querySelector('#profile-name');
      const usernameEl = container.querySelector('#profile-username');
      const avatarEl = container.querySelector('#profile-avatar');
      const editName = container.querySelector('#edit-name');
      const editEmoji = container.querySelector('#edit-emoji');
      const editColor = container.querySelector('#edit-color');
      if (data.loggedIn) {
        if (nameEl) nameEl.textContent = data.displayName || 'Player';
        if (usernameEl) usernameEl.textContent = data.playerId ? `ID: ${String(data.playerId).slice(0, 8)}…` : '';
        if (avatarEl) avatarEl.textContent = data.avatarEmoji || '🎮';
        if (editName) editName.value = data.displayName || '';
        if (editEmoji) editEmoji.value = data.avatarEmoji || '🎮';
        if (editColor) editColor.value = data.avatarColor || '#6366f1';
        const statsSection = container.querySelector('#stats-section');
        if (statsSection) {
          statsSection.innerHTML = `
            <div class="gc-stats-strip" style="margin:0">
              <div class="gc-stat-cell">
                <div class="gc-stat-val">${data.gamesPlayed ?? '—'}</div>
                <div class="gc-stat-key">Games Played</div>
              </div>
              <div class="gc-stat-cell">
                <div class="gc-stat-val">${data.wins ?? '—'}</div>
                <div class="gc-stat-key">Wins</div>
              </div>
              <div class="gc-stat-cell">
                <div class="gc-stat-val">—</div>
                <div class="gc-stat-key">Win Streak</div>
              </div>
            </div>`;
        }
      }
    })
    .catch(() => {});

  container.querySelector('#btn-save').addEventListener('click', () => {
    socket.emit('player:update', {
      displayName: container.querySelector('#edit-name').value.trim(),
      avatarEmoji: container.querySelector('#edit-emoji').value.trim(),
      avatarColor: container.querySelector('#edit-color').value,
    });
  });

  return {
    onError(code, msg) { alert(msg); },
    destroy() {},
  };
}
