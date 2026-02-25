// Blackjack Renderer — Pure DOM, casino-quality table
// No external libraries, no canvas, no Phaser

import { isPortrait } from '../app.js';

// ── Module-level state ──────────────────────────────────────────────────────
let currentGameState = null;
let myPlayerId = null;
let socketRef = null;
let seatOrder = [];
let lastHandNumber = 0;
let audioCtx = null;
let timerInterval = null;
let roRef = null;
let styleTag = null;
let betChips = [];
let betAmount = 0;

// ── CSS injection ───────────────────────────────────────────────────────────
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
  to { box-shadow: 0 0 20px rgba(212,175,55,0.7), 0 0 40px rgba(212,175,55,0.2); }
}
@keyframes bj-result-in {
  from { transform: scale(0.6); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
@keyframes bj-bj-pulse {
  0%,100% { transform: scale(1); }
  50% { transform: scale(1.12); }
}
@keyframes bj-flash {
  0%,100% { background: transparent; }
  50% { background: rgba(212,175,55,0.2); }
}
.bj-active::after {
  content: '';
  position: absolute;
  inset: -10px;
  border-radius: 12px;
  border: 2px solid rgba(212,175,55,0.8);
  animation: bj-turn-glow 1s ease-in-out infinite alternate;
  pointer-events: none;
  z-index: 1;
}
.bj-card-inner { width: 100%; height: 100%; position: relative; transform-style: preserve-3d; transition: transform 0.4s ease; }
.bj-card-inner.is-facedown { transform: rotateY(180deg); }
.bj-card-front, .bj-card-back { position: absolute; width: 100%; height: 100%; border-radius: 6px; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.bj-card-front { background: #fafaf8; border: 1px solid #d0d0d0; display: grid; grid-template-rows: auto 1fr auto; grid-template-columns: auto 1fr auto; padding: 3px; }
.bj-rank-tl { grid-row: 1; grid-column: 1; font-size: clamp(8px, 1.2vw, 13px); font-weight: bold; line-height: 1.1; text-align: center; }
.bj-suit-center { grid-row: 2; grid-column: 1 / -1; font-size: clamp(20px, 3.2vw, 38px); opacity: 0.1; text-align: center; align-self: center; }
.bj-rank-br { grid-row: 3; grid-column: 3; font-size: clamp(8px, 1.2vw, 13px); font-weight: bold; line-height: 1.1; text-align: center; transform: rotate(180deg); }
.bj-red { color: #cc0000; }
.bj-black { color: #1a1a1a; }
.bj-card-back { background: #1a1a4e; border: 1px solid #3a3a8e; transform: rotateY(180deg); background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 2px, transparent 2px, transparent 8px); }
.bj-chip:hover { transform: translateY(-4px) scale(1.08); }
.bj-chip:active { transform: translateY(-2px) scale(1.02); }
.bj-result-overlay { position: absolute; inset: -6px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-direction: column; font-weight: bold; letter-spacing: 2px; z-index: 30; animation: bj-result-in 0.3s ease; }
#bj-table::before {
  content: '';
  position: absolute;
  inset: 20px;
  border-radius: 50%;
  border: 2px solid rgba(255,215,0,0.15);
  pointer-events: none;
  z-index: 1;
}
#bj-action-bar { transition: transform 0.25s ease, opacity 0.25s ease; }
#bj-action-bar.bj-hidden { transform: translateY(20px); opacity: 0; pointer-events: none; }
#bj-chip-tray { transition: transform 0.25s ease, opacity 0.25s ease; }
#bj-chip-tray.bj-hidden { transform: translateY(20px); opacity: 0; pointer-events: none; }
.bj-scoreboard-row { transition: background 0.3s ease; }
.bj-scoreboard-row.bj-flash-row { animation: bj-flash 0.5s ease 2; }
`;
  document.head.appendChild(styleTag);
}

// ── Audio engine ────────────────────────────────────────────────────────────
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playTone(freq, dur, type, vol = 0.15) {
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
  freqs.forEach((f, i) => setTimeout(() => playTone(f, dur, type), i * 85));
}

const sfx = {
  deal:    () => playTone(800, 0.06, 'square', 0.12),
  chip:    () => playTone(480, 0.08, 'sine', 0.18),
  win:     () => playArp([523, 659, 784], 0.09, 'triangle'),
  bj:      () => playArp([523, 659, 784, 1047], 0.1, 'triangle'),
  bust:    () => playArp([330, 262], 0.11, 'sawtooth'),
  shuffle: () => { for (let i = 0; i < 6; i++) setTimeout(() => playTone(580 + Math.random() * 280, 0.05, 'square', 0.1), i * 55); },
};

// ── Hand value calc ─────────────────────────────────────────────────────────
function handValue(cards) {
  if (!cards || cards.length === 0) return 0;
  let sum = 0, aces = 0;
  for (const c of cards) {
    if (c.hole) continue;
    if (c.rank === 'A') aces++;
    else if (['J', 'Q', 'K'].includes(c.rank)) sum += 10;
    else sum += parseInt(c.rank, 10) || 0;
  }
  for (let i = 0; i < aces; i++) {
    if (sum + 11 + (aces - 1 - i) <= 21) sum += 11;
    else sum += 1;
  }
  return sum;
}

function isSoftHand(cards) {
  if (!cards || cards.length === 0) return false;
  let sum = 0, aces = 0;
  for (const c of cards) {
    if (c.hole) continue;
    if (c.rank === 'A') aces++;
    else if (['J', 'Q', 'K'].includes(c.rank)) sum += 10;
    else sum += parseInt(c.rank, 10) || 0;
  }
  for (let i = 0; i < aces; i++) {
    if (sum + 11 + (aces - 1 - i) <= 21) { sum += 11; return true; }
    else sum += 1;
  }
  return false;
}

function hasHoleCard(cards) {
  return cards && cards.some(c => c.hole);
}

// ── Seat positioning ────────────────────────────────────────────────────────
function getSeatPosition(index, total, tableW, tableH) {
  const startDeg = 205;
  const endDeg = 335;
  const deg = total === 1
    ? 270
    : startDeg + (index / (total - 1)) * (endDeg - startDeg);
  const rad = (deg * Math.PI) / 180;
  const rx = tableW * 0.37;
  const ry = tableH * 0.32;
  const cx = tableW / 2;
  const cy = tableH / 2;
  return {
    x: cx + rx * Math.cos(rad),
    y: cy + ry * Math.sin(rad)
  };
}

function buildSeatOrder(players) {
  if (!players || players.length === 0) return [];
  const ordered = [...players];
  const myIndex = ordered.findIndex(p => p.id === myPlayerId);
  if (myIndex !== -1) {
    const centerIndex = Math.floor(ordered.length / 2);
    if (myIndex !== centerIndex) {
      [ordered[myIndex], ordered[centerIndex]] = [ordered[centerIndex], ordered[myIndex]];
    }
  }
  return ordered;
}

// ── Card DOM creation ───────────────────────────────────────────────────────
function createCardEl(card, index) {
  const isFacedown = !card || card.hole;
  const isRed = !isFacedown && (card.suit === '\u2665' || card.suit === '\u2666');
  const colorClass = isFacedown ? '' : (isRed ? 'bj-red' : 'bj-black');

  const el = document.createElement('div');
  el.className = `bj-card ${colorClass}`;
  if (!isFacedown) {
    el.dataset.rank = card.rank;
    el.dataset.suit = card.suit;
  }
  el.style.cssText = `width:clamp(42px,6vw,62px);height:clamp(59px,8.4vw,87px);position:absolute;left:${index * 20}px;top:0;z-index:${index + 1};perspective:600px;`;

  const inner = document.createElement('div');
  inner.className = 'bj-card-inner' + (isFacedown ? ' is-facedown' : '');

  // Front face
  const front = document.createElement('div');
  front.className = 'bj-card-front';

  if (!isFacedown) {
    const isFace = ['J', 'Q', 'K'].includes(card.rank);
    const isAce = card.rank === 'A';
    if (isFace) {
      const gradColor = card.rank === 'J' ? '#1a3a8f' : (card.rank === 'Q' ? '#8f1a1a' : '#4a1a8f');
      front.style.background = `linear-gradient(135deg, #fafaf8 40%, ${gradColor}22 100%)`;
    }
    const rankTL = document.createElement('div');
    rankTL.className = 'bj-rank-tl';
    rankTL.textContent = card.rank + '\n' + card.suit;
    front.appendChild(rankTL);

    const suitCenter = document.createElement('div');
    suitCenter.className = 'bj-suit-center';
    suitCenter.textContent = card.suit;
    if (isAce) {
      suitCenter.style.fontSize = 'clamp(26px,3.8vw,44px)';
      suitCenter.style.opacity = '0.5';
    }
    front.appendChild(suitCenter);

    const rankBR = document.createElement('div');
    rankBR.className = 'bj-rank-br';
    rankBR.textContent = card.rank + '\n' + card.suit;
    front.appendChild(rankBR);
  }

  // Back face
  const back = document.createElement('div');
  back.className = 'bj-card-back';

  inner.appendChild(front);
  inner.appendChild(back);
  el.appendChild(inner);
  return el;
}

// ── Deal animation ──────────────────────────────────────────────────────────
function dealCard(cardEl, destContainer, cardIndex) {
  const table = document.getElementById('bj-table');
  if (!table) { destContainer.appendChild(cardEl); return; }
  const tableRect = table.getBoundingClientRect();
  const startX = tableRect.right - 40;
  const startY = tableRect.top + 40;
  cardEl.style.position = 'fixed';
  cardEl.style.left = startX + 'px';
  cardEl.style.top = startY + 'px';
  cardEl.style.zIndex = '9999';
  cardEl.style.transition = 'none';
  document.body.appendChild(cardEl);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const destRect = destContainer.getBoundingClientRect();
      const finalX = destRect.left + cardIndex * 20;
      const finalY = destRect.top;
      cardEl.style.transition = 'all 0.32s cubic-bezier(0.25,0.46,0.45,0.94)';
      cardEl.style.left = finalX + 'px';
      cardEl.style.top = finalY + 'px';
      setTimeout(() => {
        cardEl.style.position = 'absolute';
        cardEl.style.left = (cardIndex * 20) + 'px';
        cardEl.style.top = '0';
        cardEl.style.zIndex = '';
        cardEl.style.transition = '';
        destContainer.appendChild(cardEl);
      }, 340);
    });
  });
}

