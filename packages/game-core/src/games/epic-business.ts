import type { AIDifficulty } from '../ai';
import type { Rng } from '../rng';
import {
  BOARD_SIZE,
  BOARD_SPACES,
  COLOUR_GROUPS,
  FORTUNE_CARDS,
  GROUP_BY_ID,
  GROUP_SPACES,
  HUB_RENT,
  HUB_SPACES,
  isProperty,
  LOCK_UP_SPACE,
  MARKET_CARDS,
  UTILITY_SPACES,
  type Card,
  type GroupId,
  type PropertySpace,
} from './epic-business-data';
import { DRAW, IllegalMoveError, type GameEngine } from './types';

export * from './epic-business-data';

export const STARTING_CASH = 1500;
export const PAYDAY_BONUS = 200;
export const BAIL = 50;
/** Full rounds after which the richest player wins, so online games always end. */
export const MAX_ROUNDS = 120;
/** Trade proposals one player may make per turn (stops proposal spam online). */
export const MAX_TRADES_PER_TURN = 3;
export const BID_INCREMENTS = [10, 50, 100] as const;
const LOG_LIMIT = 30;

export type Phase = 'roll' | 'buy' | 'auction' | 'manage' | 'debt' | 'lock_up' | 'trade' | 'over';

/** Things that happened during the last applied move; the board maps them to sounds/animations. */
export type EpicBusinessEvent = 'roll' | 'move' | 'cash' | 'card' | 'debt' | 'lock_up' | 'bankrupt' | 'build' | 'trade';

export interface EpicBusinessPlayer {
  cash: number;
  position: number;
  inLockUp: boolean;
  /** Failed escape rolls while in the Lock-up (3rd forces bail). */
  lockUpTurns: number;
  bankrupt: boolean;
  /** "Leave the Lock-up free" cards held. */
  outCards: number;
  /** Consecutive doubles rolled this turn. */
  doubles: number;
}

export interface Auction {
  space: number;
  high: number;
  bidder: number | null;
  /** Seats still in the auction, in seat order. */
  active: number[];
  /** Seat whose turn it is to bid or pass. */
  turn: number;
}

export interface TradeOffer {
  cash: number;
  spaces: number[];
}

export interface PendingTrade {
  from: number;
  to: number;
  give: TradeOffer;
  get: TradeOffer;
  /** Phase to return to once the recipient answers. */
  resume: 'roll' | 'manage' | 'lock_up';
}

export interface Debt {
  debtor: number;
  amount: number;
  /** Seat owed, or null for the bank. */
  creditor: number | null;
  /** What continues after settling: the landing flow, or a pending pawn move (forced bail). */
  after: 'landing' | 'move';
}

export interface EpicBusinessState {
  phase: Phase;
  players: EpicBusinessPlayer[];
  /** Owner seat per space (null = bank / not a property). */
  owners: (number | null)[];
  /** 0..4 offices, 5 = tower. */
  buildings: number[];
  mortgaged: boolean[];
  dice: [number, number] | null;
  /** True when the current player rolled doubles and still has to roll again. */
  rollAgain: boolean;
  auction: Auction | null;
  pendingTrade: PendingTrade | null;
  debt: Debt | null;
  decks: { fortune: number[]; market: number[] };
  round: number;
  turn: number;
  tradesThisTurn: number;
  /** Human-readable events, newest last; `{n}` stands for seat n's name. */
  log: string[];
  lastCard: { deck: 'fortune' | 'market'; index: number } | null;
  events: EpicBusinessEvent[];
  winner: number | null;
}

export type EpicBusinessMove =
  | { type: 'roll' }
  | { type: 'buy' }
  | { type: 'auction' }
  | { type: 'bid'; amount: number }
  | { type: 'pass_bid' }
  | { type: 'build'; space: number }
  | { type: 'sell_building'; space: number }
  | { type: 'mortgage'; space: number }
  | { type: 'unmortgage'; space: number }
  | { type: 'pay_bail' }
  | { type: 'use_card' }
  | { type: 'end_turn' }
  | { type: 'propose_trade'; to: number; give: TradeOffer; get: TradeOffer }
  | { type: 'accept_trade' }
  | { type: 'decline_trade' }
  | { type: 'declare_bankruptcy' };

type S = EpicBusinessState;
type M = EpicBusinessMove;

// ---------------------------------------------------------------- helpers

export function propertyAt(space: number): PropertySpace | null {
  const sp = BOARD_SPACES[space];
  return sp && isProperty(sp) ? sp : null;
}

export function groupOf(space: number): GroupId | null {
  const sp = BOARD_SPACES[space];
  return sp?.type === 'district' ? sp.group : null;
}

export function ownsGroup(s: S, seat: number, group: GroupId): boolean {
  return GROUP_SPACES[group].every((i) => s.owners[i] === seat);
}

export function mortgageValue(space: number): number {
  const p = propertyAt(space);
  return p ? p.price / 2 : 0;
}

/** Unmortgaging costs the mortgage value plus 10 % interest. */
export function unmortgageCost(space: number): number {
  return Math.ceil((mortgageValue(space) * 11) / 10);
}

export function buildCost(space: number): number {
  const g = groupOf(space);
  return g ? GROUP_BY_ID[g].buildCost : 0;
}

export function ownedSpaces(s: S, seat: number): number[] {
  const out: number[] = [];
  s.owners.forEach((o, i) => {
    if (o === seat) out.push(i);
  });
  return out;
}

export function hubsOwned(s: S, seat: number): number {
  return HUB_SPACES.filter((i) => s.owners[i] === seat).length;
}

export function utilitiesOwned(s: S, seat: number): number {
  return UTILITY_SPACES.filter((i) => s.owners[i] === seat).length;
}

