// Treasure Tower renderer — climb the tower, choose wisely

let containerEl = null;
let state = null;
let options = {};
let styleTag = null;
let audioCtx = null;
let currentView = 'betting';

const VOLATILITY_INFO = {
  steady: { label: 'Steady', desc: 'Lower risk, smaller rewards', base: '1.12x', color: '#4ade80' },
  balanced: { label: 'Balanced', desc: 'Moderate risk and reward', base: '1.22x', color: '#fbbf24' },
  perilous: { label: 'Perilous', desc: 'High risk, massive rewards', base: '1.45x', color: '#f87171' },
};

const STAKE_PRESETS = [25, 50, 100, 250, 500, 1000];

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function injectStyles() {
  if (document.getElementById('tt-styles')) {
    styleTag = document.getElementById('tt-styles');
    return;
  }
  styleTag = document.createElement('style');
  styleTag.id = 'tt-styles';
  styleTag.textContent = `
    @keyframes tt-fade-in {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes tt-door-reveal {
      0% { transform: scale(0.8); opacity: 0; }
      50% { transform: scale(1.05); }
      100% { transform: scale(1); opacity: 1; }
    }
    @keyframes tt-pulse-gold {
      0%,100% { box-shadow: 0 0 20px rgba(240,192,64,0.4); }
      50% { box-shadow: 0 0 40px rgba(240,192,64,0.8); }
    }
    @keyframes tt-glow-safe {
      0%,100% { box-shadow: 0 0 20px rgba(74,222,128,0.5); }
      50% { box-shadow: 0 0 40px rgba(74,222,128,0.9); }
    }
    @keyframes tt-glow-cursed {
      0%,100% { box-shadow: 0 0 20px rgba(134,239,172,0.5); }
      50% { box-shadow: 0 0 40px rgba(134,239,172,0.8); }
    }
    @keyframes tt-glow-losing {
      0%,100% { box-shadow: 0 0 20px rgba(248,113,113,0.5); }
      50% { box-shadow: 0 0 40px rgba(248,113,113,0.9); }
    }
    @keyframes tt-shake {
      0%,100% { transform: translateX(0); }
      25% { transform: translateX(-5px); }
      75% { transform: translateX(5px); }
    }
    @keyframes tt-reveal-losing {
      0% { transform: scale(1); }
      30% { transform: scale(1.1) rotate(-2deg); }
      60% { transform: scale(1.1) rotate(2deg); }
      100% { transform: scale(1); }
    }
    #tt-root {
      width: 100%; height: 100%;
      display: flex; flex-direction: column;
      background: linear-gradient(180deg, #0a0a0f 0%, #151520 50%, #0a0a0f 100%);
      font-family: var(--gc-mono, 'DM Mono', monospace);
      overflow: hidden;
      position: relative;
    }
    #tt-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px; flex-shrink: 0;
      background: rgba(0,0,0,0.4);
      border-bottom: 1px solid rgba(240,192,64,0.1);
    }
    #tt-back, #tt-menu {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(240,192,64,0.2);
      color: #f0c040;
      padding: 8px 14px; border-radius: 6px;
      font-family: inherit; font-size: 0.7rem;
      cursor: pointer; letter-spacing: 1px;
    }
    #tt-back:hover, #tt-menu:hover {
      background: rgba(240,192,64,0.15);
    }
    #tt-title {
      font-size: 1rem; font-weight: bold;
      background: linear-gradient(90deg, #f0c040, #ffd700);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      letter-spacing: 3px;
    }
    #tt-hud {
      display: flex; justify-content: center; gap: 16px; padding: 10px;
      flex-shrink: 0;
      background: rgba(0,0,0,0.3);
    }
    .tt-stat-box {
      background: rgba(0,0,0,0.4);
      border: 1px solid rgba(240,192,64,0.15);
      border-radius: 8px; padding: 8px 16px;
      text-align: center; min-width: 80px;
    }
    .tt-stat-label {
      font-size: 0.55rem; color: rgba(240,240,248,0.4);
      letter-spacing: 1px; margin-bottom: 2px;
    }
    .tt-stat-value {
      font-size: 1rem; font-weight: bold;
      color: #f0c040;
    }
    .tt-stat-value.green { color: #4ade80; }
    .tt-stat-value.red { color: #f87171; }
    #tt-main {
      flex: 1; display: flex; align-items: center; justify-content: center;
      position: relative; padding: 16px;
    }
    /* Betting Panel */
    .tt-panel {
      background: rgba(10,10,15,0.9);
      border: 1px solid rgba(240,192,64,0.2);
      border-radius: 16px;
      padding: 24px;
      max-width: 420px; width: 100%;
      animation: tt-fade-in 0.3s ease;
    }
    .tt-panel-title {
      font-size: 1.2rem; font-weight: bold;
      color: #f0c040;
      text-align: center; margin-bottom: 20px;
      letter-spacing: 2px;
    }
    .tt-section-label {
      font-size: 0.65rem; color: rgba(240,240,248,0.5);
      letter-spacing: 2px; margin-bottom: 8px;
      text-transform: uppercase;
    }
    .tt-stake-row {
      display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px;
    }
    .tt-stake-btn {
      flex: 1; min-width: 60px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(240,192,64,0.2);
      color: #a8ffa8;
      padding: 10px 8px; border-radius: 6px;
      font-family: inherit; font-size: 0.75rem;
      cursor: pointer; transition: all 0.15s;
    }
    .tt-stake-btn:hover {
      background: rgba(240,192,64,0.1);
      border-color: rgba(240,192,64,0.4);
    }
    .tt-stake-btn.selected {
      background: rgba(240,192,64,0.2);
      border-color: #f0c040;
      color: #f0c040;
    }
    .tt-vol-row {
      display: flex; gap: 8px; margin-bottom: 20px;
    }
    .tt-vol-btn {
      flex: 1;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(240,192,64,0.15);
      border-radius: 8px; padding: 12px 8px;
      cursor: pointer; transition: all 0.15s;
      text-align: center;
    }
    .tt-vol-btn:hover { background: rgba(255,255,255,0.06); }
    .tt-vol-btn.selected {
      border-color: var(--vol-color);
      background: rgba(255,255,255,0.05);
    }
    .tt-vol-label {
      font-size: 0.75rem; color: var(--vol-color);
      font-weight: bold; margin-bottom: 4px;
    }
    .tt-vol-desc {
      font-size: 0.55rem; color: rgba(240,240,248,0.4);
    }
    .tt-vol-base {
      font-size: 0.6rem; color: rgba(240,240,248,0.3);
      margin-top: 4px;
    }
    .tt-total-wager {
      text-align: center;
      padding: 12px;
      background: rgba(0,0,0,0.3);
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .tt-total-label { font-size: 0.65rem; color: rgba(240,240,248,0.4); letter-spacing: 1px; }
    .tt-total-value { font-size: 1.4rem; color: #f0c040; font-weight: bold; }
    .tt-play-btn {
      width: 100%;
      background: linear-gradient(135deg, #f0c040, #d4a020);
      border: none;
      color: #0a0a0f;
      padding: 14px; border-radius: 8px;
      font-family: inherit; font-size: 0.9rem; font-weight: bold;
      cursor: pointer; letter-spacing: 2px;
      transition: transform 0.1s;
    }
    .tt-play-btn:hover { transform: scale(1.02); }
    .tt-play-btn:active { transform: scale(0.98); }
    .tt-play-btn:disabled {
      background: #333; color: #666; cursor: not-allowed;
    }
    /* Climbing Panel */
    .tt-floor-display {
      text-align: center; margin-bottom: 20px;
    }
    .tt-floor-num {
      font-size: 2.5rem; font-weight: bold;
      background: linear-gradient(180deg, #f0c040, #b8860b);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .tt-floor-label {
      font-size: 0.7rem; color: rgba(240,240,248,0.4);
      letter-spacing: 3px;
    }
    .tt-multiplier-display {
      display: flex; justify-content: center; gap: 24px; margin-bottom: 24px;
    }
    .tt-mult-box {
      text-align: center;
    }
    .tt-mult-label {
      font-size: 0.6rem; color: rgba(240,240,248,0.4);
      letter-spacing: 1px; margin-bottom: 4px;
    }
    .tt-mult-value {
      font-size: 1.3rem; font-weight: bold;
    }
    .tt-mult-value.current { color: #4ade80; }
    .tt-mult-value.next { color: #f0c040; }
    .tt-risk-meter {
      height: 6px;
      background: rgba(0,0,0,0.3);
      border-radius: 3px;
      margin: 8px auto 16px;
      max-width: 200px;
      overflow: hidden;
    }
    .tt-risk-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.3s ease, background 0.3s ease;
    }
    .tt-risk-label {
      font-size: 0.55rem;
      color: rgba(240,240,248,0.4);
      text-align: center;
      margin-bottom: 4px;
    }
    .tt-arrow {
      display: flex; align-items: center;
      font-size: 1.5rem; color: rgba(240,240,248,0.3);
    }
    .tt-doors-row {
      display: flex; justify-content: center; gap: 16px; margin-bottom: 24px;
    }
    .tt-door {
      width: 80px; height: 100px;
      background: linear-gradient(180deg, #1a1a26, #0f0f18);
      border: 2px solid rgba(240,192,64,0.3);
      border-radius: 12px;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
      position: relative;
      overflow: hidden;
    }
    .tt-door:hover:not(.revealed):not(.disabled) {
      transform: translateY(-4px);
      border-color: #f0c040;
    }
    .tt-door.revealed {
      cursor: default;
    }
    .tt-door.revealed.safe { animation: tt-glow-safe 1s ease infinite; border-color: #4ade80; }
    .tt-door.revealed.cursed { animation: tt-glow-cursed 1s ease infinite; border-color: #86efac; }
    .tt-door.revealed.treasure { animation: tt-pulse-gold 1s ease infinite; border-color: #fbbf24; box-shadow: 0 0 30px rgba(251,191,36,0.6); }
    .tt-door.revealed.losing { animation: tt-glow-losing 1s ease infinite, tt-reveal-losing 0.4s ease; border-color: #f87171; }
    .tt-door.disabled {
      opacity: 0.5; cursor: not-allowed;
    }
    .tt-door-hint {
      font-size: 1.8rem;
    }
    .tt-door-type {
      font-size: 0.55rem;
      margin-top: 4px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .tt-door-type.safe { color: #4ade80; }
    .tt-door-type.cursed { color: #86efac; }
    .tt-door-type.treasure { color: #fbbf24; }
    .tt-door-type.losing { color: #f87171; }
    .tt-action-row {
      display: flex; gap: 12px;
    }
    .tt-action-btn {
      flex: 1;
      padding: 12px; border-radius: 8px;
      font-family: inherit; font-size: 0.75rem;
      font-weight: bold; letter-spacing: 1px;
      cursor: pointer; border: 1px solid;
      transition: all 0.15s;
    }
    .tt-cashout-btn {
      background: rgba(240,192,64,0.15);
      border-color: #f0c040;
      color: #f0c040;
    }
    .tt-cashout-btn:hover {
      background: rgba(240,192,64,0.25);
    }
    .tt-giveup-btn {
      background: rgba(248,113,113,0.1);
      border-color: rgba(248,113,113,0.3);
      color: #f87171;
    }
    .tt-giveup-btn:hover {
      background: rgba(248,113,113,0.2);
    }
    /* Result Panel */
    .tt-result-panel {
      text-align: center;
    }
    .tt-result-title {
      font-size: 1.8rem; font-weight: bold;
      margin-bottom: 16px;
      letter-spacing: 3px;
    }
    .tt-result-title.win { color: #4ade80; }
    .tt-result-title.lose { color: #f87171; }
    .tt-result-title.cashout { color: #f0c040; }
    .tt-result-stats {
      background: rgba(0,0,0,0.3);
      border-radius: 12px; padding: 20px;
      margin-bottom: 20px;
    }
    .tt-result-row {
      display: flex; justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .tt-result-row:last-child { border-bottom: none; }
    .tt-result-key { color: rgba(240,240,248,0.5); font-size: 0.75rem; }
    .tt-result-val { color: #f0c040; font-weight: bold; }
    .tt-result-val.positive { color: #4ade80; }
    .tt-result-val.negative { color: #f87171; }
    .tt-legacy-earned {
      font-size: 1.1rem; color: #fbbf24;
      margin: 16px 0;
    }
    .tt-play-again-btn {
      background: linear-gradient(135deg, #f0c040, #d4a020);
      border: none;
      color: #0a0a0f;
      padding: 14px 32px; border-radius: 8px;
      font-family: inherit; font-size: 0.9rem; font-weight: bold;
      cursor: pointer; letter-spacing: 2px;
    }
    /* Legacy Panel */
    .tt-legacy-display {
      display: flex; justify-content: center; gap: 24px;
      padding: 12px;
      background: rgba(0,0,0,0.2);
      border-radius: 8px; margin-bottom: 16px;
    }
    .tt-legacy-stat {
      text-align: center;
    }
    .tt-legacy-label {
      font-size: 0.55rem; color: rgba(240,240,248,0.4);
      letter-spacing: 1px;
    }
    .tt-legacy-value {
      font-size: 1rem; color: #fbbf24;
    }
    /* Toast */
    .tt-toast {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.9);
      border: 1px solid #f0c040;
      color: #f0c040;
      padding: 12px 24px; border-radius: 8px;
      font-size: 0.85rem;
      z-index: 30;
      animation: tt-fade-in 0.2s ease;
    }
  `;
  document.head.appendChild(styleTag);
}

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playSound(type) {
  if (localStorage.getItem('gc_mute') === '1') return;
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    const vol = 0.08;
    
    if (type === 'hover') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 440;
      osc.type = 'sine';
      gain.gain.setValueAtTime(vol * 0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
      osc.start(now); osc.stop(now + 0.03);
    } else if (type === 'choose') {
      const osc = ctx.createOscillator();
      const gain = ctx.createOscillator();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(330, now);
      osc.frequency.exponentialRampToValueAtTime(660, now + 0.1);
      osc.type = 'triangle';
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.start(now); osc.stop(now + 0.15);
    } else if (type === 'reveal-safe') {
      [523, 659, 784].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.connect(g); g.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        g.gain.setValueAtTime(vol * 1.2, now + i * 0.08);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.2 + i * 0.08);
        osc.start(now + i * 0.08); osc.stop(now + 0.28 + i * 0.08);
      });
    } else if (type === 'reveal-cursed') {
      [200, 180, 160].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.connect(g); g.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sawtooth';
        g.gain.setValueAtTime(vol * 0.8, now + i * 0.1);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.15 + i * 0.1);
        osc.start(now + i * 0.1); osc.stop(now + 0.25 + i * 0.1);
      });
    } else if (type === 'reveal-losing') {
      [150, 100, 80].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.connect(g); g.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sawtooth';
        g.gain.setValueAtTime(vol * 1.5, now + i * 0.1);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.2 + i * 0.1);
        osc.start(now + i * 0.1); osc.stop(now + 0.3 + i * 0.1);
      });
    } else if (type === 'cashout') {
      [523, 659, 784, 1047].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.connect(g); g.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'triangle';
        g.gain.setValueAtTime(vol * 1.2, now + i * 0.06);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.15 + i * 0.06);
        osc.start(now + i * 0.06); osc.stop(now + 0.25 + i * 0.06);
      });
    } else if (type === 'error') {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.frequency.value = 200;
      osc.type = 'square';
      g.gain.setValueAtTime(vol, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now); osc.stop(now + 0.2);
    } else if (type === 'floor-up') {
      [440, 550].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.connect(g); g.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        g.gain.setValueAtTime(vol * 0.6, now + i * 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.1 + i * 0.05);
        osc.start(now + i * 0.05); osc.stop(now + 0.15 + i * 0.05);
      });
    } else if (type === 'ambiguous') {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.linearRampToValueAtTime(400, now + 0.1);
      osc.type = 'sine';
      g.gain.setValueAtTime(vol * 0.5, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.start(now); osc.stop(now + 0.15);
    }
  } catch (e) {}
}

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
  return legacy;
}

