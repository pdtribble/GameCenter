// BS Renderer — bluffing card game
// Local player: cards face-up, selectable. Opponents: card count only.
// Center: pile stack + current-rank banner. Actions: PLAY / BS / PASS.

// ── Module state ──────────────────────────────────────────────────────────────
let currentGameState = null;
let myPlayerId = null;
let socketRef = null;
let containerRef = null;
let seatOrder = [];
let roRef = null;
let styleTag = null;
let cardTheme = 'classic';
let selectedCards = [];       // indices into myHand that are selected
let challengeTimer = null;    // auto-clear challenge overlay

// ── CSS ───────────────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('bs-styles')) { styleTag = document.getElementById('bs-styles'); return; }
  styleTag = document.createElement('style');
  styleTag.id = 'bs-styles';
  styleTag.textContent = `
@keyframes bs-deal { from{transform:scale(0.4) translateY(-20px);opacity:0} to{transform:scale(1) translateY(0);opacity:1} }
@keyframes bs-pulse { 0%,100%{box-shadow:0 0 8px rgba(212,175,55,0.3)} 50%{box-shadow:0 0 22px rgba(212,175,55,0.9),0 0 40px rgba(212,175,55,0.3)} }
@keyframes bs-shake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-5px)} 40%,80%{transform:translateX(5px)} }
@keyframes bs-challenge-in { from{transform:translate(-50%,-50%) scale(0.7);opacity:0} to{transform:translate(-50%,-50%) scale(1);opacity:1} }
@keyframes bs-turn-glow { from{box-shadow:0 0 8px rgba(212,175,55,0.2)} to{box-shadow:0 0 22px rgba(212,175,55,0.7),0 0 40px rgba(212,175,55,0.2)} }
.bs-card-inner { width:100%;height:100%;position:relative;transform-style:preserve-3d;transition:transform 0.4s ease; }
.bs-card-inner.is-facedown { transform:rotateY(180deg); }
.bs-card-front,.bs-card-back {
  position:absolute;width:100%;height:100%;border-radius:6px;backface-visibility:hidden;-webkit-backface-visibility:hidden;overflow:hidden;
}
.bs-card-front { background:#fafaf8;border:1px solid #d0d0d0; }
.bs-card-front.css-layout {
  display:grid;grid-template-rows:auto 1fr auto;grid-template-columns:auto 1fr auto;padding:3px;
}
.bs-rank-tl { grid-row:1;grid-column:1;font-size:clamp(8px,1.2vw,13px);font-weight:bold;line-height:1.1;text-align:center;white-space:pre; }
.bs-suit-center { grid-row:2;grid-column:1/-1;font-size:clamp(20px,3.2vw,38px);opacity:0.4;text-align:center;align-self:center; }
.bs-rank-br { grid-row:3;grid-column:3;font-size:clamp(8px,1.2vw,13px);font-weight:bold;line-height:1.1;text-align:center;transform:rotate(180deg);white-space:pre; }
.bs-card-back {
  background:#3d1a00;border:1px solid #7a3a00;transform:rotateY(180deg);
  background-image:repeating-linear-gradient(45deg,rgba(255,255,255,0.04) 0px,rgba(255,255,255,0.04) 2px,transparent 2px,transparent 8px);
}
.bs-card-back::after { content:'';position:absolute;inset:4px;border:1px solid rgba(212,175,55,0.35);border-radius:4px; }
.bs-hand-card { cursor:pointer;transition:transform 0.15s ease,box-shadow 0.15s ease; }
.bs-hand-card:hover { transform:translateY(-6px) !important; }
.bs-hand-card.selected {
  transform:translateY(-14px) !important;
  filter:drop-shadow(0 0 8px rgba(57,255,20,0.8)) !important;
}
.bs-seat-active::after {
  content:'';position:absolute;inset:-8px;border-radius:10px;
  border:2px solid rgba(212,175,55,0.8);
  animation:bs-turn-glow 1s ease-in-out infinite alternate;pointer-events:none;z-index:1;
}
.bs-challenge-overlay {
  position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
  background:rgba(0,0,0,0.92);border-radius:12px;padding:20px 28px;z-index:200;
  text-align:center;pointer-events:none;
  animation:bs-challenge-in 0.3s ease;
  border:1px solid rgba(212,175,55,0.3);
  min-width:220px;
}
#bs-action-bar { transition:transform 0.2s ease,opacity 0.2s ease; }
#bs-action-bar.bs-hidden { transform:translateY(20px);opacity:0;pointer-events:none; }
`;
  document.head.appendChild(styleTag);
}

