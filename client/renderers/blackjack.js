// Blackjack Renderer — Pure DOM, casino-quality table
// No external libraries, no canvas

// ── Module-level state ───────────────────────────────────────────────────────
let currentGameState = null;
let myPlayerId = null;
let socketRef = null;
let containerRef = null;
let seatOrder = [];
let lastRound = 0;
let audioCtx = null;
let timerInterval = null;
let roRef = null;
let styleTag = null;
let betChips = [];
let betAmount = 0;
let cardTheme = 'classic';

// ── CSS injection ────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('bj-styles')) {
    styleTag = document.getElementById('bj-styles');
    return;
  }
  styleTag = document.createElement('style');
  styleTag.id = 'bj-styles';
  styleTag.textContent = `
@keyframes bj-pulse {
  0%,100% { box-shadow: 0 0 8px rgba(212,175,55,0.3); }
  50% { box-shadow: 0 0 20px rgba(212,175,55,0.8), 0 0 40px rgba(212,175,55,0.3); }
}
@keyframes bj-turn-glow {
  from { box-shadow: 0 0 8px rgba(212,175,55,0.2); }
  to   { box-shadow: 0 0 20px rgba(212,175,55,0.7), 0 0 40px rgba(212,175,55,0.2); }
}
@keyframes bj-result-in {
  from { transform: scale(0.6); opacity: 0; }
  to   { transform: scale(1); opacity: 1; }
}
@keyframes bj-bj-pulse {
  0%,100% { transform: scale(1); }
  50%     { transform: scale(1.12); }
}
@keyframes bj-flash {
  0%,100% { background: transparent; }
  50%     { background: rgba(212,175,55,0.2); }
}
.bj-active::after {
  content: '';
  position: absolute; inset: -10px; border-radius: 12px;
  border: 2px solid rgba(212,175,55,0.8);
  animation: bj-turn-glow 1s ease-in-out infinite alternate;
  pointer-events: none; z-index: 1;
}
.bj-card-inner {
  width: 100%; height: 100%;
  position: relative; transform-style: preserve-3d;
  transition: transform 0.4s ease;
}
.bj-card-inner.is-facedown { transform: rotateY(180deg); }
.bj-card-front, .bj-card-back {
  position: absolute; width: 100%; height: 100%;
  border-radius: 6px; backface-visibility: hidden; -webkit-backface-visibility: hidden;
  overflow: hidden;
}
.bj-card-front {
  background: #fafaf8; border: 1px solid #d0d0d0;
}
.bj-card-front.css-layout {
  display: grid;
  grid-template-rows: auto 1fr auto;
  grid-template-columns: auto 1fr auto;
  padding: 3px;
}
.bj-rank-tl { grid-row:1; grid-column:1; font-size:clamp(8px,1.2vw,13px); font-weight:bold; line-height:1.1; text-align:center; white-space:pre; }
.bj-suit-center { grid-row:2; grid-column:1/-1; font-size:clamp(20px,3.2vw,38px); opacity:0.4; text-align:center; align-self:center; }
.bj-rank-br { grid-row:3; grid-column:3; font-size:clamp(8px,1.2vw,13px); font-weight:bold; line-height:1.1; text-align:center; transform:rotate(180deg); white-space:pre; }
.bj-card-back {
  background: #1a1a4e; border: 1px solid #3a3a8e;
  transform: rotateY(180deg);
  background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 2px, transparent 2px, transparent 8px);
}
.bj-card-back::after {
  content: ''; position: absolute; inset: 4px;
  border: 1px solid rgba(212,175,55,0.35); border-radius: 4px;
}
.bj-chip:hover { transform: translateY(-4px) scale(1.08); }
.bj-chip:active { transform: translateY(-2px) scale(1.02); }
.bj-result-overlay {
  position: absolute; inset: -6px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center; flex-direction: column;
  font-weight: bold; letter-spacing: 2px; z-index: 30;
  animation: bj-result-in 0.3s ease;
}
.bj-scoreboard-row { transition: background 0.3s ease; }
.bj-scoreboard-row.bj-flash-row { animation: bj-flash 0.6s ease; }
#bj-table::before {
  content: ''; position: absolute; inset: 10px; border-radius: 50%;
  border: 2px solid rgba(212,175,55,0.35); pointer-events: none; z-index: 1;
}
#bj-action-bar { transition: transform 0.2s ease, opacity 0.2s ease; }
#bj-action-bar.bj-hidden { transform: translateY(20px); opacity: 0; pointer-events: none; }
#bj-chip-tray { transition: transform 0.2s ease, opacity 0.2s ease; }
#bj-chip-tray.bj-hidden { transform: translateY(20px); opacity: 0; pointer-events: none; }
`;
  document.head.appendChild(styleTag);
}

// ── Audio engine ─────────────────────────────────────────────────────────────
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playTone(freq, dur, type, vol) {
  if (vol === undefined) vol = 0.15;
  if (localStorage.getItem('gc_mute') === '1') return;
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = type; osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.start(); osc.stop(ctx.currentTime + dur);
  } catch(e) {}
}

function playArp(freqs, dur, type) {
  freqs.forEach(function(f, i) { setTimeout(function() { playTone(f, dur, type); }, i * 85); });
}

const sfx = {
  deal:    function() { playTone(800, 0.06, 'square', 0.12); },
  chip:    function() { playTone(480, 0.08, 'sine', 0.18); },
  win:     function() { playArp([523, 659, 784], 0.09, 'triangle'); },
  bj:      function() { playArp([523, 659, 784, 1047], 0.1, 'triangle'); },
  bust:    function() { playArp([330, 262], 0.11, 'sawtooth'); },
  shuffle: function() { for (let i = 0; i < 6; i++) setTimeout(function() { playTone(580 + Math.random() * 280, 0.05, 'square', 0.1); }, i * 55); },
};