function render(container, gameState, opts = {}) {
  containerEl = container;
  options = opts;
  state = gameState;
  
  container.innerHTML = `<div id="tt-root"></div>`;
  injectStyles();
  
  renderCurrentPanel();
}

function renderCurrentPanel() {
  const root = document.getElementById('tt-root');
  if (!root) return;
  
  const legacy = loadLegacy();
  
  root.innerHTML = `
    <div id="tt-header">
      <button id="tt-back">← GAMES</button>
      <div id="tt-title">TREASURE TOWER</div>
      <button id="tt-menu">STATS</button>
    </div>
    <div id="tt-hud">
      <div class="tt-stat-box">
        <div class="tt-stat-label">LEGACY PTS</div>
        <div class="tt-stat-value">${legacy.totalPoints}</div>
      </div>
      <div class="tt-stat-box">
        <div class="tt-stat-label">BEST FLOOR</div>
        <div class="tt-stat-value green">${legacy.bestFloor}</div>
      </div>
      <div class="tt-stat-box">
        <div class="tt-stat-label">GAMES</div>
        <div class="tt-stat-value">${legacy.gamesPlayed}</div>
      </div>
    </div>
    <div id="tt-main"></div>
  `;
  
  document.getElementById('tt-back').addEventListener('click', () => {
    if (options.navigate) options.navigate('singleplayer');
  });
  
  document.getElementById('tt-menu').addEventListener('click', showLegacyPanel);
  
  const main = document.getElementById('tt-main');
  
  if (!state) {
    renderBettingPanel(main);
  } else if (state.phase === 'betting') {
    renderBettingPanel(main);
  } else if (state.phase === 'climbing') {
    renderClimbingPanel(main);
  } else if (state.phase === 'cashedout' || state.phase === 'lost') {
    renderResultPanel(main);
  }
}

