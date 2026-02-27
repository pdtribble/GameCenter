import { render as breakoutRender, destroy as breakoutDestroy } from '../renderers/breakoutRenderer.js';

export function renderBreakout(container, socket, state, navigate) {
  container.innerHTML = `<div id="breakout-view-root" style="width:100%;height:100%;overflow:hidden"></div>`;
  const root = container.querySelector('#breakout-view-root');

  const playerId = document.cookie.match(/gc_session=([^;]+)/)?.[1] || null;

  breakoutRender(root, {
    playerId,
    navigate,
  });

  return {
    destroy() {
      breakoutDestroy();
    },
  };
}