// ── Text helpers ──────────────────────────────────────────────────────────────
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function handValue(cards) {
  if (!cards || !cards.length) return 0;
  let sum = 0, aces = 0;
  for (const c of cards) {
    if (c.hole) continue;
    if (c.rank === 'A') aces++;
    else if (['J', 'Q', 'K'].includes(c.rank)) sum += 10;
    else sum += parseInt(c.rank, 10) || 0;
  }
  for (let i = 0; i < aces; i++) {
    sum += (sum + 11 + (aces - 1 - i) <= 21) ? 11 : 1;
  }
  return sum;
}

function isSoft(cards) {
  if (!cards || !cards.length) return false;
  let sum = 0, aces = 0;
  for (const c of cards) {
    if (c.hole) continue;
    if (c.rank === 'A') aces++;
    else if (['J', 'Q', 'K'].includes(c.rank)) sum += 10;
    else sum += parseInt(c.rank, 10) || 0;
  }
  for (let i = 0; i < aces; i++) {
    if (sum + 11 + (aces - 1 - i) <= 21) return true;
  }
  return false;
}

function formatTotal(cards) {
  if (!cards || !cards.length) return '';
  if (cards.some(function(c) { return c.hole; })) return '?';
  const v = handValue(cards);
  if (!v) return '';
  if (isSoft(cards) && v <= 21) return 'soft ' + v;
  return String(v);
}

// ── Card utilities ────────────────────────────────────────────────────────────
// Game state suits are Unicode (♥♦♣♠); image URLs use letters (H/D/C/S)
const SUIT_LETTER = { '\u2665': 'H', '\u2666': 'D', '\u2663': 'C', '\u2660': 'S' };

function cardImageUrl(suit, rank, theme) {
  const sl = SUIT_LETTER[suit] || suit;
  return '/cards/' + theme + '/' + sl + rank + '.svg';
}

function cardBackUrl(theme) {
  return '/cards/' + theme + '/back.svg';
}

function getSuitColor(suit) {
  return (suit === '\u2665' || suit === '\u2666') ? '#cc0000' : '#1a1a1a';
}

function buildCssFallbackFront(frontEl, card) {
  const color = getSuitColor(card.suit);
  frontEl.className = 'bj-card-front css-layout';
  frontEl.style.background = '#fafaf8';
  frontEl.innerHTML = '';
  const tl = document.createElement('span');
  tl.className = 'bj-rank-tl'; tl.style.color = color;
  tl.textContent = card.rank + '\n' + card.suit;
  const sc = document.createElement('span');
  sc.className = 'bj-suit-center'; sc.style.color = color;
  sc.textContent = card.suit;
  const rb = document.createElement('span');
  rb.className = 'bj-rank-br'; rb.style.color = color;
  rb.textContent = card.rank + '\n' + card.suit;
  frontEl.appendChild(tl); frontEl.appendChild(sc); frontEl.appendChild(rb);
}

// ── renderCard ────────────────────────────────────────────────────────────────
// options: { faceDown, size:'normal'|'small' }
function renderCard(cardData, theme, options) {
  options = options || {};
  const faceDown = options.faceDown !== undefined
    ? options.faceDown
    : (cardData && cardData.hole);
  const isSmall = options.size === 'small';
  const W = isSmall ? 'clamp(35px,4.5vw,55px)' : 'clamp(42px,6vw,62px)';
  const H = isSmall ? 'clamp(49px,6.3vw,77px)' : 'clamp(59px,8.4vw,87px)';

  const wrap = document.createElement('div');
  wrap.className = 'bj-card';
  wrap.style.cssText = 'width:' + W + ';height:' + H + ';position:relative;perspective:800px;filter:drop-shadow(2px 3px 5px rgba(0,0,0,0.5));flex-shrink:0;';

  const inner = document.createElement('div');
  inner.className = 'bj-card-inner' + (faceDown ? ' is-facedown' : '');
  inner.style.cssText = 'width:100%;height:100%;';

  const front = document.createElement('div');
  front.className = 'bj-card-front';

  if (!faceDown && cardData && !cardData.hole) {
    const imgUrl = cardImageUrl(cardData.suit, cardData.rank, theme);
    const img = document.createElement('img');
    img.src = imgUrl;
    img.draggable = false;
    img.loading = 'eager';
    img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;';
    img.onerror = (function(url, card) {
      return function() {
        wrap.classList.add('card-css-fallback');
        img.remove();
        buildCssFallbackFront(front, card);
        console.warn('Card image missing, using CSS fallback:', url);
      };
    })(imgUrl, cardData);
    front.appendChild(img);
  }

  const back = document.createElement('div');
  back.className = 'bj-card-back';
  const backUrl = cardBackUrl(theme);
  const backImg = document.createElement('img');
  backImg.src = backUrl;
  backImg.draggable = false;
  backImg.loading = 'eager';
  backImg.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;';
  backImg.onerror = function() { backImg.remove(); };
  back.appendChild(backImg);

  inner.appendChild(front);
  inner.appendChild(back);
  wrap.appendChild(inner);
  return wrap;
}