// ── Card utilities (self-contained, same pattern as blackjack/poker) ──────────
const SUIT_LETTER = { '\u2665':'H', '\u2666':'D', '\u2663':'C', '\u2660':'S' };

function cardImageUrl(suit, rank, theme) {
  return '/cards/' + (theme || 'classic') + '/' + (SUIT_LETTER[suit] || suit) + rank + '.svg';
}
function cardBackUrl(theme) { return '/cards/' + (theme || 'classic') + '/back.svg'; }
function getSuitColor(suit) { return (suit === '\u2665' || suit === '\u2666') ? '#cc0000' : '#1a1a1a'; }

function buildCssFallbackFront(frontEl, card) {
  const color = getSuitColor(card.suit);
  frontEl.className = 'bs-card-front css-layout';
  frontEl.style.background = '#fafaf8';
  frontEl.innerHTML = '';
  const tl = document.createElement('span'); tl.className = 'bs-rank-tl'; tl.style.color = color; tl.textContent = card.rank + '\n' + card.suit;
  const sc = document.createElement('span'); sc.className = 'bs-suit-center'; sc.style.color = color; sc.textContent = card.suit;
  const rb = document.createElement('span'); rb.className = 'bs-rank-br'; rb.style.color = color; rb.textContent = card.rank + '\n' + card.suit;
  frontEl.appendChild(tl); frontEl.appendChild(sc); frontEl.appendChild(rb);
}

