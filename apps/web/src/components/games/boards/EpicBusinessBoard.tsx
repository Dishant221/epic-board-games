import { epicBusiness, type EpicBusinessMove, type EpicBusinessState } from '@ebg/game-core/games/epic-business';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameSessionView } from '../../../lib/session';
import { play } from '../../../lib/sound';
import '../../../styles/games/epic-business.css';
import { ActionBar } from '../epic-business/ActionBar';
import { BoardRing } from '../epic-business/BoardRing';
import { makeNamer, phaseHint } from '../epic-business/format';
import { PropertySheet } from '../epic-business/PropertySheet';
import { SidePanel } from '../epic-business/SidePanel';
import { TradeDialog } from '../epic-business/TradeDialog';

interface Props {
  session: GameSessionView<EpicBusinessState, EpicBusinessMove>;
  size: number;
  dicePosition?: 'corner' | 'bottom-center' | 'floating';
}

export default function EpicBusinessBoard({ session, size }: Props) {
  const s = session.state;
  const mobile = size < 768;
  const [view, setView] = useState<number | 'manage' | null>(null);
  const [tradeOpen, setTradeOpen] = useState(false);
  const lastKey = useRef(-1);

  const nameOf = useMemo(() => makeNamer(session.players, session.mySeats), [session.players, session.mySeats]);
  // Rules stay in the engine; the board only asks it what is legal right now.
  const legal = useMemo(() => (s ? epicBusiness.legalMoves(s) : []), [s]);
  const actingSeat = s && s.phase !== 'over' ? epicBusiness.currentPlayer(s) : null;

  // Sounds for whatever the last move did.
  useEffect(() => {
    if (!s || session.moveKey === lastKey.current) return;
    const first = lastKey.current === -1;
    lastKey.current = session.moveKey;
    if (first) return;
    const ev = s.events;
    if (ev.includes('roll')) play('dice');
    if (ev.includes('card')) window.setTimeout(() => play('card'), 500);
    if (ev.includes('cash')) window.setTimeout(() => play('cash'), ev.includes('roll') ? 900 : 100);
    if (ev.includes('debt')) window.setTimeout(() => play('error'), 1000);
  }, [session.moveKey, s]);

  // Close dialogs when control passes elsewhere (e.g. the sheet was open for a now-finished phase).
  useEffect(() => {
    if (!session.canMove) setTradeOpen(false);
  }, [session.canMove]);

  if (!s) return null;

  const submit = (move: EpicBusinessMove) => {
    if (!session.canMove) return;
    session.submitMove(move);
  };
  const canRoll = session.canMove && legal.some((m) => m.type === 'roll');
  const hint = phaseHint(s, nameOf);

  const boardColumn = (
    <div className="flex flex-col gap-3" style={{ width: size }}>
      <BoardRing s={s} size={size} moveKey={session.moveKey} nameOf={nameOf} canRoll={canRoll} onRoll={() => submit({ type: 'roll' })} onSelectSpace={setView} hint={hint} />
      <ActionBar
        s={s}
        legal={legal}
        canMove={session.canMove}
        actingSeat={actingSeat}
        nameOf={nameOf}
        submit={submit}
        onOpenManage={() => setView('manage')}
        onOpenTrade={() => setTradeOpen(true)}
      />
    </div>
  );

  const side = <SidePanel s={s} players={session.players} actingSeat={actingSeat} nameOf={nameOf} onSelectSpace={setView} />;

  return (
    <div className={mobile ? 'flex flex-col gap-3' : 'flex w-full flex-wrap items-start justify-center gap-4'} style={mobile ? { width: size } : undefined}>
      {boardColumn}
      <div className={mobile ? '' : 'min-w-[16rem] flex-1 basis-64'} style={mobile ? undefined : { maxWidth: 380 }}>
        {side}
      </div>

      <PropertySheet
        s={s}
        view={view}
        legal={legal}
        canMove={session.canMove}
        actingSeat={actingSeat}
        mobile={mobile}
        nameOf={nameOf}
        submit={submit}
        onClose={() => setView(null)}
        onSelectSpace={setView}
      />
      <TradeDialog s={s} open={tradeOpen && session.canMove} mobile={mobile} nameOf={nameOf} submit={submit} onClose={() => setTradeOpen(false)} />
    </div>
  );
}
