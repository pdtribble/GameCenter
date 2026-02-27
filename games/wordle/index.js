// Wordle — pure game logic, zero side effects

function mulberry32(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getDailyWord(wordList, date = new Date()) {
  const epoch = new Date('2024-01-01');
  const days = Math.floor((date - epoch) / 86400000);
  const seed = days;
  const rng = mulberry32(seed);
  const idx = Math.floor(rng() * wordList.length);
  const word = wordList[idx]?.toUpperCase() || wordList[0].toUpperCase();
  const dateStr = date.toISOString().split('T')[0];
  return { word, seed, date: dateStr };
}

function makeUsedLetters() {
  const letters = {};
  for (let i = 65; i <= 90; i++) {
    letters[String.fromCharCode(i)] = 'unused';
  }
  return letters;
}

function initGame(targetWord, mode = 'free', seed = null, date = null) {
  return {
    mode,
    targetWord: targetWord.toUpperCase(),
    seed,
    date,
    guesses: [],
    phase: 'playing',
    currentInput: '',
    usedLetters: makeUsedLetters(),
  };
}

function inputLetter(state, letter) {
  if (state.phase !== 'playing') return state;
  if (state.currentInput.length >= 5) return state;
  return {
    ...state,
    currentInput: (state.currentInput + letter.toUpperCase()).slice(0, 5),
  };
}

function deleteLetter(state) {
  if (state.currentInput.length === 0) return state;
  return {
    ...state,
    currentInput: state.currentInput.slice(0, -1),
  };
}

function evaluateGuess(guess, target) {
  const result = new Array(5).fill('absent');
  const targetArr = target.split('');
  const guessArr = guess.split('');
  
  // Pass 1: mark exact matches
  for (let i = 0; i < 5; i++) {
    if (guessArr[i] === targetArr[i]) {
      result[i] = 'correct';
      targetArr[i] = null;
      guessArr[i] = null;
    }
  }
  
  // Pass 2: mark present (only for unmatched letters)
  for (let i = 0; i < 5; i++) {
    if (guessArr[i] === null) continue;
    const targetIdx = targetArr.indexOf(guessArr[i]);
    if (targetIdx !== -1) {
      result[i] = 'present';
      targetArr[targetIdx] = null;
    }
  }
  
  return result;
}

function updateUsedLetters(usedLetters, word, result) {
  const updated = { ...usedLetters };
  for (let i = 0; i < 5; i++) {
    const letter = word[i];
    const status = result[i];
    const priority = { correct: 3, present: 2, absent: 1, unused: 0 };
    if (priority[status] > priority[updated[letter] || 'unused']) {
      updated[letter] = status;
    }
  }
  return updated;
}

function submitGuess(state, validWords) {
  if (state.currentInput.length !== 5) {
    return { state, error: 'not_enough_letters' };
  }
  
  const word = state.currentInput.toUpperCase();
  const upperWords = validWords.map(w => w.toUpperCase());
  
  if (!upperWords.includes(word)) {
    return { state, error: 'not_in_word_list' };
  }
  
  const result = evaluateGuess(word, state.targetWord);
  const newGuesses = [...state.guesses, { word, result }];
  const newUsedLetters = updateUsedLetters(state.usedLetters, word, result);
  
  let phase = 'playing';
  if (word === state.targetWord) {
    phase = 'won';
  } else if (newGuesses.length === 6) {
    phase = 'lost';
  }
  
  return {
    state: {
      ...state,
      guesses: newGuesses,
      usedLetters: newUsedLetters,
      currentInput: '',
      phase,
    },
    error: null,
  };
}

function getShareText(state) {
  const emojiMap = { correct: '🟩', present: '🟨', absent: '⬛' };
  const rows = state.guesses.map(g => g.result.map(s => emojiMap[s]).join('')).join('\n');
  const attempts = state.phase === 'won' ? state.guesses.length : 'X';
  return `GameCenter Wordle #${state.seed || state.date}\n${rows}\n${attempts}/6`;
}

function serializeState(state) {
  return JSON.stringify(state);
}

function deserializeState(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

module.exports = {
  getDailyWord,
  mulberry32,
  initGame,
  inputLetter,
  deleteLetter,
  submitGuess,
  evaluateGuess,
  getShareText,
  serializeState,
  deserializeState,
};
