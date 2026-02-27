// Treasure Tower view shell — integrates with chip economy

import { render as ttRender, destroy as ttDestroy, update as ttUpdate } from '../renderers/treasure-tower.js';

// ── Game Logic (inlined from game module) ─────────────────────────────────────

const VOLATILITY_PROFILES = {
  steady: {
    baseMultiplier: 1.12,
    losingChance: 0.25,
    cursedChance: 0.30,
    safeChance: 0.45,
    cursePenalty: -0.04,
  },
  balanced: {
    baseMultiplier: 1.22,
    losingChance: 0.33,
    cursedChance: 0.33,
    safeChance: 0.34,
    cursePenalty: -0.06,
  },
  perilous: {
    baseMultiplier: 1.45,
    losingChance: 0.45,
    cursedChance: 0.25,
    safeChance: 0.30,
    cursePenalty: -0.10,
  },
};

const DOOR_HINTS = {
  safe: ['⚔️', '🌟', '🔮', '🗝️', '💎'],
  cursed: ['🌑', '⚗️', '🕷️', '💀', '🧪'],
  losing: ['🔥', '⚡', '🩸', '💥', '☠️'],
  treasure: ['👑', '💰', '🏆', '🎖️'],
};

const AMBIGUOUS_HINTS = ['✨', '🌙', '🦇', '⛓️', '🗡️'];

const TREASURE_ROOM_CHANCE = 0.08;
const TREASURE_BONUS = 0.25;

const SAFETY_REFUND_RATE = 0.60;

function seededRandom(seed) {
  let s = seed;
  return function() {
    s = Math.sin(s * 9999) * 10000;
    return s - Math.floor(s);
  };
}

function initGame(climbStake = 100, safetyStake = 50, volatility = 'balanced', rngSeed = null) {
  const seed = rngSeed || Math.floor(Math.random() * 1000000);
  
  return {
    phase: 'betting',
    floor: 0,
    maxFloor: 0,
    climbStake,
    safetyStake,
    volatility,
    currentMultiplier: 1,
    nextMultiplier: 1,
    doors: [],
    chosenDoor: null,
    floorHistory: [],
    legacyPoints: 0,
    rngSeed: seed,
    safetyRefunded: false,
    totalWagered: climbStake + safetyStake,
    streak: 0,
    streakBonus: 0,
  };
}

