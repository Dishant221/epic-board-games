import { BOARD_SPACES, type EpicBusinessState } from '@ebg/game-core/games/epic-business';
import { memo } from 'react';
import { SEAT_COLORS } from '../shared/PlayerPanel';
import { cornerCaption, currentRent, fmt, isCorner, spaceColor, spaceIcon, type Rect, type Side } from './format';

interface Props {
  s: EpicBusinessState;
  space: number;
  rect: Rect;
  side: Side;
  /** Someone's token is standing here and it is their turn. */
  active: boolean;
  /** Purchase / build flash currently playing. */
  flash: 'bought' | 'built' | null;
  /** Lock-up corner while a player is locked up (the bars themselves are drawn by the ring, above the tokens). */
  jailed: boolean;
  /** Names of players standing here (comma separated), for the accessible label. */
  here: string;
  nameOf(seat: number): string;
  onSelect(space: number): void;
}

function Buildings({ count, side }: { count: number; side: Side }) {
  if (count === 0) return null;
  if (count === 5) return <span className="eb-tower" title="Tower" />;
  return (
    <span className={`eb-offices ${side === 'left' || side === 'right' ? 'eb-offices-col' : ''}`}>
      {Array.from({ length: count }, (_, k) => (
        <span key={k} className="eb-office" />
      ))}
    </span>
  );
}

/** One ring space. Horizontal text on every side; the colour band hugs the inner edge. */
export const Tile = memo(function Tile({ s, space, rect, side, active, flash, jailed, here, nameOf, onSelect }: Props) {
  const sp = BOARD_SPACES[space]!;
  const corner = isCorner(space);
  const colour = spaceColor(space);
  const owner = s.owners[space] ?? null;
  const buildings = s.buildings[space] ?? 0;
  const mortgaged = s.mortgaged[space] === true;
  const price = 'price' in sp ? sp.price : null;
  const rent = owner !== null && price !== null && !mortgaged ? currentRent(s, space) : null;

  // Body = tile minus the band/stripe; drives the text sizes.
  const horizontal = side === 'top' || side === 'bottom';
  const bodyW = corner ? rect.w : horizontal ? rect.w : rect.w * 0.78;
  const bodyH = corner ? rect.h : horizontal ? rect.h * 0.74 : rect.h;
  const bodyMin = Math.min(bodyW, bodyH);
  const showName = corner || (bodyW >= 34 && bodyH >= 26);
  const roomForAmount = bodyW >= 22 && bodyH >= 18;
  const showPrice = price !== null && roomForAmount;
  const nameSize = corner ? Math.max(8, Math.min(13, rect.w * 0.12)) : Math.max(7.5, Math.min(11, bodyMin * 0.2));
  const priceSize = Math.max(7, Math.min(10.5, bodyMin * 0.19));
  const iconSize = corner ? rect.w * 0.34 : Math.max(10, Math.min(22, bodyMin * 0.42));

  const ownerText = owner === null ? (price !== null ? ', unowned' : '') : `, owned by ${nameOf(owner)}`;
  const buildText = buildings === 5 ? ', tower' : buildings > 0 ? `, ${buildings} office${buildings > 1 ? 's' : ''}` : '';
  const rentText = rent !== null ? `, rent ${rent}` : '';
  const label = `${sp.name}${price !== null ? `, price ${price}` : ''}${ownerText}${mortgaged ? ', mortgaged' : ''}${buildText}${rentText}${here ? `. Here: ${here}` : ''}. Open details`;

  return (
    <button
      type="button"
      className="eb-tile"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, ['--owner' as string]: owner === null ? 'transparent' : SEAT_COLORS[owner] }}
      data-side={side}
      data-corner={corner ? 'true' : undefined}
      data-type={sp.type}
      data-active={active ? 'true' : undefined}
      data-owned={owner !== null ? 'true' : undefined}
      data-flash={flash ?? undefined}
      data-jailed={jailed ? 'true' : undefined}
      onClick={() => onSelect(space)}
      aria-label={label}
    >
      {colour && (
        <span className="eb-band" style={{ background: colour }} aria-hidden="true">
          <Buildings count={buildings} side={side} />
        </span>
      )}
      <span className="eb-body" aria-hidden="true">
        {(!colour || corner) && (
          <span className="eb-icon" style={{ fontSize: iconSize }}>
            {spaceIcon(sp)}
          </span>
        )}
        {showName && (
          <span className="eb-name" style={{ fontSize: nameSize }}>
            {sp.name}
          </span>
        )}
        {corner && showName && rect.w >= 70 && <span className="eb-caption">{cornerCaption(sp)}</span>}
        {showPrice && (
          <span className={`eb-price ${rent !== null ? 'eb-price-rent' : ''}`} style={{ fontSize: priceSize }}>
            {rent !== null ? `rent ${fmt(rent)}` : mortgaged ? 'mortgaged' : fmt(price!)}
          </span>
        )}
        {sp.type === 'levy' && roomForAmount && (
          <span className="eb-price" style={{ fontSize: priceSize }}>
            pay {sp.amount}
          </span>
        )}
      </span>
      {owner !== null && <span key={owner} className="eb-owner" aria-hidden="true" />}
      {mortgaged && (
        <span className="eb-mortgage" aria-hidden="true">
          M
        </span>
      )}
      {flash === 'built' && <span className="eb-build-pop" aria-hidden="true">🏢</span>}
    </button>
  );
});