function renderBettingPanel(container) {
  const legacy = loadLegacy();
  let climbStake = options.climbStake || 100;
  let safetyStake = options.safetyStake || 50;
  let volatility = options.volatility || 'balanced';
  
  container.innerHTML = `
    <div class="tt-panel" id="tt-betting-panel">
      <div class="tt-panel-title">🏰 CLIMB THE TOWER</div>
      
      <div class="tt-legacy-display">
        <div class="tt-legacy-stat">
          <div class="tt-legacy-label">BEST x</div>
          <div class="tt-legacy-value">${legacy.bestMultiplier.toFixed(2)}</div>
        </div>
        <div class="tt-legacy-stat">
          <div class="tt-legacy-label">THEMES</div>
          <div class="tt-legacy-value">${legacy.unlockedThemes.length}/5</div>
        </div>
      </div>
      
      <div class="tt-section-label">CLIMB STAKE</div>
      <div class="tt-stake-row" id="tt-climb-stakes">
        ${STAKE_PRESETS.map(s => `
          <button class="tt-stake-btn ${s === climbStake ? 'selected' : ''}" data-stake="${s}">${s}</button>
        `).join('')}
      </div>
      
      <div class="tt-section-label">SAFETY STAKE (60% refund on loss)</div>
      <div class="tt-stake-row" id="tt-safety-stakes">
        ${STAKE_PRESETS.map(s => `
          <button class="tt-stake-btn ${s === safetyStake ? 'selected' : ''}" data-stake="${s}">${s}</button>
        `).join('')}
      </div>
      
      <div class="tt-section-label">VOLATILITY</div>
      <div class="tt-vol-row" id="tt-vol-options">
        ${Object.entries(VOLATILITY_INFO).map(([key, v]) => `
          <button class="tt-vol-btn ${key === volatility ? 'selected' : ''}" data-vol="${key}" style="--vol-color:${v.color}">
            <div class="tt-vol-label">${v.label}</div>
            <div class="tt-vol-desc">${v.desc}</div>
            <div class="tt-vol-base">Base: ${v.base}</div>
          </button>
        `).join('')}
      </div>
      
      <div class="tt-chip-balance" style="text-align:center;margin-bottom:16px;padding:8px;background:rgba(0,0,0,0.3);border-radius:6px">
        <span style="color:rgba(240,240,248,0.5);font-size:0.65rem;letter-spacing:1px">YOUR CHIPS</span>
        <div style="color:#f0c040;font-size:1.3rem;font-weight:bold">${options.chipBalance || 0}</div>
      </div>
      
      <div class="tt-total-wager">
        <div class="tt-total-label">TOTAL WAGER</div>
        <div class="tt-total-value" id="tt-total-wager">${climbStake + safetyStake}</div>
      </div>
      
      <button class="tt-play-btn" id="tt-start-btn">START CLIMB</button>
    </div>
  `;
  
  container.querySelectorAll('#tt-climb-stakes .tt-stake-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      playSound('hover');
      container.querySelectorAll('#tt-climb-stakes .tt-stake-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      climbStake = parseInt(btn.dataset.stake, 10);
      updateTotalWager();
    });
  });
  
  container.querySelectorAll('#tt-safety-stakes .tt-stake-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      playSound('hover');
      container.querySelectorAll('#tt-safety-stakes .tt-stake-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      safetyStake = parseInt(btn.dataset.stake, 10);
      updateTotalWager();
    });
  });
  
  container.querySelectorAll('#tt-vol-options .tt-vol-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      playSound('hover');
      container.querySelectorAll('#tt-vol-options .tt-vol-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      volatility = btn.dataset.vol;
    });
  });
  
  function updateTotalWager() {
    const totalEl = document.getElementById('tt-total-wager');
    if (totalEl) totalEl.textContent = climbStake + safetyStake;
  }
  
  const startBtn = document.getElementById('tt-start-btn');
  startBtn.addEventListener('click', () => {
    if (options.onStartGame) {
      const total = climbStake + safetyStake;
      if (total > (options.chipBalance || 0)) {
        playSound('error');
        showToast('Not enough chips!');
        return;
      }
      options.onStartGame(climbStake, safetyStake, volatility);
    }
  });
}