function generateFloor(state, rngFn = null) {
  if (state.phase !== 'betting') return state;
  
  const rng = rngFn || seededRandom(state.rngSeed + state.floor);
  let profile = { ...VOLATILITY_PROFILES[state.volatility] };
  
  const floor = (state.floor || 0) + 1;
  if (floor >= 10) {
    profile.losingChance = Math.min(0.6, profile.losingChance + 0.05);
    profile.cursedChance = Math.min(0.4, profile.cursedChance + 0.03);
    profile.safeChance = 1 - profile.losingChance - profile.cursedChance;
  }
  if (floor >= 20) {
    profile.losingChance = Math.min(0.7, profile.losingChance + 0.05);
    profile.cursePenalty = profile.cursePenalty * 1.2;
  }
  
  const doorCount = 3;
  const doors = [];
  
  const roll = rng();
  let losingCount = Math.floor(doorCount * profile.losingChance);
  let cursedCount = Math.floor(doorCount * profile.cursedChance);
  let safeCount = doorCount - losingCount - cursedCount;
  
  if (roll < profile.losingChance) {
    losingCount = Math.max(1, Math.ceil(doorCount * 0.4));
    cursedCount = Math.floor((doorCount - losingCount) * (profile.cursedChance / (profile.cursedChance + profile.safeChance)));
    safeCount = doorCount - losingCount - cursedCount;
  } else if (roll < profile.losingChance + profile.cursedChance) {
    cursedCount = Math.max(1, Math.ceil(doorCount * 0.4));
    losingCount = Math.floor((doorCount - cursedCount) * (profile.losingChance / (profile.losingChance + profile.safeChance)));
    safeCount = doorCount - losingCount - cursedCount;
  } else {
    safeCount = Math.max(1, Math.ceil(doorCount * 0.5));
    losingCount = Math.floor((doorCount - safeCount) * (profile.losingChance / (profile.losingChance + profile.cursedChance)));
    cursedCount = doorCount - losingCount - safeCount;
  }
  
  losingCount = Math.max(1, losingCount);
  cursedCount = Math.max(0, cursedCount);
  safeCount = Math.max(1, safeCount);
  
  const types = [
    ...Array(losingCount).fill('losing'),
    ...Array(cursedCount).fill('cursed'),
    ...Array(safeCount).fill('safe'),
  ];
  
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [types[i], types[j]] = [types[j], types[i]];
  }
  
  for (let i = 0; i < doorCount; i++) {
    const type = types[i];
    
    let hint;
    const hintRoll = rng();
    
    if (hintRoll < 0.2) {
      const ambiguousHint = AMBIGUOUS_HINTS[Math.floor(rng() * AMBIGUOUS_HINTS.length)];
      hint = ambiguousHint;
    } else {
      let hintPool;
      if (type === 'safe') hintPool = DOOR_HINTS.safe;
      else if (type === 'cursed') hintPool = DOOR_HINTS.cursed;
      else if (type === 'treasure') hintPool = DOOR_HINTS.treasure;
      else hintPool = DOOR_HINTS.losing;
      hint = hintPool[Math.floor(rng() * hintPool.length)];
    }
    
    doors.push({
      id: i,
      type,
      revealed: false,
      chosen: false,
      hint,
    });
  }
  
  const nextMult = state.currentMultiplier * profile.baseMultiplier;
  
  return {
    ...state,
    phase: 'climbing',
    doors,
    chosenDoor: null,
    nextMultiplier: nextMult,
    rngSeed: state.rngSeed + 1,
  };
}

function chooseDoor(state, doorId, rngFn = null) {
  if (state.phase !== 'climbing') return state;
  if (state.chosenDoor !== null) return state;
  
  const door = state.doors.find(d => d.id === doorId);
  if (!door) return state;
  
  const rng = rngFn || seededRandom(state.rngSeed + 100);
  const profile = VOLATILITY_PROFILES[state.volatility];
  
  const revealedDoors = state.doors.map(d => ({ ...d, revealed: true }));
  
  let newMultiplier = state.currentMultiplier;
  let safetyRefunded = state.safetyRefunded;
  let phase = state.phase;
  let newStreak = state.streak || 0;
  let newStreakBonus = state.streakBonus || 0;
  
  if (door.type === 'losing') {
    phase = 'lost';
    newStreak = 0;
    newStreakBonus = 0;
    if (!state.safetyRefunded) {
      const refund = Math.floor(state.safetyStake * SAFETY_REFUND_RATE);
      safetyRefunded = true;
      newMultiplier = -refund;
    } else {
      newMultiplier = 0;
    }
  } else if (door.type === 'cursed') {
    newMultiplier = state.nextMultiplier + profile.cursePenalty;
    newMultiplier = Math.max(0.1, newMultiplier);
    newStreak = 0;
    newStreakBonus = 0;
  } else {
    newMultiplier = state.nextMultiplier;
    newStreak = (state.streak || 0) + 1;
    if (newStreak >= 3) {
      const bonusMult = 1 + (newStreak - 2) * 0.05;
      newStreakBonus = (state.streakBonus || 0) + 0.02;
      newMultiplier = newMultiplier * bonusMult;
    }
    
    const isTreasureRoom = rng() < TREASURE_ROOM_CHANCE;
    if (isTreasureRoom) {
      newMultiplier = newMultiplier * (1 + TREASURE_BONUS);
      door.type = 'treasure';
    }
  }
  
  const newFloor = state.floor + 1;
  const isTreasureRoom = door.type === 'treasure';
  const historyEntry = {
    floor: state.floor + 1,
    doorType: door.type,
    multiplierBefore: state.currentMultiplier,
    multiplierAfter: newMultiplier,
    isTreasure: isTreasureRoom,
  };
  
  return {
    ...state,
    phase,
    doors: revealedDoors,
    chosenDoor: doorId,
    currentMultiplier: newMultiplier,
    floor: newFloor,
    maxFloor: Math.max(state.maxFloor, newFloor),
    floorHistory: [...state.floorHistory, historyEntry],
    safetyRefunded,
    legacyPoints: state.legacyPoints + 1,
    rngSeed: state.rngSeed + 1,
    streak: newStreak,
    streakBonus: newStreakBonus,
  };
}

