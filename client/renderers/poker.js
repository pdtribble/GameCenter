// Poker Renderer — Texas Hold'em, arc seat layout, community cards in center

// ── Module state ──────────────────────────────────────────────────────────────
let currentGameState = null;
let myPlayerId = null;
let socketRef = null;
let containerRef = null;
let seatOrder = [];
let roRef = null;
let styleTag = null;
let cardTheme = 'classic';

// ── CSS ───────────────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('pk-styles')) { styleTag = document.getElementById('pk-styles'); return; }
  styleTag = document.createElement('style');
  styleTag.id = 'pk-styles';
  styleTag.textContent = `
@keyframes pk-deal { from { transform: scale(0.4) translateY(-30px); opacity:0; } to { transform: scale(1) translateY(0); opacity:1; } }
@keyframes pk-flip { 0%{transform:rotateY(90deg);opacity:0} 100%{transform:rotateY(0deg);opacity:1} }
@keyframes pk-turn-glow {
  from { box-shadow: 0 0 8px rgba(212,175,55,0.2); }
  to   { box-shadow: 0 0 20px rgba(212,175,55,0.7), 0 0 40px rgba(212,175,55,0.2); }
}
.pk-card-inner {
  width:100%;height:100%;position:relative;transform-style:preserve-3d;transition:transform 0.4s ease;
}
.pk-card-inner.is-facedown { transform:rotateY(180deg); }
.pk-card-front, .pk-card-back {
  position:absolute;width:100%;height:100%;
  border-radius:6px;backface-visibility:hidden;-webkit-backface-visibility:hidden;overflow:hidden;
}
.pk-card-front { background:#fafaf8;border:1px solid #d0d0d0; }
.pk-card-front.css-layout {
  display:grid;grid-template-rows:auto 1fr auto;grid-template-columns:auto 1fr auto;padding:3px;
}
.pk-rank-tl { grid-row:1;grid-column:1;font-size:clamp(8px,1.2vw,13px);font-weight:bold;line-height:1.1;text-align:center;white-space:pre; }
.pk-suit-center { grid-row:2;grid-column:1/-1;font-size:clamp(20px,3.2vw,38px);opacity:0.4;text-align:center;align-self:center; }
.pk-rank-br { grid-row:3;grid-column:3;font-size:clamp(8px,1.2vw,13px);font-weight:bold;line-height:1.1;text-align:center;transform:rotate(180deg);white-space:pre; }
.pk-card-back {
  background:#1a1a4e;border:1px solid #3a3a8e;transform:rotateY(180deg);
  background-image:repeating-linear-gradient(45deg,rgba(255,255,255,0.04) 0px,rgba(255,255,255,0.04) 2px,transparent 2px,transparent 8px);
}
.pk-card-back::after { content:'';position:absolute;inset:4px;border:1px solid rgba(212,175,55,0.35);border-radius:4px; }
.pk-seat-active::after {
  content:'';position:absolute;inset:-8px;border-radius:10px;
  border:2px solid rgba(212,175,55,0.8);
  animation:pk-turn-glow 1s ease-in-out infinite alternate;pointer-events:none;z-index:1;
}
.pk-community-slot {
  width:clamp(42px,6vw,62px);height:clamp(59px,8.4vw,87px);
  border:2px dashed rgba(255,255,255,0.12);border-radius:6px;
  display:flex;align-items:center;justify-content:center;
  color:rgba(255,255,255,0.1);font-size:1.2rem;flex-shrink:0;
}
.pk-action-badge {
  position:absolute;top:-22px;left:50%;transform:translateX(-50%);
  background:rgba(0,0,0,0.85);border:1px solid rgba(212,175,55,0.4);border-radius:12px;
  padding:2px 8px;color:#d4af37;font-size:clamp(8px,1vw,11px);font-weight:bold;
  white-space:nowrap;pointer-events:none;z-index:50;
  animation:pk-deal 0.2s ease;
}
#pk-action-bar { transition:transform 0.2s ease,opacity 0.2s ease; }
#pk-action-bar.pk-hidden { transform:translateY(20px);opacity:0;pointer-events:none; }
`;
  document.head.appendChild(styleTag);
}

