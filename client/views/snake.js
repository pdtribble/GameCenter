// Snake view shell — loads saves, then delegates to renderer

import { render as skRender, destroy as skDestroy } from '../renderers/snake.js';

export function renderSnake(container, socket, state, navigate) {
  container.innerHTML = `<div id="sk-view-root" style="width:100%;height:100%;overflow:hidden"></div>`;
  const root = container.querySelector('#sk-view-root');

  const playerId = document.cookie.match(/gc_session=([^;]+)/)?.[1] || null;

  const savesP = playerId
    ? fetch('/api/sp/saves/snake').then(r => r.ok ? r.json() : []).catch(() => [])
    : Promise.resolve([]);

  savesP.then(saves => {
    const initialSave = {};
    for (const s of saves) {
      initialSave[s.slot] = s.data;
    }

    skRender(root, {
      playerId,
      initialSave,
      navigate,
    });
  });

  return {
    destroy() {
      skDestroy();
    },
  };
}