function renderCard(cardData, theme, options) {
  options = options || {};
  const faceDown = options.faceDown !== undefined ? options.faceDown : false;
  const isSmall = options.size === 'small';
  const W = isSmall ? 'clamp(35px,4.5vw,55px)' : 'clamp(55px,7vw,80px)';
  const H = isSmall ? 'clamp(49px,6.3vw,77px)' : 'clamp(77px,9.8vw,112px)';

  const wrap = document.createElement('div');
  wrap.className = 'bs-card';
  wrap.style.cssText = 'width:' + W + ';height:' + H + ';position:relative;perspective:800px;filter:drop-shadow(2px 3px 4px rgba(0,0,0,0.5));flex-shrink:0;';

  const inner = document.createElement('div');
  inner.className = 'bs-card-inner' + (faceDown ? ' is-facedown' : '');

  const front = document.createElement('div');
  front.className = 'bs-card-front';

  if (!faceDown && cardData) {
    const imgUrl = cardImageUrl(cardData.suit, cardData.rank, theme);
    const img = document.createElement('img');
    img.src = imgUrl; img.draggable = false; img.loading = 'eager';
    img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;';
    img.onerror = (function(url, c) { return function() {
      img.remove(); buildCssFallbackFront(front, c);
      console.warn('Card image missing, CSS fallback:', url);
    }; })(imgUrl, cardData);
    front.appendChild(img);
  }

  const back = document.createElement('div');
  back.className = 'bs-card-back';
  const backImg = document.createElement('img');
  backImg.src = cardBackUrl(theme); backImg.draggable = false; backImg.loading = 'eager';
  backImg.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;';
  backImg.onerror = function() { backImg.remove(); };
  back.appendChild(backImg);

  inner.appendChild(front); inner.appendChild(back); wrap.appendChild(inner);
  return wrap;
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
  roundLabel.id = 'bs-round-label';
  roundLabel.style.cssText = 'color:rgba(255,255,255,0.6);font-size:clamp(10px,1.2vw,13px);';
  roundLabel.textContent = 'Round ' + (state.round || 1);
  const scoreLabel = document.createElement('div');
  scoreLabel.id = 'bs-score-label';
  scoreLabel.style.cssText = 'color:rgba(212,175,55,0.8);font-size:clamp(10px,1.2vw,13px);letter-spacing:1px;';
  hud.appendChild(roundLabel); hud.appendChild(scoreLabel);
  container.appendChild(hud);

  // Scene
  const scene = document.createElement('div');
  scene.style.cssText = 'position:relative;display:flex;align-items:flex-start;justify-content:center;flex:1;width:100%;overflow:visible;';

  // Table
  const table = document.createElement('div');
  table.id = 'bs-table';
  table.style.cssText = 'position:relative;width:min(90vw,900px);height:min(55vw,550px);border-radius:50%;background:radial-gradient(ellipse at 50% 40%,#1a3a1a 0%,#0f2a0f 50%,#061206 100%);border:14px solid #3d1f00;box-shadow:inset 0 0 80px rgba(0,0,0,0.6),0 0 0 3px #6b3a00,0 0 0 6px #3d1f00,0 25px 80px rgba(0,0,0,0.8);overflow:visible;margin-top:8px;flex-shrink:0;';

  // Center: rank banner + pile
  const center = document.createElement('div');
  center.id = 'bs-center';
  center.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:10px;z-index:10;pointer-events:none;';

  const rankBanner = document.createElement('div');
  rankBanner.id = 'bs-rank-banner';
  rankBanner.style.cssText = 'color:#d4af37;font-size:clamp(12px,1.8vw,20px);font-weight:bold;letter-spacing:3px;text-shadow:0 2px 8px rgba(0,0,0,0.9);text-transform:uppercase;';

  const pileEl = document.createElement('div');
  pileEl.id = 'bs-pile';
  pileEl.style.cssText = 'position:relative;width:clamp(38px,4.8vw,57px);height:clamp(51px,6.5vw,79px);';

  const pileCount = document.createElement('div');
  pileCount.id = 'bs-pile-count';
  pileCount.style.cssText = 'position:absolute;bottom:-22px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,0.6);font-size:clamp(9px,1.1vw,12px);white-space:nowrap;';

  const lastPlayEl = document.createElement('div');
  lastPlayEl.id = 'bs-last-play';
  lastPlayEl.style.cssText = 'color:rgba(255,255,255,0.55);font-size:clamp(9px,1.1vw,11px);text-align:center;max-width:220px;line-height:1.4;margin-top:28px;';

  center.appendChild(rankBanner);
  center.appendChild(pileEl);
  pileEl.appendChild(pileCount);
  center.appendChild(lastPlayEl);
  table.appendChild(center);

  // Seats container
  const seatsEl = document.createElement('div');
  seatsEl.id = 'bs-seats';
  seatsEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
  table.appendChild(seatsEl);

  scene.appendChild(table);
  container.appendChild(scene);

  // Local player hand
  const handArea = document.createElement('div');
  handArea.id = 'bs-hand-area';
  handArea.style.cssText = 'width:min(90vw,900px);display:flex;flex-direction:column;align-items:center;gap:6px;padding:6px 0;flex-shrink:0;';
  const handRow = document.createElement('div');
  handRow.id = 'bs-hand-row';
  handRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;justify-content:center;min-height:90px;align-items:flex-end;';
  handArea.appendChild(handRow);
  container.appendChild(handArea);

  // Action bar
  const actionBar = document.createElement('div');
  actionBar.id = 'bs-action-bar';
  actionBar.className = 'bs-hidden';
  actionBar.style.cssText = 'width:min(90vw,900px);display:flex;gap:10px;justify-content:center;padding:6px 0;min-height:48px;flex-shrink:0;';
  container.appendChild(actionBar);

  wireEvents();
}

