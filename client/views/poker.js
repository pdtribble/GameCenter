// Singleplayer Poker — local game vs bots using poker renderer
import { render as pkRender, update as pkUpdate, destroy as pkDestroy } from '../renderers/poker.js';

// ── Inline poker state management ────────────────────────────────────────────
// Since the poker module is CommonJS (not importable in browser), we implement
// a thin local state manager here that mirrors the server-side logic.

const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const SUITS = ['♣','♦','♥','♠'];
const RANK_VAL = Object.fromEntries(RANKS.map((r,i) => [r, i]));

function buildDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ rank: r, suit: s });
  return d;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clone(s) { return JSON.parse(JSON.stringify(s)); }

// ── Hand evaluation (simplified for SP) ─────────────────────────────────────
function rankVal(r) { return RANK_VAL[r] ?? 0; }

function evaluateFiveCards(cards) {
  const ranks = cards.map(c => rankVal(c.rank)).sort((a,b) => b-a);
  const suits = cards.map(c => c.suit);
  const rankCounts = {};
  for (const r of ranks) rankCounts[r] = (rankCounts[r]||0) + 1;
  const counts = Object.values(rankCounts).sort((a,b) => b-a);
  const isFlush = new Set(suits).size === 1;
  const isStraight = ranks[0] - ranks[4] === 4 && new Set(ranks).size === 5;
  const isLowAce = ranks[0] === 12 && ranks[1] === 3 && ranks[2] === 2 && ranks[3] === 1 && ranks[4] === 0;

  if (isFlush && (isStraight || isLowAce)) {
    return { rank: ranks[0] === 12 && ranks[1] === 11 ? 8 : 7, tb: ranks };
  }
  if (counts[0] === 4) return { rank: 6, tb: ranks };
  if (counts[0] === 3 && counts[1] === 2) return { rank: 5, tb: ranks };
  if (isFlush) return { rank: 4, tb: ranks };
  if (isStraight || isLowAce) return { rank: 3, tb: isLowAce ? [3,2,1,0,-1] : ranks };
  if (counts[0] === 3) return { rank: 2, tb: ranks };
  if (counts[0] === 2 && counts[1] === 2) return { rank: 1, tb: ranks };
  return { rank: 0, tb: ranks };
}

function getBestHand(holeCards, community) {
  const all = [...holeCards, ...community];
  if (all.length < 5) {
    const res = all.length >= 2 ? evaluateFiveCards(all.concat(Array(5-all.length).fill({rank:'2',suit:'♣'}))) : { rank:-1, tb:[] };
    return res;
  }
  let best = null;
  for (let i = 0; i < all.length - 4; i++) {
    for (let j = i+1; j < all.length - 3; j++) {
      for (let k = j+1; k < all.length - 2; k++) {
        for (let l = k+1; l < all.length - 1; l++) {
          for (let m = l+1; m < all.length; m++) {
            const res = evaluateFiveCards([all[i],all[j],all[k],all[l],all[m]]);
            if (!best || res.rank > best.rank || (res.rank === best.rank && res.tb.join() > best.tb.join())) {
              best = res;
            }
          }
        }
      }
    }
  }
  return best || { rank: -1, tb: [] };
}

const HAND_NAMES = ['High Card','One Pair','Two Pair','Three of a Kind','Straight','Flush','Full House','Four of a Kind','Straight Flush','Royal Flush'];

// ── Game State Manager ────────────────────────────────────────────────────────
let gameState = null;
let playerId = null;
let onStateChange = null;

function createInitialState(pid) {
  const bots = [
    { id: 'bot-1', displayName: '🤖 Bot 1', is_bot: true },
    { id: 'bot-2', displayName: '🤖 Bot 2', is_bot: true },
  ];
  const allPlayers = [
    { id: pid, displayName: 'You', is_bot: false },
    ...bots,
  ];

  const startingChips = 1000;
  const smallBlind = 25;
  const bigBlind = 50;

  const deck = shuffle(buildDeck());
  const players = allPlayers.map(p => ({
    id: p.id, displayName: p.displayName, is_bot: p.is_bot,
    hand: [deck.pop(), deck.pop()],
    chips: startingChips, bet: 0, totalBet: 0,
    status: 'active', lastAction: null,
  }));

  // Post blinds (dealer=0, SB=1, BB=2)
  const n = players.length;
  players[1 % n].chips -= smallBlind; players[1 % n].bet = smallBlind; players[1 % n].totalBet = smallBlind;
  players[2 % n].chips -= bigBlind; players[2 % n].bet = bigBlind; players[2 % n].totalBet = bigBlind;

  const state = {
    phase: 'preflop', round: 1, dealerPosition: 0,
    currentPlayerId: players[3 % n]?.id || players[0].id,
    pot: smallBlind + bigBlind, communityCards: [], deck,
    callAmount: bigBlind, players,
    config: { startingChips, smallBlind, bigBlind },
    winner: null, winnerName: null, handResults: [],
    actedThisRound: new Set(),
  };
  return state;
}

