import {
  BAIL,
  BOARD_SPACES,
  buildCost,
  MAX_TRADES_PER_TURN,
  propertyAt,
  raisableCash,
  type EpicBusinessMove,
  type EpicBusinessState,
} from '@ebg/game-core/games/epic-business';
import { SEAT_COLORS } from '../shared/PlayerPanel';
import { cr, fmt, spaceColor, tradeSentence } from './format';

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

interface Action {
  key: string;
  label: string;
  /** Cost / gain hint shown after the label. */
  hint?: string;
  kind: 'primary' | 'ghost' | 'danger';
  onClick(): void;
}

function AuctionPanel({ s, nameOf }: { s: EpicBusinessState; nameOf(seat: number): string }) {
  const a = s.auction;
  if (!a) return null;
  const sp = BOARD_SPACES[a.space];
  return (
    <div className="eb-auction" aria-live="polite">
      <div className="flex items-center justify-center gap-2 text-xs font-semibold tracking-widest text-amber-200 uppercase">
        <span className="inline-block size-2.5 rounded-sm" style={{ background: spaceColor(a.space) ?? '#94a3b8' }} aria-hidden="true" />
        🔨 Auction · {sp?.name}
        {sp && 'price' in sp && <span className="font-normal text-slate-400 normal-case">(list {fmt(sp.price)})</span>}
      </div>
      <div className="mt-1">
        {a.bidder === null ? (
          <span className="text-sm text-slate-300">No bids yet</span>
        ) : (
          <>
            <span key={a.high} className="eb-bid">
              {cr(a.high)}
            </span>
            <span className="ml-2 text-xs text-slate-300">
              by <span className="font-semibold" style={{ color: SEAT_COLORS[a.bidder] }}>{nameOf(a.bidder)}</span>
            </span>
          </>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap justify-center gap-1">
        {a.active.map((seat) => (
          <span key={seat} className="eb-bidder" data-turn={seat === a.turn ? 'true' : undefined} style={{ boxShadow: `inset 0 0 0 1px ${SEAT_COLORS[seat]}` }}>
            {nameOf(seat)}
            {seat === a.turn ? ' · bidding' : ''}
          </span>
        ))}
        {s.players.map((p, seat) => (!p.bankrupt && !a.active.includes(seat) ? <span key={seat} className="eb-bidder line-through opacity-50">{nameOf(seat)}</span> : null))}
      </div>
    </div>
  );
}

function TradeOffer({ s, nameOf }: { s: EpicBusinessState; nameOf(seat: number): string }) {
  const t = s.pendingTrade;
  if (!t) return null;
  const chips = (spaces: number[]) =>
    spaces.map((i) => (
      <span key={i} className="inline-flex items-center gap-1 rounded-md bg-white/10 px-1.5 py-0.5 text-[11px]">
        <span className="size-2 rounded-sm" style={{ background: spaceColor(i) ?? '#94a3b8' }} aria-hidden="true" />
        {BOARD_SPACES[i]?.name}
      </span>
    ));
  return (
    <div className="w-full max-w-sm rounded-xl bg-violet-500/15 p-2.5 text-left text-sm ring-1 ring-violet-400/30">
      <div className="font-semibold">🤝 {tradeSentence(s, nameOf)}</div>
      <div className="mt-1.5 grid grid-cols-2 gap-2 text-[11px] text-slate-300">
        <div className="flex flex-wrap gap-1">
          <span className="w-full text-slate-400">{nameOf(t.from)} gives</span>
          {chips(t.give.spaces)}
          {t.give.cash > 0 && <span className="rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-emerald-200">{cr(t.give.cash)}</span>}
        </div>
        <div className="flex flex-wrap gap-1">
          <span className="w-full text-slate-400">{nameOf(t.to)} gives</span>
          {chips(t.get.spaces)}
          {t.get.cash > 0 && <span className="rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-emerald-200">{cr(t.get.cash)}</span>}
        </div>
      </div>
    </div>
  );
}

/** Only the actions that are legal right now are rendered, each with its cost, so the bar doubles as a rules hint. */
export function ActionBar({ s, legal, canMove, actingSeat, nameOf, submit, onOpenManage, onOpenTrade }: Props) {
  if (s.phase === 'over') return null;
  const me = s.players[s.turn];
  const here = propertyAt(me?.position ?? 0);
  const builds = legal.filter((m): m is Extract<EpicBusinessMove, { type: 'build' }> => m.type === 'build');
  const manageable = legal.some((m) => m.type === 'build' || m.type === 'sell_building' || m.type === 'mortgage' || m.type === 'unmortgage');
  const canTrade = (s.phase === 'roll' || s.phase === 'manage' || s.phase === 'lock_up') && s.tradesThisTurn < MAX_TRADES_PER_TURN && s.players.filter((p) => !p.bankrupt).length > 1;

  const actions: Action[] = [];
  if (has(legal, 'roll')) actions.push({ key: 'roll', label: s.phase === 'lock_up' ? '🎲 Roll for doubles' : '🎲 Roll the dice', kind: 'primary', onClick: () => submit({ type: 'roll' }) });
  if (has(legal, 'buy') && here) actions.push({ key: 'buy', label: `Buy ${here.name}`, hint: cr(here.price), kind: 'primary', onClick: () => submit({ type: 'buy' }) });
  if (has(legal, 'auction')) actions.push({ key: 'auction', label: 'Send to auction', kind: 'ghost', onClick: () => submit({ type: 'auction' }) });
  for (const m of legal) {
    if (m.type === 'bid') actions.push({ key: `bid-${m.amount}`, label: `Bid ${cr(m.amount)}`, hint: `+${m.amount - (s.auction?.high ?? 0)}`, kind: 'primary', onClick: () => submit(m) });
  }
  if (has(legal, 'pass_bid')) actions.push({ key: 'pass', label: 'Pass', kind: 'ghost', onClick: () => submit({ type: 'pass_bid' }) });
  if (has(legal, 'pay_bail')) actions.push({ key: 'bail', label: 'Pay bail', hint: cr(BAIL), kind: 'primary', onClick: () => submit({ type: 'pay_bail' }) });
  if (has(legal, 'use_card')) actions.push({ key: 'card', label: '🎟 Use Lock-up card', kind: 'primary', onClick: () => submit({ type: 'use_card' }) });
  if (has(legal, 'accept_trade')) actions.push({ key: 'accept', label: 'Accept trade', kind: 'primary', onClick: () => submit({ type: 'accept_trade' }) });
  if (has(legal, 'decline_trade')) actions.push({ key: 'decline', label: 'Decline', kind: 'ghost', onClick: () => submit({ type: 'decline_trade' }) });
  // One or two build options fit inline; more go through Manage.
  if (builds.length > 0 && builds.length <= 2 && s.phase !== 'debt') {
    for (const m of builds) {
      const tower = (s.buildings[m.space] ?? 0) === 4;
      actions.push({ key: `build-${m.space}`, label: `${tower ? '🏛 Build tower' : '🏢 Build office'} · ${BOARD_SPACES[m.space]?.name}`, hint: cr(buildCost(m.space)), kind: 'ghost', onClick: () => submit(m) });
    }
  }
  if (manageable) actions.push({ key: 'manage', label: s.phase === 'debt' ? '🏦 Raise cash' : '🏢 Manage properties', kind: s.phase === 'debt' ? 'primary' : 'ghost', onClick: onOpenManage });
  if (canTrade) actions.push({ key: 'trade', label: '🤝 Propose trade', hint: `${MAX_TRADES_PER_TURN - s.tradesThisTurn} left`, kind: 'ghost', onClick: onOpenTrade });
  if (has(legal, 'end_turn')) actions.push({ key: 'end', label: 'End turn', kind: 'primary', onClick: () => submit({ type: 'end_turn' }) });
  if (has(legal, 'declare_bankruptcy')) actions.push({ key: 'bankrupt', label: '💀 Declare bankruptcy', kind: 'danger', onClick: () => submit({ type: 'declare_bankruptcy' }) });

  const cls: Record<Action['kind'], string> = {
    primary: 'btn-primary min-h-11 px-3 py-2 text-sm',
    ghost: 'btn-ghost min-h-11 px-3 py-2 text-sm',
    danger: 'btn min-h-11 bg-rose-600 px-3 py-2 text-sm text-white hover:bg-rose-500',
  };

  return (
    <div className="flex w-full flex-col items-center gap-2" aria-label="Actions">
      {s.phase === 'trade' && <TradeOffer s={s} nameOf={nameOf} />}
      {s.phase === 'auction' && <AuctionPanel s={s} nameOf={nameOf} />}
      {s.phase === 'debt' && s.debt && (
        <div className="w-full max-w-sm rounded-xl bg-rose-500/15 p-2 text-xs text-rose-100 ring-1 ring-rose-400/30" role="alert">
          Cash {cr(s.players[s.debt.debtor]?.cash ?? 0)} · can still raise {cr(raisableCash(s, s.debt.debtor))} by selling buildings and mortgaging.
          {has(legal, 'declare_bankruptcy') && ' Not enough — bankruptcy is on the table.'}
        </div>
      )}

      {!canMove ? (
        <div className="text-xs text-slate-400 sm:text-sm">{actingSeat === null ? 'Waiting…' : `Waiting for ${nameOf(actingSeat)}…`}</div>
      ) : (
        <div className="flex flex-wrap justify-center gap-2" role="toolbar" aria-label="Your actions">
          {actions.map((a) => (
            <button key={a.key} type="button" className={cls[a.kind]} onClick={a.onClick}>
              {a.label}
              {a.hint && <span className="rounded-md bg-black/25 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">{a.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
