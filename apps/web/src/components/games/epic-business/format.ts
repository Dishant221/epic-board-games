import {
  BAIL,
  BOARD_SPACES,
  GROUP_BY_ID,
  GROUP_SPACES,
  propertyAt,
  rentFor,
  type BoardSpace,
  type EpicBusinessState,
} from '@ebg/game-core/games/epic-business';
import type { RoomPlayer } from '@ebg/game-core';

export const PAWNS = ['🚗', '🛵', '🚁', '⛵'];

export type Side = 'bottom' | 'left' | 'top' | 'right';
export type Orientation = 'landscape' | 'portrait';

/**
 * Board index → ring cell. The ring has 11 cells per side (the engine's corner
 * squares are indices 0/10/20/30), rendered into a rectangle: Payday sits at
 * the bottom-right and play runs anticlockwise (left along the bottom, up the
 * left side, right along the top, down the right side).
 *
 *   row 0 is the top, col 0 is the left; corners are (10,10)=0, (10,0)=10,
 *   (0,0)=20 and (0,10)=30.
 */
export function spaceCell(i: number): { row: number; col: number; side: Side } {
  if (i <= 10) return { row: 10, col: 10 - i, side: 'bottom' };
  if (i <= 20) return { row: 20 - i, col: 0, side: 'left' };
  if (i <= 30) return { row: 0, col: i - 20, side: 'top' };
  return { row: i - 30, col: 10, side: 'right' };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RingGeometry {
  width: number;
  height: number;
  /** Corner size = ring depth. */
  corner: number;
  /** Width of a top/bottom tile. */
  tileW: number;
  /** Height of a left/right tile. */
  tileH: number;
  /** Inner (centre) rectangle. */
  centre: Rect;
  rect(space: number): Rect;
}

/**
 * Pixel geometry of the ring for a `width` × `height` box. The corner size is
 * 15 % of the shorter side, so the ring depth stays sane in both orientations;
 * side tiles stretch to fill the remaining length (wide tiles along the long
 * sides, short tiles along the short sides) — that is what makes the board
 * rectangular without rotating any text.
 */
export function ringGeometry(width: number, height: number): RingGeometry {
  const corner = Math.round(Math.min(width, height) * 0.15);
  const tileW = (width - 2 * corner) / 9;
  const tileH = (height - 2 * corner) / 9;
  const startX = (col: number) => (col === 0 ? 0 : corner + (col - 1) * tileW);
  const startY = (row: number) => (row === 0 ? 0 : corner + (row - 1) * tileH);
  const spanX = (col: number) => (col === 0 || col === 10 ? corner : tileW);
  const spanY = (row: number) => (row === 0 || row === 10 ? corner : tileH);
  return {
    width,
    height,
    corner,
    tileW,
    tileH,
    centre: { x: corner, y: corner, w: width - 2 * corner, h: height - 2 * corner },
    rect(space) {
      const { row, col } = spaceCell(space);
      return { x: startX(col), y: startY(row), w: spanX(col), h: spanY(row) };
    },
  };
}

export const isCorner = (space: number) => space % 10 === 0;

export function fmt(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export const cr = (n: number) => `${fmt(n)} cr`;

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
    case 'district':
      return '🏘️';
  }
}

export function spaceColor(space: number): string | null {
  const sp = BOARD_SPACES[space];
  return sp?.type === 'district' ? GROUP_BY_ID[sp.group].color : null;
}

/** Short label shown under a corner icon. */
export function cornerCaption(sp: BoardSpace): string {
  switch (sp.type) {
    case 'payday':
      return 'Collect 200';
    case 'lock_up':
      return 'Just visiting';
    case 'rest':
      return 'Take a break';
    case 'go_to_lock_up':
      return 'Straight there';
    default:
      return '';
  }
}

/** Seat → display name; "You" when this browser controls exactly one seat. */
export function makeNamer(players: RoomPlayer[], mySeats: number[]) {
  return (seat: number): string => {
    if (mySeats.length === 1 && mySeats[0] === seat) return 'You';
    return players.find((p) => p.seat === seat)?.displayName ?? `Player ${seat + 1}`;
  };
}