function wireEvents() {
  const actionBar = document.getElementById('bs-action-bar');
  if (actionBar) {
    actionBar.addEventListener('click', function(e) {
      const btn = e.target.closest('[data-action]');
      if (!btn || btn.disabled) return;
      const type = btn.dataset.action;
      if (type === 'play') {
        if (selectedCards.length === 0) return;
        const hand = currentGameState?.myHand || [];
        const cards = selectedCards.map(function(i) { return hand[i]; }).filter(Boolean);
        if (cards.length === 0) return;
        socketRef.emit('game:action', { sessionId: socketRef.currentSessionId, action: { type: 'play', cards: cards } });
        selectedCards = [];
        actionBar.querySelectorAll('button').forEach(function(b) { b.disabled = true; b.style.opacity = '0.5'; });
      } else {
        socketRef.emit('game:action', { sessionId: socketRef.currentSessionId, action: { type: type } });
        actionBar.querySelectorAll('button').forEach(function(b) { b.disabled = true; b.style.opacity = '0.5'; });
      }
    });
  }
}

// ── Render seats ──────────────────────────────────────────────────────────────
function buildSeats(state) {
  const seatsEl = document.getElementById('bs-seats');
  if (!seatsEl) return;
  seatsEl.innerHTML = '';

  const table = document.getElementById('bs-table');
  if (!table) return;
  const tw = table.offsetWidth || 700;
  const th = table.offsetHeight || 385;

  const opponents = seatOrder.slice(1); // index 0 is local player

  seatOrder.forEach(function(p, i) {
    if (i === 0) return; // local player rendered separately

    const opponentIdx = i - 1;
    const pos = getArcPosition(opponentIdx, opponents.length, tw, th);
    const isActive = state.currentTurn === p.id;

    const seat = document.createElement('div');
    seat.className = 'bs-seat' + (isActive ? ' bs-seat-active' : '');
    seat.dataset.playerId = p.id;
    seat.style.cssText = 'position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none;';
    seat.style.left = pos.x + 'px';
    seat.style.top = pos.y + 'px';

    // Name tag
    const nameTag = document.createElement('div');
    nameTag.style.cssText = 'color:rgba(255,255,255,0.8);font-size:clamp(9px,1.1vw,12px);text-align:center;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-shadow:0 1px 3px rgba(0,0,0,0.9);background:rgba(0,0,0,0.5);padding:1px 6px;border-radius:4px;';
    nameTag.textContent = p.displayName || p.display_name || '?';

    // Face-down card fan (show actual count, stacked)
    const cardFan = document.createElement('div');
    cardFan.style.cssText = 'position:relative;width:clamp(38px,4.8vw,57px);height:clamp(51px,6.5vw,79px);';

    const handSize = state.players?.find(function(pl) { return pl.id === p.id; })?.handSize || 0;
    const fanCount = Math.min(handSize, 5);
    for (let f = 0; f < fanCount; f++) {
      const angle = (f - (fanCount - 1) / 2) * 8;
      const card = renderCard(null, cardTheme, { faceDown: true, size: 'small' });
      card.style.position = 'absolute';
      card.style.left = '0'; card.style.top = '0';
      card.style.transform = 'rotate(' + angle + 'deg) translateY(' + (f * -1) + 'px)';
      card.style.transformOrigin = 'center bottom';
      card.style.zIndex = String(f);
      cardFan.appendChild(card);
    }

    // Hand count label
    const countLabel = document.createElement('div');
    countLabel.style.cssText = 'color:rgba(255,255,255,0.6);font-size:clamp(8px,1vw,11px);text-align:center;margin-top:2px;';
    countLabel.textContent = handSize + ' card' + (handSize !== 1 ? 's' : '');

    seat.appendChild(cardFan);
    seat.appendChild(nameTag);
    seat.appendChild(countLabel);
    seatsEl.appendChild(seat);
  });
}

