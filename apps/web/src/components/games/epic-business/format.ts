import { BOARD_SPACES, GROUP_BY_ID, type BoardSpace, type EpicBusinessState } from '@ebg/game-core/games/epic-business';
import type { RoomPlayer } from '@ebg/game-core';

/** Corner squares are this many times wider than side squares. */
export const CORNER = 1.4;
export const RING_UNITS = 9 + 2 * CORNER;

export const PAWNS = ['🚗', '🛵', '🚁', '⛵'];

export type Side = 'bottom' | 'left' | 'top' | 'right';

/** Board index → grid cell (row 0 is the top). Payday sits bottom-right; play runs clockwise. */
export function spaceCell(i: number): { row: number; col: number; side: Side } {
  if (i <= 10) return { row: 10, col: 10 - i, side: 'bottom' };
  if (i <= 20) return { row: 10 - (i - 10), col: 0, side: 'left' };
  if (i <= 30) return { row: 0, col: i - 20, side: 'top' };
  return { row: i - 30, col: 10, side: 'right' };
}

/** Pixel rectangle of a grid cell inside a `size` × `size` ring. */
export function cellRect(row: number, col: number, size: number): { x: number; y: number; w: number; h: number } {
  const unit = size / RING_UNITS;
  const start = (n: number) => (n === 0 ? 0 : CORNER * unit + (n - 1) * unit);
  const span = (n: number) => (n === 0 || n === 10 ? CORNER * unit : unit);
  return { x: start(col), y: start(row), w: span(col), h: span(row) };
}

export function fmt(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function spaceIcon(sp: BoardSpace): string {
  switch (sp.type) {
    case 'payday':
      return '💰';
    case 'fortune':
      return '✨';
    case 'market':
      return '📦';
    case 'levy':
      return '🧾';
    case 'lock_up':
      return '🔒';
    case 'go_to_lock_up':
      return '🚔';
    case 'rest':
      return '☕';
    case 'hub':
      return '🚆';
    case 'utility':
      return sp.name === 'Power Grid' ? '⚡' : '💧';
    default:
      return '';
  }
}

export function spaceColor(space: number): string | null {
  const sp = BOARD_SPACES[space];
  return sp?.type === 'district' ? GROUP_BY_ID[sp.group].color : null;
}

/** Seat → display name; "You" when this browser controls exactly one seat. */
export function makeNamer(players: RoomPlayer[], mySeats: number[]) {
  return (seat: number): string => {
    if (mySeats.length === 1 && mySeats[0] === seat) return 'You';
    return players.find((p) => p.seat === seat)?.displayName ?? `Player ${seat + 1}`;
  };
}

/** Expand `{n}` placeholders in engine log lines. */
export function expandLog(text: string, nameOf: (seat: number) => string): string {
  return text.replace(/\{(\d)\}/g, (_, d: string) => nameOf(Number(d)));
}

export function describeSpace(sp: BoardSpace): string {
  switch (sp.type) {
    case 'payday':
      return 'Collect 200 credits every time you pass or land here.';
    case 'fortune':
      return 'Draw a Fortune card: it may move you, pay you or charge you.';
    case 'market':
      return 'Draw a Market card: it may move you, pay you or charge you.';
    case 'levy':
      return `Pay ${sp.amount} credits to the city.`;
    case 'lock_up':
      return 'Just visiting, unless you were sent here. Leave by paying 50, using a card or rolling doubles.';
    case 'go_to_lock_up':
      return 'Go directly to the Lock-up. Do not pass Payday.';
    case 'rest':
      return 'Nothing happens here. Enjoy the break.';
    case 'hub':
      return 'Rent is 25, 50, 100 or 200 depending on how many hubs the owner holds.';
    case 'utility':
      return 'Rent is 4× the dice roll, or 10× when the owner holds both utilities.';
    case 'district':
      return 'Own the whole colour group to double the base rent and start building offices.';
  }
}

export function phaseHint(s: EpicBusinessState, nameOf: (seat: number) => string): string {
  const who = nameOf(s.turn);
  switch (s.phase) {
    case 'roll':
      return s.rollAgain ? `${who} rolled doubles — roll again` : `${who} to roll`;
    case 'lock_up':
      return `${who} is in the Lock-up`;
    case 'buy':
      return `${who} may buy ${BOARD_SPACES[s.players[s.turn]?.position ?? 0]?.name ?? ''}`;
    case 'auction': {
      const a = s.auction;
      if (!a) return 'Auction';
      const high = a.bidder === null ? 'no bids yet' : `${fmt(a.high)} by ${nameOf(a.bidder)}`;
      return `Auction for ${BOARD_SPACES[a.space]?.name}: ${high}. ${nameOf(a.turn)} to bid`;
    }
    case 'manage':
      return `${who} may build, mortgage or trade, then end the turn`;
    case 'debt':
      return s.debt ? `${nameOf(s.debt.debtor)} must raise ${fmt(s.debt.amount)} credits` : 'Debt';
    case 'trade':
      return s.pendingTrade ? `${nameOf(s.pendingTrade.to)} is considering a trade from ${nameOf(s.pendingTrade.from)}` : 'Trade';
    case 'over':
      return 'Game over';
  }
}
