// Cross-game achievements
module.exports = [
  {
    key: 'global_first_game',
    gameType: null,
    label: 'Welcome to GameCenter',
    description: 'Play your first game.',
    badge: '🎮',
    check({ gamesPlayed }) { return gamesPlayed >= 1; },
  },
  {
    key: 'global_ten_games',
    gameType: null,
    label: 'Regular',
    description: 'Play 10 games total.',
    badge: '🏅',
    check({ gamesPlayed }) { return gamesPlayed >= 10; },
  },
  {
    key: 'global_fifty_games',
    gameType: null,
    label: 'Veteran',
    description: 'Play 50 games total.',
    badge: '🏆',
    check({ gamesPlayed }) { return gamesPlayed >= 50; },
  },
  {
    key: 'global_first_win',
    gameType: null,
    label: 'Winner',
    description: 'Win your first game of anything.',
    badge: '🥇',
    check({ wins }) { return wins >= 1; },
  },
  {
    key: 'global_streak_5',
    gameType: null,
    label: 'On Fire',
    description: 'Win 5 games in a row across any games.',
    badge: '🔥',
    check({ currentStreak }) { return currentStreak >= 5; },
  },
  {
    key: 'global_social',
    gameType: null,
    label: 'Social Butterfly',
    description: 'Play all three game types at least once.',
    badge: '🦋',
    check({ gameEvents }) {
      const types = new Set(gameEvents.map(e => {
        try { return JSON.parse(e.metadata || '{}').gameType; } catch { return null; }
      }).filter(Boolean));
      return types.has('blackjack') && types.has('poker') && types.has('bs');
    },
  },
];