function cashOut(state) {
  if (state.phase !== 'climbing') return state;
  
  return {
    ...state,
    phase: 'cashedout',
  };
}

function getPostGameResult(state) {
  const totalWagered = state.totalWagered;
  
  let payout = 0;
  let refund = 0;
  let profit = 0;
  
  if (state.phase === 'cashedout') {
    payout = Math.floor(state.climbStake * state.currentMultiplier);
    refund = 0;
  } else if (state.phase === 'lost') {
    payout = 0;
    refund = state.safetyRefunded ? Math.floor(state.safetyStake * SAFETY_REFUND_RATE) : 0;
  } else {
    payout = 0;
    refund = state.safetyStake;
  }
  
  profit = payout + refund - totalWagered;
  
  return {
    floor: state.floor,
    maxFloor: state.maxFloor,
    multiplier: state.currentMultiplier,
    volatility: state.volatility,
    phase: state.phase,
    payout,
    refund,
    totalWagered,
    profit,
    legacyPoints: state.legacyPoints,
    floorHistory: state.floorHistory,
  };
}

// ── Legacy System ───────────────────────────────────────────────────────────

function loadLegacy() {
  try {
    const data = localStorage.getItem('tt_legacy');
    return data ? JSON.parse(data) : {
      totalPoints: 0,
      floorsAllTime: 0,
      bestFloor: 0,
      bestMultiplier: 0,
      gamesPlayed: 0,
      unlockedThemes: [],
    };
  } catch {
    return {
      totalPoints: 0,
      floorsAllTime: 0,
      bestFloor: 0,
      bestMultiplier: 0,
      gamesPlayed: 0,
      unlockedThemes: [],
    };
  }
}

function saveLegacy(data) {
  try {
    localStorage.setItem('tt_legacy', JSON.stringify(data));
  } catch (e) {}
}

function updateLegacy(points, floor, multiplier) {
  const legacy = loadLegacy();
  legacy.totalPoints += points;
  legacy.floorsAllTime += floor;
  legacy.bestFloor = Math.max(legacy.bestFloor, floor);
  legacy.bestMultiplier = Math.max(legacy.bestMultiplier, multiplier);
  legacy.gamesPlayed += 1;
  
  const thresholds = [
    { points: 3000, theme: 'void' },
    { points: 1500, theme: 'golden' },
    { points: 750, theme: 'shadow' },
    { points: 300, theme: 'crystal' },
    { points: 100, theme: 'stone' },
  ];
  
  for (const t of thresholds) {
    if (legacy.totalPoints >= t.points && !legacy.unlockedThemes.includes(t.theme)) {
      legacy.unlockedThemes.push(t.theme);
    }
  }
  
  saveLegacy(legacy);
}

// ── View Shell ─────────────────────────────────────────────────────────────