function renderClimbingPanel(container) {
  const volInfo = VOLATILITY_INFO[state.volatility];
  const history = state.floorHistory || [];
  
  const historyHtml = history.length > 0 ? `
    <div class="tt-history-strip" style="display:flex;justify-content:center;gap:6px;margin-bottom:16px;flex-wrap:wrap">
      ${history.slice(-8).map(h => `
        <div class="tt-history-dot" style="width:20px;height:20px;border-radius:4px;background:rgba(0,0,0,0.4);border:1px solid ${h.doorType === 'safe' ? '#4ade80' : h.doorType === 'cursed' ? '#86efac' : '#f87171'};display:flex;align-items:center;justify-content:center;font-size:10px" title="Floor ${h.floor}: ${h.doorType}">
          ${h.floor}
        </div>
      `).join('')}
    </div>
  ` : '';
  
  const riskLevel = state.volatility === 'steady' ? 25 : state.volatility === 'balanced' ? 50 : 75;
  const riskColor = riskLevel < 35 ? '#4ade80' : riskLevel < 60 ? '#fbbf24' : '#f87171';
  
  const streak = state.streak || 0;
  const streakBonus = state.streakBonus || 0;
  const streakHtml = streak >= 2 ? `
    <div class="tt-streak-display" style="text-align:center;margin-bottom:12px">
      <span style="color:#fbbf24;font-size:0.8rem">🔥 ${streak} FLOOR STREAK</span>
      <span style="color:#4ade80;font-size:0.7rem;margin-left:8px">+${(streakBonus * 100).toFixed(0)}% BONUS</span>
    </div>
  ` : '';
  
  container.innerHTML = `
    <div class="tt-panel">
      <div class="tt-floor-display">
        <div class="tt-floor-num">FLOOR ${state.floor}</div>
        <div class="tt-floor-label">TREASURE TOWER</div>
      </div>
      
      ${streakHtml}
      ${historyHtml}
      
      <div class="tt-risk-meter">
        <div class="tt-risk-fill" style="width:${riskLevel}%;background:${riskColor}"></div>
      </div>
      <div class="tt-risk-label">${state.volatility.toUpperCase()} RISK</div>
      
      <div class="tt-multiplier-display">
        <div class="tt-mult-box">
          <div class="tt-mult-label">CURRENT</div>
          <div class="tt-mult-value current">${state.currentMultiplier.toFixed(2)}x</div>
        </div>
        <div class="tt-arrow">→</div>
        <div class="tt-mult-box">
          <div class="tt-mult-label">NEXT FLOOR</div>
          <div class="tt-mult-value next">${state.nextMultiplier.toFixed(2)}x</div>
        </div>
      </div>
      
      <div class="tt-section-label" style="text-align:center;margin-bottom:16px">CHOOSE A DOOR</div>
      
      <div class="tt-doors-row" id="tt-doors">
        ${state.doors.map((door, i) => `
          <div class="tt-door ${door.revealed ? 'revealed ' + door.type : ''}" data-id="${door.id}">
            <div class="tt-door-hint">${door.revealed ? getDoorEmoji(door.type) : door.hint}</div>
            <div class="tt-door-type ${door.type}" style="display:${door.revealed ? 'block' : 'none'}">${door.type}</div>
          </div>
        `).join('')}
      </div>
      
      <div class="tt-action-row">
        <button class="tt-action-btn tt-cashout-btn" id="tt-cashout-btn">💰 CASH OUT <span style="display:block;font-size:0.65rem">${Math.floor(state.climbStake * state.currentMultiplier)} chips</span></button>
        <button class="tt-action-btn tt-giveup-btn" id="tt-giveup-btn">🏳️ GIVE UP</button>
      </div>
    </div>
  `;
  
  container.querySelectorAll('.tt-door:not(.revealed):not(.disabled)').forEach(door => {
    door.addEventListener('mouseenter', () => playSound('hover'));
    door.addEventListener('click', () => {
      const id = parseInt(door.dataset.id, 10);
      if (options.onChooseDoor) {
        playSound('choose');
        options.onChooseDoor(id);
      }
    });
  });
  
  document.getElementById('tt-cashout-btn').addEventListener('click', () => {
    if (options.onCashOut) {
      playSound('cashout');
      options.onCashOut();
    }
  });
  
  document.getElementById('tt-giveup-btn').addEventListener('click', () => {
    if (options.onGiveUp) {
      playSound('error');
      options.onGiveUp();
    }
  });
}