// ── Render local hand ─────────────────────────────────────────────────────────
function renderHand(state) {
  const handRow = document.getElementById('bs-hand-row');
  if (!handRow) return;
  handRow.innerHTML = '';

  const hand = state.myHand || [];
  // Validate selectedCards indices are still within range
  selectedCards = selectedCards.filter(function(i) { return i < hand.length; });

  hand.forEach(function(card, idx) {
    const isSelected = selectedCards.indexOf(idx) !== -1;
    const cardEl = renderCard(card, cardTheme, { faceDown: false });
    cardEl.className += ' bs-hand-card' + (isSelected ? ' selected' : '');
    cardEl.dataset.handIdx = String(idx);
    cardEl.style.transition = 'transform 0.15s ease,box-shadow 0.15s ease';
    cardEl.addEventListener('click', function() {
      const selIdx = selectedCards.indexOf(idx);
      if (selIdx === -1) {
        selectedCards.push(idx);
        cardEl.classList.add('selected');
      } else {
        selectedCards.splice(selIdx, 1);
        cardEl.classList.remove('selected');
      }
      updateActionBar(currentGameState);
    });
    handRow.appendChild(cardEl);
  });
}

// ── Render pile ───────────────────────────────────────────────────────────────
function renderPile(state) {
  const pileEl = document.getElementById('bs-pile');
  if (!pileEl) return;
  // Clear existing stacked cards
  pileEl.querySelectorAll('.bs-card').forEach(function(c) { c.remove(); });

  const count = state.pileCount || 0;
  const showCount = Math.min(count, 5);
  for (let i = 0; i < showCount; i++) {
    const card = renderCard(null, cardTheme, { faceDown: true, size: 'small' });
    card.style.position = 'absolute';
    card.style.left = (i * 2) + 'px';
    card.style.top = (-i * 2) + 'px';
    card.style.zIndex = String(i);
    pileEl.appendChild(card);
  }

  const pileCount = document.getElementById('bs-pile-count');
  if (pileCount) {
    pileCount.textContent = count > 0 ? count + ' card' + (count !== 1 ? 's' : '') + ' in pile' : 'Pile empty';
  }
}

// ── Update center info ────────────────────────────────────────────────────────
function updateCenter(state) {
  const rankBanner = document.getElementById('bs-rank-banner');
  if (rankBanner) {
    if (state.phase === 'bs-window' && state.lastPlay) {
      rankBanner.textContent = 'CLAIM: ' + state.lastPlay.claimedRank + 's';
    } else {
      rankBanner.textContent = 'PLAY: ' + (state.currentRank || '?') + 's';
    }
  }

  const lastPlayEl = document.getElementById('bs-last-play');
  if (lastPlayEl) {
    if (state.phase === 'bs-window' && state.lastPlay) {
      const lp = state.lastPlay;
      const isMe = lp.playerId === myPlayerId;
      const name = isMe ? 'You' : (lp.displayName || 'Someone');
      lastPlayEl.textContent = name + ' played ' + lp.count + ' card' + (lp.count !== 1 ? 's' : '') + ' claiming ' + lp.claimedRank + 's';
      lastPlayEl.style.color = 'rgba(212,175,55,0.8)';
    } else if (state.lastChallenge) {
      lastPlayEl.textContent = '';
    } else {
      const activeP = seatOrder.find(function(p) { return p.id === state.currentTurn; });
      if (activeP) {
        const isMe = state.currentTurn === myPlayerId;
        lastPlayEl.textContent = isMe ? 'Your turn — play ' + (state.currentRank || '?') + 's' : (activeP.displayName || activeP.display_name || '?') + '\'s turn';
        lastPlayEl.style.color = isMe ? 'rgba(57,255,20,0.7)' : 'rgba(255,255,255,0.4)';
      }
    }
  }
}

