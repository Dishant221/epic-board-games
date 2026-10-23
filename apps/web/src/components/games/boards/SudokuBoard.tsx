import { PEERS, SUDOKU_CLUES, SUDOKU_DIFFICULTIES, type SudokuDifficulty, type SudokuMove, type SudokuState } from '@ebg/game-core/games/sudoku';
import { useEffect, useRef, useState } from 'react';
import type { GameSessionView } from '../../../lib/session';
import { play } from '../../../lib/sound';
import '../../../styles/games/sudoku.css';

const DIFFICULTY_BLURB: Record<SudokuDifficulty, string> = {
  easy: 'Gentle warm-up',
  medium: 'A fair challenge',
  hard: 'Pencil marks recommended',
  expert: 'Fiendish',
};

const formatTime = (ms: number) => {
  const secs = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
};

export default function SudokuBoard({ session, size }: { session: GameSessionView<SudokuState, SudokuMove>; size: number }) {
  const s = session.state;
  const [selected, setSelected] = useState<number | null>(null);
  const [pencilMode, setPencilMode] = useState(false);
  const [announce, setAnnounce] = useState('');
  const [shakeCell, setShakeCell] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const prev = useRef<SudokuState | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const width = Math.min(size, 560);
  const cell = width / 9;

  const playing = s?.phase === 'play';
  const solved = s?.winner === 0;

  // Running clock while the puzzle is in progress.
  useEffect(() => {
    if (!playing || solved) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [playing, solved]);

  // React to each applied move: sounds, announcements and the mistake shake.
  useEffect(() => {
    const p = prev.current;
    prev.current = s;
    if (!s || !p) return;
    if (s.phase === 'pick') {
      setSelected(null);
      return;
    }
    const changed = s.cells.findIndex((v, i) => v !== p.cells[i]);
    if (s.winner === 0 && p.winner !== 0) {
      play('solve');
      setAnnounce('Puzzle solved!');
    } else if (s.hintsUsed > p.hintsUsed) {
      play('hint');
      setAnnounce('Hint used');
      if (changed >= 0) setSelected(changed);
    } else if (s.mistakes > p.mistakes) {
      play('error');
      setAnnounce('Mistake');
      setShakeCell(changed);
      const t = window.setTimeout(() => setShakeCell(null), 450);
      return () => window.clearTimeout(t);
    } else if (changed >= 0 && s.cells[changed]) {
      play('place');
    }
  }, [session.moveKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s) return null;

  const submit = (m: SudokuMove) => session.canMove && session.submitMove(m);

  if (s.phase === 'pick') {
    return (
      <div className="card flex flex-col gap-3 p-5" style={{ width: Math.min(size, 440) }}>
        <h2 className="font-display text-2xl font-bold">Choose a difficulty</h2>
        <p className="text-sm text-slate-400">Every puzzle has exactly one solution.</p>
        {SUDOKU_DIFFICULTIES.map((d) => (
          <button
            key={d}
            type="button"
            className="btn-ghost sudoku-key justify-between px-4 py-3 text-left"
            disabled={!session.canMove}
            onClick={() => submit({ type: 'start', difficulty: d })}
          >
            <span className="font-display text-lg font-semibold capitalize">{d}</span>
            <span className="text-sm text-slate-400">
              {DIFFICULTY_BLURB[d]} · {SUDOKU_CLUES[d]} clues
            </span>
          </button>
        ))}
      </div>
    );
  }

  const selValue = selected === null ? 0 : s.cells[selected]!;
  const peers = selected === null ? null : new Set(PEERS[selected]);
  const counts = Array<number>(10).fill(0);
  for (const v of s.cells) counts[v]!++;

  /** Digit input from the pad or keyboard, honouring pencil mode. */
  const enterDigit = (value: number) => {
    if (selected === null || s.givens[selected] || s.winner !== null) return;
    if (pencilMode) {
      if (!s.cells[selected]) submit({ type: 'pencil', cell: selected, value });
    } else if (s.cells[selected] === value) {
      submit({ type: 'clear', cell: selected });
    } else {
      submit({ type: 'set', cell: selected, value });
    }
  };
  const erase = () => {
    if (selected !== null && !s.givens[selected] && (s.cells[selected] || s.pencil[selected])) submit({ type: 'clear', cell: selected });
  };
  const canUndo = s.history.length > 0 && s.winner === null;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key.toLowerCase() === 'z' && canUndo) {
        e.preventDefault();
        submit({ type: 'undo' });
      }
      return;
    }
    const cur = selected ?? 0;
    const row = Math.floor(cur / 9), col = cur % 9;
    const move = (r: number, c: number) => {
      e.preventDefault();
      setSelected(((r + 9) % 9) * 9 + ((c + 9) % 9));
    };
    if (e.key === 'ArrowUp') return move(row - 1, col);
    if (e.key === 'ArrowDown') return move(row + 1, col);
    if (e.key === 'ArrowLeft') return move(row, col - 1);
    if (e.key === 'ArrowRight') return move(row, col + 1);
    if (/^[1-9]$/.test(e.key)) {
      e.preventDefault();
      return enterDigit(Number(e.key));
    }
    if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
      e.preventDefault();
      return erase();
    }
    const k = e.key.toLowerCase();
    if (k === 'p') setPencilMode((v) => !v);
    else if (k === 'h' && s.winner === null) submit({ type: 'hint' });
    else if ((k === 'u' || k === 'z') && canUndo) submit({ type: 'undo' });
  };

  const elapsed = (solved ? s.solvedAt ?? now : now) - s.startedAt;

  return (
    <div className="flex flex-col items-center gap-3" style={{ width }}>
      {/* Status strip */}
      <div className="flex w-full items-center gap-3 px-1 text-sm text-slate-300">
        <span className="rounded-full bg-teal-500/20 px-2.5 py-0.5 font-semibold text-teal-200 capitalize ring-1 ring-teal-400/30">{s.difficulty}</span>
        <span className="font-mono tabular-nums" aria-label={`Time ${formatTime(elapsed)}`}>⏱ {formatTime(elapsed)}</span>
        {s.checkMode && <span className={s.mistakes ? 'text-rose-300' : ''}>Mistakes: {s.mistakes}</span>}
        <span className="ml-auto">Hints: {s.hintsUsed}</span>
      </div>
      <span className="sr-only" aria-live="polite">{announce}</span>

      <div
        ref={gridRef}
        className="sudoku-grid game-board w-full"
        role="grid"
        aria-label="Sudoku grid. Arrow keys move, digits fill, Backspace clears, P toggles pencil mode."
        tabIndex={0}
        onKeyDown={onKey}
      >
        {s.cells.map((v, i) => {
          const row = Math.floor(i / 9), col = i % 9;
          const given = s.givens[i] !== 0;
          const wrong = s.checkMode && v !== 0 && v !== s.solution[i];
          const classes = [
            'sudoku-cell',
            col % 3 === 2 && col < 8 ? 'bx' : '',
            row % 3 === 2 && row < 8 ? 'by' : '',
            row === 8 ? 'last-row' : '',
            given ? 'given' : '',
            selected === i ? 'selected' : peers?.has(i) ? 'peer' : '',
            selValue && v === selValue && selected !== i ? 'same' : '',
            wrong ? 'wrong' : '',
            shakeCell === i ? 'shake' : '',
            solved ? 'sudoku-wave' : '',
          ].join(' ');
          const label = `Row ${row + 1}, column ${col + 1}: ${v ? (given ? `given ${v}` : v) : 'empty'}${wrong ? ', wrong' : ''}`;
          return (
            <button
              key={i}
              type="button"
              role="gridcell"
              aria-label={label}
              aria-selected={selected === i}
              tabIndex={-1}
              className={classes}
              style={{ fontSize: cell * 0.55, animationDelay: solved ? `${(row + col) * 45}ms` : undefined }}
              onClick={() => {
                setSelected(i);
                gridRef.current?.focus();
              }}
            >
              {v ? (
                <span>{v}</span>
              ) : s.pencil[i] ? (
                <span className="sudoku-pencil" style={{ fontSize: cell * 0.26 }} aria-hidden="true">
                  {Array.from({ length: 9 }, (_, d) => (
                    <i key={d}>{s.pencil[i]! & (1 << d) ? d + 1 : ''}</i>
                  ))}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Number pad */}
      <div className="grid w-full grid-cols-5 gap-1.5" role="group" aria-label="Number pad">
        {Array.from({ length: 9 }, (_, d) => d + 1).map((d) => (
          <button
            key={d}
            type="button"
            className={`btn-ghost sudoku-key relative flex-col gap-0 px-0 py-1 font-display text-2xl ${counts[d]! >= 9 ? 'opacity-50' : ''}`}
            disabled={!session.canMove || selected === null || s.winner !== null}
            onClick={() => enterDigit(d)}
            aria-label={pencilMode ? `Pencil ${d}` : `Enter ${d}`}
          >
            {d}
            <span className="absolute right-1.5 bottom-0.5 text-[10px] text-slate-400" aria-hidden="true">{Math.max(0, 9 - counts[d]!)}</span>
          </button>
        ))}
        <button type="button" className="btn-ghost sudoku-key px-0 py-1 text-xl" disabled={!session.canMove || s.winner !== null} onClick={erase} aria-label="Erase">
          ⌫
        </button>
      </div>
      <div className="grid w-full grid-cols-4 gap-1.5" role="toolbar" aria-label="Sudoku tools">
        <button
          type="button"
          className={`btn-ghost sudoku-key px-0 py-1 text-sm ${pencilMode ? 'bg-violet-500/30 ring-violet-400' : ''}`}
          onClick={() => setPencilMode((v) => !v)}
          aria-pressed={pencilMode}
          title="Pencil mode (P)"
        >
          ✏️ Pencil
        </button>
        <button type="button" className="btn-ghost sudoku-key px-0 py-1 text-sm" disabled={!session.canMove || s.winner !== null} onClick={() => submit({ type: 'hint' })} title="Hint (H)">
          💡 Hint
        </button>
        <button type="button" className="btn-ghost sudoku-key px-0 py-1 text-sm" disabled={!session.canMove || !canUndo} onClick={() => submit({ type: 'undo' })} title="Undo (Ctrl+Z)">
          ↩ Undo
        </button>
        <button
          type="button"
          className={`btn-ghost sudoku-key px-0 py-1 text-sm ${s.checkMode ? 'bg-rose-500/25 ring-rose-400' : ''}`}
          disabled={!session.canMove || s.winner !== null}
          onClick={() => submit({ type: 'toggle_check' })}
          aria-pressed={s.checkMode}
          title="Highlight mistakes"
        >
          ✔ Check
        </button>
      </div>
    </div>
  );
}
