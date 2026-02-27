// Pac-Man view shell — delegates to renderer

import { render as pmRender, destroy as pmDestroy } from '../renderers/pacman.js';

export function renderPacman(container, socket, state, navigate) {
  container.innerHTML = `<div id="pm-view-root" style="width:100%;height:100%;overflow:hidden"></div>`;
  const root = container.querySelector('#pm-view-root');

  const playerId = document.cookie.match(/gc_session=([^;]+)/)?.[1] || null;

  const savesP = playerId
    ? fetch('/api/sp/saves/pacman').then(r => r.ok ? r.json() : []).catch(() => [])
    : Promise.resolve([]);

  savesP.then(saves => {
    const initialSave = {};
    for (const s of saves) {
      initialSave[s.slot] = s.data;
    }

    pmRender(root, {
      playerId,
      initialSave,
      navigate,
    });
  });

  return {
    destroy() {
      pmDestroy();
    },
  };
}
