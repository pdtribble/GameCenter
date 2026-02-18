// Leaderboard view — global and per-game

export function renderLeaderboard(container, socket, state, navigate) {
  container.innerHTML = `
    <div class="page">
      <div class="flex items-center justify-between" style="margin-bottom:var(--spacing-md)">
        <h1 class="section-heading" style="margin:0">🏆 Leaderboard</h1>
        <div style="display:flex;gap:var(--spacing-sm)">
          <button class="btn btn-secondary btn-sm active" id="tab-global" data-tab="global">All Games</button>
          <button class="btn btn-secondary btn-sm" id="tab-blackjack" data-tab="blackjack">Blackjack</button>
          <button class="btn btn-secondary btn-sm" id="tab-poker" data-tab="poker">Poker</button>
          <button class="btn btn-secondary btn-sm" id="tab-bs" data-tab="bs">BS</button>
        </div>
      </div>

      <div class="card">
        <div id="leaderboard-content">
          <div class="flex items-center justify-center" style="padding:var(--spacing-xl)">
            <div class="spinner"></div>
          </div>
        </div>
      </div>

      <div style="margin-top:var(--spacing-md)">
        <button class="btn btn-secondary btn-sm" id="btn-back">← Back</button>
      </div>
    </div>`;

  container.querySelector('#btn-back').addEventListener('click', () => navigate('home'));

  // Tab logic
  for (const tab of container.querySelectorAll('[data-tab]')) {
    tab.addEventListener('click', () => {
      container.querySelectorAll('[data-tab]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadLeaderboard(tab.dataset.tab);
    });
  }

  function loadLeaderboard(gameType) {
    const el = container.querySelector('#leaderboard-content');
    el.innerHTML = '<div class="flex items-center justify-center" style="padding:var(--spacing-xl)"><div class="spinner"></div></div>';

    // Placeholder — would call /api/leaderboard?game=gameType
    setTimeout(() => {
      el.innerHTML = `
        <table class="leaderboard-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Games</th>
              <th>Wins</th>
              <th>Win %</th>
            </tr>
          </thead>
          <tbody id="lb-rows">
            <tr><td colspan="5" class="text-muted" style="text-align:center;padding:var(--spacing-lg)">No data yet — play some games!</td></tr>
          </tbody>
        </table>`;
    }, 300);
  }

  loadLeaderboard('global');

  return { destroy() {} };
}
