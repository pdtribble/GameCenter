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
let _pendingBet = 0;
let _resizeObserver = null;
let _lastState = null;
// Per-hand guards — prevent listener accumulation across rounds
let _prevHandNumber = 0;
let _prevBettingBuiltHand = -1;
let _prevIntermissionBuiltHand = -1;
let _actionBtnsForTurn = null;

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
  _pendingBet = 0;
  _lastState = null;
  _prevHandNumber = 0;
  _prevBettingBuiltHand = -1;
  _prevIntermissionBuiltHand = -1;
  _actionBtnsForTurn = null;
  if (_countdownTimer) { clearInterval(_countdownTimer); _countdownTimer = null; }
  if (_resizeObserver) { _resizeObserver.disconnect(); _resizeObserver = null; }

  // DOM structure: chip tray and intermission panel sit BELOW the table, not inside it
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
          </div>
        </div>
        <div id="bj-chip-tray" style="display:none"></div>
        <div id="bj-intermission-panel" style="display:none"></div>
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

  // ResizeObserver: re-run updateView when table dimensions change (positions only)
  var tableEl = container.querySelector('#bj-table');
  if (window.ResizeObserver && tableEl) {
    _resizeObserver = new ResizeObserver(function() {
      if (_container && _lastState) updateView(_lastState, _myId, _hostId, _container, false);
    });
    _resizeObserver.observe(tableEl);
  }
}

export function update(gameState, playerId, hostPlayerId) {
  _myId = playerId;
  _hostId = hostPlayerId;
  if (_container) updateView(gameState, playerId, hostPlayerId, _container, false);
}

export function destroy() {
  if (_countdownTimer) clearInterval(_countdownTimer);
  if (_resizeObserver) { _resizeObserver.disconnect(); _resizeObserver = null; }
  _countdownTimer = null;
  _container = null;
  _lastState = null;
}

