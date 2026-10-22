import {
  BOARD_SIZE,
  BOARD_SPACES,
  FORTUNE_CARDS,
  MARKET_CARDS,
  type EpicBusinessState,
} from '@ebg/game-core/games/epic-business';
import { useEffect, useRef, useState } from 'react';
import { play } from '../../../lib/sound';
import { Dice } from '../shared/Dice';
import { SEAT_COLORS } from '../shared/PlayerPanel';
import { cellRect, CORNER, fmt, PAWNS, RING_UNITS, spaceCell, spaceColor, spaceIcon } from './format';

interface Props {
  s: EpicBusinessState;
  size: number;
  moveKey: number;
  nameOf(seat: number): string;
  canRoll: boolean;
  onRoll(): void;
  onSelectSpace(space: number): void;
  hint: string;
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Pawns walk one square per tick so a long roll reads as movement, not a teleport. */
function useHoppingPositions(s: EpicBusinessState, moveKey: number) {
  const targets = s.players.map((p) => p.position);
  const [display, setDisplay] = useState<number[]>(targets);
  const [hopping, setHopping] = useState<number | null>(null);
  const displayRef = useRef(display);
  displayRef.current = display;

  useEffect(() => {
    if (targets.length !== displayRef.current.length) {
      setDisplay(targets);
      return;
    }
    const seat = targets.findIndex((t, i) => t !== displayRef.current[i]);
    if (seat === -1) return;
    const target = targets[seat]!;
    const from = displayRef.current[seat]!;
    const forward = (target - from + BOARD_SIZE) % BOARD_SIZE;
    const sentToLockUp = s.players[seat]?.inLockUp && target === 10;
    // Teleports (Lock-up) and the "go back 3" card do not walk the ring.
    if (reducedMotion() || sentToLockUp || forward > 12) {
      setDisplay((d) => d.map((v, i) => (i === seat ? target : v)));
      return;
    }
    let cur = from;
    const tick = () => {
      cur = (cur + 1) % BOARD_SIZE;
      setDisplay((d) => d.map((v, i) => (i === seat ? cur : v)));
      setHopping(seat);
      play('move');
      if (cur !== target) timer = window.setTimeout(tick, 220);
      else timer = window.setTimeout(() => setHopping(null), 220);
    };
    let timer = window.setTimeout(tick, 120);
    return () => window.clearTimeout(timer);
    // Re-run when positions change (after every applied move).
  }, [moveKey, targets.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  return { display, hopping };
}

export function BoardRing({ s, size, moveKey, nameOf, canRoll, onRoll, onSelectSpace, hint }: Props) {
  const unit = size / RING_UNITS;
  const showText = unit >= 46;
  const { display, hopping } = useHoppingPositions(s, moveKey);
  const [rollKey, setRollKey] = useState(0);
  const [cardKey, setCardKey] = useState(0);
  const lastKey = useRef(moveKey);

  useEffect(() => {
    if (moveKey === lastKey.current) return;
    lastKey.current = moveKey;
    if (s.events.includes('roll')) setRollKey((k) => k + 1);
    if (s.events.includes('card')) setCardKey((k) => k + 1);
  }, [moveKey, s.events]);

  const landed = s.players[s.turn]?.position ?? -1;
  const card = s.lastCard ? (s.lastCard.deck === 'fortune' ? FORTUNE_CARDS : MARKET_CARDS)[s.lastCard.index] : null;
  const centre = cellRect(1, 1, size);
  const centreSize = size - 2 * centre.x;
  const diceSize = Math.max(40, Math.min(64, centreSize / 5));
  const pawnSize = Math.max(16, Math.min(30, unit * 0.46));

  return (
    <div
      className="eb-ring game-board"
      style={{ width: size, height: size, gridTemplateColumns: `${CORNER}fr repeat(9, 1fr) ${CORNER}fr`, gridTemplateRows: `${CORNER}fr repeat(9, 1fr) ${CORNER}fr` }}
      role="group"
      aria-label="Epic Business board. Activate a space to see its details."
    >
      {BOARD_SPACES.map((sp, i) => {
        const { row, col, side } = spaceCell(i);
        const owner = s.owners[i];
        const buildings = s.buildings[i] ?? 0;
        const colour = spaceColor(i);
        const corner = row % 10 === 0 && col % 10 === 0;
        const price = 'price' in sp ? sp.price : null;
        const ownerText = owner === null || owner === undefined ? (price ? ', unowned' : '') : `, owned by ${nameOf(owner)}`;
        const buildText = buildings === 5 ? ', tower' : buildings > 0 ? `, ${buildings} office${buildings > 1 ? 's' : ''}` : '';
        const here = s.players.map((p, seat) => (p.position === i && !p.bankrupt ? nameOf(seat) : null)).filter(Boolean);
        return (
          <button
            key={i}
            type="button"
            className={`eb-space ${s.mortgaged[i] ? 'eb-mortgaged' : ''}`}
            style={{ gridRow: row + 1, gridColumn: col + 1 }}
            data-side={side}
            data-corner={corner ? 'true' : undefined}
            data-landed={landed === i ? 'true' : undefined}
            onClick={() => onSelectSpace(i)}
            aria-label={`${sp.name}${price ? `, ${price}` : ''}${ownerText}${s.mortgaged[i] ? ', mortgaged' : ''}${buildText}${here.length ? `. Here: ${here.join(', ')}` : ''}`}
          >
            {colour && (
              <span className="eb-band" style={{ background: colour }} aria-hidden="true">
                {buildings === 5 ? <span className="eb-tower" /> : Array.from({ length: buildings }, (_, k) => <span key={k} className="eb-office" />)}
              </span>
            )}
            <span className="eb-body" aria-hidden="true">
              {!colour && <span style={{ fontSize: corner ? unit * 0.55 : Math.max(10, unit * 0.4) }}>{spaceIcon(sp)}</span>}
              {showText && <span className="eb-name">{sp.name}</span>}
              {showText && price && <span className="eb-price">{price}</span>}
            </span>
            {owner !== null && owner !== undefined && <span className="eb-owner" style={{ ['--owner' as string]: SEAT_COLORS[owner] }} aria-hidden="true" />}
          </button>
        );
      })}

      {/* Pawns */}
      {s.players.map((p, seat) => {
        if (p.bankrupt) return null;
        const { row, col } = spaceCell(display[seat] ?? p.position);
        const r = cellRect(row, col, size);
        const dx = (seat % 2 === 0 ? -0.22 : 0.22) * Math.min(r.w, r.h);
        const dy = (seat < 2 ? -0.18 : 0.22) * Math.min(r.w, r.h);
        return (
          <span
            key={seat}
            className="eb-pawn"
            data-hopping={hopping === seat ? 'true' : undefined}
            data-current={s.turn === seat && s.phase !== 'over' ? 'true' : undefined}
            style={{ width: pawnSize, height: pawnSize, fontSize: pawnSize * 0.6, left: r.x + r.w / 2 + dx - pawnSize / 2, top: r.y + r.h / 2 + dy - pawnSize / 2, ['--seat' as string]: SEAT_COLORS[seat] }}
            aria-hidden="true"
          >
            {PAWNS[seat]}
            {p.inLockUp && <span className="absolute -top-1 -right-1 text-[9px]">🔒</span>}
          </span>
        );
      })}

      {/* Centre: title, status, dice, last card */}
      <div className="eb-centre" style={{ left: centre.x, top: centre.y, width: centreSize, height: centreSize }}>
        <div className="font-display text-base font-bold tracking-wide text-amber-200 sm:text-xl">🏙️ Epic Business</div>
        <div className="text-[11px] text-slate-300 sm:text-sm" aria-live="polite">
          {hint}
        </div>
        <div className="flex items-center gap-2" role="group" aria-label="Dice">
          <Dice value={s.dice?.[0] ?? null} rollKey={rollKey} canRoll={canRoll} onRoll={onRoll} size={diceSize} color={SEAT_COLORS[s.turn]} />
          <Dice value={s.dice?.[1] ?? null} rollKey={rollKey} canRoll={canRoll} onRoll={onRoll} size={diceSize} color={SEAT_COLORS[s.turn]} />
        </div>
        {s.dice && (
          <div className="text-[11px] text-slate-400 sm:text-xs">
            Rolled {s.dice[0] + s.dice[1]}
            {s.dice[0] === s.dice[1] ? ' — doubles!' : ''}
          </div>
        )}
        {card && s.lastCard && (
          <div key={cardKey} className="eb-card" data-deck={s.lastCard.deck} style={{ maxWidth: Math.min(360, centreSize * 0.9) }} aria-live="polite">
            <div className="text-[10px] font-bold uppercase tracking-widest opacity-70">{s.lastCard.deck === 'fortune' ? '✨ Fortune' : '📦 Market'}</div>
            <div className="text-[11px] leading-snug sm:text-sm">{card.text}</div>
          </div>
        )}
        {s.phase === 'debt' && s.debt && (
          <div className="rounded-xl bg-rose-500/20 px-3 py-1.5 text-[11px] font-semibold text-rose-100 ring-1 ring-rose-400/40 sm:text-sm" role="alert">
            {nameOf(s.debt.debtor)} owe{nameOf(s.debt.debtor) === 'You' ? '' : 's'} {fmt(s.debt.amount)} to {s.debt.creditor === null ? 'the bank' : nameOf(s.debt.creditor)}
          </div>
        )}
      </div>
    </div>
  );
}
