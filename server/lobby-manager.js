const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const config = require('../config/default');
const { safePlayer } = require('./session-manager');

const CHAT_MAX = 280;

// In-memory state
const kickedPlayers = new Map();       // lobbyId -> Set of playerId
const disconnectTimers = new Map();    // `${lobbyId}:${playerId}` -> setTimeout handle
const hostTransferTimers = new Map();  // lobbyId -> setTimeout handle
const idleTimers = new Map();          // lobbyId -> setTimeout handle

// ── Join code generation ──────────────────────────────────────────────────────
function generateJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < config.JOIN_CODE_LENGTH; i++) {
    code += chars[crypto.randomInt(chars.length)];
  }
  return code;
}

function makeUniqueJoinCode() {
  let code, attempts = 0;
  do {
    code = generateJoinCode();
    attempts++;
    if (attempts > 100) throw new Error('Could not generate unique join code');
  } while (db.prepare('SELECT 1 FROM lobbies WHERE join_code = ?').get(code));
  return code;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function sanitize(str, max) {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '').trim().slice(0, max);
}

function getLobby(lobbyId) {
  return db.prepare('SELECT * FROM lobbies WHERE id = ?').get(lobbyId);
}

function getLobbyPlayers(lobbyId) {
  return db.prepare(`
    SELECT p.id, p.display_name, p.avatar_emoji, p.avatar_color, p.is_bot, p.is_guest, p.chips,
           lp.role, lp.is_ready, lp.joined_at
    FROM lobby_players lp
    JOIN players p ON lp.player_id = p.id
    WHERE lp.lobby_id = ?
    ORDER BY lp.joined_at ASC
  `).all(lobbyId);
}

function emitLobbyUpdate(io, lobbyId) {
  const lobby = getLobby(lobbyId);
  if (!lobby) return;
  const players = getLobbyPlayers(lobbyId);
  io.to(`lobby:${lobbyId}`).emit('server:lobby_updated', { lobby, players });
}

function touchLobby(lobbyId) {
  db.prepare("UPDATE lobbies SET last_activity = datetime('now') WHERE id = ?").run(lobbyId);
  resetIdleTimer(lobbyId);
}

function resetIdleTimer(lobbyId) {
  if (idleTimers.has(lobbyId)) clearTimeout(idleTimers.get(lobbyId));
  const handle = setTimeout(() => abandonLobby(lobbyId), config.LOBBY_IDLE_TIMEOUT_MS);
  idleTimers.set(lobbyId, handle);
}

function abandonLobby(lobbyId) {
  db.prepare("UPDATE lobbies SET status = 'abandoned' WHERE id = ?").run(lobbyId);
  idleTimers.delete(lobbyId);
  console.log(`[lobby] abandoned lobby ${lobbyId} due to inactivity`);
}

// ── lobby:create ──────────────────────────────────────────────────────────────
function handleCreate(socket, io, data) {
  const { gameType, playerName, pin, settings, lobbyName } = data || {};

  const gameReg = db.prepare('SELECT * FROM game_registry WHERE game_type = ?').get(gameType);
  if (!gameReg) {
    return socket.emit('server:error', { code: 'INVALID_GAME', message: 'Unknown game type.' });
  }

  // Resolve player
  const player = resolvePlayer(socket, playerName, pin);
  if (player.error) {
    return socket.emit('server:error', { code: 'AUTH_ERROR', message: player.error });
  }

  const lobbyId = uuidv4();
  const joinCode = makeUniqueJoinCode();
  
  // Defensive defaults for settings
  const safeSettingsObj = typeof settings === 'object' && settings !== null ? settings : {};
  const defaults = {
    buyIn: 100,
    card_theme: 'default',
    entryFee: 50,
    startingChips: 1000,
    minBet: 10,
    smallBlind: 25,
    botDifficulty: 'medium',
  };
  const mergedSettings = { ...defaults, ...safeSettingsObj };
  const safeSettings = JSON.stringify(mergedSettings);
  const safeName = sanitize(lobbyName, 64) || 'My Lobby';

  db.transaction(() => {
    db.prepare(`
      INSERT INTO lobbies (id, join_code, game_type, host_player_id, status, name, settings)
      VALUES (?, ?, ?, ?, 'waiting', ?, ?)
    `).run(lobbyId, joinCode, gameType, player.id, safeName, safeSettings);

    db.prepare(`
      INSERT INTO lobby_players (lobby_id, player_id, role, is_ready)
      VALUES (?, ?, 'host', 1)
    `).run(lobbyId, player.id);
  })();

  if (!kickedPlayers.has(lobbyId)) kickedPlayers.set(lobbyId, new Set());

  socket.join(`lobby:${lobbyId}`);
  socket.currentLobbyId = lobbyId;

  const inviteUrl = buildInviteUrl(joinCode);
  const lobby = getLobby(lobbyId);

  socket.emit('server:lobby_created', { lobby, joinCode, inviteUrl });
  socket.emit('server:lobby_joined', { lobby, players: getLobbyPlayers(lobbyId), myPlayerId: player.id });
  emitLobbyUpdate(io, lobbyId);
  resetIdleTimer(lobbyId);

  console.log(`[lobby] created ${lobbyId} code=${joinCode} game=${gameType} host=${player.id}`);
}

