import { describe, expect, it } from 'vitest';
import { chooseMove, type AIDifficulty } from '../src/ai';
import {
  BAIL,
  BOARD_SPACES,
  COLOUR_GROUPS,
  epicBusiness,
  FORTUNE_CARDS,
  GROUP_SPACES,
  MARKET_CARDS,
  MAX_ROUNDS,
  netWorth,
  STARTING_CASH,
  type EpicBusinessMove,
  type EpicBusinessState,
} from '../src/games/epic-business';
import { IllegalMoveError } from '../src/games/types';
import { createRng, type Rng } from '../src/rng';

/** Smallest seed whose first two rng.int(1, 6) calls give exactly these dice. */
function seedFor(d1: number, d2: number): number {
  for (let seed = 1; seed < 100_000; seed++) {
    const rng = createRng(seed);
    if (rng.int(1, 6) === d1 && rng.int(1, 6) === d2) return seed;
  }
  throw new Error('no seed');
}

const roll = (s: EpicBusinessState, d1: number, d2: number) => epicBusiness.applyMove(s, { type: 'roll' }, createRng(seedFor(d1, d2)));
const apply = (s: EpicBusinessState, m: EpicBusinessMove, rng: Rng = createRng(1)) => epicBusiness.applyMove(s, m, rng);
const fresh = (players = 2) => epicBusiness.init(players, createRng(7));

describe('epic business board data', () => {
  it('has 40 spaces and 22 districts in 8 colour groups', () => {
    expect(BOARD_SPACES).toHaveLength(40);
    const districts = BOARD_SPACES.filter((sp) => sp.type === 'district');
    expect(districts).toHaveLength(22);
    expect(COLOUR_GROUPS).toHaveLength(8);
    expect(COLOUR_GROUPS.map((g) => GROUP_SPACES[g.id].length)).toEqual([2, 3, 3, 3, 3, 3, 3, 2]);
    expect(BOARD_SPACES.filter((sp) => sp.type === 'hub')).toHaveLength(4);
    expect(BOARD_SPACES.filter((sp) => sp.type === 'utility')).toHaveLength(2);
    expect(BOARD_SPACES.filter((sp) => sp.type === 'fortune')).toHaveLength(3);
    expect(BOARD_SPACES.filter((sp) => sp.type === 'market')).toHaveLength(3);
    expect(FORTUNE_CARDS.length).toBeGreaterThanOrEqual(16);
    expect(MARKET_CARDS.length).toBeGreaterThanOrEqual(16);
  });
});