// ── Float chip change ───────────────────────────────────────────────────────
function floatChipChange(seatEl, amount) {
  if (!seatEl || amount === 0) return;
  const float = document.createElement('div');
  float.textContent = (amount > 0 ? '+' : '') + amount;
  float.style.cssText = `position:absolute;left:50%;top:40%;transform:translateX(-50%);font-weight:bold;font-size:16px;z-index:50;pointer-events:none;color:${amount > 0 ? '#ffd700' : '#ff6666'};transition:all 1.2s ease;opacity:1;`;
  seatEl.appendChild(float);
  requestAnimationFrame(() => {
    float.style.top = '0%';
    float.style.opacity = '0';
  });
  setTimeout(() => float.remove(), 1300);
}

// ── Escape HTML ─────────────────────────────────────────────────────────────
function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Totals display ──────────────────────────────────────────────────────────
function formatTotal(cards) {
  if (!cards || cards.length === 0) return '';
  if (hasHoleCard(cards)) return '?';
  const val = handValue(cards);
  if (val === 0) return '';
  if (isSoftHand(cards) && val <= 21) return 'soft ' + val;
  return String(val);
}

// ── Build DOM ───────────────────────────────────────────────────────────────
function buildDOM(container, state) {
  injectStyles();

  const root = document.createElement('div');
  root.id = 'bj-root';
  root.style.cssText = 'width:100%;height:calc(100vh - 56px);background:#0a0a0a;display:flex;flex-direction:column;align-items:center;overflow:hidden;font-family:"DM Mono","Courier New",monospace;position:relative;';

  // HUD top bar
  const hud = document.createElement('div');
  hud.id = 'bj-hud-top';
  hud.style.cssText = 'width:min(90vw,900px);display:flex;justify-content:space-between;align-items:center;padding:6px 4px;height:38px;z-index:20;';
  const joinCode = state.lobby?.join_code || state.joinCode || '';
  hud.innerHTML = `
    <div id="bj-join-pill" style="background:#ffd700;color:#000;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:bold;cursor:pointer;user-select:none;">${esc(joinCode) || '----'}</div>
    <div id="bj-round-label" style="color:#ccc;font-size:12px;">Round ${state.round || 1}</div>
    <div id="bj-mute-btn" style="cursor:pointer;font-size:18px;user-select:none;">${localStorage.getItem('gc_mute') === '1' ? '\u{1F507}' : '\u{1F50A}'}</div>
  `;
  root.appendChild(hud);

  // Scene container
  const scene = document.createElement('div');
  scene.id = 'bj-scene';
  scene.style.cssText = 'position:relative;display:flex;align-items:flex-start;justify-content:center;flex:1;width:100%;';

  // Table
  const table = document.createElement('div');
  table.id = 'bj-table';
  table.style.cssText = 'position:relative;width:min(90vw,900px);height:min(55vw,550px);border-radius:50%;background:radial-gradient(ellipse at 50% 40%,#2d7a3a 0%,#1a5c2a 50%,#0d3317 100%);border:14px solid #3d1f00;box-shadow:inset 0 0 80px rgba(0,0,0,0.6),0 0 0 3px #6b3a00,0 0 0 6px #3d1f00,0 25px 80px rgba(0,0,0,0.8);overflow:visible;margin-top:8px;';

  // Table text
  const tableText = document.createElement('div');
  tableText.id = 'bj-table-text';
  tableText.style.cssText = 'position:absolute;top:18%;left:50%;transform:translateX(-50%);text-align:center;pointer-events:none;z-index:1;';
  tableText.innerHTML = `
    <div style="color:#ffd700;font-size:11px;font-weight:bold;opacity:0.3;letter-spacing:3px;">BLACKJACK PAYS 3 TO 2</div>
    <div style="color:#ffd700;font-size:8px;opacity:0.2;margin-top:2px;letter-spacing:1px;">DEALER MUST DRAW TO 16 AND STAND ON 17</div>
  `;
  table.appendChild(tableText);

  // Dealer area
  const dealerArea = document.createElement('div');
  dealerArea.id = 'bj-dealer-area';
  dealerArea.style.cssText = 'position:absolute;top:6%;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:6px;z-index:10;';
  dealerArea.innerHTML = `
    <div style="color:rgba(255,255,255,0.4);font-size:10px;font-weight:bold;letter-spacing:3px;">DEALER</div>
    <div id="bj-dealer-hand" style="display:flex;position:relative;height:clamp(75px,11vw,110px);min-width:clamp(50px,7vw,75px);"></div>
    <div id="bj-dealer-total" style="display:none;background:rgba(0,0,0,0.7);color:#fff;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:bold;"></div>
  `;
  table.appendChild(dealerArea);

  // Seats container
  const seats = document.createElement('div');
  seats.id = 'bj-seats';
  seats.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
  table.appendChild(seats);

  // Scoreboard
  const scoreboard = document.createElement('div');
  scoreboard.id = 'bj-scoreboard';
  scoreboard.style.cssText = 'position:absolute;top:0;right:-170px;width:155px;background:rgba(0,0,0,0.7);border:1px solid rgba(255,215,0,0.3);border-radius:8px;padding:8px;z-index:5;';
  table.appendChild(scoreboard);

  // Deck shoe
  const shoe = document.createElement('div');
  shoe.style.cssText = 'position:absolute;top:8%;right:8%;width:30px;height:42px;background:#1a1a1a;border:1px solid #666;border-radius:4px;opacity:0.7;z-index:2;display:flex;align-items:center;justify-content:center;';
  shoe.innerHTML = '<span style="color:#aaa;font-size:6px;letter-spacing:1px;">SHOE</span>';
  table.appendChild(shoe);

  // Discard tray
  const discard = document.createElement('div');
  discard.style.cssText = 'position:absolute;top:8%;left:8%;width:30px;height:42px;background:#1a1a1a;border:1px solid #666;border-radius:4px;opacity:0.7;z-index:2;';
  table.appendChild(discard);

  scene.appendChild(table);
  root.appendChild(scene);

  // Action bar
  const actionBar = document.createElement('div');
  actionBar.id = 'bj-action-bar';
  actionBar.className = 'bj-hidden';
  actionBar.style.cssText = 'display:flex;gap:8px;justify-content:center;padding:8px 0;z-index:20;';
  root.appendChild(actionBar);

  // Chip tray
  const chipTray = document.createElement('div');
  chipTray.id = 'bj-chip-tray';
  chipTray.className = 'bj-hidden';
  chipTray.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px 0;z-index:20;';
  root.appendChild(chipTray);

  container.innerHTML = '';
  container.appendChild(root);

  // Wire up events
  wireEvents(state);
}

