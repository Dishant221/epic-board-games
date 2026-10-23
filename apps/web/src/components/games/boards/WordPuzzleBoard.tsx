import { isValidWord, MAX_GUESSES, WORD_LENGTH, type WordMark, type WordPuzzleMove, type WordPuzzleState } from '@ebg/game-core/games/word-puzzle';
import { useEffect, useRef, useState } from 'react';
import type { GameSessionView } from '../../../lib/session';
import { play } from '../../../lib/sound';
import '../../../styles/games/word-puzzle.css';

const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const FLIP_MS = 500;
const STAGGER_MS = 250;
/** Time for a full row to finish flipping (keep in step with GameScreen's game-over delay). */
const REVEAL_MS = FLIP_MS + STAGGER_MS * (WORD_LENGTH - 1);
const MARK_RANK: Record<WordMark, number> = { g: 3, y: 2, x: 1 };
const MARK_COLOR: Record<WordMark, string> = { g: 'var(--wp-g)', y: 'var(--wp-y)', x: 'var(--wp-x)' };
const MARK_WORD: Record<WordMark, string> = { g: 'correct', y: 'elsewhere', x: 'absent' };
const EMOJI: Record<WordMark, string> = { g: '🟩', y: '🟨', x: '⬛' };

export default function WordPuzzleBoard({ session, size }: { session: GameSessionView<WordPuzzleState, WordPuzzleMove>; size: number }) {
  const s = session.state;
  const [input, setInput] = useState('');
  const [shake, setShake] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /** Number of guess rows whose flip animation has completed. */
  const [revealed, setRevealed] = useState(0);
  const [announce, setAnnounce] = useState('');
  const toastTimer = useRef<number | undefined>(undefined);
  const width = Math.min(size, 420);
  const gap = 6;
  const tile = (width - gap * (WORD_LENGTH - 1)) / WORD_LENGTH;

  const guessCount = s?.guesses.length ?? 0;
  const over = s?.winner !== null && s?.winner !== undefined;
  const revealing = guessCount > revealed;

  // Flip the newest row, then unlock the keyboard colours and play the win sound.
  useEffect(() => {
    if (!s) return;
    if (guessCount < revealed) {
      setRevealed(guessCount); // new puzzle
      setInput('');
      return;
    }
    if (guessCount === revealed) return;
    // A fresh snapshot with several rows (online reconnect): show them without animating.
    if (guessCount - revealed > 1) {
      setRevealed(guessCount);
      return;
    }
    setInput('');
    const t = window.setTimeout(() => {
      setRevealed(guessCount);
      const word = s.guesses[guessCount - 1]!;
      const marks = s.marks[guessCount - 1]!;
      if (s.winner === 0) {
        play('solve');
        setAnnounce(`${word.toUpperCase()} is correct. Solved in ${guessCount} of ${MAX_GUESSES}.`);
      } else {
        setAnnounce(`${word.toUpperCase()}: ${word.split('').map((ch, i) => `${ch.toUpperCase()} ${MARK_WORD[marks[i]!]}`).join(', ')}`);
      }
    }, REVEAL_MS);
    return () => window.clearTimeout(t);
  }, [guessCount, revealed]); // eslint-disable-line react-hooks/exhaustive-deps

  const showToast = (msg: string) => {
    window.clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = window.setTimeout(() => setToast(null), 1600);
  };
  const reject = (msg: string) => {
    play('error');
    setShake(true);
    window.setTimeout(() => setShake(false), 450);
    showToast(msg);
  };

  const canType = !!s && session.canMove && !over && !revealing;
  const typeLetter = (ch: string) => {
    if (!canType || input.length >= WORD_LENGTH) return;
    play('tile');
    setInput((v) => (v.length < WORD_LENGTH ? v + ch : v));
  };
  const backspace = () => {
    if (!canType) return;
    setInput((v) => v.slice(0, -1));
  };
  const submit = () => {
    if (!s || !canType) return;
    if (input.length < WORD_LENGTH) return reject('Not enough letters');
    if (!isValidWord(input)) return reject('Not in word list');
    if (s.guesses.includes(input)) return reject('Already guessed');
    session.submitMove({ type: 'guess', word: input });
  };

  // Hardware keyboard. Registered in the capture phase so that, while a guess
  // is being typed, letters never reach GameScreen's single-key shortcuts (F = fullscreen).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        backspace();
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        if (canType) e.stopPropagation();
        typeLetter(e.key.toLowerCase());
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!s) return null;

  // Best-known mark per letter, from fully revealed rows only.
  const keyMarks: Partial<Record<string, WordMark>> = {};
  for (let r = 0; r < revealed; r++) {
    const word = s.guesses[r]!;
    for (let i = 0; i < WORD_LENGTH; i++) {
      const m = s.marks[r]![i]!;
      const cur = keyMarks[word[i]!];
      if (!cur || MARK_RANK[m] > MARK_RANK[cur]) keyMarks[word[i]!] = m;
    }
  }

  const share = async () => {
    const header = `Word Puzzle ${s.winner === 0 ? guessCount : 'X'}/${MAX_GUESSES}`;
    const rows = s.marks.map((row) => row.map((m) => EMOJI[m]).join('')).join('\n');
    try {
      await navigator.clipboard.writeText(`${header}\n\n${rows}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Could not copy');
    }
  };

  return (
    <div className="wp-board flex flex-col items-center gap-4" style={{ width: Math.min(size, 520) }}>
      <div className="relative" style={{ width }}>
        {toast && (
          <div className="wp-toast absolute -top-2 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-ink-950 shadow-lg" role="status">
            {toast}
          </div>
        )}
        <span className="sr-only" aria-live="polite">{announce}</span>

        <div className="game-board flex flex-col" style={{ gap }} role="grid" aria-label={`Word puzzle grid: ${MAX_GUESSES} guesses of ${WORD_LENGTH} letters`}>
          {Array.from({ length: MAX_GUESSES }, (_, r) => {
            const guess = s.guesses[r];
            const isCurrent = !guess && r === guessCount && !over;
            const letters = guess ?? (isCurrent ? input : '');
            return (
              <div key={r} className={`wp-row flex ${isCurrent && shake ? 'shake' : ''}`} style={{ gap }} role="row">
                {Array.from({ length: WORD_LENGTH }, (_, i) => {
                  const ch = letters[i] ?? '';
                  const mark = guess ? s.marks[r]![i]! : null;
                  const state = guess ? (r < revealed ? 'wp-revealed' : 'wp-flip') : ch ? 'wp-filled' : '';
                  return (
                    <div
                      key={i}
                      role="gridcell"
                      aria-label={guess && r < revealed ? `${ch.toUpperCase()} ${MARK_WORD[mark!]}` : ch ? ch.toUpperCase() : 'empty'}
                      className={`wp-tile ${state}`}
                      data-mark={mark && r <= revealed ? mark : undefined}
                      style={{
                        width: tile,
                        height: tile,
                        fontSize: tile * 0.5,
                        ['--wp-mark' as string]: mark ? MARK_COLOR[mark] : undefined,
                        animationDelay: state === 'wp-flip' ? `${i * STAGGER_MS}ms` : undefined,
                      }}
                    >
                      {ch}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {over && !revealing && (
        <button type="button" className="btn-primary" onClick={share} aria-live="polite">
          {copied ? 'Copied!' : '📋 Share result'}
        </button>
      )}

      {/* On-screen keyboard */}
      <div className="flex w-full flex-col items-center gap-1.5" role="group" aria-label="Keyboard">
        {KEY_ROWS.map((row, r) => (
          <div key={row} className="flex w-full justify-center gap-1">
            {r === 2 && (
              <button type="button" className="wp-key flex-[1.6] px-1 text-xs" onClick={submit} disabled={!canType} aria-label="Submit guess">
                Enter
              </button>
            )}
            {row.split('').map((ch) => (
              <button
                key={ch}
                type="button"
                className="wp-key flex-1 px-0 text-base"
                data-mark={keyMarks[ch]}
                onClick={() => typeLetter(ch)}
                disabled={!canType}
                aria-label={keyMarks[ch] ? `${ch.toUpperCase()}, ${MARK_WORD[keyMarks[ch]!]}` : ch.toUpperCase()}
              >
                {ch}
              </button>
            ))}
            {r === 2 && (
              <button type="button" className="wp-key flex-[1.6] px-1 text-lg" onClick={backspace} disabled={!canType} aria-label="Backspace">
                ⌫
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
