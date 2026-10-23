import { PUZZLE_CATEGORIES, PUZZLE_IMAGES, PUZZLE_SIZES, type EpicPuzzleMove, type PuzzleCategory, type PuzzleSizeId } from '@ebg/game-core/games/epic-puzzle';
import { useState } from 'react';
import type { GameSessionView } from '../../../lib/session';
import { play } from '../../../lib/sound';

const SIZE_LABEL: Record<PuzzleSizeId, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' };

interface Props {
  session: Pick<GameSessionView<unknown, EpicPuzzleMove>, 'canMove' | 'submitMove' | 'mode' | 'status' | 'players'>;
  width: number;
}

/** Phase 'pick': category tabs, thumbnail gallery, size chips and Start. */
export function PuzzlePicker({ session, width }: Props) {
  const [category, setCategory] = useState<PuzzleCategory>('Paintings');
  const [imageId, setImageId] = useState(PUZZLE_IMAGES[0]!.id);
  const [size, setSize] = useState<PuzzleSizeId>('medium');
  const images = PUZZLE_IMAGES.filter((i) => i.category === category);
  const selected = PUZZLE_IMAGES.find((i) => i.id === imageId) ?? PUZZLE_IMAGES[0]!;
  const columns = width < 420 ? 2 : width < 720 ? 3 : 4;

  const pickCategory = (c: PuzzleCategory) => {
    setCategory(c);
    const first = PUZZLE_IMAGES.find((i) => i.category === c);
    if (first && selected.category !== c) setImageId(first.id);
  };

  const start = () => {
    if (!session.canMove) return;
    play('click');
    session.submitMove({ type: 'start', imageId: selected.id, size });
  };

  const hint =
    session.status === 'connecting' ? 'Connecting…'
      : session.status === 'waiting' ? 'Waiting for your puzzle partner…'
      : session.players.length > 1 ? 'Either player can start the puzzle.'
      : null;

  return (
    <div className="card flex flex-col gap-3 p-3 sm:p-4" style={{ width }}>
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Image category">
        {PUZZLE_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={c === category}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${c === category ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-900/40' : 'bg-white/5 text-slate-300 ring-1 ring-white/10 hover:bg-white/10'}`}
            onClick={() => pickCategory(c)}
          >
            {c}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-400">{PUZZLE_IMAGES.length} artworks</span>
      </div>

      <div className="no-scrollbar grid max-h-[46vh] gap-2 overflow-y-auto p-0.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }} role="radiogroup" aria-label="Choose an image">
        {images.map((img) => {
          const active = img.id === selected.id;
          return (
            <button
              key={img.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={img.title}
              onClick={() => {
                setImageId(img.id);
                play('tile');
              }}
              className={`group relative overflow-hidden rounded-xl text-left ring-2 transition ${active ? 'ring-violet-400 shadow-lg shadow-violet-900/50' : 'ring-transparent hover:ring-white/30'}`}
              style={{ background: `linear-gradient(135deg, ${img.palette[0]}, ${img.palette[1]})` }}
            >
              <img src={img.src} loading="lazy" alt={img.alt} width={1200} height={800} className="block aspect-[3/2] w-full object-cover" draggable={false} />
              <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 pt-5 pb-1.5 text-xs font-semibold text-white">
                {img.title}
              </span>
              {active && <span className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-violet-500 text-xs text-white shadow" aria-hidden="true">✓</span>}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Piece count">
        {PUZZLE_SIZES.map((sz) => {
          const active = sz.id === size;
          return (
            <button
              key={sz.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setSize(sz.id)}
              className={`min-h-11 rounded-xl px-3 py-1.5 text-sm font-semibold transition ${active ? 'bg-white/15 text-white ring-2 ring-violet-400' : 'bg-white/5 text-slate-300 ring-1 ring-white/10 hover:bg-white/10'}`}
            >
              {SIZE_LABEL[sz.id]} <span className="text-xs text-slate-400">{sz.cols * sz.rows} pcs</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 text-sm text-slate-300">
          <span className="block truncate font-display font-semibold text-white">{selected.title}</span>
          {hint && <span className="block truncate text-xs text-slate-400">{hint}</span>}
        </div>
        <button type="button" className="btn-primary min-h-11" onClick={start} disabled={!session.canMove} aria-label={`Start ${selected.title}, ${SIZE_LABEL[size]}`}>
          Start puzzle
        </button>
      </div>
    </div>
  );
}
