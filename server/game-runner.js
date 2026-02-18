const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const achievementEngine = require('./achievement-engine');
const botRunner = require('./bot-runner');

const CHAT_MAX = 280;

// Active game sessions in memory: sessionId -> { module, state, lobbyId, gameType, players }
const activeSessions = new Map();

// Rate-limiting state emission: sessionId -> { lastEmit, queued }
const emitDebounce = new Map();
const EMIT_MIN_INTERVAL_MS = Math.floor(1000 / 30); // max 30/sec

// ── Module loader ─────────────────────────────────────────────────────────────
function loadGameModule(gameType) {
  const modPath = path.join(__dirname, '..', 'games', gameType, 'index.js');
  try {
    return require(modPath);
  } catch (err) {
    throw new Error(`Failed to load game module '${gameType}': ${err.message}`);
  }
}

// ── Start a game ──────────────────────────────────────────────────────────────
function startGame(io, lobby, allPlayers) {
  const gameType = lobby.game_type;
  const mod = loadGameModule(gameType);

  const activePlayers = allPlayers.filter(p => p.role !== 'spectator');
  const settings = JSON.parse(lobby.settings || '{}');

  const sessionId = uuidv4();
  const { state } = mod.initGame(settings, activePlayers);

  db.prepare(`
    INSERT INTO game_sessions (id, lobby_id, game_type, module_version, location)
    VALUES (?, ?, ?, ?, ?)
  `).run(sessionId, lobby.id, gameType, mod.version, 'online');

  activeSessions.set(sessionId, {
    module: mod,
    state,
    lobbyId: lobby.id,
    gameType,
    players: activePlayers,
    spectators: allPlayers.filter(p => p.role === 'spectator'),
    io,
  });

  // Emit game_started to each player with their personal state view
  for (const player of activePlayers) {
    const playerState = mod.getState(state, player.id);
    const sockets = findSocketsByPlayerId(io, player.id);
    for (const s of sockets) {
      s.join(`session:${sessionId}`);
      s.currentSessionId = sessionId;
      s.emit('server:game_started', { sessionId, state: playerState });
    }
  }

  for (const spec of allPlayers.filter(p => p.role === 'spectator')) {
    const sockets = findSocketsByPlayerId(io, spec.id);
    for (const s of sockets) {
      s.join(`session:${sessionId}`);
      s.emit('server:game_started', { sessionId, state: mod.getState(state, null) });
    }
  }

  // Kick off bot runner if first player is a bot
  botRunner.scheduleIfBot(io, sessionId, activeSessions, handleActionInternal);
}

// ── game:action ───────────────────────────────────────────────────────────────
function handleAction(socket, io, data) {
  const { sessionId, action } = data || {};
  const session = activeSessions.get(sessionId);

  if (!session) {
    return socket.emit('server:error', { code: 'NO_SESSION', message: 'Session not found.' });
  }

  if (!session.module.isTurnValid(session.state, socket.playerId)) {
    return socket.emit('server:error', { code: 'NOT_YOUR_TURN', message: 'It is not your turn.' });
  }

  handleActionInternal(io, sessionId, socket.playerId, action);
}

function handleActionInternal(io, sessionId, playerId, action) {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  const { module: mod, state } = session;
  const result = mod.handleAction(state, playerId, action);

  if (result.error) {
    const sockets = findSocketsByPlayerId(io, playerId);
    for (const s of sockets) {
      s.emit('server:error', { code: 'INVALID_ACTION', message: result.error });
    }
    return;
  }

  session.state = result.state;

  // Log events
  for (const event of result.events || []) {
    const eventId = uuidv4();
    db.prepare(`
      INSERT INTO game_events (id, session_id, player_id, event_type, metadata)
      VALUES (?, ?, ?, ?, ?)
    `).run(eventId, sessionId, event.playerId || playerId, event.type, JSON.stringify(event.metadata || {}));

    io.to(`session:${sessionId}`).emit('server:game_event', { event });

    // Check achievements after each event
    achievementEngine.checkAfterEvent(io, session, event);
  }

  // Emit updated state to each player
  emitGameState(io, sessionId, session);

  // Check game over
  const gameOver = mod.isGameOver(session.state);
  if (gameOver) {
    finishGame(io, sessionId, gameOver);
    return;
  }

  // Schedule bot turn if next player is a bot
  botRunner.scheduleIfBot(io, sessionId, activeSessions, handleActionInternal);
}

