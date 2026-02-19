// Blackjack renderer — CSS felt table, arc seats, animations, Web Audio

// ── Module-level state (persists across update() calls) ───────────────────────
let _socket = null;
let _container = null;
let _myId = null;
let _hostId = null;
let _prevChips = {};
let _prevDealerHidden = true;
let _prevDealerLen = 0;
let _prevHandLens = {};
let _prevSplitLens = {};
let _prevPhase = null;
let _countdownTimer = null;
let _intermissionEffectDone = false;

// ── Seat arc positions (% of table width / height) ────────────────────────────
const SEAT_ARCS = {
  1: [[50, 78]],
  2: [[27, 73], [73, 73]],
  3: [[14, 67], [50, 81], [86, 67]],
  4: [[10, 59], [35, 76], [65, 76], [90, 59]],
  5: [[8, 54], [26, 71], [50, 81], [74, 71], [92, 54]],
  6: [[8, 49], [23, 66], [40, 78], [60, 78], [77, 66], [92, 49]],
};

// ── Audio ─────────────────────────────────────────────────────────────────────
let _audioCtx = null;
function getCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}
function muted() { return localStorage.getItem('bj-muted') === '1'; }
function tone(freq, dur, vol, type) {
  vol = vol || 0.08;
  type = type || 'sine';
  if (muted()) return;
  try {
    const ctx = getCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + dur + 0.01);
  } catch (_e) { /* silent fail */ }
}
function sfxCard()  { tone(820, 0.07, 0.07); }
function sfxChip()  { tone(620, 0.09, 0.06); }
function sfxWin()   { tone(523, 0.15, 0.09); setTimeout(function() { tone(659, 0.2, 0.09); }, 150); }
function sfxBust()  { tone(380, 0.15, 0.09); setTimeout(function() { tone(280, 0.25, 0.07); }, 150); }

// ── Public API ────────────────────────────────────────────────────────────────
export function render(container, gameState, socket, playerId, hostPlayerId) {
  _socket = socket;
  _container = container;
  _myId = playerId;
  _hostId = hostPlayerId;
  _prevChips = {};
  _prevDealerHidden = true;
  _prevDealerLen = 0;
  _prevHandLens = {};
  _prevSplitLens = {};
  _prevPhase = null;
  _intermissionEffectDone = false;
  if (_countdownTimer) { clearInterval(_countdownTimer); _countdownTimer = null; }

  container.innerHTML = `
    <div class="bj-layout">
      <div class="bj-table-wrap">
        <div class="bj-table" id="bj-table">
          <div class="bj-dealer-zone" id="bj-dealer-zone">
            <div class="bj-label">Dealer</div>
            <div class="bj-cards" id="bj-dealer-cards"></div>
            <div class="bj-total" id="bj-dealer-total"></div>
          </div>
          <div class="bj-deck-icon" id="bj-deck-icon">DECK</div>
          <div id="bj-seats"></div>
          <div class="bj-action-panel" id="bj-action-panel" style="display:none">
            <div class="bj-action-btns" id="bj-action-btns"></div>
            <div class="bj-betting-ui" id="bj-betting-ui" style="display:none"></div>
          </div>
        </div>
      </div>
      <div class="bj-scoreboard" id="bj-scoreboard">
        <h3>Session</h3>
        <div class="bj-hand-num" id="bj-hand-num"></div>
        <div id="bj-score-rows"></div>
        <button class="btn btn-secondary btn-sm bj-mute-btn" id="bj-mute-btn">${muted() ? '🔇 Unmute' : '🔊 Mute'}</button>
      </div>
    </div>`;

  // Mute toggle
  container.querySelector('#bj-mute-btn').addEventListener('click', function() {
    var nowMuted = !muted();
    localStorage.setItem('bj-muted', nowMuted ? '1' : '0');
    container.querySelector('#bj-mute-btn').textContent = nowMuted ? '🔇 Unmute' : '🔊 Mute';
    if (!nowMuted && _audioCtx) _audioCtx.resume();
  });

  updateView(gameState, playerId, hostPlayerId, container, true);
}

export function update(gameState, playerId, hostPlayerId) {
  _myId = playerId;
  _hostId = hostPlayerId;
  if (_container) updateView(gameState, playerId, hostPlayerId, _container, false);
}

export function destroy() {
  if (_countdownTimer) clearInterval(_countdownTimer);
  _countdownTimer = null;
  _container = null;
}