// ── Wire events (delegated) ─────────────────────────────────────────────────
function wireEvents(state) {
  // HUD events
  const joinPill = document.getElementById('bj-join-pill');
  if (joinPill) {
    joinPill.addEventListener('click', () => {
      const code = currentGameState?.lobby?.join_code || currentGameState?.joinCode || joinPill.textContent;
      navigator.clipboard.writeText(code).catch(() => {});
      const orig = joinPill.textContent;
      joinPill.textContent = 'Copied!';
      setTimeout(() => { joinPill.textContent = orig; }, 2000);
    });
  }

  const muteBtn = document.getElementById('bj-mute-btn');
  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      const wasMuted = localStorage.getItem('gc_mute') === '1';
      localStorage.setItem('gc_mute', wasMuted ? '0' : '1');
      muteBtn.textContent = wasMuted ? '\u{1F50A}' : '\u{1F507}';
    });
  }

  // Action bar — single delegated listener
  const actionBar = document.getElementById('bj-action-bar');
  if (actionBar) {
    actionBar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn || btn.disabled) return;
      const actionType = btn.dataset.action;
      socketRef.emit('game:action', {
        sessionId: socketRef.currentSessionId,
        action: { type: actionType },
      });
      // Disable all buttons until next update
      actionBar.querySelectorAll('button').forEach(b => b.disabled = true);
    });
  }

  // Chip tray — single delegated listener
  const chipTray = document.getElementById('bj-chip-tray');
  if (chipTray) {
    chipTray.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-chip-value]');
      if (chip) {
        const val = parseInt(chip.dataset.chipValue, 10);
        const me = currentGameState?.players?.find(p => p.id === myPlayerId);
        if (me && betAmount + val <= (me.chips || 0)) {
          betAmount += val;
          betChips.push(val);
          sfx.chip();
          updateChipTrayDisplay();
        }
        return;
      }
      const betBtn = e.target.closest('#bj-bet-btn');
      if (betBtn && betAmount > 0) {
        socketRef.emit('game:action', {
          sessionId: socketRef.currentSessionId,
          action: { type: 'place_bet', amount: betAmount },
        });
        betBtn.disabled = true;
        return;
      }
      const clearBtn = e.target.closest('#bj-clear-bet');
      if (clearBtn) {
        betAmount = 0;
        betChips = [];
        updateChipTrayDisplay();
      }
    });
  }
}