describe('epic business rules', () => {
  it('starts everyone with 1,500 and pays 200 for passing Payday', () => {
    const s = fresh();
    expect(s.players.every((p) => p.cash === STARTING_CASH)).toBe(true);
    s.players[0]!.position = 38;
    const n = roll(s, 1, 2); // lands on Tannery Lane (unowned) after passing Payday
    expect(n.players[0]!.position).toBe(1);
    expect(n.players[0]!.cash).toBe(STARTING_CASH + 200);
    expect(n.phase).toBe('buy');
  });

  it('buys a property and pays rent with the colour-group bonus', () => {
    let s = fresh();
    s.players[0]!.position = 38;
    s = roll(s, 1, 2);
    s = apply(s, { type: 'buy' });
    expect(s.owners[1]).toBe(0);
    expect(s.players[0]!.cash).toBe(STARTING_CASH + 200 - 60);
    expect(s.phase).toBe('manage');
    s = apply(s, { type: 'end_turn' });
    expect(s.turn).toBe(1);

    // Seat 1 lands on it: base rent 2.
    s.players[1]!.position = 38;
    let t = roll(s, 1, 2);
    expect(t.players[1]!.cash).toBe(STARTING_CASH + 200 - 2);
    expect(t.players[0]!.cash).toBe(STARTING_CASH + 200 - 60 + 2);

    // With the whole group owned the base rent doubles.
    s.owners[3] = 0;
    t = roll(s, 1, 2);
    expect(t.players[1]!.cash).toBe(STARTING_CASH + 200 - 4);
    expect(t.log.at(-1)).toContain('paid 4 rent');
  });

  it('charges hub rent by hubs owned and utility rent by dice', () => {
    const s = fresh();
    s.owners[5] = 1;
    s.owners[15] = 1;
    s.players[0]!.position = 2;
    let t = roll(s, 1, 2); // → 5, North Transit Hub, 2 hubs → 50
    expect(t.players[0]!.cash).toBe(STARTING_CASH - 50);
    s.owners[12] = 1;
    s.players[0]!.position = 9;
    t = roll(s, 1, 2); // → 12, Power Grid, one utility → 4 × 3
    expect(t.players[0]!.cash).toBe(STARTING_CASH - 12);
  });

  it('enforces even building up to a tower and even selling', () => {
    let s = fresh();
    s.owners[1] = 0;
    s.owners[3] = 0;
    s.phase = 'manage';
    const builds = () => epicBusiness.legalMoves(s).filter((m) => m.type === 'build').map((m) => (m as { space: number }).space);
    expect(builds()).toEqual([1, 3]);
    s = apply(s, { type: 'build', space: 1 });
    expect(s.players[0]!.cash).toBe(STARTING_CASH - 50);
    expect(builds()).toEqual([3]); // even-build: Cobble Yard must catch up
    expect(() => apply(s, { type: 'build', space: 1 })).toThrow(IllegalMoveError);
    for (const space of [3, 1, 3, 1, 3, 1, 3, 1, 3]) s = apply(s, { type: 'build', space });
    expect(s.buildings[1]).toBe(5);
    expect(s.buildings[3]).toBe(5);
    expect(builds()).toEqual([]);
    expect(s.log.at(-1)).toContain('tower');
    // Rent with a tower.
    s.players[1]!.position = 38;
    s.turn = 1;
    s.phase = 'roll';
    const t = roll(s, 1, 2);
    expect(t.players[1]!.cash).toBe(STARTING_CASH + 200 - 250);
    s.turn = 0;
    s.phase = 'manage';
    // Selling: half price back, evenly.
    s = apply(s, { type: 'sell_building', space: 1 });
    expect(s.buildings[1]).toBe(4);
    expect(epicBusiness.legalMoves(s).some((m) => m.type === 'sell_building' && m.space === 1)).toBe(false);
    expect(epicBusiness.legalMoves(s).some((m) => m.type === 'sell_building' && m.space === 3)).toBe(true);
    // Cannot mortgage while buildings stand in the group.
    expect(epicBusiness.legalMoves(s).some((m) => m.type === 'mortgage')).toBe(false);
  });

  it('mortgages for half price and charges 10 % interest to lift it', () => {
    let s = fresh();
    s.owners[39] = 0; // Summit Park, 400
    s.phase = 'manage';
    s = apply(s, { type: 'mortgage', space: 39 });
    expect(s.mortgaged[39]).toBe(true);
    expect(s.players[0]!.cash).toBe(STARTING_CASH + 200);
    // No rent while mortgaged.
    s.players[1]!.position = 36;
    s.turn = 1;
    s.phase = 'roll';
    const t = roll(s, 1, 2);
    expect(t.players[1]!.cash).toBe(STARTING_CASH);
    s.turn = 0;
    s.phase = 'manage';
    s = apply(s, { type: 'unmortgage', space: 39 });
    expect(s.mortgaged[39]).toBe(false);
    expect(s.players[0]!.cash).toBe(STARTING_CASH + 200 - 220);
  });

  it('sends a third double to the Lock-up and offers every exit', () => {
    let s = fresh();
    s.players[0]!.doubles = 2;
    s = roll(s, 4, 4);
    expect(s.players[0]!.inLockUp).toBe(true);
    expect(s.players[0]!.position).toBe(10);
    expect(s.phase).toBe('manage');
    s = apply(s, { type: 'end_turn' });
    s.phase = 'manage'; // skip seat 1's roll
    s = apply(s, { type: 'end_turn' });
    expect(s.turn).toBe(0);
    expect(s.phase).toBe('lock_up');
    s.players[0]!.outCards = 1;
    const types = epicBusiness.legalMoves(s).map((m) => m.type);
    expect(types).toEqual(expect.arrayContaining(['pay_bail', 'use_card', 'roll']));

    // Pay bail.
    const paid = apply(s, { type: 'pay_bail' });
    expect(paid.players[0]!.inLockUp).toBe(false);
    expect(paid.players[0]!.cash).toBe(STARTING_CASH - BAIL);
    expect(paid.phase).toBe('roll');

    // Use the card.
    const card = apply(s, { type: 'use_card' });
    expect(card.players[0]!.outCards).toBe(0);
    expect(card.players[0]!.inLockUp).toBe(false);

    // Doubles roll out and move, but no extra roll.
    const out = roll(s, 2, 2);
    expect(out.players[0]!.inLockUp).toBe(false);
    expect(out.players[0]!.position).toBe(14);
    expect(out.phase).toBe('buy');
    const afterBuy = apply(out, { type: 'auction' });
    expect(afterBuy.phase).toBe('auction');

    // Failing stays put; the third failure forces bail and moves.
    s.players[0]!.lockUpTurns = 2;
    const forced = roll(s, 1, 3);
    expect(forced.players[0]!.inLockUp).toBe(false);
    expect(forced.players[0]!.cash).toBe(STARTING_CASH - BAIL);
    expect(forced.players[0]!.position).toBe(14);
    s.players[0]!.lockUpTurns = 0;
    const stay = roll(s, 1, 3);
    expect(stay.players[0]!.inLockUp).toBe(true);
    expect(stay.players[0]!.lockUpTurns).toBe(1);
    expect(stay.phase).toBe('manage');
  });

  it('runs an auction with fixed increments to the right winner and price', () => {
    let s = fresh(3);
    s.players[0]!.position = 38;
    s = roll(s, 1, 2);
    s = apply(s, { type: 'auction' });
    expect(s.phase).toBe('auction');
    expect(epicBusiness.currentPlayer(s)).toBe(0);
    expect(epicBusiness.legalMoves(s)).toEqual([{ type: 'bid', amount: 10 }, { type: 'bid', amount: 50 }, { type: 'bid', amount: 100 }, { type: 'pass_bid' }]);
    s = apply(s, { type: 'bid', amount: 10 });
    expect(epicBusiness.currentPlayer(s)).toBe(1);
    s = apply(s, { type: 'bid', amount: 60 });
    expect(epicBusiness.currentPlayer(s)).toBe(2);
    expect(() => apply(s, { type: 'bid', amount: 61 })).toThrow(IllegalMoveError);
    s = apply(s, { type: 'pass_bid' });
    expect(epicBusiness.currentPlayer(s)).toBe(0);
    s = apply(s, { type: 'pass_bid' });
    expect(s.phase).toBe('manage');
    expect(s.owners[1]).toBe(1);
    expect(s.players[1]!.cash).toBe(STARTING_CASH - 60);
    expect(s.players[0]!.cash).toBe(STARTING_CASH + 200);
  });

  it('leaves the property unowned when everyone passes', () => {
    let s = fresh(2);
    s.players[0]!.position = 38;
    s = roll(s, 1, 2);
    s = apply(s, { type: 'auction' });
    s = apply(s, { type: 'pass_bid' });
    s = apply(s, { type: 'pass_bid' });
    expect(s.owners[1]).toBeNull();
    expect(s.phase).toBe('manage');
  });

  it('enters the debt phase and bankruptcy hands assets to the creditor', () => {
    let s = fresh(2);
    s.owners[39] = 1;
    s.buildings[39] = 5; // rent 2000
    s.owners[6] = 0;
    s.players[0]!.cash = 10;
    s.players[0]!.position = 36;
    s = roll(s, 1, 2);
    expect(s.phase).toBe('debt');
    expect(epicBusiness.currentPlayer(s)).toBe(0);
    expect(s.debt).toMatchObject({ debtor: 0, amount: 2000, creditor: 1 });
    const types = epicBusiness.legalMoves(s).map((m) => m.type);
    expect(types).toContain('mortgage');
    expect(types).toContain('declare_bankruptcy');
    s = apply(s, { type: 'declare_bankruptcy' });
    expect(s.players[0]!.bankrupt).toBe(true);
    expect(s.owners[6]).toBe(1);
    expect(s.players[1]!.cash).toBe(STARTING_CASH + 10);
    expect(s.phase).toBe('over');
    expect(epicBusiness.winner(s)).toBe(1);
    expect(epicBusiness.summary!(s)).toMatch(/^Won with a net worth of [\d,]+ credits$/);
  });

  it('settles a debt by mortgaging and refuses bankruptcy while assets can cover it', () => {
    let s = fresh(3);
    s.owners[39] = 1;
    s.owners[6] = 0; // mortgage value 50
    s.players[0]!.cash = 20;
    s.players[0]!.position = 36;
    s = roll(s, 1, 2); // rent 50 on Summit Park
    expect(s.phase).toBe('debt');
    expect(epicBusiness.legalMoves(s).map((m) => m.type)).not.toContain('declare_bankruptcy');
    s = apply(s, { type: 'mortgage', space: 6 });
    expect(s.debt).toBeNull();
    expect(s.phase).toBe('manage');
    expect(s.players[0]!.cash).toBe(20);
    expect(s.players[1]!.cash).toBe(STARTING_CASH + 50);
  });

  it('proposes, accepts and rejects trades', () => {
    let s = fresh(3);
    s.owners[1] = 0;
    s.owners[3] = 1;
    const offer: EpicBusinessMove = { type: 'propose_trade', to: 1, give: { cash: 100, spaces: [1] }, get: { cash: 0, spaces: [3] } };
    expect(epicBusiness.legalMoves(s).some((m) => m.type === 'propose_trade')).toBe(false);
    expect(epicBusiness.validateMove!(s, offer)).toBe(true);
    s = apply(s, offer);
    expect(s.phase).toBe('trade');
    expect(epicBusiness.currentPlayer(s)).toBe(1);
    s = apply(s, { type: 'accept_trade' });
    expect(s.owners[1]).toBe(1);
    expect(s.owners[3]).toBe(0);
    expect(s.players[0]!.cash).toBe(STARTING_CASH - 100);
    expect(s.players[1]!.cash).toBe(STARTING_CASH + 100);
    expect(s.phase).toBe('roll');
    expect(s.turn).toBe(0);

    // Decline returns to the proposer's phase untouched.
    const declined = apply(apply(s, { type: 'propose_trade', to: 2, give: { cash: 50, spaces: [] }, get: { cash: 0, spaces: [] } }), { type: 'decline_trade' });
    expect(declined.players[0]!.cash).toBe(STARTING_CASH - 100);
    expect(declined.phase).toBe('roll');

    const bad: EpicBusinessMove[] = [
      { type: 'propose_trade', to: 0, give: { cash: 0, spaces: [3] }, get: { cash: 0, spaces: [] } }, // self
      { type: 'propose_trade', to: 1, give: { cash: 0, spaces: [1] }, get: { cash: 0, spaces: [] } }, // not mine any more
      { type: 'propose_trade', to: 1, give: { cash: 0, spaces: [] }, get: { cash: 0, spaces: [3] } }, // theirs is actually mine
      { type: 'propose_trade', to: 1, give: { cash: 5000, spaces: [] }, get: { cash: 0, spaces: [] } }, // too much cash
      { type: 'propose_trade', to: 1, give: { cash: 0, spaces: [] }, get: { cash: 0, spaces: [] } }, // empty
      { type: 'propose_trade', to: 1, give: { cash: 0, spaces: [3, 3] }, get: { cash: 0, spaces: [] } }, // duplicates
      { type: 'propose_trade', to: 1, give: { cash: 0, spaces: [0] }, get: { cash: 0, spaces: [] } }, // not a property
    ];
    for (const m of bad) {
      expect(epicBusiness.validateMove!(s, m)).toBe(false);
      expect(() => apply(s, m)).toThrow(IllegalMoveError);
    }
    // No trades while buildings stand in the group.
    s.buildings[3] = 1;
    expect(epicBusiness.validateMove!(s, { type: 'propose_trade', to: 1, give: { cash: 0, spaces: [3] }, get: { cash: 0, spaces: [] } })).toBe(false);
  });

  it('parseMove rejects garbage and accepts well-formed moves', () => {
    const bad = [
      null,
      42,
      'roll',
      {},
      { type: 'fly' },
      { type: 'bid' },
      { type: 'bid', amount: '10' },
      { type: 'bid', amount: 10.5 },
      { type: 'bid', amount: -10 },
      { type: 'build', space: 40 },
      { type: 'mortgage', space: -1 },
      { type: 'propose_trade', to: 4, give: { cash: 0, spaces: [] }, get: { cash: 0, spaces: [] } },
      { type: 'propose_trade', to: 1, give: { cash: -1, spaces: [] }, get: { cash: 0, spaces: [] } },
      { type: 'propose_trade', to: 1, give: { cash: 0, spaces: [1, 1] }, get: { cash: 0, spaces: [] } },
      { type: 'propose_trade', to: 1, give: { cash: 0, spaces: Array.from({ length: 29 }, (_, i) => i) }, get: { cash: 0, spaces: [] } },
      { type: 'propose_trade', to: 1, give: { cash: 0, spaces: ['1'] }, get: { cash: 0, spaces: [] } },
      { type: 'propose_trade', to: 1, give: { cash: 0 }, get: { cash: 0, spaces: [] } },
    ];
    for (const raw of bad) expect(epicBusiness.parseMove(raw)).toBeNull();
    expect(epicBusiness.parseMove({ type: 'roll', extra: 1 })).toEqual({ type: 'roll' });
    expect(epicBusiness.parseMove({ type: 'bid', amount: 60 })).toEqual({ type: 'bid', amount: 60 });
    expect(epicBusiness.parseMove({ type: 'build', space: 39 })).toEqual({ type: 'build', space: 39 });
    expect(epicBusiness.parseMove({ type: 'propose_trade', to: 1, give: { cash: 10, spaces: [1] }, get: { cash: 0, spaces: [3, 6] } })).toEqual({
      type: 'propose_trade',
      to: 1,
      give: { cash: 10, spaces: [1] },
      get: { cash: 0, spaces: [3, 6] },
    });
  });

  it('ends after MAX_ROUNDS with the richest net worth winning', () => {
    let s = fresh(3);
    s.round = MAX_ROUNDS;
    s.turn = 2;
    s.phase = 'manage';
    s.owners[39] = 1;
    s = apply(s, { type: 'end_turn' });
    expect(s.phase).toBe('over');
    expect(epicBusiness.winner(s)).toBe(1);
    expect(netWorth(s, 1)).toBe(STARTING_CASH + 400);
    expect(epicBusiness.legalMoves(s)).toEqual([]);
  });

  it('draws cards from a shuffled, cycling deck and applies them', () => {
    const s = fresh(2);
    s.decks.market = [1, ...s.decks.market.filter((i) => i !== 1)]; // "refund ... Collect 200"
    s.players[0]!.position = 39;
    const t = roll(s, 1, 2); // → 2, Market
    expect(t.lastCard).toEqual({ deck: 'market', index: 1 });
    expect(t.players[0]!.cash).toBe(STARTING_CASH + 200 + 200);
    expect(t.decks.market.at(-1)).toBe(1);
    expect(t.events).toContain('card');
  });
});

