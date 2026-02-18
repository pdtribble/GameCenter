// Blackjack — single-deck, dealer vs N players
// Follows the standard game module interface exactly.

const version = '1.0.0';

// ── Deck helpers ──────────────────────────────────────────────────────────────
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function makeDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
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

function cardValue(card) {
  if (['J', 'Q', 'K'].includes(card.rank)) return 10;
  if (card.rank === 'A') return 11;
  return parseInt(card.rank);
}

function handTotal(hand) {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    total += cardValue(card);
    if (card.rank === 'A') aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

function isBust(hand) { return handTotal(hand) > 21; }
function isBlackjack(hand) { return hand.length === 2 && handTotal(hand) === 21; }

// ── initGame ──────────────────────────────────────────────────────────────────
function initGame(lobbySettings, players) {
  const deck = makeDeck();
  const humanPlayers = players.filter(p => !p.is_bot);
  const botPlayers = players.filter(p => p.is_bot);

  const playerHands = {};
  const playerStatus = {}; // 'playing' | 'stand' | 'bust' | 'blackjack'

  // Deal 2 cards each
  const allPlayers = [...humanPlayers, ...botPlayers];
  for (const p of allPlayers) {
    playerHands[p.id] = [deck.pop(), deck.pop()];
    playerStatus[p.id] = isBlackjack(playerHands[p.id]) ? 'blackjack' : 'playing';
  }

  // Dealer gets 2 — one hidden
  const dealerHand = [deck.pop(), deck.pop()];

  const state = {
    phase: 'playing',   // 'playing' | 'dealer' | 'finished'
    deck,
    playerHands,
    playerStatus,
    dealerHand,
    dealerHidden: true,
    players: allPlayers.map(p => ({ id: p.id, displayName: p.display_name, is_bot: p.is_bot })),
    currentPlayerIndex: findFirstActivePlayer(allPlayers, playerStatus),
    currentPlayerId: null,
    results: null,
  };

  state.currentPlayerId = state.currentPlayerIndex >= 0
    ? allPlayers[state.currentPlayerIndex].id
    : null;

  // If first player already has blackjack, advance
  if (state.currentPlayerId && playerStatus[state.currentPlayerId] === 'blackjack') {
    advancePlayer(state, allPlayers);
  }

  return { state, currentPlayerId: state.currentPlayerId };
}

function findFirstActivePlayer(players, statuses) {
  for (let i = 0; i < players.length; i++) {
    if (statuses[players[i].id] === 'playing') return i;
  }
  return -1;
}

// ── handleAction ──────────────────────────────────────────────────────────────
function handleAction(state, playerId, action) {
  if (state.phase !== 'playing') {
    return { state, events: [], error: 'Game is not in playing phase.' };
  }
  if (state.currentPlayerId !== playerId) {
    return { state, events: [], error: 'Not your turn.' };
  }

  const events = [];
  const s = JSON.parse(JSON.stringify(state)); // deep clone

  if (action.type === 'hit') {
    const card = s.deck.pop();
    s.playerHands[playerId].push(card);
    events.push({ type: 'hit', playerId, metadata: { card } });

    if (isBust(s.playerHands[playerId])) {
      s.playerStatus[playerId] = 'bust';
      events.push({ type: 'bust', playerId, metadata: {} });
      advancePlayer(s, s.players);
    }
  } else if (action.type === 'stand') {
    s.playerStatus[playerId] = 'stand';
    events.push({ type: 'stand', playerId, metadata: {} });
    advancePlayer(s, s.players);
  } else {
    return { state, events: [], error: 'Unknown action type.' };
  }

  return { state: s, events, error: null };
}

function advancePlayer(state, players) {
  let next = state.currentPlayerIndex + 1;
  while (next < players.length && state.playerStatus[players[next].id] !== 'playing') {
    next++;
  }
  if (next >= players.length) {
    // All players done — dealer's turn
    runDealer(state);
  } else {
    state.currentPlayerIndex = next;
    state.currentPlayerId = players[next].id;
  }
}

function runDealer(state) {
  state.phase = 'dealer';
  state.dealerHidden = false;

  // Dealer hits on soft 16, stands on 17+
  while (handTotal(state.dealerHand) < 17) {
    state.dealerHand.push(state.deck.pop());
  }

  // Compute results
  const dealerTotal = handTotal(state.dealerHand);
  const dealerBust = isBust(state.dealerHand);

  const placements = [];
  const playerCount = state.players.length;

  for (const player of state.players) {
    const pid = player.id;
    const status = state.playerStatus[pid];
    const pTotal = handTotal(state.playerHands[pid]);

    let result, placement;

    if (status === 'bust') {
      result = 'loss';
      placement = playerCount;
    } else if (status === 'blackjack') {
      result = 'win';
      placement = 1;
    } else if (dealerBust) {
      result = 'win';
      placement = 1;
    } else if (pTotal > dealerTotal) {
      result = 'win';
      placement = 1;
    } else if (pTotal === dealerTotal) {
      result = 'push';
      placement = 2;
    } else {
      result = 'loss';
      placement = playerCount;
    }

    placements.push({ playerId: pid, placement, result });
  }

  state.results = placements;
  state.phase = 'finished';
  state.currentPlayerId = null;
}

// ── getState ──────────────────────────────────────────────────────────────────
function getState(state, playerId) {
  // Deep clone then scrub hidden info
  const s = JSON.parse(JSON.stringify(state));

  // Always hide deck contents
  s.deckSize = s.deck.length;
  delete s.deck;

  // Hide dealer hole card if still hidden
  if (s.dealerHidden && s.dealerHand.length >= 2) {
    s.dealerHand = [s.dealerHand[0], { suit: '?', rank: '?' }];
  }

  // Other players' hands are visible in blackjack (no hidden info)
  return s;
}

// ── isTurnValid ───────────────────────────────────────────────────────────────
function isTurnValid(state, playerId) {
  return state.phase === 'playing' && state.currentPlayerId === playerId;
}

// ── isGameOver ────────────────────────────────────────────────────────────────
function isGameOver(state) {
  if (state.phase !== 'finished') return null;
  return { placements: state.results };
}

// ── getBotAction ──────────────────────────────────────────────────────────────
function getBotAction(state, botPlayer, difficulty) {
  const hand = state.playerHands[botPlayer.id];
  const total = handTotal(hand);

  if (difficulty === 'easy') {
    // Hit below 14, stand at 14+
    return total < 14 ? { type: 'hit', payload: {} } : { type: 'stand', payload: {} };
  }
  if (difficulty === 'hard') {
    // Basic strategy: hit soft 17 or below
    return total <= 17 ? { type: 'hit', payload: {} } : { type: 'stand', payload: {} };
  }
  // Medium: standard — hit below 17
  return total < 17 ? { type: 'hit', payload: {} } : { type: 'stand', payload: {} };
}

// ── getPostGameSummary ────────────────────────────────────────────────────────
function getPostGameSummary(state, results) {
  const summary = [];
  const dealerTotal = handTotal(state.dealerHand);
  summary.push({ label: 'Dealer Total', value: String(dealerTotal) });

  for (const r of results) {
    const pTotal = handTotal(state.playerHands[r.playerId]);
    const player = state.players.find(p => p.id === r.playerId);
    summary.push({
      label: `${player?.displayName || r.playerId}`,
      value: `${pTotal} — ${r.result}`,
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