// ── Card utilities (same pattern as blackjack) ────────────────────────────────
const SUIT_LETTER = { '\u2665':'H', '\u2666':'D', '\u2663':'C', '\u2660':'S' };

function cardImageUrl(suit, rank, theme) {
  const sl = SUIT_LETTER[suit] || suit;
  return '/cards/' + theme + '/' + sl + rank + '.svg';
}
function cardBackUrl(theme) { return '/cards/' + theme + '/back.svg'; }
function getSuitColor(suit) { return (suit === '\u2665' || suit === '\u2666') ? '#cc0000' : '#1a1a1a'; }

function buildCssFallbackFront(frontEl, card) {
  const color = getSuitColor(card.suit);
  frontEl.className = 'pk-card-front css-layout';
  frontEl.style.background = '#fafaf8';
  frontEl.innerHTML = '';
  const tl = document.createElement('span'); tl.className = 'pk-rank-tl'; tl.style.color = color; tl.textContent = card.rank + '\n' + card.suit;
  const sc = document.createElement('span'); sc.className = 'pk-suit-center'; sc.style.color = color; sc.textContent = card.suit;
  const rb = document.createElement('span'); rb.className = 'pk-rank-br'; rb.style.color = color; rb.textContent = card.rank + '\n' + card.suit;
  frontEl.appendChild(tl); frontEl.appendChild(sc); frontEl.appendChild(rb);
}

function renderCard(cardData, theme, options) {
  options = options || {};
  const faceDown = options.faceDown !== undefined ? options.faceDown : (cardData && cardData.hole);
  const isSmall = options.size === 'small';
  const W = isSmall ? 'clamp(35px,4.5vw,55px)' : 'clamp(42px,6vw,62px)';
  const H = isSmall ? 'clamp(49px,6.3vw,77px)' : 'clamp(59px,8.4vw,87px)';

  const wrap = document.createElement('div');
  wrap.className = 'pk-card';
  wrap.style.cssText = 'width:' + W + ';height:' + H + ';position:relative;perspective:800px;filter:drop-shadow(2px 3px 4px rgba(0,0,0,0.5));flex-shrink:0;';

  const inner = document.createElement('div');
  inner.className = 'pk-card-inner' + (faceDown ? ' is-facedown' : '');
  inner.style.cssText = 'width:100%;height:100%;';

  const front = document.createElement('div');
  front.className = 'pk-card-front';

  if (!faceDown && cardData && !cardData.hole) {
    const imgUrl = cardImageUrl(cardData.suit, cardData.rank, theme);
    const img = document.createElement('img');
    img.src = imgUrl; img.draggable = false; img.loading = 'eager';
    img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;';
    img.onerror = (function(url, c) { return function() {
      wrap.classList.add('card-css-fallback'); img.remove();
      buildCssFallbackFront(front, c);
      console.warn('Card image missing, using CSS fallback:', url);
    }; })(imgUrl, cardData);
    front.appendChild(img);
  }

  const back = document.createElement('div');
  back.className = 'pk-card-back';
  const backImg = document.createElement('img');
  backImg.src = cardBackUrl(theme); backImg.draggable = false; backImg.loading = 'eager';
  backImg.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;';
  backImg.onerror = function() { backImg.remove(); };
  back.appendChild(backImg);

  inner.appendChild(front); inner.appendChild(back); wrap.appendChild(inner);
  return wrap;
}