// ── Sync dealer hand ────────────────────────────────────────────────────────
function syncDealerHand(state, prev) {
  const container = document.getElementById('bj-dealer-hand');
  const totalEl = document.getElementById('bj-dealer-total');
  if (!container) return;

  const dealerCards = state.dealerHand || [];
  const prevCards = prev?.dealerHand || [];

  // Rebuild if card count changed
  if (dealerCards.length !== container.children.length) {
    container.innerHTML = '';
    dealerCards.forEach((card, i) => {
      const cardEl = createCardEl(card, i);
      if (i >= prevCards.length) {
        sfx.deal();
        dealCard(cardEl, container, i);
      } else {
        container.appendChild(cardEl);
      }
    });
  } else {
    // Update existing cards (e.g., hole card reveal)
    dealerCards.forEach((card, i) => {
      const existing = container.children[i];
      if (!existing) return;
      const inner = existing.querySelector('.bj-card-inner');
      if (!inner) return;
      const wasFacedown = inner.classList.contains('is-facedown');
      const shouldBeFacedown = !!card.hole;
      if (wasFacedown && !shouldBeFacedown) {
        // Reveal card — update front face and flip
        const front = existing.querySelector('.bj-card-front');
        if (front) {
          const isRed = card.suit === '\u2665' || card.suit === '\u2666';
          existing.className = `bj-card ${isRed ? 'bj-red' : 'bj-black'}`;
          existing.dataset.rank = card.rank;
          existing.dataset.suit = card.suit;
          front.innerHTML = '';
          const isFace = ['J', 'Q', 'K'].includes(card.rank);
          if (isFace) {
            const gradColor = card.rank === 'J' ? '#1a3a8f' : (card.rank === 'Q' ? '#8f1a1a' : '#4a1a8f');
            front.style.background = `linear-gradient(135deg, #fafaf8 40%, ${gradColor}22 100%)`;
          } else {
            front.style.background = '#fafaf8';
          }
          const rankTL = document.createElement('div');
          rankTL.className = 'bj-rank-tl';
          rankTL.textContent = card.rank + '\n' + card.suit;
          front.appendChild(rankTL);
          const suitCenter = document.createElement('div');
          suitCenter.className = 'bj-suit-center';
          suitCenter.textContent = card.suit;
          if (card.rank === 'A') {
            suitCenter.style.fontSize = 'clamp(26px,3.8vw,44px)';
            suitCenter.style.opacity = '0.5';
          }
          front.appendChild(suitCenter);
          const rankBR = document.createElement('div');
          rankBR.className = 'bj-rank-br';
          rankBR.textContent = card.rank + '\n' + card.suit;
          front.appendChild(rankBR);
        }
        inner.classList.remove('is-facedown');
      }
    });
  }

  // Dealer total
  if (totalEl && dealerCards.length > 0) {
    totalEl.style.display = 'block';
    const total = formatTotal(dealerCards);
    totalEl.textContent = total;
  } else if (totalEl) {
    totalEl.style.display = 'none';
  }
}

