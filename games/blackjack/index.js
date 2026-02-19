// Blackjack — continuous hand session, optional chip mode
// Game module interface: { version, initGame, handleAction, getState, isTurnValid, isGameOver, getBotAction, getPostGameSummary }

const version = '2.0.0';

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
  if (!hand || hand.length === 0) return 0;
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
  const enableChips = !!lobbySettings.enableChips;
  const startingChips = parseInt(lobbySettings.startingChips) || 1000;

  const humanPlayers = players.filter(p => !p.is_bot);
  const botPlayers = players.filter(p => p.is_bot);
  const allPlayers = [...humanPlayers, ...botPlayers];

  const sessionScores = {};
  const chips = {};
  for (const p of allPlayers) {
    sessionScores[p.id] = { wins: 0, losses: 0, pushes: 0 };
    if (enableChips) chips[p.id] = startingChips;
  }

  const state = {
    // Phases: 'betting' | 'playing' | 'dealer' | 'intermission' | 'session_over'
    phase: enableChips ? 'betting' : 'playing',
    deck: [],
    playerHands: {},
    splitHands: {},     // { [playerId]: [card,...] } — only when split
    activeHand: {},     // { [playerId]: 'main'|'split' }
    playerStatus: {},   // 'playing' | 'stand' | 'bust' | 'blackjack' | 'double' | 'split'
    splitStatus: {},    // status for split hand
    dealerHand: [],
    dealerHidden: true,
    players: allPlayers.map(p => ({ id: p.id, displayName: p.display_name, is_bot: p.is_bot })),
    currentPlayerIndex: -1,
    currentPlayerId: null,
    results: null,
    // Session-level tracking
    sessionScores,
    sittingOut: [],
    handNumber: 1,
    lastHandResults: null,
    intermissionEndsAt: null,
    // Chip mode
    enableChips,
    startingChips,
    chips,
    bets: {},
    splitBets: {},
    bettingEndsAt: null,
  };

  if (enableChips) {
    // Betting phase — don't deal cards yet
    state.bettingEndsAt = Date.now() + 15000;
  } else {
    // Deal immediately
    dealNewHand(state, allPlayers);
  }

  return { state, currentPlayerId: state.currentPlayerId };
}

// ── Deal a new hand ───────────────────────────────────────────────────────────
function dealNewHand(state, players) {
  const deck = makeDeck();
  state.deck = deck;
  state.playerHands = {};
  state.splitHands = {};
  state.activeHand = {};
  state.playerStatus = {};
  state.splitStatus = {};
  state.dealerHand = [];
  state.dealerHidden = true;
  state.currentPlayerId = null;
  state.results = null;
  state.bets = state.enableChips ? state.bets : {};
  state.splitBets = {};

  // Active players: exclude sitting-out (but always include bots)
  const activePlayers = players.filter(p => p.is_bot || !state.sittingOut.includes(p.id));

  for (const p of activePlayers) {
    state.playerHands[p.id] = [deck.pop(), deck.pop()];
    state.playerStatus[p.id] = isBlackjack(state.playerHands[p.id]) ? 'blackjack' : 'playing';
  }

  // Dealer gets 2 — one hidden
  state.dealerHand = [deck.pop(), deck.pop()];

  state.currentPlayerIndex = findFirstActivePlayer(activePlayers, state.playerStatus);
  state.currentPlayerId = state.currentPlayerIndex >= 0
    ? activePlayers[state.currentPlayerIndex].id
    : null;

  // Skip blackjack players at start
  if (state.currentPlayerId && state.playerStatus[state.currentPlayerId] === 'blackjack') {
    advancePlayer(state, activePlayers);
  }

  // Store active player list on state for advancePlayer
  state._activePlayers = activePlayers.map(p => p.id);
}

function findFirstActivePlayer(players, statuses) {
  for (let i = 0; i < players.length; i++) {
    if (statuses[players[i].id] === 'playing') return i;
  }
  return -1;
}