export function renderTreasureTower(container, socket, state, navigate) {
  container.innerHTML = `<div id="tt-view-root" style="width:100%;height:100%;overflow:hidden"></div>`;
  const root = container.querySelector('#tt-view-root');
  
  const playerId = document.cookie.match(/gc_session=([^;]+)/)?.[1] || null;
  let chipBalance = 0;
  let gameState = null;
  
  const legacy = loadLegacy();
  const bestFloor = legacy.bestFloor;
  
  fetchChipBalance().then(balance => {
    chipBalance = balance;
    renderGame();
  });
  
  function renderGame() {
    ttRender(root, gameState, {
      chipBalance,
      bestFloor,
      navigate,
      onStartGame: handleStartGame,
      onChooseDoor: handleChooseDoor,
      onCashOut: handleCashOut,
      onGiveUp: handleGiveUp,
      onPlayAgain: handlePlayAgain,
    });
  }
  
  async function fetchChipBalance() {
    if (!playerId) return 0;
    try {
      const res = await fetch('/api/chips');
      if (!res.ok) return 0;
      const data = await res.json();
      return data.chips || 0;
    } catch {
      return 0;
    }
  }
  
  async function deductChips(amount) {
    if (!playerId) return true;
    try {
      const res = await fetch('/api/chips/bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, gameType: 'treasure-tower' }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to place bet');
        return false;
      }
      const data = await res.json();
      chipBalance = data.chips;
      return true;
    } catch (e) {
      alert('Connection error');
      return false;
    }
  }
  
  async function awardChips(amount, reason) {
    if (!playerId || amount <= 0) return;
    try {
      await fetch('/api/chips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, reason, gameType: 'treasure-tower' }),
      });
      chipBalance = await fetchChipBalance();
    } catch (e) {}
  }
  
  async function handleStartGame(climbStake, safetyStake, volatility) {
    const total = climbStake + safetyStake;
    if (total > chipBalance) {
      alert('Not enough chips!');
      return;
    }
    
    const success = await deductChips(total);
    if (!success) return;
    
    gameState = initGame(climbStake, safetyStake, volatility, null);
    gameState = generateFloor(gameState, Math.random);
    
    ttUpdate(gameState);
  }
  
  function handleChooseDoor(doorId) {
    if (!gameState || gameState.phase !== 'climbing') return;
    if (gameState.chosenDoor !== null) return;
    
    gameState = chooseDoor(gameState, doorId, Math.random);
    
    ttUpdate(gameState);
    
    if (gameState.phase === 'lost') {
      handleGameEnd();
    }
  }
  
  function handleCashOut() {
    if (!gameState || gameState.phase !== 'climbing') return;
    
    gameState = cashOut(gameState);
    
    const result = getPostGameResult(gameState);
    gameState.result = result;
    
    ttUpdate(gameState);
    
    awardChips(result.payout + result.refund, 'treasure_tower_cashout');
    
    updateLegacy(result.legacyPoints, result.floor, result.multiplier);
  }
  
  function handleGiveUp() {
    if (!gameState || gameState.phase !== 'climbing') return;
    
    const refund = gameState.safetyStake;
    gameState.phase = 'lost';
    gameState.currentMultiplier = 0;
    
    const result = getPostGameResult(gameState);
    result.refund = refund;
    result.payout = 0;
    result.profit = refund - result.totalWagered;
    gameState.result = result;
    
    ttUpdate(gameState);
    
    if (refund > 0) {
      awardChips(refund, 'treasure_tower_safety');
    }
    
    updateLegacy(result.legacyPoints, result.floor, result.multiplier);
  }
  
  function handleGameEnd() {
    if (!gameState) return;
    
    const result = getPostGameResult(gameState);
    gameState.result = result;
    
    if (gameState.phase === 'lost') {
      if (!gameState.safetyRefunded) {
        const refund = Math.floor(gameState.safetyStake * 0.6);
        result.refund = refund;
        if (refund > 0) {
          awardChips(refund, 'treasure_tower_safety');
        }
      }
    }
    
    ttUpdate(gameState);
    
    updateLegacy(result.legacyPoints, result.floor, result.multiplier);
  }
  
  function handlePlayAgain() {
    gameState = null;
    renderGame();
  }
  
  return {
    destroy() {
      ttDestroy();
    },
  };
}
