import { epicBusiness, type EpicBusinessMove, type EpicBusinessState } from '@ebg/game-core/games/epic-business';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameSessionView } from '../../../lib/session';
import { play } from '../../../lib/sound';
import '../../../styles/games/epic-business.css';
import { ActionBar } from '../epic-business/ActionBar';
import { BoardRing, type Coin } from '../epic-business/BoardRing';
import { CentrePanel } from '../epic-business/CentrePanel';
import { Popover } from '../epic-business/Dialog';
import { EventLog } from '../epic-business/EventLog';
import { bannerFor, makeNamer, ringGeometry } from '../epic-business/format';
import { useAnimationKey, useParentWidth, useStateDiffs, useTimers, useTokenWalk } from '../epic-business/hooks';
import { HowToPlay } from '../epic-business/HowToPlay';
import { PlayerStrip } from '../epic-business/PlayerStrip';
import { PropertyContent, PropertySheet, viewTitle, type PropertyView } from '../epic-business/PropertySheet';
import { TradeDialog, TradeForm } from '../epic-business/TradeDialog';

interface Props {
  session: GameSessionView<EpicBusinessState, EpicBusinessMove>;
  size: number;
  dicePosition?: 'corner' | 'bottom-center' | 'floating';
}

/** Landscape boards may be this much wider than they are tall. */
const MAX_ASPECT = 1.35;
/** Room (incl. gap) reserved for the side column when it sits beside the board. */
const SIDE_COLUMN = 300;

/**
 * Board box. Desktop: landscape, up to `size × 1.35` wide, never wider than the
 * parent, and shrunk a little when that lets the player column sit beside it.
 * Phones: portrait ring exactly `size` wide (square on landscape phones so it
 * still fits the short viewport).
 */
function boardBox(size: number, parentWidth: number, mobile: boolean, viewportPortrait: boolean) {
  if (mobile) {
    return { width: size, height: viewportPortrait ? Math.round(size * MAX_ASPECT) : size, beside: false };
  }
  const maxW = Math.round(size * MAX_ASPECT);
  let width: number;
  let beside: boolean;
  if (parentWidth >= maxW + SIDE_COLUMN) {
    width = maxW;
    beside = true;
  } else if (parentWidth >= size + SIDE_COLUMN) {
    width = Math.floor(parentWidth - SIDE_COLUMN);
    beside = true;
  } else {
    width = Math.floor(Math.min(maxW, parentWidth));
    beside = false;
  }
  return { width, height: Math.min(size, width), beside };
}

