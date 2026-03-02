import { startRenderer } from '../renderers/asteroidsRenderer.js';
import { initGame } from '../../games/asteroids/index.js';

export function renderAsteroids(container, socket, appState, navigate) {
  container.innerHTML = `
    <div id="ast-root" style="width:100%;height:100%;overflow:hidden;background:#000;display:flex;flex-direction:column;font-family:'DM Mono',monospace">
      <div id="ast-header" style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid #1a2e1a;flex-shrink:0;background:rgba(0,0,0,0.8)">
        <button id="ast-back" style="background:transparent;border:1px solid #39ff14;color:#39ff14;padding:5px 12px;font-family:inherit;font-size:12px;cursor:pointer;border-radius:4px">&#8592; SOLO</button>
        <div style="color:#39ff14;font-size:13px;letter-spacing:3px">&#128640; ASTEROIDS</div>
        <div style="color:#555;font-size:11px">ARROWS/WASD &middot; SPACE</div>
      </div>
      <div style="flex:1;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden">
        <canvas id="ast-canvas" style="max-width:100%;max-height:100%;border:1px solid #1a2e1a"></canvas>
      </div>
    </div>`;

  const canvas = container.querySelector('#ast-canvas');
  canvas.width  = 800;
  canvas.height = 520;

  const initialState = initGame(800, 520);
  const cleanup = startRenderer(initialState, canvas, navigate);

  container.querySelector('#ast-back').addEventListener('click', () => {
    cleanup();
    navigate('singleplayer');
  });

  return {
    destroy() {
      cleanup();
    },
  };
}