function revealCard(cardEl, card, theme) {
  const t = theme || cardTheme;
  const inner = cardEl.querySelector('.pk-card-inner');
  const front = cardEl.querySelector('.pk-card-front');
  if (!front || !inner) return;
  front.innerHTML = ''; front.className = 'pk-card-front'; front.style.background = '#fafaf8';
  const imgUrl = cardImageUrl(card.suit, card.rank, t);
  const img = document.createElement('img');
  img.src = imgUrl; img.draggable = false; img.loading = 'eager';
  img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;animation:pk-flip 0.3s ease;';
  img.onerror = (function(url, c, fe) { return function() {
    cardEl.classList.add('card-css-fallback'); img.remove();
    buildCssFallbackFront(fe, c);
    console.warn('Card image missing, using CSS fallback:', url);
  }; })(imgUrl, card, front);
  front.appendChild(img);
  inner.classList.remove('is-facedown');
}

// ── Seat helpers ──────────────────────────────────────────────────────────────
function reorderPlayers(players, pid) {
  const myIdx = players.findIndex(function(p) { return p.id === pid; });
  if (myIdx === -1) return players.slice();
  return players.slice(myIdx).concat(players.slice(0, myIdx));
}

function getArcPosition(opponentIdx, totalOpponents, tableW, tableH) {
  const arcStart = 200, arcEnd = 340;
  const deg = totalOpponents === 1 ? 270 : arcStart + (arcEnd - arcStart) * opponentIdx / (totalOpponents - 1);
  const rad = deg * Math.PI / 180;
  return {
    x: tableW / 2 + tableW * 0.38 * Math.cos(rad),
    y: tableH / 2 + tableH * 0.32 * Math.sin(rad),
  };
}

// ── DOM build ─────────────────────────────────────────────────────────────────
function buildDOM(container, state) {
  injectStyles();
  container.innerHTML = '';
  container.style.cssText = 'width:100%;height:calc(100vh - 56px);background:#0a0a0a;display:flex;flex-direction:column;align-items:center;overflow:hidden;font-family:"DM Mono","Courier New",monospace;position:relative;';

  // HUD
  const hud = document.createElement('div');
  hud.style.cssText = 'width:min(90vw,900px);display:flex;justify-content:space-between;align-items:center;padding:6px 4px;height:38px;flex-shrink:0;';
  const roundLabel = document.createElement('div');
  roundLabel.id = 'pk-round-label';
  roundLabel.style.cssText = 'color:rgba(255,255,255,0.6);font-size:clamp(10px,1.2vw,13px);';
  roundLabel.textContent = 'Round ' + (state.round || 1);
  const phaseLabel = document.createElement('div');
  phaseLabel.id = 'pk-phase-label';
  phaseLabel.style.cssText = 'color:#d4af37;font-size:clamp(10px,1.2vw,13px);letter-spacing:2px;text-transform:uppercase;';
  phaseLabel.textContent = state.phase || '';
  hud.appendChild(roundLabel); hud.appendChild(phaseLabel);
  container.appendChild(hud);

  // Scene
  const scene = document.createElement('div');
  scene.style.cssText = 'position:relative;display:flex;align-items:flex-start;justify-content:center;flex:1;width:100%;overflow:visible;';

  // Table
  const table = document.createElement('div');
  table.id = 'pk-table';
  table.style.cssText = 'position:relative;width:min(90vw,900px);height:min(55vw,550px);border-radius:50%;background:radial-gradient(ellipse at 50% 40%,#2d3a7a 0%,#1a2a5c 50%,#0d1533 100%);border:14px solid #3d1f00;box-shadow:inset 0 0 80px rgba(0,0,0,0.6),0 0 0 3px #6b3a00,0 0 0 6px #3d1f00,0 25px 80px rgba(0,0,0,0.8);overflow:visible;margin-top:8px;flex-shrink:0;';

  // Center area (pot + community cards)
  const center = document.createElement('div');
  center.id = 'pk-center';
  center.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:10px;z-index:10;pointer-events:none;';

  const potEl = document.createElement('div');
  potEl.id = 'pk-pot';
  potEl.style.cssText = 'color:#d4af37;font-size:clamp(11px,1.4vw,15px);font-weight:bold;letter-spacing:1px;text-shadow:0 2px 4px rgba(0,0,0,0.8);';
  potEl.textContent = 'POT: ' + (state.pot || 0) + ' 🪙';

  const communityRow = document.createElement('div');
  communityRow.id = 'pk-community';
  communityRow.style.cssText = 'display:flex;gap:6px;align-items:center;';

  // 5 community card slots
  for (let i = 0; i < 5; i++) {
    const slot = document.createElement('div');
    slot.className = 'pk-community-slot';
    slot.dataset.slot = String(i);
    communityRow.appendChild(slot);
  }

  center.appendChild(potEl);
  center.appendChild(communityRow);
  table.appendChild(center);

  // Seats container
  const seatsEl = document.createElement('div');
  seatsEl.id = 'pk-seats';
  seatsEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
  table.appendChild(seatsEl);

  scene.appendChild(table);
  container.appendChild(scene);

  // Action bar
  const actionBar = document.createElement('div');
  actionBar.id = 'pk-action-bar';
  actionBar.className = 'pk-hidden';
  actionBar.style.cssText = 'width:min(90vw,900px);display:flex;gap:10px;justify-content:center;padding:8px 0;min-height:50px;flex-shrink:0;';
  container.appendChild(actionBar);

  // Raise input row
  const raiseRow = document.createElement('div');
  raiseRow.id = 'pk-raise-row';
  raiseRow.style.cssText = 'display:none;width:min(90vw,900px);justify-content:center;align-items:center;gap:10px;padding:4px 0;flex-shrink:0;';
  const raiseInput = document.createElement('input');
  raiseInput.id = 'pk-raise-input';
  raiseInput.type = 'number';
  raiseInput.placeholder = 'Raise amount';
  raiseInput.min = '1';
  raiseInput.style.cssText = 'background:#111;border:1px solid rgba(212,175,55,0.4);border-radius:6px;padding:6px 10px;color:#d4af37;font-family:inherit;font-size:clamp(12px,1.4vw,14px);width:120px;outline:none;';
  const raiseBtn = document.createElement('button');
  raiseBtn.id = 'pk-raise-btn';
  raiseBtn.textContent = 'RAISE';
  raiseBtn.style.cssText = 'background:#7a3a1a;color:white;border:none;padding:8px 18px;border-radius:8px;font-family:inherit;font-weight:bold;font-size:clamp(12px,1.4vw,14px);cursor:pointer;';
  raiseRow.appendChild(raiseInput); raiseRow.appendChild(raiseBtn);
  container.appendChild(raiseRow);

  wireEvents();
}