// ── revealCard ────────────────────────────────────────────────────────────────
function revealCard(cardEl, card, theme) {
  const t = theme || cardTheme;
  const inner = cardEl.querySelector('.bj-card-inner');
  const front = cardEl.querySelector('.bj-card-front');
  if (!front || !inner) return;
  front.innerHTML = '';
  front.className = 'bj-card-front';
  front.style.background = '#fafaf8';
  const imgUrl = cardImageUrl(card.suit, card.rank, t);
  const img = document.createElement('img');
  img.src = imgUrl;
  img.draggable = false;
  img.loading = 'eager';
  img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;';
  img.onerror = (function(url, c, fe) {
    return function() {
      cardEl.classList.add('card-css-fallback');
      img.remove();
      buildCssFallbackFront(fe, c);
      console.warn('Card image missing, using CSS fallback:', url);
    };
  })(imgUrl, card, front);
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
  const deg = totalOpponents === 1
    ? 270
    : arcStart + (arcEnd - arcStart) * opponentIdx / (totalOpponents - 1);
  const rad = deg * Math.PI / 180;
  return {
    x: tableW / 2 + tableW * 0.38 * Math.cos(rad),
    y: tableH / 2 + tableH * 0.32 * Math.sin(rad),
  };
}

// ── Float chip delta ──────────────────────────────────────────────────────────
function floatChipChange(seatEl, amount) {
  if (!seatEl || !amount) return;
  const el = document.createElement('div');
  el.textContent = (amount > 0 ? '+' : '') + amount;
  el.style.cssText = 'position:absolute;left:50%;top:10%;transform:translateX(-50%);color:' + (amount > 0 ? '#ffd700' : '#ff4444') + ';font-size:clamp(14px,2vw,20px);font-weight:bold;pointer-events:none;z-index:100;transition:all 1.2s ease;text-shadow:0 2px 4px rgba(0,0,0,0.9);';
  seatEl.style.position = 'relative';
  seatEl.appendChild(el);
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      el.style.transform = 'translateX(-50%) translateY(-70px)';
      el.style.opacity = '0';
    });
  });
  setTimeout(function() { el.remove(); }, 1300);
}

// ── DOM build ─────────────────────────────────────────────────────────────────
function buildDOM(container, state) {
  injectStyles();
  container.innerHTML = '';
  container.style.cssText = 'width:100%;height:calc(100vh - 56px);background:#0a0a0a;display:flex;flex-direction:column;align-items:center;overflow:hidden;font-family:"DM Mono","Courier New",monospace;position:relative;';

  // HUD top bar
  const hud = document.createElement('div');
  hud.id = 'bj-hud-top';
  hud.style.cssText = 'width:min(90vw,900px);display:flex;justify-content:space-between;align-items:center;padding:6px 4px;height:38px;flex-shrink:0;';

  const joinPill = document.createElement('div');
  joinPill.id = 'bj-join-pill';
  joinPill.style.cssText = 'background:rgba(0,0,0,0.7);border:1px solid rgba(212,175,55,0.5);border-radius:20px;padding:4px 12px;color:#d4af37;font-size:clamp(10px,1.2vw,13px);cursor:pointer;user-select:none;';
  joinPill.textContent = 'Code: ----';

  const roundLabel = document.createElement('div');
  roundLabel.id = 'bj-round-label';
  roundLabel.style.cssText = 'color:rgba(255,255,255,0.6);font-size:clamp(10px,1.2vw,13px);';
  roundLabel.textContent = 'Round ' + (state.round || 1);

  const muteBtn = document.createElement('div');
  muteBtn.id = 'bj-mute-btn';
  muteBtn.style.cssText = 'cursor:pointer;border:1px solid rgba(255,255,255,0.2);border-radius:20px;padding:4px 10px;color:white;font-size:14px;user-select:none;';
  muteBtn.textContent = localStorage.getItem('gc_mute') === '1' ? '\uD83D\uDD07' : '\uD83D\uDD0A';

  hud.appendChild(joinPill);
  hud.appendChild(roundLabel);
  hud.appendChild(muteBtn);
  container.appendChild(hud);

  // Scene
  const scene = document.createElement('div');
  scene.id = 'bj-scene';
  scene.style.cssText = 'position:relative;display:flex;align-items:flex-start;justify-content:center;flex:1;width:100%;overflow:visible;';

  // Table
  const table = document.createElement('div');
  table.id = 'bj-table';
  table.style.cssText = 'position:relative;width:min(90vw,900px);height:min(55vw,550px);border-radius:50%;background:radial-gradient(ellipse at 50% 40%,#2d7a3a 0%,#1a5c2a 50%,#0d3317 100%);border:14px solid #3d1f00;box-shadow:inset 0 0 80px rgba(0,0,0,0.6),0 0 0 3px #6b3a00,0 0 0 6px #3d1f00,0 25px 80px rgba(0,0,0,0.8);overflow:visible;margin-top:8px;flex-shrink:0;';

  // Felt text
  const tableText = document.createElement('div');
  tableText.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;';
  const t1 = document.createElement('div');
  t1.style.cssText = 'position:absolute;top:20%;left:50%;transform:translateX(-50%);color:rgba(212,175,55,0.22);font-size:clamp(9px,1.4vw,15px);letter-spacing:4px;white-space:nowrap;';
  t1.textContent = 'BLACKJACK PAYS 3 TO 2';
  const t2 = document.createElement('div');
  t2.style.cssText = 'position:absolute;top:28%;left:50%;transform:translateX(-50%);color:rgba(255,255,255,0.1);font-size:clamp(7px,0.9vw,10px);letter-spacing:2px;white-space:nowrap;';
  t2.textContent = 'DEALER MUST DRAW TO 16 AND STAND ON ALL 17S';
  const insLine = document.createElement('div');
  insLine.style.cssText = 'position:absolute;top:42%;left:17.5%;width:65%;height:1px;background:rgba(212,175,55,0.12);';
  tableText.appendChild(t1); tableText.appendChild(t2); tableText.appendChild(insLine);
  table.appendChild(tableText);

  // Deck shoe
  const shoe = document.createElement('div');
  shoe.style.cssText = 'position:absolute;top:8%;right:6%;width:clamp(28px,4vw,45px);height:clamp(38px,5.5vw,60px);background:#1a1a3a;border:1px solid rgba(212,175,55,0.3);border-radius:4px;display:flex;align-items:center;justify-content:center;color:rgba(212,175,55,0.4);font-size:clamp(6px,0.8vw,9px);letter-spacing:1px;z-index:2;';
  shoe.textContent = 'SHOE';
  table.appendChild(shoe);

  // Discard tray
  const discard = document.createElement('div');
  discard.style.cssText = 'position:absolute;top:8%;left:6%;width:clamp(28px,4vw,45px);height:clamp(38px,5.5vw,60px);background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:4px;z-index:2;';
  table.appendChild(discard);

  // Dealer area (top center, hardcoded)
  const dealerArea = document.createElement('div');
  dealerArea.id = 'bj-dealer-area';
  dealerArea.style.cssText = 'position:absolute;top:6%;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:6px;z-index:10;';
  const dealerLabel = document.createElement('div');
  dealerLabel.style.cssText = 'color:rgba(255,255,255,0.45);letter-spacing:3px;font-size:clamp(8px,1.1vw,12px);font-weight:bold;';
  dealerLabel.textContent = 'DEALER';
  const dealerHand = document.createElement('div');
  dealerHand.id = 'bj-dealer-hand';
  dealerHand.style.cssText = 'display:flex;position:relative;height:clamp(75px,11vw,110px);min-width:clamp(50px,7vw,75px);';
  const dealerTotal = document.createElement('div');
  dealerTotal.id = 'bj-dealer-total';
  dealerTotal.style.cssText = 'display:none;background:rgba(0,0,0,0.7);border:1px solid rgba(255,255,255,0.2);border-radius:10px;padding:2px 8px;color:white;font-size:clamp(9px,1.1vw,12px);font-weight:bold;';
  dealerArea.appendChild(dealerLabel);
  dealerArea.appendChild(dealerHand);
  dealerArea.appendChild(dealerTotal);
  table.appendChild(dealerArea);

  // Seats container
  const seatsContainer = document.createElement('div');
  seatsContainer.id = 'bj-seats';
  seatsContainer.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
  table.appendChild(seatsContainer);

  // Scoreboard
  const scoreboard = document.createElement('div');
  scoreboard.id = 'bj-scoreboard';
  scoreboard.style.cssText = 'position:absolute;top:0;right:-170px;width:155px;background:rgba(0,0,0,0.75);border:1px solid rgba(212,175,55,0.3);border-radius:8px;padding:10px 12px;font-size:clamp(9px,1.1vw,12px);z-index:5;';
  table.appendChild(scoreboard);

  scene.appendChild(table);
  container.appendChild(scene);

  // Action bar
  const actionBar = document.createElement('div');
  actionBar.id = 'bj-action-bar';
  actionBar.className = 'bj-hidden';
  actionBar.style.cssText = 'width:min(90vw,900px);display:flex;gap:10px;justify-content:center;padding:8px 0;min-height:50px;flex-shrink:0;';
  container.appendChild(actionBar);

  // Chip tray
  const chipTray = document.createElement('div');
  chipTray.id = 'bj-chip-tray';
  chipTray.className = 'bj-hidden';
  chipTray.style.cssText = 'width:min(90vw,900px);background:rgba(0,0,0,0.85);border-top:1px solid rgba(212,175,55,0.25);border-radius:0 0 12px 12px;padding:10px 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex-shrink:0;';
  container.appendChild(chipTray);

  wireEvents();
}

