import { BOARD_SPACES, netWorth, ownedSpaces, type EpicBusinessState } from '@ebg/game-core/games/epic-business';
import type { RoomPlayer } from '@ebg/game-core';
import { useEffect, useRef } from 'react';
import { SEAT_COLORS } from '../shared/PlayerPanel';
import { expandLog, fmt, PAWNS, spaceColor } from './format';

interface Props {
  s: EpicBusinessState;
  players: RoomPlayer[];
  actingSeat: number | null;
  nameOf(seat: number): string;
  onSelectSpace(space: number): void;
}

/** Cash / net worth for every seat plus the scrolling event log. */
export function SidePanel({ s, players, actingSeat, nameOf, onSelectSpace }: Props) {
  const logRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [s.log.length, s.log[s.log.length - 1]]);

  return (
    <div className="flex flex-col gap-3">
      <ul className="card divide-y divide-white/5 p-2" aria-label="Players and finances">
        {s.players.map((p, seat) => {
          const player = players.find((x) => x.seat === seat);
          const owned = ownedSpaces(s, seat);
          const active = actingSeat === seat && s.phase !== 'over';
          return (
            <li key={seat} className={`flex flex-col gap-1 rounded-xl px-2 py-2 ${active ? 'bg-white/10' : ''} ${p.bankrupt ? 'opacity-50' : ''}`} aria-current={active ? 'true' : undefined}>
              <div className="flex items-center gap-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-full text-base" style={{ background: `color-mix(in srgb, ${SEAT_COLORS[seat]} 40%, transparent)` }} aria-hidden="true">
                  {PAWNS[seat]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {player?.avatar} {nameOf(seat)}
                    {p.bankrupt && <span className="ml-1 text-xs font-normal text-rose-300">bankrupt</span>}
                    {p.inLockUp && <span className="ml-1 text-xs font-normal text-amber-300">🔒 Lock-up</span>}
                    {p.outCards > 0 && <span className="ml-1 text-xs font-normal text-sky-300">🎟 ×{p.outCards}</span>}
                  </span>
                  <span className="block text-xs text-slate-400">
                    Cash <span className="font-semibold tabular-nums text-emerald-200">{fmt(p.cash)}</span> · Worth <span className="tabular-nums">{fmt(netWorth(s, seat))}</span>
                  </span>
                </span>
              </div>
              {owned.length > 0 && (
                <div className="flex flex-wrap gap-1 pl-10" aria-label={`${nameOf(seat)}'s properties`}>
                  {owned.map((i) => (
                    <button
                      key={i}
                      type="button"
                      className={`h-4 w-3 rounded-sm ring-1 ring-black/40 ${s.mortgaged[i] ? 'opacity-40' : ''}`}
                      style={{ background: spaceColor(i) ?? '#94a3b8' }}
                      onClick={() => onSelectSpace(i)}
                      aria-label={`${BOARD_SPACES[i]?.name}${s.mortgaged[i] ? ' (mortgaged)' : ''}: open details`}
                      title={BOARD_SPACES[i]?.name}
                    />
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <ol ref={logRef} className="eb-log card max-h-44 overflow-y-auto p-2 text-xs text-slate-300" aria-live="polite" aria-label="Game events">
        {s.log.map((line, i) => (
          <li key={`${i}-${line.length}`} className="py-1">
            {expandLog(line, nameOf)}
          </li>
        ))}
      </ol>
    </div>
  );
}
