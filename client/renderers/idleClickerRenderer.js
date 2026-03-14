import * as ic from '../../games/idleClicker/index.js';

const LS_KEY      = 'ic_save';
const LS_BEST_KEY = 'ic_best';
const GAME_TYPE   = 'idle-clicker';
const SAVE_SLOT   = 'autosave';

let containerEl        = null;
let state              = null;
let playerId           = null;
let navigateFn         = null;
let tickIntervalId     = null;
let autoSaveIntervalId = null;
let saveTimeout        = null;

function fmt(n) {
  n = Math.floor(n);
  if (n >= 1e12) return (n / 1e12).toFixed(1).replace(/\.0$/, '') + 'T';
  if (n >= 1e9)  return (n / 1e9).toFixed(1).replace(/\.0$/, '')  + 'B';
  if (n >= 1e6)  return (n / 1e6).toFixed(1).replace(/\.0$/, '')  + 'M';
  if (n >= 1e3)  return (n / 1e3).toFixed(1).replace(/\.0$/, '')  + 'K';
  return n.toString();
}

function injectStyles() {
  if (document.getElementById('ic-styles')) return;
  const s = document.createElement('style');
  s.id = 'ic-styles';
  s.textContent = `
    #ic-root {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      background: #050a05;
      font-family: 'DM Mono', monospace;
      overflow: hidden;
    }
    #ic-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
      background: linear-gradient(180deg, rgba(57,255,20,0.08) 0%, transparent 100%);
      border-bottom: 1px solid #1a2e1a;
      flex-shrink: 0;
    }
    #ic-back {
      background: transparent;
      border: 1px solid #39ff14;
      color: #39ff14;
      padding: 5px 10px;
      font-family: inherit;
      font-size: 12px;
      cursor: pointer;
      border-radius: 4px;
    }
    #ic-back:hover { background: rgba(57,255,20,0.1); }
    #ic-title {
      color: #39ff14;
      font-size: 14px;
      letter-spacing: 2px;
    }
    #ic-score-bar {
      display: flex;
      gap: 24px;
      justify-content: center;
      padding: 8px 16px;
      background: #0a0f0a;
      border-bottom: 1px solid #1a2e1a;
      color: #a8ffa8;
      font-size: 12px;
      flex-shrink: 0;
    }
    #ic-score-bar span { color: #39ff14; font-weight: bold; }
    #ic-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-around;
      padding: 16px 20px;
      overflow: hidden;
    }
    #ic-click-area {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      flex-shrink: 0;
    }
    #ic-click-btn {
      width: 140px;
      height: 140px;
      border-radius: 50%;
      background: linear-gradient(135deg, #0a1a0a 0%, #1a3a1a 100%);
      border: 3px solid #39ff14;
      color: #39ff14;
      font-family: 'DM Mono', monospace;
      font-size: 18px;
      font-weight: bold;
      letter-spacing: 3px;
      cursor: pointer;
      transition: transform 0.08s, box-shadow 0.08s;
      box-shadow: 0 0 20px rgba(57,255,20,0.2), inset 0 0 20px rgba(57,255,20,0.05);
      user-select: none;
      -webkit-tap-highlight-color: transparent;
    }
    #ic-click-btn:hover {
      box-shadow: 0 0 30px rgba(57,255,20,0.35), inset 0 0 20px rgba(57,255,20,0.1);
    }
    #ic-click-btn:active {
      transform: scale(0.92);
      box-shadow: 0 0 12px rgba(57,255,20,0.2);
    }
    #ic-per-click {
      margin-top: 10px;
      color: #a8ffa8;
      font-size: 11px;
      text-align: center;
    }
    #ic-per-click span { color: #39ff14; }
    #ic-upgrades {
      display: flex;
      gap: 12px;
      width: 100%;
      max-width: 680px;
      flex-shrink: 0;
    }
    .ic-upgrade-card {
      flex: 1;
      background: #0a0f0a;
      border: 1px solid #1a2e1a;
      border-radius: 8px;
      padding: 14px 12px;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .ic-upgrade-name {
      color: #39ff14;
      font-size: 13px;
      font-weight: bold;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .ic-upgrade-level {
      color: #a8ffa8;
      font-size: 10px;
      font-weight: normal;
    }
    .ic-upgrade-desc {
      color: #a8ffa8;
      font-size: 11px;
    }
    .ic-upgrade-cost {
      color: #a8ffa8;
      font-size: 11px;
      margin-top: 4px;
    }
    .ic-upgrade-cost span { color: #f0c040; }
    .ic-buy-btn {
      margin-top: 8px;
      background: #39ff14;
      border: none;
      color: #050a05;
      font-family: 'DM Mono', monospace;
      font-size: 12px;
      font-weight: bold;
      padding: 8px;
      border-radius: 4px;
      cursor: pointer;
      transition: opacity 0.15s, background 0.15s;
    }
    .ic-buy-btn:hover:not(:disabled) { background: #50ff30; }
    .ic-buy-btn:disabled { cursor: not-allowed; opacity: 0.35; }
    .ic-float-text {
      position: absolute;
      top: -8px;
      left: 50%;
      color: #39ff14;
      font-family: 'DM Mono', monospace;
      font-size: 16px;
      font-weight: bold;
      pointer-events: none;
      white-space: nowrap;
      animation: ic-float-up 0.8s ease-out forwards;
    }
    @keyframes ic-float-up {
      0%   { opacity: 1; transform: translateX(-50%) translateY(0); }
      100% { opacity: 0; transform: translateX(-50%) translateY(-60px); }
    }
  `;
  document.head.appendChild(s);
}

