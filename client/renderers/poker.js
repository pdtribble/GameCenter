// Poker renderer — Texas Hold'em

export function render(container, gameState, socket, playerId) {
  container.innerHTML = `
    <div class="game-area">
      <div class="card" id="community-area">
        <h3 style="margin-bottom:var(--spacing-sm);color:var(--color-text-secondary)">Community Cards <span id="phase-label" class="badge badge-accent"></span></h3>
        <div class="cards-row" id="community-cards"></div>
        <div id="pot-display" style="margin-top:var(--spacing-sm);font-weight:700;color:var(--color-accent)"></div>
      </div>

      <div class="card" id="players-area">
        <h3 style="margin-bottom:var(--spacing-sm);color:var(--color-text-secondary)">Players</h3>
        <div id="players-list"></div>
      </div>

      <div class="card" id="my-area">
        <h3 style="margin-bottom:var(--spacing-sm);color:var(--color-text-secondary)">Your Hand</h3>
        <div class="cards-row" id="my-hole-cards"></div>
        <div id="my-chips" class="text-muted" style="margin-top:var(--spacing-xs)"></div>
        <div id="action-area" style="margin-top:var(--spacing-md)">
          <div style="display:flex;gap:var(--spacing-sm);flex-wrap:wrap" id="action-buttons">
            <button class="btn btn-secondary" id="btn-fold">Fold</button>
            <button class="btn btn-secondary" id="btn-check">Check</button>
            <button class="btn btn-primary" id="btn-call" style="display:none">Call</button>
            <div style="display:flex;gap:var(--spacing-sm);align-items:center">
              <input type="number" id="raise-amount" class="input" style="width:100px" placeholder="Amount" min="1">
              <button class="btn btn-primary" id="btn-raise">Raise</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  const sessionId = socket.currentSessionId;
  const myId = playerId;

  function emit(action) { socket.emit('game:action', { sessionId, action }); }

  container.querySelector('#btn-fold').addEventListener('click', () => emit({ type: 'fold', payload: {} }));
  container.querySelector('#btn-check').addEventListener('click', () => emit({ type: 'check', payload: {} }));
  container.querySelector('#btn-call').addEventListener('click', () => emit({ type: 'call', payload: {} }));
  container.querySelector('#btn-raise').addEventListener('click', () => {
    const amount = parseInt(container.querySelector('#raise-amount').value) || 0;
    emit({ type: 'raise', payload: { amount } });
  });

  updateView(gameState, myId, container);
}

export function update(gameState, playerId) {
  const container = document.querySelector('#game-renderer-area');
  if (container) updateView(gameState, playerId, container);
}

function updateView(state, playerId, container) {
  if (!state) return;
  const myId = playerId || state.playerIds?.[0];

  // Community cards
  renderCards(container.querySelector('#community-cards'), state.community || []);
  const phaseEl = container.querySelector('#phase-label');
  if (phaseEl) phaseEl.textContent = state.phase || '';
  const potEl = container.querySelector('#pot-display');
  if (potEl) potEl.textContent = `Pot: ${state.pot || 0}`;

  // My hole cards
  const myHand = state.holeCards?.[myId] || [];
  renderCards(container.querySelector('#my-hole-cards'), myHand);
  const chipsEl = container.querySelector('#my-chips');
  if (chipsEl) chipsEl.textContent = `Chips: ${state.chips?.[myId] ?? '?'} | Bet: ${state.bets?.[myId] ?? 0}`;

  // Players
  const playersEl = container.querySelector('#players-list');
  if (playersEl && state.players) {
    playersEl.innerHTML = state.players.map(p => {
      const isFolded = state.foldedPlayers?.includes(p.id);
      const isActive = state.currentPlayerId === p.id;
      return `<div class="player-item${isFolded ? ' opacity-50' : ''}">
        <div class="player-info">
          <div class="player-name">${escHtml(p.displayName)}${isActive ? ' ⟵' : ''}${isFolded ? ' (folded)' : ''}</div>
          <div class="text-muted">Chips: ${state.chips?.[p.id] ?? '?'} | Bet: ${state.bets?.[p.id] || 0}</div>
        </div>
        <div class="cards-row" style="gap:4px">${renderHandHtml(state.holeCards?.[p.id] || [], p.id === myId)}</div>
      </div>`;
    }).join('');
  }

  // Actions
  const isMyTurn = state.currentPlayerId === myId && state.phase !== 'showdown';
  const actionsEl = container.querySelector('#action-buttons');
  if (actionsEl) actionsEl.style.display = isMyTurn ? 'flex' : 'none';

  if (isMyTurn) {
    const toCall = (state.currentBet || 0) - (state.bets?.[myId] || 0);
    const callBtn = container.querySelector('#btn-call');
    const checkBtn = container.querySelector('#btn-check');
    if (callBtn && checkBtn) {
      callBtn.style.display = toCall > 0 ? 'inline-flex' : 'none';
      callBtn.textContent = `Call ${toCall}`;
      checkBtn.style.display = toCall === 0 ? 'inline-flex' : 'none';
    }
  }
}

function renderCards(el, cards) {
  if (!el) return;
  el.innerHTML = cards.map(c => cardHtml(c)).join('');
}

function renderHandHtml(cards, showFront) {
  return cards.map(c => cardHtml(showFront ? c : { suit: '?', rank: '?' })).join('');
}

function cardHtml(card) {
  if (!card) return '';
  const isRed = card.suit === '♥' || card.suit === '♦';
  const cls = `playing-card ${isRed ? 'hearts' : 'spades'}${card.rank === '?' ? ' face-down' : ''}`;
  return `<div class="${cls}"><div class="card-rank">${escHtml(card.rank)}</div><div class="card-suit">${escHtml(card.suit)}</div></div>`;
}

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
