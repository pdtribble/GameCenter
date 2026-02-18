module.exports = [
  {
    key: 'poker_first_win',
    gameType: 'poker',
    label: 'Poker Face',
    description: 'Win your first poker hand.',
    badge: '♠',
    check({ wins }) { return wins >= 1; },
  },
  {
    key: 'poker_ten_wins',
    gameType: 'poker',
    label: 'High Roller',
    description: 'Win 10 poker hands.',
    badge: '💰',
    check({ wins }) { return wins >= 10; },
  },
  {
    key: 'poker_streak_3',
    gameType: 'poker',
    label: 'Hat Trick',
    description: 'Win 3 poker hands in a row.',
    badge: '🎩',
    check({ currentStreak }) { return currentStreak >= 3; },
  },
];
