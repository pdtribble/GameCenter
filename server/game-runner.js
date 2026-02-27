// game-runner.js — engine-level game session management
// Knows nothing about individual game rules; all logic is in game modules.
'use strict';

const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const botRunner = require('./bot-runner');

const CHAT_MAX = 280;
const AFK_INTERMISSION_MS = 30_000;
const BOT_READY_MAX_DELAY_MS = 1000;
const EMIT_MIN_INTERVAL_MS = Math.floor(1000 / 30); // cap at 30 state emits/sec

// activeSessions: Map<sessionId, Session>
const activeSessions = new Map();

// Debounce state: Map<sessionId, { lastEmit, queued }>
const emitDebounce = new Map();

// AFK intermission timers: Map<sessionId, timeoutId>
const intermissionTimers = new Map();

// ── Module loader ─────────────────────────────────────────────────────────────
function loadGameModule(gameType) {
  const modPath = path.join(__dirname, '..', 'games', gameType, 'index.js');
  try {
    return require(modPath);
  } catch (err) {
    throw new Error(`Failed to load game module '${gameType}': ${err.message}`);
  }
}

// ── Build per-player client state ─────────────────────────────────────────────
// Calls module.getPublicState() then augments with engine metadata.
function buildClientState(session, playerId) {
  const { module: mod, state, gameType, enginePhase, readySet, sittingOut } = session;
  const pub = mod.getPublicState(state, playerId);
  return {
    ...pub,
    gameType,
    enginePhase,
    readyPlayers: [...readySet],
    sittingOut: [...sittingOut],
    roundSummary: enginePhase === 'intermission' ? mod.getRoundSummary(state) : null,
  };
}

// ── startGame ─────────────────────────────────────────────────────────────────
function startGame(io, lobby, allPlayers) {
  const gameType = lobby.game_type;
  const mod = loadGameModule(gameType);
  const settings = JSON.parse(lobby.settings || '{}');

  let activePlayers = allPlayers.filter(p => p.role !== 'spectator');
  const spectators = allPlayers.filter(p => p.role === 'spectator');

  // Bot fill — create ephemeral in-memory bots (not persisted to DB)
  if (mod.botFillAllowed) {
    const fillTarget = Math.max(mod.botFillMin || mod.minPlayers || 2, activePlayers.length);
    let botNum = activePlayers.filter(p => p.is_bot).length + 1;
    while (activePlayers.length < fillTarget) {
      activePlayers.push({
        id: `bot-${uuidv4()}`,
        display_name: `Bot ${botNum}`,
        displayName: `Bot ${botNum}`,
        is_bot: 1,
        role: 'player',
      });
      botNum++;
    }
  }

  const sessionId = uuidv4();
  const state = mod.initGame(activePlayers, settings);

  db.prepare(`
    INSERT INTO game_sessions (id, lobby_id, game_type, module_version, location)
    VALUES (?, ?, ?, ?, ?)
  `).run(sessionId, lobby.id, gameType, mod.version || '1.0.0', 'online');

  const session = {
    module: mod,
    state,
    gameType,
    lobbyId: lobby.id,
    players: activePlayers,
    spectators,
    config: settings,
    enginePhase: 'playing',
    readySet: new Set(),
    sittingOut: new Set(),
    io,
  };

  activeSessions.set(sessionId, session);

  const lobbyRow = db.prepare('SELECT join_code, host_player_id FROM lobbies WHERE id = ?').get(lobby.id);
  const joinCode = lobbyRow?.join_code || null;
  const hostPlayerId = lobbyRow?.host_player_id || null;

  for (const player of activePlayers) {
    if (player.is_bot) continue;
    const clientState = buildClientState(session, player.id);
    for (const s of findSocketsByPlayerId(io, player.id)) {
      s.join(`session:${sessionId}`);
      s.currentSessionId = sessionId;
      s.emit('server:game_started', { sessionId, state: clientState, joinCode, hostPlayerId });
    }
  }

  for (const spec of spectators) {
    const clientState = buildClientState(session, null);
    for (const s of findSocketsByPlayerId(io, spec.id)) {
      s.join(`session:${sessionId}`);
      s.emit('server:game_started', { sessionId, state: clientState, joinCode, hostPlayerId });
    }
  }

  botRunner.scheduleIfBot(io, sessionId, activeSessions, handleActionInternal);

  console.log(`[game] started session=${sessionId} game=${gameType} players=${activePlayers.length}`);
}

