// Minesweeper view shell — loads saves, then delegates to renderer

import { render as msRender, destroy as msDestroy } from '../renderers/minesweeper.js';

export function renderMinesweeper(container, socket, state, navigate) {
  container.innerHTML = `<div id="ms-view-root" style="width:100%;height:100%;overflow:hidden"></div>`;
  const root = container.querySelector('#ms-view-root');

  const playerId = document.cookie.match(/gc_session=([^;]+)/)?.[1] || null;

  // Attempt to load existing saves; fall back gracefully if not logged in
  const savesP = playerId
    ? fetch('/api/sp/saves/minesweeper').then(r => r.ok ? r.json() : []).catch(() => [])
    : Promise.resolve([]);

  savesP.then(saves => {
    const initialSave = {};
    for (const s of saves) {
      initialSave[s.slot] = s.data;
    }

    msRender(root, {
      playerId,
      initialSave,
      navigate,
      onSave(slot, data) {
        if (!playerId) return;
        fetch('/api/sp/saves/minesweeper', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slot, data }),
        }).catch(() => {});
      },
      onDeleteSave(slot) {
        if (!playerId) return;
        fetch(`/api/sp/saves/minesweeper/${encodeURIComponent(slot)}`, { method: 'DELETE' }).catch(() => {});
      },
      onGameEnd(mode, result, stats) {
        if (!playerId) return;
        fetch('/api/sp/history/minesweeper', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode, result, stats }),
        }).catch(() => {});
      },
    });
  });

  return {
    destroy() {
      msDestroy();
    },
  };
}
