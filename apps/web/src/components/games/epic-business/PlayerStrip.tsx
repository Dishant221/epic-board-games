import { BOARD_SPACES, netWorth, ownedSpaces, type EpicBusinessState } from '@ebg/game-core/games/epic-business';
import type { RoomPlayer } from '@ebg/game-core';
import { AIPlayerBadge, SEAT_COLORS } from '../shared/PlayerPanel';
import { fmt, PAWNS, spaceColor } from './format';
import type { CashDelta } from './hooks';

interface Props {
  s: EpicBusinessState;
  players: RoomPlayer[];
  actingSeat: number | null;
  thinkingSeat: number | null;
  mySeats: number[];
  nameOf(seat: number): string;
  deltas: CashDelta[];
  onSelectSpace(space: number): void;
}

/** One card per seat: avatar, cash, net worth, holdings, status badges, floating cash deltas. */
export function PlayerStrip({ s, players, actingSeat, thinkingSeat, mySeats, nameOf, deltas, onSelectSpace }: Props) {
  return (
    <ul className="flex flex-col gap-2" aria-label="Players and finances">
      {s.players.map((p, seat) => {
        const player = players.find((x) => x.seat === seat);
        const owned = ownedSpaces(s, seat);
        const active = actingSeat === seat && s.phase !== 'over';
        const mine = mySeats.includes(seat);
        return (
          <li
            key={seat}
            className="eb-player"
            data-active={active ? 'true' : undefined}
            data-thinking={thinkingSeat === seat ? 'true' : undefined}
            data-bankrupt={p.bankrupt ? 'true' : undefined}
            style={{ ['--seat' as string]: SEAT_COLORS[seat] }}
            aria-current={active ? 'true' : undefined}
          >
            {deltas
              .filter((d) => d.seat === seat)
              .map((d) => (
                <span key={d.id} className="eb-delta" data-sign={d.amount > 0 ? 'plus' : 'minus'} aria-hidden="true">
                  {d.amount > 0 ? '+' : '−'}
                  {fmt(Math.abs(d.amount))}
                </span>
              ))}
            <div className="flex items-center gap-2">
              <span className="relative grid size-10 shrink-0 place-items-center rounded-full text-xl" style={{ background: `color-mix(in srgb, ${SEAT_COLORS[seat]} 40%, transparent)`, boxShadow: active ? `0 0 0 2px ${SEAT_COLORS[seat]}` : undefined }} aria-hidden="true">
                {player?.avatar ?? PAWNS[seat]}
                <span className="absolute -right-1 -bottom-1 text-xs">{PAWNS[seat]}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold">
                    {nameOf(seat)}
                    {mine && mySeats.length > 1 && <span className="text-slate-400"> (you)</span>}
                  </span>
                  {player && <AIPlayerBadge player={player} />}
                  {active && <span className="rounded-full bg-white/15 px-1.5 text-[10px] font-semibold tracking-wide uppercase">{thinkingSeat === seat ? 'thinking' : 'turn'}</span>}
                </span>
                <span className="flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
                  <span>
                    Cash <span className="font-semibold text-emerald-200 tabular-nums">{fmt(p.cash)}</span>
                  </span>
                  <span>
                    Worth <span className="tabular-nums text-slate-200">{fmt(netWorth(s, seat))}</span>
                  </span>
                  <span>
                    {owned.length} {owned.length === 1 ? 'property' : 'properties'}
                  </span>
                </span>
              </span>
            </div>
            {(p.bankrupt || p.inLockUp || p.outCards > 0 || player?.connected === false) && (
              <div className="mt-1 flex flex-wrap gap-1 pl-12 text-[10px] font-semibold">
                {p.bankrupt && <span className="rounded-full bg-rose-500/25 px-1.5 py-0.5 text-rose-200">💀 Bankrupt</span>}
                {p.inLockUp && <span className="rounded-full bg-amber-500/25 px-1.5 py-0.5 text-amber-100">🔒 In Lock-up{p.lockUpTurns > 0 ? ` · ${p.lockUpTurns}/3 rolls` : ''}</span>}
                {p.outCards > 0 && <span className="rounded-full bg-sky-500/25 px-1.5 py-0.5 text-sky-100">🎟 Lock-up card ×{p.outCards}</span>}
                {player?.connected === false && <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-slate-300">Reconnecting…</span>}
              </div>
            )}
            {owned.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-x-2 gap-y-2.5 pl-12" aria-label={`${nameOf(seat)}'s properties`}>
                {owned.map((i) => {
                  const b = s.buildings[i] ?? 0;
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`eb-chip relative ${s.mortgaged[i] ? 'opacity-40' : ''}`}
                      style={{ background: spaceColor(i) ?? (BOARD_SPACES[i]?.type === 'hub' ? '#94a3b8' : '#fbbf24') }}
                      onClick={() => onSelectSpace(i)}
                      aria-label={`${BOARD_SPACES[i]?.name}${s.mortgaged[i] ? ', mortgaged' : ''}${b === 5 ? ', tower' : b > 0 ? `, ${b} offices` : ''}: open details`}
                      title={BOARD_SPACES[i]?.name}
                    >
                      {b > 0 && <span className="absolute inset-x-0 -top-1 text-center text-[8px] leading-none text-white drop-shadow">{b === 5 ? '★' : b}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
