// Game Night mode — orchestrates a playlist of games in sequence
// Settings shape: { playlist: [{ gameType, settings }], scores: {playerId: number} }

const { v4: uuidv4 } = require('uuid');
const db = require('./db');

// In-memory game night state
const activeNights = new Map(); // lobbyId -> { playlist, currentIndex, scores, io }

function startGameNight(io, lobby, players, gameRunner) {
  const settings = JSON.parse(lobby.settings || '{}');
  const playlist = settings.playlist;

  if (!Array.isArray(playlist) || playlist.length === 0) {
    throw new Error('Game Night requires a playlist in settings.');
  }

  const scores = Object.fromEntries(players.map(p => [p.id, 0]));

  activeNights.set(lobby.id, {
    playlist,
    currentIndex: 0,
    scores,
    lobbyId: lobby.id,
    players,
    io,
    gameRunner,
  });

  startNextGame(lobby.id);
}

function startNextGame(lobbyId) {
  const night = activeNights.get(lobbyId);
  if (!night) return;

  const { playlist, currentIndex, players, io, gameRunner } = night;

  if (currentIndex >= playlist.length) {
    // All games done — show overall winner
    return finishGameNight(lobbyId);
  }

  const { gameType, settings } = playlist[currentIndex];

  // Build a fake lobby object for the game runner
  const fakeLobby = {
    id: lobbyId,
    game_type: gameType,
    settings: JSON.stringify(settings || {}),
  };

  io.to(`lobby:${lobbyId}`).emit('server:announcement', {
    message: `Game Night: Starting game ${currentIndex + 1}/${playlist.length} — ${gameType}`,
  });

  gameRunner.startGame(io, fakeLobby, players);
}

function handleGameOver(lobbyId, placements, gameRunner) {
  const night = activeNights.get(lobbyId);
  if (!night) return;

  // Award points: 1st = N points, 2nd = N-1, etc.
  const n = placements.length;
  for (const p of placements) {
    night.scores[p.playerId] = (night.scores[p.playerId] || 0) + Math.max(0, n - p.placement + 1);
  }

  night.currentIndex++;

  // Emit cumulative scores + countdown to next game
  night.io.to(`lobby:${lobbyId}`).emit('server:game_over', {
    results: placements,
    postGameSummary: getCumulativeSummary(night),
    gameNight: {
      currentIndex: night.currentIndex,
      total: night.playlist.length,
      scores: night.scores,
      isLast: night.currentIndex >= night.playlist.length,
    },
  });

  if (night.currentIndex < night.playlist.length) {
    // Countdown 10 seconds then start next game
    setTimeout(() => startNextGame(lobbyId), 10000);
  } else {
    finishGameNight(lobbyId);
  }
}

function finishGameNight(lobbyId) {
  const night = activeNights.get(lobbyId);
  if (!night) return;

  const sortedScores = Object.entries(night.scores)
    .sort((a, b) => b[1] - a[1]);

  const placements = sortedScores.map(([playerId, score], i) => ({
    playerId,
    placement: i + 1,
    result: i === 0 ? 'win' : 'loss',
    score,
  }));

  night.io.to(`lobby:${lobbyId}`).emit('server:game_over', {
    results: placements,
    postGameSummary: sortedScores.map(([id, score]) => ({
      label: id,
      value: `${score} points`,
    })),
    gameNight: { finished: true, scores: night.scores },
  });

  db.prepare("UPDATE lobbies SET status = 'finished' WHERE id = ?").run(lobbyId);
  activeNights.delete(lobbyId);
}

function getCumulativeSummary(night) {
  return Object.entries(night.scores)
    .sort((a, b) => b[1] - a[1])
    .map(([playerId, score]) => ({ label: playerId, value: `${score} pts` }));
}

function isGameNight(lobbyId) { return activeNights.has(lobbyId); }

module.exports = { startGameNight, handleGameOver, isGameNight };