// ── game:action ───────────────────────────────────────────────────────────────
function handleAction(socket, io, data) {
  const { sessionId, action } = data || {};
  const session = activeSessions.get(sessionId);

  if (!session) {
    return socket.emit('server:error', { code: 'NO_SESSION', message: 'Session not found.' });
  }
  if (session.enginePhase !== 'playing') {
    return socket.emit('server:error', { code: 'NOT_PLAYING', message: 'No actions during intermission.' });
  }
  if (!session.module.isTurnValid(session.state, socket.playerId, action)) {
    return socket.emit('server:error', { code: 'INVALID_ACTION', message: 'That action is not valid right now.' });
  }

  handleActionInternal(io, sessionId, socket.playerId, action);
}

// ── Core action handler (also called by bot runner) ───────────────────────────
function handleActionInternal(io, sessionId, playerId, action) {
  const session = activeSessions.get(sessionId);
  if (!session || session.enginePhase !== 'playing') return;

  const { module: mod } = session;
  const result = mod.handleAction(session.state, playerId, action);

  if (result.error) {
    for (const s of findSocketsByPlayerId(io, playerId)) {
      s.emit('server:error', { code: 'INVALID_ACTION', message: result.error });
    }
    return;
  }

  session.state = result.state;
  emitGameState(io, sessionId, session);

  if (mod.isGameOver(session.state)) {
    finishGame(io, sessionId);
    return;
  }

  if (mod.isRoundOver(session.state)) {
    enterIntermission(io, sessionId);
    return;
  }

  // Still in playing phase — schedule any bots that now have valid actions
  botRunner.scheduleIfBot(io, sessionId, activeSessions, handleActionInternal);
}

// ── Intermission ──────────────────────────────────────────────────────────────
function enterIntermission(io, sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  session.enginePhase = 'intermission';
  session.readySet.clear();

  // Bots auto-ready with a small delay so state broadcast lands first
  for (const player of session.players) {
    if (!player.is_bot) continue;
    const pid = player.id;
    setTimeout(() => {
      const s = activeSessions.get(sessionId);
      if (!s || s.enginePhase !== 'intermission') return;
      s.readySet.add(pid);
      emitGameState(io, sessionId, s);
      checkAllReady(io, sessionId);
    }, 200 + Math.random() * BOT_READY_MAX_DELAY_MS);
  }

  // AFK guard: after 30s, sit out non-ready humans and advance
  if (intermissionTimers.has(sessionId)) clearTimeout(intermissionTimers.get(sessionId));
  intermissionTimers.set(sessionId, setTimeout(() => {
    intermissionTimers.delete(sessionId);
    const s = activeSessions.get(sessionId);
    if (!s || s.enginePhase !== 'intermission') return;
    for (const player of s.players) {
      if (!player.is_bot && !s.readySet.has(player.id)) {
        s.sittingOut.add(player.id);
      }
    }
    advanceRound(io, sessionId);
  }, AFK_INTERMISSION_MS));

  emitGameState(io, sessionId, session);
}

// ── game:ready ────────────────────────────────────────────────────────────────
function handleReady(socket, io, data) {
  const sessionId = data?.sessionId || socket.currentSessionId;
  const session = activeSessions.get(sessionId);
  if (!session || session.enginePhase !== 'intermission') return;

  session.readySet.add(socket.playerId);
  emitGameState(io, sessionId, session);
  checkAllReady(io, sessionId);
}

// ── game:sit_out / game:sit_in ────────────────────────────────────────────────
function handleSitOut(socket, io, data) {
  const sessionId = data?.sessionId || socket.currentSessionId;
  const session = activeSessions.get(sessionId);
  if (!session) return;
  session.sittingOut.add(socket.playerId);
  session.readySet.delete(socket.playerId);
  emitGameState(io, sessionId, session);
}

