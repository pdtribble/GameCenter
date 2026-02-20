// Bot runner — schedules bot turns with a natural delay (800–1500ms)
// Works with simultaneous-action and sequential-turn game modules by using
// getValidActions() rather than a single currentPlayerId check.

'use strict';

const BOT_DELAY_MIN = 800;
const BOT_DELAY_MAX = 1500;

// sessionId -> Set of pending timeout handles
const pendingTimers = new Map();

function randomDelay() {
  return BOT_DELAY_MIN + Math.floor(Math.random() * (BOT_DELAY_MAX - BOT_DELAY_MIN));
}

/**
 * For every bot in the session that currently has valid actions, schedule a
 * delayed call to getBotAction() + handleActionInternal().
 *
 * Supports both simultaneous-action games (e.g. highest card — all bots act
 * at once) and sequential-turn games (e.g. a game with currentPlayerId).
 */
function scheduleIfBot(io, sessionId, activeSessions, handleActionInternal) {
  const session = activeSessions.get(sessionId);
  if (!session || session.enginePhase !== 'playing') return;

  const { module: mod, state, players } = session;

  for (const player of players) {
    if (!player.is_bot) continue;

    // Check if this bot has any valid actions right now
    let validActions;
    try {
      validActions = mod.getValidActions(state, player.id);
    } catch (_e) {
      continue;
    }
    if (!validActions || validActions.length === 0) continue;

    const pid = player.id;
    const delay = randomDelay();
    const handle = setTimeout(() => {
      const currentSession = activeSessions.get(sessionId);
      if (!currentSession || currentSession.enginePhase !== 'playing') return;

      // Re-check valid actions at time of execution (state may have changed)
      let actions;
      try {
        actions = currentSession.module.getValidActions(currentSession.state, pid);
      } catch (_e) {
        return;
      }
      if (!actions || actions.length === 0) return;

      let action;
      try {
        action = currentSession.module.getBotAction(currentSession.state, pid);
      } catch (err) {
        console.error(`[bot] getBotAction error session=${sessionId} bot=${pid}`, err.message);
        return;
      }
      if (!action) return;

      handleActionInternal(io, sessionId, pid, action);

      const timers = pendingTimers.get(sessionId);
      if (timers) timers.delete(handle);
    }, delay);

    if (!pendingTimers.has(sessionId)) pendingTimers.set(sessionId, new Set());
    pendingTimers.get(sessionId).add(handle);
  }
}

function cancelSession(sessionId) {
  const timers = pendingTimers.get(sessionId);
  if (timers) {
    for (const t of timers) clearTimeout(t);
    pendingTimers.delete(sessionId);
  }
}

module.exports = { scheduleIfBot, cancelSession };
