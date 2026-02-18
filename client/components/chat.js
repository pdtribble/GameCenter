// Reusable chat component
// channel: 'lobby' | 'game'
// channelId: lobbyId or sessionId

export class ChatComponent {
  constructor(container, socket, channel, channelId) {
    this.container = container;
    this.socket = socket;
    this.channel = channel;
    this.channelId = channelId;

    container.innerHTML = `
      <div class="chat-container">
        <div class="chat-messages" id="chat-msgs-${channel}"></div>
        <div class="chat-input-row">
          <input type="text" placeholder="Say something..." maxlength="280" id="chat-input-${channel}" autocomplete="off">
          <button id="chat-send-${channel}">Send</button>
        </div>
      </div>`;

    this.msgEl = container.querySelector(`#chat-msgs-${channel}`);
    const input = container.querySelector(`#chat-input-${channel}`);
    const sendBtn = container.querySelector(`#chat-send-${channel}`);

    const send = () => {
      const msg = input.value.trim();
      if (!msg) return;
      input.value = '';
      const event = channel === 'lobby' ? 'lobby:chat' : 'game:chat';
      const payload = channel === 'lobby'
        ? { lobbyId: channelId, message: msg }
        : { sessionId: channelId, message: msg };
      socket.emit(event, payload);
    };

    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  }

  append(msg) {
    if (!this.msgEl) return;
    const div = document.createElement('div');
    div.className = 'chat-msg';

    if (msg.system) {
      div.innerHTML = `<span class="msg-system">${escHtml(msg.message)}</span>`;
    } else {
      const isSpectator = msg.isSpectator ? ' <span class="spectator-badge" style="font-size:0.65rem">👁</span>' : '';
      div.innerHTML = `<span class="msg-name">${escHtml(msg.displayName || 'Anonymous')}${isSpectator}: </span>${escHtml(msg.message)}`;
    }

    this.msgEl.appendChild(div);
    this.msgEl.scrollTop = this.msgEl.scrollHeight;
  }

  destroy() { this.container.innerHTML = ''; }
}

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
