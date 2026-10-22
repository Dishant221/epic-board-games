import { BOARD_SPACES, propertyAt, type EpicBusinessMove, type EpicBusinessState } from '@ebg/game-core/games/epic-business';
import { fmt } from './format';

interface Props {
  s: EpicBusinessState;
  legal: EpicBusinessMove[];
  canMove: boolean;
  actingSeat: number | null;
  nameOf(seat: number): string;
  submit(move: EpicBusinessMove): void;
  onOpenManage(): void;
  onOpenTrade(): void;
}

const has = (legal: EpicBusinessMove[], type: EpicBusinessMove['type']) => legal.some((m) => m.type === type);

/** Only the actions that are legal right now are rendered, so the bar doubles as a rules hint. */
export function ActionBar({ s, legal, canMove, actingSeat, nameOf, submit, onOpenManage, onOpenTrade }: Props) {
  if (s.phase === 'over') return null;
  const btn = 'btn-primary min-h-11 px-3 py-2 text-sm';
  const ghost = 'btn-ghost min-h-11 px-3 py-2 text-sm';
  const price = propertyAt(s.players[s.turn]?.position ?? 0)?.price ?? 0;
  const manageable = legal.some((m) => m.type === 'build' || m.type === 'sell_building' || m.type === 'mortgage' || m.type === 'unmortgage');
  const canTrade = (s.phase === 'roll' || s.phase === 'manage' || s.phase === 'lock_up') && s.tradesThisTurn < 3 && s.players.filter((p) => !p.bankrupt).length > 1;
  const t = s.pendingTrade;

  return (
    <div className="card flex flex-col gap-2 p-3" aria-label="Actions">
      {s.phase === 'trade' && t && (
        <div className="rounded-xl bg-violet-500/15 p-3 text-sm ring-1 ring-violet-400/30">
          <div className="font-semibold">
            {nameOf(t.from)} offers {nameOf(t.to)} a trade
          </div>
          <div className="mt-1 grid grid-cols-2 gap-2 text-xs text-slate-300">
            <div>
              <div className="font-semibold text-slate-100">{nameOf(t.from)} gives</div>
              {t.give.cash > 0 && <div>{fmt(t.give.cash)} credits</div>}
              {t.give.spaces.map((i) => (
                <div key={i}>{BOARD_SPACES[i]?.name}{s.mortgaged[i] ? ' (mortgaged)' : ''}</div>
              ))}
              {t.give.cash === 0 && t.give.spaces.length === 0 && <div>nothing</div>}
            </div>
            <div>
              <div className="font-semibold text-slate-100">{nameOf(t.to)} gives</div>
              {t.get.cash > 0 && <div>{fmt(t.get.cash)} credits</div>}
              {t.get.spaces.map((i) => (
                <div key={i}>{BOARD_SPACES[i]?.name}{s.mortgaged[i] ? ' (mortgaged)' : ''}</div>
              ))}
              {t.get.cash === 0 && t.get.spaces.length === 0 && <div>nothing</div>}
            </div>
          </div>
        </div>
      )}

      {s.phase === 'debt' && s.debt && (
        <div className="rounded-xl bg-rose-500/15 p-3 text-sm text-rose-100 ring-1 ring-rose-400/30" role="alert">
          <strong>{nameOf(s.debt.debtor)}</strong> must raise <strong>{fmt(s.debt.amount)}</strong> credits for {s.debt.creditor === null ? 'the bank' : nameOf(s.debt.creditor)}
          {` (cash ${fmt(s.players[s.debt.debtor]?.cash ?? 0)})`}. Sell buildings or mortgage properties
          {has(legal, 'declare_bankruptcy') ? ', or declare bankruptcy.' : '.'}
        </div>
      )}

      {!canMove ? (
        <div className="text-sm text-slate-400">
          {actingSeat === null ? 'Waiting…' : `Waiting for ${nameOf(actingSeat)}…`}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Your actions">
          {has(legal, 'roll') && (
            <button type="button" className={btn} onClick={() => submit({ type: 'roll' })}>
              🎲 Roll
            </button>
          )}
          {has(legal, 'buy') && (
            <button type="button" className={btn} onClick={() => submit({ type: 'buy' })}>
              Buy for {fmt(price)}
            </button>
          )}
          {has(legal, 'auction') && (
            <button type="button" className={ghost} onClick={() => submit({ type: 'auction' })}>
              Auction it
            </button>
          )}
          {legal
            .filter((m): m is Extract<EpicBusinessMove, { type: 'bid' }> => m.type === 'bid')
            .map((m) => (
              <button key={m.amount} type="button" className={btn} onClick={() => submit(m)} aria-label={`Bid ${m.amount}`}>
                +{m.amount - (s.auction?.high ?? 0)} → {fmt(m.amount)}
              </button>
            ))}
          {has(legal, 'pass_bid') && (
            <button type="button" className={ghost} onClick={() => submit({ type: 'pass_bid' })}>
              Pass
            </button>
          )}
          {has(legal, 'pay_bail') && (
            <button type="button" className={btn} onClick={() => submit({ type: 'pay_bail' })}>
              Pay 50 bail
            </button>
          )}
          {has(legal, 'use_card') && (
            <button type="button" className={btn} onClick={() => submit({ type: 'use_card' })}>
              Use card
            </button>
          )}
          {has(legal, 'accept_trade') && (
            <button type="button" className={btn} onClick={() => submit({ type: 'accept_trade' })}>
              Accept trade
            </button>
          )}
          {has(legal, 'decline_trade') && (
            <button type="button" className={ghost} onClick={() => submit({ type: 'decline_trade' })}>
              Decline
            </button>
          )}
          {manageable && (
            <button type="button" className={ghost} onClick={onOpenManage}>
              🏢 Manage
            </button>
          )}
          {canTrade && (
            <button type="button" className={ghost} onClick={onOpenTrade}>
              🤝 Trade
            </button>
          )}
          {has(legal, 'end_turn') && (
            <button type="button" className={btn} onClick={() => submit({ type: 'end_turn' })}>
              End turn
            </button>
          )}
          {has(legal, 'declare_bankruptcy') && (
            <button type="button" className="btn min-h-11 bg-rose-600 px-3 py-2 text-sm text-white hover:bg-rose-500" onClick={() => submit({ type: 'declare_bankruptcy' })}>
              Declare bankruptcy
            </button>
          )}
        </div>
      )}
    </div>
  );
}