function wireEvents() {
  const actionBar = document.getElementById('pk-action-bar');
  if (actionBar) {
    actionBar.addEventListener('click', function(e) {
      const btn = e.target.closest('[data-action]');
      if (!btn || btn.disabled) return;
      const type = btn.dataset.action;
      if (type === 'raise') {
        const raiseRow = document.getElementById('pk-raise-row');
        if (raiseRow) raiseRow.style.display = raiseRow.style.display === 'flex' ? 'none' : 'flex';
        return;
      }
      socketRef.emit('game:action', { sessionId: socketRef.currentSessionId, action: { type } });
      actionBar.querySelectorAll('button').forEach(function(b) { b.disabled = true; b.style.opacity = '0.5'; });
    });
  }
  const raiseBtn = document.getElementById('pk-raise-btn');
  if (raiseBtn) {
    raiseBtn.addEventListener('click', function() {
      const input = document.getElementById('pk-raise-input');
      const amount = parseInt(input && input.value, 10);
      if (!amount || amount < 1) return;
      socketRef.emit('game:action', { sessionId: socketRef.currentSessionId, action: { type: 'raise', amount } });
      const raiseRow = document.getElementById('pk-raise-row');
      if (raiseRow) raiseRow.style.display = 'none';
      const actionBar = document.getElementById('pk-action-bar');
      if (actionBar) actionBar.querySelectorAll('button').forEach(function(b) { b.disabled = true; b.style.opacity = '0.5'; });
    });
  }
}

