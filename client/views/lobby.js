// Lobby view — waiting room, ready-up, chat (gc-* design system)
import { ChatComponent } from '../components/chat.js';

export function renderLobby(container, socket, state, navigate) {
  const { lobby, lobbyPlayers } = state;

  container.innerHTML = `
    <div class="gc-lobby-wait">
      <div class="gc-lobby-wait-inner">
        <div class="gc-lobby-wait-card">
          <div class="gc-lobby-wait-title-row">
            <button class="gc-lobby-back-btn" id="btn-back">← Back</button>
            <h1 class="gc-lobby-wait-title" id="lobby-title">
              ${escHtml(lobby?.game_type || 'Game')} Lobby
            </h1>
            <span class="gc-lobby-badge" id="lobby-badge">${escHtml(lobby?.game_type || '')}</span>
          </div>
          <div class="gc-lobby-code-wrap">
            <div>
              <div class="gc-lobby-code-label">Join Code</div>
              <div class="gc-lobby-code-value" id="code-display">${escHtml(lobby?.join_code || '----')}</div>
            </div>
            <button class="gc-lobby-copy-btn" id="btn-copy-link">📋 Copy Link</button>
          </div>

          <div id="bot-fill-banner" class="gc-lobby-bot-banner"></div>

          <div id="players-list" class="gc-lobby-players-list"></div>
          <div id="lobby-error" class="gc-lobby-error"></div>

          <div class="gc-lobby-actions">
            <button class="gc-btn-ghost" id="btn-ready">Ready</button>
            <button class="gc-btn-gold" id="btn-start" style="display:none">Start Game</button>
          </div>
        </div>

        <div class="gc-lobby-wait-card">
          <h2 class="gc-lobby-chat-title">Chat</h2>
          <div id="chat-mount"></div>
        </div>
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
        lobbyTitle.textContent = `${meta.label.toUpperCase()} Lobby`;
        lobbyBadge.textContent = meta.label.toUpperCase();
        if (meta.botFillAllowed) {
          botFillBanner.textContent = `Bots will fill automatically to reach ${meta.botFillMin} players.`;
          botFillBanner.style.display = 'block';
        }
      }
    })
    .catch(() => {});

  function renderPlayers(players) {
    if (!players || players.length === 0) {
      playersList.innerHTML = '<p class="gc-muted-text">Waiting for players...</p>';
      return;
    }
    const amIHost = state.myPlayerId === state.lobby?.host_player_id;
    playersList.innerHTML = players.map(p => {
      const isHost = p.id === state.lobby?.host_player_id;
      const isMe = p.id === state.myPlayerId;
      const avatarBg = p.avatar_color || '#6366f1';
      const chips = p.chips != null ? p.chips : 0;
      return `<div class="gc-lobby-player-item">
        <div class="gc-lobby-player-avatar" style="background:${escHtml(avatarBg)}">${escHtml(p.avatar_emoji || '🎮')}</div>
        <div class="gc-lobby-player-info">
          <div class="gc-lobby-player-name">${escHtml(p.display_name)}${isHost ? ' 👑' : ''}${isMe ? ' (you)' : ''}</div>
          <div class="gc-lobby-player-meta">${p.role === 'spectator' ? '👁 Spectator' : (p.is_bot ? '🤖 Bot' : '👤 Player')}${p.role !== 'spectator' ? ` · 🪙${chips}` : ''}</div>
        </div>
        <div class="gc-lobby-ready-dot${p.is_ready ? ' is-ready' : ''}" title="${p.is_ready ? 'Ready' : 'Not ready'}"></div>
        ${amIHost && !isMe && !p.is_bot && p.role !== 'spectator' ? `<button class="gc-lobby-transfer-btn" data-transfer="${escHtml(p.id)}" title="Transfer host" style="background:none;border:1px solid rgba(255,255,255,0.1);color:rgba(240,240,248,0.4);border-radius:5px;padding:2px 7px;cursor:pointer;font-size:0.75rem;margin-right:2px">👑</button>` : ''}
        ${amIHost && !isMe && p.role !== 'spectator' ? `<button class="gc-lobby-kick-btn" data-kick="${escHtml(p.id)}">Kick</button>` : ''}
      </div>`;
    }).join('');

    playersList.querySelectorAll('.gc-lobby-kick-btn').forEach(btn => {
      btn.addEventListener('click', () => { window._kickPlayer(btn.dataset.kick); });
    });
    playersList.querySelectorAll('.gc-lobby-transfer-btn').forEach(btn => {
      btn.addEventListener('click', () => { window._transferHost(btn.dataset.transfer); });
    });
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

  // Back button — leave lobby and return to home
  container.querySelector('#btn-back').addEventListener('click', () => {
    socket.emit('lobby:leave', { lobbyId: state.lobby?.id });
    navigate('home');
  });

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
    readyBtn.classList.toggle('gc-btn-gold', isReady);
    readyBtn.classList.toggle('gc-btn-ghost', !isReady);
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

  // Global transfer host handler
  window._transferHost = (targetId) => {
    const target = state.lobbyPlayers?.find(p => p.id === targetId);
    const name = target?.display_name || 'this player';
    if (confirm(`Transfer host to ${name}?`)) {
      socket.emit('lobby:transfer_host', { lobbyId: state.lobby?.id, targetPlayerId: targetId });
    }
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
      delete window._transferHost;
      chat?.destroy?.();
    },
  };
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
