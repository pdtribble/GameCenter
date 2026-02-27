// GameCenter — client-side app router and Socket.io lifecycle
import { renderHome } from './views/home.js';
import { renderLobby } from './views/lobby.js';
import { renderGame } from './views/game.js';
import { renderProfile } from './views/profile.js';
import { renderPostgame } from './views/postgame.js';
import { renderSingleplayer } from './views/singleplayer.js';
import { renderMinesweeper } from './views/minesweeper.js';
import { renderSnake } from './views/snake.js';
import { render2048 } from './views/2048.js';
import { renderWordle } from './views/wordle.js';
import { renderSudoku } from './views/sudoku.js';
import { renderPacman } from './views/pacman.js';
import { renderTetris } from './views/tetris.js';
import { renderPoker } from './views/poker.js';
import { renderTreasureTower } from './views/treasure-tower.js';
import { renderPong } from './views/pong.js';
import { renderBreakout } from './views/breakout.js';

// ── Scale layout system ───────────────────────────────────────────────────────
const LANDSCAPE_W = 1280, LANDSCAPE_H = 720;
const PORTRAIT_W  = 414,  PORTRAIT_H  = 896;

function getNavHeight() {
  const nav = document.getElementById('bottom-nav');
  return (!nav || nav.classList.contains('nav-hidden')) ? 0 : nav.offsetHeight;
}

function applyScale() {
  const portrait = window.innerWidth < window.innerHeight || window.innerWidth < 600;
  const baseW = portrait ? PORTRAIT_W : LANDSCAPE_W;
  const baseH = portrait ? PORTRAIT_H : LANDSCAPE_H;
  const navH = getNavHeight();
  const availH = window.innerHeight - navH;
  const scale = Math.min(window.innerWidth / baseW, availH / baseH);
  const root = document.getElementById('app-root');
  if (!root) return;
  root.style.width  = baseW + 'px';
  root.style.height = baseH + 'px';
  root.style.transform = `scale(${scale})`;
  root.style.transformOrigin = 'top left';
  root.style.left = Math.round((window.innerWidth  - baseW * scale) / 2) + 'px';
  root.style.top  = Math.round((availH - baseH * scale) / 2) + 'px';
  document.documentElement.dataset.layout = portrait ? 'portrait' : 'landscape';
  document.body.classList.toggle('layout-phone', portrait);
  document.body.classList.toggle('layout-web', !portrait);
}

window.addEventListener('resize', applyScale);
applyScale();

export function isPortrait() {
  return document.documentElement.dataset.layout === 'portrait';
}

// ── Guest mode indicator ───────────────────────────────────────────────────────
let guestMode = false;

export function setGuestMode(isGuest) {
  guestMode = !!isGuest;
  const tab = document.querySelector('#bottom-nav .nav-tab[data-view="profile"]');
  if (!tab) return;
  tab.querySelector('.nav-guest-dot')?.remove();
  tab.querySelector('.nav-chip-balance')?.remove();
  if (guestMode) {
    const dot = document.createElement('span');
    dot.className = 'nav-guest-dot';
    dot.style.cssText = 'display:block;font-size:7px;color:rgba(168,255,168,0.3);font-family:monospace;letter-spacing:1px;line-height:1;margin-top:1px';
    dot.textContent = 'GUEST';
    tab.appendChild(dot);
  }
}

export function updateChipDisplay() {}

// ── Nav visibility ────────────────────────────────────────────────────────────
export function hideNav() {
  const nav = document.getElementById('bottom-nav');
  if (nav) nav.classList.add('nav-hidden');
  applyScale();
}

export function showNav() {
  const nav = document.getElementById('bottom-nav');
  if (nav) nav.classList.remove('nav-hidden');
  applyScale();
}

// Views that get the full screen (bottom nav hidden)
const FULLSCREEN_VIEWS = new Set(['game', 'minesweeper', 'snake', '2048', 'wordle', 'sudoku', 'pacman', 'tetris', 'poker', 'lobby', 'postgame', 'treasure-tower', 'pong', 'breakout']);

// Top-level tabs and which view each maps to
const TOP_LEVEL = { home: 'home', singleplayer: 'singleplayer', profile: 'profile' };

function updateBottomNav(view) {
  document.querySelectorAll('#bottom-nav .nav-tab').forEach(btn => {
    const tabView = btn.dataset.view;
    const isActive = tabView === view ||
      (tabView === 'home' && (view === 'lobby' || view === 'postgame')) ||
      (tabView === 'singleplayer' && (view === 'minesweeper' || view === 'snake' || view === '2048' || view === 'wordle' || view === 'sudoku' || view === 'pacman' || view === 'tetris' || view === 'poker' || view === 'treasure-tower' || view === 'pong' || view === 'breakout'));
    btn.classList.toggle('active', isActive);
  });
}

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  player: null,
  lobby: null,
  lobbyPlayers: [],
  session: null,
  gameState: null,
  view: 'home',
};

// ── Socket.io connection ──────────────────────────────────────────────────────
const socket = io({ autoConnect: true });
let currentView = null;

