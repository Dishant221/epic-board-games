import {
  BOARD_SPACES,
  buildCost,
  GROUP_BY_ID,
  GROUP_SPACES,
  HUB_RENT,
  mortgageValue,
  ownedSpaces,
  unmortgageCost,
  type EpicBusinessMove,
  type EpicBusinessState,
} from '@ebg/game-core/games/epic-business';
import { SEAT_COLORS } from '../shared/PlayerPanel';
import { Dialog } from './Dialog';
import { describeSpace, fmt, spaceColor, spaceIcon } from './format';

interface Props {
  s: EpicBusinessState;
  /** Space to show, or 'manage' for the acting player's portfolio. */
  view: number | 'manage' | null;
  legal: EpicBusinessMove[];
  canMove: boolean;
  actingSeat: number | null;
  mobile: boolean;
  nameOf(seat: number): string;
  submit(move: EpicBusinessMove): void;
  onClose(): void;
  onSelectSpace(space: number): void;
}

function PropertyActions({ s, space, legal, canMove, submit }: { s: EpicBusinessState; space: number; legal: EpicBusinessMove[]; canMove: boolean; submit(m: EpicBusinessMove): void }) {
  if (!canMove) return null;
  const mine = legal.filter((m) => 'space' in m && m.space === space);
  if (mine.length === 0) return null;
  const label = (m: EpicBusinessMove): string => {
    switch (m.type) {
      case 'build':
        return `${(s.buildings[space] ?? 0) === 4 ? 'Build tower' : 'Build office'} (−${fmt(buildCost(space))})`;
      case 'sell_building':
        return `Sell building (+${fmt(buildCost(space) / 2)})`;
      case 'mortgage':
        return `Mortgage (+${fmt(mortgageValue(space))})`;
      case 'unmortgage':
        return `Lift mortgage (−${fmt(unmortgageCost(space))})`;
      default:
        return m.type;
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      {mine.map((m) => (
        <button key={m.type} type="button" className={`${m.type === 'build' ? 'btn-primary' : 'btn-ghost'} min-h-11 px-3 py-2 text-sm`} onClick={() => submit(m)}>
          {label(m)}
        </button>
      ))}
    </div>
  );
}

function Deed({ s, space, nameOf }: { s: EpicBusinessState; space: number; nameOf(seat: number): string }) {
  const sp = BOARD_SPACES[space]!;
  const owner = s.owners[space];
  const colour = spaceColor(space);
  const b = s.buildings[space] ?? 0;
  const rows: [string, string][] = [];
  if (sp.type === 'district') {
    const g = GROUP_BY_ID[sp.group];
    rows.push(['Rent', String(sp.rent[0])], ['With full colour group', String(sp.rent[0] * 2)]);
    for (let k = 1; k <= 4; k++) rows.push([`With ${k} office${k > 1 ? 's' : ''}`, String(sp.rent[k])]);
    rows.push(['With a tower', String(sp.rent[5])], ['Office / tower cost', String(g.buildCost)], ['Mortgage value', String(sp.price / 2)]);
  } else if (sp.type === 'hub') {
    HUB_RENT.forEach((r, k) => rows.push([`With ${k + 1} hub${k ? 's' : ''}`, String(r)]));
    rows.push(['Mortgage value', String(sp.price / 2)]);
  } else if (sp.type === 'utility') {
    rows.push(['One utility', '4 × dice'], ['Both utilities', '10 × dice'], ['Mortgage value', String(sp.price / 2)]);
  }
  return (
    <div className="overflow-hidden rounded-xl bg-white text-ink-950 ring-1 ring-white/20">
      <div className="eb-deed-head" style={{ background: colour ?? '#e2e8f0' }}>
        <div className="text-[10px] font-semibold uppercase tracking-widest opacity-70">
          {sp.type === 'district' ? GROUP_BY_ID[sp.group].name : sp.type === 'hub' ? 'Transit' : sp.type === 'utility' ? 'Utility' : 'Board'}
        </div>
        <div className="text-lg">
          {spaceIcon(sp)} {sp.name}
        </div>
      </div>
      <div className="space-y-1 p-3 text-sm">
        {'price' in sp && (
          <div className="flex justify-between font-semibold">
            <span>Price</span>
            <span>{fmt(sp.price)}</span>
          </div>
        )}
        {rows.map(([k, v]) => (
          <div key={k} className={`flex justify-between ${k.startsWith('With') && ((b === 5 && k.includes('tower')) || k === `With ${b} office${b > 1 ? 's' : ''}`) ? 'font-bold text-violet-700' : ''}`}>
            <span className="text-slate-600">{k}</span>
            <span className="tabular-nums">{v}</span>
          </div>
        ))}
        {!('price' in sp) && <p className="text-slate-700">{describeSpace(sp)}</p>}
        {'price' in sp && (
          <div className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-600">
            <p>{describeSpace(sp)}</p>
            <p className="mt-1">
              {owner === null || owner === undefined ? (
                'Unowned'
              ) : (
                <>
                  Owned by <span className="rounded px-1 font-semibold text-white" style={{ background: SEAT_COLORS[owner] }}>{nameOf(owner)}</span>
                  {s.mortgaged[space] && ' · mortgaged'}
                  {b > 0 && ` · ${b === 5 ? 'tower' : `${b} office${b > 1 ? 's' : ''}`}`}
                </>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function PropertySheet({ s, view, legal, canMove, actingSeat, mobile, nameOf, submit, onClose, onSelectSpace }: Props) {
  const open = view !== null;
  const title = view === 'manage' ? 'Manage properties' : view !== null ? BOARD_SPACES[view]?.name ?? 'Space' : '';
  return (
    <Dialog open={open} title={title} mobile={mobile} onClose={onClose}>
      {typeof view === 'number' && (
        <div className="space-y-3">
          <Deed s={s} space={view} nameOf={nameOf} />
          <PropertyActions s={s} space={view} legal={legal} canMove={canMove} submit={submit} />
        </div>
      )}
      {view === 'manage' && actingSeat !== null && (
        <ul className="space-y-2">
          {ownedSpaces(s, actingSeat).length === 0 && <li className="text-sm text-slate-400">No properties yet.</li>}
          {ownedSpaces(s, actingSeat).map((space) => {
            const sp = BOARD_SPACES[space]!;
            const b = s.buildings[space] ?? 0;
            const g = sp.type === 'district' ? GROUP_SPACES[sp.group] : null;
            const complete = g ? g.every((i) => s.owners[i] === actingSeat) : false;
            return (
              <li key={space} className="rounded-xl bg-white/5 p-2 ring-1 ring-white/10">
                <div className="flex items-center gap-2">
                  <span className="size-3 shrink-0 rounded-sm" style={{ background: spaceColor(space) ?? '#94a3b8' }} aria-hidden="true" />
                  <button type="button" className="min-h-11 flex-1 text-left text-sm font-semibold hover:underline" onClick={() => onSelectSpace(space)}>
                    {sp.name}
                  </button>
                  <span className="text-xs text-slate-400">
                    {s.mortgaged[space] ? 'mortgaged' : b === 5 ? 'tower' : b > 0 ? `${b} office${b > 1 ? 's' : ''}` : complete ? 'full group' : ''}
                  </span>
                </div>
                <PropertyActions s={s} space={space} legal={legal} canMove={canMove} submit={submit} />
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
