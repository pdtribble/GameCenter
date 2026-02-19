// Post-game view — results, highlights

export function renderPostgame(container, socket, state, navigate, data) {
  const { results = [], postGameSummary = [], session } = data || {};

  const resultItems = results.map((r, i) => {
    const cls = r.result === 'win' ? 'winner' : r.result === 'push' ? 'push' : 'loser';
    const emoji = r.placement === 1 ? '🥇' : r.placement === 2 ? '🥈' : r.placement === 3 ? '🥉' : `#${r.placement}`;
    return `<div class="result-card ${cls}">
      <div class="placement-num">${emoji}</div>
      <div>
        <div style="font-weight:700">${escHtml(r.displayName || r.playerId)}</div>
        <div class="text-muted">${escHtml(r.result)}</div>
      </div>
    </div>`;
  }).join('');

  const summaryItems = postGameSummary.map(s =>
    `<div class="flex justify-between" style="padding:var(--spacing-xs) 0;border-bottom:1px solid var(--color-border)">
      <span class="text-muted">${escHtml(s.label)}</span>
      <span style="font-weight:600">${escHtml(s.value)}</span>
    </div>`
  ).join('');

  container.innerHTML = `
    <div class="page">
      <div class="card" style="margin-bottom:var(--spacing-md)">
        <h1 class="section-heading">Game Over</h1>
        ${resultItems || '<p class="text-muted">No results.</p>'}
      </div>

      ${summaryItems ? `
      <div class="card" style="margin-bottom:var(--spacing-md)">
        <h2 class="section-heading" style="font-size:var(--font-size-lg)">Highlights</h2>
        ${summaryItems}
      </div>` : ''}

      <div class="card" style="display:flex;gap:var(--spacing-sm)">
        <button class="btn btn-primary" style="flex:1" id="btn-home">🏠 Home</button>
        <button class="btn btn-secondary" style="flex:1" id="btn-leaderboard">🏆 Leaderboard</button>
      </div>
    </div>`;

  container.querySelector('#btn-home').addEventListener('click', () => navigate('home'));
  container.querySelector('#btn-leaderboard').addEventListener('click', () => navigate('leaderboard'));

  return { destroy() {} };
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
