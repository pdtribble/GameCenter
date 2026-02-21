// Blackjack renderer — dealer at top, players below, action buttons for current player
// Phone: scrollable list; Web: green felt table, arc/row of seats
// Intermission overlay is handled by game.js; this renderer only dims when enginePhase === 'intermission'

let _container = null;
let _socket = null;
let _playerId = null;
let _state = null;

export function render(container, state, socket, playerId, hostPlayerId) {
  _container = container;
  _socket = socket;
  _playerId = playerId;
  _state = state;
  draw(state);
}

export function update(state, playerId, hostPlayerId) {
  _state = state;
  if (playerId) _playerId = playerId;
  draw(state);
}

export function destroy() {
  _container = null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function handValue(cards) {
  if (!cards || cards.length === 0) return 0;
  let sum = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === 'A') aces++;
    else if (c.rank === 'J' || c.rank === 'Q' || c.rank === 'K') sum += 10;
    else sum += parseInt(c.rank, 10) || 0;
  }
  for (let i = 0; i < aces; i++) {
    if (sum + 11 + (aces - 1 - i) <= 21) sum += 11;
    else sum += 1;
  }
  return sum;
}

function isRedSuit(suit) {
  return suit === '\u2665' || suit === '\u2666'; // ♥ ♦
}

function renderCard(card, faceDown = false) {
  if (faceDown || (card && card.hole)) {
    return `<div class="playing-card card-face-down">🂠</div>`;
  }
  if (!card || !card.rank) return '';
  const red = isRedSuit(card.suit);
  return `<div class="playing-card${red ? ' card-red' : ''}">
    <span class="card-rank">${escHtml(card.rank)}</span><span class="card-suit">${escHtml(card.suit)}</span>
  </div>`;
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Main draw ────────────────────────────────────────────────────────────────
function draw(state) {
  if (!_container || !state) return;

  const { round, phase, dealerHand, players, currentPlayerId, config, enginePhase } = state;
  const myId = _playerId;
  const isIntermission = enginePhase === 'intermission';
  const isPhone = document.body.classList.contains('layout-phone');
  const myPlayer = (players || []).find(p => p.id === myId);
  const canAct = !isIntermission && phase === 'playing' && currentPlayerId === myId && myPlayer && myPlayer.status === 'playing';

  const dealerTotal = dealerHand && dealerHand.length && !dealerHand[0].hole
    ? handValue(dealerHand)
    : (dealerHand && dealerHand[1] ? handValue([dealerHand[1]]) : '?');
  const dealerBust = typeof dealerTotal === 'number' && dealerTotal > 21;

  const dealerHtml = `
    <div class="bj-dealer${phase === 'results' && dealerBust ? ' bj-bust' : ''}">
      <div class="bj-dealer-label">Dealer${phase === 'results' ? ` · ${dealerTotal}` : ''}</div>
      <div class="cards-row bj-dealer-cards">
        ${(dealerHand || []).map(c => renderCard(c)).join('')}
      </div>
    </div>`;

  const playerSeats = (players || []).map(p => {
    const isMe = p.id === myId;
    const total = handValue(p.hand);
    const bust = total > 21;
    const isBJ = p.hand && p.hand.length === 2 && total === 21;
    const result = p.result;
    const isWinner = result === 'win' || result === 'blackjack';
    const isPush = result === 'push';
    const statusBadge = p.status === 'bust' ? 'Bust' : p.status === 'blackjack' ? 'Blackjack' : p.status === 'stood' ? String(total) : (p.status === 'playing' && currentPlayerId === p.id ? 'Your turn' : '');
    const rowClass = [
      'bj-player-row',
      isMe ? ' bj-me' : '',
      phase === 'results' && isWinner ? ' bj-winner' : '',
      phase === 'results' && result === 'lose' ? ' bj-loser' : '',
      bust ? ' bj-bust-row' : '',
    ].join('');

    return `
      <div class="${rowClass}">
        <div class="bj-player-info">
          <span class="bj-player-name">${escHtml(p.displayName || p.id)}${p.is_bot ? ' 🤖' : ''}${isMe ? ' (you)' : ''}</span>
          <span class="bj-player-meta">Chips: ${p.chips ?? 0} · Bet: ${p.bet ?? 0}</span>
          ${statusBadge ? `<span class="bj-status-badge${bust ? ' bj-bust-badge' : ''}${isBJ ? ' bj-bj-badge' : ''}">${escHtml(String(statusBadge))}</span>` : ''}
        </div>
        <div class="cards-row bj-player-cards">
          ${(p.hand || []).map(c => renderCard(c)).join('')}
        </div>
        ${total > 0 ? `<div class="bj-hand-total">${total}</div>` : ''}
      </div>`;
  }).join('');

  const actionButtons = canAct ? `
    <div class="bj-actions">
      ${(myPlayer.hand.length === 2 && myPlayer.chips >= myPlayer.bet) ? `<button class="btn btn-secondary bj-btn" id="bj-double">Double</button>` : ''}
      <button class="btn btn-secondary bj-btn" id="bj-hit">Hit</button>
      <button class="btn btn-primary bj-btn" id="bj-stand">Stand</button>
    </div>` : '';

  const tableClass = isPhone ? 'bj-table bj-table-phone' : 'bj-table bj-table-web';
  const roundLabel = `Round ${round}`;

  _container.innerHTML = `
    <div class="${tableClass}${isIntermission ? ' bj-dimmed' : ''}">
      <div class="bj-round-label">${escHtml(roundLabel)}</div>
      ${dealerHtml}
      <div class="bj-players">${playerSeats}</div>
      ${actionButtons}
    </div>`;

  const emit = (type) => {
    _socket.emit('game:action', {
      sessionId: _socket.currentSessionId,
      action: { type },
    });
  };
  const hitEl = _container.querySelector('#bj-hit');
  const standEl = _container.querySelector('#bj-stand');
  const doubleEl = _container.querySelector('#bj-double');
  if (hitEl) hitEl.addEventListener('click', () => emit('hit'));
  if (standEl) standEl.addEventListener('click', () => emit('stand'));
  if (doubleEl) doubleEl.addEventListener('click', () => emit('double'));
}