// ── State emission with debounce ──────────────────────────────────────────────
function emitGameState(io, sessionId, session) {
  const now = Date.now();
  const debounce = emitDebounce.get(sessionId) || { lastEmit: 0 };
  const elapsed = now - debounce.lastEmit;

  if (elapsed >= EMIT_MIN_INTERVAL_MS) {
    doEmitGameState(io, sessionId, session);
    emitDebounce.set(sessionId, { lastEmit: now });
  } else {
    if (!debounce.queued) {
      debounce.queued = true;
      emitDebounce.set(sessionId, debounce);
      setTimeout(() => {
        const s = activeSessions.get(sessionId);
        if (s) doEmitGameState(io, sessionId, s);
        const d = emitDebounce.get(sessionId);
        if (d) { d.queued = false; d.lastEmit = Date.now(); }
      }, EMIT_MIN_INTERVAL_MS - elapsed);
    }
  }
}

function doEmitGameState(io, sessionId, session) {
  const { module: mod, state, players, spectators } = session;

  for (const player of players) {
    const playerState = mod.getState(state, player.id);
    const sockets = findSocketsByPlayerId(io, player.id);
    for (const s of sockets) s.emit('server:game_state', { state: playerState });
  }

  // Spectators get a state with null playerId (no hidden info)
  const specState = mod.getState(state, null);
  for (const spec of spectators || []) {
    const sockets = findSocketsByPlayerId(io, spec.id);
    for (const s of sockets) s.emit('server:game_state', { state: specState });
  }
}

// ── Game over ─────────────────────────────────────────────────────────────────
function finishGame(io, sessionId, gameOver) {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  const { module: mod, state, gameType } = session;

  db.prepare("UPDATE game_sessions SET ended_at = datetime('now') WHERE id = ?").run(sessionId);

  const insertResult = db.prepare(`
    INSERT INTO game_results (id, session_id, player_id, placement, result)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const placement of gameOver.placements) {
    const id = uuidv4();
    insertResult.run(id, sessionId, placement.playerId, placement.placement, placement.result);
    achievementEngine.checkAfterResult(io, session, placement);
  }

  const postGameSummary = mod.getPostGameSummary(state, gameOver.placements);

  io.to(`session:${sessionId}`).emit('server:game_over', {
    results: gameOver.placements,
    postGameSummary,
  });

  activeSessions.delete(sessionId);
  emitDebounce.delete(sessionId);
  botRunner.cancelSession(sessionId);
}

// ── game:chat ─────────────────────────────────────────────────────────────────
function handleChat(socket, io, data) {
  const { sessionId, message } = data || {};
  if (!activeSessions.has(sessionId)) return;

  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(socket.playerId);
  if (!player) return;

  const clean = sanitize(message, CHAT_MAX);
  if (!clean) return;

  const session = activeSessions.get(sessionId);
  const isSpectator = session.spectators.some(s => s.id === socket.playerId);

  io.to(`session:${sessionId}`).emit('server:game_chat', {
    playerId: player.id,
    displayName: player.display_name,
    message: clean,
    timestamp: new Date().toISOString(),
    isSpectator,
  });
}

// ── Post-game handlers ────────────────────────────────────────────────────────
function handleRematch(socket, io, data) {
  // Simple: create a new lobby with the same settings
  const { sessionId } = data || {};
  const sessionRow = db.prepare('SELECT * FROM game_sessions WHERE id = ?').get(sessionId);
  if (!sessionRow) return;

  const lobby = db.prepare('SELECT * FROM lobbies WHERE id = ?').get(sessionRow.lobby_id);
  if (!lobby) return;

  const lobbyManager = require('./lobby-manager');
  // Emit to original room players to rejoin
  io.to(`session:${sessionId}`).emit('server:announcement', {
    message: 'Rematch starting — creating new lobby...',
  });
}

function handleNewLobby(socket, io, data) {
  socket.emit('server:announcement', { message: 'Create or join a new lobby from the home screen.' });
}

// ── Force end (admin) ─────────────────────────────────────────────────────────
function forceEndSession(io, sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  db.prepare("UPDATE game_sessions SET ended_at = datetime('now') WHERE id = ?").run(sessionId);
  io.to(`session:${sessionId}`).emit('server:announcement', { message: 'This session was ended by an admin.' });
  io.to(`session:${sessionId}`).emit('server:game_over', { results: [], postGameSummary: [] });

  activeSessions.delete(sessionId);
  emitDebounce.delete(sessionId);
  botRunner.cancelSession(sessionId);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function findSocketsByPlayerId(io, playerId) {
  const result = [];
  for (const [, s] of io.sockets.sockets) {
    if (s.playerId === playerId) result.push(s);
  }
  return result;
}

function sanitize(str, max) {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '').trim().slice(0, max);
}

function getActiveSessions() { return activeSessions; }

module.exports = {
  startGame,
  handleAction,
  handleActionInternal,
  handleChat,
  handleRematch,
  handleNewLobby,
  forceEndSession,
  getActiveSessions,
};
