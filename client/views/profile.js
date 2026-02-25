// Profile view — STATS + SETTINGS sub-tabs (gc-* design system)

export function renderProfile(container, socket, state, navigate) {
  container.innerHTML = `
    <div class="gc-profile" style="overflow-y:auto;height:100%;box-sizing:border-box">
      <div style="max-width:540px;margin:0 auto;padding:20px 16px 48px">

        <!-- Tab bar -->
        <div style="display:flex;border-bottom:1px solid var(--gc-border);margin-bottom:24px">
          <button class="prof-tab" data-tab="stats"
            style="flex:1;background:none;border:none;border-bottom:2px solid var(--gc-gold);color:var(--gc-text);font-family:var(--gc-mono);font-size:0.7rem;letter-spacing:2px;padding:10px;cursor:pointer;margin-bottom:-1px;-webkit-tap-highlight-color:transparent">STATS</button>
          <button class="prof-tab" data-tab="settings"
            style="flex:1;background:none;border:none;border-bottom:2px solid transparent;color:var(--gc-muted);font-family:var(--gc-mono);font-size:0.7rem;letter-spacing:2px;padding:10px;cursor:pointer;margin-bottom:-1px;-webkit-tap-highlight-color:transparent">SETTINGS</button>
        </div>

        <!-- ── STATS PANEL ─────────────────────────────────────────────────── -->
        <div id="prof-stats" class="prof-panel">

          <!-- Player card -->
          <div style="background:var(--gc-surface);border-radius:12px;padding:18px;margin-bottom:20px;border:1px solid var(--gc-border);display:flex;align-items:center;gap:16px">
            <div id="prof-avatar-circle" style="width:54px;height:54px;border-radius:50%;background:var(--gc-purple);display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:800;color:#fff;flex-shrink:0;font-family:var(--gc-font)">?</div>
            <div style="flex:1;min-width:0">
              <div id="prof-display-name" style="color:var(--gc-text);font-size:1.05rem;font-weight:700;font-family:var(--gc-font);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Loading…</div>
              <div id="prof-username-row"  style="color:var(--gc-muted);font-family:var(--gc-mono);font-size:0.68rem;margin-top:3px"></div>
              <div id="prof-since-row"     style="color:rgba(240,240,248,0.2);font-family:var(--gc-mono);font-size:0.62rem;margin-top:2px"></div>
            </div>
          </div>

          <!-- Multiplayer stats -->
          <div style="margin-bottom:20px">
            <div class="gc-section-label" style="margin-bottom:12px">Multiplayer</div>
            <div id="mp-stats-list" style="display:flex;flex-direction:column;gap:8px">
              <div style="color:var(--gc-muted);font-family:var(--gc-mono);font-size:0.75rem">Loading…</div>
            </div>
          </div>

          <!-- Singleplayer stats -->
          <div style="margin-bottom:20px">
            <div class="gc-section-label" style="margin-bottom:12px">Singleplayer</div>
            <div id="sp-stats-content">
              <div style="color:var(--gc-muted);font-family:var(--gc-mono);font-size:0.75rem">Loading…</div>
            </div>
          </div>

          <!-- Recent activity -->
          <div>
            <div class="gc-section-label" style="margin-bottom:12px">Recent Activity</div>
            <div id="activity-list">
              <div style="color:var(--gc-muted);font-family:var(--gc-mono);font-size:0.75rem">Loading…</div>
            </div>
          </div>

        </div><!-- /prof-stats -->

        <!-- ── SETTINGS PANEL ──────────────────────────────────────────────── -->
        <div id="prof-settings" class="prof-panel" style="display:none">

          <!-- Preferences -->
          <div class="gc-section-label" style="margin-bottom:12px">Preferences</div>
          <div style="background:var(--gc-surface);border-radius:12px;overflow:hidden;border:1px solid var(--gc-border);margin-bottom:20px">
            ${mkToggle('gc_sound',     'Sound Effects', 'true')}
            <div style="height:1px;background:var(--gc-border);margin:0 16px"></div>
            ${mkToggle('gc_show_code', 'Show Join Code in Game', 'true')}
            <div style="height:1px;background:var(--gc-border);margin:0 16px"></div>
            ${mkToggle('gc_compact',   'Compact Lobby', 'false')}
          </div>

          <!-- Account -->
          <div class="gc-section-label" style="margin-bottom:12px">Account</div>
          <div style="background:var(--gc-surface);border-radius:12px;padding:16px;border:1px solid var(--gc-border);margin-bottom:20px;display:flex;flex-direction:column;gap:16px">
            <!-- Display name -->
            <div>
              <label class="gc-label" style="display:block;margin-bottom:6px">Display Name</label>
              <div style="display:flex;gap:8px">
                <input id="edit-display-name" class="gc-input" type="text" maxlength="32" placeholder="Display name" style="flex:1">
                <button id="btn-save-name" class="gc-btn-gold" style="width:auto;padding:0 16px;flex-shrink:0">Save</button>
              </div>
              <div id="name-msg" style="min-height:16px;font-family:var(--gc-mono);font-size:0.65rem;margin-top:5px"></div>
            </div>
            <!-- Avatar color -->
            <div>
              <label class="gc-label" style="display:block;margin-bottom:6px">Avatar Color</label>
              <div style="display:flex;gap:10px;align-items:center">
                <input id="edit-avatar-color" type="color" value="#6366f1"
                  style="width:44px;height:44px;border:none;padding:2px;border-radius:8px;background:var(--gc-surface2);cursor:pointer;flex-shrink:0">
                <button id="btn-save-color" class="gc-btn-gold" style="width:auto;padding:0 16px">Save Color</button>
              </div>
              <div id="color-msg" style="min-height:16px;font-family:var(--gc-mono);font-size:0.65rem;margin-top:5px"></div>
            </div>
          </div>

          <!-- Data -->
          <div class="gc-section-label" style="margin-bottom:12px">Data</div>
          <div style="background:var(--gc-surface);border-radius:12px;padding:16px;border:1px solid var(--gc-border);margin-bottom:20px">
            <button id="btn-clear-saves" class="gc-btn-ghost" style="border-color:var(--gc-red);color:var(--gc-red)">Clear Solo Saves</button>
            <div id="clear-msg" style="min-height:16px;font-family:var(--gc-mono);font-size:0.65rem;margin-top:6px"></div>
          </div>

          <!-- About -->
          <div class="gc-section-label" style="margin-bottom:12px">About</div>
          <div style="background:var(--gc-surface);border-radius:12px;padding:16px;border:1px solid var(--gc-border)">
            <div style="color:var(--gc-muted);font-family:var(--gc-mono);font-size:0.7rem;line-height:1.9">
              <div style="color:var(--gc-text)">GameCenter</div>
              <div>Self-hosted multiplayer game platform</div>
              <div style="color:rgba(240,240,248,0.2);margin-top:4px">v1.0.0</div>
            </div>
          </div>

        </div><!-- /prof-settings -->

      </div>
    </div>`;

  // ── Tab switching ───────────────────────────────────────────────────────────
  container.querySelectorAll('.prof-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.prof-tab').forEach(t => {
        t.style.borderBottomColor = 'transparent';
        t.style.color = 'var(--gc-muted)';
      });
      container.querySelectorAll('.prof-panel').forEach(p => p.style.display = 'none');
      tab.style.borderBottomColor = 'var(--gc-gold)';
      tab.style.color = 'var(--gc-text)';
      container.querySelector(`#prof-${tab.dataset.tab}`).style.display = 'block';
    });
  });

  // ── Toggle switches ─────────────────────────────────────────────────────────
  container.querySelectorAll('.prof-toggle').forEach(cb => {
    const wrap  = cb.closest('.prof-toggle-wrap');
    const track = wrap.querySelector('.prof-toggle-track');
    const thumb = wrap.querySelector('.prof-toggle-thumb');
    const syncVisual = () => {
      track.style.background = cb.checked ? 'var(--gc-green)' : 'rgba(255,255,255,0.1)';
      thumb.style.transform  = cb.checked ? 'translateX(20px)' : 'none';
    };
    // Init state from localStorage
    const stored = localStorage.getItem(cb.dataset.key);
    cb.checked = stored !== null ? stored === 'true' : cb.dataset.default === 'true';
    syncVisual();
    cb.addEventListener('change', () => {
      localStorage.setItem(cb.dataset.key, cb.checked ? 'true' : 'false');
      syncVisual();
    });
  });

  // ── Save display name ───────────────────────────────────────────────────────
  const editNameEl = container.querySelector('#edit-display-name');
  const nameMsgEl  = container.querySelector('#name-msg');
  container.querySelector('#btn-save-name').addEventListener('click', () => {
    const val = editNameEl.value.trim();
    if (!val) { showMsg(nameMsgEl, 'Name cannot be empty.', 'error'); return; }
    fetch('/api/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: val }),
    }).then(r => r.json()).then(data => {
      if (data.error) { showMsg(nameMsgEl, data.error, 'error'); return; }
      showMsg(nameMsgEl, 'Saved!', 'success');
      const nameEl = container.querySelector('#prof-display-name');
      if (nameEl) nameEl.textContent = val;
      const avatarEl = container.querySelector('#prof-avatar-circle');
      if (avatarEl && val) avatarEl.textContent = val.charAt(0).toUpperCase();
    }).catch(() => showMsg(nameMsgEl, 'Failed to save.', 'error'));
  });

  // ── Save avatar color ───────────────────────────────────────────────────────
  const editColorEl = container.querySelector('#edit-avatar-color');
  const colorMsgEl  = container.querySelector('#color-msg');
  container.querySelector('#btn-save-color').addEventListener('click', () => {
    const val = editColorEl.value;
    fetch('/api/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatar_color: val }),
    }).then(r => r.json()).then(data => {
      if (data.error) { showMsg(colorMsgEl, data.error, 'error'); return; }
      showMsg(colorMsgEl, 'Saved!', 'success');
      const avatarEl = container.querySelector('#prof-avatar-circle');
      if (avatarEl) avatarEl.style.background = val;
    }).catch(() => showMsg(colorMsgEl, 'Failed to save.', 'error'));
  });

  // ── Clear solo saves ────────────────────────────────────────────────────────
  const clearMsgEl = container.querySelector('#clear-msg');
  const btnClear   = container.querySelector('#btn-clear-saves');
  let clearPending = false;
  let clearTimer   = null;
  btnClear.addEventListener('click', () => {
    if (!clearPending) {
      clearPending = true;
      btnClear.textContent = 'Tap again to confirm';
      clearTimer = setTimeout(() => {
        clearPending = false;
        if (btnClear.isConnected) btnClear.textContent = 'Clear Solo Saves';
      }, 3000);
      return;
    }
    clearTimeout(clearTimer);
    clearPending = false;
    btnClear.textContent = 'Clear Solo Saves';
    // Fetch save slots then delete each
    fetch('/api/sp/saves/minesweeper')
      .then(r => r.json())
      .then(saves => {
        const slots = Object.keys(saves || {});
        if (!slots.length) { showMsg(clearMsgEl, 'No saves to clear.', 'success'); return; }
        Promise.all(slots.map(slot =>
          fetch(`/api/sp/saves/minesweeper/${slot}`, { method: 'DELETE' })
        )).then(() => showMsg(clearMsgEl, `${slots.length} save${slots.length > 1 ? 's' : ''} cleared.`, 'success'))
          .catch(() => showMsg(clearMsgEl, 'Failed to clear saves.', 'error'));
      }).catch(() => showMsg(clearMsgEl, 'Failed.', 'error'));
  });

  // ── Fetch & render profile data ─────────────────────────────────────────────
  Promise.all([
    fetch('/api/me/stats').then(r => r.json()).catch(() => null),
    fetch('/api/me').then(r => r.json()).catch(() => null),
    fetch('/api/me/history').then(r => r.json()).catch(() => null),
  ]).then(([stats, me, history]) => {
    renderPlayerCard(container, stats, me);
    renderMpStats(container, stats);
    renderSpStats(container, stats);
    renderActivity(container, history);

    // Pre-fill settings inputs with current values
    if (stats?.loggedIn) {
      if (editNameEl)  editNameEl.value  = stats.displayName  || '';
      if (editColorEl) editColorEl.value = stats.avatarColor  || '#6366f1';
    }
  });

  return { destroy() {} };
}