// ── Wire events ───────────────────────────────────────────────────────────────
function wireEvents() {
  const joinPill = document.getElementById('bj-join-pill');
  if (joinPill) {
    joinPill.addEventListener('click', function() {
      const code = joinPill.dataset.code || joinPill.textContent.replace('Code: ', '');
      navigator.clipboard.writeText(code).catch(function() {});
      const orig = joinPill.textContent;
      joinPill.textContent = 'Copied!';
      setTimeout(function() { joinPill.textContent = orig; }, 2000);
    });
  }
  const muteBtn = document.getElementById('bj-mute-btn');
  if (muteBtn) {
    muteBtn.addEventListener('click', function() {
      const muted = localStorage.getItem('gc_mute') === '1';
      localStorage.setItem('gc_mute', muted ? '0' : '1');
      muteBtn.textContent = muted ? '\uD83D\uDD0A' : '\uD83D\uDD07';
    });
  }
  const actionBar = document.getElementById('bj-action-bar');
  if (actionBar) {
    actionBar.addEventListener('click', function(e) {
      const btn = e.target.closest('[data-action]');
      if (!btn || btn.disabled) return;
      const type = btn.dataset.action;
      socketRef.emit('game:action', { sessionId: socketRef.currentSessionId, action: { type } });
      actionBar.querySelectorAll('button').forEach(function(b) { b.disabled = true; b.style.opacity = '0.5'; });
    });
  }
  const chipTray = document.getElementById('bj-chip-tray');
  if (chipTray) {
    chipTray.addEventListener('click', function(e) {
      const chip = e.target.closest('[data-chip-value]');
      if (chip) {
        const val = parseInt(chip.dataset.chipValue, 10);
        const me = currentGameState && currentGameState.players && currentGameState.players.find(function(p) { return p.id === myPlayerId; });
        if (me && betAmount + val <= (me.chips || 0)) {
          betAmount += val; betChips.push(val); sfx.chip(); updateChipTrayDisplay();
        }
        return;
      }
      const betBtn = e.target.closest('#bj-bet-btn');
      if (betBtn && betAmount > 0) {
        socketRef.emit('game:action', { sessionId: socketRef.currentSessionId, action: { type: 'place_bet', amount: betAmount } });
        betBtn.disabled = true;
        return;
      }
      const clearBet = e.target.closest('#bj-clear-bet');
      if (clearBet) { betAmount = 0; betChips = []; updateChipTrayDisplay(); }
    });
  }
}

