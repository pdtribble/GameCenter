// BS (Cheat) — Players play cards face down claiming a rank.
// Anyone can call BS. Loser picks up the pile. First to empty hand wins.

const version = '1.0.0';

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

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

// ── initGame ──────────────────────────────────────────────────────────────────
function initGame(settings, players) {
  const deck = makeDeck();

  // Deal cards as evenly as possible
  const hands = Object.fromEntries(players.map(p => [p.id, []]));
  let i = 0;
  while (deck.length > 0) {
    hands[players[i % players.length].id].push(deck.pop());
    i++;
  }

  const playerIds = players.map(p => p.id);

  const state = {
    phase: 'playing',
    players: players.map(p => ({ id: p.id, displayName: p.display_name, is_bot: p.is_bot })),
    playerIds,
    hands,
    pile: [],               // actual cards in pile
    pileHistory: [],        // [{ playerId, claimedRank, claimedCount, actualCards }]
    currentPlayerIndex: 0,
    currentPlayerId: playerIds[0],
    currentRankIndex: 0,    // index into RANKS — cycles each turn
    lastPlay: null,         // { playerId, claimedRank, claimedCount }
    results: null,
  };

  return { state, currentPlayerId: state.currentPlayerId };
}

// ── handleAction ──────────────────────────────────────────────────────────────
function handleAction(state, playerId, action) {
  const s = JSON.parse(JSON.stringify(state));
  const events = [];

  if (action.type === 'play') {
    // Validate: player must play cards from their hand
    if (s.currentPlayerId !== playerId) return { state, events: [], error: 'Not your turn.' };
    const { cards, claimedRank, claimedCount } = action.payload || {};

    if (!Array.isArray(cards) || cards.length === 0) return { state, events: [], error: 'Must play at least 1 card.' };
    if (cards.length > 4) return { state, events: [], error: 'Cannot play more than 4 cards at once.' };
    if (claimedCount !== cards.length) return { state, events: [], error: 'Claimed count must match number of cards played.' };

    const requiredRank = RANKS[s.currentRankIndex];
    if (claimedRank !== requiredRank) return { state, events: [], error: `Must claim rank: ${requiredRank}` };

    // Verify player actually has these cards
    const hand = s.hands[playerId];
    const remaining = [...hand];
    for (const card of cards) {
      const idx = remaining.findIndex(c => c.suit === card.suit && c.rank === card.rank);
      if (idx === -1) return { state, events: [], error: 'You don\'t have those cards.' };
      remaining.splice(idx, 1);
    }

    s.hands[playerId] = remaining;
    s.pile.push(...cards);
    s.lastPlay = { playerId, claimedRank, claimedCount: cards.length, actualCards: cards };
    s.pileHistory.push({ playerId, claimedRank, claimedCount: cards.length, actualCards: cards });

    events.push({
      type: 'play',
      playerId,
      metadata: { claimedRank, claimedCount: cards.length },
    });

    // Check win
    if (remaining.length === 0) {
      return finishGame(s, events, playerId);
    }

    // Advance turn
    advanceTurn(s);

  } else if (action.type === 'bs') {
    // Call BS on the last play
    if (!s.lastPlay) return { state, events: [], error: 'No play to call BS on.' };
    if (s.lastPlay.playerId === playerId) return { state, events: [], error: 'Cannot call BS on your own play.' };

    const { actualCards, claimedRank, playerId: lastPlayerId, claimedCount } = s.lastPlay;
    const wasTelling_truth = actualCards.every(c => c.rank === claimedRank);
    const loser = wasTelling_truth ? playerId : lastPlayerId;

    // Loser picks up whole pile
    s.hands[loser].push(...s.pile);
    const pileSize = s.pile.length;
    s.pile = [];
    s.pileHistory = [];
    s.lastPlay = null;

    events.push({
      type: 'bs_called',
      playerId,
      metadata: { caller: playerId, accused: lastPlayerId, wasTruth: wasTelling_truth, loser, pileSize },
    });

    // After BS resolution, the loser goes next
    s.currentPlayerIndex = s.playerIds.indexOf(loser);
    s.currentPlayerId = loser;
    // Rank index stays the same (BS doesn't advance rank)

  } else {
    return { state, events: [], error: 'Unknown action type.' };
  }

  return { state: s, events, error: null };
}

function advanceTurn(state) {
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.playerIds.length;
  state.currentPlayerId = state.playerIds[state.currentPlayerIndex];
  state.currentRankIndex = (state.currentRankIndex + 1) % RANKS.length;
}

