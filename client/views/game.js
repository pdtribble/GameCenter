// Game view — in-game shell, delegates to game renderers
import { ChatComponent } from '../components/chat.js';

const rendererCache = {};

async function loadRenderer(gameType) {
  if (rendererCache[gameType]) return rendererCache[gameType];
  const mod = await import(`../renderers/${gameType}.js`);
  rendererCache[gameType] = mod;
  return mod;
}

export function renderGame(container, socket, state, navigate) {
  const { session, gameState } = state;
  const gameType = gameState?.gameType;
  const joinCode = state.joinCode || state.lobby?.join_code || '';

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;height:calc(100vh - 52px)">
      <div id="game-renderer-area" style="flex:1;overflow:auto;padding:var(--spacing-md);position:relative"></div>

      <!-- Intermission overlay — shown when enginePhase === 'intermission' -->
      <div id="intermission-overlay" style="display:none;position:absolute;inset:0;background:rgba(0,0,0,0.6);z-index:10;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:var(--spacing-md)">
        <div class="card" style="text-align:center;min-width:260px">
          <h2 style="margin-bottom:var(--spacing-sm)">Round Over</h2>
          <div id="intermission-status" class="text-muted" style="margin-bottom:var(--spacing-md)">Waiting for players...</div>
          <div style="display:flex;gap:var(--spacing-sm);justify-content:center">
            <button class="btn btn-primary" id="btn-ready" style="flex:1">Ready</button>
            <button class="btn btn-secondary" id="btn-sit-out" style="flex:1">Sit Out</button>
          </div>
        </div>
      </div>

      <div style="border-top:1px solid var(--color-border);padding:var(--spacing-sm) var(--spacing-md);display:flex;gap:var(--spacing-sm);align-items:center;background:var(--color-bg-card)">
        ${joinCode ? `<span class="game-join-code" id="game-join-code" title="Click to copy join code">🔑 ${escHtml(joinCode)}</span>` : ''}
        <div style="flex:1"></div>
        <button class="btn btn-secondary btn-sm" id="btn-toggle-chat">💬 Chat</button>
      </div>
      <div id="chat-panel" style="border-top:1px solid var(--color-border);display:none">
        <div id="chat-mount" style="padding:var(--spacing-sm)"></div>
      </div>
    </div>`;

  const rendererArea = container.querySelector('#game-renderer-area');
  const chatMount = container.querySelector('#chat-mount');
  const intermissionOverlay = container.querySelector('#intermission-overlay');
  const intermissionStatus = container.querySelector('#intermission-status');
  const btnReady = container.querySelector('#btn-ready');
  const btnSitOut = container.querySelector('#btn-sit-out');

  // Fix overlay — hide it by default (inline style above has display:flex which overrides display:none)
  intermissionOverlay.style.display = 'none';

  // Join code copy
  const joinCodeEl = container.querySelector('#game-join-code');
  if (joinCodeEl && joinCode) {
    joinCodeEl.addEventListener('click', () => {
      navigator.clipboard.writeText(joinCode).then(() => {
        const orig = joinCodeEl.textContent;
        joinCodeEl.textContent = '✅ Copied!';
        setTimeout(() => { joinCodeEl.textContent = orig; }, 1800);
      });
    });
  }

  let renderer = null;
  let chat = null;
  let isSittingOut = false;
  let isReady = false;

  // Load renderer by explicit gameType (from enhanced state)
  if (gameType) {
    loadRenderer(gameType).then(mod => {
      renderer = mod;
      mod.render(rendererArea, state.gameState, socket, state.myPlayerId, state.hostPlayerId);
      updateIntermission(state.gameState);
    }).catch(() => {
      rendererArea.innerHTML = '<p class="text-muted" style="padding:2rem">Game renderer not found.</p>';
    });
  } else {
    rendererArea.innerHTML = '<p class="text-muted" style="padding:2rem">Unknown game type.</p>';
  }

  chat = new ChatComponent(chatMount, socket, 'game', session?.id);

  // Chat toggle
  const chatPanel = container.querySelector('#chat-panel');
  container.querySelector('#btn-toggle-chat').addEventListener('click', () => {
    const hidden = chatPanel.style.display === 'none';
    chatPanel.style.display = hidden ? 'block' : 'none';
  });

  // Intermission controls
  btnReady.addEventListener('click', () => {
    if (isReady) return;
    isReady = true;
    btnReady.textContent = 'Waiting...';
    btnReady.disabled = true;
    socket.emit('game:ready', { sessionId: session?.id });
  });

  btnSitOut.addEventListener('click', () => {
    isSittingOut = !isSittingOut;
    btnSitOut.textContent = isSittingOut ? 'Sit In' : 'Sit Out';
    btnSitOut.className = isSittingOut ? 'btn btn-primary' : 'btn btn-secondary';
    socket.emit(isSittingOut ? 'game:sit_out' : 'game:sit_in', { sessionId: session?.id });
  });

  function updateIntermission(gs) {
    if (!gs) return;
    const isIntermission = gs.enginePhase === 'intermission';
    intermissionOverlay.style.display = isIntermission ? 'flex' : 'none';

    if (isIntermission) {
      const readyPlayers = gs.readyPlayers || [];
      const sittingOut = gs.sittingOut || [];
      const total = (gs.players || []).filter(p => !p.is_bot && !sittingOut.includes(p.id)).length;
      const readyCount = readyPlayers.filter(id => {
        const p = (gs.players || []).find(pl => pl.id === id);
        return p && !p.is_bot;
      }).length;
      intermissionStatus.textContent = `${readyCount} / ${total} ready`;

      // Reset ready button if we went back to playing then intermission again
      if (!readyPlayers.includes(state.myPlayerId)) {
        isReady = false;
        btnReady.textContent = 'Ready';
        btnReady.disabled = false;
      }
    }
  }

  return {
    update(data) {
      if (data.state) {
        state.gameState = data.state;
        renderer?.update?.(data.state, state.myPlayerId, state.hostPlayerId);
        updateIntermission(data.state);
      }
      if (data.pausedForReconnect !== undefined) {
        const banner = document.getElementById('announcement-bar');
        if (data.pausedForReconnect) {
          banner.textContent = '⏸ Game paused — waiting for player to reconnect...';
          banner.style.display = 'block';
        } else {
          banner.style.display = 'none';
        }
      }
    },
    onEvent(event) { renderer?.onEvent?.(event); },
    onChat(msg) { chat?.append(msg); },
    onReconnect() { document.getElementById('announcement-bar').style.display = 'none'; },
    onError(code, message) {
      const bar = document.getElementById('announcement-bar');
      bar.textContent = `Error: ${message}`;
      bar.style.display = 'block';
      setTimeout(() => { bar.style.display = 'none'; }, 4000);
    },
    destroy() { chat?.destroy?.(); renderer?.destroy?.(); },
  };
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
