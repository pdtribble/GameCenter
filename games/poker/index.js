// Texas Hold'em Poker
// Simplified: no-limit betting with blinds

const version = '1.0.0';

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VAL = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]));

function makeDeck() {
  const deck = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ suit, rank });
  return shuffle(deck);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Hand evaluation ───────────────────────────────────────────────────────────
function evaluateHand(cards) {
  // Returns { rank: number, description: string, tiebreakers: number[] }
  // Rank: 8=straight flush, 7=four of a kind, 6=full house, 5=flush,
  //       4=straight, 3=three of a kind, 2=two pair, 1=one pair, 0=high card
  const vals = cards.map(c => RANK_VAL[c.rank]).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);

  const counts = {};
  for (const v of vals) counts[v] = (counts[v] || 0) + 1;
  const grouped = Object.entries(counts).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const groups = grouped.map(([v, c]) => ({ val: +v, count: c }));

  const isFlush = suits.every(s => s === suits[0]);
  const sorted = [...vals];
  const isStraight = sorted.length === 5 && sorted[0] - sorted[4] === 4 &&
    new Set(sorted).size === 5;
  // Wheel straight A-2-3-4-5
  const isWheel = sorted.join(',') === '14,5,4,3,2';

  if (isFlush && (isStraight || isWheel)) return { rank: 8, description: 'Straight Flush', tiebreakers: vals };
  if (groups[0].count === 4) return { rank: 7, description: 'Four of a Kind', tiebreakers: [groups[0].val, groups[1]?.val || 0] };
  if (groups[0].count === 3 && groups[1]?.count === 2) return { rank: 6, description: 'Full House', tiebreakers: [groups[0].val, groups[1].val] };
  if (isFlush) return { rank: 5, description: 'Flush', tiebreakers: vals };
  if (isStraight || isWheel) return { rank: 4, description: 'Straight', tiebreakers: isWheel ? [5] : vals };
  if (groups[0].count === 3) return { rank: 3, description: 'Three of a Kind', tiebreakers: [groups[0].val, ...vals.filter(v => v !== groups[0].val)] };
  if (groups[0].count === 2 && groups[1]?.count === 2) return { rank: 2, description: 'Two Pair', tiebreakers: [groups[0].val, groups[1].val, groups[2]?.val || 0] };
  if (groups[0].count === 2) return { rank: 1, description: 'One Pair', tiebreakers: [groups[0].val, ...vals.filter(v => v !== groups[0].val)] };
  return { rank: 0, description: 'High Card', tiebreakers: vals };
}

function bestHand(holeCards, community) {
  const all = [...holeCards, ...community];
  if (all.length < 5) return evaluateHand(all);
  // Try all C(n,5) combos
  let best = null;
  for (let i = 0; i < all.length - 4; i++)
    for (let j = i + 1; j < all.length - 3; j++)
      for (let k = j + 1; k < all.length - 2; k++)
        for (let l = k + 1; l < all.length - 1; l++)
          for (let m = l + 1; m < all.length; m++) {
            const h = evaluateHand([all[i], all[j], all[k], all[l], all[m]]);
            if (!best || compareHands(h, best) > 0) best = h;
          }
  return best;
}