// ── Build seats ───────────────────────────────────────────────────────────────
function buildSeats(state) {
  const seatsEl = document.getElementById('pk-seats');
  const table = document.getElementById('pk-table');
  if (!seatsEl || !table) return;
  seatsEl.innerHTML = '';

  seatOrder = reorderPlayers(state.players || [], myPlayerId);
  const tw = table.offsetWidth, th = table.offsetHeight;
  const opponents = seatOrder.slice(1);
  const dealerPos = state.dealerPosition != null ? state.dealerPosition : -1;

  seatOrder.forEach(function(player, i) {
    const isLocal = i === 0;
    const isFolded = player.status === 'folded' || player.folded;
    const isActive = state.currentPlayerId === player.id;
    const isDealer = state.players && state.players[dealerPos] && state.players[dealerPos].id === player.id;
    const isShowdown = state.phase === 'showdown';

    const seat = document.createElement('div');
    seat.className = 'pk-seat' + (isActive ? ' pk-seat-active' : '');
    seat.dataset.playerId = player.id;
    seat.style.opacity = isFolded ? '0.45' : '1';

    if (isLocal) {
      seat.style.cssText = (seat.style.cssText || '') + 'position:absolute;left:50%;bottom:10px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:3px;pointer-events:auto;z-index:20;min-width:80px;';
    } else {
      const pos = getArcPosition(i - 1, opponents.length, tw, th);
      seat.style.cssText = (seat.style.cssText || '') + 'position:absolute;left:' + pos.x + 'px;top:' + pos.y + 'px;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:3px;pointer-events:auto;z-index:20;min-width:80px;';
    }

    // Dealer button
    if (isDealer) {
      const dBtn = document.createElement('div');
      dBtn.style.cssText = 'position:absolute;top:-16px;right:-16px;width:22px;height:22px;border-radius:50%;background:#d4af37;color:#1a1a00;font-size:11px;font-weight:bold;display:flex;align-items:center;justify-content:center;border:2px solid #a07820;z-index:10;';
      dBtn.textContent = 'D';
      seat.appendChild(dBtn);
    }

    // Name pill
    const displayName = player.is_bot
      ? ('\uD83E\uDD16 ' + (player.displayName || player.display_name || 'Bot'))
      : (player.displayName || player.display_name || 'Player');
    const namePill = document.createElement('div');
    namePill.style.cssText = 'background:rgba(0,0,0,0.75);border:1px solid ' + (isLocal ? 'rgba(212,175,55,0.5)' : 'rgba(255,255,255,0.2)') + ';border-radius:20px;padding:3px 10px;color:' + (isLocal ? '#d4af37' : 'white') + ';font-size:clamp(9px,1.1vw,12px);white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis;';
    namePill.textContent = displayName;

    // Hand
    const handContainer = document.createElement('div');
    handContainer.className = 'pk-seat-hand';
    const cardH = isLocal ? 'clamp(65px,9.5vw,100px)' : 'clamp(49px,6.3vw,77px)';
    handContainer.style.cssText = 'display:flex;position:relative;height:' + cardH + ';min-width:40px;';
    if (!isLocal) handContainer.style.transform = 'rotate(180deg)';

    const offset = isLocal ? 'clamp(18px,2.4vw,26px)' : 'clamp(12px,1.6vw,18px)';
    const hand = player.hand || [];
    hand.forEach(function(card, ci) {
      // Opponents' hole cards: face-down unless showdown
      const faceDown = !isLocal && !isShowdown;
      const cardEl = renderCard(card, cardTheme, { size: isLocal ? 'normal' : 'small', faceDown });
      cardEl.style.position = 'absolute';
      cardEl.style.left = 'calc(' + ci + ' * ' + offset + ')';
      cardEl.style.top = '0'; cardEl.style.zIndex = String(ci + 1);
      handContainer.appendChild(cardEl);
    });
    // If no hand data but player is in game, show back cards
    if (!hand.length && !isFolded) {
      for (let ci = 0; ci < 2; ci++) {
        const cardEl = renderCard(null, cardTheme, { size: isLocal ? 'normal' : 'small', faceDown: true });
        cardEl.style.position = 'absolute';
        cardEl.style.left = 'calc(' + ci + ' * ' + offset + ')';
        cardEl.style.top = '0'; cardEl.style.zIndex = String(ci + 1);
        handContainer.appendChild(cardEl);
      }
    }

    // Chip info
    const infoRow = document.createElement('div');
    infoRow.className = 'pk-seat-info';
    const betStr = (player.bet || 0) > 0 ? ' · Bet:' + player.bet : '';
    infoRow.textContent = '\uD83E\uDE99' + (player.chips != null ? player.chips : 0) + betStr;
    infoRow.style.cssText = 'font-size:clamp(8px,1vw,11px);color:rgba(255,255,255,0.75);white-space:nowrap;';

    if (isLocal) {
      seat.appendChild(handContainer);
      seat.appendChild(namePill);
      seat.appendChild(infoRow);
    } else {
      seat.appendChild(namePill);
      seat.appendChild(handContainer);
      seat.appendChild(infoRow);
    }

    seatsEl.appendChild(seat);
  });
}