describe('epic business AI', () => {
  it('plays 20 full games with mixed difficulties without an invalid move', () => {
    const difficulties: AIDifficulty[] = ['easy', 'medium', 'hard', 'impossible'];
    for (let game = 0; game < 20; game++) {
      const rng = createRng(1000 + game);
      let s = epicBusiness.init(4, rng);
      let moves = 0;
      while (!epicBusiness.isTerminal(s)) {
        const seat = epicBusiness.currentPlayer(s);
        const difficulty = difficulties[(seat + game) % 4]!;
        const move = chooseMove(epicBusiness, s, difficulty, rng);
        if (!epicBusiness.validateMove!(s, move)) throw new Error(`game ${game}: AI chose invalid move ${JSON.stringify(move)} in phase ${s.phase}`);
        s = epicBusiness.applyMove(s, move, rng);
        for (const p of s.players) if (p.cash < 0) throw new Error(`game ${game}: negative cash`);
        if (++moves > 50_000) throw new Error(`game ${game}: did not finish`);
      }
      expect(epicBusiness.legalMoves(s)).toEqual([]);
      expect(JSON.parse(JSON.stringify(s))).toEqual(s); // plain JSON state
      const w = epicBusiness.winner(s);
      expect(w === -1 || (w !== null && w >= 0 && w < 4)).toBe(true);
    }
  });
});