// ── Sync player seat ────────────────────────────────────────────────────────
function syncSeat(player, prev) {
  const seatEl = document.querySelector(`.bj-seat[data-player-id="${player.id}"]`);
  if (!seatEl) return;

  const prevPlayer = prev?.players?.find(p => p.id === player.id);
  const isLocal = player.id === myPlayerId;
  const isActive = currentGameState.currentPlayerId === player.id && !player.result;

  // Active glow
  if (isActive) {
    seatEl.classList.add('bj-active');
  } else {
    seatEl.classList.remove('bj-active');
  }

  // Cards
  const handContainer = seatEl.querySelector('.bj-seat-hand');
  if (handContainer) {
    const cards = player.hand || [];
    const prevCards = prevPlayer?.hand || [];
    if (cards.length !== handContainer.querySelectorAll('.bj-card').length) {
      handContainer.innerHTML = '';
      cards.forEach((card, i) => {
        const cardEl = createCardEl(card, i);
        if (i >= prevCards.length) {
          sfx.deal();
          dealCard(cardEl, handContainer, i);
        } else {
          handContainer.appendChild(cardEl);
        }
      });
    }
  }

  // Total
  const totalEl = seatEl.querySelector('.bj-seat-total');
  if (totalEl) {
    const cards = player.hand || [];
    if (cards.length > 0) {
      const val = handValue(cards);
      const soft = isSoftHand(cards) && val <= 21;
      totalEl.textContent = val > 21 ? 'BUST' : (soft ? 'soft ' + val : String(val));
      totalEl.style.display = 'block';
      totalEl.style.color = val > 21 ? '#ff6666' : '#aaffaa';
    } else {
      totalEl.style.display = 'none';
    }
  }

  // Info row (chips + bet)
  const infoEl = seatEl.querySelector('.bj-seat-info');
  if (infoEl) {
    const betStr = player.bet > 0 ? `  \u00B7  Bet: ${player.bet}` : '';
    infoEl.textContent = `\u{1FA99} ${player.chips ?? 0}${betStr}`;
  }

  // Chip change float
  if (prevPlayer && player.chips !== prevPlayer.chips && player.result) {
    const diff = player.chips - prevPlayer.chips + (player.bet || 0);
    if (diff !== 0) floatChipChange(seatEl, diff);
  }
}