/** Rent due when landing on `space` with `diceTotal`, ignoring who lands. */
export function rentFor(s: S, space: number, diceTotal: number): number {
  const owner = s.owners[space];
  const sp = BOARD_SPACES[space];
  if (owner === null || owner === undefined || !sp || s.mortgaged[space]) return 0;
  if (sp.type === 'district') {
    const b = s.buildings[space] ?? 0;
    if (b > 0) return sp.rent[Math.min(b, 5)] ?? 0;
    return ownsGroup(s, owner, sp.group) ? sp.rent[0] * 2 : sp.rent[0];
  }
  if (sp.type === 'hub') return HUB_RENT[Math.max(0, Math.min(3, hubsOwned(s, owner) - 1))] ?? 25;
  if (sp.type === 'utility') return diceTotal * (utilitiesOwned(s, owner) === 2 ? 10 : 4);
  return 0;
}

/** Cash + property values (mortgaged at half) + buildings at cost. */
export function netWorth(s: S, seat: number): number {
  const p = s.players[seat];
  if (!p || p.bankrupt) return 0;
  let total = p.cash;
  for (const i of ownedSpaces(s, seat)) {
    const sp = propertyAt(i)!;
    total += s.mortgaged[i] ? sp.price / 2 : sp.price;
    total += (s.buildings[i] ?? 0) * buildCost(i);
  }
  return total;
}

export function canBuild(s: S, seat: number, space: number): boolean {
  const sp = BOARD_SPACES[space];
  if (!sp || sp.type !== 'district' || s.owners[space] !== seat) return false;
  if (!ownsGroup(s, seat, sp.group)) return false;
  const group = GROUP_SPACES[sp.group];
  if (group.some((i) => s.mortgaged[i])) return false;
  const here = s.buildings[space] ?? 0;
  if (here >= 5) return false;
  // Even-build rule: never get more than one building ahead of the group.
  const min = Math.min(...group.map((i) => s.buildings[i] ?? 0));
  if (here > min) return false;
  return (s.players[seat]?.cash ?? 0) >= GROUP_BY_ID[sp.group].buildCost;
}

export function canSellBuilding(s: S, seat: number, space: number): boolean {
  const sp = BOARD_SPACES[space];
  if (!sp || sp.type !== 'district' || s.owners[space] !== seat) return false;
  const here = s.buildings[space] ?? 0;
  if (here === 0) return false;
  const max = Math.max(...GROUP_SPACES[sp.group].map((i) => s.buildings[i] ?? 0));
  return here >= max;
}

export function canMortgage(s: S, seat: number, space: number): boolean {
  if (s.owners[space] !== seat || s.mortgaged[space] || !propertyAt(space)) return false;
  const g = groupOf(space);
  // No mortgaging while any district of the group carries buildings.
  return !g || GROUP_SPACES[g].every((i) => (s.buildings[i] ?? 0) === 0);
}

export function canUnmortgage(s: S, seat: number, space: number): boolean {
  return s.owners[space] === seat && s.mortgaged[space] === true && (s.players[seat]?.cash ?? 0) >= unmortgageCost(space);
}

/** Cash a player could still raise by selling every building and mortgaging everything. */
export function raisableCash(s: S, seat: number): number {
  let total = 0;
  for (const i of ownedSpaces(s, seat)) {
    total += ((s.buildings[i] ?? 0) * buildCost(i)) / 2;
    if (!s.mortgaged[i]) total += mortgageValue(i);
  }
  return total;
}

