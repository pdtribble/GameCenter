// Tetris view shell — delegates to renderer

import { render as trRender, destroy as trDestroy } from '../renderers/tetris.js';

export function renderTetris(container, socket, state, navigate) {
  container.innerHTML = `<div id="tr-view-root" style="width:100%;height:100%;overflow:hidden"></div>`;
  const root = container.querySelector('#tr-view-root');

  const playerId = document.cookie.match(/gc_session=([^;]+)/)?.[1] || null;

  const savesP = playerId
    ? fetch('/api/sp/saves/tetris').then(r => r.ok ? r.json() : []).catch(() => [])
    : Promise.resolve([]);

  savesP.then(saves => {
    const initialSave = {};
    for (const s of saves) {
      initialSave[s.slot] = s.data;
    }

    trRender(root, {
      playerId,
      initialSave,
      navigate,
    });
  });

  return {
    destroy() {
      trDestroy();
    },
  };
}