// ── Core update ───────────────────────────────────────────────────────────────
function updateView(state, myId, hostId, container, initial) {
  if (!state) return;

  var table = container.querySelector('#bj-table');

  // ── Dealer cards ──────────────────────────────────────────────────────────
  var dealerCardsEl = container.querySelector('#bj-dealer-cards');
  var dealerHand = state.dealerHand || [];
  var dealerLen = dealerHand.length;
  var isNewFlip = _prevDealerHidden && !state.dealerHidden && !initial;

  if (initial) {
    renderCards(dealerCardsEl, dealerHand, dealerLen, true);
  } else if (dealerLen > _prevDealerLen) {
    var newDealerCards = dealerLen - _prevDealerLen;
    renderCards(dealerCardsEl, dealerHand, newDealerCards, false);
    sfxCard();
  } else if (isNewFlip) {
    var cards = dealerCardsEl.querySelectorAll('.playing-card');
    if (cards[1]) {
      var newCardHtml = cardHtml(dealerHand[1]);
      var tmp = document.createElement('div');
      tmp.innerHTML = newCardHtml;
      var newCard = tmp.firstChild;
      newCard.classList.add('bj-flipping');
      cards[1].replaceWith(newCard);
      setTimeout(function() { newCard.classList.remove('bj-flipping'); }, 400);
    }
  }

  var dealerTotalEl = container.querySelector('#bj-dealer-total');
  if (dealerTotalEl) {
    var dt = state.dealerHidden ? '?' : handTotal(dealerHand);
    dealerTotalEl.textContent = 'Total: ' + dt;
  }

  var deckEl = container.querySelector('#bj-deck-icon');
  if (deckEl) deckEl.textContent = (state.deckSize != null ? state.deckSize : '?') + '\nCards';

  // ── Player seats ──────────────────────────────────────────────────────────
  var seatsEl = container.querySelector('#bj-seats');
  var players = state.players || [];
  var numPlayers = Math.min(players.length, 6);
  var positions = SEAT_ARCS[numPlayers] || SEAT_ARCS[1];

  players.forEach(function(player, idx) {
    var pos = positions[idx] || [50, 78];
    var px = pos[0], py = pos[1];
    var pid = player.id;
    var isMe = pid === myId;
    var isCurrent = state.currentPlayerId === pid;
    var isSittingOut = (state.sittingOut || []).indexOf(pid) !== -1;
    var hand = (state.playerHands && state.playerHands[pid]) || [];
    var splitHand = state.splitHands && state.splitHands[pid];
    var handLen = hand.length;
    var splitLen = splitHand ? splitHand.length : 0;
    var status = (state.playerStatus && state.playerStatus[pid]) || '';
    var splitStatus = (state.splitStatus && state.splitStatus[pid]) || '';
    var chips = state.chips && state.chips[pid];
    var bet = state.bets && state.bets[pid];
    var splitBet = state.splitBets && state.splitBets[pid];

    var seatEl = seatsEl.querySelector('[data-pid="' + pid + '"]');
    if (!seatEl) {
      seatEl = document.createElement('div');
      seatEl.dataset.pid = pid;
      seatEl.style.left = px + '%';
      seatEl.style.top = py + '%';
      seatsEl.appendChild(seatEl);
    }

    var cls = 'bj-seat';
    if (isMe) cls += ' my-seat';
    if (isCurrent) cls += ' active-seat';
    if (isSittingOut) cls += ' sitting-out';
    seatEl.className = cls;

    var prevLen = _prevHandLens[pid] != null ? _prevHandLens[pid] : 0;
    var prevSplitLen = _prevSplitLens[pid] != null ? _prevSplitLens[pid] : 0;

    if (!initial && handLen > prevLen) sfxCard();
    if (!initial && splitLen > prevSplitLen) setTimeout(sfxCard, 150);

    var total = handTotal(hand);
    var totalColor = total > 21 ? '#f87171' : total === 21 ? '#4ade80' : 'rgba(255,255,255,0.92)';

    var resultForThis = null;
    var splitResultForThis = null;
    if (state.lastHandResults) {
      for (var ri = 0; ri < state.lastHandResults.length; ri++) {
        var r = state.lastHandResults[ri];
        if (r.playerId === pid && r.hand === 'main') resultForThis = r;
        if (r.playerId === pid && r.hand === 'split') splitResultForThis = r;
      }
    }

    var mainHandCls = '';
    if (resultForThis) {
      if (resultForThis.result === 'win') mainHandCls = ' bj-hand-win';
      else if (resultForThis.result === 'loss' && status === 'bust') mainHandCls = ' bj-hand-bust';
    }
    var splitHandCls = '';
    if (splitResultForThis) {
      if (splitResultForThis.result === 'win') splitHandCls = ' bj-hand-win';
      else if (splitResultForThis.result === 'loss' && splitStatus === 'bust') splitHandCls = ' bj-hand-bust';
    }

    var mainCardsHtml = hand.map(function(c, i) {
      return cardHtml(c, !initial && i >= prevLen, (i - prevLen) * 150);
    }).join('');

    var splitSection = '';
    if (splitHand) {
      var splitCardsHtml = splitHand.map(function(c, i) {
        return cardHtml(c, !initial && i >= prevSplitLen, (i - prevSplitLen) * 150);
      }).join('');
      var splitTotal = handTotal(splitHand);
      splitSection = '<div style="font-size:0.65rem;color:rgba(255,255,255,0.5);margin-top:2px">Split</div>'
        + '<div class="bj-cards' + splitHandCls + '">' + splitCardsHtml + '</div>'
        + '<div class="bj-seat-total">' + statusText(splitStatus, splitTotal) + '</div>';
    }

    var chipsHtml = (state.enableChips && chips != null)
      ? '<div class="bj-chips">\uD83D\uDCB0 ' + chips + '</div>'
      : '';
    var betHtml = (state.enableChips && bet != null)
      ? '<div class="bj-bet">Bet: ' + bet + (splitBet != null ? ' / ' + splitBet : '') + '</div>'
      : '';

    seatEl.innerHTML = '<div class="bj-seat-name">' + escHtml(player.displayName || pid) + '</div>'
      + '<div class="bj-cards' + mainHandCls + '">' + mainCardsHtml + '</div>'
      + '<div class="bj-seat-total" style="color:' + totalColor + '">'
      + (hand.length ? statusText(status, total) : '') + '</div>'
      + splitSection
      + chipsHtml + betHtml;
  });

  // Update prev-state tracking
  _prevDealerLen = dealerLen;
  _prevDealerHidden = !!state.dealerHidden;
  players.forEach(function(p) {
    _prevHandLens[p.id] = ((state.playerHands && state.playerHands[p.id]) || []).length;
    _prevSplitLens[p.id] = ((state.splitHands && state.splitHands[p.id]) || []).length;
  });

  // ── Chip delta animations ─────────────────────────────────────────────────
  if (state.enableChips && state.chips) {
    Object.keys(state.chips).forEach(function(pid) {
      var chips = state.chips[pid];
      var prev = _prevChips[pid];
      if (prev != null && chips !== prev) {
        var delta = chips - prev;
        var seatEl = container.querySelector('[data-pid="' + pid + '"]');
        if (seatEl) {
          sfxChip();
          var el = document.createElement('div');
          el.className = 'bj-chip-delta ' + (delta > 0 ? 'pos' : 'neg');
          el.textContent = (delta > 0 ? '+' : '') + delta;
          seatEl.style.position = 'relative';
          seatEl.appendChild(el);
          setTimeout(function() { el.remove(); }, 1200);
        }
      }
    });
    _prevChips = Object.assign({}, state.chips);
  }

  // ── Win/bust audio on intermission start ──────────────────────────────────
  if (state.phase === 'intermission' && _prevPhase !== 'intermission' && !_intermissionEffectDone) {
    _intermissionEffectDone = true;
    var myResult = null;
    if (state.lastHandResults) {
      for (var ri2 = 0; ri2 < state.lastHandResults.length; ri2++) {
        var lr = state.lastHandResults[ri2];
        if (lr.playerId === myId && lr.hand === 'main') { myResult = lr; break; }
      }
    }
    if (myResult && myResult.result === 'win') setTimeout(sfxWin, 200);
    else if (myResult && myResult.result === 'loss') setTimeout(sfxBust, 200);
  }
  if (state.phase !== 'intermission') _intermissionEffectDone = false;

  _prevPhase = state.phase;

  // ── Scoreboard ────────────────────────────────────────────────────────────
  var scoreRowsEl = container.querySelector('#bj-score-rows');
  var handNumEl = container.querySelector('#bj-hand-num');
  if (handNumEl) handNumEl.textContent = 'Hand #' + (state.handNumber || 1);
  if (scoreRowsEl && state.sessionScores) {
    scoreRowsEl.innerHTML = players.map(function(p) {
      var sc = state.sessionScores[p.id] || { wins: 0, losses: 0, pushes: 0 };
      var chipStr = (state.enableChips && state.chips)
        ? ' \uD83D\uDCB0' + (state.chips[p.id] != null ? state.chips[p.id] : state.startingChips)
        : '';
      return '<div class="bj-score-row">'
        + '<span class="bj-score-name" title="' + escHtml(p.displayName) + '">' + escHtml(p.displayName || p.id) + '</span>'
        + '<span class="bj-score-val">' + sc.wins + 'W/' + sc.losses + 'L' + chipStr + '</span>'
        + '</div>';
    }).join('');
  }

  // ── Action panel ──────────────────────────────────────────────────────────
  var actionPanel = container.querySelector('#bj-action-panel');
  var actionBtns = container.querySelector('#bj-action-btns');
  var bettingUi = container.querySelector('#bj-betting-ui');
  var existingOverlay = table.querySelector('.bj-intermission-overlay');

  if (state.phase === 'intermission') {
    actionPanel.style.display = 'none';
    if (!existingOverlay) {
      buildIntermissionOverlay(table, state, myId, hostId);
      startCountdown(table, state.intermissionEndsAt);
    } else {
      // Update sit-out button state
      var sitBtn = existingOverlay.querySelector('[data-action="sit-out"]');
      if (sitBtn) {
        var nowSitting = (state.sittingOut || []).indexOf(myId) !== -1;
        sitBtn.dataset.sitting = nowSitting ? '1' : '0';
        sitBtn.textContent = nowSitting ? '\u25BA Sit In' : '\uD83D\uDCA4 Sit Out';
      }
    }
  } else {
    if (existingOverlay) {
      existingOverlay.remove();
      if (_countdownTimer) { clearInterval(_countdownTimer); _countdownTimer = null; }
    }

    if (state.phase === 'betting' && myId && (state.bets == null || state.bets[myId] === undefined)) {
      actionPanel.style.display = '';
      actionBtns.style.display = 'none';
      bettingUi.style.display = '';
      buildBettingUi(bettingUi, state, myId, container);
    } else if (state.phase === 'playing' && state.currentPlayerId === myId) {
      actionPanel.style.display = '';
      actionBtns.style.display = '';
      bettingUi.style.display = 'none';
      buildActionBtns(actionBtns, state, myId);
    } else {
      actionPanel.style.display = 'none';
    }
  }
}

