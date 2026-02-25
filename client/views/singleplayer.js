// Singleplayer hub — game card grid for solo games

export function renderSingleplayer(container, socket, state, navigate) {
  container.innerHTML = `
    <div class="gc-profile">
      <div class="gc-profile-inner" style="max-width:700px">
        <div style="margin-bottom:20px">
          <h1 class="gc-section-label" style="font-size:0.75rem;margin-bottom:4px">Solo Games</h1>
          <p style="color:var(--gc-muted);font-size:0.8rem;margin:0">Play offline — progress saved automatically.</p>
        </div>
        <div id="sp-game-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px">
          <div class="gc-spinner" style="grid-column:1/-1;justify-self:center"></div>
        </div>
      </div>
    </div>`;

  const grid = container.querySelector('#sp-game-grid');

  // Check login status
  const playerId = document.cookie.match(/gc_session=([^;]+)/)?.[1] || null;

  // Fetch minesweeper stats (if logged in)
  const statsP = playerId
    ? fetch('/api/sp/stats/minesweeper').then(r => r.ok ? r.json() : null).catch(() => null)
    : Promise.resolve(null);

  statsP.then(stats => {
    grid.innerHTML = '';

    const games = [
      {
        id: 'minesweeper',
        name: 'Minesweeper',
        icon: '💣',
        desc: 'Classic sweeper with an endless mode. Phosphor-green terminal aesthetic.',
        accent: '#39ff14',
        stats,
      },
    ];

    for (const g of games) {
      const card = document.createElement('div');
      card.className = 'gc-lobby-card';
      card.style.cssText = `--gc-card-accent:${g.accent};cursor:pointer;padding:18px 16px;display:flex;flex-direction:column;gap:10px`;

      const statsHtml = g.stats
        ? `<div style="display:flex;gap:12px;font-size:0.72rem;color:var(--gc-muted)">
            <span><span style="color:var(--gc-text)">${g.stats.totalGames}</span> played</span>
            <span><span style="color:var(--gc-green)">${g.stats.wins}</span> wins</span>
            ${g.stats.bestTime != null ? `<span>best <span style="color:var(--gc-gold)">${formatTime(g.stats.bestTime)}</span></span>` : ''}
          </div>`
        : `<div style="font-size:0.72rem;color:var(--gc-muted)">No games yet</div>`;

      card.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:1.6rem">${g.icon}</span>
          <div>
            <div style="font-family:var(--gc-font);font-weight:700;font-size:1rem;color:var(--gc-text)">${g.name}</div>
            <div class="gc-card-badge" style="--gc-card-accent:${g.accent};margin-top:4px;font-size:0.65rem">${g.id}</div>
          </div>
        </div>
        <div style="font-size:0.78rem;color:var(--gc-muted);line-height:1.4">${g.desc}</div>
        ${statsHtml}
        <button class="gc-card-join-btn" style="margin-top:4px">Play →</button>`;

      card.querySelector('.gc-card-join-btn').addEventListener('click', () => {
        navigate(g.id);
      });

      grid.appendChild(card);
    }
  });

  return { destroy() {} };
}

function formatTime(s) {
  if (s == null) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}
