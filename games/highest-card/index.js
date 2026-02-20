// Highest Card — minimal game module proving the standard engine interface
// Rules: each active player flips one card per round; highest card wins.
// Rank order: 2 < 3 < ... < 10 < J < Q < K < A
// Suit tiebreaker: ♣ < ♦ < ♥ < ♠

'use strict';

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUITS = ['\u2663', '\u2666', '\u2665', '\u2660']; // ♣♦♥♠ ascending

// ── Helpers ────────────────────────────────────────────────────────────────────
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

function cardValue(card) {
  return RANKS.indexOf(card.rank) * SUITS.length + SUITS.indexOf(card.suit);
}

function findWinner(hands, flipped) {
  let best = null, bestVal = -1;
  for (const [pid, card] of Object.entries(hands)) {
    if (!flipped[pid] || !card) continue;
    const v = cardValue(card);
    if (v > bestVal) { bestVal = v; best = pid; }
  }
  return best;
}

function dealRound(activePlayers) {
  const deck = shuffle(buildDeck());
  const hands = {}, flipped = {};
  for (const p of activePlayers) {
    hands[p.id] = deck.pop();
    flipped[p.id] = false;
  }
  return { hands, flipped };
}

function clone(s) {
  return JSON.parse(JSON.stringify(s));
}

// ── Module export ──────────────────────────────────────────────────────────────
module.exports = {
  // Metadata
  name: 'Highest Card',
  description: 'Each player flips a card. Highest card wins the round.',
  minPlayers: 2,
  maxPlayers: 6,
  botFillAllowed: true,
  botFillMin: 2,
  version: '1.0.0',

  // ── Setup ─────────────────────────────────────────────────────────────────────
  getSetupConfig() {
    return [
      {
        key: 'winTarget',
        type: 'number',
        label: 'Wins to end game (0 = endless)',
        default: 0,
        min: 0,
        step: 1,
      },
    ];
  },

  // ── Lifecycle ─────────────────────────────────────────────────────────────────
  initGame(players, config) {
    const winTarget = Math.max(0, parseInt(config.winTarget) || 0);
    const { hands, flipped } = dealRound(players);
    return {
      round: 1,
      winTarget,
      scores: Object.fromEntries(players.map(p => [p.id, 0])),
      hands,
      flipped,
      phase: 'drawing',  // 'drawing' | 'revealed'
      winner: null,
      players: players.map(p => ({
        id: p.id,
        displayName: p.displayName || p.display_name || p.id,
        is_bot: !!p.is_bot,
      })),
    };
  },

  startNextRound(state, activePlayers) {
    const { hands, flipped } = dealRound(activePlayers);
    const s = clone(state);
    s.round += 1;
    s.phase = 'drawing';
    s.winner = null;
    s.hands = hands;
    s.flipped = flipped;
    // Update player list (may have changed due to sit-out/sit-in)
    s.players = activePlayers.map(p => ({
      id: p.id,
      displayName: p.displayName || p.display_name || p.id,
      is_bot: !!p.is_bot,
    }));
    // Preserve scores for players no longer active
    for (const p of activePlayers) {
      if (s.scores[p.id] == null) s.scores[p.id] = 0;
    }
    return s;
  },

  // ── Per-turn ──────────────────────────────────────────────────────────────────
  handleAction(state, playerId, action) {
    if (action.type !== 'flip') {
      return { state, error: 'Unknown action: ' + action.type };
    }
    if (state.phase !== 'drawing') {
      return { state, error: 'Round is not in drawing phase.' };
    }
    if (state.flipped[playerId]) {
      return { state, error: 'You already flipped your card.' };
    }

    const s = clone(state);
    s.flipped[playerId] = true;

    // Check if all active players have flipped
    const allFlipped = Object.values(s.flipped).every(Boolean);
    if (allFlipped) {
      s.phase = 'revealed';
      s.winner = findWinner(s.hands, s.flipped);
      if (s.winner) s.scores[s.winner] = (s.scores[s.winner] || 0) + 1;
    }

    return { state: s };
  },

  getValidActions(state, playerId) {
    if (state.phase !== 'drawing') return [];
    if (!state.flipped.hasOwnProperty(playerId)) return [];
    if (state.flipped[playerId]) return [];
    return ['flip'];
  },

  isTurnValid(state, playerId, action) {
    return this.getValidActions(state, playerId).includes(action && action.type);
  },

  // ── Phase checks ──────────────────────────────────────────────────────────────
  isRoundOver(state) {
    return state.phase === 'revealed';
  },

  isGameOver(state) {
    if (!state.winTarget || state.winTarget <= 0) return false;
    return Object.values(state.scores).some(s => s >= state.winTarget);
  },

  // ── Bots ──────────────────────────────────────────────────────────────────────
  getBotAction(state, botId) {
    // Bots always flip immediately
    return { type: 'flip' };
  },

  // ── State projection ──────────────────────────────────────────────────────────
  getPublicState(state, playerId) {
    const s = clone(state);
    // Hide unflipped cards from other players
    for (const pid of Object.keys(s.hands)) {
      if (pid !== playerId && !s.flipped[pid] && s.phase !== 'revealed') {
        s.hands[pid] = null; // face-down
      }
    }
    return s;
  },

  getRoundSummary(state) {
    const winnerPlayer = state.players && state.players.find(p => p.id === state.winner);
    return {
      winner: state.winner,
      winnerName: winnerPlayer ? winnerPlayer.displayName : null,
      hands: state.hands,
      scores: Object.assign({}, state.scores),
      round: state.round,
    };
  },
};