// ── Intermission overlay ──────────────────────────────────────────────────────
function buildIntermissionOverlay(table, state, myId, hostId) {
  var isSittingOut = (state.sittingOut || []).indexOf(myId) !== -1;

  var resultRows = '';
  if (state.lastHandResults) {
    state.lastHandResults.forEach(function(r) {
      var player = null;
      for (var i = 0; i < state.players.length; i++) {
        if (state.players[i].id === r.playerId) { player = state.players[i]; break; }
      }
      var name = escHtml(player ? player.displayName : r.playerId);
      var handLabel = r.hand === 'split' ? ' (split)' : '';
      var bet = state.bets && state.bets[r.playerId];
      var chipChange = (state.enableChips && bet != null)
        ? ' ' + (r.result === 'win' ? '+' : r.result === 'push' ? '\u00B1' : '-') + bet
        : '';
      resultRows += '<div class="bj-result-row ' + r.result + '">'
        + name + handLabel + ': ' + r.result.toUpperCase() + chipChange + '</div>';
    });
  }

  var endGameBtn = (myId === hostId)
    ? '<button class="btn btn-danger" data-action="end-game">End Game</button>'
    : '';

  var overlay = document.createElement('div');
  overlay.className = 'bj-intermission-overlay';
  overlay.innerHTML = '<h2>Hand Over</h2>'
    + '<div class="bj-result-rows">' + (resultRows || '<div class="bj-result-row">\u2014</div>') + '</div>'
    + '<div class="bj-countdown" id="bj-countdown">5</div>'
    + '<div class="bj-overlay-btns">'
    + '<button class="btn btn-secondary" data-action="sit-out" data-sitting="' + (isSittingOut ? '1' : '0') + '">'
    + (isSittingOut ? '\u25BA Sit In' : '\uD83D\uDCA4 Sit Out') + '</button>'
    + endGameBtn
    + '</div>';

  overlay.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;
    var sessionId = _socket.currentSessionId;
    if (action === 'sit-out') {
      var isSitting = btn.dataset.sitting === '1';
      _socket.emit('game:action', { sessionId: sessionId, action: { type: isSitting ? 'sit_in' : 'sit_out' } });
    } else if (action === 'end-game') {
      _socket.emit('game:action', { sessionId: sessionId, action: { type: 'end_game' } });
    }
  });

  table.appendChild(overlay);
}