function getMaxBet(state) {
  return Math.max(...state.players.map(p => p.bet));
}

function getCallAmount(state, pid) {
  const p = state.players.find(x => x.id === pid);
  if (!p) return 0;
  return Math.max(0, getMaxBet(state) - p.bet);
}

function nextActivePlayer(state, fromId) {
  const active = state.players.filter(p => p.status === 'active');
  if (!active.length) return null;
  const idx = active.findIndex(p => p.id === fromId);
  return active[(idx + 1) % active.length]?.id || null;
}

function isBettingRoundOver(state) {
  const active = state.players.filter(p => p.status === 'active');
  if (active.length <= 1) return true;
  const maxBet = getMaxBet(state);
  // All active players have matched the bet or are all-in
  return active.every(p => p.bet === maxBet || (state.actedThisRound || new Set()).has(p.id));
}

function dealCommunity(state) {
  const s = state;
  if (s.phase === 'preflop') {
    s.communityCards.push(s.deck.pop(), s.deck.pop(), s.deck.pop());
    s.phase = 'flop';
  } else if (s.phase === 'flop') {
    s.communityCards.push(s.deck.pop());
    s.phase = 'turn';
  } else if (s.phase === 'turn') {
    s.communityCards.push(s.deck.pop());
    s.phase = 'river';
  } else if (s.phase === 'river') {
    s.phase = 'showdown';
    doShowdown(s);
    return;
  }
  // Reset bets for new street
  for (const p of s.players) {
    if (p.status === 'active') p.bet = 0;
  }
  s.actedThisRound = new Set();
  // First to act: left of dealer
  const active = s.players.filter(p => p.status === 'active');
  if (active.length) {
    const dealerIdx = s.players.findIndex((_, i) => i === s.dealerPosition);
    let next = (dealerIdx + 1) % s.players.length;
    while (s.players[next].status !== 'active') next = (next + 1) % s.players.length;
    s.currentPlayerId = s.players[next].id;
  }
  s.callAmount = 0;
}

function doShowdown(state) {
  const contenders = state.players.filter(p => p.status === 'active' || p.status === 'all-in');
  let bestResult = null;
  let winners = [];
  for (const p of contenders) {
    const result = getBestHand(p.hand, state.communityCards);
    p.handResult = result;
    p.handName = HAND_NAMES[result.rank] || 'High Card';
    if (!bestResult || result.rank > bestResult.rank || (result.rank === bestResult.rank && result.tb.join() > bestResult.tb.join())) {
      bestResult = result; winners = [p];
    } else if (result.rank === bestResult.rank && result.tb.join() === bestResult.tb.join()) {
      winners.push(p);
    }
  }
  const share = Math.floor(state.pot / winners.length);
  for (const w of winners) { w.chips += share; }
  state.winner = winners[0]?.id || null;
  state.winnerName = winners[0]?.displayName || null;
  state.handResults = contenders.map(p => ({ playerId: p.id, handName: p.handName || 'Folded', bestHand: p.hand }));
  state.phase = 'showdown';
  state.currentPlayerId = null;
}

function applyAction(state, pid, action) {
  const s = clone(state);
  s.actedThisRound = state.actedThisRound instanceof Set ? new Set([...state.actedThisRound]) : new Set(state.actedThisRound || []);
  const p = s.players.find(x => x.id === pid);
  if (!p || s.currentPlayerId !== pid) return s;

  const callAmt = getCallAmount(s, pid);

  if (action.type === 'fold') {
    p.status = 'folded'; p.lastAction = 'fold';
    s.actedThisRound.add(pid);
  } else if (action.type === 'check') {
    if (callAmt !== 0) return s;
    p.lastAction = 'check';
    s.actedThisRound.add(pid);
  } else if (action.type === 'call') {
    const amt = Math.min(callAmt, p.chips);
    p.chips -= amt; p.bet += amt; p.totalBet += amt; s.pot += amt;
    p.lastAction = 'call';
    if (p.chips === 0) p.status = 'all-in';
    s.actedThisRound.add(pid);
  } else if (action.type === 'raise') {
    const amount = Math.min(action.amount || s.config.bigBlind * 2, p.chips + p.bet);
    const delta = amount - p.bet;
    if (delta <= 0) return s;
    p.chips -= delta; p.bet = amount; p.totalBet += delta; s.pot += delta;
    p.lastAction = 'raise';
    if (p.chips === 0) p.status = 'all-in';
    // Reset acted set — everyone must act again except raiser
    s.actedThisRound = new Set([pid]);
  }

  // Check if everyone folded except one
  const stillIn = s.players.filter(x => x.status === 'active' || x.status === 'all-in');
  const notFolded = s.players.filter(x => x.status !== 'folded');
  if (notFolded.length === 1) {
    notFolded[0].chips += s.pot;
    s.winner = notFolded[0].id;
    s.winnerName = notFolded[0].displayName;
    s.phase = 'showdown';
    s.currentPlayerId = null;
    return s;
  }

  // Check betting round over
  const maxBet = getMaxBet(s);
  const activeNotActed = s.players.filter(x => x.status === 'active' && (x.bet < maxBet || !s.actedThisRound.has(x.id)));
  if (activeNotActed.length === 0) {
    dealCommunity(s);
  } else {
    // Find next active player
    const curIdx = s.players.findIndex(x => x.id === pid);
    let next = (curIdx + 1) % s.players.length;
    let tries = 0;
    while ((s.players[next].status !== 'active' || s.players[next].id === pid) && tries < s.players.length) {
      // Make sure they haven't acted yet or need to act
      next = (next + 1) % s.players.length;
      tries++;
    }
    // Find next player that actually needs to act
    const toAct = s.players.filter(x => x.status === 'active' && (x.bet < maxBet || !s.actedThisRound.has(x.id)));
    if (toAct.length) {
      // Pick the one after current in player order
      const orderedToAct = [];
      let idx = (curIdx + 1) % s.players.length;
      for (let i = 0; i < s.players.length; i++) {
        if (toAct.find(x => x.id === s.players[idx].id)) orderedToAct.push(s.players[idx]);
        idx = (idx + 1) % s.players.length;
      }
      s.currentPlayerId = orderedToAct[0]?.id || null;
    } else {
      dealCommunity(s);
    }
  }

  s.callAmount = s.currentPlayerId ? getCallAmount(s, s.currentPlayerId) : 0;
  return s;
}

