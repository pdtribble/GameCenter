import { render as pongRender, destroy as pongDestroy } from '../renderers/pongRenderer.js';

export function renderPong(container, socket, state, navigate) {
  container.innerHTML = `<div id="pong-view-root" style="width:100%;height:100%;overflow:hidden"></div>`;
  const root = container.querySelector('#pong-view-root');

  const playerId = document.cookie.match(/gc_session=([^;]+)/)?.[1] || null;

  pongRender(root, {
    playerId,
    navigate,
  });

  return {
    destroy() {
      pongDestroy();
    },
  };
}