// ── Build seats ───────────────────────────────────────────────────────────────
function buildSeats(state) {
  const seatsContainer = document.getElementById('bj-seats');
  const table = document.getElementById('bj-table');
  if (!seatsContainer || !table) return;
  seatsContainer.innerHTML = '';

  seatOrder = reorderPlayers(state.players || [], myPlayerId);
  const tw = table.offsetWidth, th = table.offsetHeight;
  const opponents = seatOrder.slice(1);

  seatOrder.forEach(function(player, i) {
    const isLocal = i === 0;
    const isActive = state.currentPlayerId === player.id && !player.result;

    const seat = document.createElement('div');
    seat.className = 'bj-seat' + (isActive ? ' bj-active' : '');
    seat.dataset.playerId = player.id;

    if (isLocal) {
      // Pinned to bottom center — override arc
      seat.style.cssText = 'position:absolute;left:50%;bottom:10px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:3px;pointer-events:auto;z-index:20;min-width:80px;';
    } else {
      const pos = getArcPosition(i - 1, opponents.length, tw, th);
      seat.style.cssText = 'position:absolute;left:' + pos.x + 'px;top:' + pos.y + 'px;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:3px;pointer-events:auto;z-index:20;min-width:80px;';
    }

    // YOU indicator (local only)
    if (isLocal) {
      const youLabel = document.createElement('div');
      youLabel.style.cssText = 'color:#d4af37;background:rgba(212,175,55,0.15);border:1px solid rgba(212,175,55,0.5);border-radius:20px;padding:2px 8px;font-size:clamp(8px,1vw,11px);font-weight:bold;';
      youLabel.textContent = '\u25B6 YOU \u25C0';
      seat.appendChild(youLabel);
    }

    // Name pill
    const displayName = player.is_bot
      ? ('\uD83E\uDD16 ' + (player.displayName || player.display_name || 'Bot'))
      : (player.displayName || player.display_name || 'Player');
    const namePill = document.createElement('div');
    namePill.className = 'bj-name-pill';
    namePill.style.cssText = 'background:rgba(0,0,0,0.75);border:1px solid ' + (isLocal ? 'rgba(212,175,55,0.5)' : 'rgba(255,255,255,0.2)') + ';border-radius:20px;padding:3px 10px;color:' + (isLocal ? '#d4af37' : 'white') + ';font-size:clamp(9px,1.1vw,12px);white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis;';
    namePill.textContent = displayName;

    // Hand container
    const handContainer = document.createElement('div');
    handContainer.className = 'bj-seat-hand';
    const cardH = isLocal ? 'clamp(65px,9.5vw,100px)' : 'clamp(49px,6.3vw,77px)';
    const minW = isLocal ? 'clamp(45px,6.5vw,70px)' : 'clamp(35px,4.5vw,55px)';
    handContainer.style.cssText = 'display:flex;position:relative;height:' + cardH + ';min-width:' + minW + ';';
    // Opponents' hands face away (rotated 180°)
    if (!isLocal) handContainer.style.transform = 'rotate(180deg)';

    const offset = isLocal ? 'clamp(18px,2.4vw,26px)' : 'clamp(12px,1.6vw,18px)';
    (player.hand || []).forEach(function(card, ci) {
      const cardEl = renderCard(card, cardTheme, { size: isLocal ? 'normal' : 'small' });
      cardEl.style.position = 'absolute';
      cardEl.style.left = 'calc(' + ci + ' * ' + offset + ')';
      cardEl.style.top = '0';
      cardEl.style.zIndex = String(ci + 1);
      handContainer.appendChild(cardEl);
    });

    // Score total
    const totalEl = document.createElement('div');
    totalEl.className = 'bj-seat-total';
    const v = handValue(player.hand || []);
    if (v > 0) {
      const soft = isSoft(player.hand || []);
      totalEl.textContent = v > 21 ? String(v) : (soft ? 'soft ' + v : String(v));
      totalEl.style.cssText = 'background:rgba(0,0,0,0.7);border:1px solid rgba(255,255,255,0.2);border-radius:10px;padding:2px 8px;color:' + (v > 21 ? '#ff8888' : 'white') + ';font-size:clamp(9px,1.1vw,12px);font-weight:bold;';
    } else {
      totalEl.style.display = 'none';
    }

    // Chip info row
    const infoRow = document.createElement('div');
    infoRow.className = 'bj-seat-info';
    const betStr = (player.bet || 0) > 0 ? '  \u00B7  Bet: ' + player.bet : '';
    infoRow.textContent = '\uD83E\uDE99 ' + (player.chips != null ? player.chips : 0) + betStr;
    infoRow.style.cssText = 'display:flex;gap:6px;align-items:center;font-size:clamp(8px,1vw,11px);color:rgba(255,255,255,0.75);white-space:nowrap;';

    // Stack order: local = [hand, total, name, chips]; opponent = [name, hand, total, chips]
    if (isLocal) {
      seat.appendChild(handContainer);
      seat.appendChild(totalEl);
      seat.appendChild(namePill);
      seat.appendChild(infoRow);
    } else {
      seat.appendChild(namePill);
      seat.appendChild(handContainer);
      seat.appendChild(totalEl);
      seat.appendChild(infoRow);
    }

    seatsContainer.appendChild(seat);
  });
}