// ── handleAction ──────────────────────────────────────────────────────────────
function handleAction(state, playerId, action) {
  const s = JSON.parse(JSON.stringify(state)); // deep clone
  const events = [];

  // ── System actions (no turn validation) ────────────────────────────────────
  if (playerId === '__system__') {
    return handleSystemAction(s, action, events);
  }

  // ── Intermission actions ────────────────────────────────────────────────────
  if (action.type === 'sit_out' || action.type === 'sit_in') {
    if (s.phase !== 'intermission') {
      return { state, events: [], error: 'Not in intermission phase.' };
    }
    if (action.type === 'sit_out') {
      if (!s.sittingOut.includes(playerId)) s.sittingOut.push(playerId);
    } else {
      s.sittingOut = s.sittingOut.filter(id => id !== playerId);
    }
    return { state: s, events, error: null };
  }

  if (action.type === 'end_game') {
    if (s.phase !== 'intermission') {
      return { state, events: [], error: 'Not in intermission phase.' };
    }
    s.phase = 'session_over';
    return { state: s, events, error: null };
  }

  // ── Betting phase ───────────────────────────────────────────────────────────
  if (action.type === 'bet') {
    if (s.phase !== 'betting') {
      return { state, events: [], error: 'Not in betting phase.' };
    }
    if (s.bets[playerId] !== undefined) {
      return { state, events: [], error: 'You have already placed a bet.' };
    }
    const amount = parseInt(action.amount) || 0;
    const minBet = 10;
    const maxBet = s.chips[playerId] || 0;
    if (amount < minBet) {
      return { state, events: [], error: `Minimum bet is ${minBet}.` };
    }
    if (amount > maxBet) {
      return { state, events: [], error: 'Not enough chips.' };
    }
    s.bets[playerId] = amount;
    s.chips[playerId] -= amount;
    events.push({ type: 'bet', playerId, metadata: { amount } });

    // Check if all active non-sitting-out players have bet
    const activePlayers = s.players.filter(p => !s.sittingOut.includes(p.id));
    const allBet = activePlayers.every(p => s.bets[p.id] !== undefined);
    if (allBet) {
      s.bettingEndsAt = null;
      dealNewHand(s, s.players);
      s.phase = 'playing';
    }
    return { state: s, events, error: null };
  }

  // ── Playing phase ───────────────────────────────────────────────────────────
  if (s.phase !== 'playing') {
    return { state, events: [], error: 'Game is not in playing phase.' };
  }
  if (s.currentPlayerId !== playerId) {
    return { state, events: [], error: 'Not your turn.' };
  }

  const isActiveSplit = s.activeHand[playerId] === 'split';
  const currentHand = isActiveSplit ? s.splitHands[playerId] : s.playerHands[playerId];
  const activePlayers = (s._activePlayers || s.players.map(p => p.id))
    .map(id => s.players.find(p => p.id === id))
    .filter(Boolean);

  if (action.type === 'hit') {
    const card = s.deck.pop();
    currentHand.push(card);
    events.push({ type: 'hit', playerId, metadata: { card, hand: isActiveSplit ? 'split' : 'main' } });

    if (isBust(currentHand)) {
      if (isActiveSplit) {
        s.splitStatus[playerId] = 'bust';
        events.push({ type: 'bust', playerId, metadata: { hand: 'split' } });
        // Split hand done — advance player
        s.activeHand[playerId] = 'done';
        advancePlayer(s, activePlayers);
      } else {
        s.playerStatus[playerId] = 'bust';
        events.push({ type: 'bust', playerId, metadata: { hand: 'main' } });
        // Check split hand
        if (s.splitHands[playerId]) {
          s.activeHand[playerId] = 'split';
        } else {
          advancePlayer(s, activePlayers);
        }
      }
    }
  } else if (action.type === 'stand') {
    if (isActiveSplit) {
      s.splitStatus[playerId] = 'stand';
      events.push({ type: 'stand', playerId, metadata: { hand: 'split' } });
      s.activeHand[playerId] = 'done';
      advancePlayer(s, activePlayers);
    } else {
      s.playerStatus[playerId] = 'stand';
      events.push({ type: 'stand', playerId, metadata: { hand: 'main' } });
      if (s.splitHands[playerId]) {
        s.activeHand[playerId] = 'split';
      } else {
        advancePlayer(s, activePlayers);
      }
    }
  } else if (action.type === 'double_down') {
    if (!s.enableChips) return { state, events: [], error: 'Chips not enabled.' };
    if (currentHand.length !== 2) return { state, events: [], error: 'Can only double on initial 2 cards.' };
    const bet = isActiveSplit ? s.splitBets[playerId] : s.bets[playerId];
    if ((s.chips[playerId] || 0) < bet) return { state, events: [], error: 'Not enough chips to double down.' };
    s.chips[playerId] -= bet;
    if (isActiveSplit) s.splitBets[playerId] *= 2;
    else s.bets[playerId] *= 2;
    const card = s.deck.pop();
    currentHand.push(card);
    events.push({ type: 'double_down', playerId, metadata: { card, hand: isActiveSplit ? 'split' : 'main' } });
    if (isBust(currentHand)) {
      if (isActiveSplit) { s.splitStatus[playerId] = 'bust'; s.activeHand[playerId] = 'done'; }
      else { s.playerStatus[playerId] = 'bust'; }
    } else {
      if (isActiveSplit) { s.splitStatus[playerId] = 'stand'; s.activeHand[playerId] = 'done'; }
      else { s.playerStatus[playerId] = 'stand'; }
    }
    if (!isActiveSplit && s.splitHands[playerId] && s.activeHand[playerId] !== 'done') {
      s.activeHand[playerId] = 'split';
    } else {
      advancePlayer(s, activePlayers);
    }
  } else if (action.type === 'split') {
    if (!s.enableChips) return { state, events: [], error: 'Chips not enabled.' };
    if (s.playerHands[playerId].length !== 2) return { state, events: [], error: 'Can only split on initial 2 cards.' };
    if (s.splitHands[playerId]) return { state, events: [], error: 'Already split.' };
    const hand = s.playerHands[playerId];
    if (cardValue(hand[0]) !== cardValue(hand[1])) return { state, events: [], error: 'Cards must match to split.' };
    const bet = s.bets[playerId];
    if ((s.chips[playerId] || 0) < bet) return { state, events: [], error: 'Not enough chips to split.' };
    s.chips[playerId] -= bet;
    s.splitBets[playerId] = bet;
    // Move second card to split hand
    const splitCard = s.playerHands[playerId].pop();
    s.splitHands[playerId] = [splitCard];
    // Deal one card to each hand
    s.playerHands[playerId].push(s.deck.pop());
    s.splitHands[playerId].push(s.deck.pop());
    s.activeHand[playerId] = 'main';
    events.push({ type: 'split', playerId, metadata: {} });
  } else {
    return { state, events: [], error: 'Unknown action type.' };
  }

  return { state: s, events, error: null };
}