function finishGame(state, events, winnerId) {
  state.phase = 'finished';
  state.currentPlayerId = null;

  // Sort by hand size (fewer = better placement)
  const sorted = state.playerIds
    .map(id => ({ id, count: state.hands[id].length }))
    .sort((a, b) => a.count - b.count);

  const placements = sorted.map((p, i) => ({
    playerId: p.id,
    placement: i + 1,
    result: p.id === winnerId ? 'win' : 'loss',
    cardsLeft: p.count,
  }));

  state.results = placements;
  events.push({ type: 'game_over', playerId: winnerId, metadata: { winner: winnerId } });

  return { state, events, error: null };
}

// ── getState ──────────────────────────────────────────────────────────────────
function getState(state, playerId) {
  const s = JSON.parse(JSON.stringify(state));

  // Hide other players' hands (show only counts)
  const handCounts = {};
  for (const pid of s.playerIds) {
    handCounts[pid] = s.hands[pid].length;
    if (pid !== playerId) s.hands[pid] = s.hands[pid].map(() => ({ suit: '?', rank: '?' }));
  }
  s.handCounts = handCounts;

  // Hide actual pile contents (just show size)
  s.pileSize = s.pile.length;
  delete s.pile;
  delete s.pileHistory; // hide history of actual cards

  // Show last claim (not actual cards)
  if (s.lastPlay) {
    delete s.lastPlay.actualCards;
  }

  return s;
}

// ── isTurnValid ───────────────────────────────────────────────────────────────
function isTurnValid(state, playerId) {
  if (state.phase !== 'playing') return false;
  if (state.currentPlayerId === playerId) return true;
  // Any player can call BS (if there's a last play)
  if (state.lastPlay && state.lastPlay.playerId !== playerId) return true;
  return false;
}

// ── isGameOver ────────────────────────────────────────────────────────────────
function isGameOver(state) {
  if (state.phase !== 'finished' || !state.results) return null;
  return { placements: state.results };
}

// ── getBotAction ──────────────────────────────────────────────────────────────
function getBotAction(state, botPlayer, difficulty) {
  const hand = state.hands[botPlayer.id];
  if (!hand) return { type: 'check', payload: {} };

  const requiredRank = RANKS[state.currentRankIndex];

  // Can the bot call BS?
  if (state.lastPlay && state.lastPlay.playerId !== botPlayer.id) {
    const { claimedRank, claimedCount, actualCards } = state.lastPlay;

    if (difficulty === 'hard') {
      // Hard bot knows actual cards (in real game this would be cheating — simplified for bot)
      const truthful = actualCards.every(c => c.rank === claimedRank);
      if (!truthful) return { type: 'bs', payload: {} };
    }

    if (difficulty === 'medium') {
      // Call BS probabilistically based on how many of required rank we can see
      const ownRankCount = hand.filter(c => c.rank === claimedRank).length;
      const maxPossible = 4 - ownRankCount;
      if (claimedCount > maxPossible) return { type: 'bs', payload: {} };
    }

    if (difficulty === 'easy') {
      if (Math.random() < 0.15) return { type: 'bs', payload: {} };
    }
  }

  // It's bot's turn to play
  if (state.currentPlayerId === botPlayer.id) {
    const truthfulCards = hand.filter(c => c.rank === requiredRank);

    if (truthfulCards.length > 0) {
      // Play truthfully
      const toPlay = truthfulCards.slice(0, difficulty === 'hard' ? truthfulCards.length : 1);
      return {
        type: 'play',
        payload: {
          cards: toPlay,
          claimedRank: requiredRank,
          claimedCount: toPlay.length,
        },
      };
    } else {
      // Bluff — play a random card but claim the required rank
      const bluffCard = hand[0];
      return {
        type: 'play',
        payload: {
          cards: [bluffCard],
          claimedRank: requiredRank,
          claimedCount: 1,
        },
      };
    }
  }

  // Fallback — shouldn't reach here
  return { type: 'check', payload: {} };
}

// ── getPostGameSummary ────────────────────────────────────────────────────────
function getPostGameSummary(state, results) {
  return results.map(r => {
    const player = state.players.find(p => p.id === r.playerId);
    return {
      label: player?.displayName || r.playerId,
      value: `${r.result} (${r.cardsLeft} cards left)`,
    };
  });
}

function getSetupConfig() { return []; }

module.exports = {
  version,
  initGame,
  handleAction,
  getState,
  isTurnValid,
  isGameOver,
  getBotAction,
  getPostGameSummary,
  getSetupConfig,
};