function saveProgress() {
  if (!state) return;
  const data = {
    score:       state.score,
    bestScore:   state.bestScore,
    clickValue:  state.clickValue,
    passiveRate: state.passiveRate,
    multiplier:  state.multiplier,
    upgrades:    state.upgrades,
    totalClicks: state.totalClicks,
  };
  localStorage.setItem(LS_KEY, JSON.stringify(data));
  localStorage.setItem(LS_BEST_KEY, String(Math.floor(state.bestScore)));

  if (playerId) {
    fetch(`/api/sp/saves/${GAME_TYPE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot: SAVE_SLOT, data }),
    }).catch(() => {});
  }
}

function scheduleSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveProgress, 2000);
}

function loadProgress(callback) {
  let loaded = ic.initGame();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      loaded = { ...loaded, ...saved };
    }
  } catch (_) {}

  callback(loaded);

  if (playerId) {
    fetch(`/api/sp/saves/${GAME_TYPE}`)
      .then(r => r.ok ? r.json() : [])
      .then(saves => {
        const save = saves.find(s => s.slot === SAVE_SLOT);
        if (save?.data?.bestScore != null && save.data.bestScore > state.bestScore) {
          state = { ...state, bestScore: save.data.bestScore };
          updateUI();
        }
      })
      .catch(() => {});
  }
}

function updateUI() {
  if (!containerEl || !state) return;

  const scoreEl    = containerEl.querySelector('#ic-score');
  const bestEl     = containerEl.querySelector('#ic-best');
  const rateEl     = containerEl.querySelector('#ic-rate');
  const clickValEl = containerEl.querySelector('#ic-click-val');

  if (scoreEl)    scoreEl.textContent    = fmt(state.score);
  if (bestEl)     bestEl.textContent     = fmt(state.bestScore);
  if (rateEl)     rateEl.textContent     = fmt(state.passiveRate * state.multiplier);
  if (clickValEl) clickValEl.textContent = fmt(state.clickValue * state.multiplier);

  for (const type of ['cursor', 'auto', 'multi']) {
    const costEl = containerEl.querySelector(`#ic-cost-${type}`);
    const btn    = containerEl.querySelector(`#ic-buy-${type}`);
    const lvlEl  = containerEl.querySelector(`#ic-lvl-${type}`);
    if (!costEl || !btn) continue;

    const cost = ic.getUpgradeCost(type, state.upgrades[type]);
    costEl.textContent = fmt(cost);
    btn.disabled = state.score < cost;
    if (lvlEl) lvlEl.textContent = `Lv.${state.upgrades[type]}`;
  }
}

function spawnFloatText(gained) {
  const area = containerEl.querySelector('#ic-click-area');
  if (!area) return;
  const el = document.createElement('div');
  el.className = 'ic-float-text';
  el.textContent = `+${fmt(gained)}`;
  area.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

function buildUpgradeCards() {
  return ['cursor', 'auto', 'multi'].map(type => {
    const def = ic.UPGRADE_DEFS[type];
    return `
      <div class="ic-upgrade-card">
        <div class="ic-upgrade-name">
          ${def.label}
          <span class="ic-upgrade-level" id="ic-lvl-${type}">Lv.0</span>
        </div>
        <div class="ic-upgrade-desc">${def.desc}</div>
        <div class="ic-upgrade-cost">Cost: <span id="ic-cost-${type}">?</span></div>
        <button class="ic-buy-btn" id="ic-buy-${type}">BUY</button>
      </div>`;
  }).join('');
}

export function render(container, options) {
  containerEl = container;
  navigateFn  = options?.navigate || (() => {});
  playerId    = options?.playerId || null;

  injectStyles();

  container.innerHTML = `
    <div id="ic-root">
      <div id="ic-header">
        <button id="ic-back">← SOLO</button>
        <div id="ic-title">🖱️ IDLE CLICKER</div>
        <div style="width:60px"></div>
      </div>
      <div id="ic-score-bar">
        <div>Score: <span id="ic-score">0</span></div>
        <div>Best: <span id="ic-best">0</span></div>
        <div>/sec: <span id="ic-rate">0</span></div>
      </div>
      <div id="ic-main">
        <div id="ic-click-area">
          <button id="ic-click-btn">CLICK</button>
          <div id="ic-per-click">+<span id="ic-click-val">1</span> per click</div>
        </div>
        <div id="ic-upgrades">
          ${buildUpgradeCards()}
        </div>
      </div>
    </div>
  `;

  loadProgress((loaded) => {
    state = loaded;
    updateUI();
  });

  containerEl.querySelector('#ic-click-btn').addEventListener('click', () => {
    const gained = state.clickValue * state.multiplier;
    state = ic.click(state);
    updateUI();
    spawnFloatText(gained);
    scheduleSave();
  });

  for (const type of ['cursor', 'auto', 'multi']) {
    containerEl.querySelector(`#ic-buy-${type}`).addEventListener('click', () => {
      state = ic.buyUpgrade(state, type);
      updateUI();
      scheduleSave();
    });
  }

  containerEl.querySelector('#ic-back').addEventListener('click', () => {
    saveProgress();
    navigateFn('singleplayer');
  });

  // Passive income tick every 250 ms (dt = 0.25s)
  tickIntervalId = setInterval(() => {
    if (!state || state.passiveRate <= 0) return;
    state = ic.tick(state, 0.25);
    updateUI();
  }, 250);

  // Periodic auto-save every 15 seconds
  autoSaveIntervalId = setInterval(saveProgress, 15000);
}

export function destroy() {
  if (tickIntervalId)     { clearInterval(tickIntervalId);     tickIntervalId     = null; }
  if (autoSaveIntervalId) { clearInterval(autoSaveIntervalId); autoSaveIntervalId = null; }
  if (saveTimeout)        { clearTimeout(saveTimeout);         saveTimeout        = null; }
  saveProgress();
  state       = null;
  containerEl = null;
}
