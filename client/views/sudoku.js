// Sudoku view shell — loads saves, then delegates to renderer

import { render as sdRender, destroy as sdDestroy } from '../renderers/sudoku.js';

export function renderSudoku(container, socket, state, navigate) {
  container.innerHTML = `<div id="sd-view-root" style="width:100%;height:100%;overflow:hidden"></div>`;
  const root = container.querySelector('#sd-view-root');

  const playerId = document.cookie.match(/gc_session=([^;]+)/)?.[1] || null;

  const savesP = playerId
    ? fetch('/api/sp/saves/sudoku').then(r => r.ok ? r.json() : []).catch(() => [])
    : Promise.resolve([]);

  savesP.then(saves => {
    let savedState = null;
    
    for (const s of saves) {
      if (s.slot === 'autosave' && s.data) {
        savedState = s.data;
        break;
      }
    }

    sdRender(root, {
      playerId,
      savedState,
      navigate,
    });
  });

  return {
    destroy() {
      sdDestroy();
    },
  };
}