function botThink(state) {
  const bot = state.players.find(p => p.is_bot && p.id === state.currentPlayerId && p.status === 'active');
  if (!bot) return null;
  const callAmt = getCallAmount(state, bot.id);
  if (callAmt === 0) {
    return Math.random() < 0.7 ? { type: 'check' } : { type: 'raise', amount: bot.bet + state.config.bigBlind * 2 };
  }
  const r = Math.random();
  if (r < 0.25) return { type: 'fold' };
  if (r < 0.75) return { type: 'call' };
  return { type: 'raise', amount: bot.bet + callAmt * 2 };
}

// ── Main view ─────────────────────────────────────────────────────────────────
let destroyed = false;
let botTimer = null;

export function renderPoker(container, socket, appState, navigate) {
  destroyed = false;

  // Generate a local player ID
  playerId = document.cookie.match(/gc_session=([^;]+)/)?.[1] || 'local-player';

  // Add back button
  const backBtn = document.createElement('button');
  backBtn.style.cssText = 'position:absolute;top:8px;left:8px;z-index:1000;background:rgba(0,0,0,0.7);color:#d4af37;border:1px solid rgba(212,175,55,0.4);border-radius:6px;padding:6px 12px;font-family:"DM Mono",monospace;font-size:12px;cursor:pointer;';
  backBtn.textContent = '\u2190 Back';
  backBtn.onclick = () => navigate('singleplayer');
  container.style.position = 'relative';
  container.appendChild(backBtn);

  // Initialize game state
  gameState = createInitialState(playerId);

  // Create fake socket
  const fakeSocket = {
    currentSessionId: 'sp-poker',
    emit(event, data) {
      if (event === 'game:action' && data.action) {
        processAction(data.action);
      }
    },
    on() {},
    off() {},
  };

  // Render initial state
  const publicState = getPublicState(gameState, playerId);
  pkRender(container, publicState, fakeSocket, playerId, null);

  // Schedule bot moves if bot is first to act
  scheduleBotIfNeeded();

  return { destroy() { cleanup(); } };
}

function getPublicState(state, pid) {
  const s = clone(state);
  delete s.deck;
  delete s.actedThisRound;
  for (const p of s.players) {
    if (p.id !== pid && s.phase !== 'showdown') {
      p.hand = p.hand.map(() => ({ hole: true }));
    }
  }
  s.callAmount = pid ? getCallAmount(state, pid) : 0;
  return s;
}

function processAction(action) {
  if (!gameState || destroyed) return;
  gameState = applyAction(gameState, playerId, action);
  updateRenderer();
  if (gameState.phase !== 'showdown') {
    scheduleBotIfNeeded();
  }
}

function scheduleBotIfNeeded() {
  if (destroyed || !gameState || gameState.phase === 'showdown') return;
  const cur = gameState.players.find(p => p.id === gameState.currentPlayerId);
  if (!cur || !cur.is_bot) return;

  botTimer = setTimeout(() => {
    if (destroyed || !gameState) return;
    const action = botThink(gameState);
    if (action) {
      gameState = applyAction(gameState, gameState.currentPlayerId, action);
      updateRenderer();
      if (gameState.phase !== 'showdown') scheduleBotIfNeeded();
    }
  }, 600 + Math.random() * 800);
}

function updateRenderer() {
  if (destroyed) return;
  const pub = getPublicState(gameState, playerId);
  pkUpdate(pub, playerId, null);
}

function cleanup() {
  destroyed = true;
  if (botTimer) { clearTimeout(botTimer); botTimer = null; }
  pkDestroy();
}