// ── Community cards ───────────────────────────────────────────────────────────
function syncCommunity(state, prev) {
  const communityRow = document.getElementById('pk-community');
  if (!communityRow) return;
  const slots = communityRow.querySelectorAll('.pk-community-slot');
  const cards = state.communityCards || [];
  const prevCards = prev && prev.communityCards ? prev.communityCards : [];

  slots.forEach(function(slot, i) {
    if (i < cards.length) {
      if (!slot.querySelector('.pk-card')) {
        // New card revealed
        slot.innerHTML = '';
        const cardEl = renderCard(cards[i], cardTheme, { size: 'normal', faceDown: false });
        slot.appendChild(cardEl);
      } else if (i >= prevCards.length && slot.querySelector('.pk-card-inner.is-facedown')) {
        // Flip existing facedown card
        revealCard(slot.querySelector('.pk-card'), cards[i], cardTheme);
      }
    } else {
      // Empty slot
      if (slot.querySelector('.pk-card')) {
        slot.innerHTML = '';
        slot.textContent = '';
      }
    }
  });
}

// ── Sync individual seat ──────────────────────────────────────────────────────
function syncSeat(player, prev, state) {
  const seatEl = document.querySelector('.pk-seat[data-player-id="' + player.id + '"]');
  if (!seatEl) return;
  const isLocal = player.id === myPlayerId;
  const isActive = state.currentPlayerId === player.id;
  const isFolded = player.status === 'folded' || player.folded;
  const isShowdown = state.phase === 'showdown';

  seatEl.classList.toggle('pk-seat-active', isActive);
  seatEl.style.opacity = isFolded ? '0.45' : '1';

  // Patch hole cards on showdown
  if (isShowdown && !isLocal) {
    const handEl = seatEl.querySelector('.pk-seat-hand');
    if (handEl) {
      const hand = player.hand || [];
      const cards = handEl.querySelectorAll('.pk-card');
      cards.forEach(function(cardEl, ci) {
        const inner = cardEl.querySelector('.pk-card-inner');
        if (inner && inner.classList.contains('is-facedown') && hand[ci]) {
          revealCard(cardEl, hand[ci], cardTheme);
        }
      });
    }
  }

  // Update chips/bet
  const infoEl = seatEl.querySelector('.pk-seat-info');
  if (infoEl) {
    const betStr = (player.bet || 0) > 0 ? ' · Bet:' + player.bet : '';
    infoEl.textContent = '\uD83E\uDE99' + (player.chips != null ? player.chips : 0) + betStr;
  }
}