function handleSystemAction(s, action, events) {
  if (action.type === 'deal_next') {
    // Check if enough non-bot players remain (not all sitting out)
    const humanPlayers = s.players.filter(p => !p.is_bot);
    const activeHumans = humanPlayers.filter(p => !s.sittingOut.includes(p.id));
    if (activeHumans.length === 0) {
      s.phase = 'session_over';
      return { state: s, events, error: null };
    }
    s.handNumber++;
    s.intermissionEndsAt = null;
    s.lastHandResults = null;
    if (s.enableChips) {
      // Reset bets, go to betting phase
      s.bets = {};
      s.splitBets = {};
      s.phase = 'betting';
      s.bettingEndsAt = Date.now() + 15000;
      // Also reset hand state for visual clarity
      s.playerHands = {};
      s.splitHands = {};
      s.activeHand = {};
      s.playerStatus = {};
      s.splitStatus = {};
      s.dealerHand = [];
      s.dealerHidden = true;
      s.currentPlayerId = null;
      s._activePlayers = [];
    } else {
      s.phase = 'playing';
      dealNewHand(s, s.players);
    }
    return { state: s, events, error: null };
  }

  if (action.type === 'auto_bet') {
    // Auto-bet minimum for all players who haven't bet yet
    const activePlayers = s.players.filter(p => !s.sittingOut.includes(p.id));
    for (const p of activePlayers) {
      if (s.bets[p.id] === undefined) {
        const minBet = Math.min(10, s.chips[p.id] || 0);
        if (minBet > 0) {
          s.bets[p.id] = minBet;
          s.chips[p.id] -= minBet;
        } else {
          s.bets[p.id] = 0; // broke, still let them play (with 0 bet)
        }
      }
    }
    s.bettingEndsAt = null;
    dealNewHand(s, s.players);
    s.phase = 'playing';
    return { state: s, events, error: null };
  }

  return { state: s, events: [], error: 'Unknown system action.' };
}

