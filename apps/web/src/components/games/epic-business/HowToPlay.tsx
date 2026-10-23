import { getGame } from '@ebg/game-core';
import { BAIL, HUB_RENT, MAX_TRADES_PER_TURN, PAYDAY_BONUS, STARTING_CASH } from '@ebg/game-core/games/epic-business';

const PHASES: [string, string][] = [
  ['🎲 Roll', 'Roll two dice and move. Doubles let you roll again; three doubles in a row send you to the Lock-up.'],
  ['🏷️ Buy or auction', 'Land on an unowned property to buy it at list price or send it to auction, where everyone bids in +10 / +50 / +100 steps.'],
  ['🏢 Manage', 'Before ending your turn: build offices (even-build rule: no district more than one ahead of its group), mortgage for half price, lift a mortgage for 110 %, or propose a trade.'],
  ['💸 Rent', 'Landing on a rival’s property pays rent automatically. Full colour group doubles base rent; offices and towers multiply it. Mortgaged properties collect nothing.'],
  ['⚠️ Debt', 'If you cannot pay, sell buildings (half price) or mortgage until you can — or declare bankruptcy and hand your assets to the creditor.'],
  ['🔒 Lock-up', `Leave by paying ${BAIL} cr, using a Lock-up card, or rolling doubles. After three failed rolls bail is forced.`],
];

/** Collapsible rules panel: catalog rules plus a phase-by-phase cheat sheet. */
export function HowToPlay() {
  const rules = getGame('epic_business').rules;
  return (
    <details className="card group p-2 text-sm">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-2 font-semibold select-none hover:bg-white/5">
        <span aria-hidden="true">📖</span>
        How to play
        <span className="ml-auto text-xs text-slate-400 transition group-open:rotate-180" aria-hidden="true">▾</span>
      </summary>
      <div className="space-y-3 px-2 pt-1 pb-2 text-xs text-slate-300">
        <ul className="list-disc space-y-1 pl-4">
          {rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <div>
          <div className="mb-1 font-semibold text-slate-100">Turn by turn</div>
          <dl className="space-y-1.5">
            {PHASES.map(([k, v]) => (
              <div key={k}>
                <dt className="font-semibold text-slate-200">{k}</dt>
                <dd className="text-slate-400">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-slate-400">
          <span>Starting cash</span>
          <span className="text-right text-slate-200 tabular-nums">{STARTING_CASH}</span>
          <span>Passing Payday</span>
          <span className="text-right text-slate-200 tabular-nums">+{PAYDAY_BONUS}</span>
          <span>Hub rent (1–4 hubs)</span>
          <span className="text-right text-slate-200 tabular-nums">{HUB_RENT.join(' / ')}</span>
          <span>Utility rent</span>
          <span className="text-right text-slate-200">4× dice · 10× with both</span>
          <span>Trades per turn</span>
          <span className="text-right text-slate-200 tabular-nums">{MAX_TRADES_PER_TURN}</span>
        </div>
      </div>
    </details>
  );
}
