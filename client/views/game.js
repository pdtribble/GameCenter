// Game view — in-game shell, delegates to game renderers
import { ChatComponent } from '../components/chat.js';
import { isPortrait } from '../app.js';

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
  const gameName = gameType
    ? gameType.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : 'Game';

  container.innerHTML = `
    <div style="position:relative;display:flex;flex-direction:column;height:100%">

      <!-- Dark top bar (44px) -->
      <div style="height:44px;flex-shrink:0;background:rgba(0,0,0,0.85);border-bottom:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;padding:0 10px;gap:6px;z-index:5;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)">
        <button id="btn-back" style="background:none;border:none;color:rgba(255,255,255,0.45);font-family:'DM Mono','Courier New',monospace;font-size:0.68rem;letter-spacing:0.5px;cursor:pointer;padding:10px 6px;white-space:nowrap;-webkit-tap-highlight-color:transparent">← BACK</button>
        <div style="flex:1;text-align:center;font-family:'DM Mono','Courier New',monospace;font-size:0.68rem;letter-spacing:3px;color:rgba(255,255,255,0.35);text-transform:uppercase;pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(gameName)}</div>
        ${joinCode ? `<span id="game-join-code" title="Tap to copy join code" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:4px;padding:3px 7px;font-family:'DM Mono','Courier New',monospace;font-size:0.62rem;color:rgba(255,255,255,0.4);cursor:pointer;letter-spacing:1px;white-space:nowrap;-webkit-tap-highlight-color:transparent">🔑 ${escHtml(joinCode)}</span>` : ''}
        <button id="btn-toggle-chat" style="background:none;border:none;color:rgba(255,255,255,0.4);cursor:pointer;padding:10px 6px;font-size:1rem;line-height:1;flex-shrink:0;-webkit-tap-highlight-color:transparent" title="Toggle chat">💬</button>
      </div>

      <!-- Game renderer area -->
      <div id="game-renderer-area" style="flex:1;overflow:hidden;position:relative"></div>

      <!-- Chat panel (slides in from bottom) -->
      <div id="chat-panel" style="display:none;border-top:1px solid rgba(255,255,255,0.07);background:rgba(5,10,5,0.92);max-height:180px;overflow-y:auto">
        <div id="chat-mount" style="padding:8px"></div>
      </div>

      <!-- Intermission overlay -->
      <div id="intermission-overlay" style="display:none;position:absolute;inset:0;background:rgba(0,0,0,0.65);z-index:10;flex-direction:column;align-items:center;justify-content:center;gap:var(--spacing-md)">
        <div class="card" style="text-align:center;min-width:260px">
          <h2 style="margin-bottom:var(--spacing-sm)">Round Over</h2>
          <div id="intermission-status" class="text-muted" style="margin-bottom:var(--spacing-md)">Waiting for players...</div>
          <div style="display:flex;gap:var(--spacing-sm);justify-content:center">
            <button class="btn btn-primary" id="btn-ready" style="flex:1">Ready</button>
            <button class="btn btn-secondary" id="btn-sit-out" style="flex:1">Sit Out</button>
          </div>
        </div>
      </div>

      <!-- Portrait lock overlay (blackjack) -->
      <div id="blackjack-rotate-overlay">
        <span class="game-rotate-message">Rotate Screen</span>
      </div>

    </div>`;

  const rendererArea   = container.querySelector('#game-renderer-area');
  const chatMount      = container.querySelector('#chat-mount');
  const chatPanel      = container.querySelector('#chat-panel');
  const intermissionOverlay  = container.querySelector('#intermission-overlay');
  const intermissionStatus   = container.querySelector('#intermission-status');
  const btnReady       = container.querySelector('#btn-ready');
  const btnSitOut      = container.querySelector('#btn-sit-out');
  const rotateOverlay  = container.querySelector('#blackjack-rotate-overlay');

  // Back button → home
  container.querySelector('#btn-back').addEventListener('click', () => navigate('home'));

  // Portrait lock overlay (blackjack only)
  function updateRotateOverlay() {
    rotateOverlay.classList.toggle('game-rotate-visible', gameType === 'blackjack' && isPortrait());
  }
  updateRotateOverlay();
  const onResize = () => updateRotateOverlay();
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

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

  // Load renderer
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
  container.querySelector('#btn-toggle-chat').addEventListener('click', () => {
    chatPanel.style.display = chatPanel.style.display === 'none' ? 'block' : 'none';
  });

  // Intermission — Ready
  btnReady.addEventListener('click', () => {
    if (isReady) return;
    isReady = true;
    btnReady.textContent = 'Waiting...';
    btnReady.disabled = true;
    socket.emit('game:ready', { sessionId: session?.id });
  });

  // Intermission — Sit Out / Sit In
  btnSitOut.addEventListener('click', () => {
    isSittingOut = !isSittingOut;
    btnSitOut.textContent = isSittingOut ? 'Sit In' : 'Sit Out';
    btnSitOut.className = isSittingOut ? 'btn btn-primary' : 'btn btn-secondary';
    socket.emit(isSittingOut ? 'game:sit_out' : 'game:sit_in', { sessionId: session?.id });
  });

  function updateIntermission(gs) {
    if (!gs) return;
    const isIntermission = gs.enginePhase === 'intermission';
    
    // Skip overlay for blackjack - renderer handles its own intermission UI
    const isBlackjack = gameType === 'blackjack';
    intermissionOverlay.style.display = (isIntermission && !isBlackjack) ? 'flex' : 'none';

    if (isIntermission) {
      const readyPlayers = gs.readyPlayers || [];
      const sittingOut   = gs.sittingOut   || [];
      const total = (gs.players || []).filter(p => !p.is_bot && !sittingOut.includes(p.id)).length;
      const readyCount = readyPlayers.filter(id => {
        const p = (gs.players || []).find(pl => pl.id === id);
        return p && !p.is_bot;
      }).length;
      intermissionStatus.textContent = `${readyCount} / ${total} ready`;

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
    onChat(msg)    { chat?.append(msg); },
    onReconnect()  { document.getElementById('announcement-bar').style.display = 'none'; },
    onError(code, message) {
      const bar = document.getElementById('announcement-bar');
      bar.textContent = `Error: ${message}`;
      bar.style.display = 'block';
      setTimeout(() => { bar.style.display = 'none'; }, 4000);
    },
    destroy() {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      chat?.destroy?.();
      renderer?.destroy?.();
    },
  };
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
