// GameCenter — client-side app router and Socket.io lifecycle
import { renderHome } from './views/home.js';
import { renderLobby } from './views/lobby.js';
import { renderGame } from './views/game.js';
import { renderProfile } from './views/profile.js';
import { renderLeaderboard } from './views/leaderboard.js';
import { renderPostgame } from './views/postgame.js';
import { showAchievementToast } from './components/achievement-toast.js';

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
  const navbar = document.getElementById('navbar');
  app.innerHTML = '';

  navbar.style.display = view === 'home' ? 'none' : 'flex';

  switch (view) {
    case 'home':        currentView = renderHome(app, socket, state, navigate); break;
    case 'lobby':       currentView = renderLobby(app, socket, state, navigate); break;
    case 'game':        currentView = renderGame(app, socket, state, navigate); break;
    case 'profile':     currentView = renderProfile(app, socket, state, navigate); break;
    case 'leaderboard': currentView = renderLeaderboard(app, socket, state, navigate); break;
    case 'postgame':    currentView = renderPostgame(app, socket, state, navigate, data); break;
    default:            app.innerHTML = '<p style="padding:2rem">Unknown view.</p>';
  }
}

// ── Socket event handlers ─────────────────────────────────────────────────────
socket.on('connect', () => {
  console.log('[socket] connected', socket.id);

  // Check for join code in URL
  const params = new URLSearchParams(location.search);
  const joinCode = params.get('join');
  const errorCode = params.get('error');

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

socket.on('server:lobby_created', ({ lobby, joinCode, inviteUrl }) => {
  state.lobby = lobby;
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
  if (currentView?.update) currentView.update({ lobby: state.lobby, players: state.lobbyPlayers });
});

socket.on('server:game_started', ({ sessionId, state: gameState }) => {
  state.session = { id: sessionId };
  state.gameState = gameState;
  navigate('game');
});

socket.on('server:game_state', (data) => {
  if (data.state) state.gameState = data.state;
  if (state.view === 'game' && currentView?.update) {
    currentView.update(data);
  }
});

socket.on('server:game_event', ({ event }) => {
  if (state.view === 'game' && currentView?.onEvent) {
    currentView.onEvent(event);
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

socket.on('server:achievement', ({ achievement }) => {
  showAchievementToast(achievement);
});

socket.on('server:announcement', ({ message }) => {
  showAnnouncement(message);
});

socket.on('server:error', ({ code, message }) => {
  if (currentView?.onError) {
    currentView.onError(code, message);
  } else {
    alert(`Error: ${message}`);
  }
});

socket.on('server:turn_timer', (data) => {
  if (state.view === 'game' && currentView?.onTimer) currentView.onTimer(data);
});

// ── Theme toggle ──────────────────────────────────────────────────────────────
const savedTheme = localStorage.getItem('gc_theme') || 'light';
applyTheme(savedTheme);

document.getElementById('nav-theme-toggle').addEventListener('click', () => {
  const current = document.documentElement.dataset.theme || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem('gc_theme', next);
});

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const btn = document.getElementById('nav-theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

// ── Nav buttons ───────────────────────────────────────────────────────────────
document.getElementById('nav-home').addEventListener('click', () => navigate('home'));
document.getElementById('nav-profile').addEventListener('click', () => navigate('profile'));

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