// ── Build all seats ─────────────────────────────────────────────────────────
function buildSeats(state) {
  const seatsContainer = document.getElementById('bj-seats');
  const table = document.getElementById('bj-table');
  if (!seatsContainer || !table) return;

  seatsContainer.innerHTML = '';
  seatOrder = buildSeatOrder(state.players || []);

  const tableW = table.offsetWidth;
  const tableH = table.offsetHeight;

  seatOrder.forEach((player, index) => {
    const pos = getSeatPosition(index, seatOrder.length, tableW, tableH);
    const isLocal = player.id === myPlayerId;
    const isActive = state.currentPlayerId === player.id && !player.result;

    const seat = document.createElement('div');
    seat.className = 'bj-seat' + (isActive ? ' bj-active' : '');
    seat.dataset.playerId = player.id;
    seat.style.cssText = `position:absolute;left:${pos.x}px;top:${pos.y}px;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:3px;pointer-events:auto;z-index:10;min-width:80px;`;

    // YOU badge
    if (isLocal) {
      const youBadge = document.createElement('div');
      youBadge.style.cssText = 'background:#ffd700;color:#000;font-size:9px;font-weight:bold;padding:1px 8px;border-radius:8px;letter-spacing:1px;';
      youBadge.textContent = '\u25B6 YOU \u25C0';
      seat.appendChild(youBadge);
    }

    // Name pill
    const name = document.createElement('div');
    const displayName = player.is_bot ? ('\u{1F916} ' + (player.displayName || player.display_name || 'Bot')) : (player.displayName || player.display_name || 'Player');
    name.style.cssText = `background:rgba(0,0,0,0.7);color:${isLocal ? '#ffd700' : '#fff'};font-size:10px;padding:2px 8px;border-radius:8px;font-weight:bold;white-space:nowrap;max-width:110px;overflow:hidden;text-overflow:ellipsis;${isLocal ? 'border:1px solid #ffd700;' : ''}`;
    name.textContent = displayName;
    seat.appendChild(name);

    // Hand container
    const handContainer = document.createElement('div');
    handContainer.className = 'bj-seat-hand';
    handContainer.style.cssText = 'display:flex;position:relative;height:clamp(59px,8.4vw,87px);min-width:clamp(42px,6vw,62px);';
    const cards = player.hand || [];
    cards.forEach((card, i) => {
      const cardEl = createCardEl(card, i);
      handContainer.appendChild(cardEl);
    });
    // Update min-width based on card count
    if (cards.length > 1) {
      handContainer.style.minWidth = `calc(clamp(42px,6vw,62px) + ${(cards.length - 1) * 20}px)`;
    }
    seat.appendChild(handContainer);

    // Hand total
    const total = document.createElement('div');
    total.className = 'bj-seat-total';
    const val = handValue(cards);
    if (cards.length > 0 && val > 0) {
      const soft = isSoftHand(cards) && val <= 21;
      total.textContent = val > 21 ? 'BUST' : (soft ? 'soft ' + val : String(val));
      total.style.cssText = `background:rgba(0,0,0,0.7);color:${val > 21 ? '#ff6666' : '#aaffaa'};font-size:11px;padding:1px 6px;border-radius:6px;font-weight:bold;`;
    } else {
      total.style.display = 'none';
    }
    seat.appendChild(total);

    // Info row
    const info = document.createElement('div');
    info.className = 'bj-seat-info';
    const betStr = player.bet > 0 ? `  \u00B7  Bet: ${player.bet}` : '';
    info.textContent = `\u{1FA99} ${player.chips ?? 0}${betStr}`;
    info.style.cssText = 'color:rgba(255,255,255,0.5);font-size:9px;white-space:nowrap;';
    seat.appendChild(info);

    // Bet circle (pulsing when awaiting bet)
    if (state.phase === 'betting' && !player.bet) {
      const betCircle = document.createElement('div');
      betCircle.className = 'bj-bet-circle';
      betCircle.style.cssText = 'width:40px;height:40px;border-radius:50%;border:2px solid #ffd700;animation:bj-pulse 1.5s ease-in-out infinite;margin-top:2px;';
      seat.appendChild(betCircle);
    }

    seatsContainer.appendChild(seat);
  });
}

// ── Action buttons ──────────────────────────────────────────────────────────
function updateActionButtons() {
  const bar = document.getElementById('bj-action-bar');
  if (!bar || !currentGameState) return;

  const state = currentGameState;
  const me = state.players?.find(p => p.id === myPlayerId);
  const isMyTurn = state.currentPlayerId === myPlayerId && me && me.status === 'playing';

  if (!isMyTurn || state.phase !== 'playing') {
    bar.classList.add('bj-hidden');
    bar.innerHTML = '';
    return;
  }

  const canDouble = me.hand?.length === 2 && (me.chips >= me.bet);
  const canSplit = me.hand?.length === 2 && me.hand[0]?.rank === me.hand[1]?.rank && (me.chips >= me.bet);

  bar.innerHTML = `
    <button data-action="hit" style="background:#1a7a1a;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-weight:bold;font-family:inherit;font-size:14px;cursor:pointer;">HIT</button>
    <button data-action="stand" style="background:#7a1a1a;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-weight:bold;font-family:inherit;font-size:14px;cursor:pointer;">STAND</button>
    ${canDouble ? '<button data-action="double" style="background:#1a3a7a;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-weight:bold;font-family:inherit;font-size:14px;cursor:pointer;">DOUBLE</button>' : ''}
    ${canSplit ? '<button data-action="split" style="background:#5a1a7a;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-weight:bold;font-family:inherit;font-size:14px;cursor:pointer;">SPLIT</button>' : ''}
  `;
  bar.classList.remove('bj-hidden');
}

