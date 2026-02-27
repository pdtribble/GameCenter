// Texas Hold'em No-Limit Poker
// Bet, raise, and bluff your way to victory.

'use strict';

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUITS = ['\u2663', '\u2666', '\u2665', '\u2660']; // clubs, diamonds, hearts, spades
const RANK_VALUES = {};
RANKS.forEach((r, i) => { RANK_VALUES[r] = i + 2; }); // 2=2 ... A=14

const HAND_NAMES = [
  'High Card', 'One Pair', 'Two Pair', 'Three of a Kind',
  'Straight', 'Flush', 'Full House', 'Four of a Kind',
  'Straight Flush', 'Royal Flush'
];

// ── Utility ─────────────────────────────────────────────────────────────────

function buildDeck() {
  const deck = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit });
  return deck;
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

// ── Hand Evaluation ─────────────────────────────────────────────────────────

/** Generate all C(n,5) combinations of 5 cards from n cards */
function combinations(cards, k) {
  const result = [];
  function combo(start, chosen) {
    if (chosen.length === k) { result.push(chosen.slice()); return; }
    for (let i = start; i < cards.length; i++) {
      chosen.push(cards[i]);
      combo(i + 1, chosen);
      chosen.pop();
    }
  }
  combo(0, []);
  return result;
}

/** Evaluate a 5-card hand. Returns { rank, tiebreaker, name } */
function evaluate5(cards) {
  const vals = cards.map(c => RANK_VALUES[c.rank]).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);

  const isFlush = suits.every(s => s === suits[0]);

  // Check straight (including A-2-3-4-5 wheel)
  let isStraight = false;
  let straightHigh = vals[0];
  if (vals[0] - vals[4] === 4 && new Set(vals).size === 5) {
    isStraight = true;
    straightHigh = vals[0];
  } else if (vals[0] === 14 && vals[1] === 5 && vals[2] === 4 && vals[3] === 3 && vals[4] === 2) {
    // Wheel: A-2-3-4-5
    isStraight = true;
    straightHigh = 5;
  }

  // Count ranks
  const counts = {};
  for (const v of vals) counts[v] = (counts[v] || 0) + 1;
  const groups = Object.entries(counts)
    .map(([v, c]) => ({ val: parseInt(v), count: c }))
    .sort((a, b) => b.count - a.count || b.val - a.val);

  if (isFlush && isStraight) {
    if (straightHigh === 14) return { rank: 9, tiebreaker: [14], name: 'Royal Flush' };
    return { rank: 8, tiebreaker: [straightHigh], name: 'Straight Flush' };
  }
  if (groups[0].count === 4) {
    return { rank: 7, tiebreaker: [groups[0].val, groups[1].val], name: 'Four of a Kind' };
  }
  if (groups[0].count === 3 && groups[1].count === 2) {
    return { rank: 6, tiebreaker: [groups[0].val, groups[1].val], name: 'Full House' };
  }
  if (isFlush) {
    return { rank: 5, tiebreaker: vals, name: 'Flush' };
  }
  if (isStraight) {
    return { rank: 4, tiebreaker: [straightHigh], name: 'Straight' };
  }
  if (groups[0].count === 3) {
    const kickers = groups.filter(g => g.count === 1).map(g => g.val).sort((a, b) => b - a);
    return { rank: 3, tiebreaker: [groups[0].val, ...kickers], name: 'Three of a Kind' };
  }
  if (groups[0].count === 2 && groups[1].count === 2) {
    const pairs = [groups[0].val, groups[1].val].sort((a, b) => b - a);
    const kicker = groups.find(g => g.count === 1).val;
    return { rank: 2, tiebreaker: [...pairs, kicker], name: 'Two Pair' };
  }
  if (groups[0].count === 2) {
    const kickers = groups.filter(g => g.count === 1).map(g => g.val).sort((a, b) => b - a);
    return { rank: 1, tiebreaker: [groups[0].val, ...kickers], name: 'One Pair' };
  }
  return { rank: 0, tiebreaker: vals, name: 'High Card' };
}

