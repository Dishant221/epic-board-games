import {
  BOARD_SPACES,
  buildCost,
  GROUP_BY_ID,
  GROUP_SPACES,
  HUB_RENT,
  hubsOwned,
  mortgageValue,
  ownedSpaces,
  unmortgageCost,
  utilitiesOwned,
  type EpicBusinessMove,
  type EpicBusinessState,
} from '@ebg/game-core/games/epic-business';
import { SEAT_COLORS } from '../shared/PlayerPanel';
import { Dialog } from './Dialog';
import { cr, describeSpace, fmt, spaceColor, spaceIcon } from './format';

export type PropertyView = number | 'manage' | null;

interface ContentProps {
  s: EpicBusinessState;
  view: Exclude<PropertyView, null>;
  legal: EpicBusinessMove[];
  canMove: boolean;
  actingSeat: number | null;
  nameOf(seat: number): string;
  submit(move: EpicBusinessMove): void;
  onSelectSpace(space: number): void;
}

export function viewTitle(view: PropertyView): string {
  return view === 'manage' ? 'Manage properties' : view !== null ? BOARD_SPACES[view]?.name ?? 'Space' : '';
}

function PropertyActions({ s, space, legal, canMove, submit }: { s: EpicBusinessState; space: number; legal: EpicBusinessMove[]; canMove: boolean; submit(m: EpicBusinessMove): void }) {
  if (!canMove) return null;
  const mine = legal.filter((m) => 'space' in m && m.space === space);
  if (mine.length === 0) return null;
  const label = (m: EpicBusinessMove): [string, string] => {
    switch (m.type) {
      case 'build':
        return [(s.buildings[space] ?? 0) === 4 ? '🏛 Build tower' : '🏢 Build office', `−${cr(buildCost(space))}`];
      case 'sell_building':
        return ['Sell building', `+${cr(buildCost(space) / 2)}`];
      case 'mortgage':
        return ['Mortgage', `+${cr(mortgageValue(space))}`];
      case 'unmortgage':
        return ['Lift mortgage', `−${cr(unmortgageCost(space))}`];
      default:
        return [m.type, ''];
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      {mine.map((m) => {
        const [text, hint] = label(m);
        return (
          <button key={m.type} type="button" className={`${m.type === 'build' ? 'btn-primary' : 'btn-ghost'} min-h-11 px-3 py-2 text-sm`} onClick={() => submit(m)}>
            {text}
            <span className="rounded-md bg-black/25 px-1.5 py-0.5 text-[11px] tabular-nums">{hint}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The deed: full rent table with the current row highlighted, mortgage value, group progress, owner and buildings. */
function Deed({ s, space, nameOf, viewer }: { s: EpicBusinessState; space: number; nameOf(seat: number): string; viewer: number | null }) {
  const sp = BOARD_SPACES[space]!;
  const owner = s.owners[space] ?? null;
  const colour = spaceColor(space);
  const b = s.buildings[space] ?? 0;
  const mortgaged = s.mortgaged[space] === true;
  const rows: { k: string; v: string; now: boolean }[] = [];
  let progress: { who: number; owned: number; total: number } | null = null;

  if (sp.type === 'district') {
    const g = GROUP_BY_ID[sp.group];
    const group = GROUP_SPACES[sp.group];
    const whole = owner !== null && group.every((i) => s.owners[i] === owner);
    rows.push({ k: 'Base rent', v: String(sp.rent[0]), now: owner !== null && !whole && b === 0 });
    rows.push({ k: 'Full colour group', v: String(sp.rent[0] * 2), now: whole && b === 0 });
    for (let k = 1; k <= 4; k++) rows.push({ k: `${k} office${k > 1 ? 's' : ''}`, v: String(sp.rent[k]), now: b === k });
    rows.push({ k: 'Tower', v: String(sp.rent[5]), now: b === 5 });
    rows.push({ k: 'Office / tower cost', v: String(g.buildCost), now: false });
    const who = owner ?? viewer;
    if (who !== null) progress = { who, owned: group.filter((i) => s.owners[i] === who).length, total: group.length };
  } else if (sp.type === 'hub') {
    const n = owner === null ? 0 : hubsOwned(s, owner);
    HUB_RENT.forEach((r, k) => rows.push({ k: `${k + 1} hub${k ? 's' : ''} owned`, v: String(r), now: n === k + 1 }));
  } else if (sp.type === 'utility') {
    const n = owner === null ? 0 : utilitiesOwned(s, owner);
    rows.push({ k: 'One utility', v: '4 × dice', now: n === 1 }, { k: 'Both utilities', v: '10 × dice', now: n === 2 });
  }
  if ('price' in sp) rows.push({ k: 'Mortgage value', v: String(mortgageValue(space)), now: false });

  return (
    <div className="overflow-hidden rounded-xl bg-white text-ink-950 ring-1 ring-white/20">
      <div className="eb-deed-head" style={{ background: colour ?? '#e2e8f0' }}>
        <div className="text-[10px] font-semibold tracking-widest uppercase opacity-70">
          {sp.type === 'district' ? GROUP_BY_ID[sp.group].name : sp.type === 'hub' ? 'Transit hub' : sp.type === 'utility' ? 'Utility' : 'Board space'}
        </div>
        <div className="text-base leading-tight">
          {spaceIcon(sp)} {sp.name}
        </div>
      </div>
      <div className="space-y-0.5 p-3 text-sm">
        {'price' in sp && (
          <div className="flex justify-between font-semibold">
            <span>Price</span>
            <span className="tabular-nums">{fmt(sp.price)}</span>
          </div>
        )}
        {rows.map((r) => (
          <div key={r.k} className={`flex justify-between rounded px-1 ${r.now && !mortgaged ? 'bg-violet-100 font-bold text-violet-800' : ''}`}>
            <span className={r.now ? '' : 'text-slate-600'}>{r.k}{r.now && !mortgaged ? ' · now' : ''}</span>
            <span className="tabular-nums">{r.v}</span>
          </div>
        ))}
        <p className="pt-1 text-xs text-slate-600">{describeSpace(sp)}</p>
        {'price' in sp && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-200 pt-2 text-xs text-slate-700">
            {owner === null ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold">Unowned</span>
            ) : (
              <span className="rounded-full px-2 py-0.5 font-semibold text-white" style={{ background: SEAT_COLORS[owner] }}>
                {nameOf(owner)}
              </span>
            )}
            {mortgaged && <span className="rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-700">Mortgaged · lift for {unmortgageCost(space)}</span>}
            {b > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">{b === 5 ? '🏛 Tower' : `🏢 ${b} office${b > 1 ? 's' : ''}`}</span>}
            {progress && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5">
                {nameOf(progress.who) === 'You' ? 'You own' : `${nameOf(progress.who)} owns`} {progress.owned} of {progress.total} in this group
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Body of the property popover / sheet: one deed, or the acting player's whole portfolio. */
export function PropertyContent({ s, view, legal, canMove, actingSeat, nameOf, submit, onSelectSpace }: ContentProps) {
  if (typeof view === 'number') {
    return (
      <div className="space-y-3">
        <Deed s={s} space={view} nameOf={nameOf} viewer={actingSeat} />
        <PropertyActions s={s} space={view} legal={legal} canMove={canMove} submit={submit} />
      </div>
    );
  }
  if (actingSeat === null) return null;
  const owned = ownedSpaces(s, actingSeat);
  return (
    <ul className="space-y-2">
      {owned.length === 0 && <li className="text-sm text-slate-400">No properties yet.</li>}
      {owned.map((space) => {
        const sp = BOARD_SPACES[space]!;
        const b = s.buildings[space] ?? 0;
        const g = sp.type === 'district' ? GROUP_SPACES[sp.group] : null;
        const have = g ? g.filter((i) => s.owners[i] === actingSeat).length : 0;
        return (
          <li key={space} className="rounded-xl bg-white/5 p-2 ring-1 ring-white/10">
            <div className="flex items-center gap-2">
              <span className="size-3 shrink-0 rounded-sm" style={{ background: spaceColor(space) ?? '#94a3b8' }} aria-hidden="true" />
              <button type="button" className="min-h-11 flex-1 text-left text-sm font-semibold hover:underline" onClick={() => onSelectSpace(space)}>
                {sp.name}
              </button>
              <span className="text-xs text-slate-400">
                {s.mortgaged[space] ? 'mortgaged' : b === 5 ? 'tower' : b > 0 ? `${b} office${b > 1 ? 's' : ''}` : g ? `${have}/${g.length} of group` : ''}
              </span>
            </div>
            <PropertyActions s={s} space={space} legal={legal} canMove={canMove} submit={submit} />
          </li>
        );
      })}
    </ul>
  );
}

interface SheetProps extends Omit<ContentProps, 'view'> {
  view: PropertyView;
  onClose(): void;
}

/** Mobile: bottom sheet (≤ 65 dvh). Desktop uses `PropertyContent` inside the board's centre popover. */
export function PropertySheet({ view, onClose, ...rest }: SheetProps) {
  return (
    <Dialog open={view !== null} title={viewTitle(view)} mobile onClose={onClose}>
      {view !== null && <PropertyContent view={view} {...rest} />}
    </Dialog>
  );
}
