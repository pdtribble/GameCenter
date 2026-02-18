module.exports = [
  {
    key: 'bs_first_win',
    gameType: 'bs',
    label: 'Smooth Talker',
    description: 'Win your first game of BS.',
    badge: '🤫',
    check({ wins }) { return wins >= 1; },
  },
  {
    key: 'bs_five_wins',
    gameType: 'bs',
    label: 'Master of Deception',
    description: 'Win 5 games of BS.',
    badge: '🎭',
    check({ wins }) { return wins >= 5; },
  },
  {
    key: 'bs_successful_bs',
    gameType: 'bs',
    label: 'You Got Away With It',
    description: 'Have someone call BS on you and be wrong.',
    badge: '😏',
    check({ gameEvents }) {
      return gameEvents.some(e => {
        if (e.event_type !== 'bs_called') return false;
        try {
          const meta = JSON.parse(e.metadata || '{}');
          return meta.wasTruth === true && meta.loser !== e.player_id;
        } catch { return false; }
      });
    },
  },
  {
    key: 'bs_caught_bluffing',
    gameType: 'bs',
    label: 'Busted',
    description: 'Get caught bluffing 10 times across all games.',
    badge: '🚨',
    check({ gameEvents }) {
      return gameEvents.filter(e => {
        if (e.event_type !== 'bs_called') return false;
        try {
          const meta = JSON.parse(e.metadata || '{}');
          return meta.wasTruth === false && meta.accused === e.player_id;
        } catch { return false; }
      }).length >= 10;
    },
  },
];
