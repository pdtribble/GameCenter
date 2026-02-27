'use strict';

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
  safe: ['⚔️', '🌟', '🔮', '🗝️'],
  cursed: ['🌑', '⚗️', '🕷️', '💀'],
  losing: ['🔥', '⚡', '🩸', '💥'],
};

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
  const rng = seededRandom(seed);
  
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
  };
}

function generateFloor(state, rngFn = null) {
  if (state.phase !== 'betting') return state;
  
  const rng = rngFn || seededRandom(state.rngSeed + state.floor);
  const profile = VOLATILITY_PROFILES[state.volatility];
  
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
  
  const safeHints = DOOR_HINTS.safe;
  const cursedHints = DOOR_HINTS.cursed;
  const losingHints = DOOR_HINTS.losing;
  
  for (let i = 0; i < doorCount; i++) {
    const type = types[i];
    let hintPool;
    if (type === 'safe') hintPool = safeHints;
    else if (type === 'cursed') hintPool = cursedHints;
    else hintPool = losingHints;
    
    const hint = hintPool[Math.floor(rng() * hintPool.length)];
    
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
  const chosenOne = revealedDoors.find(d => d.id === doorId);
  
  let newMultiplier = state.currentMultiplier;
  let safetyRefunded = state.safetyRefunded;
  let phase = state.phase;
  
  if (door.type === 'losing') {
    phase = 'lost';
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
  } else {
    newMultiplier = state.nextMultiplier;
  }
  
  const newFloor = state.floor + 1;
  const historyEntry = {
    floor: state.floor + 1,
    doorType: door.type,
    multiplierBefore: state.currentMultiplier,
    multiplierAfter: newMultiplier,
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
  };
}

function cashOut(state) {
  if (state.phase !== 'climbing') return state;
  
  const payout = Math.floor(state.climbStake * state.currentMultiplier);
  
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

function serializeState(state) {
  return JSON.stringify(state);
}

function deserializeState(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function getVolatilityProfiles() {
  return VOLATILITY_PROFILES;
}

function getDoorHints() {
  return DOOR_HINTS;
}

module.exports = {
  initGame,
  generateFloor,
  chooseDoor,
  cashOut,
  getPostGameResult,
  serializeState,
  deserializeState,
  getVolatilityProfiles,
  getDoorHints,
  SAFETY_REFUND_RATE,
};