// ── Show results overlays ───────────────────────────────────────────────────
function showResults(state) {
  const players = state.players || [];
  players.forEach(p => {
    if (!p.result) return;
    const seatEl = document.querySelector(`.bj-seat[data-player-id="${p.id}"]`);
    if (!seatEl || seatEl.querySelector('.bj-result-overlay')) return;

    let bg, color, text, extra = '';
    switch (p.result) {
      case 'win':
        bg = 'rgba(0,100,0,0.8)'; color = '#aaffaa'; text = 'WIN';
        sfx.win();
        break;
      case 'blackjack':
        bg = 'rgba(120,90,0,0.85)'; color = '#ffd700'; text = 'BLACKJACK';
        extra = 'animation:bj-bj-pulse 0.4s ease 3;';
        sfx.bj();
        break;
      case 'bust':
        bg = 'rgba(120,0,0,0.8)'; color = '#ffaaaa'; text = 'BUST';
        sfx.bust();
        break;
      case 'push':
        bg = 'rgba(70,70,70,0.8)'; color = '#dddddd'; text = 'PUSH';
        break;
      case 'lose':
        bg = 'rgba(80,0,0,0.75)'; color = '#ff8888'; text = 'LOSE';
        break;
      default:
        return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'bj-result-overlay';
    overlay.style.cssText = `background:${bg};color:${color};font-size:14px;${extra}`;
    overlay.textContent = text;
    seatEl.appendChild(overlay);
  });
}

// ── Chip tray (betting phase) ───────────────────────────────────────────────
const CHIP_DENOMS = [
  { value: 1,    color: '#e0e0e0', label: '1' },
  { value: 5,    color: '#cc3333', label: '5' },
  { value: 25,   color: '#33aa33', label: '25' },
  { value: 100,  color: '#333333', label: '100' },
  { value: 500,  color: '#6633aa', label: '500' },
  { value: 1000, color: '#cc9900', label: '1K' },
];

function showChipTray(state) {
  const tray = document.getElementById('bj-chip-tray');
  if (!tray) return;

  const me = state.players?.find(p => p.id === myPlayerId);
  if (!me) return;

  betAmount = 0;
  betChips = [];

  tray.innerHTML = `
    <div id="bj-tray-chips" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
      ${CHIP_DENOMS.map(d => `
        <div class="bj-chip" data-chip-value="${d.value}" style="width:48px;height:48px;border-radius:50%;background:${d.color};border:3px solid rgba(255,255,255,0.3);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:bold;font-size:11px;cursor:pointer;transition:transform 0.15s ease;box-shadow:0 2px 8px rgba(0,0,0,0.4);user-select:none;">${d.label}</div>
      `).join('')}
    </div>
    <div style="display:flex;align-items:center;gap:12px;margin-top:4px;">
      <span id="bj-bet-display" style="color:#ffd700;font-weight:bold;font-size:14px;">Bet: 0</span>
      <button id="bj-clear-bet" style="background:none;border:1px solid #666;color:#aaa;padding:4px 10px;border-radius:6px;font-size:10px;cursor:pointer;font-family:inherit;">Clear</button>
    </div>
    <button id="bj-bet-btn" style="background:#ffd700;color:#000;border:none;padding:8px 32px;border-radius:8px;font-weight:bold;font-size:13px;cursor:pointer;font-family:inherit;margin-top:2px;" disabled>PLACE BET</button>
    <div id="bj-bet-timer" style="width:200px;height:4px;background:#333;border-radius:2px;overflow:hidden;margin-top:4px;">
      <div id="bj-bet-timer-bar" style="width:100%;height:100%;background:#ffd700;transition:width 0.1s linear;"></div>
    </div>
  `;
  tray.classList.remove('bj-hidden');

  // Start timer
  const TIMER_DURATION = 20;
  let timeLeft = TIMER_DURATION;
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft -= 0.1;
    const bar = document.getElementById('bj-bet-timer-bar');
    if (bar) bar.style.width = Math.max(0, (timeLeft / TIMER_DURATION) * 100) + '%';
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      socketRef.emit('game:action', {
        sessionId: socketRef.currentSessionId,
        action: { type: 'sit_out' },
      });
    }
  }, 100);
}