// ── Action buttons ────────────────────────────────────────────────────────────
function updateActionButtons(state) {
  const bar = document.getElementById('pk-action-bar');
  if (!bar) return;
  const myTurn = state.currentPlayerId === myPlayerId && state.phase !== 'showdown' && state.phase !== 'results';
  if (!myTurn) {
    bar.classList.add('pk-hidden'); bar.innerHTML = '';
    const raiseRow = document.getElementById('pk-raise-row');
    if (raiseRow) raiseRow.style.display = 'none';
    return;
  }

  const me = state.players && state.players.find(function(p) { return p.id === myPlayerId; });
  const callAmount = state.callAmount || 0;
  const canCheck = callAmount === 0;

  const btnStyle = function(bg) {
    return 'background:' + bg + ';color:white;border:none;padding:10px 20px;border-radius:8px;font-weight:bold;font-family:inherit;font-size:clamp(12px,1.4vw,15px);cursor:pointer;letter-spacing:1px;transition:all 0.15s ease;';
  };

  bar.innerHTML =
    '<button data-action="fold" style="' + btnStyle('#7a1a1a') + '">FOLD</button>' +
    (canCheck
      ? '<button data-action="check" style="' + btnStyle('#1a5a1a') + '">CHECK</button>'
      : '<button data-action="call" style="' + btnStyle('#1a5a1a') + '">CALL ' + callAmount + '</button>') +
    '<button data-action="raise" style="' + btnStyle('#1a3a7a') + '">RAISE</button>';
  bar.classList.remove('pk-hidden');
}

// ── HUD update ────────────────────────────────────────────────────────────────
function updateHUD(state) {
  const roundLabel = document.getElementById('pk-round-label');
  if (roundLabel) roundLabel.textContent = 'Round ' + (state.round || 1);
  const phaseLabel = document.getElementById('pk-phase-label');
  if (phaseLabel) phaseLabel.textContent = (state.phase || '').toUpperCase();
  const potEl = document.getElementById('pk-pot');
  if (potEl) potEl.textContent = 'POT: ' + (state.pot || 0) + ' \uD83E\uDE99';
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════════════════════

export function render(container, gameState, socket, playerId, hostPlayerId) {
  myPlayerId = playerId;
  socketRef = socket;
  containerRef = container;
  currentGameState = gameState;
  cardTheme = gameState.card_theme || 'classic';

  buildDOM(container, gameState);
  buildSeats(gameState);
  syncCommunity(gameState, null);
  updateActionButtons(gameState);
  updateHUD(gameState);

  const table = document.getElementById('pk-table');
  if (table) {
    roRef = new ResizeObserver(function() {
      const t = document.getElementById('pk-table');
      if (!t) return;
      const tw = t.offsetWidth, th = t.offsetHeight;
      const opponents = seatOrder.slice(1);
      document.querySelectorAll('.pk-seat').forEach(function(seatEl, i) {
        if (i === 0) return; // local player pinned
        const pos = getArcPosition(i - 1, opponents.length, tw, th);
        seatEl.style.left = pos.x + 'px';
        seatEl.style.top = pos.y + 'px';
      });
    });
    roRef.observe(table);
  }
}

export function update(gameState, playerId, hostPlayerId) {
  myPlayerId = playerId;
  const prev = currentGameState;
  currentGameState = gameState;

  const newTheme = gameState.card_theme || 'classic';
  if (newTheme !== cardTheme) {
    cardTheme = newTheme;
    buildSeats(gameState);
    syncCommunity(gameState, null);
    updateActionButtons(gameState);
    updateHUD(gameState);
    return;
  }

  // New hand
  if (gameState.round !== (prev && prev.round)) {
    buildSeats(gameState);
    syncCommunity(gameState, null);
    updateActionButtons(gameState);
    updateHUD(gameState);
    return;
  }

  syncCommunity(gameState, prev);
  (gameState.players || []).forEach(function(p) { syncSeat(p, prev, gameState); });
  updateActionButtons(gameState);
  updateHUD(gameState);
}

export function destroy() {
  if (roRef) { roRef.disconnect(); roRef = null; }
  if (styleTag) { styleTag.remove(); styleTag = null; }
  if (containerRef) { containerRef.innerHTML = ''; containerRef = null; }
  currentGameState = null; myPlayerId = null; socketRef = null;
  seatOrder = []; cardTheme = 'classic';
}
