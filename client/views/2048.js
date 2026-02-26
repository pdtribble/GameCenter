// 2048 view shell — loads saves, then delegates to renderer

import { render as t48Render, destroy as t48Destroy } from '../renderers/2048.js';

export function render2048(container, socket, state, navigate) {
  container.innerHTML = `<div id="t48-view-root" style="width:100%;height:100%;overflow:hidden"></div>`;
  const root = container.querySelector('#t48-view-root');

  const playerId = document.cookie.match(/gc_session=([^;]+)/)?.[1] || null;

  // Fetch autosave and best score
  const savesP = playerId
    ? fetch('/api/sp/saves/2048').then(r => r.ok ? r.json() : []).catch(() => [])
    : Promise.resolve([]);

  savesP.then(saves => {
    let savedState = null;
    let bestScore = 0;
    
    for (const s of saves) {
      if (s.slot === 'autosave' && s.data) {
        savedState = s.data;
      }
      if (s.slot === 'best' && s.data?.best) {
        bestScore = s.data.best;
      }
    }
    
    // Also check localStorage
    const localBest = parseInt(localStorage.getItem('t48_best') || '0', 10);
    bestScore = Math.max(bestScore, localBest);

    t48Render(root, {
      playerId,
      savedState,
      bestScore,
      navigate,
    });
  });

  return {
    destroy() {
      t48Destroy();
    },
  };
}