// ── Helper: render player card ────────────────────────────────────────────────
function renderPlayerCard(container, stats, me) {
  const avatarEl = container.querySelector('#prof-avatar-circle');
  const nameEl   = container.querySelector('#prof-display-name');
  const userEl   = container.querySelector('#prof-username-row');
  const sinceEl  = container.querySelector('#prof-since-row');

  if (!stats?.loggedIn) {
    if (nameEl)   nameEl.textContent  = 'Guest';
    if (userEl)   userEl.textContent  = 'Not logged in';
    if (sinceEl)  sinceEl.textContent = '';
    return;
  }

  const name  = stats.displayName || 'Player';
  const color = stats.avatarColor || '#6366f1';
  if (avatarEl) { avatarEl.textContent = name.charAt(0).toUpperCase(); avatarEl.style.background = color; }
  if (nameEl)   nameEl.textContent = name;
  if (me?.username && userEl) userEl.textContent = `@${me.username}`;
  if (me?.created_at && sinceEl) {
    const d = new Date(me.created_at);
    if (!isNaN(d)) sinceEl.textContent = `Member since ${d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
  }
}

// ── Helper: render multiplayer stats ─────────────────────────────────────────
function renderMpStats(container, stats) {
  const el = container.querySelector('#mp-stats-list');
  if (!el) return;

  const mp = stats?.multiplayer;
  if (!mp || !Object.keys(mp).length) {
    el.innerHTML = '<div style="color:var(--gc-muted);font-family:var(--gc-mono);font-size:0.75rem;padding:4px 0">No multiplayer games yet.</div>';
    return;
  }

  el.innerHTML = Object.entries(mp).map(([gameType, d]) => {
    const label   = gameType.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const winRate = d.played ? Math.round((d.wins / d.played) * 100) : 0;
    return `
      <div style="background:var(--gc-surface);border-radius:8px;padding:12px 14px;border:1px solid var(--gc-border)">
        <div style="color:var(--gc-muted);font-family:var(--gc-mono);font-size:0.63rem;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px">${label}</div>
        <div style="display:flex;gap:20px">
          <div>
            <div style="color:var(--gc-text);font-size:1.05rem;font-weight:700;font-family:var(--gc-font)">${d.played}</div>
            <div style="color:var(--gc-muted);font-family:var(--gc-mono);font-size:0.62rem">Played</div>
          </div>
          <div>
            <div style="color:var(--gc-green);font-size:1.05rem;font-weight:700;font-family:var(--gc-font)">${d.wins}</div>
            <div style="color:var(--gc-muted);font-family:var(--gc-mono);font-size:0.62rem">Wins</div>
          </div>
          <div>
            <div style="color:var(--gc-red);font-size:1.05rem;font-weight:700;font-family:var(--gc-font)">${d.losses || 0}</div>
            <div style="color:var(--gc-muted);font-family:var(--gc-mono);font-size:0.62rem">Losses</div>
          </div>
          <div>
            <div style="color:var(--gc-gold);font-size:1.05rem;font-weight:700;font-family:var(--gc-font)">${winRate}%</div>
            <div style="color:var(--gc-muted);font-family:var(--gc-mono);font-size:0.62rem">Win Rate</div>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ── Helper: render singleplayer stats ────────────────────────────────────────
function renderSpStats(container, stats) {
  const el = container.querySelector('#sp-stats-content');
  if (!el) return;

  const ms = stats?.singleplayer?.minesweeper;
  if (!ms) {
    el.innerHTML = '<div style="color:var(--gc-muted);font-family:var(--gc-mono);font-size:0.75rem;padding:4px 0">No singleplayer games yet.</div>';
    return;
  }

  const fmtTime = s => {
    if (s == null) return '—';
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  const bt = ms.bestTimes || {};
  el.innerHTML = `
    <div style="background:var(--gc-surface);border-radius:8px;padding:12px 14px;border:1px solid var(--gc-border)">
      <div style="color:var(--gc-muted);font-family:var(--gc-mono);font-size:0.63rem;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px">Minesweeper</div>
      <div style="display:flex;gap:20px;margin-bottom:14px">
        <div>
          <div style="color:var(--gc-text);font-size:1.05rem;font-weight:700;font-family:var(--gc-font)">${ms.played}</div>
          <div style="color:var(--gc-muted);font-family:var(--gc-mono);font-size:0.62rem">Played</div>
        </div>
        <div>
          <div style="color:var(--gc-green);font-size:1.05rem;font-weight:700;font-family:var(--gc-font)">${ms.wins}</div>
          <div style="color:var(--gc-muted);font-family:var(--gc-mono);font-size:0.62rem">Wins</div>
        </div>
      </div>
      <div style="color:var(--gc-muted);font-family:var(--gc-mono);font-size:0.63rem;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px">Best Times</div>
      <div style="display:flex;gap:8px">
        ${['beginner', 'intermediate', 'expert'].map(d => `
          <div style="flex:1;background:var(--gc-surface2,#1a1a26);border-radius:6px;padding:8px;text-align:center;border:1px solid var(--gc-border)">
            <div style="color:${bt[d] != null ? 'var(--gc-gold)' : 'var(--gc-muted)'};font-size:0.9rem;font-weight:700;font-family:var(--gc-mono)">${fmtTime(bt[d])}</div>
            <div style="color:var(--gc-muted);font-family:var(--gc-mono);font-size:0.58rem;text-transform:uppercase;margin-top:3px">${d.slice(0, 3)}</div>
          </div>`).join('')}
      </div>
    </div>`;
}

// ── Helper: render activity feed ──────────────────────────────────────────────
function renderActivity(container, history) {
  const el = container.querySelector('#activity-list');
  if (!el) return;

  if (!Array.isArray(history) || !history.length) {
    el.innerHTML = '<div style="color:var(--gc-muted);font-family:var(--gc-mono);font-size:0.75rem;padding:4px 0">No recent activity.</div>';
    return;
  }

  const relTime = ts => {
    if (!ts) return '';
    const diff = (Date.now() - new Date(ts).getTime()) / 1000;
    if (diff < 60)    return 'just now';
    if (diff < 3600)  return `${Math.round(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
    return `${Math.round(diff / 86400)}d ago`;
  };

  const entryIcon = (type, result) => {
    if (type === 'singleplayer') return result === 'win' ? '💣' : '💥';
    return result === 'win' ? '✅' : '❌';
  };

  el.innerHTML = `
    <div style="background:var(--gc-surface);border-radius:8px;border:1px solid var(--gc-border);overflow:hidden">
      ${history.slice(0, 10).map((entry, i) => `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 14px${i ? ';border-top:1px solid var(--gc-border)' : ''}">
          <span style="font-size:1rem;flex-shrink:0">${entryIcon(entry.type, entry.result)}</span>
          <div style="flex:1;min-width:0">
            <div style="color:var(--gc-text);font-size:0.85rem;font-family:var(--gc-font);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${(entry.gameType || 'Unknown').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
            </div>
            <div style="color:var(--gc-muted);font-family:var(--gc-mono);font-size:0.63rem">${entry.type === 'singleplayer' ? 'Solo' : 'Multiplayer'}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="color:${entry.result === 'win' ? 'var(--gc-green)' : 'var(--gc-red)'};font-family:var(--gc-mono);font-size:0.68rem;font-weight:700">${(entry.result || '').toUpperCase()}</div>
            <div style="color:var(--gc-muted);font-family:var(--gc-mono);font-size:0.62rem">${relTime(entry.playedAt)}</div>
          </div>
        </div>`).join('')}
    </div>`;
}

// ── Helper: toggle row HTML ───────────────────────────────────────────────────
function mkToggle(key, label, defaultVal) {
  return `
    <label style="display:flex;align-items:center;padding:14px 16px;gap:12px;cursor:pointer;-webkit-tap-highlight-color:transparent">
      <span style="flex:1;color:var(--gc-text);font-family:var(--gc-font);font-size:0.9rem">${label}</span>
      <div class="prof-toggle-wrap" style="position:relative;width:44px;height:24px;flex-shrink:0">
        <input type="checkbox" class="prof-toggle" data-key="${key}" data-default="${defaultVal}"
          style="opacity:0;position:absolute;inset:0;width:100%;height:100%;cursor:pointer;z-index:1;margin:0">
        <div class="prof-toggle-track" style="position:absolute;inset:0;border-radius:12px;background:rgba(255,255,255,0.1);transition:background 0.2s">
          <div class="prof-toggle-thumb" style="position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.4)"></div>
        </div>
      </div>
    </label>`;
}

// ── Helper: inline status message ─────────────────────────────────────────────
function showMsg(el, msg, type) {
  if (!el) return;
  el.textContent = msg;
  el.style.color = type === 'success' ? 'var(--gc-green)' : 'var(--gc-red)';
  clearTimeout(el._msgTimer);
  el._msgTimer = setTimeout(() => { if (el.isConnected) el.textContent = ''; }, 3000);
}
