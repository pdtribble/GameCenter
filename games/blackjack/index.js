// Blackjack — standard vs dealer, sequential turns, dealer hits to 17+
// No betting phase: minBet auto-deducted per round. Double allowed on first two cards.

'use strict';

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUITS = ['\u2663', '\u2666', '\u2665', '\u2660']; // ♣♦♥♠

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

/** Best total ≤ 21; number cards = face, J/Q/K = 10, Ace = 1 or 11. */
function handValue(cards) {
  if (!cards || cards.length === 0) return 0;
  let sum = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === 'A') aces++;
    else if (c.rank === 'J' || c.rank === 'Q' || c.rank === 'K') sum += 10;
    else sum += parseInt(c.rank, 10) || 0;
  }
  for (let i = 0; i < aces; i++) {
    if (sum + 11 + (aces - 1 - i) <= 21) sum += 11;
    else sum += 1;
  }
  return sum;
}

function isBlackjack(cards) {
  return cards && cards.length === 2 && handValue(cards) === 21;
}

function isBust(cards) {
  return handValue(cards) > 21;
}

function clone(s) {
  return JSON.parse(JSON.stringify(s));
}

/** Dealer hits on soft 16 and below, stands on soft 17+. */
function dealerShouldHit(cards) {
  const v = handValue(cards);
  return v < 17;
}

function playerEntry(activePlayer, chips, bet = 0, hand = [], status = 'playing', result = null) {
  return {
    id: activePlayer.id,
    displayName: activePlayer.displayName || activePlayer.display_name || activePlayer.id,
    is_bot: !!activePlayer.is_bot,
    hand: hand.slice(),
    bet,
    chips,
    status,
    result,
  };
}

/** Run dealer draw and resolve all hands; mutates s. */
function runDealerAndResults(s) {
  const deck = s.deck;
  const dealerHand = s.dealerHand;

  while (dealerShouldHit(dealerHand)) {
    dealerHand.push(deck.pop());
  }

  const dealerTotal = handValue(dealerHand);
  const dealerBust = dealerTotal > 21;
  const dealerBJ = isBlackjack(dealerHand);

  for (const p of s.players) {
    if (p.result != null) continue; // already set (e.g. blackjack)
    if (p.status === 'bust') {
      p.result = 'lose';
      continue;
    }
    const total = handValue(p.hand);
    if (p.status === 'blackjack') {
      if (dealerBJ) {
        p.result = 'push';
        p.chips += p.bet;
      } else {
        p.result = 'blackjack';
        p.chips += p.bet + Math.floor(p.bet * 1.5);
      }
      continue;
    }
    if (dealerBust) {
      p.result = 'win';
      p.chips += p.bet * 2;
      continue;
    }
    if (total > dealerTotal) {
      p.result = 'win';
      p.chips += p.bet * 2;
    } else if (total < dealerTotal) {
      p.result = 'lose';
    } else {
      p.result = 'push';
      p.chips += p.bet;
    }
  }

  s.phase = 'results';
  s.currentPlayerId = null;
}

/** Advance to next player or run dealer. Returns updated state (may run dealer in same step). */
function advanceTurn(s) {
  const order = s.players.map(p => p.id);
  const idx = order.indexOf(s.currentPlayerId);
  let nextIdx = idx + 1;
  while (nextIdx < order.length) {
    const pid = order[nextIdx];
    const p = s.players.find(pl => pl.id === pid);
    if (p && p.status === 'playing') {
      s.currentPlayerId = pid;
      return s;
    }
    nextIdx++;
  }
  s.currentPlayerId = null;
  s.phase = 'dealer';
  runDealerAndResults(s);
  return s;
}

function dealRound(s, activePlayers) {
  const buyIn = Math.max(0, parseInt(s.config.buyIn, 10) || 100);
  const minBet = Math.max(1, parseInt(s.config.minBet, 10) || 10);
  const deck = shuffle(buildDeck());
  const dealerHand = [deck.pop(), deck.pop()]; // first is hole card
  const players = activePlayers.map(ap => {
    const prev = s.players && s.players.find(p => p.id === ap.id);
    const chips = prev && prev.chips != null ? prev.chips : buyIn;
    const bet = Math.min(minBet, chips);
    const newChips = chips - bet;
    const hand = [deck.pop(), deck.pop()];
    let status = 'playing';
    if (isBlackjack(hand)) status = 'blackjack';
    return playerEntry(ap, newChips, bet, hand, status, null);
  });
  let currentPlayerId = null;
  const firstPlaying = players.findIndex(p => p.status === 'playing');
  if (firstPlaying >= 0) currentPlayerId = players[firstPlaying].id;

  s.deck = deck;
  s.dealerHand = dealerHand;
  s.players = players;
  s.currentPlayerId = currentPlayerId;
  s.phase = currentPlayerId ? 'playing' : 'dealer';

  if (s.phase === 'dealer') runDealerAndResults(s);
  return s;
}