function startCountdown(table, endsAt) {
  if (_countdownTimer) clearInterval(_countdownTimer);
  function tick() {
    var el = table.querySelector('#bj-countdown');
    if (!el) { clearInterval(_countdownTimer); return; }
    var secs = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    el.textContent = secs;
    if (secs <= 0) clearInterval(_countdownTimer);
  }
  tick();
  _countdownTimer = setInterval(tick, 500);
}

// ── Action buttons ────────────────────────────────────────────────────────────
function buildActionBtns(el, state, myId) {
  var myHand = (state.playerHands && state.playerHands[myId]) || [];
  var isSplit = state.activeHand && state.activeHand[myId] === 'split';
  var currentHand = isSplit ? ((state.splitHands && state.splitHands[myId]) || []) : myHand;
  var chips = (state.chips && state.chips[myId] != null) ? state.chips[myId] : Infinity;
  var bet = isSplit
    ? (state.splitBets && state.splitBets[myId] != null ? state.splitBets[myId] : 0)
    : (state.bets && state.bets[myId] != null ? state.bets[myId] : 0);

  var canDouble = state.enableChips && currentHand.length === 2 && chips >= bet;
  var hasSplit = state.splitHands && state.splitHands[myId];
  var canSplit = state.enableChips && !hasSplit && myHand.length === 2
    && cardValue2(myHand[0]) === cardValue2(myHand[1])
    && chips >= (state.bets && state.bets[myId] != null ? state.bets[myId] : 0);

  el.innerHTML = '<button class="btn btn-primary" data-action="hit">Hit</button>'
    + '<button class="btn btn-secondary" data-action="stand">Stand</button>'
    + (canDouble ? '<button class="btn btn-secondary" data-action="double">2\u00D7</button>' : '')
    + (canSplit ? '<button class="btn btn-secondary" data-action="split">Split</button>' : '');

  el.addEventListener('click', function handler(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var act = btn.dataset.action;
    var sessionId = _socket.currentSessionId;
    if (act === 'hit')    _socket.emit('game:action', { sessionId: sessionId, action: { type: 'hit' } });
    if (act === 'stand')  _socket.emit('game:action', { sessionId: sessionId, action: { type: 'stand' } });
    if (act === 'double') _socket.emit('game:action', { sessionId: sessionId, action: { type: 'double_down' } });
    if (act === 'split')  _socket.emit('game:action', { sessionId: sessionId, action: { type: 'split' } });
    // Remove handler after one click to prevent double-fire; server will re-render
    el.removeEventListener('click', handler);
  });
}

