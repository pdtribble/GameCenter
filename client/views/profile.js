// Profile view — player stats dashboard

export function renderProfile(container, socket, state, navigate) {
  container.innerHTML = `
    <div class="page">
      <div class="card" style="margin-bottom:var(--spacing-md)">
        <h1 class="section-heading">Your Profile</h1>
        <div class="flex items-center gap-md" style="margin-bottom:var(--spacing-lg)">
          <div class="avatar" id="profile-avatar" style="width:64px;height:64px;font-size:2rem;background:var(--color-accent)">🎮</div>
          <div>
            <div style="font-size:var(--font-size-lg);font-weight:700" id="profile-name">Loading...</div>
            <div class="text-muted" id="profile-username"></div>
          </div>
        </div>

        <h2 class="section-heading" style="font-size:var(--font-size-md)">Customize</h2>
        <div class="form-group">
          <label>Display Name</label>
          <input class="input" id="edit-name" type="text" maxlength="32" placeholder="Display name">
        </div>
        <div class="form-group">
          <label>Avatar Emoji</label>
          <input class="input" id="edit-emoji" type="text" maxlength="4" placeholder="🎮">
        </div>
        <div class="form-group">
          <label>Avatar Color</label>
          <input class="input" id="edit-color" type="color" value="#6366f1">
        </div>
        <button class="btn btn-primary btn-sm" id="btn-save">Save Changes</button>
      </div>

      <div class="card" style="margin-bottom:var(--spacing-md)">
        <h2 class="section-heading" style="font-size:var(--font-size-lg)">Stats</h2>
        <div id="stats-section"><div class="spinner"></div></div>
      </div>

      <div class="card">
        <h2 class="section-heading" style="font-size:var(--font-size-lg)">Achievements</h2>
        <div id="achievements-section"><div class="spinner"></div></div>
      </div>
    </div>`;

  // Fetch profile data from status endpoint
  fetch('/status').then(r => r.json()).then(serverData => {
    // For now show placeholder — full stats would require a /api/me endpoint
    document.querySelector('#stats-section').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--spacing-md)">
        <div class="flex flex-col items-center">
          <div style="font-size:var(--font-size-xl);font-weight:800">—</div>
          <div class="text-muted">Games Played</div>
        </div>
        <div class="flex flex-col items-center">
          <div style="font-size:var(--font-size-xl);font-weight:800">—</div>
          <div class="text-muted">Wins</div>
        </div>
        <div class="flex flex-col items-center">
          <div style="font-size:var(--font-size-xl);font-weight:800">—</div>
          <div class="text-muted">Win Streak</div>
        </div>
      </div>`;
    document.querySelector('#achievements-section').innerHTML = '<p class="text-muted">Earn achievements by playing games.</p>';
  }).catch(() => {});

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