module.exports = {
  name: 'Blackjack',
  description: 'Classic 21 vs the dealer. Hit, stand, or double on your first two cards.',
  icon: '🃏',
  minPlayers: 1,
  maxPlayers: 6,
  botFillAllowed: true,
  botFillMin: 2,
  version: '1.0.0',

  getSetupConfig() {
    return [
      { key: 'buyIn', type: 'number', label: 'Starting chips', default: 100, min: 10, max: 10000, step: 10 },
      { key: 'minBet', type: 'number', label: 'Min bet per round', default: 10, min: 1, max: 500, step: 1 },
    ];
  },

  initGame(players, config) {
    const buyIn = Math.max(0, parseInt(config.buyIn, 10) || 100);
    const minBet = Math.max(1, parseInt(config.minBet, 10) || 10);
    const s = {
      round: 1,
      phase: 'playing',
      deck: [],
      dealerHand: [],
      players: players.map(p => playerEntry(p, buyIn, 0, [], 'playing', null)),
      currentPlayerId: null,
      config: { buyIn, minBet },
    };
    return dealRound(s, players);
  },

  startNextRound(state, activePlayers) {
    const s = clone(state);
    s.round += 1;
    s.phase = 'playing';
    s.dealerHand = [];
    s.deck = [];
    return dealRound(s, activePlayers);
  },

  handleAction(state, playerId, action) {
    const s = clone(state);
    const p = s.players.find(pl => pl.id === playerId);
    if (!p) return { state, error: 'Player not in game.' };
    if (s.phase !== 'playing') return { state, error: 'Not your turn to act.' };
    if (s.currentPlayerId !== playerId) return { state, error: 'Not your turn.' };
    if (p.status !== 'playing') return { state, error: 'You have already acted.' };

    if (action.type === 'hit') {
      p.hand.push(s.deck.pop());
      if (isBust(p.hand)) {
        p.status = 'bust';
        return { state: advanceTurn(s) };
      }
      return { state: s };
    }

    if (action.type === 'stand') {
      p.status = 'stood';
      return { state: advanceTurn(s) };
    }

    if (action.type === 'double') {
      if (p.hand.length !== 2) return { state, error: 'Double only on first two cards.' };
      if (p.chips < p.bet) return { state, error: 'Not enough chips to double.' };
      p.chips -= p.bet;
      p.bet *= 2;
      p.hand.push(s.deck.pop());
      if (isBust(p.hand)) p.status = 'bust';
      else p.status = 'stood';
      return { state: advanceTurn(s) };
    }

    return { state, error: 'Unknown action: ' + (action && action.type) };
  },

  getValidActions(state, playerId) {
    if (state.phase !== 'playing') return [];
    if (state.currentPlayerId !== playerId) return [];
    const p = state.players.find(pl => pl.id === playerId);
    if (!p || p.status !== 'playing') return [];
    const actions = ['hit', 'stand'];
    if (p.hand.length === 2 && p.chips >= p.bet) actions.push('double');
    return actions;
  },

  isTurnValid(state, playerId, action) {
    return action && this.getValidActions(state, playerId).includes(action.type);
  },

  isRoundOver(state) {
    return state.phase === 'results';
  },

  isGameOver() {
    return false;
  },

  getBotAction(state, botId) {
    const p = state.players.find(pl => pl.id === botId);
    if (!p || p.status !== 'playing') return { type: 'stand' };
    const v = handValue(p.hand);
    if (v < 17) return { type: 'hit' };
    return { type: 'stand' };
  },

  getPublicState(state, playerId) {
    const s = clone(state);
    if (s.phase === 'playing' && s.dealerHand && s.dealerHand.length >= 2) {
      s.dealerHand = [{ hole: true }, s.dealerHand[1]];
    }
    return s;
  },

  getRoundSummary(state) {
    const scores = {};
    for (const p of (state.players || [])) {
      scores[p.id] = p.chips != null ? p.chips : 0;
    }
    const order = (state.players || []).slice().sort((a, b) => (b.chips || 0) - (a.chips || 0));
    const top = order[0];
    return {
      scores,
      round: state.round,
      winner: top ? top.id : null,
      winnerName: top ? top.displayName : null,
    };
  },
};
