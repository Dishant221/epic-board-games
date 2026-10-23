import { BOARD_SPACES, LOCK_UP_SPACE, PAYDAY_SPACE, type EpicBusinessState } from '@ebg/game-core/games/epic-business';
import { useMemo, type ReactNode } from 'react';
import { SEAT_COLORS } from '../shared/PlayerPanel';
import { PAWNS, spaceCell, type RingGeometry } from './format';
import type { Flash, TokenWalk } from './hooks';
import { Tile } from './Tile';

export interface Coin {
  id: number;
  seat: number;
}

interface Props {
  s: EpicBusinessState;
  geo: RingGeometry;
  walk: TokenWalk;
  flashes: Flash[];
  coins: Coin[];
  /** Seat whose turn it is (engine `currentPlayer`), or null when over. */
  actingSeat: number | null;
  nameOf(seat: number): string;
  onSelectSpace(space: number): void;
  /** Centre content (banner, dice, actions, card). */
  children: ReactNode;
  /** Optional overlay drawn over the centre (property popover on desktop). */
  overlay?: ReactNode;
}

/** Where up to four tokens sit inside a tile, as fractions of the tile's shorter edge. */
const SLOTS = [
  [-0.24, -0.2],
  [0.24, -0.2],
  [-0.24, 0.24],
  [0.24, 0.24],
] as const;

const COIN_COUNT = 14;

/** The rectangular ring: 40 absolutely positioned tiles, tokens, Lock-up bars, coins and the centre. */
export function BoardRing({ s, geo, walk, flashes, coins, actingSeat, nameOf, onSelectSpace, children, overlay }: Props) {
  const rects = useMemo(() => BOARD_SPACES.map((_, i) => geo.rect(i)), [geo]);
  const tokenSize = Math.max(16, Math.min(30, Math.min(geo.tileW, geo.tileH, geo.corner) * 0.52));
  const anyLockedUp = s.players.some((p) => p.inLockUp && !p.bankrupt);
  const activeSpace = actingSeat !== null ? walk.display[actingSeat] ?? s.players[actingSeat]?.position ?? -1 : -1;
  const flashAt = (space: number) => flashes.find((f) => f.space === space)?.kind ?? null;
  const paydayRect = rects[PAYDAY_SPACE]!;

  // Tokens sharing a tile spread out; a lone token sits centred.
  const occupancy = new Map<number, number[]>();
  walk.display.forEach((space, seat) => {
    if (s.players[seat]?.bankrupt) return;
    const list = occupancy.get(space) ?? [];
    list.push(seat);
    occupancy.set(space, list);
  });

  return (
    <div className="eb-board game-board" style={{ width: geo.width, height: geo.height }} role="group" aria-label="Epic Business board. Activate a space to see its details.">
      <div className="eb-centre-bg" style={{ left: geo.centre.x, top: geo.centre.y, width: geo.centre.w, height: geo.centre.h }} aria-hidden="true" />

      {BOARD_SPACES.map((_, i) => {
        const here = (occupancy.get(i) ?? []).map((seat) => nameOf(seat)).join(', ');
        return (
          <Tile
            key={i}
            s={s}
            space={i}
            rect={rects[i]!}
            side={spaceCell(i).side}
            active={activeSpace === i && s.phase !== 'over'}
            flash={flashAt(i)}
            jailed={i === LOCK_UP_SPACE && anyLockedUp}
            here={here}
            nameOf={nameOf}
            onSelect={onSelectSpace}
          />
        );
      })}

      {/* Tokens */}
      {s.players.map((p, seat) => {
        if (p.bankrupt) return null;
        const space = walk.display[seat] ?? p.position;
        const r = rects[space]!;
        const mates = occupancy.get(space) ?? [seat];
        const slot = mates.length === 1 ? [0, 0] : SLOTS[mates.indexOf(seat) % SLOTS.length]!;
        const edge = Math.min(r.w, r.h);
        const moving = walk.motion?.seat === seat ? walk.motion : null;
        return (
          <span
            key={seat}
            className="eb-token"
            data-motion={moving?.kind ?? undefined}
            data-current={actingSeat === seat && s.phase !== 'over' ? 'true' : undefined}
            data-locked={p.inLockUp ? 'true' : undefined}
            style={{
              width: tokenSize,
              height: tokenSize,
              fontSize: tokenSize * 0.58,
              left: r.x + r.w / 2 + slot[0] * edge - tokenSize / 2,
              top: r.y + r.h / 2 + slot[1] * edge - tokenSize / 2,
              ['--seat' as string]: SEAT_COLORS[seat],
              ['--hop-ms' as string]: `${moving?.ms ?? 220}ms`,
            }}
            aria-hidden="true"
          >
            <span className="eb-token-face">{PAWNS[seat]}</span>
          </span>
        );
      })}

      {/* Lock-up bars sit above the tokens so locked-up players are seen behind them. */}
      {anyLockedUp && (
        <span className="eb-bars" style={{ left: rects[LOCK_UP_SPACE]!.x, top: rects[LOCK_UP_SPACE]!.y, width: rects[LOCK_UP_SPACE]!.w, height: rects[LOCK_UP_SPACE]!.h }} aria-hidden="true" />
      )}

      {/* Coins fountain out of Payday when a token passes it. */}
      {coins.map((c) => (
        <span key={c.id} className="eb-coins" style={{ left: paydayRect.x + paydayRect.w / 2, top: paydayRect.y + paydayRect.h / 2 }} aria-hidden="true">
          {Array.from({ length: COIN_COUNT }, (_, k) => (
            <span
              key={k}
              className="eb-coin"
              style={{
                ['--dx' as string]: `${Math.round(Math.sin((k / COIN_COUNT) * Math.PI * 2) * (40 + (k % 3) * 22))}px`,
                ['--dy' as string]: `${-(60 + ((k * 37) % 50))}px`,
                animationDelay: `${(k % 5) * 45}ms`,
              }}
            >
              🪙
            </span>
          ))}
        </span>
      ))}

      {/* Centre */}
      <div className="eb-centre" style={{ left: geo.centre.x, top: geo.centre.y, width: geo.centre.w, height: geo.centre.h }}>
        {children}
      </div>
      {overlay && (
        <div className="eb-overlay" style={{ left: geo.centre.x, top: geo.centre.y, width: geo.centre.w, height: geo.centre.h }}>
          {overlay}
        </div>
      )}
    </div>
  );
}