// ── Update action bar ─────────────────────────────────────────────────────────
function updateActionBar(state) {
  const actionBar = document.getElementById('bs-action-bar');
  if (!actionBar) return;
  actionBar.innerHTML = '';

  if (!state || state.enginePhase === 'intermission' || state.winner) {
    actionBar.className = 'bs-hidden';
    return;
  }

  const phase = state.phase;
  const isMyTurn = state.currentTurn === myPlayerId;
  const justPlayed = state.lastPlay?.playerId === myPlayerId;

  if (phase === 'play' && isMyTurn) {
    const playBtn = makeBtn('PLAY ' + (selectedCards.length > 0 ? '(' + selectedCards.length + ')' : ''), 'play', '#2a7a2a', selectedCards.length === 0);
    playBtn.id = 'bs-play-btn';
    actionBar.appendChild(playBtn);
    actionBar.className = actionBar.className.replace('bs-hidden','').trim();
  } else if (phase === 'bs-window') {
    if (justPlayed) {
      const passBtn = makeBtn('PASS', 'pass', '#444');
      actionBar.appendChild(passBtn);
    } else {
      const bsBtn = makeBtn('🚨 CALL BS!', 'bs', '#7a2a2a');
      const passBtn = makeBtn('PASS', 'pass', '#444');
      actionBar.appendChild(bsBtn);
      actionBar.appendChild(passBtn);
    }
    actionBar.className = actionBar.className.replace('bs-hidden','').trim();
  } else {
    actionBar.className = 'bs-hidden';
    return;
  }
}

function makeBtn(label, action, bg, disabled) {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.dataset.action = action;
  btn.disabled = !!disabled;
  btn.style.cssText = 'background:' + (disabled ? '#333' : bg) + ';color:' + (disabled ? 'rgba(255,255,255,0.3)' : 'white') + ';border:none;padding:10px 22px;border-radius:8px;font-family:inherit;font-weight:bold;font-size:clamp(11px,1.3vw,14px);cursor:' + (disabled ? 'default' : 'pointer') + ';letter-spacing:1px;';
  return btn;
}