// ── lobby:join ────────────────────────────────────────────────────────────────
function handleJoin(socket, io, data) {
  const { joinCode, playerName, pin, asSpectator } = data || {};

  if (!joinCode) {
    return socket.emit('server:error', { code: 'MISSING_CODE', message: 'Join code is required.' });
  }

  const code = String(joinCode).toUpperCase().trim();
  const lobby = db.prepare('SELECT * FROM lobbies WHERE join_code = ?').get(code);

  if (!lobby) {
    return socket.emit('server:error', { code: 'LOBBY_NOT_FOUND', message: 'Lobby not found.' });
  }

  // Mid-round join — game is already active
  if (lobby.status === 'active') {
    const player = resolvePlayer(socket, playerName, pin);
    if (player.error) {
      return socket.emit('server:error', { code: 'AUTH_ERROR', message: player.error });
    }
    socket.playerId = player.id;

    // Add to lobby_players if not already there
    const existingMember = db.prepare('SELECT * FROM lobby_players WHERE lobby_id = ? AND player_id = ?')
      .get(lobby.id, player.id);
    if (!existingMember) {
      db.prepare('INSERT INTO lobby_players (lobby_id, player_id, role, is_ready) VALUES (?, ?, ?, 0)')
        .run(lobby.id, player.id, 'player');
    }

    socket.join(`lobby:${lobby.id}`);
    socket.currentLobbyId = lobby.id;

    // Route to active game session via game-runner
    const gameRunner = require('./game-runner');
    const sessions = gameRunner.getActiveSessions();
    for (const [sessionId, session] of sessions) {
      if (session.lobbyId === lobby.id) {
        gameRunner.handleMidJoin(socket, io, sessionId);
        return;
      }
    }
    // Fallback if session not found
    return socket.emit('server:error', { code: 'SESSION_NOT_FOUND', message: 'Game session not found.' });
  }

  if (lobby.status !== 'waiting') {
    return socket.emit('server:error', { code: 'LOBBY_NOT_FOUND', message: 'This lobby is no longer available.' });
  }

  const kicked = kickedPlayers.get(lobby.id) || new Set();
  const player = resolvePlayer(socket, playerName, pin);
  if (player.error) {
    return socket.emit('server:error', { code: 'AUTH_ERROR', message: player.error });
  }

  if (kicked.has(player.id)) {
    return socket.emit('server:error', { code: 'KICKED', message: 'You have been removed from this lobby.' });
  }

  const existing = db.prepare('SELECT * FROM lobby_players WHERE lobby_id = ? AND player_id = ?')
    .get(lobby.id, player.id);

  if (existing) {
    // Reconnecting
    socket.join(`lobby:${lobby.id}`);
    socket.currentLobbyId = lobby.id;
    emitLobbyUpdate(io, lobby.id);
    return;
  }

  const gameReg = db.prepare('SELECT * FROM game_registry WHERE game_type = ?').get(lobby.game_type);
  const playerCount = db.prepare("SELECT COUNT(*) as c FROM lobby_players WHERE lobby_id = ? AND role != 'spectator'").get(lobby.id).c;

  // Handle buy-in for games that use it (blackjack, poker - NOT bs, bs uses per-round entry fee)
  const lobbySettings = JSON.parse(lobby.settings || '{}');
  const buyIn = lobbySettings.buyIn || lobbySettings.startingChips || 0;
  const chipGames = ['blackjack', 'poker'];
  if (buyIn > 0 && chipGames.includes(lobby.game_type) && role !== 'spectator') {
    const currentChips = db.prepare('SELECT chips FROM players WHERE id = ?').get(player.id)?.chips || 0;
    if (currentChips < buyIn) {
      return socket.emit('server:error', { code: 'INSUFFICIENT_CHIPS', message: `Need ${buyIn} chips to join (you have ${currentChips})` });
    }
    db.prepare('UPDATE players SET chips = chips - ? WHERE id = ?').run(buyIn, player.id);
    db.prepare(`
      INSERT INTO chip_transactions (player_id, amount, reason, game_type, lobby_id, created_at)
      VALUES (?, ?, 'buyin', ?, ?, ?)
    `).run(player.id, -buyIn, lobby.game_type, lobby.id, Date.now());
  }

  // BS uses per-round entry fee, handled in game logic (not deducted on join)

  if (!asSpectator && playerCount >= gameReg.max_players) {
    return socket.emit('server:error', { code: 'LOBBY_FULL', message: 'Lobby is full.' });
  }

  const role = asSpectator ? 'spectator' : 'player';
  db.prepare(`
    INSERT INTO lobby_players (lobby_id, player_id, role, is_ready)
    VALUES (?, ?, ?, 0)
  `).run(lobby.id, player.id, role);

  // Auto-assign host if the lobby has no host (e.g. a default lobby)
  if (!lobby.host_player_id && role !== 'spectator') {
    db.prepare('UPDATE lobbies SET host_player_id = ? WHERE id = ?').run(player.id, lobby.id);
    db.prepare("UPDATE lobby_players SET role = 'host', is_ready = 1 WHERE lobby_id = ? AND player_id = ?").run(lobby.id, player.id);
  }

  socket.join(`lobby:${lobby.id}`);
  socket.currentLobbyId = lobby.id;

  socket.emit('server:lobby_joined', { lobby: getLobby(lobby.id), players: getLobbyPlayers(lobby.id), myPlayerId: player.id });
  io.to(`lobby:${lobby.id}`).emit('server:player_joined', { player: safePlayer(player), role });
  emitLobbyUpdate(io, lobby.id);
  touchLobby(lobby.id);
}

