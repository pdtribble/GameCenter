module.exports = [
  {
    key: 'blackjack_first_win',
    gameType: 'blackjack',
    label: 'Beginner\'s Luck',
    description: 'Win your first blackjack game.',
    badge: '🃏',
    check({ wins }) {
      return wins >= 1;
    },
  },
  {
    key: 'blackjack_natural',
    gameType: 'blackjack',
    label: 'Natural',
    description: 'Win with a natural blackjack (21 on first two cards).',
    badge: '⭐',
    check({ gameEvents }) {
      // Look for a win event after a blackjack hand
      return gameEvents.some(e => {
        if (e.event_type !== 'game_over') return false;
        try {
          const meta = JSON.parse(e.metadata || '{}');
          return meta.result === 'win' && meta.natural === true;
        } catch { return false; }
      });
    },
  },
  {
    key: 'blackjack_five_wins',
    gameType: 'blackjack',
    label: 'Card Shark',
    description: 'Win 5 blackjack games.',
    badge: '🦈',
    check({ wins }) {
      return wins >= 5;
    },
  },
  {
    key: 'blackjack_streak_3',
    gameType: 'blackjack',
    label: 'On a Roll',
    description: 'Win 3 blackjack games in a row.',
    badge: '🔥',
    check({ currentStreak }) {
      return currentStreak >= 3;
    },
  },
];
