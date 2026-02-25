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
}
.bj-card-front {
  background: #fafaf8; border: 1px solid #d0d0d0;
  display: grid;
  grid-template-rows: auto 1fr auto;
  grid-template-columns: auto 1fr auto;
  padding: 3px;
}
.bj-rank-tl { grid-row:1; grid-column:1; font-size:clamp(8px,1.2vw,13px); font-weight:bold; line-height:1.1; text-align:center; white-space:pre; }
.bj-suit-center { grid-row:2; grid-column:1/-1; font-size:clamp(20px,3.2vw,38px); opacity:0.15; text-align:center; align-self:center; }
.bj-rank-br { grid-row:3; grid-column:3; font-size:clamp(8px,1.2vw,13px); font-weight:bold; line-height:1.1; text-align:center; transform:rotate(180deg); white-space:pre; }
.bj-red { color: #cc0000; }
.bj-black { color: #1a1a1a; }
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
  shuffle: function() { for (var i = 0; i < 6; i++) setTimeout(function() { playTone(580 + Math.random() * 280, 0.05, 'square', 0.1); }, i * 55); },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
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

function buildSeatOrder(players) {
  if (!players || !players.length) return [];
  const arr = [...players];
  const myIdx = arr.findIndex(function(p) { return p.id === myPlayerId; });
  if (myIdx !== -1) {
    const center = Math.floor(arr.length / 2);
    if (myIdx !== center) {
      const tmp = arr[myIdx]; arr[myIdx] = arr[center]; arr[center] = tmp;
    }
  }
  return arr;
}

function getSeatPosition(index, total, tableW, tableH) {
  const startDeg = 205, endDeg = 335;
  const deg = total === 1 ? 270 : startDeg + (index / (total - 1)) * (endDeg - startDeg);
  const rad = deg * Math.PI / 180;
  return {
    x: tableW / 2 + tableW * 0.37 * Math.cos(rad),
    y: tableH / 2 + tableH * 0.32 * Math.sin(rad),
  };
}

// ── Card creation ─────────────────────────────────────────────────────────────
function createCardEl(card, index) {
  const facedown = !card || card.hole;
  const isRed = !facedown && (card.suit === '\u2665' || card.suit === '\u2666');

  const el = document.createElement('div');
  el.className = 'bj-card' + (isRed ? ' bj-red' : ' bj-black');
  if (!facedown) { el.dataset.rank = card.rank; el.dataset.suit = card.suit; }
  el.style.cssText = 'width:clamp(42px,6vw,62px);height:clamp(59px,8.4vw,87px);position:absolute;left:calc(' + index + ' * clamp(18px,2.4vw,26px));top:0;z-index:' + (index + 1) + ';perspective:800px;filter:drop-shadow(2px 3px 5px rgba(0,0,0,0.5));';

  const inner = document.createElement('div');
  inner.className = 'bj-card-inner' + (facedown ? ' is-facedown' : '');

  const front = document.createElement('div');
  front.className = 'bj-card-front';

  if (!facedown) {
    const isFace = ['J', 'Q', 'K'].includes(card.rank);
    const isAce = card.rank === 'A';
    if (isFace) {
      const bandColor = card.rank === 'J' ? '#1a3a8f' : card.rank === 'Q' ? '#8f1a1a' : '#4a1a8f';
      front.style.background = 'linear-gradient(to bottom, #fafaf8 20%, ' + bandColor + ' 20%, ' + bandColor + ' 80%, #fafaf8 80%)';
    }
    const tl = document.createElement('span');
    tl.className = 'bj-rank-tl';
    tl.textContent = card.rank + '\n' + card.suit;
    const center = document.createElement('span');
    center.className = 'bj-suit-center';
    center.textContent = card.suit;
    if (isFace) { center.style.opacity = '0.9'; center.style.color = 'white'; center.style.fontSize = 'clamp(24px,3.5vw,42px)'; }
    else if (isAce) { center.style.opacity = '0.5'; center.style.fontSize = 'clamp(26px,3.8vw,44px)'; }
    const br = document.createElement('span');
    br.className = 'bj-rank-br';
    br.textContent = card.rank + '\n' + card.suit;
    front.appendChild(tl);
    front.appendChild(center);
    front.appendChild(br);
  }

  const back = document.createElement('div');
  back.className = 'bj-card-back';

  inner.appendChild(front);
  inner.appendChild(back);
  el.appendChild(inner);
  return el;
}

function revealCard(cardEl, card) {
  const isRed = card.suit === '\u2665' || card.suit === '\u2666';
  cardEl.className = 'bj-card ' + (isRed ? 'bj-red' : 'bj-black');
  cardEl.dataset.rank = card.rank;
  cardEl.dataset.suit = card.suit;
  const inner = cardEl.querySelector('.bj-card-inner');
  const front = cardEl.querySelector('.bj-card-front');
  if (!front || !inner) return;
  front.innerHTML = '';
  const isFace = ['J', 'Q', 'K'].includes(card.rank);
  const isAce = card.rank === 'A';
  if (isFace) {
    const bc = card.rank === 'J' ? '#1a3a8f' : card.rank === 'Q' ? '#8f1a1a' : '#4a1a8f';
    front.style.background = 'linear-gradient(to bottom, #fafaf8 20%, ' + bc + ' 20%, ' + bc + ' 80%, #fafaf8 80%)';
  } else {
    front.style.background = '#fafaf8';
  }
  const tl = document.createElement('span'); tl.className = 'bj-rank-tl'; tl.textContent = card.rank + '\n' + card.suit;
  const sc = document.createElement('span'); sc.className = 'bj-suit-center'; sc.textContent = card.suit;
  if (isFace) { sc.style.opacity = '0.9'; sc.style.color = 'white'; sc.style.fontSize = 'clamp(24px,3.5vw,42px)'; }
  else if (isAce) { sc.style.opacity = '0.5'; sc.style.fontSize = 'clamp(26px,3.8vw,44px)'; }
  const rb = document.createElement('span'); rb.className = 'bj-rank-br'; rb.textContent = card.rank + '\n' + card.suit;
  front.appendChild(tl); front.appendChild(sc); front.appendChild(rb);
  inner.classList.remove('is-facedown');
}

function dealCard(cardEl, destContainer, cardIndex, delay) {
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
        const offsetPx = cardIndex * 22;
        cardEl.style.transition = 'all 0.32s cubic-bezier(0.25,0.46,0.45,0.94)';
        cardEl.style.left = (dr.left + offsetPx) + 'px';
        cardEl.style.top = dr.top + 'px';
        setTimeout(function() {
          if (!cardEl.parentNode || cardEl.parentNode !== document.body) return;
          cardEl.style.position = 'absolute';
          cardEl.style.left = 'calc(' + cardIndex + ' * clamp(18px,2.4vw,26px))';
          cardEl.style.top = '0';
          cardEl.style.zIndex = String(cardIndex + 1);
          cardEl.style.transition = '';
          destContainer.appendChild(cardEl);
        }, 340);
      });
    });
  }, delay);
}

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

