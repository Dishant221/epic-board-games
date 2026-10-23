import { describe, expect, it } from 'vitest';
import { createRng, IllegalMoveError, isLegalMove, LOST } from '../src';
// Imported by path until the integrator registers the engine in games/index.ts.
import { ALLOWED, ANSWERS, isValidWord, MAX_GUESSES, scoreGuess, wordPuzzle, type WordPuzzleState } from '../src/games/word-puzzle';

const rng = createRng(1);
const fixed = (answer: string): WordPuzzleState => ({ ...wordPuzzle.init(1, rng), answer });
/** Six valid guesses that are not the fixed test answer. */
const MISSES = ['abbey', 'abbot', 'abide', 'abode', 'acorn', 'acrid'];

describe('scoreGuess', () => {
  it('marks exact, misplaced and absent letters', () => {
    expect(scoreGuess('crane', 'crane').join('')).toBe('ggggg');
    expect(scoreGuess('crane', 'nacre').join('')).toBe('yyyyg');
    expect(scoreGuess('crane', 'bumpy').join('')).toBe('xxxxx');
    expect(scoreGuess('crane', 'cloth').join('')).toBe('gxxxx');
  });

  it('only marks a repeated letter yellow as often as it appears beyond the greens', () => {
    // Two E's in SPEED: the first two E's of EERIE are yellow, the third is grey.
    expect(scoreGuess('speed', 'eerie').join('')).toBe('yyxxx');
    expect(scoreGuess('speed', 'erase').join('')).toBe('yxxyy');
    // A green E consumes one of the answer's E's; the other guess E is yellow.
    expect(scoreGuess('speed', 'seeds').join('')).toBe('gygyx');
    // ALLEE has two L's and two E's.
    expect(scoreGuess('allee', 'eagle').join('')).toBe('yyxyg');
    expect(scoreGuess('allee', 'level').join('')).toBe('yyxgy');
    // Green wins over yellow for a letter that appears once in the answer.
    expect(scoreGuess('abbey', 'babes').join('')).toBe('yyggx');
    expect(scoreGuess('robot', 'boots').join('')).toBe('ygyyx');
  });
});

describe('word puzzle engine', () => {
  it('picks a deterministic answer from ANSWERS for a seed', () => {
    const a = wordPuzzle.init(1, createRng(77));
    const b = wordPuzzle.init(1, createRng(77));
    expect(a.answer).toBe(b.answer);
    expect(ANSWERS).toContain(a.answer);
    expect(a.guesses).toEqual([]);
    expect(a.winner).toBeNull();
    expect(wordPuzzle.legalMoves(a)).toEqual([{ type: 'guess', word: '' }]);
  });

  it('wins with winner 0 and summarises the result', () => {
    let s = fixed('crane');
    s = wordPuzzle.applyMove(s, { type: 'guess', word: 'abbey' }, rng);
    s = wordPuzzle.applyMove(s, { type: 'guess', word: 'crane' }, rng);
    expect(s.winner).toBe(0);
    expect(s.marks[1]!.join('')).toBe('ggggg');
    expect(wordPuzzle.isTerminal(s)).toBe(true);
    expect(wordPuzzle.legalMoves(s)).toEqual([]);
    expect(wordPuzzle.summary!(s)).toBe('The word was CRANE — solved in 2/6');
    expect(() => wordPuzzle.applyMove(s, { type: 'guess', word: 'abbot' }, rng)).toThrow(IllegalMoveError);
  });

  it('is LOST after six misses', () => {
    let s = fixed('crane');
    for (const word of MISSES) {
      expect(s.winner).toBeNull();
      s = wordPuzzle.applyMove(s, { type: 'guess', word }, rng);
    }
    expect(s.guesses).toHaveLength(MAX_GUESSES);
    expect(s.winner).toBe(LOST);
    expect(wordPuzzle.summary!(s)).toBe('The word was CRANE');
    expect(wordPuzzle.validateMove!(s, { type: 'guess', word: 'crane' })).toBe(false);
  });

  it('rejects invalid and duplicate guesses via validateMove and applyMove', () => {
    const s = wordPuzzle.applyMove(fixed('crane'), { type: 'guess', word: 'abbey' }, rng);
    expect(wordPuzzle.validateMove!(s, { type: 'guess', word: 'zzzzz' })).toBe(false);
    expect(wordPuzzle.validateMove!(s, { type: 'guess', word: 'abbey' })).toBe(false);
    expect(wordPuzzle.validateMove!(s, { type: 'guess', word: '' })).toBe(false);
    expect(wordPuzzle.validateMove!(s, { type: 'guess', word: 'abbot' })).toBe(true);
    expect(isLegalMove(wordPuzzle, s, { type: 'guess', word: 'abbot' })).toBe(true);
    expect(isLegalMove(wordPuzzle, s, { type: 'guess', word: 'qwxyz' })).toBe(false);
    expect(() => wordPuzzle.applyMove(s, { type: 'guess', word: 'zzzzz' }, rng)).toThrow(IllegalMoveError);
    expect(() => wordPuzzle.applyMove(s, { type: 'guess', word: 'abbey' }, rng)).toThrow(IllegalMoveError);
    expect(() => wordPuzzle.applyMove(s, { type: 'guess', word: '' }, rng)).toThrow(IllegalMoveError);
    expect(s.guesses).toEqual(['abbey']); // never mutated
  });

  it('parseMove lowercases and validates the shape', () => {
    expect(wordPuzzle.parseMove({ type: 'guess', word: 'CRANE' })).toEqual({ type: 'guess', word: 'crane' });
    expect(wordPuzzle.parseMove({ type: 'guess', word: ' Crane ' })).toEqual({ type: 'guess', word: 'crane' });
    expect(wordPuzzle.parseMove({ type: 'guess', word: 'cran' })).toBeNull();
    expect(wordPuzzle.parseMove({ type: 'guess', word: 'cr4ne' })).toBeNull();
    expect(wordPuzzle.parseMove({ type: 'guess', word: 12345 })).toBeNull();
    expect(wordPuzzle.parseMove({ type: 'roll' })).toBeNull();
    expect(wordPuzzle.parseMove(null)).toBeNull();
    expect(wordPuzzle.sameMove({ type: 'guess', word: 'crane' }, { type: 'guess', word: 'crane' })).toBe(true);
    expect(wordPuzzle.sameMove({ type: 'guess', word: 'crane' }, { type: 'guess', word: 'crate' })).toBe(false);
  });
});

describe('word lists', () => {
  it('has enough words, all five lowercase letters, with no duplicates or overlap', () => {
    expect(ANSWERS.length).toBeGreaterThanOrEqual(400);
    expect(ALLOWED.length).toBeGreaterThanOrEqual(1500);
    for (const w of [...ANSWERS, ...ALLOWED]) expect(w).toMatch(/^[a-z]{5}$/);
    expect(new Set(ANSWERS).size).toBe(ANSWERS.length);
    expect(new Set(ALLOWED).size).toBe(ALLOWED.length);
    expect(new Set([...ANSWERS, ...ALLOWED]).size).toBe(ANSWERS.length + ALLOWED.length);
    for (const w of ANSWERS) expect(isValidWord(w)).toBe(true);
    expect(isValidWord('zzzzz')).toBe(false);
    expect(isValidWord('CRANE')).toBe(false);
  });
});