export default function EpicBusinessBoard({ session, size }: Props) {
  const s = session.state;
  const mobile = size < 768;
  const rootRef = useRef<HTMLDivElement>(null);
  const parentWidth = useParentWidth(rootRef, size);
  const viewportPortrait = typeof window === 'undefined' || window.innerHeight >= window.innerWidth;
  const box = boardBox(size, parentWidth, mobile, viewportPortrait);
  const geo = useMemo(() => ringGeometry(box.width, box.height), [box.width, box.height]);

  const [view, setView] = useState<PropertyView>(null);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [coins, setCoins] = useState<Coin[]>([]);
  const [cardKey, setCardKey] = useState<number | null>(null);
  const later = useTimers();
  const lastKey = useRef(-1);
  const prevRef = useRef<EpicBusinessState | null>(null);
  const coinId = useRef(1);

  const nameOf = useMemo(() => makeNamer(session.players, session.mySeats), [session.players, session.mySeats]);
  // Rules stay in the engine; the board only asks it what is legal right now.
  const legal = useMemo(() => (s ? epicBusiness.legalMoves(s) : []), [s]);
  const actingSeat = s && s.phase !== 'over' ? epicBusiness.currentPlayer(s) : null;

  const onPassPayday = useCallback(
    (seat: number) => {
      const id = coinId.current++;
      setCoins((c) => [...c, { id, seat }]);
      later(() => setCoins((c) => c.filter((x) => x.id !== id)), 1300);
    },
    [later],
  );

  const walk = useTokenWalk(s, session.moveKey, { onPassPayday });
  const { deltas, flashes } = useStateDiffs(s, session.moveKey);
  const rollKey = useAnimationKey(!!s && s.events.includes('roll'), session.moveKey);

  // Sounds and one-shot animations for whatever the last move did.
  useEffect(() => {
    if (!s || session.moveKey === lastKey.current) return;
    const first = lastKey.current === -1;
    lastKey.current = session.moveKey;
    const prev = prevRef.current;
    prevRef.current = s;
    if (first) return;
    const ev = s.events;
    if (ev.includes('roll')) play('dice');
    if (ev.includes('card')) {
      later(() => play('card'), 450);
      const key = session.moveKey;
      later(() => setCardKey(key), 400);
      later(() => setCardKey((k) => (k === key ? null : k)), 3800);
    }
    if (ev.includes('cash')) later(() => play('cash'), ev.includes('roll') ? 900 : 120);
    if (ev.includes('debt')) later(() => play('error'), ev.includes('roll') ? 1100 : 200);
    if (ev.includes('build')) play('hint');
    const bought = prev !== null && s.owners.some((o, i) => o !== null && prev.owners[i] === null);
    if (bought && !ev.includes('trade')) later(() => play('hint'), 150);
  }, [session.moveKey, s, later]);

  // The trade form is only meaningful while this browser may act.
  useEffect(() => {
    if (!session.canMove) setTradeOpen(false);
  }, [session.canMove]);

  if (!s) return null;

  const submit = (move: EpicBusinessMove) => {
    if (!session.canMove) return;
    session.submitMove(move);
  };
  const canRoll = session.canMove && legal.some((m) => m.type === 'roll');
  const banner = bannerFor(s, nameOf, session.canMove, session.thinkingSeat);
  const diceSize = Math.max(34, Math.min(60, Math.round(geo.centre.h / 7)));

  const actionBar = (
    <ActionBar
      s={s}
      legal={legal}
      canMove={session.canMove}
      actingSeat={actingSeat}
      nameOf={nameOf}
      submit={submit}
      onOpenManage={() => setView('manage')}
      onOpenTrade={() => {
        setView(null);
        setTradeOpen(true);
      }}
    />
  );

  const propertyProps = { s, legal, canMove: session.canMove, actingSeat, nameOf, submit, onSelectSpace: setView };

  // Desktop popovers live inside the board centre so they are always proportional to the game.
  const overlay = mobile ? undefined : tradeOpen && session.canMove ? (
    <Popover title="Propose a trade" onClose={() => setTradeOpen(false)}>
      <TradeForm s={s} nameOf={nameOf} submit={submit} onClose={() => setTradeOpen(false)} />
    </Popover>
  ) : view !== null ? (
    <Popover title={viewTitle(view)} onClose={() => setView(null)}>
      <PropertyContent view={view} {...propertyProps} />
    </Popover>
  ) : undefined;

  const sideColumn = (
    <div
      className="grid gap-3"
      style={{
        width: box.beside ? SIDE_COLUMN - 16 : box.width,
        gridTemplateColumns: box.beside ? '1fr' : 'repeat(auto-fit, minmax(16rem, 1fr))',
        alignItems: 'start',
      }}
    >
      <PlayerStrip s={s} players={session.players} actingSeat={actingSeat} thinkingSeat={session.thinkingSeat} mySeats={session.mySeats} nameOf={nameOf} deltas={deltas} onSelectSpace={setView} />
      <EventLog log={s.log} nameOf={nameOf} maxHeight={box.beside ? Math.max(140, box.height - 420) : 200} />
      <HowToPlay />
    </div>
  );

  return (
    <div ref={rootRef} className="flex flex-wrap items-start justify-center gap-4" style={{ width: mobile ? size : '100%' }}>
      <div className="flex flex-col gap-3" style={{ width: box.width }}>
        <BoardRing s={s} geo={geo} walk={walk} flashes={flashes} coins={coins} actingSeat={actingSeat} nameOf={nameOf} onSelectSpace={setView} overlay={overlay}>
          <CentrePanel s={s} banner={banner} nameOf={nameOf} rollKey={rollKey} canRoll={canRoll} onRoll={() => submit({ type: 'roll' })} diceSize={diceSize} cardKey={cardKey} compact={mobile}>
            {!mobile && actionBar}
          </CentrePanel>
        </BoardRing>
        {mobile && s.phase !== 'over' && <div className="card p-2.5">{actionBar}</div>}
      </div>

      {sideColumn}

      {mobile && <PropertySheet view={view} onClose={() => setView(null)} {...propertyProps} />}
      {mobile && <TradeDialog s={s} open={tradeOpen && session.canMove} nameOf={nameOf} submit={submit} onClose={() => setTradeOpen(false)} />}
    </div>
  );
}