// ── DOM build ────────────────────────────────────────────────────────────────
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
  tableText.id = 'bj-table-text';
  tableText.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;';

  const feltText1 = document.createElement('div');
  feltText1.style.cssText = 'position:absolute;top:20%;left:50%;transform:translateX(-50%);color:rgba(212,175,55,0.22);font-size:clamp(9px,1.4vw,15px);letter-spacing:4px;white-space:nowrap;';
  feltText1.textContent = 'BLACKJACK PAYS 3 TO 2';

  const feltText2 = document.createElement('div');
  feltText2.style.cssText = 'position:absolute;top:28%;left:50%;transform:translateX(-50%);color:rgba(255,255,255,0.1);font-size:clamp(7px,0.9vw,10px);letter-spacing:2px;white-space:nowrap;';
  feltText2.textContent = 'DEALER MUST DRAW TO 16 AND STAND ON ALL 17S';

  const insuranceLine = document.createElement('div');
  insuranceLine.style.cssText = 'position:absolute;top:42%;left:17.5%;width:65%;height:1px;background:rgba(212,175,55,0.12);';

  tableText.appendChild(feltText1);
  tableText.appendChild(feltText2);
  tableText.appendChild(insuranceLine);
  table.appendChild(tableText);

  // Deck shoe (top-right)
  const shoe = document.createElement('div');
  shoe.style.cssText = 'position:absolute;top:8%;right:6%;width:clamp(28px,4vw,45px);height:clamp(38px,5.5vw,60px);background:#1a1a3a;border:1px solid rgba(212,175,55,0.3);border-radius:4px;display:flex;align-items:center;justify-content:center;color:rgba(212,175,55,0.4);font-size:clamp(6px,0.8vw,9px);letter-spacing:1px;z-index:2;';
  shoe.textContent = 'SHOE';
  table.appendChild(shoe);

  // Discard tray (top-left)
  const discard = document.createElement('div');
  discard.style.cssText = 'position:absolute;top:8%;left:6%;width:clamp(28px,4vw,45px);height:clamp(38px,5.5vw,60px);background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:4px;z-index:2;';
  table.appendChild(discard);

  // Dealer area
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

  // Scoreboard (positioned outside table via right:-170px; overflow:visible on table)
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

  // Chip tray (hidden by default — no betting phase in current module)
  const chipTray = document.createElement('div');
  chipTray.id = 'bj-chip-tray';
  chipTray.className = 'bj-hidden';
  chipTray.style.cssText = 'width:min(90vw,900px);background:rgba(0,0,0,0.85);border-top:1px solid rgba(212,175,55,0.25);border-radius:0 0 12px 12px;padding:10px 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex-shrink:0;';
  container.appendChild(chipTray);

  // Wire events after DOM is ready
  wireEvents();
}

