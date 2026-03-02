import { startRenderer } from '../renderers/spaceInvadersRenderer.js';
import { initGame } from '../../games/spaceInvaders/index.js';

export function renderSpaceInvaders(container, socket, appState, navigate) {
  container.innerHTML = `
    <div id="si-root" style="width:100%;height:100%;overflow:hidden;background:#000;display:flex;flex-direction:column;font-family:'DM Mono',monospace">
      <div id="si-header" style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid #1a1a2e;flex-shrink:0;background:rgba(0,0,0,0.8)">
        <button id="si-back" style="background:transparent;border:1px solid #4090ff;color:#4090ff;padding:5px 12px;font-family:inherit;font-size:12px;cursor:pointer;border-radius:4px">← SOLO</button>
        <div style="color:#4090ff;font-size:13px;letter-spacing:3px">👾 SPACE INVADERS</div>
        <div style="color:#555;font-size:11px">ARROWS/AD · SPACE</div>
      </div>
      <div style="flex:1;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden">
        <canvas id="si-canvas" style="max-width:100%;max-height:100%;border:1px solid #1a1a2e"></canvas>
      </div>
    </div>`;

  const canvas = container.querySelector('#si-canvas');
  canvas.width = 800;
  canvas.height = 520;

  const initialState = initGame(800, 520);
  const cleanup = startRenderer(initialState, canvas, navigate);

  container.querySelector('#si-back').addEventListener('click', () => {
    cleanup();
    navigate('singleplayer');
  });

  return {
    destroy() { cleanup(); },
  };
}