// ── Betting UI ────────────────────────────────────────────────────────────────
function buildBettingUi(el, state, myId, container) {
  var chips = (state.chips && state.chips[myId] != null) ? state.chips[myId] : 0;
  var starting = state.startingChips || 1000;
  var minBet = 10;
  var presets = computePresets(starting, chips);
  var timeLeft = state.bettingEndsAt ? Math.max(0, Math.round((state.bettingEndsAt - Date.now()) / 1000)) : 15;

  el.innerHTML = '<div class="bj-bet-timer" id="bj-bet-timer">\u23F1 ' + timeLeft + 's \u2014 Chips: ' + chips + '</div>'
    + '<div class="bj-bet-presets">'
    + presets.map(function(a) {
      return '<button class="bj-bet-preset" data-action="bet-preset" data-amount="' + a + '">'
        + (a >= chips ? 'ALL IN' : a) + '</button>';
    }).join('')
    + '</div>'
    + '<div class="bj-bet-custom">'
    + '<input id="bj-bet-input" type="number" placeholder="Custom" min="' + minBet + '" max="' + chips + '" value="' + minBet + '">'
    + '<button class="btn btn-primary" data-action="bet" style="padding:4px 12px;font-size:0.82rem">Bet</button>'
    + '</div>';

  // Wire bet buttons
  el.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var act = btn.dataset.action;
    var sessionId = _socket.currentSessionId;
    if (act === 'bet-preset') {
      var amount = parseInt(btn.dataset.amount) || 0;
      _socket.emit('game:action', { sessionId: sessionId, action: { type: 'bet', amount: amount } });
    } else if (act === 'bet') {
      var input = el.querySelector('#bj-bet-input');
      var amt = parseInt(input ? input.value : 0) || 0;
      _socket.emit('game:action', { sessionId: sessionId, action: { type: 'bet', amount: amt } });
    }
  });

  // Countdown timer
  if (state.bettingEndsAt) {
    if (_countdownTimer) clearInterval(_countdownTimer);
    _countdownTimer = setInterval(function() {
      var timerEl = container ? container.querySelector('#bj-bet-timer') : null;
      if (!timerEl) { clearInterval(_countdownTimer); return; }
      var t = Math.max(0, Math.round((state.bettingEndsAt - Date.now()) / 1000));
      timerEl.textContent = '\u23F1 ' + t + 's \u2014 Chips: ' + chips;
      if (t <= 0) clearInterval(_countdownTimer);
    }, 500);
  }
}