// ── Wire events (delegated, called once from buildDOM) ────────────────────────
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
      socketRef.emit('game:action', { sessionId: socketRef.currentSessionId, action: { type: type } });
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
      if (clearBet) {
        betAmount = 0; betChips = []; updateChipTrayDisplay();
      }
    });
  }
}

// ── Seats ────────────────────────────────────────────────────────────────────
function buildSeats(state) {
  const seatsContainer = document.getElementById('bj-seats');
  const table = document.getElementById('bj-table');
  if (!seatsContainer || !table) return;
  seatsContainer.innerHTML = '';
  seatOrder = buildSeatOrder(state.players || []);
  const tw = table.offsetWidth, th = table.offsetHeight;

  seatOrder.forEach(function(player, i) {
    const pos = getSeatPosition(i, seatOrder.length, tw, th);
    const isLocal = player.id === myPlayerId;
    const isActive = state.currentPlayerId === player.id && !player.result;

    const seat = document.createElement('div');
    seat.className = 'bj-seat' + (isActive ? ' bj-active' : '');
    seat.dataset.playerId = player.id;
    seat.style.cssText = 'position:absolute;left:' + pos.x + 'px;top:' + pos.y + 'px;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:3px;pointer-events:auto;z-index:20;min-width:80px;';

    if (isLocal) {
      const you = document.createElement('div');
      you.style.cssText = 'color:#d4af37;background:rgba(212,175,55,0.15);border:1px solid rgba(212,175,55,0.5);border-radius:20px;padding:2px 8px;font-size:clamp(8px,1vw,11px);font-weight:bold;';
      you.textContent = '\u25B6 YOU \u25C0';
      seat.appendChild(you);
    }

    const displayName = player.is_bot ? ('\uD83E\uDD16 ' + (player.displayName || player.display_name || 'Bot')) : (player.displayName || player.display_name || 'Player');
    const namePill = document.createElement('div');
    namePill.className = 'bj-name-pill';
    namePill.style.cssText = 'background:rgba(0,0,0,0.75);border:1px solid ' + (isLocal ? 'rgba(212,175,55,0.5)' : 'rgba(255,255,255,0.2)') + ';border-radius:20px;padding:3px 10px;color:' + (isLocal ? '#d4af37' : 'white') + ';font-size:clamp(9px,1.1vw,12px);white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis;';
    namePill.textContent = displayName;
    seat.appendChild(namePill);

    const handContainer = document.createElement('div');
    handContainer.className = 'bj-seat-hand';
    handContainer.style.cssText = 'display:flex;position:relative;height:clamp(65px,9.5vw,100px);min-width:clamp(45px,6.5vw,70px);';
    (player.hand || []).forEach(function(card, ci) { handContainer.appendChild(createCardEl(card, ci)); });
    seat.appendChild(handContainer);

    const totalEl = document.createElement('div');
    totalEl.className = 'bj-seat-total';
    const v = handValue(player.hand || []);
    const soft = isSoft(player.hand || []);
    if (v > 0) {
      totalEl.textContent = v > 21 ? String(v) : (soft ? 'soft ' + v : String(v));
      totalEl.style.cssText = 'background:rgba(0,0,0,0.7);border:1px solid rgba(255,255,255,0.2);border-radius:10px;padding:2px 8px;color:' + (v > 21 ? '#ff8888' : 'white') + ';font-size:clamp(9px,1.1vw,12px);font-weight:bold;';
    } else {
      totalEl.style.display = 'none';
    }
    seat.appendChild(totalEl);

    const infoRow = document.createElement('div');
    infoRow.className = 'bj-seat-info';
    const betStr = (player.bet || 0) > 0 ? '  \u00B7  Bet: ' + player.bet : '';
    infoRow.textContent = '\uD83E\uDE99 ' + (player.chips != null ? player.chips : 0) + betStr;
    infoRow.style.cssText = 'display:flex;gap:6px;align-items:center;font-size:clamp(8px,1vw,11px);color:rgba(255,255,255,0.75);white-space:nowrap;';
    seat.appendChild(infoRow);

    seatsContainer.appendChild(seat);
  });
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
  (state.players || []).forEach(function(p) {
    if (!p.result) return;
    const seatEl = document.querySelector('.bj-seat[data-player-id="' + p.id + '"]');
    if (!seatEl || seatEl.querySelector('.bj-result-overlay')) return;

    const RESULTS = {
      win:       { bg: 'rgba(0,100,0,0.8)',      color: '#aaffaa', text: 'WIN',        sfxKey: 'win' },
      blackjack: { bg: 'rgba(120,90,0,0.85)',     color: '#ffd700', text: 'BLACKJACK!', sfxKey: 'bj', extra: 'animation:bj-bj-pulse 0.4s ease 3;' },
      bust:      { bg: 'rgba(120,0,0,0.8)',       color: '#ffaaaa', text: 'BUST',       sfxKey: 'bust' },
      push:      { bg: 'rgba(70,70,70,0.8)',      color: '#dddddd', text: 'PUSH',       sfxKey: null },
      lose:      { bg: 'rgba(80,0,0,0.75)',       color: '#ff8888', text: 'LOSE',       sfxKey: null },
    };
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

// ── Sync dealer hand ──────────────────────────────────────────────────────────
function syncDealerHand(state, prev) {
  const container = document.getElementById('bj-dealer-hand');
  const totalEl = document.getElementById('bj-dealer-total');
  if (!container) return;
  const cards = state.dealerHand || [];
  const prevCards = prev && prev.dealerHand ? prev.dealerHand : [];

  if (cards.length !== container.querySelectorAll('.bj-card').length) {
    container.innerHTML = '';
    cards.forEach(function(card, i) {
      const el = createCardEl(card, i);
      if (i >= prevCards.length) {
        sfx.deal();
        dealCard(el, container, i, 0);
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
        revealCard(existing, card);
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
  const isActive = currentGameState.currentPlayerId === player.id && !player.result;
  seatEl.classList.toggle('bj-active', isActive);

  const handContainer = seatEl.querySelector('.bj-seat-hand');
  if (handContainer) {
    const cards = player.hand || [];
    const prevCards = prevP && prevP.hand ? prevP.hand : [];
    const existing = handContainer.querySelectorAll('.bj-card');
    if (cards.length !== existing.length) {
      handContainer.innerHTML = '';
      cards.forEach(function(card, i) {
        const el = createCardEl(card, i);
        if (i >= prevCards.length) {
          sfx.deal();
          dealCard(el, handContainer, i, 0);
        } else {
          handContainer.appendChild(el);
        }
      });
    }
  }

  const totalEl = seatEl.querySelector('.bj-seat-total');
  if (totalEl) {
    const cards = player.hand || [];
    const v = handValue(cards);
    if (v > 0) {
      const soft = isSoft(cards);
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

// ── HUD update ────────────────────────────────────────────────────────────────
function updateHUD(state) {
  const roundLabel = document.getElementById('bj-round-label');
  if (roundLabel) roundLabel.textContent = 'Round ' + (state.round || 1);
}

// ── Chip tray (betting phase — present in code per spec, never shown currently) ─
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
    '<button id="bj-bet-btn" disabled style="background:linear-gradient(135deg,#d4af37,#a07820);color:#1a1a00;font-weight:bold;border:none;border-radius:8px;padding:8px 22px;cursor:pointer;font-family:inherit;font-size:clamp(12px,1.4vw,15px);letter-spacing:1px;">BET</button>' +
    '<div id="bj-timer-bar" style="width:100%;height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;"><div id="bj-timer-fill" style="width:100%;height:100%;background:#d4af37;transition:width 0.1s linear;"></div></div>';
  tray.classList.remove('bj-hidden');

  const TOTAL = 20;
  let left = TOTAL;
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(function() {
    left -= 0.1;
    const fill = document.getElementById('bj-timer-fill');
    if (fill) {
      fill.style.width = Math.max(0, (left / TOTAL) * 100) + '%';
      fill.style.background = left <= 5 ? '#cc3300' : '#d4af37';
    }
    if (left <= 0) {
      clearInterval(timerInterval); timerInterval = null;
    }
  }, 100);
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

// ── New hand handler ──────────────────────────────────────────────────────────
function handleNewHand(state) {
  sfx.shuffle();
  document.querySelectorAll('.bj-card').forEach(function(c) {
    c.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
    c.style.transform = 'scale(0) rotate(8deg)';
    c.style.opacity = '0';
  });
  setTimeout(function() {
    document.querySelectorAll('.bj-card, .bj-result-overlay, .bj-table-betstack').forEach(function(el) { el.remove(); });
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

  buildDOM(container, gameState);
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
      document.querySelectorAll('.bj-seat').forEach(function(seatEl, i) {
        const pos = getSeatPosition(i, seatOrder.length, tw, th);
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
  // Remove any cards still animating in document.body
  document.querySelectorAll('.bj-card[style*="position: fixed"], .bj-card[style*="position:fixed"]').forEach(function(el) { el.remove(); });
  if (containerRef) { containerRef.innerHTML = ''; containerRef = null; }
  currentGameState = null; myPlayerId = null; socketRef = null;
  seatOrder = []; lastRound = 0; betChips = []; betAmount = 0;
}
