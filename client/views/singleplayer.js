// Singleplayer hub — game card grid matching the multiplayer grid design

// Shared game card styles are injected by home.js. If singleplayer loads first,
// inject them here too.
function ensureSharedStyles() {
  if (document.getElementById('gc-game-card-styles')) return;
  const s = document.createElement('style');
  s.id = 'gc-game-card-styles';
  s.textContent = `
    .mp-game-card {
      background: var(--gc-surface, #12121a);
      border: 1px solid var(--gc-border, rgba(255,255,255,0.06));
      border-radius: 12px;
      padding: 16px 14px;
      cursor: pointer;
      transition: border-color 0.15s, transform 0.1s;
      display: flex;
      flex-direction: column;
      gap: 6px;
      position: relative;
      overflow: hidden;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
    }
    .mp-game-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
      background: var(--mp-card-accent, #9060ff);
      opacity: 0.85;
    }
    .mp-game-card:hover  { border-color: var(--mp-card-accent, #9060ff); }
    .mp-game-card:active { transform: scale(0.97); }
    .mp-game-card-icon   { font-size: 1.8rem; line-height: 1; }
    .mp-game-card-name   { font-family: var(--gc-font,'Anybody',sans-serif); font-weight: 700; font-size: 0.9rem; color: var(--gc-text, #f0f0f8); }
    .mp-game-card-desc   { font-size: 0.7rem; color: var(--gc-muted, rgba(240,240,248,0.4)); line-height: 1.4; flex: 1; }
    .mp-game-card-badge  {
      display: inline-block;
      background: rgba(255,255,255,0.04);
      border: 1px solid var(--gc-border, rgba(255,255,255,0.06));
      border-radius: 20px;
      padding: 2px 8px;
      font-family: var(--gc-mono,'DM Mono',monospace);
      font-size: 0.6rem;
      color: var(--gc-green, #30d890);
      align-self: flex-start;
    }
    .mp-lobby-item {
      background: var(--gc-surface, #12121a);
      border: 1px solid var(--gc-border, rgba(255,255,255,0.06));
      border-radius: 10px;
      padding: 12px 14px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
  `;
  document.head.appendChild(s);
}

export function renderSingleplayer(container, socket, state, navigate) {
  ensureSharedStyles();

  container.innerHTML = `
    <div id="sp-view" style="
      height:100%;
      display:flex;
      flex-direction:column;
      background:var(--gc-bg,#0a0a0f);
      padding:16px;
      box-sizing:border-box;
      overflow:hidden;
    ">
      <!-- Header -->
      <div style="
        display:flex;
        align-items:center;
        justify-content:space-between;
        margin-bottom:16px;
        flex-shrink:0;
      ">
        <div style="
          font-family:var(--gc-mono,'DM Mono',monospace);
          font-size:0.72rem;
          letter-spacing:3px;
          color:var(--gc-text,#f0f0f8);
          text-transform:uppercase;
        ">SINGLE PLAYER</div>
      </div>

      <!-- Game grid -->
      <div id="sp-games-grid" style="
        display:grid;
        grid-template-columns:repeat(auto-fill,minmax(150px,1fr));
        gap:12px;
        overflow-y:auto;
        flex:1;
        align-content:start;
      ">
        <!-- cards injected below -->
      </div>
    </div>`;

  const grid = container.querySelector('#sp-games-grid');

  // Fetch stats if session exists
  const playerId = document.cookie.match(/gc_session=([^;]+)/)?.[1] || null;
  const statsP   = playerId
    ? fetch('/api/sp/stats/minesweeper').then(r => r.ok ? r.json() : null).catch(() => null)
    : Promise.resolve(null);

  // Check if guest (to show progress warning)
  const statsApiP = fetch('/api/me/stats').then(r => r.json()).catch(() => null);

  Promise.all([statsP, statsApiP]).then(([spStats, meStats]) => {
    const isGuest = meStats?.isGuest === true;
    grid.innerHTML = '';

    const games = [
      {
        id:     'minesweeper',
        name:   'Minesweeper',
        icon:   '💣',
        desc:   'Classic sweeper + Endless mode. Phosphor-green terminal aesthetic.',
        accent: '#39ff14',
        stats:  spStats,
      },
    ];

    for (const g of games) {
      const card = document.createElement('div');
      card.className = 'mp-game-card';
      card.style.setProperty('--mp-card-accent', g.accent);

      let statsHtml = '';
      if (g.stats) {
        const best = g.stats.bestTime != null ? `<span>best <span style="color:var(--gc-gold,#f0c040)">${formatTime(g.stats.bestTime)}</span></span>` : '';
        statsHtml = `
          <div style="display:flex;gap:10px;font-family:var(--gc-mono,'DM Mono',monospace);font-size:0.65rem;color:var(--gc-muted,rgba(240,240,248,0.4));flex-wrap:wrap">
            <span><span style="color:var(--gc-text,#f0f0f8)">${g.stats.totalGames}</span> played</span>
            <span><span style="color:var(--gc-green,#30d890)">${g.stats.wins}</span> wins</span>
            ${best}
          </div>`;
      } else {
        statsHtml = '<div style="font-family:var(--gc-mono,monospace);font-size:0.65rem;color:var(--gc-muted,rgba(240,240,248,0.4))">No games yet</div>';
      }

      card.innerHTML = `
        <div class="mp-game-card-icon">${g.icon}</div>
        <div class="mp-game-card-name">${g.name}</div>
        <div class="mp-game-card-desc">${g.desc}</div>
        ${statsHtml}
        <button class="gc-card-join-btn" style="margin-top:4px;align-self:flex-start">Play →</button>`;

      card.querySelector('.gc-card-join-btn').addEventListener('click', () => navigate(g.id));
      card.addEventListener('click', () => navigate(g.id));
      grid.appendChild(card);
    }

    // Guest warning below grid
    if (isGuest) {
      const warn = document.createElement('p');
      warn.style.cssText = 'color:rgba(168,255,168,0.2);font-family:monospace;font-size:11px;text-align:center;margin-top:16px;grid-column:1/-1';
      warn.textContent = '⚠ Progress won\'t be saved as guest';
      grid.appendChild(warn);
    }
  });

  return { destroy() {} };
}

function formatTime(s) {
  if (s == null) return '—';
  const m   = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}