function computePresets(starting, chips) {
  var raw = [
    Math.ceil(starting * 0.01),
    Math.ceil(starting * 0.025),
    Math.ceil(starting * 0.05),
    Math.ceil(starting * 0.10),
    Math.ceil(starting * 0.25),
    Math.ceil(starting * 0.50),
    chips,
  ];
  var seen = {};
  var result = [];
  raw.forEach(function(v) {
    v = Math.min(Math.max(10, v), chips);
    if (!seen[v]) { seen[v] = true; result.push(v); }
  });
  return result;
}

// ── Card rendering ────────────────────────────────────────────────────────────
function renderCards(el, cards, newCount, initial) {
  if (!el) return;
  if (initial) {
    el.innerHTML = (cards || []).map(function(c) { return cardHtml(c, false, 0); }).join('');
    return;
  }
  var existingCount = (cards || []).length - newCount;
  var newCards = (cards || []).slice(existingCount);
  newCards.forEach(function(c, i) {
    var tmp = document.createElement('div');
    tmp.innerHTML = cardHtml(c, true, i * 150);
    el.appendChild(tmp.firstChild);
  });
}

function cardHtml(card, animate, delayMs) {
  animate = animate || false;
  delayMs = delayMs || 0;
  if (!card) return '';
  var suit = card.suit || '';
  var rank = card.rank || '';
  var isRed = suit === '\u2665' || suit === '\u2666';
  var isFaceDown = rank === '?';
  var cls = 'playing-card ' + (isRed ? 'hearts' : 'spades') + (isFaceDown ? ' face-down' : '') + (animate ? ' bj-dealing' : '');
  var style = animate ? ' style="animation-delay:' + delayMs + 'ms"' : '';
  return '<div class="' + cls + '"' + style + '>'
    + '<div class="card-rank">' + escHtml(rank) + '</div>'
    + '<div class="card-suit">' + escHtml(suit) + '</div>'
    + '</div>';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function handTotal(hand) {
  if (!hand || hand.some(function(c) { return c.rank === '?'; })) return '?';
  var total = 0, aces = 0;
  for (var i = 0; i < hand.length; i++) {
    var c = hand[i];
    if (c.rank === 'J' || c.rank === 'Q' || c.rank === 'K') total += 10;
    else if (c.rank === 'A') { total += 11; aces++; }
    else total += parseInt(c.rank) || 0;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function cardValue2(card) {
  if (!card) return 0;
  if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') return 10;
  if (card.rank === 'A') return 11;
  return parseInt(card.rank) || 0;
}

function statusText(status, total) {
  if (status === 'bust') return '\uD83D\uDCA5 Bust (' + total + ')';
  if (status === 'blackjack') return '\u2605 Blackjack!';
  if (status === 'stand') return 'Stand (' + total + ')';
  if (status === 'double') return '2\u00D7 (' + total + ')';
  return total !== '?' ? 'Total: ' + total : '\u2014';
}

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
