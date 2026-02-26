// BS (Bullshit / Cheat) — bluffing card game
// All cards are dealt; players take turns claiming cards are a specific rank.
// Any player can call BS to challenge the claim.
'use strict';

const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const SUITS = ['\u2663','\u2666','\u2665','\u2660']; // ♣♦♥♠

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

// Distribute deck as evenly as possible across players
function dealCards(players) {
  const deck = shuffle(buildDeck());
  const hands = {};
  for (const p of players) hands[p.id] = [];
  deck.forEach((card, i) => {
    hands[players[i % players.length].id].push(card);
  });
  return hands;
}

function nextActiveIdx(players, fromIdx) {
  const active = players.filter(p => p.status === 'playing');
  if (active.length === 0) return 0;
  return (fromIdx + 1) % active.length;
}

function activePlayerAtIdx(players, idx) {
  const active = players.filter(p => p.status === 'playing');
  return active[idx % active.length] || active[0];
}

function indexOfPlayer(players, playerId) {
  const active = players.filter(p => p.status === 'playing');
  return active.findIndex(p => p.id === playerId);
}

module.exports = {
  // ── Metadata ────────────────────────────────────────────────────────────────
  name: 'BS',
  description: "Lie about your cards or get caught — last one holding wins!",
  icon: '🎭',
  minPlayers: 2,
  maxPlayers: 6,
  botFillAllowed: true,
  botFillMin: 3,
  version: '1.0.0',

  // ── Setup ───────────────────────────────────────────────────────────────────
  getSetupConfig() {
    return [
      {
        key: 'winTarget',
        type: 'number',
        label: 'Rounds to win',
        default: 3,
        min: 1,
        max: 10,
        step: 1,
      },
      {
        key: 'buyIn',
        type: 'number',
        label: 'Starting chips',
        default: 100,
        min: 10,
        max: 10000,
        step: 10,
      },
      {
        key: 'betPerCard',
        type: 'number',
        label: 'Chips per card (penalty)',
        default: 5,
        min: 1,
        max: 100,
        step: 1,
      },
    ];
  },

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  initGame(players, config) {
    const hands = dealCards(players);
    const buyIn = Math.max(0, parseInt(config.buyIn, 10) || 100);
    const betPerCard = Math.max(1, parseInt(config.betPerCard, 10) || 5);
    const cardTheme = config.card_theme || 'classic';
    return {
      phase: 'play',          // 'play' | 'bs-window'
      round: 1,
      currentPlayerIdx: 0,
      currentTurn: players[0].id,
      rankIdx: 0,
      currentRank: RANKS[0],  // 'A' first
      pileCount: 0,
      pileCards: [],          // private — hidden in getPublicState
      lastPlay: null,         // { playerId, displayName, count, claimedRank }
      lastChallenge: null,    // { callerId, callerName, targetId, targetName, wasBS, penaltyId, penaltyName, cards }
      card_theme: cardTheme,
      players: players.map(p => ({
        id: p.id,
        displayName: p.displayName || p.display_name || p.id,
        is_bot: !!p.is_bot,
        handSize: hands[p.id].length,
        chips: buyIn,
        status: 'playing',
      })),
      hands,
      scores: Object.fromEntries(players.map(p => [p.id, 0])),
      config: { 
        winTarget: Number(config?.winTarget) || 3,
        buyIn,
        betPerCard,
      },
      winner: null,
    };
  },

  startNextRound(state, activePlayers) {
    const hands = dealCards(activePlayers);
    return {
      ...state,
      phase: 'play',
      round: (state.round || 1) + 1,
      currentPlayerIdx: 0,
      currentTurn: activePlayers[0].id,
      rankIdx: 0,
      currentRank: RANKS[0],
      pileCount: 0,
      pileCards: [],
      lastPlay: null,
      lastChallenge: null,
      players: activePlayers.map(p => ({
        id: p.id,
        displayName: p.displayName || p.display_name || p.id,
        is_bot: p.is_bot,
        handSize: hands[p.id].length,
        chips: state.config?.buyIn || 100,
        status: 'playing',
      })),
      hands,
      winner: null,
    };
  },

  // ── Per-turn ─────────────────────────────────────────────────────────────────
  handleAction(state, playerId, action) {
    const s = clone(state);

    // ── PLAY ──────────────────────────────────────────────────────────────────
    if (action.type === 'play') {
      if (s.phase !== 'play') return { state, error: 'Cannot play now' };
      if (s.currentTurn !== playerId) return { state, error: 'Not your turn' };

      const cards = action.cards;
      if (!Array.isArray(cards) || cards.length < 1 || cards.length > 4) {
        return { state, error: 'Play 1 to 4 cards' };
      }

      // Verify player holds all specified cards
      const hand = s.hands[playerId] || [];
      const remaining = hand.slice();
      for (const c of cards) {
        const i = remaining.findIndex(h => h.suit === c.suit && h.rank === c.rank);
        if (i === -1) return { state, error: 'Card not in your hand' };
        remaining.splice(i, 1);
      }

      // Update hand
      s.hands[playerId] = remaining;
      const pIdx = s.players.findIndex(p => p.id === playerId);
      if (pIdx !== -1) s.players[pIdx].handSize = remaining.length;

      // Add to pile
      for (const c of cards) s.pileCards.push(c);
      s.pileCount += cards.length;

      const playerMeta = s.players[pIdx];
      s.lastChallenge = null;
      s.lastPlay = {
        playerId,
        displayName: playerMeta?.displayName || playerId,
        count: cards.length,
        claimedRank: s.currentRank,
      };

      // If hand is now empty — immediate win (no BS window)
      if (remaining.length === 0) {
        s.scores[playerId] = (s.scores[playerId] || 0) + 1;
        s.winner = playerId;
        // Award chips to winner from all players based on cards remaining
        const betPerCard = s.config.betPerCard || 5;
        for (const pl of s.players) {
          if (pl.id !== playerId && pl.chips > 0) {
            const penalty = Math.min(pl.chips, betPerCard);
            pl.chips -= penalty;
            s.players.find(p => p.id === playerId).chips += penalty;
          }
        }
        return { state: s };
      }

      s.phase = 'bs-window';
      return { state: s };
    }

    // ── PASS (advance turn without calling BS) ────────────────────────────────
    if (action.type === 'pass') {
      if (s.phase !== 'bs-window') return { state, error: 'Nothing to pass on' };

      const activePlayers = s.players.filter(p => p.status === 'playing');
      const prevIdx = indexOfPlayer(s.players, s.lastPlay?.playerId ?? s.currentTurn);
      const nextIdx = (prevIdx + 1) % activePlayers.length;
      s.currentPlayerIdx = nextIdx;
      s.currentTurn = activePlayers[nextIdx].id;
      s.rankIdx = (s.rankIdx + 1) % RANKS.length;
      s.currentRank = RANKS[s.rankIdx];
      s.lastPlay = null;
      s.phase = 'play';
      return { state: s };
    }

    // ── BS (challenge the last play) ──────────────────────────────────────────
    if (action.type === 'bs') {
      if (s.phase !== 'bs-window') return { state, error: 'Nothing to challenge' };
      if (!s.lastPlay) return { state, error: 'No play to challenge' };
      if (playerId === s.lastPlay.playerId) return { state, error: 'Cannot challenge your own play' };

      const lp = s.lastPlay;
      // The last `lp.count` cards in the pile are the played cards
      const playedCards = s.pileCards.slice(s.pileCards.length - lp.count);
      const wasBS = playedCards.some(c => c.rank !== lp.claimedRank);

      const callerMeta = s.players.find(p => p.id === playerId);
      const targetMeta = s.players.find(p => p.id === lp.playerId);
      const penaltyId = wasBS ? lp.playerId : playerId;
      const penaltyMeta = s.players.find(p => p.id === penaltyId);

      // Penalty player picks up the whole pile
      s.hands[penaltyId] = [...(s.hands[penaltyId] || []), ...s.pileCards];
      const penIdx = s.players.findIndex(p => p.id === penaltyId);
      if (penIdx !== -1) s.players[penIdx].handSize = s.hands[penaltyId].length;

      // Chip penalty: winner gets chips from penalty player
      const betPerCard = s.config.betPerCard || 5;
      const cardCount = s.pileCards.length;
      const penaltyPlayer = s.players.find(p => p.id === penaltyId);
      const chipPenalty = Math.min(penaltyPlayer?.chips || 0, cardCount * betPerCard);
      if (chipPenalty > 0) {
        penaltyPlayer.chips -= chipPenalty;
        const winnerIdx = s.players.findIndex(p => p.id === playerId);
        if (winnerIdx !== -1) s.players[winnerIdx].chips += chipPenalty;
      }

      s.lastChallenge = {
        callerId: playerId,
        callerName: callerMeta?.displayName || playerId,
        targetId: lp.playerId,
        targetName: targetMeta?.displayName || lp.playerId,
        wasBS,
        penaltyId,
        penaltyName: penaltyMeta?.displayName || penaltyId,
        cards: playedCards,
      };

      // Clear pile
      s.pileCards = [];
      s.pileCount = 0;
      s.lastPlay = null;

      // Next turn: player after the one who was challenged
      const activePlayers = s.players.filter(p => p.status === 'playing');
      const prevIdx = indexOfPlayer(s.players, lp.playerId);
      const nextIdx = (prevIdx + 1) % activePlayers.length;
      s.currentPlayerIdx = nextIdx;
      s.currentTurn = activePlayers[nextIdx].id;
      s.rankIdx = (s.rankIdx + 1) % RANKS.length;
      s.currentRank = RANKS[s.rankIdx];
      s.phase = 'play';
      return { state: s };
    }

    return { state, error: 'Unknown action' };
  },

  getValidActions(state, playerId) {
    if (!state || state.winner) return [];
    if (state.phase === 'play') {
      return state.currentTurn === playerId ? ['play'] : [];
    }
    if (state.phase === 'bs-window') {
      if (state.lastPlay?.playerId === playerId) return ['pass'];
      return ['bs', 'pass'];
    }
    return [];
  },

  isTurnValid(state, playerId, action) {
    return this.getValidActions(state, playerId).includes(action.type);
  },

  // ── Phase checks ─────────────────────────────────────────────────────────────
  isRoundOver(state) {
    return !!state.winner;
  },

  isGameOver(state) {
    if (!state.scores || !state.config?.winTarget) return false;
    return Object.values(state.scores).some(s => s >= state.config.winTarget);
  },

  // ── Bots ─────────────────────────────────────────────────────────────────────
  getBotAction(state, botId) {
    if (!state) return null;

    if (state.phase === 'play' && state.currentTurn === botId) {
      const hand = state.hands?.[botId] || [];
      if (hand.length === 0) return null;
      const matching = hand.filter(c => c.rank === state.currentRank);
      if (matching.length > 0) {
        // Play 1 or 2 matching cards
        const count = Math.min(matching.length, Math.random() < 0.5 ? 1 : 2);
        return { type: 'play', cards: matching.slice(0, count) };
      }
      // Bluff: play 1–2 random cards
      const count = Math.min(hand.length, Math.random() < 0.6 ? 1 : 2);
      const shuffled = shuffle(hand);
      return { type: 'play', cards: shuffled.slice(0, count) };
    }

    if (state.phase === 'bs-window') {
      if (state.lastPlay?.playerId === botId) return { type: 'pass' };
      // Call BS ~25% of the time
      return Math.random() < 0.25 ? { type: 'bs' } : { type: 'pass' };
    }

    return null;
  },

  // ── State projection ──────────────────────────────────────────────────────────
  getPublicState(state, playerId) {
    if (!state) return state;
    return {
      phase: state.phase,
      round: state.round,
      currentTurn: state.currentTurn,
      currentRank: state.currentRank,
      rankIdx: state.rankIdx,
      pileCount: state.pileCount,
      lastPlay: state.lastPlay,
      lastChallenge: state.lastChallenge,
      players: state.players.map(p => ({
        id: p.id,
        displayName: p.displayName,
        is_bot: p.is_bot,
        handSize: p.handSize,
        chips: p.chips,
        status: p.status,
      })),
      scores: state.scores,
      config: state.config,
      winner: state.winner,
      // Private hand — only for the requesting player
      myHand: playerId ? (state.hands?.[playerId] || []) : [],
    };
  },

  getRoundSummary(state) {
    if (!state) return { scores: {}, round: 1 };
    const winnerId = state.winner;
    const winnerName = state.players?.find(p => p.id === winnerId)?.displayName || 'Unknown';
    const scores = {};
    const chips = {};
    for (const p of (state.players || [])) {
      scores[p.id] = p.chips || 0;
      chips[p.id] = p.chips || 0;
    }
    return {
      winner: winnerId,
      winnerName,
      scores,
      chips,
      round: state.round || 1,
    };
  },
};