// ── advancePlayer ─────────────────────────────────────────────────────────────
function advancePlayer(state, activePlayers) {
  // Find current player index in activePlayers
  const currIdx = activePlayers.findIndex(p => p.id === state.currentPlayerId);
  let next = currIdx + 1;

  // Skip players who aren't in 'playing' status
  while (next < activePlayers.length) {
    const p = activePlayers[next];
    const status = state.playerStatus[p.id];
    if (status === 'playing' || status === undefined) break;
    next++;
  }

  if (next >= activePlayers.length) {
    // All players done — dealer's turn
    runDealer(state, activePlayers);
  } else {
    state.currentPlayerIndex = next;
    state.currentPlayerId = activePlayers[next].id;
    // Skip blackjack
    if (state.playerStatus[state.currentPlayerId] === 'blackjack') {
      advancePlayer(state, activePlayers);
    }
  }
}

// ── runDealer ─────────────────────────────────────────────────────────────────
function runDealer(state, activePlayers) {
  state.phase = 'dealer';
  state.dealerHidden = false;

  // Dealer hits on soft 16, stands on 17+
  while (handTotal(state.dealerHand) < 17) {
    state.dealerHand.push(state.deck.pop());
  }

  const dealerTotal = handTotal(state.dealerHand);
  const dealerBust = isBust(state.dealerHand);

  const placements = [];

  for (const player of activePlayers) {
    const pid = player.id;
    const status = state.playerStatus[pid];
    const pTotal = handTotal(state.playerHands[pid]);

    // Main hand result
    const { result, placement } = computeHandResult(status, pTotal, dealerTotal, dealerBust, activePlayers.length);
    placements.push({ playerId: pid, placement, result, hand: 'main' });

    // Chip resolution for main hand
    if (state.enableChips && state.bets[pid] !== undefined) {
      if (status === 'blackjack') {
        state.chips[pid] += Math.floor(state.bets[pid] * 2.5); // 1.5x payout (bet already deducted)
      } else if (result === 'win') {
        state.chips[pid] += state.bets[pid] * 2;
      } else if (result === 'push') {
        state.chips[pid] += state.bets[pid]; // return bet
      }
      // loss: bet stays deducted
    }

    // Split hand result
    if (state.splitHands[pid]) {
      const splitTotal = handTotal(state.splitHands[pid]);
      const splitSt = state.splitStatus[pid] || 'stand';
      const { result: sResult, placement: sPlacement } = computeHandResult(splitSt, splitTotal, dealerTotal, dealerBust, activePlayers.length);
      placements.push({ playerId: pid, placement: sPlacement, result: sResult, hand: 'split' });

      if (state.enableChips && state.splitBets[pid] !== undefined) {
        if (sResult === 'win') state.chips[pid] += state.splitBets[pid] * 2;
        else if (sResult === 'push') state.chips[pid] += state.splitBets[pid];
      }
    }

    // Update session scores (use main hand result)
    if (state.sessionScores[pid]) {
      if (result === 'win') state.sessionScores[pid].wins++;
      else if (result === 'loss') state.sessionScores[pid].losses++;
      else state.sessionScores[pid].pushes++;
    }
  }

  state.lastHandResults = placements;
  state.phase = 'intermission';
  state.intermissionEndsAt = Date.now() + 5000;
  state.currentPlayerId = null;
  state.results = null;
}

