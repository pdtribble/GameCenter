// Wordle view shell — loads saves, then delegates to renderer

import { render as wlRender, destroy as wlDestroy } from '../renderers/wordle.js';

export function renderWordle(container, socket, state, navigate) {
  container.innerHTML = `<div id="wl-view-root" style="width:100%;height:100%;overflow:hidden"></div>`;
  const root = container.querySelector('#wl-view-root');

  const playerId = document.cookie.match(/gc_session=([^;]+)/)?.[1] || null;

  // Load word lists and saves in parallel
  const wordsP = fetch('/data/words.json').then(r => r.ok ? r.json() : []).catch(() => []);
  const validP = fetch('/data/valid-guesses.json').then(r => r.ok ? r.json() : []).catch(() => []);
  const savesP = playerId
    ? fetch('/api/sp/saves/wordle').then(r => r.ok ? r.json() : []).catch(() => [])
    : Promise.resolve([]);

  Promise.all([wordsP, validP, savesP]).then(([words, validGuesses, saves]) => {
    const initialSave = {};
    for (const s of saves) {
      initialSave[s.slot] = s.data;
    }

    wlRender(root, {
      playerId,
      dailySave: initialSave.dailySave || null,
      freeSave: initialSave.freeSave || null,
      wordList: words,
      validGuesses,
      navigate,
    });
  });

  return {
    destroy() {
      wlDestroy();
    },
  };
}