function handleSitIn(socket, io, data) {
  const sessionId = data?.sessionId || socket.currentSessionId;
  const session = activeSessions.get(sessionId);
  if (!session) return;
  session.sittingOut.delete(socket.playerId);
  emitGameState(io, sessionId, session);
}

// ── Check all non-bot non-sittingOut players ready ────────────────────────────
function checkAllReady(io, sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session || session.enginePhase !== 'intermission') return;

  const waiting = session.players.filter(p =>
    !p.is_bot && !session.sittingOut.has(p.id) && !session.readySet.has(p.id)
  );

  if (waiting.length === 0) {
    advanceRound(io, sessionId);
  }
}

function advanceRound(io, sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  if (intermissionTimers.has(sessionId)) {
    clearTimeout(intermissionTimers.get(sessionId));
    intermissionTimers.delete(sessionId);
  }

  const activePlayers = session.players.filter(p => !session.sittingOut.has(p.id));

  if (activePlayers.length < (session.module.minPlayers || 2)) {
    finishGame(io, sessionId);
    return;
  }

  session.state = session.module.startNextRound(session.state, activePlayers);
  session.enginePhase = 'playing';
  session.readySet.clear();

  emitGameState(io, sessionId, session);
  botRunner.scheduleIfBot(io, sessionId, activeSessions, handleActionInternal);
}

