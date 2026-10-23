import { IllegalMoveError, LOST, type GameEngine } from './types';
import { ANSWERS, isValidWord } from './word-puzzle-data';

export { ANSWERS, ALLOWED, isValidWord } from './word-puzzle-data';

export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;

/** 'g' = right letter, right spot; 'y' = in the word elsewhere; 'x' = absent. */
export type WordMark = 'g' | 'y' | 'x';

export interface WordPuzzleState {
  answer: string;
  guesses: string[];
  marks: WordMark[][];
  winner: number | null;
  startedAt: number;
}

export type WordPuzzleMove = { type: 'guess'; word: string };

/**
 * Scores `guess` against `answer`. Greens are taken first so a letter is only
 * marked yellow as many times as it appears in the answer beyond the greens.
 */
export function scoreGuess(answer: string, guess: string): WordMark[] {
  const marks: WordMark[] = Array<WordMark>(WORD_LENGTH).fill('x');
  const spare: Record<string, number> = {};
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === answer[i]) marks[i] = 'g';
    else spare[answer[i]!] = (spare[answer[i]!] ?? 0) + 1;
  }
  for (let i = 0; i < WORD_LENGTH; i++) {
    const ch = guess[i]!;
    if (marks[i] === 'x' && spare[ch]) {
      marks[i] = 'y';
      spare[ch]!--;
    }
  }
  return marks;
}

const WORD_RE = /^[a-z]{5}$/;

export const wordPuzzle: GameEngine<WordPuzzleState, WordPuzzleMove> = {
  id: 'word_puzzle',
  init(playerCount, rng) {
    if (playerCount !== 1) throw new Error('Word Puzzle is single-player');
    return { answer: rng.pick(ANSWERS), guesses: [], marks: [], winner: null, startedAt: Date.now() };
  },
  currentPlayer: () => 0,
  // Guesses are free-form: a single template move stands in for the dictionary.
  legalMoves: (s) => (s.winner === null ? [{ type: 'guess', word: '' }] : []),
  validateMove: (s, m) => s.winner === null && m.type === 'guess' && isValidWord(m.word) && !s.guesses.includes(m.word),
  applyMove(s, m) {
    if (s.winner !== null) throw new IllegalMoveError('Game is over');
    if (m.type !== 'guess' || !isValidWord(m.word)) throw new IllegalMoveError('Not in word list');
    if (s.guesses.includes(m.word)) throw new IllegalMoveError('Already guessed');
    const marks = scoreGuess(s.answer, m.word);
    const guesses = [...s.guesses, m.word];
    const solved = m.word === s.answer;
    return {
      ...s,
      guesses,
      marks: [...s.marks, marks],
      winner: solved ? 0 : guesses.length >= MAX_GUESSES ? LOST : null,
    };
  },
  isTerminal: (s) => s.winner !== null,
  winner: (s) => s.winner,
  parseMove(raw) {
    const r = raw as { type?: unknown; word?: unknown } | null;
    if (!r || typeof r !== 'object' || r.type !== 'guess' || typeof r.word !== 'string') return null;
    const word = r.word.trim().toLowerCase();
    return WORD_RE.test(word) ? { type: 'guess', word } : null;
  },
  sameMove: (a, b) => a.type === b.type && a.word === b.word,
  summary(s) {
    if (s.winner === null) return null;
    const word = `The word was ${s.answer.toUpperCase()}`;
    return s.winner === 0 ? `${word} — solved in ${s.guesses.length}/${MAX_GUESSES}` : word;
  },
};
