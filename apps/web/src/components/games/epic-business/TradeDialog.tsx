import { BOARD_SPACES, ownedSpaces, tradeError, type EpicBusinessMove, type EpicBusinessState } from '@ebg/game-core/games/epic-business';
import { useEffect, useState } from 'react';
import { SEAT_COLORS } from '../shared/PlayerPanel';
import { Dialog } from './Dialog';
import { fmt, spaceColor } from './format';

interface Props {
  s: EpicBusinessState;
  open: boolean;
  mobile: boolean;
  nameOf(seat: number): string;
  submit(move: EpicBusinessMove): void;
  onClose(): void;
}

function Chips({ s, spaces, selected, onToggle }: { s: EpicBusinessState; spaces: number[]; selected: number[]; onToggle(space: number): void }) {
  if (spaces.length === 0) return <p className="text-xs text-slate-500">No properties</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {spaces.map((i) => {
        const on = selected.includes(i);
        return (
          <button
            key={i}
            type="button"
            role="checkbox"
            aria-checked={on}
            onClick={() => onToggle(i)}
            className={`flex min-h-11 items-center gap-1.5 rounded-lg px-2 py-1 text-xs ring-1 transition ${on ? 'bg-violet-500/30 ring-violet-300' : 'bg-white/5 ring-white/10 hover:bg-white/10'}`}
          >
            <span className="size-2.5 rounded-sm" style={{ background: spaceColor(i) ?? '#94a3b8' }} aria-hidden="true" />
            {BOARD_SPACES[i]?.name}
            {s.mortgaged[i] && <span className="text-rose-300">(M)</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Compose a free-form proposal; the engine's tradeError explains why it is not yet valid. */
export function TradeDialog({ s, open, mobile, nameOf, submit, onClose }: Props) {
  const me = s.turn;
  const rivals = s.players.map((_, i) => i).filter((i) => i !== me && !s.players[i]!.bankrupt);
  const [to, setTo] = useState<number>(rivals[0] ?? 0);
  const [give, setGive] = useState<number[]>([]);
  const [get, setGet] = useState<number[]>([]);
  const [giveCash, setGiveCash] = useState('0');
  const [getCash, setGetCash] = useState('0');

  useEffect(() => {
    if (!open) return;
    setTo(rivals[0] ?? 0);
    setGive([]);
    setGet([]);
    setGiveCash('0');
    setGetCash('0');
    // Reset whenever the dialog opens.
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (list: number[], set: (v: number[]) => void, i: number) => set(list.includes(i) ? list.filter((x) => x !== i) : [...list, i]);
  const cash = (v: string) => (/^\d{1,7}$/.test(v) ? Number(v) : -1);
  const move: EpicBusinessMove = { type: 'propose_trade', to, give: { cash: cash(giveCash), spaces: give }, get: { cash: cash(getCash), spaces: get } };
  const error = open ? tradeError(s, move) : null;

  return (
    <Dialog open={open} title="Propose a trade" mobile={mobile} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div>
          <div className="mb-1 font-semibold">Trade with</div>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Trade partner">
            {rivals.map((i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={to === i}
                onClick={() => {
                  setTo(i);
                  setGet([]);
                }}
                className={`min-h-11 rounded-xl px-3 py-1.5 ring-1 ${to === i ? 'ring-2 ring-white' : 'ring-white/10'}`}
                style={{ background: `color-mix(in srgb, ${SEAT_COLORS[i]} ${to === i ? 45 : 20}%, transparent)` }}
              >
                {nameOf(i)} · {fmt(s.players[i]!.cash)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <div className="font-semibold">You give</div>
            <Chips s={s} spaces={ownedSpaces(s, me)} selected={give} onToggle={(i) => toggle(give, setGive, i)} />
            <label className="block text-xs text-slate-400">
              Cash (you have {fmt(s.players[me]!.cash)})
              <input className="input mt-1" inputMode="numeric" value={giveCash} onChange={(e) => setGiveCash(e.target.value)} aria-label="Cash you give" />
            </label>
          </div>
          <div className="space-y-2">
            <div className="font-semibold">You get</div>
            <Chips s={s} spaces={ownedSpaces(s, to)} selected={get} onToggle={(i) => toggle(get, setGet, i)} />
            <label className="block text-xs text-slate-400">
              Cash (they have {fmt(s.players[to]?.cash ?? 0)})
              <input className="input mt-1" inputMode="numeric" value={getCash} onChange={(e) => setGetCash(e.target.value)} aria-label="Cash you get" />
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-rose-300" role="status">
            {error ?? ''}
          </span>
          <button
            type="button"
            className="btn-primary min-h-11"
            disabled={error !== null}
            onClick={() => {
              submit(move);
              onClose();
            }}
          >
            Send proposal
          </button>
        </div>
      </div>
    </Dialog>
  );
}