// ── Game over ─────────────────────────────────────────────────────────────────
function finishGame(io, sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  const { module: mod, state, config, lobbyId } = session;
  const summary = mod.getRoundSummary ? mod.getRoundSummary(state) : {};
  const scores = summary.scores || {};

  db.prepare("UPDATE game_sessions SET ended_at = datetime('now') WHERE id = ?").run(sessionId);

  // Chip settlement for chip games (blackjack, poker)
  const chipGames = ['blackjack', 'poker'];
  if (chipGames.includes(session.gameType) && config) {
    const buyIn = config.buyIn || config.startingChips || 0;
    if (buyIn > 0) {
      for (const p of session.players) {
        if (p.is_bot) continue; // Skip bots
        
        const player = db.prepare('SELECT chips FROM players WHERE id = ?').get(p.id);
        if (!player) continue;

        const finalChips = scores[p.id] || 0;
        const net = finalChips - buyIn;
        
        if (net !== 0) {
          db.prepare('UPDATE players SET chips = chips + ? WHERE id = ?').run(net, p.id);
          db.prepare(`
            INSERT INTO chip_transactions (player_id, amount, reason, game_type, lobby_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(p.id, net, net > 0 ? 'game_win' : 'game_loss', session.gameType, lobbyId, Date.now());
        }
      }
    }
  }

  // Derive placements from scores for human players only (bots not recorded in DB)
  const humanPlayers = session.players.filter(p => !p.is_bot);
  const sorted = [...humanPlayers].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));

  const insertResult = db.prepare(
    'INSERT INTO game_results (id, session_id, player_id, placement, result) VALUES (?, ?, ?, ?, ?)'
  );

  let lastScore = null, lastPlacement = 0;
  const results = sorted.map((p, i) => {
    const score = scores[p.id] || 0;
    if (score !== lastScore) { lastPlacement = i + 1; lastScore = score; }
    const result = lastPlacement === 1 ? 'win' : 'loss';
    insertResult.run(uuidv4(), sessionId, p.id, lastPlacement, result);
    return {
      playerId: p.id,
      displayName: p.displayName || p.display_name || p.id,
      placement: lastPlacement,
      result,
      score,
    };
  });

  // Emit chip updates to players
  for (const p of session.players) {
    if (p.is_bot) continue;
    const updated = db.prepare('SELECT chips FROM players WHERE id = ?').get(p.id);
    for (const s of findSocketsByPlayerId(io, p.id)) {
      s.emit('server:chips_updated', { chips: updated?.chips ?? 0 });
    }
  }

  io.to(`session:${sessionId}`).emit('server:game_over', {
    results,
    postGameSummary: summary,
  });

  console.log(`[game] ended session=${sessionId}`);
  cleanupSession(sessionId);
}

function cleanupSession(sessionId) {
  activeSessions.delete(sessionId);
  emitDebounce.delete(sessionId);
  botRunner.cancelSession(sessionId);
  if (intermissionTimers.has(sessionId)) {
    clearTimeout(intermissionTimers.get(sessionId));
    intermissionTimers.delete(sessionId);
  }
}

// ── State emission with debounce ──────────────────────────────────────────────
function emitGameState(io, sessionId, session) {
  const now = Date.now();
  const debounce = emitDebounce.get(sessionId) || { lastEmit: 0, queued: false };
  const elapsed = now - debounce.lastEmit;

  if (elapsed >= EMIT_MIN_INTERVAL_MS) {
    doEmitGameState(io, sessionId, session);
    emitDebounce.set(sessionId, { lastEmit: now, queued: false });
  } else if (!debounce.queued) {
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

function doEmitGameState(io, sessionId, session) {
  for (const player of session.players) {
    if (player.is_bot) continue;
    const clientState = buildClientState(session, player.id);
    for (const s of findSocketsByPlayerId(io, player.id)) {
      s.emit('server:game_state', { state: clientState });
    }
  }

  if (session.spectators && session.spectators.length > 0) {
    const specState = buildClientState(session, null);
    for (const spec of session.spectators) {
      for (const s of findSocketsByPlayerId(io, spec.id)) {
        s.emit('server:game_state', { state: specState });
      }
    }
  }
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
  const isSpectator = (session.spectators || []).some(s => s.id === socket.playerId);

  io.to(`session:${sessionId}`).emit('server:game_chat', {
    playerId: player.id,
    displayName: player.display_name,
    message: clean,
    timestamp: new Date().toISOString(),
    isSpectator,
  });
}

// ── Force end (admin) ─────────────────────────────────────────────────────────
function forceEndSession(io, sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session) return;
  db.prepare("UPDATE game_sessions SET ended_at = datetime('now') WHERE id = ?").run(sessionId);
  io.to(`session:${sessionId}`).emit('server:announcement', { message: 'This session was ended by an admin.' });
  io.to(`session:${sessionId}`).emit('server:game_over', { results: [], postGameSummary: null });
  cleanupSession(sessionId);
}

// ── Rejoin (page reload while game is active) ─────────────────────────────────
function handleRejoin(socket, io) {
  const playerId = socket.playerId;
  if (!playerId) return;

  for (const [sessionId, session] of activeSessions) {
    const isPlayer = session.players.some(p => p.id === playerId);
    const isSpectator = (session.spectators || []).some(p => p.id === playerId);
    if (!isPlayer && !isSpectator) continue;

    const lobbyRow = db.prepare('SELECT join_code, host_player_id FROM lobbies WHERE id = ?').get(session.lobbyId);
    socket.join(`session:${sessionId}`);
    socket.currentSessionId = sessionId;
    const clientState = isPlayer ? buildClientState(session, playerId) : buildClientState(session, null);
    socket.emit('server:game_started', {
      sessionId,
      state: clientState,
      joinCode: lobbyRow?.join_code || null,
      hostPlayerId: lobbyRow?.host_player_id || null,
    });
    return;
  }
}

// ── Mid-game join ─────────────────────────────────────────────────────────────
function handleMidJoin(socket, io, sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  const playerId = socket.playerId;

  if (!session.players.some(p => p.id === playerId)) {
    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(playerId);
    if (!player) return;
    session.players.push({
      id: playerId,
      display_name: player.display_name,
      displayName: player.display_name,
      is_bot: 0,
      role: 'player',
    });
    session.sittingOut.add(playerId);
  }

  const lobbyRow = db.prepare('SELECT join_code, host_player_id FROM lobbies WHERE id = ?').get(session.lobbyId);
  socket.join(`session:${sessionId}`);
  socket.currentSessionId = sessionId;

  const clientState = buildClientState(session, playerId);
  socket.emit('server:game_started', {
    sessionId,
    state: clientState,
    joinCode: lobbyRow?.join_code || null,
    hostPlayerId: lobbyRow?.host_player_id || null,
  });

  emitGameState(io, sessionId, session);
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
  handleReady,
  handleSitOut,
  handleSitIn,
  handleChat,
  forceEndSession,
  getActiveSessions,
  handleRejoin,
  handleMidJoin,
};