// ── lobby:ready / lobby:unready ───────────────────────────────────────────────
function handleReady(socket, io, data) {
  const { lobbyId } = data || {};
  if (!validateInLobby(socket, lobbyId)) return;
  db.prepare('UPDATE lobby_players SET is_ready = 1 WHERE lobby_id = ? AND player_id = ?')
    .run(lobbyId, socket.playerId);
  emitLobbyUpdate(io, lobbyId);
  touchLobby(lobbyId);
}

function handleUnready(socket, io, data) {
  const { lobbyId } = data || {};
  if (!validateInLobby(socket, lobbyId)) return;
  db.prepare('UPDATE lobby_players SET is_ready = 0 WHERE lobby_id = ? AND player_id = ?')
    .run(lobbyId, socket.playerId);
  emitLobbyUpdate(io, lobbyId);
  touchLobby(lobbyId);
}

// ── lobby:start ───────────────────────────────────────────────────────────────
function handleStart(socket, io, data, gameRunner) {
  const { lobbyId } = data || {};
  if (!validateInLobby(socket, lobbyId)) return;

  const lobby = getLobby(lobbyId);
  if (!lobby) return socket.emit('server:error', { code: 'NOT_FOUND', message: 'Lobby not found.' });
  if (lobby.host_player_id !== socket.playerId) {
    return socket.emit('server:error', { code: 'NOT_HOST', message: 'Only the host can start the game.' });
  }

  const players = getLobbyPlayers(lobbyId);
  const nonBotNonSpectator = players.filter(p => !p.is_bot && p.role !== 'spectator');
  const allReady = nonBotNonSpectator.every(p => p.is_ready);

  if (!allReady) {
    return socket.emit('server:error', { code: 'NOT_READY', message: 'All players must be ready.' });
  }

  // Load game module to check bot fill capability
  let mod;
  try {
    mod = require(require('path').join(__dirname, '..', 'games', lobby.game_type, 'index.js'));
  } catch (_e) {
    mod = null;
  }

  const humanActivePlayers = players.filter(p => !p.is_bot && p.role !== 'spectator');
  const totalActivePlayers = players.filter(p => p.role !== 'spectator');

  // If bot fill is allowed, only need 1 human. Otherwise need min_players.
  if (mod && mod.botFillAllowed) {
    if (humanActivePlayers.length < 1) {
      return socket.emit('server:error', { code: 'NOT_ENOUGH_PLAYERS', message: 'Need at least 1 player.' });
    }
  } else {
    const gameReg = db.prepare('SELECT * FROM game_registry WHERE game_type = ?').get(lobby.game_type);
    if (totalActivePlayers.length < (gameReg?.min_players || 2)) {
      return socket.emit('server:error', {
        code: 'NOT_ENOUGH_PLAYERS',
        message: `Need at least ${gameReg?.min_players || 2} players.`,
      });
    }
  }

  db.prepare("UPDATE lobbies SET status = 'active' WHERE id = ?").run(lobbyId);
  if (idleTimers.has(lobbyId)) {
    clearTimeout(idleTimers.get(lobbyId));
    idleTimers.delete(lobbyId);
  }

  gameRunner.startGame(io, lobby, players);
}

