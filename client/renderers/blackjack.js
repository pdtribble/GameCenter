// Blackjack renderer

export function render(container, gameState, socket, playerId) {
  container.innerHTML = `
    <div class="game-area">
      <div class="card" id="dealer-area">
        <h3 style="margin-bottom:var(--spacing-sm);color:var(--color-text-secondary)">Dealer</h3>
        <div class="cards-row" id="dealer-cards"></div>
        <div id="dealer-total" class="text-muted" style="margin-top:var(--spacing-xs)"></div>
      </div>

      <div class="card" id="my-area">
        <h3 style="margin-bottom:var(--spacing-sm);color:var(--color-text-secondary)">Your Hand</h3>
        <div class="cards-row" id="my-cards"></div>
        <div id="my-total" style="margin-top:var(--spacing-xs);font-weight:700"></div>
        <div style="display:flex;gap:var(--spacing-sm);margin-top:var(--spacing-md)" id="action-buttons">
          <button class="btn btn-primary" id="btn-hit">Hit</button>
          <button class="btn btn-secondary" id="btn-stand">Stand</button>
        </div>
      </div>

      <div id="other-players" class="card">
        <h3 style="margin-bottom:var(--spacing-sm);color:var(--color-text-secondary)">Other Players</h3>
        <div id="other-players-list"></div>
      </div>

      <div id="status-bar" class="text-muted text-center"></div>
    </div>`;

  const sessionId = socket.currentSessionId;

  container.querySelector('#btn-hit').addEventListener('click', () => {
    socket.emit('game:action', { sessionId, action: { type: 'hit', payload: {} } });
  });

  container.querySelector('#btn-stand').addEventListener('click', () => {
    socket.emit('game:action', { sessionId, action: { type: 'stand', payload: {} } });
  });

  updateView(gameState, playerId, container);
}

export function update(gameState, playerId) {
  const container = document.querySelector('#game-renderer-area');
  if (container) updateView(gameState, playerId, container);
}

function updateView(state, playerId, container) {
  if (!state) return;

  const myId = playerId || detectMyId(state);

  // Dealer
  renderCards(container.querySelector('#dealer-cards'), state.dealerHand || []);
  const dealerTotal = state.dealerHidden ? '?' : handTotal(state.dealerHand || []);
  const dealerEl = container.querySelector('#dealer-total');
  if (dealerEl) dealerEl.textContent = `Total: ${dealerTotal}`;

  // My hand
  const myHand = state.playerHands?.[myId] || [];
  renderCards(container.querySelector('#my-cards'), myHand);
  const total = handTotal(myHand);
  const myTotalEl = container.querySelector('#my-total');
  if (myTotalEl) {
    myTotalEl.textContent = `Total: ${total}`;
    myTotalEl.style.color = total > 21 ? 'var(--color-danger)' : total === 21 ? 'var(--color-success)' : 'var(--color-text-primary)';
  }

  // Action buttons
  const actionBtns = container.querySelector('#action-buttons');
  if (actionBtns) {
    const isMyTurn = state.currentPlayerId === myId && state.phase === 'playing';
    actionBtns.style.display = isMyTurn ? 'flex' : 'none';
  }

  // Other players
  const otherList = container.querySelector('#other-players-list');
  if (otherList && state.players) {
    const others = state.players.filter(p => p.id !== myId);
    otherList.innerHTML = others.map(p => {
      const hand = state.playerHands?.[p.id] || [];
      const t = handTotal(hand);
      const status = state.playerStatus?.[p.id] || '';
      return `<div class="player-item">
        <div class="player-info">
          <div class="player-name">${escHtml(p.displayName)}${state.currentPlayerId === p.id ? ' ⟵' : ''}</div>
          <div class="text-muted">${status} — Total: ${t}</div>
        </div>
        <div class="cards-row" style="gap:4px">${hand.map(c => cardHtml(c)).join('')}</div>
      </div>`;
    }).join('');
    container.querySelector('#other-players').style.display = others.length ? 'block' : 'none';
  }

  // Status
  const statusEl = container.querySelector('#status-bar');
  if (statusEl) {
    if (state.phase === 'finished') {
      const myStatus = state.playerStatus?.[myId];
      const results = state.results?.find(r => r.playerId === myId);
      statusEl.textContent = results ? `Result: ${results.result.toUpperCase()}` : 'Game over';
    } else if (state.currentPlayerId === myId) {
      statusEl.textContent = 'Your turn — Hit or Stand';
    } else {
      const curr = state.players?.find(p => p.id === state.currentPlayerId);
      statusEl.textContent = curr ? `Waiting for ${curr.displayName}...` : 'Dealer\'s turn...';
    }
  }
}

function renderCards(el, cards) {
  if (!el) return;
  el.innerHTML = (cards || []).map(c => cardHtml(c)).join('');
}

function cardHtml(card) {
  if (!card) return '';
  const suit = card.suit;
  const isRed = suit === '♥' || suit === '♦';
  const cls = `playing-card ${isRed ? 'hearts' : 'spades'}${card.rank === '?' ? ' face-down' : ''}`;
  return `<div class="${cls}">
    <div class="card-rank">${escHtml(card.rank)}</div>
    <div class="card-suit">${escHtml(card.suit)}</div>
  </div>`;
}

function handTotal(hand) {
  if (!hand || hand.some(c => c.rank === '?')) return '?';
  let total = 0, aces = 0;
  for (const c of hand) {
    if (['J','Q','K'].includes(c.rank)) total += 10;
    else if (c.rank === 'A') { total += 11; aces++; }
    else total += parseInt(c.rank);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function detectMyId(state) { return state?.players?.[0]?.id || null; }

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