function computeHandResult(status, pTotal, dealerTotal, dealerBust, playerCount) {
  if (status === 'bust') return { result: 'loss', placement: playerCount };
  if (status === 'blackjack') return { result: 'win', placement: 1 };
  if (dealerBust) return { result: 'win', placement: 1 };
  if (pTotal > dealerTotal) return { result: 'win', placement: 1 };
  if (pTotal === dealerTotal) return { result: 'push', placement: 2 };
  return { result: 'loss', placement: playerCount };
}

// ── getState ──────────────────────────────────────────────────────────────────
function getState(state, _playerId) { // eslint-disable-line no-unused-vars
  const s = JSON.parse(JSON.stringify(state));
  // Always hide deck contents
  s.deckSize = s.deck ? s.deck.length : 0;
  delete s.deck;
  delete s._activePlayers;
  // Hide dealer hole card if still hidden
  if (s.dealerHidden && s.dealerHand.length >= 2) {
    s.dealerHand = [s.dealerHand[0], { suit: '?', rank: '?' }];
  }
  return s;
}

// ── isTurnValid ───────────────────────────────────────────────────────────────
function isTurnValid(state, playerId) {
  if (playerId === '__system__') return true;
  // During intermission any player may send sit_out/sit_in/end_game;
  // handleAction validates the specific action type internally.
  if (state.phase === 'intermission') return true;
  // During betting any player who hasn't bet yet may act.
  if (state.phase === 'betting') return state.bets[playerId] === undefined;
  // Playing: only the current player may act.
  return state.phase === 'playing' && state.currentPlayerId === playerId;
}

// ── isGameOver ────────────────────────────────────────────────────────────────
function isGameOver(state) {
  if (state.phase !== 'session_over') return null;
  return { placements: computeFinalPlacements(state) };
}

function computeFinalPlacements(state) {
  const sorted = [...state.players]
    .map(p => ({ playerId: p.id, displayName: p.displayName, ...state.sessionScores[p.id] }))
    .sort((a, b) => (b.wins - a.wins) || (a.losses - b.losses));

  return sorted.map((p, i) => ({
    playerId: p.playerId,
    displayName: p.displayName,
    placement: i + 1,
    result: i === 0 ? 'win' : 'loss',
  }));
}

// ── getBotAction ──────────────────────────────────────────────────────────────
function getBotAction(state, botPlayer, difficulty) {
  if (state.phase === 'betting') {
    const chips = state.chips[botPlayer.id] || 0;
    const minBet = Math.min(10, chips);
    return { type: 'bet', amount: minBet };
  }
  if (state.phase === 'intermission') return null;

  const hand = state.playerHands[botPlayer.id];
  if (!hand) return null;
  const total = handTotal(hand);

  if (difficulty === 'easy') {
    return total < 14 ? { type: 'hit', payload: {} } : { type: 'stand', payload: {} };
  }
  if (difficulty === 'hard') {
    return total <= 17 ? { type: 'hit', payload: {} } : { type: 'stand', payload: {} };
  }
  return total < 17 ? { type: 'hit', payload: {} } : { type: 'stand', payload: {} };
}

// ── getPostGameSummary ────────────────────────────────────────────────────────
function getPostGameSummary(state, _results) { // eslint-disable-line no-unused-vars
  const summary = [];

  for (const player of state.players) {
    const scores = state.sessionScores[player.id];
    if (!scores) continue;
    let val = `${scores.wins}W / ${scores.losses}L / ${scores.pushes}P`;
    if (state.enableChips) {
      val += ` — ${state.chips[player.id] ?? state.startingChips} chips`;
    }
    summary.push({ label: player.displayName || player.id, value: val });
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