function getDoorEmoji(type) {
  if (type === 'safe') return '⚔️';
  if (type === 'cursed') return '🌑';
  if (type === 'treasure') return '👑';
  if (type === 'losing') return '🔥';
  return '❓';
}

function renderResultPanel(container) {
  const result = state.result || {};
  const isWin = state.phase === 'cashedout';
  const isLoss = state.phase === 'lost';
  
  let title = '';
  let titleClass = '';
  
  if (isWin) {
    title = '💰 CASHED OUT!';
    titleClass = 'cashout';
  } else if (isLoss) {
    title = '💀 FALLEN!';
    titleClass = 'lose';
  }
  
  const payout = result.payout || 0;
  const refund = result.refund || 0;
  const totalWager = result.totalWagered || 0;
  const profit = payout + refund - totalWager;
  
  container.innerHTML = `
    <div class="tt-panel tt-result-panel">
      <div class="tt-result-title ${titleClass}">${title}</div>
      
      <div class="tt-legacy-earned">
        +${state.legacyPoints || 0} Legacy Points
      </div>
      
      <div class="tt-result-stats">
        <div class="tt-result-row">
          <span class="tt-result-key">FLOOR REACHED</span>
          <span class="tt-result-val">${state.floor}</span>
        </div>
        <div class="tt-result-row">
          <span class="tt-result-key">MAX MULTIPLIER</span>
          <span class="tt-result-val">${state.currentMultiplier.toFixed(2)}x</span>
        </div>
        <div class="tt-result-row">
          <span class="tt-result-key">TOTAL WAGERED</span>
          <span class="tt-result-val">-${totalWager}</span>
        </div>
        <div class="tt-result-row">
          <span class="tt-result-key">PAYOUT</span>
          <span class="tt-result-val ${payout > 0 ? 'positive' : ''}">+${payout}</span>
        </div>
        <div class="tt-result-row">
          <span class="tt-result-key">SAFETY REFUND</span>
          <span class="tt-result-val ${refund > 0 ? 'positive' : ''}">+${refund}</span>
        </div>
        <div class="tt-result-row">
          <span class="tt-result-key">PROFIT</span>
          <span class="tt-result-val ${profit >= 0 ? 'positive' : 'negative'}">${profit >= 0 ? '+' : ''}${profit}</span>
        </div>
      </div>
      
      <button class="tt-play-again-btn" id="tt-play-again-btn">PLAY AGAIN</button>
    </div>
  `;
  
  document.getElementById('tt-play-again-btn').addEventListener('click', () => {
    if (options.onPlayAgain) {
      options.onPlayAgain();
    }
  });
}

