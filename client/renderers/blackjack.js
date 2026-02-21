// Blackjack renderer — image-accurate D-shape felt table (SVG) + live HTML overlay
// Dealer zone top, 7 seats along arc, rail/gold line bottom. Perspective tilt.
// Phone: 3 seats (left neighbor, local, right neighbor); others as avatar chips.

const VIEW_W = 900;
const VIEW_H = 520;

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

// ── Arc math (quadratic bezier: P0=(0,H/2), P1=(W/2,H), P2=(W,H/2)) ─────────
function arcPoint(t, w = VIEW_W, h = VIEW_H) {
  const p0 = { x: 0, y: h * 0.5 };
  const p1 = { x: w * 0.5, y: h };
  const p2 = { x: w, y: h * 0.5 };
  return {
    x: (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x,
    y: (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y,
  };
}

const SEAT_T_VALUES = [0.15, 0.25, 0.35, 0.5, 0.65, 0.75, 0.85];

function getSeatPositions() {
  return SEAT_T_VALUES.map(t => {
    const circle = arcPoint(t);
    const cardW = 62, cardH = 88, circleR = 22, gap = 10;
    const cardCenterY = circle.y - circleR - gap - cardH / 2;
    return {
      circle: { cx: circle.x, cy: circle.y, r: circleR },
      card: { x: circle.x - cardW / 2, y: cardCenterY - cardH / 2, w: cardW, h: cardH },
      centerX: circle.x,
      centerY: circle.y,
    };
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function handValue(cards) {
  if (!cards || cards.length === 0) return 0;
  let sum = 0, aces = 0;
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
  return suit === '\u2665' || suit === '\u2666';
}

function renderCardEl(card, faceDown = false, index = 0) {
  const offset = `translate(${index * 38}%, ${index * 1.3}%)`;
  if (faceDown || (card && card.hole)) {
    return `<div class="bj-card bj-card-face-down" style="transform: ${offset}">🂠</div>`;
  }
  if (!card || !card.rank) return '';
  const red = isRedSuit(card.suit);
  return `<div class="bj-card${red ? ' bj-card-red' : ''}" style="transform: ${offset}">
    <span class="card-rank">${escHtml(card.rank)}</span><span class="card-suit">${escHtml(card.suit)}</span>
  </div>`;
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Build static SVG table ────────────────────────────────────────────────────
function buildTableSVG(seatPositions) {
  const seatsPath = seatPositions.map((s, i) => {
    const { card, circle } = s;
    return `
      <rect x="${card.x}" y="${card.y}" width="${card.w}" height="${card.h}" fill="none" stroke="#c8a96e" stroke-width="1.5" rx="4" opacity="0.5"/>
      <circle cx="${circle.cx}" cy="${circle.cy}" r="${circle.r}" fill="none" stroke="#c8a96e" stroke-width="1" opacity="0.4"/>`;
  }).join('');

  // D-shape: straight top, arc bottom rising ~15% at center (y=182)
  const arcCtrlY = 182;
  const railPath = `M 0,260 Q 450,${arcCtrlY} ${VIEW_W},260`;
  const clipPathD = `M 0,0 H ${VIEW_W} V 260 Q 450,${arcCtrlY} 0,260 Z`;

  return `
<svg class="bj-felt-svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <clipPath id="bj-table-clip">
      <path d="${clipPathD}"/>
    </clipPath>
    <radialGradient id="bj-felt-grad" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="#236b30"/>
      <stop offset="100%" stop-color="#122118"/>
    </radialGradient>
    <pattern id="bj-texture" width="4" height="4" patternUnits="userSpaceOnUse">
      <rect width="4" height="4" fill="#1e5c2a"/>
      <path d="M 0 0 L 4 4 M 4 0 L 0 4" stroke="rgba(255,255,255,0.015)" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${VIEW_W}" height="${VIEW_H}" fill="#1e5c2a" clip-path="url(#bj-table-clip)"/>
  <rect width="${VIEW_W}" height="${VIEW_H}" fill="url(#bj-felt-grad)" clip-path="url(#bj-table-clip)"/>
  <rect width="${VIEW_W}" height="${VIEW_H}" fill="url(#bj-texture)" opacity="0.04" clip-path="url(#bj-table-clip)"/>
  <path d="${railPath}" fill="none" stroke="#2e1505" stroke-width="24" stroke-linecap="round"/>
  <path d="M 4,258 Q 454,${arcCtrlY - 2} ${VIEW_W - 4},258" fill="none" stroke="#7a4520" stroke-width="2"/>
  <path d="M 8,256 Q 450,${arcCtrlY - 4} ${VIEW_W - 8},256" fill="none" stroke="#c8a96e" stroke-width="2" opacity="0.6"/>
  <rect x="370" y="20" width="160" height="90" fill="none" stroke="#c8a96e" stroke-width="2" rx="6" opacity="0.55"/>
  <text x="450" y="14" text-anchor="middle" font-family="DM Mono, monospace" font-size="9.6" fill="#c8a96e" opacity="0.4">DEALER</text>
  <path id="bj-insurance-arc" d="M 80,320 Q 450,420 820,320" fill="none" stroke="#c8a96e" stroke-width="1.5" opacity="0.45"/>
  <path id="bj-text-arc-up" d="M 120,140 Q 450,60 780,140"/>
  <path id="bj-text-arc-down" d="M 100,240 Q 450,300 800,240"/>
  <text fill="#e8b84b" font-size="22" font-weight="bold" opacity="0.75">
    <textPath xlink:href="#bj-text-arc-up" startOffset="50%" text-anchor="middle">BLACK JACK PAYS 3 TO 2</textPath>
  </text>
  <text fill="#c8b89a" font-size="10" opacity="0.5">
    <textPath xlink:href="#bj-text-arc-down" startOffset="50%" text-anchor="middle">Dealer must draw to 16 and stand on all 17s</textPath>
  </text>
  <text x="450" y="318" text-anchor="middle" font-size="25" font-weight="bold" fill="#e8b84b" opacity="0.8">INSURANCE</text>
  <text x="180" y="300" transform="rotate(28, 180, 300)" font-family="DM Mono, monospace" font-size="9.6" fill="#c8a96e" opacity="0.55">PAYS 2 TO 1</text>
  <text x="720" y="300" transform="rotate(-28, 720, 300)" font-family="DM Mono, monospace" font-size="9.6" fill="#c8a96e" opacity="0.55">PAYS 2 TO 1</text>
  ${seatsPath}
</svg>`;
}

// ── Main draw ────────────────────────────────────────────────────────────────
function draw(state) {
  if (!_container || !state) return;

  const { round, phase, dealerHand, players, currentPlayerId, enginePhase } = state;
  const myId = _playerId;
  const isIntermission = enginePhase === 'intermission';
  const isPhone = document.body.classList.contains('layout-phone');
  const myPlayer = (players || []).find(p => p.id === myId);
  const canAct = !isIntermission && phase === 'playing' && currentPlayerId === myId && myPlayer && myPlayer.status === 'playing';
  const seatPositions = getSeatPositions();
  const numSeats = isPhone ? 3 : 7;
  const playerList = players || [];
  const myIndex = playerList.findIndex(p => p.id === myId);

  const dealerTotal = dealerHand && dealerHand.length && !dealerHand[0].hole
    ? handValue(dealerHand)
    : (dealerHand && dealerHand[1] ? handValue([dealerHand[1]]) : '?');
  const dealerBust = typeof dealerTotal === 'number' && dealerTotal > 21;

  // Dealer cards HTML (positioned over dealer zone: ~370,20 160×90 → %)
  const dealerCardsHtml = (dealerHand || []).map((c, i) => renderCardEl(c, false, i)).join('');

  // Player seats: map players to seats (center local player on phone)
  const seatAssignments = [];
  if (isPhone && playerList.length > 0) {
    const start = Math.max(0, myIndex - 1);
    for (let i = 0; i < 3; i++) {
      seatAssignments[i] = playerList[start + i] || null;
    }
  } else {
    for (let i = 0; i < 7; i++) {
      seatAssignments[i] = playerList[i] || null;
    }
  }

  const seatsHtml = seatAssignments.slice(0, numSeats).map((p, idx) => {
    const pos = seatPositions[idx];
    if (!pos) return '';
    const pctX = (pos.centerX / VIEW_W * 100).toFixed(2);
    const pctY = (pos.centerY / VIEW_H * 100).toFixed(2);
    if (!p) {
      return `<div class="bj-seat bj-seat-empty" style="left:${pctX}%;top:${pctY}%;transform:translate(-50%,-50%)"></div>`;
    }
    const isMe = p.id === myId;
    const total = handValue(p.hand);
    const bust = total > 21;
    const result = p.result;
    const isWinner = result === 'win' || result === 'blackjack';
    const statusText = p.status === 'bust' ? 'Bust' : p.status === 'blackjack' ? 'BJ' : p.status === 'stood' ? String(total) : (currentPlayerId === p.id ? '…' : '');
    const cardsHtml = (p.hand || []).map((c, i) => renderCardEl(c, false, i)).join('');
    const seatClasses = ['bj-seat', isMe ? 'bj-seat-me' : '', phase === 'results' && isWinner ? 'bj-seat-winner' : '', phase === 'results' && result === 'lose' ? 'bj-seat-loser' : '', bust ? 'bj-seat-bust' : ''].filter(Boolean).join(' ');
    return `
      <div class="${seatClasses}" style="left:${pctX}%;top:${pctY}%;transform:translate(-50%,-50%)">
        <div class="bj-seat-card-zone">
          <div class="bj-card-fan">${cardsHtml}</div>
          ${total > 0 ? `<div class="bj-hand-total">${total}</div>` : ''}
        </div>
        <div class="bj-seat-name">${escHtml(p.displayName || p.id)}${p.is_bot ? ' 🤖' : ''}${isMe ? ' (you)' : ''}</div>
        <div class="bj-seat-meta">${p.chips ?? 0} · Bet ${p.bet ?? 0}</div>
        ${statusText ? `<div class="bj-seat-status">${escHtml(statusText)}</div>` : ''}
      </div>`;
  }).filter(Boolean).join('');

  // Phone: other players (not in the 3 visible seats) as small avatars along rail
  const startVisible = Math.max(0, myIndex - 1);
  const otherPlayersHtml = isPhone && playerList.length > 3
    ? playerList.filter((_, i) => i < startVisible || i > startVisible + 2).map(p =>
        `<div class="bj-rail-avatar" title="${escHtml(p.displayName || p.id)}">${escHtml((p.avatar_emoji || '👤').slice(0, 1))}<span>${p.chips ?? 0}</span></div>`
      ).join('')
    : '';

  const actionBar = canAct ? `
    <div class="bj-action-bar">
      ${(myPlayer.hand.length === 2 && myPlayer.chips >= myPlayer.bet) ? '<button class="btn btn-secondary bj-btn" id="bj-double">Double</button>' : ''}
      <button class="btn btn-secondary bj-btn" id="bj-hit">Hit</button>
      <button class="btn btn-primary bj-btn" id="bj-stand">Stand</button>
    </div>` : '';

  const tableSVG = buildTableSVG(seatPositions);

  _container.innerHTML = `
    <div class="bj-scene${isIntermission ? ' bj-dimmed' : ''}">
      <div class="bj-round-label">Round ${round}</div>
      <div class="bj-table-wrap">
        <div class="bj-table">
          ${tableSVG}
          <div class="bj-live">
            <div class="bj-dealer-zone">
              <div class="bj-dealer-label${dealerBust ? ' bj-bust' : ''}">Dealer${phase === 'results' ? ` · ${dealerTotal}` : ''}${dealerBust ? ' (Bust)' : ''}</div>
              <div class="bj-dealer-cards"><div class="bj-card-fan">${dealerCardsHtml}</div></div>
            </div>
            <div class="bj-seats">${seatsHtml}</div>
            ${otherPlayersHtml ? `<div class="bj-rail-avatars">${otherPlayersHtml}</div>` : ''}
            ${actionBar}
          </div>
        </div>
      </div>
    </div>`;

  const emit = (type) => {
    _socket.emit('game:action', { sessionId: _socket.currentSessionId, action: { type } });
  };
  _container.querySelector('#bj-hit')?.addEventListener('click', () => emit('hit'));
  _container.querySelector('#bj-stand')?.addEventListener('click', () => emit('stand'));
  _container.querySelector('#bj-double')?.addEventListener('click', () => emit('double'));
}
