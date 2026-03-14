'use strict';

// Idle Clicker — pure game logic (ES module, browser-only)

export const UPGRADE_DEFS = {
  cursor: {
    label: 'Cursor',
    desc: '+1 point per click',
    baseCost: 10,
    costMultiplier: 1.5,
  },
  auto: {
    label: 'Auto',
    desc: '+1 point per second',
    baseCost: 50,
    costMultiplier: 1.7,
  },
  multi: {
    label: 'Multiplier',
    desc: '+0.5× to all gains',
    baseCost: 500,
    costMultiplier: 2.5,
  },
};

export function getUpgradeCost(type, level) {
  const def = UPGRADE_DEFS[type];
  return Math.floor(def.baseCost * Math.pow(def.costMultiplier, level));
}

export function initGame() {
  return {
    score: 0,
    bestScore: 0,
    clickValue: 1,
    passiveRate: 0,
    multiplier: 1,
    upgrades: { cursor: 0, auto: 0, multi: 0 },
    totalClicks: 0,
  };
}

export function click(state) {
  const gained = state.clickValue * state.multiplier;
  const score = state.score + gained;
  const bestScore = Math.max(state.bestScore, score);
  return { ...state, score, bestScore, totalClicks: state.totalClicks + 1 };
}

export function tick(state, dt) {
  if (state.passiveRate <= 0) return state;
  const gained = state.passiveRate * state.multiplier * dt;
  const score = state.score + gained;
  const bestScore = Math.max(state.bestScore, score);
  return { ...state, score, bestScore };
}

export function buyUpgrade(state, type) {
  const level = state.upgrades[type];
  const cost = getUpgradeCost(type, level);
  if (state.score < cost) return state;

  let { clickValue, passiveRate, multiplier, score, upgrades } = state;
  score -= cost;

  if (type === 'cursor') clickValue += 1;
  else if (type === 'auto') passiveRate += 1;
  else if (type === 'multi') multiplier += 0.5;

  upgrades = { ...upgrades, [type]: level + 1 };
  return { ...state, score, clickValue, passiveRate, multiplier, upgrades };
}
