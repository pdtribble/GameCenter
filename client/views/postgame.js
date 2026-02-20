// Post-game view — results display

export function renderPostgame(container, socket, state, navigate, data) {
  const { results = [], postGameSummary, session } = data || {};

  const resultItems = results.map(r => {
    const cls = r.result === 'win' ? 'winner' : 'loser';
    const emoji = r.placement === 1 ? '🥇' : r.placement === 2 ? '🥈' : r.placement === 3 ? '🥉' : `#${r.placement}`;
    const scoreText = r.score != null ? ` · ${r.score} win${r.score !== 1 ? 's' : ''}` : '';
    return `<div class="result-card ${cls}">
      <div class="placement-num">${emoji}</div>
      <div>
        <div style="font-weight:700">${escHtml(r.displayName || r.playerId)}</div>
        <div class="text-muted">${escHtml(r.result)}${scoreText}</div>
      </div>
    </div>`;
  }).join('');

  // postGameSummary is a { winner, winnerName, hands, scores, round } object from getRoundSummary
  let summaryHtml = '';
  if (postGameSummary && typeof postGameSummary === 'object') {
    const lines = [];
    if (postGameSummary.winnerName) lines.push(`<div class="flex justify-between" style="padding:var(--spacing-xs) 0;border-bottom:1px solid var(--color-border)"><span class="text-muted">Final Winner</span><span style="font-weight:600">${escHtml(postGameSummary.winnerName)}</span></div>`);
    if (postGameSummary.round) lines.push(`<div class="flex justify-between" style="padding:var(--spacing-xs) 0;border-bottom:1px solid var(--color-border)"><span class="text-muted">Rounds Played</span><span style="font-weight:600">${escHtml(String(postGameSummary.round))}</span></div>`);
    summaryHtml = lines.join('');
  }

  container.innerHTML = `
    <div class="page">
      <div class="card" style="margin-bottom:var(--spacing-md)">
        <h1 class="section-heading">Game Over</h1>
        ${resultItems || '<p class="text-muted">No results.</p>'}
      </div>

      ${summaryHtml ? `
      <div class="card" style="margin-bottom:var(--spacing-md)">
        <h2 class="section-heading" style="font-size:var(--font-size-lg)">Summary</h2>
        ${summaryHtml}
      </div>` : ''}

      <div class="card">
        <button class="btn btn-primary btn-full" id="btn-home">🏠 Back to Home</button>
      </div>
    </div>`;

  container.querySelector('#btn-home').addEventListener('click', () => navigate('home'));

  return { destroy() {} };
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