// ── Deal animation ────────────────────────────────────────────────────────────
function dealCard(cardEl, destContainer, cardIndex, delay, isSmall) {
  if (delay === undefined) delay = 0;
  const table = document.getElementById('bj-table');
  if (!table) { destContainer.appendChild(cardEl); return; }
  const tr = table.getBoundingClientRect();
  cardEl.style.position = 'fixed';
  cardEl.style.left = (tr.right - 50) + 'px';
  cardEl.style.top = (tr.top + 30) + 'px';
  cardEl.style.zIndex = '9999';
  cardEl.style.transition = 'none';
  document.body.appendChild(cardEl);
  setTimeout(function() {
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        const dr = destContainer.getBoundingClientRect();
        const offset = isSmall ? 14 : 22;
        const offsetPx = cardIndex * offset;
        cardEl.style.transition = 'all 0.32s cubic-bezier(0.25,0.46,0.45,0.94)';
        cardEl.style.left = (dr.left + offsetPx) + 'px';
        cardEl.style.top = dr.top + 'px';
        setTimeout(function() {
          if (!cardEl.parentNode || cardEl.parentNode !== document.body) return;
          const offsetStr = isSmall ? 'clamp(12px,1.6vw,18px)' : 'clamp(18px,2.4vw,26px)';
          cardEl.style.position = 'absolute';
          cardEl.style.left = 'calc(' + cardIndex + ' * ' + offsetStr + ')';
          cardEl.style.top = '0';
          cardEl.style.zIndex = String(cardIndex + 1);
          cardEl.style.transition = '';
          destContainer.appendChild(cardEl);
        }, 340);
      });
    });
  }, delay);
}

// ── Action buttons ────────────────────────────────────────────────────────────
function updateActionButtons() {
  const bar = document.getElementById('bj-action-bar');
  if (!bar || !currentGameState) return;
  const gs = currentGameState;
  const me = gs.players && gs.players.find(function(p) { return p.id === myPlayerId; });
  const myTurn = gs.currentPlayerId === myPlayerId && me && me.status === 'playing' && gs.phase === 'playing';

  if (!myTurn) {
    bar.classList.add('bj-hidden');
    bar.innerHTML = '';
    return;
  }

  const canDouble = me.hand && me.hand.length === 2 && me.chips >= me.bet;
  const canSplit = me.hand && me.hand.length === 2 && me.hand[0] && me.hand[1] && me.hand[0].rank === me.hand[1].rank && me.chips >= me.bet;

  const btnStyle = function(bg) {
    return 'background:' + bg + ';color:white;border:none;padding:10px 26px;border-radius:8px;font-weight:bold;font-family:inherit;font-size:clamp(12px,1.5vw,15px);cursor:pointer;letter-spacing:1px;transition:all 0.15s ease;';
  };

  bar.innerHTML =
    '<button data-action="hit" style="' + btnStyle('#1a7a1a') + '">HIT</button>' +
    '<button data-action="stand" style="' + btnStyle('#7a1a1a') + '">STAND</button>' +
    (canDouble ? '<button data-action="double" style="' + btnStyle('#1a3a7a') + '">DOUBLE</button>' : '') +
    (canSplit ? '<button data-action="split" style="' + btnStyle('#5a1a7a') + '">SPLIT</button>' : '');
  bar.classList.remove('bj-hidden');
}

// ── Results overlays ──────────────────────────────────────────────────────────
function showResults(state) {
  const RESULTS = {
    win:       { bg: 'rgba(0,100,0,0.8)',      color: '#aaffaa', text: 'WIN',        sfxKey: 'win' },
    blackjack: { bg: 'rgba(120,90,0,0.85)',     color: '#ffd700', text: 'BLACKJACK!', sfxKey: 'bj', extra: 'animation:bj-bj-pulse 0.4s ease 3;' },
    bust:      { bg: 'rgba(120,0,0,0.8)',       color: '#ffaaaa', text: 'BUST',       sfxKey: 'bust' },
    push:      { bg: 'rgba(70,70,70,0.8)',      color: '#dddddd', text: 'PUSH',       sfxKey: null },
    lose:      { bg: 'rgba(80,0,0,0.75)',       color: '#ff8888', text: 'LOSE',       sfxKey: null },
  };
  (state.players || []).forEach(function(p) {
    if (!p.result) return;
    const seatEl = document.querySelector('.bj-seat[data-player-id="' + p.id + '"]');
    if (!seatEl || seatEl.querySelector('.bj-result-overlay')) return;
    const r = RESULTS[p.result];
    if (!r) return;
    if (r.sfxKey && sfx[r.sfxKey]) sfx[r.sfxKey]();
    const overlay = document.createElement('div');
    overlay.className = 'bj-result-overlay';
    overlay.style.cssText = 'background:' + r.bg + ';color:' + r.color + ';font-size:clamp(12px,1.8vw,18px);' + (r.extra || '');
    overlay.textContent = r.text;
    seatEl.style.position = 'relative';
    seatEl.appendChild(overlay);
  });
}

// ── Dealer hand sync ──────────────────────────────────────────────────────────
function syncDealerHand(state, prev) {
  const container = document.getElementById('bj-dealer-hand');
  const totalEl = document.getElementById('bj-dealer-total');
  if (!container) return;
  const cards = state.dealerHand || [];
  const prevCards = prev && prev.dealerHand ? prev.dealerHand : [];

  if (cards.length !== container.querySelectorAll('.bj-card').length) {
    container.innerHTML = '';
    cards.forEach(function(card, i) {
      const el = renderCard(card, cardTheme, { size: 'normal' });
      el.style.position = 'absolute';
      el.style.left = 'calc(' + i + ' * clamp(18px,2.4vw,26px))';
      el.style.top = '0';
      el.style.zIndex = String(i + 1);
      if (i >= prevCards.length) {
        sfx.deal();
        dealCard(el, container, i, 0, false);
      } else {
        container.appendChild(el);
      }
    });
  } else {
    cards.forEach(function(card, i) {
      const existing = container.querySelectorAll('.bj-card')[i];
      if (!existing) return;
      const inner = existing.querySelector('.bj-card-inner');
      if (inner && inner.classList.contains('is-facedown') && !card.hole) {
        revealCard(existing, card, cardTheme);
      }
    });
  }

  if (totalEl) {
    if (cards.length > 0) {
      const t = formatTotal(cards);
      totalEl.textContent = t;
      totalEl.style.display = t ? 'block' : 'none';
    } else {
      totalEl.style.display = 'none';
    }
  }
}

