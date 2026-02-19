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

// Phase-transition timers (intermission → deal_next, betting → auto_bet)
const intermissionTimers = new Map(); // sessionId -> timeoutId
const bettingTimers = new Map();      // sessionId -> timeoutId

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

  const lobbyRow = db.prepare('SELECT join_code, host_player_id FROM lobbies WHERE id = ?').get(lobby.id);
  const joinCode = lobbyRow?.join_code || null;
  const hostPlayerId = lobbyRow?.host_player_id || null;

  // Emit game_started to each player with their personal state view
  for (const player of activePlayers) {
    const playerState = mod.getState(state, player.id);
    const sockets = findSocketsByPlayerId(io, player.id);
    for (const s of sockets) {
      s.join(`session:${sessionId}`);
      s.currentSessionId = sessionId;
      s.emit('server:game_started', { sessionId, state: playerState, joinCode, hostPlayerId });
    }
  }

  for (const spec of allPlayers.filter(p => p.role === 'spectator')) {
    const sockets = findSocketsByPlayerId(io, spec.id);
    for (const s of sockets) {
      s.join(`session:${sessionId}`);
      s.emit('server:game_started', { sessionId, state: mod.getState(state, null), joinCode, hostPlayerId });
    }
  }

  // Kick off bot runner if first player is a bot (playing phase)
  if (state.phase === 'playing') {
    botRunner.scheduleIfBot(io, sessionId, activeSessions, handleActionInternal);
  }

  // If starting in betting phase, schedule auto-bet timer and bot bets
  if (state.phase === 'betting' && state.bettingEndsAt) {
    const delay = Math.max(0, state.bettingEndsAt - Date.now());
    bettingTimers.set(sessionId, setTimeout(() => {
      bettingTimers.delete(sessionId);
      handleActionInternal(io, sessionId, '__system__', { type: 'auto_bet' });
    }, delay));

    // Schedule bot bets
    const session = activeSessions.get(sessionId);
    if (session) {
      for (const player of activePlayers.filter(p => p.is_bot)) {
        const pid = player.id;
        setTimeout(() => {
          const s = activeSessions.get(sessionId);
          if (s && s.state.phase === 'betting' && (s.state.bets == null || s.state.bets[pid] === undefined)) {
            handleActionInternal(io, sessionId, pid, { type: 'bet', amount: 10 });
          }
        }, 800 + Math.random() * 700);
      }
    }
  }
}

// ── game:action ───────────────────────────────────────────────────────────────
function handleAction(socket, io, data) {
  const { sessionId, action } = data || {};
  const session = activeSessions.get(sessionId);

  if (!session) {
    return socket.emit('server:error', { code: 'NO_SESSION', message: 'Session not found.' });
  }

  // end_game is restricted to the lobby host
  if (action?.type === 'end_game') {
    const lobby = db.prepare('SELECT * FROM lobbies WHERE id = ?').get(session.lobbyId);
    if (!lobby || lobby.host_player_id !== socket.playerId) {
      return socket.emit('server:error', { code: 'NOT_HOST', message: 'Only the host can end the game.' });
    }
    return handleActionInternal(io, sessionId, socket.playerId, action);
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

  const st = session.state;

  // Schedule intermission → deal_next timer
  if (st.phase === 'intermission' && st.intermissionEndsAt && !intermissionTimers.has(sessionId)) {
    const delay = Math.max(0, st.intermissionEndsAt - Date.now());
    intermissionTimers.set(sessionId, setTimeout(() => {
      intermissionTimers.delete(sessionId);
      handleActionInternal(io, sessionId, '__system__', { type: 'deal_next' });
    }, delay));
  }

  // Schedule betting → auto_bet timer
  if (st.phase === 'betting' && st.bettingEndsAt && !bettingTimers.has(sessionId)) {
    const delay = Math.max(0, st.bettingEndsAt - Date.now());
    bettingTimers.set(sessionId, setTimeout(() => {
      bettingTimers.delete(sessionId);
      handleActionInternal(io, sessionId, '__system__', { type: 'auto_bet' });
    }, delay));
  }

  // Schedule immediate bot bets when in betting phase
  if (st.phase === 'betting') {
    for (const player of session.players.filter(p => p.is_bot && st.bets[p.id] === undefined)) {
      const pid = player.id;
      setTimeout(() => {
        const s = activeSessions.get(sessionId);
        if (s && s.state.phase === 'betting' && s.state.bets[pid] === undefined) {
          handleActionInternal(io, sessionId, pid, { type: 'bet', amount: 10 });
        }
      }, 800 + Math.random() * 700);
    }
  }

  // Schedule bot turn if next player is a bot (playing phase)
  if (st.phase === 'playing') {
    botRunner.scheduleIfBot(io, sessionId, activeSessions, handleActionInternal);
  }
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

  const enrichedPlacements = gameOver.placements.map(p => {
    const player = session.state.players?.find(pl => pl.id === p.playerId);
    return { ...p, displayName: player?.displayName || p.playerId };
  });

  for (const placement of enrichedPlacements) {
    const id = uuidv4();
    insertResult.run(id, sessionId, placement.playerId, placement.placement, placement.result);
    achievementEngine.checkAfterResult(io, session, placement);
  }

  const postGameSummary = mod.getPostGameSummary(state, enrichedPlacements);

  io.to(`session:${sessionId}`).emit('server:game_over', {
    results: enrichedPlacements,
    postGameSummary,
  });

  activeSessions.delete(sessionId);
  emitDebounce.delete(sessionId);
  botRunner.cancelSession(sessionId);
  if (intermissionTimers.has(sessionId)) { clearTimeout(intermissionTimers.get(sessionId)); intermissionTimers.delete(sessionId); }
  if (bettingTimers.has(sessionId)) { clearTimeout(bettingTimers.get(sessionId)); bettingTimers.delete(sessionId); }
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
  if (intermissionTimers.has(sessionId)) { clearTimeout(intermissionTimers.get(sessionId)); intermissionTimers.delete(sessionId); }
  if (bettingTimers.has(sessionId)) { clearTimeout(bettingTimers.get(sessionId)); bettingTimers.delete(sessionId); }
}

// ── Rejoin (reconnect after page reload) ──────────────────────────────────────
function handleRejoin(socket, io) {
  const playerId = socket.playerId;
  if (!playerId) return;

  for (const [sessionId, session] of activeSessions) {
    const isPlayer = session.players.some(p => p.id === playerId);
    const isSpectator = (session.spectators || []).some(p => p.id === playerId);
    if (!isPlayer && !isSpectator) continue;

    const lobbyRow = db.prepare('SELECT join_code, host_player_id FROM lobbies WHERE id = ?').get(session.lobbyId);
    const joinCode = lobbyRow?.join_code || null;
    const hostPlayerId = lobbyRow?.host_player_id || null;

    socket.join(`session:${sessionId}`);
    socket.currentSessionId = sessionId;
    const playerState = isPlayer
      ? session.module.getState(session.state, playerId)
      : session.module.getState(session.state, null);
    socket.emit('server:game_started', { sessionId, state: playerState, joinCode, hostPlayerId });
    return;
  }
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
  handleRejoin,
};