function hideChipTray() {
  const tray = document.getElementById('bj-chip-tray');
  if (tray) tray.classList.add('bj-hidden');
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

function updateChipTrayDisplay() {
  const display = document.getElementById('bj-bet-display');
  const betBtn = document.getElementById('bj-bet-btn');
  if (display) display.textContent = `Bet: ${betAmount}`;
  if (betBtn) betBtn.disabled = betAmount <= 0;
}

// ── Scoreboard ──────────────────────────────────────────────────────────────
function updateScoreboard(state) {
  const board = document.getElementById('bj-scoreboard');
  if (!board) return;

  const players = state.players || [];
  let html = `
    <div style="color:#ffd700;font-size:9px;font-weight:bold;letter-spacing:2px;text-align:center;margin-bottom:6px;">SESSION</div>
    <div style="color:#aaa;font-size:9px;text-align:center;margin-bottom:8px;">Round ${state.round || 1}</div>
  `;

  players.forEach(p => {
    const name = p.displayName || p.display_name || 'Player';
    const isLocal = p.id === myPlayerId;
    const wins = p.wins || 0;
    const losses = p.losses || 0;
    html += `
      <div class="bj-scoreboard-row" data-sb-player="${p.id}" style="display:flex;justify-content:space-between;align-items:center;padding:3px 4px;border-radius:4px;margin-bottom:2px;${isLocal ? 'background:rgba(255,215,0,0.1);' : ''}">
        <span style="color:${isLocal ? '#ffd700' : '#ccc'};font-size:9px;max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(name)}</span>
        <span style="color:#aaa;font-size:9px;">\u{1FA99}${p.chips ?? 0}</span>
      </div>
    `;
  });

  board.innerHTML = html;
}

// ── HUD update ──────────────────────────────────────────────────────────────
function updateHUD(state) {
  const roundLabel = document.getElementById('bj-round-label');
  if (roundLabel) roundLabel.textContent = `Round ${state.round || 1}`;
}

// ── handleNewHand ───────────────────────────────────────────────────────────
function handleNewHand(state) {
  sfx.shuffle();

  // Animate existing cards out
  const allCards = document.querySelectorAll('.bj-card');
  allCards.forEach(c => {
    c.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
    c.style.transform = 'scale(0)';
    c.style.opacity = '0';
  });

  setTimeout(() => {
    // Remove all cards, results, bet stacks
    document.querySelectorAll('.bj-card, .bj-result-overlay, .bj-table-betstack').forEach(el => el.remove());
    betChips = [];
    betAmount = 0;

    // Rebuild seats with new hand data
    buildSeats(state);
    syncDealerHand(state, null);
    updateScoreboard(state);
    updateHUD(state);
    updateActionButtons();

    if (state.phase === 'betting') {
      showChipTray(state);
    } else {
      hideChipTray();
    }
  }, 280);
}

// ── resetAndShowChipTray ────────────────────────────────────────────────────
function resetAndShowChipTray(state) {
  const me = state.players?.find(p => p.id === myPlayerId);
  if (!me || me.bet > 0) return;
  showChipTray(state);
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════════════════════

export function render(container, gameState, socket, playerId, hostPlayerId) {
  myPlayerId = playerId;
  socketRef = socket;
  currentGameState = gameState;
  lastHandNumber = gameState.round || 0;

  buildDOM(container, gameState);
  buildSeats(gameState);
  syncDealerHand(gameState, null);
  updateScoreboard(gameState);
  updateActionButtons();

  // No betting phase in current module — auto-deducts minBet
  // But support it in case module adds it
  if (gameState.phase === 'betting') {
    showChipTray(gameState);
  }

  // ResizeObserver for seat repositioning
  const table = document.getElementById('bj-table');
  if (table) {
    roRef = new ResizeObserver(() => {
      const t = document.getElementById('bj-table');
      if (!t) return;
      const w = t.offsetWidth;
      const h = t.offsetHeight;
      document.querySelectorAll('.bj-seat').forEach((seatEl, i) => {
        const pos = getSeatPosition(i, seatOrder.length, w, h);
        seatEl.style.left = pos.x + 'px';
        seatEl.style.top = pos.y + 'px';
      });
    });
    roRef.observe(table);
  }
}

export function update(gameState, playerId) {
  myPlayerId = playerId;
  const prev = currentGameState;
  currentGameState = gameState;

  // New hand detected
  if (gameState.round !== prev?.round) {
    lastHandNumber = gameState.round;
    handleNewHand(gameState);
    return;
  }

  syncDealerHand(gameState, prev);
  (gameState.players || []).forEach(p => syncSeat(p, prev));
  updateActionButtons();
  if (gameState.phase === 'results') showResults(gameState);
  if (gameState.phase === 'betting' && prev?.phase !== 'betting') resetAndShowChipTray(gameState);
  if (gameState.phase !== 'betting') hideChipTray();
  updateScoreboard(gameState);
  updateHUD(gameState);
}

export function destroy() {
  if (roRef) { roRef.disconnect(); roRef = null; }
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null; }
  if (styleTag) { styleTag.remove(); styleTag = null; }
  const root = document.getElementById('bj-root');
  if (root) root.remove();
  currentGameState = null;
  myPlayerId = null;
  socketRef = null;
  seatOrder = [];
  lastHandNumber = 0;
  betChips = [];
  betAmount = 0;
}