// ── lobby:kick ────────────────────────────────────────────────────────────────
function handleKick(socket, io, data) {
  const { lobbyId, targetPlayerId } = data || {};
  if (!validateInLobby(socket, lobbyId)) return;

  const lobby = getLobby(lobbyId);
  if (!lobby || lobby.host_player_id !== socket.playerId) {
    return socket.emit('server:error', { code: 'NOT_HOST', message: 'Only the host can kick players.' });
  }
  if (targetPlayerId === socket.playerId) {
    return socket.emit('server:error', { code: 'INVALID', message: 'Cannot kick yourself.' });
  }

  if (!kickedPlayers.has(lobbyId)) kickedPlayers.set(lobbyId, new Set());
  kickedPlayers.get(lobbyId).add(targetPlayerId);

  db.prepare('DELETE FROM lobby_players WHERE lobby_id = ? AND player_id = ?').run(lobbyId, targetPlayerId);

  // Find and disconnect their socket
  for (const [, s] of io.sockets.sockets) {
    if (s.playerId === targetPlayerId) {
      s.emit('server:error', { code: 'KICKED', message: 'You have been removed from the lobby.' });
      s.leave(`lobby:${lobbyId}`);
      s.currentLobbyId = null;
    }
  }

  io.to(`lobby:${lobbyId}`).emit('server:player_left', { playerId: targetPlayerId });
  emitLobbyUpdate(io, lobbyId);
}

// ── lobby:transfer_host ───────────────────────────────────────────────────────
function handleTransferHost(socket, io, data) {
  const { lobbyId, targetPlayerId } = data || {};
  if (!validateInLobby(socket, lobbyId)) return;

  const lobby = getLobby(lobbyId);
  if (!lobby || lobby.host_player_id !== socket.playerId) {
    return socket.emit('server:error', { code: 'NOT_HOST', message: 'Only the host can transfer host.' });
  }

  const targetMember = db.prepare('SELECT * FROM lobby_players WHERE lobby_id = ? AND player_id = ?')
    .get(lobbyId, targetPlayerId);
  if (!targetMember || targetMember.role === 'spectator') {
    return socket.emit('server:error', { code: 'INVALID_TARGET', message: 'Invalid transfer target.' });
  }

  performHostTransfer(io, lobbyId, targetPlayerId);
}

