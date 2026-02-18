// Lobby view — waiting room, ready-up, chat, settings
import { ChatComponent } from '../components/chat.js';
import { ReadyIndicator } from '../components/ready-indicator.js';

export function renderLobby(container, socket, state, navigate) {
  const { lobby, lobbyPlayers } = state;

  container.innerHTML = `
    <div class="page" style="max-width:660px">
      <div class="card" style="margin-bottom:var(--spacing-md)">
        <div class="flex items-center justify-between" style="margin-bottom:var(--spacing-md)">
          <h1 class="section-heading" style="margin:0">
            ${escHtml(gameLabel(lobby?.game_type))} Lobby
          </h1>
          <span class="badge badge-accent">${escHtml(lobby?.game_type || '')}</span>
        </div>
        <div class="join-code-display" style="margin-bottom:var(--spacing-md)">
          <div>
            <div class="text-muted" style="font-size:var(--font-size-sm);margin-bottom:2px">Join Code</div>
            <div class="code" id="code-display">${escHtml(lobby?.join_code || '----')}</div>
          </div>
          <button class="btn btn-secondary btn-sm" id="btn-copy-link">📋 Copy Link</button>
        </div>

        <div id="players-list"></div>
        <div id="lobby-error" class="error-msg" style="display:none;margin-top:var(--spacing-sm)"></div>

        <div style="display:flex;gap:var(--spacing-sm);margin-top:var(--spacing-md)">
          <button class="btn btn-secondary" id="btn-ready" style="flex:1">Ready</button>
          <button class="btn btn-primary" id="btn-start" style="flex:1;display:none">Start Game</button>
        </div>
      </div>

      <!-- Settings (host only) -->
      <div id="settings-section" class="card" style="margin-bottom:var(--spacing-md);display:none">
        <h2 class="section-heading" style="font-size:var(--font-size-lg)">Settings</h2>
        <div id="game-settings-fields"></div>
        <button class="btn btn-secondary btn-sm" id="btn-save-settings">Save Settings</button>
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
  const settingsSection = container.querySelector('#settings-section');

  let isReady = false;
  let chat;

  function getPlayerId() { return socket.id; } // will be overridden when server gives us playerId

  function renderPlayers(players) {
    if (!players || players.length === 0) {
      playersList.innerHTML = '<p class="text-muted">Waiting for players...</p>';
      return;
    }
    playersList.innerHTML = players.map(p => {
      const isHost = p.id === state.lobby?.host_player_id;
      const isMe = p.id === socket.playerId;
      return `<div class="player-item">
        <div class="avatar" style="background:${escHtml(p.avatar_color || '#6366f1')}">${escHtml(p.avatar_emoji || '🎮')}</div>
        <div class="player-info">
          <div class="player-name">${escHtml(p.display_name)}${isHost ? ' 👑' : ''}${isMe ? ' (you)' : ''}</div>
          <div class="player-meta">${p.role === 'spectator' ? '👁 Spectator' : (p.is_bot ? '🤖 Bot' : '👤 Player')}</div>
        </div>
        <div class="ready-dot${p.is_ready ? ' is-ready' : ''}" title="${p.is_ready ? 'Ready' : 'Not ready'}"></div>
        ${isHost && !isMe && p.role !== 'spectator' ? `<button class="btn btn-danger btn-sm" onclick="window._kickPlayer('${p.id}')">Kick</button>` : ''}
      </div>`;
    }).join('');
  }

  function updateHostControls(players) {
    const myLobby = state.lobby;
    const isHost = myLobby && socket.playerId === myLobby.host_player_id;
    startBtn.style.display = isHost ? 'block' : 'none';
    settingsSection.style.display = isHost ? 'block' : 'none';
    if (isHost) renderSettingsFields(myLobby.game_type);
  }

  function renderSettingsFields(gameType) {
    const fields = container.querySelector('#game-settings-fields');
    const settings = JSON.parse(state.lobby?.settings || '{}');
    let html = '';
    if (gameType === 'poker') {
      html = `
        <div class="form-group">
          <label>Small Blind</label>
          <input class="input" id="setting-smallBlind" type="number" value="${settings.smallBlind || 10}" min="1">
        </div>
        <div class="form-group">
          <label>Big Blind</label>
          <input class="input" id="setting-bigBlind" type="number" value="${settings.bigBlind || 20}" min="2">
        </div>
        <div class="form-group">
          <label>Starting Chips</label>
          <input class="input" id="setting-startingChips" type="number" value="${settings.startingChips || 1000}" min="100">
        </div>`;
    }
    html += `<div class="form-group">
      <label>Bot Difficulty</label>
      <select class="input" id="setting-botDifficulty">
        <option value="easy"${settings.botDifficulty === 'easy' ? ' selected' : ''}>Easy</option>
        <option value="medium"${!settings.botDifficulty || settings.botDifficulty === 'medium' ? ' selected' : ''}>Medium</option>
        <option value="hard"${settings.botDifficulty === 'hard' ? ' selected' : ''}>Hard</option>
      </select>
    </div>`;
    fields.innerHTML = html;
  }

  // Init
  renderPlayers(lobbyPlayers);
  updateHostControls(lobbyPlayers);

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

  // Save settings
  container.querySelector('#btn-save-settings').addEventListener('click', () => {
    const gameType = state.lobby?.game_type;
    const settings = { botDifficulty: container.querySelector('#setting-botDifficulty')?.value };
    if (gameType === 'poker') {
      settings.smallBlind = parseInt(container.querySelector('#setting-smallBlind')?.value) || 10;
      settings.bigBlind = parseInt(container.querySelector('#setting-bigBlind')?.value) || 20;
      settings.startingChips = parseInt(container.querySelector('#setting-startingChips')?.value) || 1000;
    }
    socket.emit('lobby:settings', { lobbyId: state.lobby?.id, settings });
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
      updateHostControls(players);
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

function gameLabel(type) {
  const labels = { blackjack: 'Blackjack', poker: 'Poker', bs: 'BS', game_night: 'Game Night' };
  return labels[type] || type || 'Game';
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
