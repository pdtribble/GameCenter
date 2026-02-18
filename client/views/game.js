// Game view — in-game shell, delegates to game renderers
import { ChatComponent } from '../components/chat.js';
import { TimerComponent } from '../components/timer.js';

const rendererCache = {};

async function loadRenderer(gameType) {
  if (rendererCache[gameType]) return rendererCache[gameType];
  const mod = await import(`../renderers/${gameType}.js`);
  rendererCache[gameType] = mod;
  return mod;
}

export function renderGame(container, socket, state, navigate) {
  const { session, gameState } = state;
  const gameType = gameState?.gameType || guessGameType(gameState);

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;height:calc(100vh - 52px)">
      <div id="game-renderer-area" style="flex:1;overflow:auto;padding:var(--spacing-md)"></div>
      <div style="border-top:1px solid var(--color-border);padding:var(--spacing-sm) var(--spacing-md);display:flex;gap:var(--spacing-sm);align-items:center;background:var(--color-bg-card)">
        <div id="timer-mount" style="flex:1"></div>
        <button class="btn btn-secondary btn-sm" id="btn-toggle-chat">💬 Chat</button>
      </div>
      <div id="chat-panel" style="border-top:1px solid var(--color-border);display:none">
        <div id="chat-mount" style="padding:var(--spacing-sm)"></div>
      </div>
    </div>`;

  const rendererArea = container.querySelector('#game-renderer-area');
  const timerMount = container.querySelector('#timer-mount');
  const chatMount = container.querySelector('#chat-mount');

  let renderer = null;
  let chat = null;
  let timer = null;

  // Load renderer async
  const gt = gameState?.gameType || guessGameType(gameState);
  if (gt) {
    loadRenderer(gt).then(mod => {
      renderer = mod;
      mod.render(rendererArea, state.gameState, socket, socket.playerId);
    }).catch(() => {
      rendererArea.innerHTML = '<p class="text-muted" style="padding:2rem">Game renderer not found.</p>';
    });
  }

  chat = new ChatComponent(chatMount, socket, 'game', session?.id);
  timer = new TimerComponent(timerMount);

  // Chat toggle
  const chatPanel = container.querySelector('#chat-panel');
  container.querySelector('#btn-toggle-chat').addEventListener('click', () => {
    const hidden = chatPanel.style.display === 'none';
    chatPanel.style.display = hidden ? 'block' : 'none';
  });

  return {
    update(data) {
      if (data.state) {
        state.gameState = data.state;
        renderer?.update?.(data.state);
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
    onTimer(data) { timer?.update(data); },
    onReconnect(playerId) {
      document.getElementById('announcement-bar').style.display = 'none';
    },
    onError(code, message) { alert(`Error: ${message}`); },
    destroy() { chat?.destroy?.(); timer?.destroy?.(); renderer?.destroy?.(); },
  };
}

function guessGameType(gameState) {
  if (!gameState) return null;
  if ('dealerHand' in gameState) return 'blackjack';
  if ('community' in gameState) return 'poker';
  if ('pileSize' in gameState || 'currentRankIndex' in gameState) return 'bs';
  return null;
}