function performHostTransfer(io, lobbyId, newHostId) {
  db.prepare('UPDATE lobbies SET host_player_id = ? WHERE id = ?').run(newHostId, lobbyId);
  db.prepare("UPDATE lobby_players SET role = 'host' WHERE lobby_id = ? AND player_id = ?").run(lobbyId, newHostId);
  io.to(`lobby:${lobbyId}`).emit('server:host_transferred', { newHostId });
  emitLobbyUpdate(io, lobbyId);
}

// ── lobby:settings ────────────────────────────────────────────────────────────
function handleSettings(socket, io, data) {
  const { lobbyId, settings } = data || {};
  if (!validateInLobby(socket, lobbyId)) return;

  const lobby = getLobby(lobbyId);
  if (!lobby || lobby.host_player_id !== socket.playerId) {
    return socket.emit('server:error', { code: 'NOT_HOST', message: 'Only the host can change settings.' });
  }

  const safeSettings = JSON.stringify(settings || {});
  db.prepare('UPDATE lobbies SET settings = ? WHERE id = ?').run(safeSettings, lobbyId);
  emitLobbyUpdate(io, lobbyId);
  touchLobby(lobbyId);
}

// ── lobby:chat ────────────────────────────────────────────────────────────────
function handleChat(socket, io, data) {
  const { lobbyId, message } = data || {};
  if (!validateInLobby(socket, lobbyId)) return;

  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(socket.playerId);
  if (!player) return;

  const clean = sanitize(message, CHAT_MAX);
  if (!clean) return;

  io.to(`lobby:${lobbyId}`).emit('server:lobby_chat', {
    playerId: player.id,
    displayName: player.display_name,
    message: clean,
    timestamp: new Date().toISOString(),
  });
  touchLobby(lobbyId);
}

// ── spectator:join ────────────────────────────────────────────────────────────
function handleSpectatorJoin(socket, io, data) {
  handleJoin(socket, io, { ...(data || {}), asSpectator: true });
}

// ── lobby:leave ───────────────────────────────────────────────────────────────
function handleLeave(socket, io, data) {
  const lobbyId = (data || {}).lobbyId || socket.currentLobbyId;
  if (!lobbyId || !socket.playerId) return;

  const lobby = getLobby(lobbyId);
  if (!lobby || lobby.status !== 'waiting') return;

  // Refund buy-in if applicable
  const lobbySettings = JSON.parse(lobby.settings || '{}');
  const buyIn = lobbySettings.buyIn || lobbySettings.startingChips || 0;
  const chipGames = ['blackjack', 'poker'];
  if (buyIn > 0 && chipGames.includes(lobby.game_type)) {
    db.prepare('UPDATE players SET chips = chips + ? WHERE id = ?').run(buyIn, socket.playerId);
    db.prepare(`
      INSERT INTO chip_transactions (player_id, amount, reason, game_type, lobby_id, created_at)
      VALUES (?, ?, 'buyin_refund', ?, ?, ?)
    `).run(socket.playerId, buyIn, lobby.game_type, lobby.id, Date.now());
  }

  db.prepare('DELETE FROM lobby_players WHERE lobby_id = ? AND player_id = ?')
    .run(lobbyId, socket.playerId);

  socket.leave(`lobby:${lobbyId}`);
  socket.currentLobbyId = null;

  const remaining = getLobbyPlayers(lobbyId).filter(p => p.role !== 'spectator');

  if (remaining.length === 0) {
    abandonLobby(lobbyId);
    return;
  }

  // Transfer host if the leaver was host
  if (lobby.host_player_id === socket.playerId) {
    performHostTransfer(io, lobbyId, remaining[0].id);
  } else {
    emitLobbyUpdate(io, lobbyId);
  }
}

