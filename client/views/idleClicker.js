import { render as icRender, destroy as icDestroy } from '../renderers/idleClickerRenderer.js';

export function renderIdleClicker(container, socket, state, navigate) {
  container.innerHTML = `<div id="ic-view-root" style="width:100%;height:100%;overflow:hidden"></div>`;
  const root = container.querySelector('#ic-view-root');

  const playerId = document.cookie.match(/gc_session=([^;]+)/)?.[1] || null;

  icRender(root, {
    playerId,
    navigate,
  });

  return {
    destroy() {
      icDestroy();
    },
  };
}