/** "Your" / "Nova's" */
export function possessive(name: string): string {
  return name === 'You' ? 'Your' : `${name}’s`;
}

/** Expand `{n}` placeholders in engine log lines. */
export function expandLog(text: string, nameOf: (seat: number) => string): string {
  return text.replace(/\{(\d)\}/g, (_, d: string) => nameOf(Number(d)));
}

/** Icon for a log line, derived from what the engine wrote. */
export function logIcon(line: string): string {
  const t = line.toLowerCase();
  if (t.includes('bankrupt')) return '💀';
  if (t.includes('auction') || t.includes(' bid ')) return '🔨';
  if (t.includes('trade')) return '🤝';
  if (t.includes('owes') || t.includes('paid off')) return '⚠️';
  if (t.includes('rolled') || t.includes('escape roll')) return '🎲';
  if (t.includes('bought')) return '🏷️';
  if (t.includes('rent')) return '💸';
  if (t.includes('payday')) return '💰';
  if (t.includes('card')) return '🃏';
  if (t.includes('lock-up')) return '🔒';
  if (t.includes('built')) return '🏢';
  if (t.includes('mortgage')) return '🏦';
  if (t.includes('levy') || t.includes('repairs') || t.includes('bail')) return '🧾';
  if (t.includes('wins') || t.includes('standing')) return '🏆';
  if (t.includes('sold')) return '💱';
  return '📣';
}