// ── Sync individual seat ──────────────────────────────────────────────────────
function syncSeat(player, prev) {
  const seatEl = document.querySelector('.bj-seat[data-player-id="' + player.id + '"]');
  if (!seatEl) return;
  const prevP = prev && prev.players && prev.players.find(function(p) { return p.id === player.id; });
  const isLocal = player.id === myPlayerId;
  const isActive = currentGameState.currentPlayerId === player.id && !player.result;
  seatEl.classList.toggle('bj-active', isActive);

  const handContainer = seatEl.querySelector('.bj-seat-hand');
  if (handContainer) {
    const cards = player.hand || [];
    const prevCards = prevP && prevP.hand ? prevP.hand : [];
    const existing = handContainer.querySelectorAll('.bj-card');
    if (cards.length !== existing.length) {
      handContainer.innerHTML = '';
      const offset = isLocal ? 'clamp(18px,2.4vw,26px)' : 'clamp(12px,1.6vw,18px)';
      cards.forEach(function(card, ci) {
        const el = renderCard(card, cardTheme, { size: isLocal ? 'normal' : 'small' });
        el.style.position = 'absolute';
        el.style.left = 'calc(' + ci + ' * ' + offset + ')';
        el.style.top = '0';
        el.style.zIndex = String(ci + 1);
        if (ci >= prevCards.length) {
          sfx.deal();
          dealCard(el, handContainer, ci, 0, !isLocal);
        } else {
          handContainer.appendChild(el);
        }
      });
    }
  }

  const totalEl = seatEl.querySelector('.bj-seat-total');
  if (totalEl) {
    const v = handValue(player.hand || []);
    if (v > 0) {
      const soft = isSoft(player.hand || []);
      totalEl.textContent = v > 21 ? String(v) : (soft ? 'soft ' + v : String(v));
      totalEl.style.color = v > 21 ? '#ff8888' : 'white';
      totalEl.style.display = 'block';
    } else {
      totalEl.style.display = 'none';
    }
  }

  const infoEl = seatEl.querySelector('.bj-seat-info');
  if (infoEl) {
    const betStr = (player.bet || 0) > 0 ? '  \u00B7  Bet: ' + player.bet : '';
    infoEl.textContent = '\uD83E\uDE99 ' + (player.chips != null ? player.chips : 0) + betStr;
  }

  if (prevP && player.result && player.chips !== prevP.chips) {
    const diff = player.chips - prevP.chips + (player.bet || 0);
    if (diff) floatChipChange(seatEl, diff);
  }
}

// ── Scoreboard ────────────────────────────────────────────────────────────────
function updateScoreboard(state) {
  const board = document.getElementById('bj-scoreboard');
  if (!board) return;
  let html = '<div style="color:#d4af37;font-size:9px;font-weight:bold;letter-spacing:2px;text-align:center;margin-bottom:6px;">SESSION</div>';
  html += '<div style="color:rgba(255,255,255,0.6);font-size:9px;text-align:center;margin-bottom:8px;">Round ' + (state.round || 1) + '</div>';
  (state.players || []).forEach(function(p) {
    const isLocal = p.id === myPlayerId;
    const name = (p.displayName || p.display_name || 'Player').slice(0, 10);
    html += '<div class="bj-scoreboard-row" data-sb="' + p.id + '" style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.06);">'
      + '<span style="color:' + (isLocal ? '#d4af37' : 'white') + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80px;">' + esc(name) + '</span>'
      + '<span style="color:#d4af37;">\uD83E\uDE99' + (p.chips != null ? p.chips : 0) + '</span>'
      + '</div>';
  });
  board.innerHTML = html;
}

function updateHUD(state) {
  const roundLabel = document.getElementById('bj-round-label');
  if (roundLabel) roundLabel.textContent = 'Round ' + (state.round || 1);
}

// ── Chip tray ─────────────────────────────────────────────────────────────────
const CHIP_DENOMS = [
  { value: 1,    bg: 'radial-gradient(circle at 35% 35%,#f0f0f0,#909090)', border: '#777',    color: '#333' },
  { value: 5,    bg: 'radial-gradient(circle at 35% 35%,#ff6666,#cc0000)', border: '#990000', color: 'white' },
  { value: 25,   bg: 'radial-gradient(circle at 35% 35%,#66dd66,#228822)', border: '#116611', color: 'white' },
  { value: 100,  bg: 'radial-gradient(circle at 35% 35%,#666,#111)',       border: '#888',    color: 'white' },
  { value: 500,  bg: 'radial-gradient(circle at 35% 35%,#cc77ff,#6600cc)', border: '#4400aa', color: 'white' },
  { value: 1000, bg: 'radial-gradient(circle at 35% 35%,#ffee44,#cc9900)', border: '#aa7700', color: '#333' },
];

