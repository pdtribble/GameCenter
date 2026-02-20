// Lobby view — waiting room, ready-up, chat
import { ChatComponent } from '../components/chat.js';

export function renderLobby(container, socket, state, navigate) {
  const { lobby, lobbyPlayers } = state;

  container.innerHTML = `
    <div class="page" style="max-width:660px">
      <div class="card" style="margin-bottom:var(--spacing-md)">
        <div class="flex items-center justify-between" style="margin-bottom:var(--spacing-md)">
          <h1 class="section-heading" style="margin:0" id="lobby-title">
            ${escHtml(lobby?.game_type || 'Game')} Lobby
          </h1>
          <span class="badge badge-accent" id="lobby-badge">${escHtml(lobby?.game_type || '')}</span>
        </div>
        <div class="join-code-display" style="margin-bottom:var(--spacing-md)">
          <div>
            <div class="text-muted" style="font-size:var(--font-size-sm);margin-bottom:2px">Join Code</div>
            <div class="code" id="code-display">${escHtml(lobby?.join_code || '----')}</div>
          </div>
          <button class="btn btn-secondary btn-sm" id="btn-copy-link">📋 Copy Link</button>
        </div>

        <div id="bot-fill-banner" class="text-muted" style="font-size:var(--font-size-sm);margin-bottom:var(--spacing-sm);display:none"></div>

        <div id="players-list"></div>
        <div id="lobby-error" class="error-msg" style="display:none;margin-top:var(--spacing-sm)"></div>

        <div style="display:flex;gap:var(--spacing-sm);margin-top:var(--spacing-md)">
          <button class="btn btn-secondary" id="btn-ready" style="flex:1">Ready</button>
          <button class="btn btn-primary" id="btn-start" style="flex:1;display:none">Start Game</button>
        </div>
      </div>

      <!-- Chat -->
      <div class="card">
        <h2 class="section-heading" style="font-size:var(--font-size-lg);margin-bottom:var(--spacing-sm)">Chat</h2>
        <div id="chat-mount"></div>
      </div>
    </div>`;

  const playersList = container.querySelector('#players-list');
  const startBtn = container.querySelector('#btn-start');
  const readyBtn = container.querySelector('#btn-ready');
  const errorEl = container.querySelector('#lobby-error');
  const botFillBanner = container.querySelector('#bot-fill-banner');
  const lobbyTitle = container.querySelector('#lobby-title');
  const lobbyBadge = container.querySelector('#lobby-badge');

  let isReady = false;
  let chat;

  // Fetch game metadata to show bot fill info and correct game label
  fetch('/api/games')
    .then(r => r.json())
    .then(games => {
      const meta = games.find(g => g.gameType === lobby?.game_type);
      if (meta) {
        lobbyTitle.textContent = `${meta.label} Lobby`;
        lobbyBadge.textContent = meta.label;
        if (meta.botFillAllowed) {
          botFillBanner.textContent = `Bots will fill automatically to reach ${meta.botFillMin} players.`;
          botFillBanner.style.display = 'block';
        }
      }
    })
    .catch(() => {});

  function renderPlayers(players) {
    if (!players || players.length === 0) {
      playersList.innerHTML = '<p class="text-muted">Waiting for players...</p>';
      return;
    }
    const amIHost = state.myPlayerId === state.lobby?.host_player_id;
    playersList.innerHTML = players.map(p => {
      const isHost = p.id === state.lobby?.host_player_id;
      const isMe = p.id === state.myPlayerId;
      return `<div class="player-item">
        <div class="avatar" style="background:${escHtml(p.avatar_color || '#6366f1')}">${escHtml(p.avatar_emoji || '🎮')}</div>
        <div class="player-info">
          <div class="player-name">${escHtml(p.display_name)}${isHost ? ' 👑' : ''}${isMe ? ' (you)' : ''}</div>
          <div class="player-meta">${p.role === 'spectator' ? '👁 Spectator' : (p.is_bot ? '🤖 Bot' : '👤 Player')}</div>
        </div>
        <div class="ready-dot${p.is_ready ? ' is-ready' : ''}" title="${p.is_ready ? 'Ready' : 'Not ready'}"></div>
        ${amIHost && !isMe && p.role !== 'spectator' ? `<button class="btn btn-danger btn-sm" onclick="window._kickPlayer('${p.id}')">Kick</button>` : ''}
      </div>`;
    }).join('');
  }

  function updateHostControls() {
    const isHost = state.lobby && state.myPlayerId === state.lobby.host_player_id;
    startBtn.style.display = isHost ? 'block' : 'none';
  }

  // Init
  renderPlayers(lobbyPlayers);
  updateHostControls();

  // Chat
  chat = new ChatComponent(container.querySelector('#chat-mount'), socket, 'lobby', state.lobby?.id);

  // Copy invite link
  container.querySelector('#btn-copy-link').addEventListener('click', () => {
    const url = `${location.origin}/join/${state.lobby?.join_code}`;
    navigator.clipboard.writeText(url).then(() => {
      const btn = container.querySelector('#btn-copy-link');
      btn.textContent = '✅ Copied!';
      setTimeout(() => { btn.textContent = '📋 Copy Link'; }, 2000);
    });
  });

  // Ready button
  readyBtn.addEventListener('click', () => {
    isReady = !isReady;
    readyBtn.textContent = isReady ? 'Unready' : 'Ready';
    readyBtn.className = isReady ? 'btn btn-success' : 'btn btn-secondary';
    socket.emit(isReady ? 'lobby:ready' : 'lobby:unready', { lobbyId: state.lobby?.id });
  });

  // Start button
  startBtn.addEventListener('click', () => {
    errorEl.style.display = 'none';
    socket.emit('lobby:start', { lobbyId: state.lobby?.id });
  });

  // Global kick handler
  window._kickPlayer = (targetId) => {
    socket.emit('lobby:kick', { lobbyId: state.lobby?.id, targetPlayerId: targetId });
  };

  return {
    update({ lobby, players }) {
      state.lobby = lobby;
      state.lobbyPlayers = players;
      renderPlayers(players);
      updateHostControls();
      const codeEl = container.querySelector('#code-display');
      if (codeEl) codeEl.textContent = lobby?.join_code || '----';
    },
    onPlayerJoined(player, role) {
      state.lobbyPlayers.push({ ...player, role, is_ready: 0 });
      renderPlayers(state.lobbyPlayers);
    },
    onChat(msg) { chat?.append(msg); },
    onError(code, message) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    },
    destroy() {
      delete window._kickPlayer;
      chat?.destroy?.();
    },
  };
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