export function relativeTime(at: number | null, now: number): string {
  if (at === null) return '';
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 5) return 'now';
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.round(m / 60)}h`;
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
      return `Just visiting, unless you were sent here. Leave by paying ${BAIL}, using a card or rolling doubles (three failed rolls and bail is forced).`;
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

/** "2 of 3 owned" for a district's group, from `seat`'s point of view. */
export function groupProgress(s: EpicBusinessState, space: number, seat: number | null): { owned: number; total: number } | null {
  const sp = BOARD_SPACES[space];
  if (!sp || sp.type !== 'district' || seat === null) return null;
  const group = GROUP_SPACES[sp.group];
  return { owned: group.filter((i) => s.owners[i] === seat).length, total: group.length };
}

/** What a visitor pays right now (utilities use the last roll, or 7 as a typical total). */
export function currentRent(s: EpicBusinessState, space: number): number {
  const dice = s.dice ? s.dice[0] + s.dice[1] : 7;
  return rentFor(s, space, dice);
}

export interface Banner {
  /** Short headline, e.g. "Your turn". */
  title: string;
  /** What to do / what is happening. */
  text: string;
  tone: 'you' | 'wait' | 'alert' | 'over';
}

/** Phase → plain-language banner. `thinking` = seat of an AI that is deciding. */
export function bannerFor(s: EpicBusinessState, nameOf: (seat: number) => string, canMove: boolean, thinking: number | null): Banner {
  const seat = s.turn;
  const who = nameOf(seat);
  const you = who === 'You';
  const actorText = (seatN: number, youText: string, otherText: (n: string) => string) => (nameOf(seatN) === 'You' ? youText : otherText(nameOf(seatN)));
  const deciding = (n: string) => (thinking === seat ? `${n} is deciding…` : `${n} is thinking it over…`);
  switch (s.phase) {
    case 'roll': {
      if (canMove) {
        return {
          title: you ? 'Your turn' : `${possessive(who)} turn`,
          text: s.rollAgain ? 'Doubles! Roll again.' : 'Roll the dice.',
          tone: 'you',
        };
      }
      return { title: `${possessive(who)} turn`, text: thinking === seat ? `${who} is deciding…` : s.rollAgain ? `${who} rolled doubles and rolls again` : `Waiting for ${who} to roll`, tone: 'wait' };
    }
    case 'lock_up':
      if (canMove) return { title: you ? 'You are in the Lock-up' : `${who} is in the Lock-up`, text: `Pay bail (${BAIL} cr), use a card or try to roll doubles.`, tone: 'alert' };
      return { title: `${who} is in the Lock-up`, text: deciding(who), tone: 'wait' };
    case 'buy': {
      const sp = propertyAt(s.players[seat]?.position ?? 0);
      const name = sp?.name ?? 'this property';
      const price = sp?.price ?? 0;
      const affordable = (s.players[seat]?.cash ?? 0) >= price;
      if (canMove) {
        return {
          title: you ? 'You landed on ' + name : `${who} landed on ${name}`,
          text: affordable ? `Buy ${name} for ${cr(price)} or send it to auction?` : `${you ? 'You' : who} cannot afford ${cr(price)} — it goes to auction.`,
          tone: 'you',
        };
      }
      return { title: `${who} landed on ${name}`, text: `${deciding(who)} Buy for ${cr(price)} or auction?`, tone: 'wait' };
    }
    case 'auction': {
      const a = s.auction;
      if (!a) return { title: 'Auction', text: '', tone: 'wait' };
      const name = BOARD_SPACES[a.space]?.name ?? 'property';
      const high = a.bidder === null ? 'No bids yet' : `Highest bid ${cr(a.high)} by ${nameOf(a.bidder)}`;
      const bidder = nameOf(a.turn);
      return {
        title: `Auction: ${name}`,
        text: `${high}. ${bidder === 'You' ? 'Your bid — raise or pass.' : `${bidder} to bid.`}`,
        tone: canMove ? 'you' : 'wait',
      };
    }
    case 'manage':
      if (canMove) return { title: you ? 'Your turn' : `${possessive(who)} turn`, text: 'Build, mortgage or trade — then end the turn.', tone: 'you' };
      return { title: `${possessive(who)} turn`, text: thinking === seat ? `${who} is deciding…` : `${who} is managing properties…`, tone: 'wait' };
    case 'debt': {
      const d = s.debt;
      if (!d) return { title: 'Debt', text: '', tone: 'alert' };
      const debtor = nameOf(d.debtor);
      const to = d.creditor === null ? 'the bank' : nameOf(d.creditor);
      const owe = debtor === 'You' ? 'You owe' : `${debtor} owes`;
      const short = d.amount - (s.players[d.debtor]?.cash ?? 0);
      return {
        title: `${owe} ${cr(d.amount)} to ${to}`,
        text: canMove ? `Raise ${cr(short)} more: sell buildings or mortgage properties.` : `${debtor} must raise ${cr(short)} more…`,
        tone: 'alert',
      };
    }
    case 'trade': {
      const t = s.pendingTrade;
      if (!t) return { title: 'Trade', text: '', tone: 'wait' };
      return {
        title: actorText(t.from, 'You proposed a trade', (n) => `${n} offers a trade`),
        text: actorText(t.to, 'Accept or decline?', (n) => `Waiting for ${n} to answer…`),
        tone: canMove ? 'you' : 'wait',
      };
    }
    case 'over':
      return { title: 'Game over', text: s.winner === null || s.winner < 0 ? 'A draw on net worth.' : `${nameOf(s.winner)} ${nameOf(s.winner) === 'You' ? 'win' : 'wins'}!`, tone: 'over' };
  }
}

/** One-line "Nova offers Theatre Row + 50 cr for your Grand Parade". */
export function tradeSentence(s: EpicBusinessState, nameOf: (seat: number) => string): string {
  const t = s.pendingTrade;
  if (!t) return '';
  const list = (cash: number, spaces: number[]) => {
    const parts = spaces.map((i) => `${BOARD_SPACES[i]?.name ?? 'a property'}${s.mortgaged[i] ? ' (mortgaged)' : ''}`);
    if (cash > 0) parts.push(cr(cash));
    return parts.length ? parts.join(' + ') : 'nothing';
  };
  const from = nameOf(t.from);
  const to = nameOf(t.to);
  const yours = to === 'You' ? 'your' : `${to}’s`;
  return `${from} ${from === 'You' ? 'offer' : 'offers'} ${list(t.give.cash, t.give.spaces)} for ${yours} ${list(t.get.cash, t.get.spaces)}`;
}
