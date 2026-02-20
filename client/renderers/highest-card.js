// Highest Card renderer
// Shows each player's card, a Flip button for the local player, scores, and round number.
// Handles both 'drawing' (pre-flip) and 'revealed' (all cards shown) phases.
// The intermission overlay is handled by game.js; this renderer focuses on the game table.

let _container = null;
let _socket = null;
let _playerId = null;
let _hostPlayerId = null;
let _state = null;

export function render(container, state, socket, playerId, hostPlayerId) {
  _container = container;
  _socket = socket;
  _playerId = playerId;
  _hostPlayerId = hostPlayerId;
  _state = state;
  draw(state);
}

export function update(state, playerId, hostPlayerId) {
  _state = state;
  if (playerId) _playerId = playerId;
  if (hostPlayerId) _hostPlayerId = hostPlayerId;
  draw(state);
}

export function destroy() {
  _container = null;
}

// ── Main draw ────────────────────────────────────────────────────────────────
function draw(state) {
  if (!_container || !state) return;

  const { round, phase, hands, flipped, winner, scores, players, winTarget, enginePhase } = state;
  const myId = _playerId;
  const isRevealed = phase === 'revealed';
  const isIntermission = enginePhase === 'intermission';
  const myFlipped = flipped && flipped[myId];
  const myCard = hands && hands[myId];
  const canFlip = !isIntermission && phase === 'drawing' && !myFlipped;

  const roundLabel = winTarget > 0
    ? `Round ${round} · First to ${winTarget} wins`
    : `Round ${round}`;

  const playerRows = (players || []).map(p => {
    const card = hands && hands[p.id];
    const hasFlipped = flipped && flipped[p.id];
    const score = scores && scores[p.id] != null ? scores[p.id] : 0;
    const isWinner = winner === p.id;
    const isMe = p.id === myId;

    return `<div class="hc-player-row${isWinner ? ' hc-winner' : ''}${isMe ? ' hc-me' : ''}">
      <div class="hc-player-info">
        <span class="hc-player-name">${escHtml(p.displayName || p.id)}${p.is_bot ? ' 🤖' : ''}${isMe ? ' (you)' : ''}</span>
        <span class="hc-score">${score} win${score !== 1 ? 's' : ''}</span>
      </div>
      <div class="hc-card-slot">
        ${renderCard(card, hasFlipped, isRevealed, isWinner)}
      </div>
    </div>`;
  }).join('');

  const flipBtn = canFlip
    ? `<div style="margin-top:var(--spacing-lg);text-align:center">
        <button class="btn btn-primary" id="hc-flip-btn" style="font-size:var(--font-size-lg);padding:var(--spacing-md) var(--spacing-xl)">
          🃏 Flip Card
        </button>
      </div>`
    : '';

  const winnerBanner = isRevealed && winner
    ? (() => {
        const wp = (players || []).find(p => p.id === winner);
        const wName = wp ? (wp.displayName || wp.id) : winner;
        return `<div class="hc-winner-banner">🏆 ${escHtml(wName)} wins this round!</div>`;
      })()
    : '';

  _container.innerHTML = `
    <div class="hc-table">
      <div class="hc-round-label">${escHtml(roundLabel)}</div>
      ${winnerBanner}
      <div class="hc-players">${playerRows}</div>
      ${flipBtn}
    </div>`;

  const flipBtnEl = _container.querySelector('#hc-flip-btn');
  if (flipBtnEl) {
    flipBtnEl.addEventListener('click', () => {
      flipBtnEl.disabled = true;
      flipBtnEl.textContent = 'Flipping...';
      _socket.emit('game:action', {
        sessionId: _socket.currentSessionId,
        action: { type: 'flip' },
      });
    });
  }
}

// ── Card rendering ────────────────────────────────────────────────────────────
function renderCard(card, hasFlipped, isRevealed, isWinner) {
  if (!hasFlipped && !isRevealed) {
    // Face down
    return `<div class="playing-card card-face-down">🂠</div>`;
  }
  if (!card) {
    return `<div class="playing-card card-empty">—</div>`;
  }
  const isRed = card.suit === '♥' || card.suit === '♦';
  const winnerClass = isWinner ? ' card-winner' : '';
  return `<div class="playing-card${isRed ? ' card-red' : ''}${winnerClass}">
    <span class="card-rank">${escHtml(card.rank)}</span><span class="card-suit">${escHtml(card.suit)}</span>
  </div>`;
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