// ── Core update ───────────────────────────────────────────────────────────────
function updateView(state, myId, hostId, container, initial) {
  if (!state) return;
  _lastState = state;

  // ── Detect new hand — clear stale DOM before rendering ────────────────────
  var isNewHand = state.handNumber !== _prevHandNumber;
  if (isNewHand) {
    var dealerCardsReset = container.querySelector('#bj-dealer-cards');
    if (dealerCardsReset) dealerCardsReset.innerHTML = '';
    _prevDealerLen = 0;
    _prevHandLens = {};
    _prevSplitLens = {};
    _prevDealerHidden = true;
    _actionBtnsForTurn = null;  // force rebuild for new hand's first turn
  }

  // ── Dealer cards ──────────────────────────────────────────────────────────
  var dealerCardsEl = container.querySelector('#bj-dealer-cards');
  var dealerHand = state.dealerHand || [];
  var dealerLen = dealerHand.length;
  // isNewFlip: hole card was hidden, now revealed — but only mid-hand (not on hand reset)
  var isNewFlip = _prevDealerHidden && !state.dealerHidden && !initial && !isNewHand;

  if (initial || isNewHand) {
    renderCards(dealerCardsEl, dealerHand, dealerLen, true);
  } else {
    if (isNewFlip) {
      // Replace face-down hole card with face-up version + flip animation
      var existingCards = dealerCardsEl.querySelectorAll('.playing-card');
      if (existingCards[1] && dealerHand[1]) {
        var fTmp = document.createElement('div');
        fTmp.innerHTML = cardHtml(dealerHand[1]);
        var flippedCard = fTmp.firstChild;
        flippedCard.classList.add('bj-flipping');
        existingCards[1].replaceWith(flippedCard);
        setTimeout(function() { flippedCard.classList.remove('bj-flipping'); }, 400);
        sfxCard();
      }
    }
    // Append additional cards beyond what was already rendered
    var appendFrom = isNewFlip ? 2 : _prevDealerLen;
    if (dealerLen > appendFrom) {
      var extraCards = dealerHand.slice(appendFrom);
      extraCards.forEach(function(c, i) {
        var aTmp = document.createElement('div');
        aTmp.innerHTML = cardHtml(c, true, (isNewFlip ? 250 : 0) + i * 150);
        dealerCardsEl.appendChild(aTmp.firstChild);
      });
      if (!isNewFlip) sfxCard();
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

  // Rotate players so local player is always at the center-bottom arc position
  var CENTER_IDX = { 1: 0, 2: 0, 3: 1, 4: 1, 5: 2, 6: 2 };
  var cIdx = CENTER_IDX[numPlayers] !== undefined ? CENTER_IDX[numPlayers] : 0;
  var myPlayerIdx = players.findIndex(function(p) { return p.id === myId; });
  var orderedPlayers = players.slice();
  if (myPlayerIdx >= 0 && myPlayerIdx !== cIdx && numPlayers > 1) {
    var rotateBy = ((myPlayerIdx - cIdx) % numPlayers + numPlayers) % numPlayers;
    orderedPlayers = orderedPlayers.slice(rotateBy).concat(orderedPlayers.slice(0, rotateBy));
  }

  // Remove seats for players no longer in the game
  var currentPids = orderedPlayers.map(function(p) { return p.id; });
  var orphanSeats = seatsEl.querySelectorAll('[data-pid]');
  orphanSeats.forEach(function(el) {
    if (currentPids.indexOf(el.dataset.pid) === -1) el.remove();
  });

  orderedPlayers.forEach(function(player, idx) {
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
      seatsEl.appendChild(seatEl);
    }
    // Always update position (handles player count changes)
    seatEl.style.left = px + '%';
    seatEl.style.top = py + '%';

    var cls = 'bj-seat';
    if (isMe) cls += ' my-seat';
    if (isCurrent) cls += ' active-seat';
    if (isSittingOut) cls += ' sitting-out';
    seatEl.className = cls;

    var prevLen = _prevHandLens[pid] != null ? _prevHandLens[pid] : 0;
    var prevSplitLen = _prevSplitLens[pid] != null ? _prevSplitLens[pid] : 0;

    // Only play deal sounds on genuine new cards (not new-hand initial render)
    if (!initial && !isNewHand && handLen > prevLen) sfxCard();
    if (!initial && !isNewHand && splitLen > prevSplitLen) setTimeout(sfxCard, 150);

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
      return cardHtml(c, !initial && !isNewHand && i >= prevLen, (i - prevLen) * 150);
    }).join('');

    var splitSection = '';
    if (splitHand) {
      var splitCardsHtml = splitHand.map(function(c, i) {
        return cardHtml(c, !initial && !isNewHand && i >= prevSplitLen, (i - prevSplitLen) * 150);
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
      ? '<div class="bj-bet">' + chipStackHtml(bet) + ' ' + bet + (splitBet != null ? ' / ' + splitBet : '') + '</div>'
      : '';
    // Show "sitting out" label for players who have no cards (e.g. during betting or intermission)
    var sittingOutHtml = (isSittingOut && hand.length === 0)
      ? '<div style="font-size:0.62rem;color:rgba(255,255,255,0.45);margin-top:3px;font-style:italic">sitting out</div>'
      : '';

    seatEl.innerHTML = '<div class="bj-seat-name">' + escHtml(player.displayName || pid) + '</div>'
      + '<div class="bj-cards' + mainHandCls + '">' + mainCardsHtml + '</div>'
      + '<div class="bj-seat-total" style="color:' + totalColor + '">'
      + (hand.length ? statusText(status, total) : '') + '</div>'
      + splitSection
      + sittingOutHtml
      + chipsHtml + betHtml;
  });

  // Update prev-state tracking
  _prevDealerLen = dealerLen;
  _prevDealerHidden = !!state.dealerHidden;
  _prevHandNumber = state.handNumber;
  orderedPlayers.forEach(function(p) {
    _prevHandLens[p.id] = ((state.playerHands && state.playerHands[p.id]) || []).length;
    _prevSplitLens[p.id] = ((state.splitHands && state.splitHands[p.id]) || []).length;
  });

  // ── Chip delta animations ─────────────────────────────────────────────────
  if (state.enableChips && state.chips) {
    Object.keys(state.chips).forEach(function(pid) {
      var chipVal = state.chips[pid];
      var prev = _prevChips[pid];
      if (prev != null && chipVal !== prev) {
        var delta = chipVal - prev;
        var sEl = container.querySelector('[data-pid="' + pid + '"]');
        if (sEl) {
          sfxChip();
          var el = document.createElement('div');
          el.className = 'bj-chip-delta ' + (delta > 0 ? 'pos' : 'neg');
          el.textContent = (delta > 0 ? '+' : '') + delta;
          sEl.style.position = 'relative';
          sEl.appendChild(el);
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

  // ── Panel visibility logic ────────────────────────────────────────────────
  var actionPanel = container.querySelector('#bj-action-panel');
  var chipTray = container.querySelector('#bj-chip-tray');
  var intermissionPanel = container.querySelector('#bj-intermission-panel');

  if (state.phase === 'intermission') {
    // Hide action panel and chip tray — keep table fully visible
    actionPanel.style.display = 'none';
    chipTray.style.display = 'none';

    // Build intermission panel once per hand (prevents listener accumulation)
    if (state.handNumber !== _prevIntermissionBuiltHand) {
      _prevIntermissionBuiltHand = state.handNumber;
      buildIntermissionPanel(intermissionPanel, state, myId, hostId);
      startCountdown(intermissionPanel, state.intermissionEndsAt);
    } else {
      // Just update the sit-out button toggle state
      var sitBtn = intermissionPanel.querySelector('[data-action="sit-out"]');
      if (sitBtn) {
        var nowSitting = (state.sittingOut || []).indexOf(myId) !== -1;
        sitBtn.dataset.sitting = nowSitting ? '1' : '0';
        sitBtn.textContent = nowSitting ? '\u25BA Sit In' : '\uD83D\uDCA4 Sit Out';
      }
    }
    intermissionPanel.style.display = '';

  } else {
    intermissionPanel.style.display = 'none';

    if (state.phase === 'betting' && myId && (state.bets == null || state.bets[myId] === undefined)) {
      // Show chip tray for this player to place bet — build once per hand
      actionPanel.style.display = 'none';
      if (state.handNumber !== _prevBettingBuiltHand) {
        _prevBettingBuiltHand = state.handNumber;
        _pendingBet = 0;
        buildBettingUi(chipTray, state, myId, container);
      }
      chipTray.style.display = '';

    } else if (state.phase === 'playing' && state.currentPlayerId === myId) {
      // Only show action buttons if this player's hand is not yet finished
      var myStatus = (state.playerStatus && state.playerStatus[myId]) || '';
      var myHandDone = myStatus === 'bust' || myStatus === 'stand'
        || myStatus === 'double' || myStatus === 'blackjack';

      chipTray.style.display = 'none';

      if (!myHandDone) {
        actionPanel.style.display = '';
        // Build action buttons once per "turn" — key changes on player/hand/split switch
        var turnKey = (state.currentPlayerId || '') + ':' + (state.handNumber || 0)
          + ':' + ((state.activeHand && state.activeHand[myId]) || 'main');
        if (_actionBtnsForTurn !== turnKey) {
          _actionBtnsForTurn = turnKey;
          buildActionBtns(container.querySelector('#bj-action-btns'), state, myId);
        }
      } else {
        actionPanel.style.display = 'none';
      }

    } else {
      chipTray.style.display = 'none';
      actionPanel.style.display = 'none';
    }
  }
}

// ── Intermission panel (below table, not overlaid) ────────────────────────────
function buildIntermissionPanel(el, state, myId, hostId) {
  var isSittingOut = (state.sittingOut || []).indexOf(myId) !== -1;

  var resultChips = '';
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
      var bg = r.result === 'win' ? '#166534' : r.result === 'push' ? '#374151' : '#7f1d1d';
      resultChips += '<span style="display:inline-block;padding:2px 9px;border-radius:12px;font-size:0.78rem;background:'
        + bg + ';color:#fff;white-space:nowrap">'
        + name + handLabel + ': ' + r.result.toUpperCase() + chipChange + '</span>';
    });
  }

  var endGameBtn = (myId === hostId)
    ? '<button class="btn btn-danger btn-sm" data-action="end-game" style="margin-left:4px">End Game</button>'
    : '';

  el.innerHTML = '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:10px 16px;'
    + 'background:var(--color-bg-card);border-top:1px solid var(--color-border);'
    + 'border-radius:0 0 var(--radius-md,8px) var(--radius-md,8px)">'
    + '<div style="display:flex;gap:6px;flex-wrap:wrap;flex:1">'
    + (resultChips || '<span style="color:var(--color-text-secondary);font-size:0.85rem">\u2014</span>')
    + '</div>'
    + '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0">'
    + '<span style="font-size:0.82rem;color:var(--color-text-secondary)">Next in <strong id="bj-countdown">5</strong>s</span>'
    + '<button class="btn btn-secondary btn-sm" data-action="sit-out" data-sitting="' + (isSittingOut ? '1' : '0') + '">'
    + (isSittingOut ? '\u25BA Sit In' : '\uD83D\uDCA4 Sit Out') + '</button>'
    + endGameBtn
    + '</div>'
    + '</div>';

  el.addEventListener('click', function(e) {
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
}

function startCountdown(el, endsAt) {
  if (_countdownTimer) clearInterval(_countdownTimer);
  function tick() {
    var countEl = el ? el.querySelector('#bj-countdown') : null;
    if (!countEl) { clearInterval(_countdownTimer); return; }
    var secs = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    countEl.textContent = secs;
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
    // Remove this handler — server response will trigger a fresh rebuild
    el.removeEventListener('click', handler);
    _actionBtnsForTurn = null;
  });
}

// ── Betting UI (visual chip bar, rendered below table in #bj-chip-tray) ───────
var CHIP_DENOMS = [1, 5, 25, 100, 500];
var CHIP_COLORS = { 1: 'c1', 5: 'c5', 25: 'c25', 100: 'c100', 500: 'c500' };

function buildBettingUi(el, state, myId, container) {
  var chips = (state.chips && state.chips[myId] != null) ? state.chips[myId] : 0;
  var timeLeft = state.bettingEndsAt ? Math.max(0, Math.round((state.bettingEndsAt - Date.now()) / 1000)) : 20;
  var availDenoms = CHIP_DENOMS.filter(function(d) { return d <= chips; });
  if (availDenoms.length === 0 && chips > 0) availDenoms = [chips];

  _pendingBet = 0;

  el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 16px;'
    + 'background:var(--color-bg-card);border-top:1px solid var(--color-border);'
    + 'border-radius:0 0 var(--radius-md,8px) var(--radius-md,8px)">'
    + '<div class="bj-bet-timer" id="bj-bet-timer">\u23F1 ' + timeLeft + 's \u2014 ' + chips + ' chips</div>'
    + '<div class="bj-bet-display" id="bj-bet-display">BET: \u2014</div>'
    + '<div class="bj-chip-bar">'
    + availDenoms.map(function(d) {
      return '<button class="bj-chip ' + (CHIP_COLORS[d] || 'c1') + '" data-action="add-chip" data-amount="' + d + '">' + d + '</button>';
    }).join('')
    + (chips > 0 ? '<button class="bj-chip c500" data-action="all-in" title="All In" style="font-size:0.55rem">ALL<br>IN</button>' : '')
    + '</div>'
    + '<div style="display:flex;gap:6px;margin-top:4px;justify-content:center">'
    + '<button class="btn btn-secondary bj-bet-clear" data-action="clear-bet" style="padding:4px 10px;font-size:0.75rem">\u2715 Clear</button>'
    + '<button class="btn btn-primary" data-action="place-bet" style="padding:4px 14px;font-size:0.82rem">Bet \u2713</button>'
    + '</div>'
    + '</div>';

  el.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var act = btn.dataset.action;
    var sessionId = _socket.currentSessionId;
    var dispEl = el.querySelector('#bj-bet-display');
    if (act === 'add-chip') {
      var addAmt = parseInt(btn.dataset.amount) || 0;
      _pendingBet = Math.min(_pendingBet + addAmt, chips);
      if (dispEl) dispEl.textContent = 'BET: ' + _pendingBet;
      sfxChip();
    } else if (act === 'all-in') {
      _pendingBet = chips;
      if (dispEl) dispEl.textContent = 'BET: ' + _pendingBet + ' (ALL IN!)';
      sfxChip();
    } else if (act === 'clear-bet') {
      _pendingBet = 0;
      if (dispEl) dispEl.textContent = 'BET: \u2014';
    } else if (act === 'place-bet') {
      var finalBet = _pendingBet > 0 ? _pendingBet : Math.min(10, chips);
      _socket.emit('game:action', { sessionId: sessionId, action: { type: 'bet', amount: finalBet } });
    }
  });

  // Betting countdown timer
  if (state.bettingEndsAt) {
    if (_countdownTimer) clearInterval(_countdownTimer);
    var endTime = state.bettingEndsAt;
    _countdownTimer = setInterval(function() {
      var timerEl = container ? container.querySelector('#bj-bet-timer') : null;
      if (!timerEl) { clearInterval(_countdownTimer); return; }
      var t = Math.max(0, Math.round((endTime - Date.now()) / 1000));
      timerEl.textContent = '\u23F1 ' + t + 's \u2014 ' + chips + ' chips';
      if (t <= 0) clearInterval(_countdownTimer);
    }, 500);
  }
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
function chipStackHtml(amount) {
  if (!amount) return '';
  var denoms = [500, 100, 25, 5, 1];
  var html = '';
  var rem = amount;
  for (var di = 0; di < denoms.length; di++) {
    var d = denoms[di];
    var count = Math.floor(rem / d);
    rem -= count * d;
    for (var ci = 0; ci < Math.min(count, 3); ci++) {
      html += '<span class="bj-chip-sm ' + (CHIP_COLORS[d] || 'c1') + '"></span>';
    }
    if (html.length > 0 && rem === 0) break;
  }
  return html;
}

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