// ── View router ───────────────────────────────────────────────────────────────
function navigate(view, data = {}) {
  state.view = view;
  if (typeof currentView?.destroy === 'function') currentView.destroy();

  const app = document.getElementById('app');
  app.innerHTML = '';

  if (FULLSCREEN_VIEWS.has(view)) {
    hideNav();
  } else {
    showNav();
  }
  updateBottomNav(view);

  switch (view) {
    case 'home':         currentView = renderHome(app, socket, state, navigate); break;
    case 'lobby':        currentView = renderLobby(app, socket, state, navigate); break;
    case 'game':         currentView = renderGame(app, socket, state, navigate); break;
    case 'profile':      currentView = renderProfile(app, socket, state, navigate); break;
    case 'postgame':     currentView = renderPostgame(app, socket, state, navigate, data); break;
    case 'singleplayer': currentView = renderSingleplayer(app, socket, state, navigate); break;
    case 'minesweeper':  currentView = renderMinesweeper(app, socket, state, navigate, data); break;
    case 'snake':        currentView = renderSnake(app, socket, state, navigate); break;
    case '2048':         currentView = render2048(app, socket, state, navigate); break;
    case 'wordle':       currentView = renderWordle(app, socket, state, navigate); break;
    case 'sudoku':       currentView = renderSudoku(app, socket, state, navigate); break;
    case 'pacman':       currentView = renderPacman(app, socket, state, navigate); break;
    case 'tetris':       currentView = renderTetris(app, socket, state, navigate); break;
    case 'poker':        currentView = renderPoker(app, socket, state, navigate); break;
    case 'treasure-tower': currentView = renderTreasureTower(app, socket, state, navigate); break;
    case 'pong':        currentView = renderPong(app, socket, state, navigate); break;
    case 'breakout':    currentView = renderBreakout(app, socket, state, navigate); break;
    default:             app.innerHTML = '<p style="padding:2rem;color:#fff">Unknown view.</p>';
  }
}

// ── Socket event handlers ─────────────────────────────────────────────────────
socket.on('connect', () => {
  console.log('[socket] connected', socket.id);
  socket.emit('client:rejoin_check');

  const params = new URLSearchParams(location.search);
  const joinCode = params.get('join');
  if (joinCode) {
    navigate('home', { prefillJoinCode: joinCode });
  } else {
    navigate('home');
  }
});

socket.on('disconnect', () => {
  console.log('[socket] disconnected');
  showSystemMessage('Disconnected from server. Reconnecting...');
});

socket.on('server:lobby_created', ({ lobby }) => {
  state.lobby = lobby;
});

socket.on('server:lobby_joined', ({ lobby, players, myPlayerId }) => {
  state.lobby = lobby;
  state.lobbyPlayers = players;
  state.myPlayerId = myPlayerId;
  state.hostPlayerId = lobby?.host_player_id;
  navigate('lobby');
});

socket.on('server:lobby_updated', ({ lobby, players }) => {
  state.lobby = lobby;
  state.lobbyPlayers = players;
  if (state.view === 'lobby' && currentView?.update) {
    currentView.update({ lobby, players });
  }
});

socket.on('server:player_joined', ({ player, role }) => {
  if (state.view === 'lobby' && currentView?.onPlayerJoined) {
    currentView.onPlayerJoined(player, role);
  }
});

socket.on('server:player_left', ({ playerId }) => {
  state.lobbyPlayers = state.lobbyPlayers.filter(p => p.id !== playerId);
  if (state.view === 'lobby' && currentView?.update) {
    currentView.update({ lobby: state.lobby, players: state.lobbyPlayers });
  }
});

socket.on('server:player_reconnected', ({ playerId }) => {
  if (state.view === 'game' && currentView?.onReconnect) {
    currentView.onReconnect(playerId);
  }
});

socket.on('server:host_transferred', ({ newHostId }) => {
  if (state.lobby) state.lobby.host_player_id = newHostId;
  state.hostPlayerId = newHostId;
  if (currentView?.update) currentView.update({ lobby: state.lobby, players: state.lobbyPlayers });
});

socket.on('server:game_started', ({ sessionId, state: gameState, joinCode, hostPlayerId }) => {
  state.session = { id: sessionId };
  state.gameState = gameState;
  if (joinCode) state.joinCode = joinCode;
  if (hostPlayerId) state.hostPlayerId = hostPlayerId;
  socket.currentSessionId = sessionId;
  navigate('game');
});

socket.on('server:game_state', (data) => {
  if (data.state) state.gameState = data.state;
  if (state.view === 'game' && currentView?.update) {
    currentView.update(data);
  }
});

socket.on('server:game_over', ({ results, postGameSummary }) => {
  navigate('postgame', { results, postGameSummary, session: state.session });
});

socket.on('server:lobby_chat', (msg) => {
  if (state.view === 'lobby' && currentView?.onChat) currentView.onChat(msg);
});

socket.on('server:game_chat', (msg) => {
  if (state.view === 'game' && currentView?.onChat) currentView.onChat(msg);
});

socket.on('server:announcement', ({ message }) => {
  showAnnouncement(message);
});

socket.on('server:error', ({ code, message }) => {
  if (currentView?.onError) {
    currentView.onError(code, message);
  } else {
    showSystemMessage(`Error: ${message}`);
  }
});

// ── Bottom nav tab clicks ─────────────────────────────────────────────────────
document.querySelectorAll('#bottom-nav .nav-tab').forEach(btn => {
  btn.addEventListener('click', () => navigate(btn.dataset.view));
});

// ── Theme toggle (moved into profile settings, but keep key available) ────────
const savedTheme = localStorage.getItem('gc_theme') || 'dark';
applyTheme(savedTheme);

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

export function toggleTheme() {
  const current = document.documentElement.dataset.theme || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem('gc_theme', next);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function showSystemMessage(msg) {
  const bar = document.getElementById('announcement-bar');
  bar.textContent = msg;
  bar.style.display = 'block';
  setTimeout(() => { bar.style.display = 'none'; }, 5000);
}

function showAnnouncement(msg) {
  const bar = document.getElementById('announcement-bar');
  bar.textContent = msg;
  bar.style.display = 'block';
  setTimeout(() => { bar.style.display = 'none'; }, 8000);
}

export { socket, state, navigate };
