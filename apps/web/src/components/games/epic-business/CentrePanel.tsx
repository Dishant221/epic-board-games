import { FORTUNE_CARDS, MARKET_CARDS, MAX_ROUNDS, type EpicBusinessState } from '@ebg/game-core/games/epic-business';
import type { ReactNode } from 'react';
import { Dice } from '../shared/Dice';
import { SEAT_COLORS } from '../shared/PlayerPanel';
import type { Banner } from './format';

interface Props {
  s: EpicBusinessState;
  banner: Banner;
  nameOf(seat: number): string;
  rollKey: number;
  canRoll: boolean;
  onRoll(): void;
  diceSize: number;
  /** Fortune/Market card currently being shown (flips in, lingers, fades). */
  cardKey: number | null;
  compact: boolean;
  children?: ReactNode;
}

/** Everything in the middle of the ring: what is happening, the dice, the drawn card and (on desktop) the actions. */
export function CentrePanel({ s, banner, nameOf, rollKey, canRoll, onRoll, diceSize, cardKey, compact, children }: Props) {
  const card = s.lastCard ? (s.lastCard.deck === 'fortune' ? FORTUNE_CARDS : MARKET_CARDS)[s.lastCard.index] : null;
  const doubles = s.dice !== null && s.dice[0] === s.dice[1];
  const me = s.players[s.turn];
  return (
    <>
      <div className={`eb-title ${compact ? 'text-[11px]' : 'text-sm'}`}>🏙️ Epic Business</div>

      <div aria-live="polite" aria-atomic="true" className="w-full max-w-md">
        <div key={s.turn} className="eb-banner" data-tone={banner.tone}>
          <div key={`${s.phase}-${banner.title}`} className="eb-banner-text">
            <div className={`font-display font-bold ${compact ? 'text-sm' : 'text-base sm:text-lg'}`}>{banner.title}</div>
            {banner.text && <div className={`${compact ? 'text-[11px]' : 'text-xs sm:text-sm'} text-slate-200`}>{banner.text}</div>}
          </div>
        </div>
      </div>

      <div className="eb-round" aria-label={`Round ${s.round} of ${MAX_ROUNDS}`}>
        <span>Round {s.round}<span className="opacity-60">/{MAX_ROUNDS}</span></span>
        <span className="opacity-40">·</span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-2 rounded-full" style={{ background: SEAT_COLORS[s.turn] }} aria-hidden="true" />
          {nameOf(s.turn)}
        </span>
        {me && me.doubles > 0 && s.phase !== 'over' && (
          <>
            <span className="opacity-40">·</span>
            <span className="text-amber-200">doubles ×{me.doubles}</span>
          </>
        )}
      </div>

      <div className="eb-dice" role="group" aria-label={s.dice ? `Dice: ${s.dice[0]} and ${s.dice[1]}, total ${s.dice[0] + s.dice[1]}` : 'Dice'}>
        <Dice value={s.dice?.[0] ?? null} rollKey={rollKey} canRoll={canRoll} onRoll={onRoll} size={diceSize} color={SEAT_COLORS[s.turn]} />
        <Dice value={s.dice?.[1] ?? null} rollKey={rollKey} canRoll={canRoll} onRoll={onRoll} size={diceSize} color={SEAT_COLORS[s.turn]} />
        {s.dice && (
          <span key={rollKey} className="eb-total" aria-hidden="true">
            {s.dice[0] + s.dice[1]}
            {doubles && <span className="block text-[10px] font-semibold text-amber-300">doubles</span>}
          </span>
        )}
      </div>

      {card && s.lastCard && cardKey !== null && (
        <div key={cardKey} className="eb-card" data-deck={s.lastCard.deck} role="status">
          <div className="text-[10px] font-bold tracking-widest uppercase opacity-70">{s.lastCard.deck === 'fortune' ? '✨ Fortune' : '📦 Market'}</div>
          <div className={`${compact ? 'text-[11px]' : 'text-xs sm:text-sm'} leading-snug`}>{card.text}</div>
        </div>
      )}

      {children}
    </>
  );
}
