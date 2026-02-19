// BS (Cheat) renderer

export function render(container, gameState, socket, playerId) {
  container.innerHTML = `
    <div class="game-area">
      <div class="card">
        <h3 style="margin-bottom:var(--spacing-sm);color:var(--color-text-secondary)">BS — Cheat</h3>
        <div class="flex items-center gap-md" style="margin-bottom:var(--spacing-md)">
          <div>
            <span class="text-muted">Pile size: </span>
            <strong id="pile-size">0</strong> cards
          </div>
          <div>
            <span class="text-muted">Required rank: </span>
            <strong id="required-rank" style="color:var(--color-accent);font-size:var(--font-size-lg)"></strong>
          </div>
        </div>
        <div id="last-play" class="text-muted" style="font-style:italic;margin-bottom:var(--spacing-md)"></div>
        <button class="btn btn-danger btn-sm" id="btn-bs" style="display:none">📢 Call BS!</button>
      </div>

      <div class="card">
        <h3 style="margin-bottom:var(--spacing-sm);color:var(--color-text-secondary)">Your Hand</h3>
        <div class="cards-row" id="my-cards"></div>
        <div id="my-count" class="text-muted" style="margin-top:var(--spacing-xs)"></div>

        <div id="play-area" style="margin-top:var(--spacing-md);display:none">
          <p class="text-muted" style="margin-bottom:var(--spacing-sm)">Select cards to play (1–4), then click Play:</p>
          <div style="display:flex;gap:var(--spacing-sm)">
            <button class="btn btn-primary" id="btn-play">Play Selected</button>
          </div>
        </div>
      </div>

      <div class="card">
        <h3 style="margin-bottom:var(--spacing-sm);color:var(--color-text-secondary)">Players</h3>
        <div id="players-list"></div>
      </div>

      <div id="status-bar" class="text-muted text-center"></div>
    </div>`;

  const sessionId = socket.currentSessionId;
  const myId = playerId;
  let selectedCards = [];
  const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

  container.querySelector('#btn-bs').addEventListener('click', () => {
    socket.emit('game:action', { sessionId, action: { type: 'bs', payload: {} } });
  });

  container.querySelector('#btn-play').addEventListener('click', () => {
    if (selectedCards.length === 0) { alert('Select at least 1 card.'); return; }
    const requiredRank = RANKS[gameState?.currentRankIndex || 0];
    socket.emit('game:action', {
      sessionId,
      action: {
        type: 'play',
        payload: { cards: selectedCards, claimedRank: requiredRank, claimedCount: selectedCards.length },
      },
    });
    selectedCards = [];
  });

  function renderMyCards(hand, isMyTurn) {
    const el = container.querySelector('#my-cards');
    if (!el) return;
    el.innerHTML = '';
    for (const card of hand) {
      const div = document.createElement('div');
      const isRed = card.suit === '♥' || card.suit === '♦';
      div.className = `playing-card ${isRed ? 'hearts' : 'spades'} selectable`;
      div.innerHTML = `<div class="card-rank">${escHtml(card.rank)}</div><div class="card-suit">${escHtml(card.suit)}</div>`;
      div.addEventListener('click', () => {
        if (!isMyTurn) return;
        const idx = selectedCards.findIndex(c => c.suit === card.suit && c.rank === card.rank);
        if (idx >= 0) { selectedCards.splice(idx, 1); div.classList.remove('selected'); }
        else if (selectedCards.length < 4) { selectedCards.push(card); div.classList.add('selected'); }
      });
      el.appendChild(div);
    }
  }

  updateView(gameState, myId, container, renderMyCards);
}

export function update(gameState, playerId) {
  const container = document.querySelector('#game-renderer-area');
  if (container) updateView(gameState, playerId, container);
}

function updateView(state, playerId, container, renderMyCards) {
  if (!state) return;
  const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const myId = playerId || state.playerIds?.[0];

  const pileSizeEl = container.querySelector('#pile-size');
  if (pileSizeEl) pileSizeEl.textContent = state.pileSize ?? 0;

  const requiredRankEl = container.querySelector('#required-rank');
  if (requiredRankEl) requiredRankEl.textContent = RANKS[state.currentRankIndex || 0] || '?';

  const lastPlayEl = container.querySelector('#last-play');
  if (lastPlayEl) {
    if (state.lastPlay) {
      lastPlayEl.textContent = `Last play: ${state.lastPlay.playerId === myId ? 'You' : state.lastPlay.playerId} played ${state.lastPlay.claimedCount} × ${state.lastPlay.claimedRank}`;
    } else {
      lastPlayEl.textContent = '';
    }
  }

  // BS button — show if someone else just played
  const bsBtn = container.querySelector('#btn-bs');
  if (bsBtn) {
    bsBtn.style.display = (state.lastPlay && state.lastPlay.playerId !== myId) ? 'inline-flex' : 'none';
  }

  const isMyTurn = state.currentPlayerId === myId;
  const myHand = state.hands?.[myId] || [];

  if (typeof renderMyCards === 'function') {
    renderMyCards(myHand, isMyTurn);
  }

  const myCountEl = container.querySelector('#my-count');
  if (myCountEl) myCountEl.textContent = `${myHand.length} cards in hand`;

  const playArea = container.querySelector('#play-area');
  if (playArea) playArea.style.display = isMyTurn ? 'block' : 'none';

  // Players
  const playersEl = container.querySelector('#players-list');
  if (playersEl && state.players) {
    playersEl.innerHTML = state.players.map(p => {
      const count = state.handCounts?.[p.id] ?? '?';
      const isCurrent = state.currentPlayerId === p.id;
      return `<div class="player-item">
        <div class="player-info">
          <div class="player-name">${escHtml(p.displayName)}${isCurrent ? ' ⟵' : ''}</div>
          <div class="text-muted">${count} cards</div>
        </div>
      </div>`;
    }).join('');
  }

  const statusEl = container.querySelector('#status-bar');
  if (statusEl) {
    if (isMyTurn) statusEl.textContent = `Your turn — play ${RANKS[state.currentRankIndex || 0]}`;
    else {
      const curr = state.players?.find(p => p.id === state.currentPlayerId);
      statusEl.textContent = curr ? `Waiting for ${curr.displayName}...` : '';
    }
  }
}

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