// ── disconnect ────────────────────────────────────────────────────────────────
function handleDisconnect(socket, io) {
  const lobbyId = socket.currentLobbyId;
  if (!lobbyId || !socket.playerId) return;

  const lobby = getLobby(lobbyId);
  if (!lobby || lobby.status === 'abandoned') return;

  io.to(`lobby:${lobbyId}`).emit('server:player_left', { playerId: socket.playerId });

  if (lobby.status === 'active') {
    // Game is active — hold slot and pause if it's their turn
    const key = `${lobbyId}:${socket.playerId}`;
    const handle = setTimeout(() => {
      // Forfeit
      db.prepare('DELETE FROM lobby_players WHERE lobby_id = ? AND player_id = ?')
        .run(lobbyId, socket.playerId);
      disconnectTimers.delete(key);
      io.to(`lobby:${lobbyId}`).emit('server:game_state', {
        pausedForReconnect: false,
        forfeitedPlayerId: socket.playerId,
      });
    }, config.DISCONNECT_HOLD_MS);
    disconnectTimers.set(key, handle);

    io.to(`lobby:${lobbyId}`).emit('server:game_state', {
      pausedForReconnect: true,
      disconnectedPlayerId: socket.playerId,
    });
    return;
  }

  // Lobby is in waiting state
  if (lobby.host_player_id === socket.playerId) {
    // Host disconnected — schedule transfer
    const handle = setTimeout(() => {
      const remaining = getLobbyPlayers(lobbyId)
        .filter(p => p.id !== socket.playerId && p.role !== 'spectator');
      if (remaining.length > 0) {
        performHostTransfer(io, lobbyId, remaining[0].id);
      } else {
        abandonLobby(lobbyId);
      }
      hostTransferTimers.delete(lobbyId);
    }, 10000);
    hostTransferTimers.set(lobbyId, handle);
  }
}

// ── Reconnect helper ──────────────────────────────────────────────────────────
function handleReconnect(socket, io, lobbyId) {
  const key = `${lobbyId}:${socket.playerId}`;
  if (disconnectTimers.has(key)) {
    clearTimeout(disconnectTimers.get(key));
    disconnectTimers.delete(key);
  }
  socket.join(`lobby:${lobbyId}`);
  socket.currentLobbyId = lobbyId;
  io.to(`lobby:${lobbyId}`).emit('server:player_reconnected', { playerId: socket.playerId });
  io.to(`lobby:${lobbyId}`).emit('server:game_state', { pausedForReconnect: false });
}

// ── Validation helpers ────────────────────────────────────────────────────────
function validateInLobby(socket, lobbyId) {
  if (!lobbyId || !socket.playerId) {
    socket.emit('server:error', { code: 'INVALID', message: 'Missing parameters.' });
    return false;
  }
  const member = db.prepare('SELECT 1 FROM lobby_players WHERE lobby_id = ? AND player_id = ?')
    .get(lobbyId, socket.playerId);
  if (!member) {
    socket.emit('server:error', { code: 'NOT_IN_LOBBY', message: 'You are not in this lobby.' });
    return false;
  }
  return true;
}

// ── Player resolution ─────────────────────────────────────────────────────────
function resolvePlayer(socket, playerName, pin) {
  // If a playerName was provided, always do login/register first —
  // this upgrades a guest session to a named account and updates socket.playerId.
  if (playerName && playerName.trim()) {
    const { loginOrRegister } = require('./session-manager');
    const result = loginOrRegister(socket, { username: playerName, pin, displayName: playerName });
    if (result.error) return { error: result.error };
    return db.prepare('SELECT * FROM players WHERE id = ?').get(socket.playerId);
  }

  // No playerName — use the existing session (guest or previously named)
  if (socket.playerId) {
    const p = db.prepare('SELECT * FROM players WHERE id = ?').get(socket.playerId);
    if (p) return p;
  }

  return { error: 'Could not resolve player.' };
}

function buildInviteUrl(joinCode) {
  return `/join/${joinCode}`;
}

// ── Exported API for game-runner to call ──────────────────────────────────────
function getLobbyById(lobbyId) { return getLobby(lobbyId); }
function getLobbyPlayersList(lobbyId) { return getLobbyPlayers(lobbyId); }

module.exports = {
  handleCreate,
  handleJoin,
  handleLeave,
  handleReady,
  handleUnready,
  handleStart,
  handleKick,
  handleTransferHost,
  handleSettings,
  handleChat,
  handleSpectatorJoin,
  handleDisconnect,
  handleReconnect,
  getLobbyById,
  getLobbyPlayersList,
  emitLobbyUpdate,
};