function solventSeats(s: S): number[] {
  return s.players.map((p, i) => (p.bankrupt ? -1 : i)).filter((i) => i >= 0);
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** Why a trade proposal is invalid, or null when it is acceptable. Exported so the UI can explain. */
export function tradeError(s: S, m: Extract<M, { type: 'propose_trade' }>): string | null {
  if (s.phase !== 'roll' && s.phase !== 'manage' && s.phase !== 'lock_up') return 'You can only trade during your own turn';
  if (s.tradesThisTurn >= MAX_TRADES_PER_TURN) return 'No more proposals this turn';
  const from = s.turn;
  const toP = s.players[m.to];
  if (!toP || m.to === from || toP.bankrupt) return 'Pick a rival who is still in the game';
  for (const side of [m.give, m.get]) {
    if (!isInt(side.cash) || side.cash < 0) return 'Cash must be a whole number';
    if (side.spaces.length > 28 || new Set(side.spaces).size !== side.spaces.length) return 'Duplicate properties';
  }
  if (m.give.cash > 0 && m.get.cash > 0) return 'Only one side should include cash';
  if (m.give.cash === 0 && m.get.cash === 0 && m.give.spaces.length === 0 && m.get.spaces.length === 0) return 'Offer something';
  if (m.give.cash > (s.players[from]?.cash ?? 0)) return 'You cannot offer more cash than you have';
  if (m.get.cash > toP.cash) return 'They do not have that much cash';
  const check = (spaces: number[], owner: number) => {
    for (const i of spaces) {
      if (!isInt(i) || !propertyAt(i)) return 'Not a property';
      if (s.owners[i] !== owner) return 'Property not owned by that player';
      const g = groupOf(i);
      if (g && GROUP_SPACES[g].some((j) => (s.buildings[j] ?? 0) > 0)) return 'Sell the buildings in that colour group first';
    }
    return null;
  };
  return check(m.give.spaces, from) ?? check(m.get.spaces, m.to);
}

function manageMoves(s: S, seat: number): M[] {
  const moves: M[] = [];
  for (const space of ownedSpaces(s, seat)) {
    if (canBuild(s, seat, space)) moves.push({ type: 'build', space });
    if (canSellBuilding(s, seat, space)) moves.push({ type: 'sell_building', space });
    if (canMortgage(s, seat, space)) moves.push({ type: 'mortgage', space });
    if (canUnmortgage(s, seat, space)) moves.push({ type: 'unmortgage', space });
  }
  return moves;
}

// -------------------------------------------------------- state mutation
// applyMove works on a fresh clone, so the helpers below mutate `n` freely.

function clone(s: S): S {
  return {
    ...s,
    players: s.players.map((p) => ({ ...p })),
    owners: s.owners.slice(),
    buildings: s.buildings.slice(),
    mortgaged: s.mortgaged.slice(),
    dice: s.dice ? [s.dice[0], s.dice[1]] : null,
    auction: s.auction ? { ...s.auction, active: s.auction.active.slice() } : null,
    pendingTrade: s.pendingTrade
      ? { ...s.pendingTrade, give: { cash: s.pendingTrade.give.cash, spaces: s.pendingTrade.give.spaces.slice() }, get: { cash: s.pendingTrade.get.cash, spaces: s.pendingTrade.get.spaces.slice() } }
      : null,
    debt: s.debt ? { ...s.debt } : null,
    decks: { fortune: s.decks.fortune.slice(), market: s.decks.market.slice() },
    log: s.log.slice(),
    lastCard: s.lastCard ? { ...s.lastCard } : null,
    events: [],
  };
}

function log(n: S, text: string) {
  n.log.push(text);
  if (n.log.length > LOG_LIMIT) n.log.splice(0, n.log.length - LOG_LIMIT);
}

function event(n: S, e: EpicBusinessEvent) {
  if (!n.events.includes(e)) n.events.push(e);
}

function spaceName(space: number): string {
  return BOARD_SPACES[space]?.name ?? `space ${space}`;
}

function diceTotal(n: S): number {
  return n.dice ? n.dice[0] + n.dice[1] : 7;
}

/**
 * Charge `seat`. Returns true when paid in full; otherwise the game enters the
 * debt phase and `after` says what resumes once the debt is settled.
 */
function charge(n: S, seat: number, amount: number, creditor: number | null, after: Debt['after']): boolean {
  const p = n.players[seat]!;
  if (amount <= 0) return true;
  if (p.cash >= amount) {
    p.cash -= amount;
    if (creditor !== null) n.players[creditor]!.cash += amount;
    event(n, 'cash');
    return true;
  }
  n.debt = { debtor: seat, amount, creditor, after };
  n.phase = 'debt';
  event(n, 'debt');
  log(n, `{${seat}} owes ${amount} and must raise cash`);
  return false;
}

function settleDebt(n: S) {
  const d = n.debt!;
  const p = n.players[d.debtor]!;
  if (p.cash < d.amount) return;
  p.cash -= d.amount;
  if (d.creditor !== null) n.players[d.creditor]!.cash += d.amount;
  event(n, 'cash');
  log(n, `{${d.debtor}} paid off ${d.amount}`);
  n.debt = null;
  n.phase = n.rollAgain ? 'roll' : 'manage';
  if (d.after === 'move') {
    moveBy(n, d.debtor, diceTotal(n));
    resolveLanding(n, d.debtor);
  }
  finishLanding(n);
}

function movePawnTo(n: S, seat: number, target: number, forward: boolean) {
  const p = n.players[seat]!;
  if (forward && target <= p.position) {
    p.cash += PAYDAY_BONUS;
    event(n, 'cash');
    log(n, `{${seat}} passed Payday and collected ${PAYDAY_BONUS}`);
  }
  p.position = target;
  event(n, 'move');
}

function moveBy(n: S, seat: number, steps: number) {
  const p = n.players[seat]!;
  movePawnTo(n, seat, (((p.position + steps) % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE, steps > 0);
}

function sendToLockUp(n: S, seat: number) {
  const p = n.players[seat]!;
  p.position = LOCK_UP_SPACE;
  p.inLockUp = true;
  p.lockUpTurns = 0;
  p.doubles = 0;
  n.rollAgain = false;
  event(n, 'lock_up');
  log(n, `{${seat}} was sent to the Lock-up`);
}

/** After a landing is fully resolved, hand control back: roll again on doubles, else manage. */
function finishLanding(n: S) {
  if (n.phase === 'buy' || n.phase === 'auction' || n.phase === 'debt' || n.phase === 'over') return;
  const p = n.players[n.turn]!;
  n.phase = n.rollAgain && !p.inLockUp ? 'roll' : 'manage';
}

function chargeRent(n: S, seat: number, space: number, multiplier: number, utilityFlat?: number) {
  const owner = n.owners[space];
  if (owner === null || owner === undefined || owner === seat) return;
  if (n.mortgaged[space]) {
    log(n, `{${seat}} landed on mortgaged ${spaceName(space)}: no rent`);
    return;
  }
  const base = utilityFlat !== undefined ? diceTotal(n) * utilityFlat : rentFor(n, space, diceTotal(n));
  const rent = base * multiplier;
  log(n, `{${seat}} paid ${rent} rent to {${owner}} for ${spaceName(space)}`);
  charge(n, seat, rent, owner, 'landing');
}

function resolveLanding(n: S, seat: number) {
  const p = n.players[seat]!;
  const space = p.position;
  const sp = BOARD_SPACES[space]!;
  switch (sp.type) {
    case 'district':
    case 'hub':
    case 'utility':
      if (n.owners[space] === null) {
        n.phase = 'buy';
        log(n, `{${seat}} landed on ${sp.name} (${sp.price})`);
      } else {
        chargeRent(n, seat, space, 1);
      }
      break;
    case 'levy':
      log(n, `{${seat}} paid the ${sp.name} of ${sp.amount}`);
      charge(n, seat, sp.amount, null, 'landing');
      break;
    case 'fortune':
      drawCard(n, seat, 'fortune');
      break;
    case 'market':
      drawCard(n, seat, 'market');
      break;
    case 'go_to_lock_up':
      sendToLockUp(n, seat);
      break;
    case 'lock_up':
      log(n, `{${seat}} is just visiting the Lock-up`);
      break;
    case 'rest':
      log(n, `{${seat}} takes a breather at the Rest Stop`);
      break;
    case 'payday':
      break;
  }
}

function nearest(from: number, candidates: readonly number[]): number {
  const ahead = candidates.find((i) => i > from);
  return ahead ?? candidates[0]!;
}

function drawCard(n: S, seat: number, deck: 'fortune' | 'market') {
  const pile = n.decks[deck];
  const index = pile.shift()!;
  pile.push(index);
  const card: Card = (deck === 'fortune' ? FORTUNE_CARDS : MARKET_CARDS)[index]!;
  n.lastCard = { deck, index };
  event(n, 'card');
  log(n, `{${seat}} drew a ${deck === 'fortune' ? 'Fortune' : 'Market'} card: ${card.text}`);
  const p = n.players[seat]!;
  const e = card.effect;
  switch (e.kind) {
    case 'move_to':
      movePawnTo(n, seat, e.space, true);
      resolveLanding(n, seat);
      break;
    case 'move_by':
      moveBy(n, seat, e.steps);
      resolveLanding(n, seat);
      break;
    case 'pay':
      charge(n, seat, e.amount, null, 'landing');
      break;
    case 'collect':
      p.cash += e.amount;
      event(n, 'cash');
      break;
    case 'collect_each':
      // Rivals pay what they can hold; nobody is driven into debt off-turn.
      for (const i of solventSeats(n)) {
        if (i === seat) continue;
        const paid = Math.min(n.players[i]!.cash, e.amount);
        n.players[i]!.cash -= paid;
        p.cash += paid;
      }
      event(n, 'cash');
      break;
    case 'out_card':
      p.outCards += 1;
      break;
    case 'go_to_lock_up':
      sendToLockUp(n, seat);
      break;
    case 'repairs': {
      let cost = 0;
      for (const i of ownedSpaces(n, seat)) {
        const b = n.buildings[i] ?? 0;
        cost += b === 5 ? e.tower : b * e.office;
      }
      if (cost > 0) {
        log(n, `{${seat}} pays ${cost} for repairs`);
        charge(n, seat, cost, null, 'landing');
      }
      break;
    }
    case 'nearest_hub': {
      const target = nearest(p.position, HUB_SPACES);
      movePawnTo(n, seat, target, true);
      if (n.owners[target] === null) n.phase = 'buy';
      else chargeRent(n, seat, target, 2);
      break;
    }
    case 'nearest_utility': {
      const target = nearest(p.position, UTILITY_SPACES);
      movePawnTo(n, seat, target, true);
      if (n.owners[target] === null) n.phase = 'buy';
      else chargeRent(n, seat, target, 1, 10);
      break;
    }
  }
}

function endByNetWorth(n: S) {
  const seats = solventSeats(n);
  let best = -1;
  let winner: number | null = null;
  for (const i of seats) {
    const w = netWorth(n, i);
    if (w > best) {
      best = w;
      winner = i;
    } else if (w === best) {
      winner = DRAW;
    }
  }
  n.phase = 'over';
  n.winner = winner;
  log(n, `Round limit reached: ${winner === DRAW || winner === null ? 'it is a draw' : `{${winner}} wins with the highest net worth`}`);
}

function nextTurn(n: S) {
  const cur = n.turn;
  let next = cur;
  do next = (next + 1) % n.players.length;
  while (n.players[next]!.bankrupt);
  if (next <= cur) {
    n.round += 1;
    if (n.round > MAX_ROUNDS) {
      endByNetWorth(n);
      return;
    }
  }
  n.turn = next;
  n.tradesThisTurn = 0;
  n.rollAgain = false;
  const p = n.players[next]!;
  p.doubles = 0;
  n.phase = p.inLockUp ? 'lock_up' : 'roll';
}

function finishAuction(n: S) {
  const a = n.auction!;
  if (a.bidder !== null) {
    n.owners[a.space] = a.bidder;
    n.players[a.bidder]!.cash -= a.high;
    event(n, 'cash');
    log(n, `{${a.bidder}} won the auction for ${spaceName(a.space)} at ${a.high}`);
  } else {
    log(n, `Nobody bid for ${spaceName(a.space)}`);
  }
  n.auction = null;
  n.phase = 'manage';
  finishLanding(n);
}

function advanceAuction(n: S) {
  const a = n.auction!;
  const others = a.active.filter((i) => i !== a.bidder);
  if (a.active.length === 0 || (a.bidder !== null && others.length === 0)) {
    finishAuction(n);
    return;
  }
  // Next active seat after the one who just acted, in seat order.
  const after = a.active.find((i) => i > a.turn);
  a.turn = after ?? a.active[0]!;
}

function declareBankruptcy(n: S) {
  const d = n.debt!;
  const debtor = n.players[d.debtor]!;
  const creditor = d.creditor;
  event(n, 'bankrupt');
  log(n, creditor === null ? `{${d.debtor}} went bankrupt` : `{${d.debtor}} went bankrupt; assets go to {${creditor}}`);
  for (const i of ownedSpaces(n, d.debtor)) {
    // Buildings are sold back to the bank at half price; the deed moves on.
    const refund = ((n.buildings[i] ?? 0) * buildCost(i)) / 2;
    n.buildings[i] = 0;
    if (creditor !== null) {
      n.owners[i] = creditor;
      n.players[creditor]!.cash += refund;
    } else {
      n.owners[i] = null;
      n.mortgaged[i] = false;
    }
  }
  if (creditor !== null) {
    n.players[creditor]!.cash += debtor.cash;
    n.players[creditor]!.outCards += debtor.outCards;
  }
  debtor.cash = 0;
  debtor.outCards = 0;
  debtor.bankrupt = true;
  debtor.inLockUp = false;
  n.debt = null;
  const left = solventSeats(n);
  if (left.length === 1) {
    n.phase = 'over';
    n.winner = left[0]!;
    log(n, `{${left[0]}} is the last business standing`);
    return;
  }
  n.phase = 'manage';
  nextTurn(n);
}

function applyRoll(n: S, rng: Rng) {
  const seat = n.turn;
  const p = n.players[seat]!;
  const dice: [number, number] = [rng.int(1, 6), rng.int(1, 6)];
  n.dice = dice;
  event(n, 'roll');
  const doubles = dice[0] === dice[1];
  const total = dice[0] + dice[1];

  if (p.inLockUp) {
    n.rollAgain = false;
    if (doubles) {
      p.inLockUp = false;
      p.lockUpTurns = 0;
      log(n, `{${seat}} rolled doubles and leaves the Lock-up`);
      moveBy(n, seat, total);
      resolveLanding(n, seat);
      finishLanding(n);
      return;
    }
    p.lockUpTurns += 1;
    if (p.lockUpTurns >= 3) {
      p.inLockUp = false;
      p.lockUpTurns = 0;
      log(n, `{${seat}} failed a third escape roll and must pay bail of ${BAIL}`);
      if (!charge(n, seat, BAIL, null, 'move')) return;
      moveBy(n, seat, total);
      resolveLanding(n, seat);
      finishLanding(n);
      return;
    }
    log(n, `{${seat}} rolled ${dice[0]} and ${dice[1]} and stays in the Lock-up`);
    n.phase = 'manage';
    return;
  }

  if (doubles) {
    p.doubles += 1;
    if (p.doubles >= 3) {
      log(n, `{${seat}} rolled a third double in a row`);
      sendToLockUp(n, seat);
      n.phase = 'manage';
      return;
    }
    n.rollAgain = true;
  } else {
    n.rollAgain = false;
  }
  log(n, `{${seat}} rolled ${dice[0]} and ${dice[1]}${doubles ? ' (doubles)' : ''}`);
  moveBy(n, seat, total);
  resolveLanding(n, seat);
  finishLanding(n);
}

function shuffled(count: number, rng: Rng): number[] {
  const arr = Array.from({ length: count }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

// ------------------------------------------------------------------ engine

function legalMoves(s: S): M[] {
  if (s.phase === 'over') return [];
  const seat = s.turn;
  const p = s.players[seat]!;
  switch (s.phase) {
    case 'roll':
      return [{ type: 'roll' }, ...manageMoves(s, seat)];
    case 'lock_up': {
      const moves: M[] = [];
      if (p.cash >= BAIL) moves.push({ type: 'pay_bail' });
      if (p.outCards > 0) moves.push({ type: 'use_card' });
      moves.push({ type: 'roll' });
      return [...moves, ...manageMoves(s, seat)];
    }
    case 'buy': {
      const price = propertyAt(p.position)?.price ?? Infinity;
      const moves: M[] = [];
      if (p.cash >= price) moves.push({ type: 'buy' });
      moves.push({ type: 'auction' });
      return [...moves, ...manageMoves(s, seat)];
    }
    case 'auction': {
      const a = s.auction!;
      const cash = s.players[a.turn]!.cash;
      const moves: M[] = [];
      for (const inc of BID_INCREMENTS) if (a.high + inc <= cash) moves.push({ type: 'bid', amount: a.high + inc });
      moves.push({ type: 'pass_bid' });
      return moves;
    }
    case 'manage':
      return [{ type: 'end_turn' }, ...manageMoves(s, seat)];
    case 'debt': {
      const d = s.debt!;
      const moves: M[] = manageMoves(s, d.debtor).filter((m) => m.type === 'sell_building' || m.type === 'mortgage');
      const debtor = s.players[d.debtor]!;
      if (debtor.cash + raisableCash(s, d.debtor) < d.amount || moves.length === 0) moves.push({ type: 'declare_bankruptcy' });
      return moves;
    }
    case 'trade': {
      const t = s.pendingTrade!;
      const moves: M[] = [];
      if (s.players[t.to]!.cash >= t.get.cash && s.players[t.from]!.cash >= t.give.cash) moves.push({ type: 'accept_trade' });
      moves.push({ type: 'decline_trade' });
      return moves;
    }
  }
  return [];
}

function sameMove(a: M, b: M): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'bid':
      return a.amount === (b as typeof a).amount;
    case 'build':
    case 'sell_building':
    case 'mortgage':
    case 'unmortgage':
      return a.space === (b as typeof a).space;
    case 'propose_trade': {
      const o = b as typeof a;
      const same = (x: TradeOffer, y: TradeOffer) => x.cash === y.cash && x.spaces.length === y.spaces.length && x.spaces.every((v, i) => v === y.spaces[i]);
      return a.to === o.to && same(a.give, o.give) && same(a.get, o.get);
    }
    default:
      return true;
  }
}

function validateMove(s: S, m: M): boolean {
  if (m.type === 'propose_trade') return tradeError(s, m) === null;
  return legalMoves(s).some((x) => sameMove(x, m));
}

function parseOffer(raw: unknown): TradeOffer | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as { cash?: unknown; spaces?: unknown };
  if (!isInt(o.cash) || o.cash < 0 || o.cash > 1_000_000) return null;
  if (!Array.isArray(o.spaces) || o.spaces.length > 28) return null;
  const spaces: number[] = [];
  for (const v of o.spaces) {
    if (!isInt(v) || v < 0 || v >= BOARD_SIZE || spaces.includes(v)) return null;
    spaces.push(v);
  }
  return { cash: o.cash, spaces };
}

function parseMove(raw: unknown): M | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  switch (r.type) {
    case 'roll':
    case 'buy':
    case 'auction':
    case 'pass_bid':
    case 'pay_bail':
    case 'use_card':
    case 'end_turn':
    case 'accept_trade':
    case 'decline_trade':
    case 'declare_bankruptcy':
      return { type: r.type };
    case 'bid':
      return isInt(r.amount) && r.amount > 0 && r.amount <= 1_000_000 ? { type: 'bid', amount: r.amount } : null;
    case 'build':
    case 'sell_building':
    case 'mortgage':
    case 'unmortgage':
      return isInt(r.space) && r.space >= 0 && r.space < BOARD_SIZE ? { type: r.type, space: r.space } : null;
    case 'propose_trade': {
      if (!isInt(r.to) || r.to < 0 || r.to > 3) return null;
      const give = parseOffer(r.give);
      const get = parseOffer(r.get);
      return give && get ? { type: 'propose_trade', to: r.to, give, get } : null;
    }
    default:
      return null;
  }
}

function applyMove(s: S, m: M, rng: Rng): S {
  if (!validateMove(s, m)) throw new IllegalMoveError();
  const n = clone(s);
  const seat = n.turn;
  const p = n.players[seat]!;
  switch (m.type) {
    case 'roll':
      applyRoll(n, rng);
      break;
    case 'buy': {
      const sp = propertyAt(p.position)!;
      p.cash -= sp.price;
      n.owners[p.position] = seat;
      event(n, 'cash');
      log(n, `{${seat}} bought ${sp.name} for ${sp.price}`);
      n.phase = 'manage';
      finishLanding(n);
      break;
    }
    case 'auction': {
      const active = solventSeats(n);
      n.auction = { space: p.position, high: 0, bidder: null, active, turn: seat };
      n.phase = 'auction';
      log(n, `${spaceName(p.position)} goes to auction`);
      break;
    }
    case 'bid': {
      const a = n.auction!;
      a.high = m.amount;
      a.bidder = a.turn;
      log(n, `{${a.turn}} bid ${m.amount} for ${spaceName(a.space)}`);
      advanceAuction(n);
      break;
    }
    case 'pass_bid': {
      const a = n.auction!;
      a.active = a.active.filter((i) => i !== a.turn);
      advanceAuction(n);
      break;
    }
    case 'build': {
      const cost = buildCost(m.space);
      p.cash -= cost;
      n.buildings[m.space] = (n.buildings[m.space] ?? 0) + 1;
      event(n, 'build');
      log(n, `{${seat}} built ${n.buildings[m.space] === 5 ? 'a tower' : 'an office'} on ${spaceName(m.space)} for ${cost}`);
      break;
    }
    case 'sell_building': {
      const actor = n.debt ? n.debt.debtor : seat;
      const refund = buildCost(m.space) / 2;
      n.players[actor]!.cash += refund;
      n.buildings[m.space] = (n.buildings[m.space] ?? 0) - 1;
      event(n, 'cash');
      log(n, `{${actor}} sold a building on ${spaceName(m.space)} for ${refund}`);
      if (n.debt) settleDebt(n);
      break;
    }
    case 'mortgage': {
      const actor = n.debt ? n.debt.debtor : seat;
      const value = mortgageValue(m.space);
      n.players[actor]!.cash += value;
      n.mortgaged[m.space] = true;
      event(n, 'cash');
      log(n, `{${actor}} mortgaged ${spaceName(m.space)} for ${value}`);
      if (n.debt) settleDebt(n);
      break;
    }
    case 'unmortgage': {
      const cost = unmortgageCost(m.space);
      p.cash -= cost;
      n.mortgaged[m.space] = false;
      event(n, 'cash');
      log(n, `{${seat}} lifted the mortgage on ${spaceName(m.space)} for ${cost}`);
      break;
    }
    case 'pay_bail':
      p.cash -= BAIL;
      p.inLockUp = false;
      p.lockUpTurns = 0;
      event(n, 'cash');
      log(n, `{${seat}} paid ${BAIL} bail and leaves the Lock-up`);
      n.phase = 'roll';
      break;
    case 'use_card':
      p.outCards -= 1;
      p.inLockUp = false;
      p.lockUpTurns = 0;
      event(n, 'card');
      log(n, `{${seat}} used a card to leave the Lock-up`);
      n.phase = 'roll';
      break;
    case 'end_turn':
      nextTurn(n);
      break;
    case 'propose_trade': {
      n.pendingTrade = {
        from: seat,
        to: m.to,
        give: { cash: m.give.cash, spaces: m.give.spaces.slice() },
        get: { cash: m.get.cash, spaces: m.get.spaces.slice() },
        resume: n.phase as PendingTrade['resume'],
      };
      n.tradesThisTurn += 1;
      n.phase = 'trade';
      event(n, 'trade');
      log(n, `{${seat}} proposed a trade to {${m.to}}`);
      break;
    }
    case 'accept_trade': {
      const t = n.pendingTrade!;
      const from = n.players[t.from]!;
      const to = n.players[t.to]!;
      from.cash += t.get.cash - t.give.cash;
      to.cash += t.give.cash - t.get.cash;
      for (const i of t.give.spaces) n.owners[i] = t.to;
      for (const i of t.get.spaces) n.owners[i] = t.from;
      event(n, 'trade');
      event(n, 'cash');
      log(n, `{${t.to}} accepted the trade from {${t.from}}`);
      n.pendingTrade = null;
      n.phase = t.resume;
      break;
    }
    case 'decline_trade': {
      const t = n.pendingTrade!;
      log(n, `{${t.to}} declined the trade from {${t.from}}`);
      n.pendingTrade = null;
      n.phase = t.resume;
      break;
    }
    case 'declare_bankruptcy':
      declareBankruptcy(n);
      break;
  }
  return n;
}

function formatCredits(v: number): string {
  return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export const epicBusiness: GameEngine<EpicBusinessState, EpicBusinessMove> = {
  id: 'epic_business',
  init(playerCount, rng) {
    if (playerCount < 2 || playerCount > 4) throw new Error('Epic Business supports 2–4 players');
    return {
      phase: 'roll',
      players: Array.from({ length: playerCount }, () => ({ cash: STARTING_CASH, position: 0, inLockUp: false, lockUpTurns: 0, bankrupt: false, outCards: 0, doubles: 0 })),
      owners: Array<number | null>(BOARD_SIZE).fill(null),
      buildings: Array<number>(BOARD_SIZE).fill(0),
      mortgaged: Array<boolean>(BOARD_SIZE).fill(false),
      dice: null,
      rollAgain: false,
      auction: null,
      pendingTrade: null,
      debt: null,
      decks: { fortune: shuffled(FORTUNE_CARDS.length, rng), market: shuffled(MARKET_CARDS.length, rng) },
      round: 1,
      turn: 0,
      tradesThisTurn: 0,
      log: ['Everyone starts with 1,500 credits. {0} rolls first.'],
      lastCard: null,
      events: [],
      winner: null,
    };
  },
  currentPlayer(s) {
    if (s.phase === 'auction' && s.auction) return s.auction.turn;
    if (s.phase === 'trade' && s.pendingTrade) return s.pendingTrade.to;
    if (s.phase === 'debt' && s.debt) return s.debt.debtor;
    return s.turn;
  },
  legalMoves,
  applyMove,
  isTerminal: (s) => s.phase === 'over',
  winner: (s) => (s.phase === 'over' ? s.winner : null),
  parseMove,
  sameMove,
  validateMove,
  ai: {
    evaluate: (s, seat) => netWorth(s, seat) - Math.max(0, ...solventSeats(s).filter((i) => i !== seat).map((i) => netWorth(s, i))),
    depth: { easy: 1, medium: 1, hard: 1, impossible: 1 },
    choose: chooseEpicBusinessMove,
  },
  summary(s) {
    if (s.phase !== 'over') return null;
    if (s.winner === null || s.winner === DRAW) return 'A draw on net worth';
    return `Won with a net worth of ${formatCredits(netWorth(s, s.winner))} credits`;
  },
};

// ---------------------------------------------------------------------- AI

const RESERVE: Record<AIDifficulty, number> = { easy: 0, medium: 200, hard: 150, impossible: 150 };
const FAVOURED_GROUPS: readonly GroupId[] = ['orange', 'red', 'yellow'];

/** How much `seat` thinks `space` is worth, relative to its price. */
function aiValue(s: S, seat: number, space: number, difficulty: AIDifficulty): number {
  const sp = propertyAt(space);
  if (!sp) return 0;
  const smart = difficulty === 'hard' || difficulty === 'impossible';
  let factor = 1;
  if (sp.type === 'district') {
    const group = GROUP_SPACES[sp.group];
    const mine = group.filter((i) => s.owners[i] === seat).length;
    const rivals = group.filter((i) => s.owners[i] !== null && s.owners[i] !== seat).length;
    if (mine === group.length - 1) factor += smart ? 1.0 : 0.5; // completes a group
    else if (mine > 0 && rivals === 0) factor += 0.3;
    if (rivals > 0 && !smart) factor -= 0.1;
    if (rivals > 0 && smart) factor += 0.15; // blocking has value too
    if (smart && FAVOURED_GROUPS.includes(sp.group)) factor += 0.2;
  } else if (sp.type === 'hub') {
    factor += smart ? 0.2 + 0.2 * hubsOwned(s, seat) : 0.1;
  } else {
    factor -= smart ? 0.2 : 0;
    if (utilitiesOwned(s, seat) === 1) factor += 0.3;
  }
  return sp.price * factor;
}

function completesGroupFor(s: S, seat: number, space: number): boolean {
  const g = groupOf(space);
  if (!g) return false;
  const group = GROUP_SPACES[g];
  return group.filter((i) => s.owners[i] === seat).length === group.length - 1 && s.owners[space] !== seat;
}

/** Cheapest-first ordering for liquidation: least valuable buildings / properties go first. */
function liquidationOrder(s: S, seat: number, moves: M[]): M[] {
  const score = (m: M): number => {
    if (m.type === 'sell_building') return buildCost(m.space);
    if (m.type === 'mortgage') {
      const g = groupOf(m.space);
      // Keep complete groups (and hubs) as long as possible.
      const penalty = g && ownsGroup(s, seat, g) ? 500 : propertyAt(m.space)?.type === 'hub' ? 100 : 0;
      return 1000 + mortgageValue(m.space) + penalty;
    }
    return 1e9;
  };
  return moves.slice().sort((a, b) => score(a) - score(b));
}

function pickBuild(s: S, seat: number, difficulty: AIDifficulty, legal: M[]): M | null {
  const builds = legal.filter((m): m is Extract<M, { type: 'build' }> => m.type === 'build');
  if (builds.length === 0) return null;
  const cash = s.players[seat]!.cash;
  const reserve = RESERVE[difficulty] + (difficulty === 'easy' ? 0 : 100);
  // Prefer the group with the highest rent jump per credit; among its districts the least built.
  const ranked = builds
    .filter((m) => cash - buildCost(m.space) >= reserve)
    .sort((a, b) => {
      const ra = (propertyAt(a.space) as { rent: number[] }).rent;
      const rb = (propertyAt(b.space) as { rent: number[] }).rent;
      const ga = (ra[(s.buildings[a.space] ?? 0) + 1]! - ra[s.buildings[a.space] ?? 0]!) / buildCost(a.space);
      const gb = (rb[(s.buildings[b.space] ?? 0) + 1]! - rb[s.buildings[b.space] ?? 0]!) / buildCost(b.space);
      return gb - ga;
    });
  return ranked[0] ?? null;
}

function proposeAiTrade(s: S, seat: number, difficulty: AIDifficulty, rng: Rng): M | null {
  if (difficulty !== 'hard' && difficulty !== 'impossible') return null;
  if (s.tradesThisTurn > 0 || rng.next() > 0.12) return null;
  const me = s.players[seat]!;
  for (const g of COLOUR_GROUPS) {
    const group = GROUP_SPACES[g.id];
    const missing = group.filter((i) => s.owners[i] !== seat);
    if (missing.length !== 1) continue;
    const target = missing[0]!;
    const owner = s.owners[target];
    if (owner === null || owner === undefined || s.players[owner]!.bankrupt) continue;
    const sp = propertyAt(target)!;
    // A fair-ish offer: 1.6× price in cash, rounded to tens, within our means.
    const cash = Math.round((sp.price * 1.6) / 10) * 10;
    if (me.cash - cash < RESERVE[difficulty] + 200) continue;
    const m: M = { type: 'propose_trade', to: owner, give: { cash, spaces: [] }, get: { cash: 0, spaces: [target] } };
    if (tradeError(s, m) === null) return m;
  }
  return null;
}

function evaluateTrade(s: S, seat: number, t: PendingTrade, difficulty: AIDifficulty): boolean {
  // From the recipient's view: we receive `give`, we hand over `get`.
  const value = (offer: TradeOffer, receiving: boolean) => {
    let v = offer.cash;
    for (const i of offer.spaces) {
      const sp = propertyAt(i)!;
      const other = receiving ? t.from : seat;
      let f = 1;
      if (receiving && completesGroupFor(s, seat, i)) f += 1;
      if (!receiving && completesGroupFor(s, other, i)) f += 0.8; // do not hand rivals a monopoly cheaply
      if (!receiving && groupOf(i) && ownsGroup(s, seat, groupOf(i)!)) f += 1;
      if (s.mortgaged[i]) f *= 0.45;
      v += sp.price * f;
    }
    return v;
  };
  const margin: Record<AIDifficulty, number> = { easy: 1.0, medium: 1.05, hard: 1.1, impossible: 1.15 };
  return value(t.give, true) > value(t.get, false) * margin[difficulty];
}

export function chooseEpicBusinessMove(s: S, difficulty: AIDifficulty, rng: Rng): M {
  const legal = legalMoves(s);
  const fallback = (): M => legal.find((m) => m.type === 'end_turn' || m.type === 'roll' || m.type === 'pass_bid' || m.type === 'decline_trade' || m.type === 'auction') ?? legal[0]!;
  const seat = epicBusiness.currentPlayer(s);
  const me = s.players[seat]!;
  const smart = difficulty === 'hard' || difficulty === 'impossible';
  let choice: M | null = null;

  switch (s.phase) {
    case 'roll':
    case 'manage': {
      choice = pickBuild(s, seat, difficulty, legal);
      if (!choice && smart) {
        // Lift mortgages on complete groups when flush.
        const un = legal.filter((m): m is Extract<M, { type: 'unmortgage' }> => m.type === 'unmortgage');
        const target = un.find((m) => me.cash - unmortgageCost(m.space) >= RESERVE[difficulty] + 300 && (groupOf(m.space) ? ownsGroup(s, seat, groupOf(m.space)!) : true));
        if (target) choice = target;
      }
      if (!choice) choice = proposeAiTrade(s, seat, difficulty, rng);
      if (!choice) choice = legal.find((m) => m.type === (s.phase === 'roll' ? 'roll' : 'end_turn')) ?? null;
      break;
    }
    case 'lock_up': {
      const hasCard = legal.some((m) => m.type === 'use_card');
      const canPay = legal.some((m) => m.type === 'pay_bail');
      // Early on it pays to be out buying; late game the Lock-up is a safe harbour.
      const propertiesLeft = s.owners.filter((o, i) => o === null && propertyAt(i)).length;
      const wantOut = difficulty === 'easy' ? rng.next() < 0.5 : propertiesLeft > 6 || me.lockUpTurns >= 2;
      if (hasCard && wantOut) choice = { type: 'use_card' };
      else if (canPay && wantOut && me.cash - BAIL >= RESERVE[difficulty]) choice = { type: 'pay_bail' };
      else choice = { type: 'roll' };
      break;
    }
    case 'buy': {
      const space = me.position;
      const sp = propertyAt(space)!;
      const canBuy = legal.some((m) => m.type === 'buy');
      let buy = false;
      if (canBuy) {
        if (difficulty === 'easy') buy = rng.next() < 0.5;
        else if (difficulty === 'medium') buy = me.cash - sp.price >= RESERVE.medium;
        else buy = me.cash - sp.price >= RESERVE[difficulty] || aiValue(s, seat, space, difficulty) >= sp.price * 1.5;
      }
      choice = buy ? { type: 'buy' } : { type: 'auction' };
      break;
    }
    case 'auction': {
      const a = s.auction!;
      const base = aiValue(s, seat, a.space, difficulty);
      const fraction = difficulty === 'easy' ? 0.6 : difficulty === 'medium' ? 0.8 : completesGroupFor(s, seat, a.space) ? 1.1 : 0.95;
      const max = Math.min(base * fraction, me.cash - (smart ? RESERVE[difficulty] / 2 : 0));
      const bids = legal.filter((m): m is Extract<M, { type: 'bid' }> => m.type === 'bid' && m.amount <= max);
      // Hard bidders jump in bigger steps when far from their ceiling.
      const pick = smart ? bids.filter((b) => max - b.amount >= 0).sort((x, y) => y.amount - x.amount)[0] : bids[0];
      choice = pick ?? { type: 'pass_bid' };
      break;
    }
    case 'debt': {
      const bankrupt = legal.find((m) => m.type === 'declare_bankruptcy');
      const others = legal.filter((m) => m.type !== 'declare_bankruptcy');
      choice = others.length > 0 ? liquidationOrder(s, seat, others)[0]! : bankrupt ?? null;
      break;
    }
    case 'trade': {
      const t = s.pendingTrade!;
      const accept = legal.some((m) => m.type === 'accept_trade') && evaluateTrade(s, seat, t, difficulty);
      choice = { type: accept ? 'accept_trade' : 'decline_trade' };
      break;
    }
    case 'over':
      break;
  }
  return choice && validateMove(s, choice) ? choice : fallback();
}