// ── Challenge overlay ─────────────────────────────────────────────────────────
function showChallengeOverlay(challenge) {
  if (!challenge) return;
  const table = document.getElementById('bs-table');
  if (!table) return;

  // Remove any existing overlay
  const existing = table.querySelector('.bs-challenge-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'bs-challenge-overlay';

  const wasBS = challenge.wasBS;
  const penaltyIsMe = challenge.penaltyId === myPlayerId;
  const callerIsMe = challenge.callerId === myPlayerId;
  const targetIsMe = challenge.targetId === myPlayerId;

  // Title
  const title = document.createElement('div');
  title.style.cssText = 'font-size:clamp(14px,2vw,22px);font-weight:bold;letter-spacing:2px;margin-bottom:10px;';
  title.textContent = wasBS ? '🚨 BUSTED!' : '✅ HONEST!';
  title.style.color = wasBS ? '#ff4040' : '#39ff14';
  overlay.appendChild(title);

  // Detail
  const detail = document.createElement('div');
  detail.style.cssText = 'color:rgba(255,255,255,0.8);font-size:clamp(10px,1.3vw,13px);line-height:1.6;margin-bottom:10px;';
  const callerName = callerIsMe ? 'You' : (challenge.callerName || '?');
  const targetName = targetIsMe ? 'you' : (challenge.targetName || '?');
  const penaltyName = penaltyIsMe ? 'You' : (challenge.penaltyName || '?');
  detail.textContent = callerName + ' called BS on ' + targetName + '.\n';
  detail.textContent += wasBS ? (challenge.targetName || '?') + ' was lying!' : 'They were honest!';
  detail.style.whiteSpace = 'pre-line';
  overlay.appendChild(detail);

  // Revealed cards
  if (challenge.cards && challenge.cards.length > 0) {
    const revealRow = document.createElement('div');
    revealRow.style.cssText = 'display:flex;gap:5px;justify-content:center;margin-bottom:10px;flex-wrap:wrap;';
    challenge.cards.forEach(function(card) {
      revealRow.appendChild(renderCard(card, cardTheme, { faceDown: false, size: 'small' }));
    });
    overlay.appendChild(revealRow);
  }

  // Penalty line
  const penLine = document.createElement('div');
  penLine.style.cssText = 'color:rgba(255,100,100,0.9);font-size:clamp(9px,1.1vw,12px);';
  penLine.textContent = penaltyName + ' pick' + (penaltyIsMe ? '' : 's') + ' up the pile!';
  overlay.appendChild(penLine);

  table.appendChild(overlay);
  overlay.style.setProperty('z-index', '200');

  // Auto-remove after 3.5s
  if (challengeTimer) clearTimeout(challengeTimer);
  challengeTimer = setTimeout(function() {
    if (overlay.parentNode) overlay.remove();
    challengeTimer = null;
  }, 3500);
}

// ── Update scoreboard in HUD ──────────────────────────────────────────────────
function updateHUD(state) {
  const round = document.getElementById('bs-round-label');
  if (round) round.textContent = 'Round ' + (state.round || 1);

  const scoreEl = document.getElementById('bs-score-label');
  if (scoreEl && state.scores) {
    const parts = seatOrder.map(function(p) {
      const s = state.scores[p.id] || 0;
      const isMe = p.id === myPlayerId;
      return (isMe ? 'You' : (p.displayName || p.display_name || '?')) + ': ' + s;
    });
    scoreEl.textContent = parts.join('  •  ');
  }
}

// ── Resize handler ────────────────────────────────────────────────────────────
function attachResizeObserver() {
  if (roRef) roRef.disconnect();
  const table = document.getElementById('bs-table');
  if (!table || !currentGameState) return;
  roRef = new ResizeObserver(function() {
    const tw = table.offsetWidth || 700;
    const th = table.offsetHeight || 385;
    const opponents = seatOrder.slice(1);
    document.querySelectorAll('.bs-seat').forEach(function(seatEl, i) {
      const pos = getArcPosition(i, opponents.length, tw, th);
      seatEl.style.left = pos.x + 'px';
      seatEl.style.top = pos.y + 'px';
    });
  });
  roRef.observe(table);
}

// ── Full sync ─────────────────────────────────────────────────────────────────
function syncAll(state, prevState) {
  updateHUD(state);
  buildSeats(state);
  renderHand(state);
  renderPile(state);
  updateCenter(state);
  updateActionBar(state);

  // Show challenge overlay if new challenge arrived
  if (state.lastChallenge && state.lastChallenge !== (prevState?.lastChallenge)) {
    const prevKey = prevState?.lastChallenge ? JSON.stringify(prevState.lastChallenge) : null;
    const newKey = JSON.stringify(state.lastChallenge);
    if (prevKey !== newKey) {
      showChallengeOverlay(state.lastChallenge);
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
export function render(container, state, socket, playerId, hostPlayerId) {
  containerRef = container;
  socketRef = socket;
  myPlayerId = playerId;
  currentGameState = state;
  cardTheme = state.card_theme || 'classic';
  selectedCards = [];

  seatOrder = reorderPlayers(state.players || [], playerId);

  buildDOM(container, state);
  syncAll(state, null);
  attachResizeObserver();
}

export function update(state, playerId, hostPlayerId) {
  const prev = currentGameState;
  currentGameState = state;
  myPlayerId = playerId;

  // Theme change → full rebuild
  const newTheme = state.card_theme || 'classic';
  if (newTheme !== cardTheme) {
    cardTheme = newTheme;
    selectedCards = [];
    seatOrder = reorderPlayers(state.players || [], playerId);
    buildDOM(containerRef, state);
    syncAll(state, null);
    attachResizeObserver();
    return;
  }

  // Player list changed (someone joined/left) → rebuild seats
  const prevIds = (prev?.players || []).map(function(p) { return p.id; }).join(',');
  const newIds = (state.players || []).map(function(p) { return p.id; }).join(',');
  if (prevIds !== newIds) {
    seatOrder = reorderPlayers(state.players || [], playerId);
    selectedCards = [];
  }

  syncAll(state, prev);
}

export function destroy() {
  if (roRef) { roRef.disconnect(); roRef = null; }
  if (styleTag && styleTag.parentNode) { styleTag.parentNode.removeChild(styleTag); styleTag = null; }
  if (challengeTimer) { clearTimeout(challengeTimer); challengeTimer = null; }
  currentGameState = null;
  myPlayerId = null;
  socketRef = null;
  containerRef = null;
  seatOrder = [];
  selectedCards = [];
  cardTheme = 'classic';
}
