import {
  CROSSWORD_PUZZLES,
  getCrosswordPuzzle,
  solutionAt,
  wordsOf,
  type CrosswordDir,
  type CrosswordMove,
  type CrosswordState,
  type CrosswordWord,
} from '@ebg/game-core/games/crossword';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameSessionView } from '../../../lib/session';
import { play } from '../../../lib/sound';
import '../../../styles/games/crossword.css';

const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

type Props = { session: GameSessionView<CrosswordState, CrosswordMove>; size: number };

export default function CrosswordBoard({ session, size }: Props) {
  const s = session.state;
  const puzzle = useMemo(() => getCrosswordPuzzle(s?.puzzleId ?? null), [s?.puzzleId]);
  const words = useMemo(() => (puzzle ? wordsOf(puzzle) : []), [puzzle]);
  const mobile = size < 768;

  // Cell → the across / down word passing through it, and the clue number shown in the corner.
  const index = useMemo(() => {
    const across: (CrosswordWord | undefined)[] = [];
    const down: (CrosswordWord | undefined)[] = [];
    const numbers: (number | undefined)[] = [];
    for (const w of words) {
      for (const c of w.cells) (w.dir === 'across' ? across : down)[c] = w;
      numbers[w.cells[0]!] = w.number;
    }
    return { across, down, numbers };
  }, [words]);

  const [sel, setSel] = useState(0);
  const [dir, setDir] = useState<CrosswordDir>('across');
  const [flipCells, setFlipCells] = useState<Set<number>>(() => new Set());
  const [wide, setWide] = useState(false);
  const prevRevealed = useRef<boolean[]>([]);
  const gridRef = useRef<HTMLDivElement>(null);
  const activeClueRef = useRef<HTMLButtonElement>(null);

  // Clues sit beside the grid only on wide viewports (the grid + 18rem panel must fit).
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Start on the first word of a freshly started puzzle; hardware keyboards need the grid focused.
  useEffect(() => {
    if (puzzle) {
      setSel(words[0]?.cells[0] ?? 0);
      setDir('across');
      if (!mobile) gridRef.current?.focus();
    }
  }, [puzzle, words]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flip-in newly revealed letters and chime.
  useEffect(() => {
    if (!s) return;
    const fresh = new Set<number>();
    s.revealed.forEach((r, i) => {
      if (r && !prevRevealed.current[i]) fresh.add(i);
    });
    prevRevealed.current = s.revealed;
    if (fresh.size === 0) return;
    play('hint');
    setFlipCells(fresh);
    const t = window.setTimeout(() => setFlipCells(new Set()), 650);
    return () => window.clearTimeout(t);
  }, [s?.revealed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (s?.winner === 0) play('solve');
  }, [s?.winner]);

  useEffect(() => {
    activeClueRef.current?.scrollIntoView({ block: 'nearest' });
  }, [sel, dir]);

  const wordAt = useCallback((cell: number, d: CrosswordDir) => (d === 'across' ? index.across[cell] : index.down[cell]), [index]);
  const current = wordAt(sel, dir) ?? wordAt(sel, dir === 'across' ? 'down' : 'across');
  const canEdit = session.canMove && !!s && s.phase === 'play' && s.winner === null;

  /** Select a cell; falls back to the other direction when the cell has no word this way. */
  const select = useCallback(
    (cell: number, d: CrosswordDir = dir) => {
      if (!s || s.cells[cell] === '#') return;
      setSel(cell);
      if (!wordAt(cell, d) && wordAt(cell, d === 'across' ? 'down' : 'across')) setDir(d === 'across' ? 'down' : 'across');
      else setDir(d);
    },
    [s, dir, wordAt],
  );

  const toggleDir = () => {
    const other: CrosswordDir = dir === 'across' ? 'down' : 'across';
    if (wordAt(sel, other)) setDir(other);
  };

  const moveInWord = (delta: number) => {
    if (!current) return;
    const i = current.cells.indexOf(sel);
    const next = current.cells[i + delta];
    if (next !== undefined) setSel(next);
  };

  const typeLetter = (letter: string) => {
    if (!s || !canEdit) return;
    if (s.cells[sel] !== '#' && !s.revealed[sel]) {
      session.submitMove({ type: 'set', cell: sel, letter });
      play('tile');
    }
    moveInWord(1);
  };

  const backspace = () => {
    if (!s || !canEdit) return;
    if (s.cells[sel] !== '' && !s.revealed[sel]) {
      session.submitMove({ type: 'clear', cell: sel });
      return;
    }
    if (!current) return;
    const prev = current.cells[current.cells.indexOf(sel) - 1];
    if (prev === undefined) return;
    setSel(prev);
    if (s.cells[prev] !== '' && !s.revealed[prev]) session.submitMove({ type: 'clear', cell: prev });
  };

  /** Arrow keys walk the grid skipping blocks; a perpendicular arrow first switches direction. */
  const arrow = (dr: number, dc: number) => {
    if (!s || !puzzle) return;
    const wantDir: CrosswordDir = dr === 0 ? 'across' : 'down';
    if (wantDir !== dir && wordAt(sel, wantDir)) {
      setDir(wantDir);
      return;
    }
    const n = puzzle.size;
    let r = Math.floor(sel / n) + dr;
    let c = (sel % n) + dc;
    while (r >= 0 && c >= 0 && r < n && c < n) {
      if (s.cells[r * n + c] !== '#') {
        select(r * n + c, wantDir);
        return;
      }
      r += dr;
      c += dc;
    }
  };

  const jumpWord = (delta: number) => {
    if (!current) return;
    const w = words[(current.index + delta + words.length) % words.length]!;
    setSel(w.cells.find((c) => s?.cells[c] === '') ?? w.cells[0]!);
    setDir(w.dir);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Letters are answers here, not shortcuts (GameScreen maps F to fullscreen on window).
    e.stopPropagation();
    if (/^[a-zA-Z]$/.test(e.key)) {
      e.preventDefault();
      typeLetter(e.key.toUpperCase());
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      backspace();
    } else if (e.key === 'Delete') {
      e.preventDefault();
      if (s && canEdit && s.cells[sel] !== '' && !s.revealed[sel]) session.submitMove({ type: 'clear', cell: sel });
    } else if (e.key === ' ') {
      e.preventDefault();
      toggleDir();
    } else if (e.key === 'ArrowLeft') { e.preventDefault(); arrow(0, -1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); arrow(0, 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); arrow(-1, 0); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); arrow(1, 0); }
    else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      jumpWord(e.shiftKey ? -1 : 1);
    }
  };

  const revealLetter = () => canEdit && s && s.cells[sel] !== '#' && !s.revealed[sel] && session.submitMove({ type: 'reveal_letter', cell: sel });
  const revealWord = () => canEdit && current && current.cells.some((c) => !s?.revealed[c]) && session.submitMove({ type: 'reveal_word', word: current.index });
  const clearWord = () => {
    if (!canEdit || !current || !s) return;
    for (const c of current.cells) if (s.cells[c] !== '' && !s.revealed[c]) session.submitMove({ type: 'clear', cell: c });
  };

  if (!s) return null;

  // ------------------------------------------------------------ picker
  if (s.phase === 'pick' || !puzzle) {
    return (
      <div className="w-full" style={{ maxWidth: Math.max(size, mobile ? size : 900) }}>
        <h2 className="mb-3 text-center font-display text-2xl font-bold">Pick a puzzle</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {CROSSWORD_PUZZLES.map((p) => (
            <button
              key={p.id}
              type="button"
              className="card cw-root flex min-h-[44px] flex-col items-start gap-2 p-3 text-left transition hover:-translate-y-0.5 hover:ring-white/30 disabled:opacity-60"
              style={{ ['--cw-bg' as string]: p.colors.bg, ['--cw-accent' as string]: p.colors.accent, ['--cw-cell' as string]: p.colors.cell }}
              disabled={!session.canMove}
              onClick={() => session.submitMove({ type: 'start', puzzleId: p.id })}
              aria-label={`${p.title}, ${p.theme} theme, ${p.size} by ${p.size}`}
            >
              <span className="grid w-full grid-cols-5 gap-0.5 rounded-lg p-1" style={{ background: p.colors.bg }} aria-hidden="true">
                {p.grid.slice(0, 5).map((row, r) =>
                  row.slice(0, 5).split('').map((ch, c) => (
                    <span key={`${r}-${c}`} className="aspect-square rounded-[2px]" style={{ background: ch === '#' ? 'transparent' : (r + c) % 3 === 0 ? p.colors.accent : p.colors.cell }} />
                  )),
                )}
              </span>
              <span className="font-display text-base font-bold leading-tight">{p.title}</span>
              <span className="text-xs text-slate-400">
                {p.theme} · {p.size}×{p.size} · {wordsOf(p).length} words
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------- play
  const n = puzzle.size;
  const gridWidth = mobile ? size : Math.min(size, 560);
  const cellPx = (gridWidth - 12 - (n - 1) * 2) / n;
  const openCells = s.cells.filter((c) => c !== '#').length;
  const filled = s.cells.filter((c) => c !== '#' && c !== '').length;
  const progress = Math.round((filled / openCells) * 100);
  const solved = s.winner === 0;
  const inWord = new Set(current?.cells ?? []);
  const wordDone = (w: CrosswordWord) => w.cells.every((c) => s.cells[c] === solutionAt(puzzle, c));

  const clueList = (d: CrosswordDir) => (
    <div>
      <h3 className="sticky top-0 z-10 mb-1 bg-ink-900/90 px-2 py-1 font-display text-sm font-bold uppercase tracking-wide text-slate-300 backdrop-blur">
        {d === 'across' ? 'Across' : 'Down'}
      </h3>
      <ul className="space-y-0.5">
        {words.filter((w) => w.dir === d).map((w) => {
          const active = current?.index === w.index;
          return (
            <li key={w.index}>
              <button
                ref={active ? activeClueRef : undefined}
                type="button"
                className={`cw-clue ${active ? 'cw-clue-active' : ''} ${wordDone(w) && !active ? 'cw-clue-done' : ''}`}
                onClick={() => {
                  setSel(w.cells.find((c) => s.cells[c] === '') ?? w.cells[0]!);
                  setDir(w.dir);
                  gridRef.current?.focus();
                }}
                aria-current={active ? 'true' : undefined}
              >
                <span className="cw-clue-num">{w.number}</span>
                <span>{w.clue}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <div
      className="cw-root flex w-full flex-col items-center gap-3 lg:flex-row lg:items-start lg:justify-center"
      style={{ ['--cw-bg' as string]: puzzle.colors.bg, ['--cw-accent' as string]: puzzle.colors.accent, ['--cw-cell' as string]: puzzle.colors.cell, maxWidth: mobile ? size : undefined }}
    >
      <div className="flex flex-col gap-2" style={{ width: gridWidth }}>
        {/* Title + progress */}
        <div className="flex items-center gap-3 px-1">
          <span className="font-display text-lg font-bold" style={{ color: puzzle.colors.accent }}>{puzzle.title}</span>
          <div className="ml-auto flex items-center gap-2 text-xs text-slate-300" aria-label={`${progress}% filled`}>
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10"><div className="cw-progress" style={{ width: `${progress}%` }} /></div>
            <span className="tabular-nums">{progress}%</span>
          </div>
        </div>

        {/* Active clue, pinned above the grid */}
        <div className="flex items-stretch gap-1 rounded-xl px-1 py-1 ring-1 ring-white/10" style={{ background: `color-mix(in srgb, ${puzzle.colors.accent} 18%, transparent)` }}>
          <button type="button" className="btn-ghost min-w-[44px] px-2" onClick={() => jumpWord(-1)} aria-label="Previous clue">‹</button>
          <div className="flex min-h-[44px] flex-1 flex-col justify-center px-2 text-sm leading-tight" aria-live="polite">
            {current ? (
              <>
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: puzzle.colors.accent }}>
                  {current.number} {current.dir} · {current.answer.length} letters
                </span>
                <span className="text-slate-100">{current.clue}</span>
              </>
            ) : (
              <span>Select a square</span>
            )}
          </div>
          <button type="button" className="btn-ghost min-w-[44px] px-2" onClick={() => jumpWord(1)} aria-label="Next clue">›</button>
        </div>

        {/* Grid */}
        <div
          ref={gridRef}
          className="cw-grid game-board"
          style={{ gridTemplateColumns: `repeat(${n}, 1fr)`, width: gridWidth, fontSize: cellPx * 0.55 }}
          role="grid"
          aria-label={`${puzzle.title} crossword grid, ${n} by ${n}. Type letters; arrows move; space switches direction.`}
          tabIndex={0}
          onKeyDown={onKey}
        >
          {s.cells.map((ch, i) => {
            const block = ch === '#';
            const wrong = s.checked && !block && ch !== '' && ch !== solutionAt(puzzle, i);
            const cls = [
              'cw-cell',
              block ? 'cw-block' : '',
              !block && inWord.has(i) ? 'cw-in-word' : '',
              i === sel && !block ? 'cw-selected' : '',
              s.revealed[i] ? 'cw-revealed' : '',
              wrong ? 'cw-wrong' : '',
              solved ? 'cw-solved' : '',
              flipCells.has(i) ? 'cw-reveal' : '',
            ].join(' ');
            const r = Math.floor(i / n) + 1;
            const c = (i % n) + 1;
            return (
              <div
                key={i}
                role="gridcell"
                className={cls}
                style={solved ? { animationDelay: `${(r + c) * 30}ms` } : undefined}
                aria-selected={i === sel}
                aria-label={block ? 'Block' : `Row ${r} column ${c}${index.numbers[i] ? `, clue ${index.numbers[i]}` : ''}: ${ch || 'empty'}${s.revealed[i] ? ', revealed' : ''}`}
                onPointerDown={(e) => {
                  if (block) return;
                  e.preventDefault();
                  if (i === sel) toggleDir();
                  else select(i);
                  gridRef.current?.focus();
                }}
              >
                {!block && index.numbers[i] !== undefined && <span className="cw-num">{index.numbers[i]}</span>}
                {!block && ch && <span className="cw-letter">{ch}</span>}
              </div>
            );
          })}
        </div>

        {/* Hint / check controls */}
        <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Crossword tools">
          <button type="button" className="btn-ghost min-h-[44px] text-sm" disabled={!canEdit || s.revealed[sel]} onClick={revealLetter}>💡 Reveal letter</button>
          <button type="button" className="btn-ghost min-h-[44px] text-sm" disabled={!canEdit || !current || current.cells.every((c) => s.revealed[c])} onClick={revealWord}>✨ Reveal word</button>
          <button type="button" className="btn-ghost min-h-[44px] text-sm" aria-pressed={s.checked} disabled={!canEdit} onClick={() => session.submitMove({ type: 'toggle_check' })}>
            {s.checked ? '✅ Checking' : '🔍 Check'}
          </button>
          <button type="button" className="btn-ghost min-h-[44px] text-sm" disabled={!canEdit || !current} onClick={clearWord}>🧹 Clear word</button>
          <span className="ml-auto self-center text-xs text-slate-400">{s.hintsUsed} hint{s.hintsUsed === 1 ? '' : 's'}</span>
        </div>

        {/* On-screen keyboard for touch devices */}
        {mobile && !solved && (
          <div className="flex flex-col gap-1.5" aria-label="On-screen keyboard">
            {KEY_ROWS.map((row, ri) => (
              <div key={row} className="flex gap-1" style={{ paddingInline: ri === 1 ? '4%' : 0 }}>
                {row.split('').map((k) => (
                  <button key={k} type="button" className="cw-key" disabled={!canEdit} onPointerDown={(e) => e.preventDefault()} onClick={() => typeLetter(k)} aria-label={`Letter ${k}`}>
                    {k}
                  </button>
                ))}
                {ri === 2 && (
                  <button type="button" className="cw-key" style={{ flexGrow: 1.6 }} disabled={!canEdit} onPointerDown={(e) => e.preventDefault()} onClick={backspace} aria-label="Backspace">⌫</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Clue lists: beside the grid on desktop, below on mobile */}
      <div
        className="card no-scrollbar overflow-y-auto p-2 lg:w-72 lg:shrink-0"
        style={{ maxHeight: wide ? gridWidth + 140 : mobile ? 260 : 320, width: wide ? undefined : gridWidth }}
      >
        <div className={wide ? 'space-y-3' : 'grid grid-cols-2 gap-2'}>
          {clueList('across')}
          {clueList('down')}
        </div>
      </div>
    </div>
  );
}