function showChipTray(state) {
  const tray = document.getElementById('bj-chip-tray');
  if (!tray) return;
  betAmount = 0; betChips = [];
  tray.innerHTML =
    '<div id="bj-tray-chips" style="display:flex;gap:8px;flex-wrap:wrap;">' +
    CHIP_DENOMS.map(function(d) {
      return '<div class="bj-chip" data-chip-value="' + d.value + '" style="width:clamp(38px,5.2vw,50px);height:clamp(38px,5.2vw,50px);border-radius:50%;background:' + d.bg + ';border:3px solid ' + d.border + ';color:' + d.color + ';display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:clamp(9px,1.2vw,13px);cursor:pointer;user-select:none;transition:transform 0.1s ease;box-shadow:0 0 0 2px rgba(255,255,255,0.15),0 4px 8px rgba(0,0,0,0.5);">' + (d.value >= 1000 ? '1K' : d.value) + '</div>';
    }).join('') +
    '</div>' +
    '<div id="bj-tray-betstack" style="display:flex;align-items:center;gap:6px;flex:1;min-width:120px;color:#d4af37;font-weight:bold;">No bet</div>' +
    '<button id="bj-clear-bet" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:6px 14px;color:white;cursor:pointer;font-family:inherit;">Clear</button>' +
    '<button id="bj-bet-btn" disabled style="background:linear-gradient(135deg,#d4af37,#a07820);color:#1a1a00;font-weight:bold;border:none;border-radius:8px;padding:8px 22px;cursor:pointer;font-family:inherit;font-size:clamp(12px,1.4vw,15px);letter-spacing:1px;">BET</button>';
  tray.classList.remove('bj-hidden');
  if (timerInterval) clearInterval(timerInterval);
}

function hideChipTray() {
  const tray = document.getElementById('bj-chip-tray');
  if (tray) tray.classList.add('bj-hidden');
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

function updateChipTrayDisplay() {
  const stack = document.getElementById('bj-tray-betstack');
  const btn = document.getElementById('bj-bet-btn');
  if (stack) stack.textContent = betAmount > 0 ? 'Bet: ' + betAmount : 'No bet';
  if (btn) btn.disabled = betAmount <= 0;
}

// ── New hand ──────────────────────────────────────────────────────────────────
function handleNewHand(state) {
  sfx.shuffle();
  document.querySelectorAll('.bj-card').forEach(function(c) {
    c.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
    c.style.transform = 'scale(0) rotate(8deg)';
    c.style.opacity = '0';
  });
  setTimeout(function() {
    document.querySelectorAll('.bj-card, .bj-result-overlay').forEach(function(el) { el.remove(); });
    betChips = []; betAmount = 0;
    buildSeats(state);
    syncDealerHand(state, null);
    updateScoreboard(state);
    updateHUD(state);
    updateActionButtons();
    if (state.phase === 'betting') showChipTray(state);
    else hideChipTray();
  }, 280);
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════════════════════

export function render(container, gameState, socket, playerId, hostPlayerId) {
  myPlayerId = playerId;
  socketRef = socket;
  containerRef = container;
  currentGameState = gameState;
  lastRound = gameState.round || 0;
  cardTheme = gameState.card_theme || 'classic';

  buildDOM(container, gameState);

  // Populate join pill
  const joinPill = document.getElementById('bj-join-pill');
  if (joinPill && gameState.joinCode) {
    joinPill.textContent = 'Code: ' + gameState.joinCode;
    joinPill.dataset.code = gameState.joinCode;
  }

  buildSeats(gameState);
  syncDealerHand(gameState, null);
  updateScoreboard(gameState);
  updateActionButtons();
  if (gameState.phase === 'results') showResults(gameState);
  if (gameState.phase === 'betting') showChipTray(gameState);

  const table = document.getElementById('bj-table');
  if (table) {
    roRef = new ResizeObserver(function() {
      const t = document.getElementById('bj-table');
      if (!t) return;
      const tw = t.offsetWidth, th = t.offsetHeight;
      const opponents = seatOrder.slice(1);
      // Skip index 0 (local player) — it's pinned via CSS bottom:10px
      document.querySelectorAll('.bj-seat').forEach(function(seatEl, i) {
        if (i === 0) return;
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

  // Theme change — rebuild all cards
  const newTheme = gameState.card_theme || 'classic';
  if (newTheme !== cardTheme) {
    cardTheme = newTheme;
    buildSeats(gameState);
    syncDealerHand(gameState, null);
    updateScoreboard(gameState);
    updateHUD(gameState);
    updateActionButtons();
    if (gameState.phase === 'results') showResults(gameState);
    return;
  }

  if (gameState.round !== (prev && prev.round)) {
    lastRound = gameState.round;
    handleNewHand(gameState);
    return;
  }

  syncDealerHand(gameState, prev);
  (gameState.players || []).forEach(function(p) { syncSeat(p, prev); });
  updateActionButtons();
  if (gameState.phase === 'results') showResults(gameState);
  if (gameState.phase === 'betting' && prev && prev.phase !== 'betting') showChipTray(gameState);
  if (gameState.phase !== 'betting') hideChipTray();
  updateScoreboard(gameState);
  updateHUD(gameState);
}

export function destroy() {
  if (roRef) { roRef.disconnect(); roRef = null; }
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  if (audioCtx) { audioCtx.close().catch(function() {}); audioCtx = null; }
  if (styleTag) { styleTag.remove(); styleTag = null; }
  document.querySelectorAll('.bj-card[style*="position: fixed"], .bj-card[style*="position:fixed"]').forEach(function(el) { el.remove(); });
  if (containerRef) { containerRef.innerHTML = ''; containerRef = null; }
  currentGameState = null; myPlayerId = null; socketRef = null;
  seatOrder = []; lastRound = 0; betChips = []; betAmount = 0; cardTheme = 'classic';
}
