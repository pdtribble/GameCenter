import { render, destroy } from '../renderers/snake-puzzle.js';

export function renderSnakePuzzle(container, socket, state, navigate) {
  container.innerHTML = '<div id="snp-view-root" style="width:100%;height:100%;"></div>';
  const root = container.querySelector('#snp-view-root');

  const playerId = document.cookie.match(/gc_session=([^;]+)/)?.[1] || null;

  const savesP = playerId
    ? fetch('/api/sp/saves/snake-puzzle').then(r => r.ok ? r.json() : []).catch(() => [])
    : Promise.resolve([]);

  savesP.then(saves => {
    const progressSave = saves.find(s => s.slot === 'progress');

    render(root, {
      playerId,
      initialSave: progressSave?.data || null,
      navigate,
      onSave(slot, data) {
        if (!playerId) {
          localStorage.setItem('snp_progress', JSON.stringify(data));
          return;
        }
        fetch('/api/sp/saves/snake-puzzle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slot, data }),
        }).catch(() => {
          localStorage.setItem('snp_progress', JSON.stringify(data));
        });
      },
    });
  });

  return { destroy() { destroy(); } };
}