function showLegacyPanel() {
  const legacy = loadLegacy();
  const main = document.getElementById('tt-main');
  if (!main) return;
  
  const themes = [
    { id: 'stone', name: 'Stone Tower', threshold: 100 },
    { id: 'crystal', name: 'Crystal Tower', threshold: 300 },
    { id: 'shadow', name: 'Shadow Tower', threshold: 750 },
    { id: 'golden', name: 'Golden Tower', threshold: 1500 },
    { id: 'void', name: 'Void Tower', threshold: 3000 },
  ];
  
  main.innerHTML = `
    <div class="tt-panel">
      <div class="tt-panel-title">🏆 LEGACY</div>
      
      <div class="tt-legacy-display">
        <div class="tt-legacy-stat">
          <div class="tt-legacy-label">TOTAL PTS</div>
          <div class="tt-legacy-value">${legacy.totalPoints}</div>
        </div>
        <div class="tt-legacy-stat">
          <div class="tt-legacy-label">FLOORS ALL</div>
          <div class="tt-legacy-value">${legacy.floorsAllTime}</div>
        </div>
      </div>
      
      <div class="tt-section-label">TOWER THEMES</div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">
        ${themes.map(t => {
          const unlocked = legacy.totalPoints >= t.threshold;
          const active = legacy.unlockedThemes.includes(t.id);
          return `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:rgba(0,0,0,0.3);border-radius:6px;${unlocked ? '' : 'opacity:0.4'}">
              <span style="color:${unlocked ? '#f0c040' : '#666'}">${t.name}</span>
              <span style="font-size:0.7rem;color:rgba(240,240,248,0.4)">${t.threshold} pts</span>
            </div>
          `;
        }).join('')}
      </div>
      
      <button class="tt-action-btn tt-giveup-btn" id="tt-back-to-game" style="width:100%">BACK</button>
    </div>
  `;
  
  document.getElementById('tt-back-to-game').addEventListener('click', renderCurrentPanel);
}

function showToast(msg) {
  const root = document.getElementById('tt-root');
  if (!root) return;
  
  const existing = root.querySelector('.tt-toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = 'tt-toast';
  toast.textContent = msg;
  root.appendChild(toast);
  
  setTimeout(() => toast.remove(), 2000);
}

function update(gameState) {
  state = gameState;
  if (containerEl) {
    renderCurrentPanel();
  }
}

function destroy() {
  if (styleTag) {
    styleTag.remove();
    styleTag = null;
  }
  
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
  
  if (containerEl) {
    containerEl.innerHTML = '';
    containerEl = null;
  }
  
  state = null;
}

export function renderTT(container, gameState, opts = {}) {
  render(container, gameState, opts);
}

export function updateTT(gameState) {
  update(gameState);
}

export function destroyTT() {
  destroy();
}

export { render, update, destroy };