/** Evaluate the best 5-card hand from 5-7 cards */
function evaluateHand(cards) {
  if (cards.length < 5) return { rank: -1, tiebreaker: [], name: 'Incomplete' };
  const combos = combinations(cards, 5);
  let best = null;
  for (const combo of combos) {
    const result = evaluate5(combo);
    if (!best || compareHands(result, best) > 0) {
      best = result;
      best.bestHand = combo;
    }
  }
  return best;
}

/** Compare two hand evaluations. Returns >0 if a wins, <0 if b wins, 0 if tie */
function compareHands(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.max(a.tiebreaker.length, b.tiebreaker.length); i++) {
    const av = a.tiebreaker[i] || 0;
    const bv = b.tiebreaker[i] || 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

// ── Poker Helpers ───────────────────────────────────────────────────────────

function getActivePlayers(state) {
  return state.players.filter(p => p.status === 'active' || p.status === 'all-in');
}

function getActingPlayers(state) {
  return state.players.filter(p => p.status === 'active');
}

function getHighestBet(state) {
  let max = 0;
  for (const p of state.players) {
    if (p.bet > max) max = p.bet;
  }
  return max;
}

/** Find next active (not folded, not all-in, not out) player index after given index */
function nextActivePlayerIndex(players, fromIdx) {
  const n = players.length;
  for (let offset = 1; offset <= n; offset++) {
    const idx = (fromIdx + offset) % n;
    if (players[idx].status === 'active') return idx;
  }
  return -1;
}

/** Find next non-folded, non-out player index after given index (includes all-in) */
function nextAlivePlayerIndex(players, fromIdx) {
  const n = players.length;
  for (let offset = 1; offset <= n; offset++) {
    const idx = (fromIdx + offset) % n;
    if (players[idx].status === 'active' || players[idx].status === 'all-in') return idx;
  }
  return -1;
}

/** First active player left of dealer */
function firstActiveAfterDealer(state) {
  return nextActivePlayerIndex(state.players, state.dealerPosition);
}

function dealHoleCards(state) {
  for (const p of state.players) {
    if (p.status !== 'out') {
      p.hand = [state.deck.pop(), state.deck.pop()];
      p.status = 'active';
      p.bet = 0;
      p.totalBet = 0;
      p.lastAction = null;
    }
  }
}

function postBlinds(state) {
  const activePlayers = state.players.filter(p => p.status !== 'out');
  const n = activePlayers.length;
  if (n < 2) return;

  // For heads-up (2 players): dealer posts small blind, other posts big blind
  // For 3+ players: player left of dealer posts small, next posts big
  let sbIdx, bbIdx;
  if (n === 2) {
    // Heads-up: dealer is small blind
    sbIdx = state.players.indexOf(activePlayers.find(p => state.players.indexOf(p) === state.dealerPosition));
    if (sbIdx === -1) sbIdx = state.players.indexOf(activePlayers[0]);
    bbIdx = state.players.indexOf(activePlayers.find(p => state.players.indexOf(p) !== sbIdx));
    if (bbIdx === -1) bbIdx = state.players.indexOf(activePlayers[1]);
  } else {
    // Find SB: first non-out player after dealer
    const dealerActiveIdx = state.dealerPosition;
    sbIdx = nextAlivePlayerIndex(state.players, dealerActiveIdx);
    bbIdx = nextAlivePlayerIndex(state.players, sbIdx);
  }

  const sb = state.players[sbIdx];
  const bb = state.players[bbIdx];
  const smallBlind = Math.min(state.config.smallBlind, sb.chips);
  const bigBlind = Math.min(state.config.bigBlind, bb.chips);

  sb.chips -= smallBlind;
  sb.bet = smallBlind;
  sb.totalBet = smallBlind;
  if (sb.chips === 0) sb.status = 'all-in';

  bb.chips -= bigBlind;
  bb.bet = bigBlind;
  bb.totalBet = bigBlind;
  if (bb.chips === 0) bb.status = 'all-in';

  state.pot += smallBlind + bigBlind;

  // UTG (first to act preflop) is the player after the big blind
  const utgIdx = nextActivePlayerIndex(state.players, bbIdx);
  if (utgIdx >= 0) {
    state.currentPlayerId = state.players[utgIdx].id;
  } else {
    // Everyone is all-in from blinds
    state.currentPlayerId = null;
  }

  // Track who needs to act this round
  state._actedSet = new Set();
  state._lastRaiserIdx = bbIdx; // BB is treated as the "last raiser" preflop
}

function advanceStreet(state) {
  // Reset bets for new street
  for (const p of state.players) {
    p.bet = 0;
    p.lastAction = null;
  }
  state._actedSet = new Set();
  state._lastRaiserIdx = -1;

  if (state.phase === 'preflop') {
    state.phase = 'flop';
    state.communityCards.push(state.deck.pop(), state.deck.pop(), state.deck.pop());
  } else if (state.phase === 'flop') {
    state.phase = 'turn';
    state.communityCards.push(state.deck.pop());
  } else if (state.phase === 'turn') {
    state.phase = 'river';
    state.communityCards.push(state.deck.pop());
  } else if (state.phase === 'river') {
    resolveShowdown(state);
    return;
  }

  // First to act on post-flop streets is first active player after dealer
  const idx = firstActiveAfterDealer(state);
  if (idx >= 0) {
    state.currentPlayerId = state.players[idx].id;
  } else {
    // All active players are all-in, run out remaining streets
    state.currentPlayerId = null;
    advanceStreet(state);
  }
}

function resolveShowdown(state) {
  state.phase = 'showdown';
  state.currentPlayerId = null;

  const contenders = state.players.filter(p => p.status === 'active' || p.status === 'all-in');
  if (contenders.length === 0) return;

  // Evaluate hands
  const handResults = [];
  for (const p of contenders) {
    const allCards = [...p.hand, ...state.communityCards];
    const eval_ = evaluateHand(allCards);
    handResults.push({
      playerId: p.id,
      displayName: p.displayName,
      handName: eval_.name,
      handRank: eval_.rank,
      tiebreaker: eval_.tiebreaker,
      bestHand: eval_.bestHand || [],
    });
  }

  // Sort by hand strength descending
  handResults.sort((a, b) => {
    if (a.handRank !== b.handRank) return b.handRank - a.handRank;
    for (let i = 0; i < Math.max(a.tiebreaker.length, b.tiebreaker.length); i++) {
      const av = a.tiebreaker[i] || 0;
      const bv = b.tiebreaker[i] || 0;
      if (av !== bv) return bv - av;
    }
    return 0;
  });

  state.handResults = handResults;

  // Determine winners (handle ties)
  const best = handResults[0];
  const winners = handResults.filter(h =>
    h.handRank === best.handRank &&
    h.tiebreaker.every((v, i) => v === best.tiebreaker[i])
  );

  // Split pot among winners
  const share = Math.floor(state.pot / winners.length);
  const remainder = state.pot - share * winners.length;
  for (let i = 0; i < winners.length; i++) {
    const p = state.players.find(pl => pl.id === winners[i].playerId);
    if (p) p.chips += share + (i === 0 ? remainder : 0);
  }

  state.pot = 0;
  state.winner = winners[0].playerId;
  state.winnerName = winners[0].displayName;
}

function advanceTurn(state) {
  const acting = getActingPlayers(state);
  const alive = getActivePlayers(state); // active + all-in

  // Only one non-folded player left -> they win
  if (alive.length === 1) {
    const winner = alive[0];
    winner.chips += state.pot;
    state.pot = 0;
    state.winner = winner.id;
    state.winnerName = winner.displayName;
    state.phase = 'showdown';
    state.currentPlayerId = null;
    state.handResults = [{
      playerId: winner.id,
      displayName: winner.displayName,
      handName: 'Last Standing',
      handRank: -1,
      tiebreaker: [],
      bestHand: [],
    }];
    return;
  }

  // No active (non-all-in) players left to act: run out remaining streets
  if (acting.length === 0) {
    advanceStreet(state);
    return;
  }

  // If only one active player and rest are all-in (or folded), and bets match -> advance
  if (acting.length === 1) {
    const lone = acting[0];
    const highBet = getHighestBet(state);
    if (lone.bet >= highBet) {
      advanceStreet(state);
      return;
    }
    // Lone player still needs to match bet
    state.currentPlayerId = lone.id;
    return;
  }

  // Check if betting round is complete
  const highBet = getHighestBet(state);
  const allActed = acting.every(p => state._actedSet && state._actedSet.has(p.id));
  const allBetsMatch = acting.every(p => p.bet === highBet);

  if (allActed && allBetsMatch) {
    advanceStreet(state);
    return;
  }

  // Find next active player
  const currentIdx = state.players.findIndex(p => p.id === state.currentPlayerId);
  const nextIdx = nextActivePlayerIndex(state.players, currentIdx);
  if (nextIdx >= 0) {
    const nextPlayer = state.players[nextIdx];
    // If this player has already acted and their bet matches, round is done
    if (state._actedSet && state._actedSet.has(nextPlayer.id) && nextPlayer.bet === highBet) {
      // Check if ALL acting players have matching bets and have acted
      if (allBetsMatch && allActed) {
        advanceStreet(state);
        return;
      }
    }
    state.currentPlayerId = nextPlayer.id;
  } else {
    advanceStreet(state);
  }
}

function setupNewHand(state, activePlayers) {
  state.deck = shuffle(buildDeck());
  state.communityCards = [];
  state.pot = 0;
  state.winner = null;
  state.winnerName = null;
  state.handResults = [];
  state.callAmount = 0;
  state._actedSet = new Set();
  state._lastRaiserIdx = -1;

  // Reset player states for the new hand
  for (const p of state.players) {
    if (p.chips <= 0 && p.status !== 'out') {
      p.status = 'out';
    }
    if (p.status !== 'out') {
      p.hand = [];
      p.bet = 0;
      p.totalBet = 0;
      p.lastAction = null;
      p.status = 'active';
    }
  }

  // Ensure only active players with chips participate
  const playable = state.players.filter(p => p.status === 'active');
  if (playable.length < 2) return;

  dealHoleCards(state);
  postBlinds(state);
  state.phase = 'preflop';
}

// ── Module Exports ──────────────────────────────────────────────────────────

module.exports = {
  name: 'Poker',
  description: "Texas Hold'em No-Limit poker. Bet, raise, and bluff your way to victory.",
  icon: '\u2660\uFE0F', // spade emoji
  minPlayers: 2,
  maxPlayers: 9,
  botFillAllowed: true,
  botFillMin: 2,
  version: '1.0.0',

  getSetupConfig() {
    return [
      { key: 'startingChips', type: 'number', label: 'Starting Chips', default: 1000, min: 100, max: 50000, step: 100 },
      { key: 'smallBlind', type: 'number', label: 'Small Blind', default: 25, min: 5, max: 500, step: 5 },
      { key: 'botDifficulty', type: 'select', label: 'Bot Difficulty', options: ['easy', 'medium', 'hard'], default: 'medium' },
    ];
  },

  initGame(players, config) {
    const startingChips = Math.max(100, parseInt(config.startingChips, 10) || 1000);
    const smallBlind = Math.max(5, parseInt(config.smallBlind, 10) || 25);
    const bigBlind = smallBlind * 2;
    const botDifficulty = config.botDifficulty || 'medium';

    const state = {
      phase: 'preflop',
      round: 1,
      dealerPosition: 0,
      currentPlayerId: null,
      pot: 0,
      communityCards: [],
      deck: [],
      callAmount: 0,
      players: players.map(p => ({
        id: p.id,
        displayName: p.displayName || p.display_name || p.id,
        is_bot: !!p.is_bot,
        hand: [],
        chips: startingChips,
        bet: 0,
        totalBet: 0,
        status: 'active',
        lastAction: null,
      })),
      config: { startingChips, smallBlind, bigBlind, botDifficulty },
      winner: null,
      winnerName: null,
      handResults: [],
      _actedSet: [],
      _lastRaiserIdx: -1,
    };

    setupNewHand(state, players);
    return state;
  },

  startNextRound(state, activePlayers) {
    const s = clone(state);
    s.round += 1;

    // Remove players with no chips
    for (const p of s.players) {
      if (p.chips <= 0) p.status = 'out';
    }

    const playable = s.players.filter(p => p.status !== 'out');
    if (playable.length < 2) return s;

    // Advance dealer
    const n = s.players.length;
    let newDealer = (s.dealerPosition + 1) % n;
    // Find next non-out player for dealer button
    let tries = 0;
    while (s.players[newDealer].status === 'out' && tries < n) {
      newDealer = (newDealer + 1) % n;
      tries++;
    }
    s.dealerPosition = newDealer;

    setupNewHand(s, activePlayers);
    return s;
  },

  handleAction(state, playerId, action) {
    const s = clone(state);
    // Restore _actedSet from serialization
    if (Array.isArray(s._actedSet)) {
      s._actedSet = new Set(s._actedSet);
    } else if (!(s._actedSet instanceof Set)) {
      s._actedSet = new Set();
    }

    if (s.phase === 'showdown') return { state, error: 'Hand is over.' };
    if (!s.currentPlayerId) return { state, error: 'No action expected.' };
    if (s.currentPlayerId !== playerId) return { state, error: 'Not your turn.' };

    const pIdx = s.players.findIndex(p => p.id === playerId);
    const p = s.players[pIdx];
    if (!p || p.status !== 'active') return { state, error: 'Cannot act.' };

    const highBet = getHighestBet(s);
    const toCall = highBet - p.bet;

    if (action.type === 'fold') {
      p.status = 'folded';
      p.lastAction = 'fold';
      s._actedSet.add(p.id);
      // Serialize _actedSet for cloning
      s._actedSet = Array.from(s._actedSet);
      advanceTurn(s);
      // Re-serialize after advanceTurn may have created new Set
      if (s._actedSet instanceof Set) s._actedSet = Array.from(s._actedSet);
      return { state: s };
    }

    if (action.type === 'check') {
      if (toCall > 0) return { state, error: 'Cannot check, there is a bet to call.' };
      p.lastAction = 'check';
      s._actedSet.add(p.id);
      s._actedSet = Array.from(s._actedSet);
      advanceTurn(s);
      if (s._actedSet instanceof Set) s._actedSet = Array.from(s._actedSet);
      return { state: s };
    }

    if (action.type === 'call') {
      if (toCall <= 0) return { state, error: 'Nothing to call.' };
      const amount = Math.min(toCall, p.chips);
      p.chips -= amount;
      p.bet += amount;
      p.totalBet += amount;
      s.pot += amount;
      if (p.chips === 0) {
        p.status = 'all-in';
        p.lastAction = 'all-in';
      } else {
        p.lastAction = 'call';
      }
      s._actedSet.add(p.id);
      s._actedSet = Array.from(s._actedSet);
      advanceTurn(s);
      if (s._actedSet instanceof Set) s._actedSet = Array.from(s._actedSet);
      return { state: s };
    }

    if (action.type === 'raise') {
      let raiseAmount = parseInt(action.amount, 10);
      if (!raiseAmount || raiseAmount <= 0) return { state, error: 'Invalid raise amount.' };

      // raiseAmount is the total bet the player wants to have
      const minRaise = Math.max(s.config.bigBlind, highBet * 2);

      // If they can't meet the min raise but are going all-in, allow it
      const totalNeeded = raiseAmount - p.bet;
      if (totalNeeded <= 0) return { state, error: 'Raise must be higher than current bet.' };

      if (raiseAmount < minRaise && totalNeeded < p.chips) {
        return { state, error: `Minimum raise is ${minRaise}.` };
      }

      // Cap at all-in
      const actualTotal = Math.min(totalNeeded, p.chips);
      p.chips -= actualTotal;
      p.bet += actualTotal;
      p.totalBet += actualTotal;
      s.pot += actualTotal;

      if (p.chips === 0) {
        p.status = 'all-in';
        p.lastAction = 'all-in';
      } else {
        p.lastAction = 'raise';
      }

      // Reset acted set - everyone except the raiser needs to act again
      s._actedSet = new Set();
      s._actedSet.add(p.id);
      s._lastRaiserIdx = pIdx;

      s._actedSet = Array.from(s._actedSet);
      advanceTurn(s);
      if (s._actedSet instanceof Set) s._actedSet = Array.from(s._actedSet);
      return { state: s };
    }

    return { state, error: 'Unknown action: ' + (action && action.type) };
  },

  getValidActions(state, playerId) {
    if (!state || state.phase === 'showdown') return [];
    if (!state.currentPlayerId || state.currentPlayerId !== playerId) return [];

    const p = state.players.find(pl => pl.id === playerId);
    if (!p || p.status !== 'active') return [];

    const highBet = getHighestBet(state);
    const toCall = highBet - p.bet;
    const actions = ['fold'];

    if (toCall === 0) {
      actions.push('check');
      if (p.chips > 0) actions.push('raise');
    } else {
      if (p.chips > 0) actions.push('call');
      if (p.chips > toCall) actions.push('raise');
    }

    return actions;
  },

  isTurnValid(state, playerId, action) {
    return action && this.getValidActions(state, playerId).includes(action.type);
  },

  isRoundOver(state) {
    return state.phase === 'showdown';
  },

  isGameOver(state) {
    const active = state.players.filter(p => p.chips > 0 || p.status === 'active');
    return active.length <= 1;
  },

  getBotAction(state, botId) {
    const validActions = this.getValidActions(state, botId);
    if (validActions.length === 0) return { type: 'fold' };

    const p = state.players.find(pl => pl.id === botId);
    if (!p) return { type: 'fold' };

    const highBet = getHighestBet(state);
    const toCall = highBet - p.bet;
    const difficulty = state.config.botDifficulty || 'medium';
    const rand = Math.random();

    if (validActions.includes('check')) {
      // Can check for free
      if (rand < 0.70) return { type: 'check' };
      // Raise sometimes
      if (validActions.includes('raise')) {
        const raiseAmt = Math.min(p.chips + p.bet, Math.max(state.config.bigBlind, highBet * 2));
        return { type: 'raise', amount: raiseAmt };
      }
      return { type: 'check' };
    }

    if (validActions.includes('call')) {
      // Facing a bet
      let foldChance, callChance;
      if (difficulty === 'easy') { foldChance = 0.35; callChance = 0.55; }
      else if (difficulty === 'hard') { foldChance = 0.15; callChance = 0.60; }
      else { foldChance = 0.25; callChance = 0.60; }

      if (rand < foldChance) return { type: 'fold' };
      if (rand < foldChance + callChance) return { type: 'call' };
      if (validActions.includes('raise')) {
        const raiseAmt = Math.min(p.chips + p.bet, toCall * 2 + state.config.bigBlind + p.bet);
        return { type: 'raise', amount: raiseAmt };
      }
      return { type: 'call' };
    }

    return { type: 'fold' };
  },

  getPublicState(state, playerId) {
    const s = clone(state);
    delete s.deck;
    delete s._actedSet;
    delete s._lastRaiserIdx;

    // Hide other players' hands unless showdown
    for (const p of s.players) {
      if (p.id !== playerId && s.phase !== 'showdown') {
        p.hand = p.hand.map(() => ({ hole: true }));
      }
    }

    // Compute callAmount for the requesting player
    const highBet = getHighestBet(s);
    const me = s.players.find(p => p.id === playerId);
    s.callAmount = me ? Math.max(0, highBet - me.bet) : 0;
    s.minRaise = Math.max(s.config.bigBlind, highBet * 2);

    return s;
  },

  getRoundSummary(state) {
    const scores = {};
    for (const p of state.players) {
      scores[p.id] = p.chips;
    }
    return {
      scores,
      round: state.round,
      winner: state.winner,
      winnerName: state.winnerName,
      handResults: state.handResults || [],
      pot: state.pot,
    };
  },

  getBuyInAmount(settings) {
    return Math.max(100, parseInt(settings.startingChips) || 1000);
  },

  getChipDeltas(state) {
    const result = {};
    for (const p of state.players) {
      if (!p.is_bot && p.chips > 0) result[p.id] = p.chips;
    }
    return result;
  },
};
