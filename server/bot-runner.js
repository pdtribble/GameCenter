// Bot runner — schedules bot turns with a natural delay (800–1500ms)

const BOT_DELAY_MIN = 800;
const BOT_DELAY_MAX = 1500;

// sessionId -> Set of pending timeout handles
const pendingTimers = new Map();

function randomDelay() {
  return BOT_DELAY_MIN + Math.floor(Math.random() * (BOT_DELAY_MAX - BOT_DELAY_MIN));
}

function scheduleIfBot(io, sessionId, activeSessions, handleActionInternal) {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  const { module: mod, state, players } = session;

  // Find whose turn it is
  const currentPlayerId = state.currentPlayerId;
  if (!currentPlayerId) return;

  const currentPlayer = players.find(p => p.id === currentPlayerId);
  if (!currentPlayer || !currentPlayer.is_bot) return;

  // It's a bot's turn — schedule action
  const delay = randomDelay();
  const handle = setTimeout(() => {
    const currentSession = activeSessions.get(sessionId);
    if (!currentSession) return;

    // Determine difficulty from settings
    const settings = JSON.parse(
      require('./db').prepare('SELECT settings FROM lobbies WHERE id = ?').get(currentSession.lobbyId)?.settings || '{}'
    );
    const difficulty = settings.botDifficulty || 'medium';

    let action;
    try {
      action = currentSession.module.getBotAction(currentSession.state, currentPlayer, difficulty);
    } catch (err) {
      console.error(`[bot] getBotAction error session=${sessionId} player=${currentPlayerId}`, err);
      return;
    }

    if (!action) return;

    handleActionInternal(io, sessionId, currentPlayerId, action);

    // Clean up timer reference
    const timers = pendingTimers.get(sessionId);
    if (timers) timers.delete(handle);
  }, delay);

  if (!pendingTimers.has(sessionId)) pendingTimers.set(sessionId, new Set());
  pendingTimers.get(sessionId).add(handle);
}

function cancelSession(sessionId) {
  const timers = pendingTimers.get(sessionId);
  if (timers) {
    for (const t of timers) clearTimeout(t);
    pendingTimers.delete(sessionId);
  }
}

module.exports = { scheduleIfBot, cancelSession };