function compareHands(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.max(a.tiebreakers.length, b.tiebreakers.length); i++) {
    const diff = (a.tiebreakers[i] || 0) - (b.tiebreakers[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// ── initGame ──────────────────────────────────────────────────────────────────
function initGame(settings, players) {
  const smallBlind = settings.smallBlind || 10;
  const bigBlind = settings.bigBlind || 20;
  const startingChips = settings.startingChips || 1000;

  const deck = makeDeck();
  const playerIds = players.map(p => p.id);
  const chips = Object.fromEntries(playerIds.map(id => [id, startingChips]));
  const holeCards = Object.fromEntries(playerIds.map(id => [id, [deck.pop(), deck.pop()]]));

  // Blinds
  const sbIdx = 0;
  const bbIdx = 1 % playerIds.length;
  chips[playerIds[sbIdx]] -= smallBlind;
  chips[playerIds[bbIdx]] -= bigBlind;

  const bets = Object.fromEntries(playerIds.map(id => [id, 0]));
  bets[playerIds[sbIdx]] = smallBlind;
  bets[playerIds[bbIdx]] = bigBlind;

  const state = {
    phase: 'preflop',   // preflop | flop | turn | river | showdown
    deck,
    players: players.map(p => ({ id: p.id, displayName: p.display_name, is_bot: p.is_bot })),
    playerIds,
    chips,
    holeCards,
    community: [],
    pot: smallBlind + bigBlind,
    bets,
    currentBet: bigBlind,
    smallBlind,
    bigBlind,
    activePlayers: [...playerIds],   // players still in hand
    foldedPlayers: [],
    actedThisRound: [],
    currentPlayerIndex: (bbIdx + 1) % playerIds.length,
    currentPlayerId: playerIds[(bbIdx + 1) % playerIds.length],
    roundWinner: null,
    allIn: [],
  };

  return { state, currentPlayerId: state.currentPlayerId };
}

// ── handleAction ──────────────────────────────────────────────────────────────
function handleAction(state, playerId, action) {
  if (state.currentPlayerId !== playerId) {
    return { state, events: [], error: 'Not your turn.' };
  }
  if (state.phase === 'showdown') {
    return { state, events: [], error: 'Game is over.' };
  }

  const s = JSON.parse(JSON.stringify(state));
  const events = [];

  if (action.type === 'fold') {
    s.foldedPlayers.push(playerId);
    s.activePlayers = s.activePlayers.filter(id => id !== playerId);
    events.push({ type: 'fold', playerId, metadata: {} });
  } else if (action.type === 'check') {
    if (s.bets[playerId] < s.currentBet) {
      return { state, events: [], error: 'Cannot check — must call or raise.' };
    }
    events.push({ type: 'check', playerId, metadata: {} });
  } else if (action.type === 'call') {
    const toCall = Math.min(s.currentBet - s.bets[playerId], s.chips[playerId]);
    s.chips[playerId] -= toCall;
    s.bets[playerId] += toCall;
    s.pot += toCall;
    events.push({ type: 'call', playerId, metadata: { amount: toCall } });
  } else if (action.type === 'raise') {
    const amount = Number(action.payload?.amount) || s.bigBlind;
    const total = Math.min(s.currentBet - s.bets[playerId] + amount, s.chips[playerId]);
    s.chips[playerId] -= total;
    s.bets[playerId] += total;
    s.pot += total;
    if (s.bets[playerId] > s.currentBet) s.currentBet = s.bets[playerId];
    s.actedThisRound = [playerId]; // reset — everyone must act again
    events.push({ type: 'raise', playerId, metadata: { amount: total } });
  } else {
    return { state, events: [], error: 'Unknown action type.' };
  }

  if (!s.actedThisRound.includes(playerId)) s.actedThisRound.push(playerId);

  // Check if only one player left
  if (s.activePlayers.length === 1) {
    return finishHand(s, events);
  }

  // Check if betting round is complete
  const allActed = s.activePlayers.every(id =>
    s.actedThisRound.includes(id) && s.bets[id] === s.currentBet
  );

  if (allActed) {
    advancePhase(s, events);
  } else {
    advanceAction(s);
  }

  return { state: s, events, error: null };
}

function advanceAction(state) {
  let next = (state.currentPlayerIndex + 1) % state.playerIds.length;
  while (state.foldedPlayers.includes(state.playerIds[next])) {
    next = (next + 1) % state.playerIds.length;
  }
  state.currentPlayerIndex = next;
  state.currentPlayerId = state.playerIds[next];
}

function advancePhase(state, events) {
  state.actedThisRound = [];
  state.bets = Object.fromEntries(state.playerIds.map(id => [id, 0]));
  state.currentBet = 0;

  const phases = ['preflop', 'flop', 'turn', 'river', 'showdown'];
  const nextPhase = phases[phases.indexOf(state.phase) + 1];

  if (nextPhase === 'flop') {
    state.community.push(state.deck.pop(), state.deck.pop(), state.deck.pop());
  } else if (nextPhase === 'turn' || nextPhase === 'river') {
    state.community.push(state.deck.pop());
  } else if (nextPhase === 'showdown') {
    return finishHand(state, events);
  }

  state.phase = nextPhase;
  events.push({ type: 'phase_change', playerId: null, metadata: { phase: nextPhase, community: state.community } });

  // First active player to left of dealer acts first post-flop
  const firstActive = state.activePlayers[0];
  state.currentPlayerIndex = state.playerIds.indexOf(firstActive);
  state.currentPlayerId = firstActive;
}

function finishHand(state, events) {
  state.phase = 'showdown';
  state.currentPlayerId = null;

  let winners;
  if (state.activePlayers.length === 1) {
    winners = [state.activePlayers[0]];
  } else {
    // Evaluate hands
    const handRanks = {};
    for (const pid of state.activePlayers) {
      handRanks[pid] = bestHand(state.holeCards[pid], state.community);
    }
    let best = null;
    for (const pid of state.activePlayers) {
      if (!best || compareHands(handRanks[pid], best.hand) > 0) {
        best = { hand: handRanks[pid], players: [pid] };
      } else if (compareHands(handRanks[pid], best.hand) === 0) {
        best.players.push(pid);
      }
    }
    winners = best.players;
  }

  // Split pot
  const share = Math.floor(state.pot / winners.length);
  for (const w of winners) state.chips[w] += share;

  events.push({ type: 'showdown', playerId: null, metadata: { winners, pot: state.pot } });

  // Build placements
  const playerChips = state.players.map(p => ({ id: p.id, chips: state.chips[p.id] }))
    .sort((a, b) => b.chips - a.chips);

  state.results = playerChips.map((p, i) => ({
    playerId: p.id,
    placement: i + 1,
    result: winners.includes(p.id) ? 'win' : 'loss',
    chips: p.chips,
  }));

  return { state, events, error: null };
}

// ── getState ──────────────────────────────────────────────────────────────────
function getState(state, playerId) {
  const s = JSON.parse(JSON.stringify(state));
  s.deckSize = s.deck.length;
  delete s.deck;

  // Hide other players' hole cards (except in showdown)
  if (s.phase !== 'showdown') {
    for (const pid of s.playerIds) {
      if (pid !== playerId) {
        s.holeCards[pid] = [{ suit: '?', rank: '?' }, { suit: '?', rank: '?' }];
      }
    }
  }

  return s;
}

// ── isTurnValid ───────────────────────────────────────────────────────────────
function isTurnValid(state, playerId) {
  return state.phase !== 'showdown' && state.currentPlayerId === playerId;
}

// ── isGameOver ────────────────────────────────────────────────────────────────
function isGameOver(state) {
  if (state.phase !== 'showdown' || !state.results) return null;
  return { placements: state.results };
}

// ── getBotAction ──────────────────────────────────────────────────────────────
function getBotAction(state, botPlayer, difficulty) {
  const hand = state.holeCards[botPlayer.id];
  const community = state.community;
  const toCall = state.currentBet - (state.bets[botPlayer.id] || 0);

  if (difficulty === 'easy') {
    // Simple: call if can check, else fold
    if (toCall === 0) return { type: 'check', payload: {} };
    if (toCall <= state.chips[botPlayer.id] * 0.1) return { type: 'call', payload: {} };
    return { type: 'fold', payload: {} };
  }

  // Evaluate current hand strength
  const eval_ = bestHand(hand, community);

  if (difficulty === 'hard') {
    if (eval_.rank >= 3) return { type: 'raise', payload: { amount: state.bigBlind * 3 } };
    if (eval_.rank >= 1 || toCall === 0) return toCall === 0 ? { type: 'check', payload: {} } : { type: 'call', payload: {} };
    return { type: 'fold', payload: {} };
  }

  // Medium
  if (toCall === 0) return { type: 'check', payload: {} };
  if (eval_.rank >= 2 || toCall <= state.bigBlind) return { type: 'call', payload: {} };
  return { type: 'fold', payload: {} };
}

// ── getPostGameSummary ────────────────────────────────────────────────────────
function getPostGameSummary(state, results) {
  const summary = [];
  for (const r of results) {
    const player = state.players.find(p => p.id === r.playerId);
    summary.push({
      label: player?.displayName || r.playerId,
      value: `${r.chips} chips — ${r.result}`,
    });
  }
  return summary;
}

module.exports = {
  version,
  initGame,
  handleAction,
  getState,
  isTurnValid,
  isGameOver,
  getBotAction,
  getPostGameSummary,
};
