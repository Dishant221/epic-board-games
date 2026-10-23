// Board, colour groups and card decks for Epic Business. All names and card
// text are original; only the classic price/rent numbers are reused (numbers
// are not protectable).

export type GroupId = 'brown' | 'sky' | 'pink' | 'orange' | 'red' | 'yellow' | 'green' | 'blue';

export interface ColourGroup {
  id: GroupId;
  name: string;
  /** CSS colour used for the band on the board and the deed card. */
  color: string;
  /** Cost of one office (and of the tower) on any district in this group. */
  buildCost: number;
}

export const COLOUR_GROUPS: readonly ColourGroup[] = [
  { id: 'brown', name: 'Old Quarter', color: '#8b5a2b', buildCost: 50 },
  { id: 'sky', name: 'Waterfront', color: '#7dd3fc', buildCost: 50 },
  { id: 'pink', name: 'Market District', color: '#f472b6', buildCost: 100 },
  { id: 'orange', name: 'Foundry District', color: '#fb923c', buildCost: 100 },
  { id: 'red', name: 'Theatre District', color: '#ef4444', buildCost: 150 },
  { id: 'yellow', name: 'Tech Park', color: '#facc15', buildCost: 150 },
  { id: 'green', name: 'Financial District', color: '#22c55e', buildCost: 200 },
  { id: 'blue', name: 'Skyline', color: '#3b82f6', buildCost: 200 },
];

export const GROUP_BY_ID: Readonly<Record<GroupId, ColourGroup>> = Object.fromEntries(COLOUR_GROUPS.map((g) => [g.id, g])) as Record<GroupId, ColourGroup>;

export type SpaceType =
  | 'payday'
  | 'district'
  | 'hub'
  | 'utility'
  | 'fortune'
  | 'market'
  | 'levy'
  | 'lock_up'
  | 'go_to_lock_up'
  | 'rest';

export interface DistrictSpace {
  type: 'district';
  name: string;
  group: GroupId;
  price: number;
  /** Rent with 0..4 offices, then with a tower (index 5). */
  rent: [number, number, number, number, number, number];
}
export interface HubSpace {
  type: 'hub';
  name: string;
  price: number;
}
export interface UtilitySpace {
  type: 'utility';
  name: string;
  price: number;
}
export interface LevySpace {
  type: 'levy';
  name: string;
  amount: number;
}
export interface PlainSpace {
  type: 'payday' | 'fortune' | 'market' | 'lock_up' | 'go_to_lock_up' | 'rest';
  name: string;
}
export type BoardSpace = DistrictSpace | HubSpace | UtilitySpace | LevySpace | PlainSpace;
export type PropertySpace = DistrictSpace | HubSpace | UtilitySpace;

export const BOARD_SIZE = 40;
export const PAYDAY_SPACE = 0;
export const LOCK_UP_SPACE = 10;
export const HUB_PRICE = 200;
export const UTILITY_PRICE = 150;

const d = (name: string, group: GroupId, price: number, rent: DistrictSpace['rent']): DistrictSpace => ({ type: 'district', name, group, price, rent });
const hub = (name: string): HubSpace => ({ type: 'hub', name, price: HUB_PRICE });

export const BOARD_SPACES: readonly BoardSpace[] = [
  { type: 'payday', name: 'Payday' },
  d('Tannery Lane', 'brown', 60, [2, 10, 30, 90, 160, 250]),
  { type: 'market', name: 'Market' },
  d('Cobble Yard', 'brown', 60, [4, 20, 60, 180, 320, 450]),
  { type: 'levy', name: 'Income Levy', amount: 200 },
  hub('North Transit Hub'),
  d('Harbour Row', 'sky', 100, [6, 30, 90, 270, 400, 550]),
  { type: 'fortune', name: 'Fortune' },
  d('Ferry Landing', 'sky', 100, [6, 30, 90, 270, 400, 550]),
  d('Lighthouse Walk', 'sky', 120, [8, 40, 100, 300, 450, 600]),
  { type: 'lock_up', name: 'Lock-up' },
  d('Guild Street', 'pink', 140, [10, 50, 150, 450, 625, 750]),
  { type: 'utility', name: 'Power Grid', price: UTILITY_PRICE },
  d('Spice Market Square', 'pink', 140, [10, 50, 150, 450, 625, 750]),
  d('Clocktower Court', 'pink', 160, [12, 60, 180, 500, 700, 900]),
  hub('East Transit Hub'),
  d('Foundry Street', 'orange', 180, [14, 70, 200, 550, 750, 950]),
  { type: 'market', name: 'Market' },
  d('Railyard Terrace', 'orange', 180, [14, 70, 200, 550, 750, 950]),
  d('Steamworks Avenue', 'orange', 200, [16, 80, 220, 600, 800, 1000]),
  { type: 'rest', name: 'Rest Stop' },
  d('Theatre Row', 'red', 220, [18, 90, 250, 700, 875, 1050]),
  { type: 'fortune', name: 'Fortune' },
  d('Grand Parade', 'red', 220, [18, 90, 250, 700, 875, 1050]),
  d('Opera Crescent', 'red', 240, [20, 100, 300, 750, 925, 1100]),
  hub('South Transit Hub'),
  d('Silicon Heights', 'yellow', 260, [22, 110, 330, 800, 975, 1150]),
  d('Innovation Drive', 'yellow', 260, [22, 110, 330, 800, 975, 1150]),
  { type: 'utility', name: 'Water Works', price: UTILITY_PRICE },
  d('Quantum Boulevard', 'yellow', 280, [24, 120, 360, 850, 1025, 1200]),
  { type: 'go_to_lock_up', name: 'Go To Lock-up' },
  d('Ledger Lane', 'green', 300, [26, 130, 390, 900, 1100, 1275]),
  d('Exchange Plaza', 'green', 300, [26, 130, 390, 900, 1100, 1275]),
  { type: 'market', name: 'Market' },
  d('Vault Street', 'green', 320, [28, 150, 450, 1000, 1200, 1400]),
  hub('West Transit Hub'),
  { type: 'fortune', name: 'Fortune' },
  d('Skyline Terrace', 'blue', 350, [35, 175, 500, 1100, 1300, 1500]),
  { type: 'levy', name: 'Luxury Levy', amount: 100 },
  d('Summit Park', 'blue', 400, [50, 200, 600, 1400, 1700, 2000]),
];

/** Indices of every district in each colour group, in board order. */
export const GROUP_SPACES: Readonly<Record<GroupId, readonly number[]>> = (() => {
  const out = {} as Record<GroupId, number[]>;
  for (const g of COLOUR_GROUPS) out[g.id] = [];
  BOARD_SPACES.forEach((sp, i) => {
    if (sp.type === 'district') out[sp.group].push(i);
  });
  return out;
})();

export const HUB_SPACES: readonly number[] = BOARD_SPACES.map((sp, i) => (sp.type === 'hub' ? i : -1)).filter((i) => i >= 0);
export const UTILITY_SPACES: readonly number[] = BOARD_SPACES.map((sp, i) => (sp.type === 'utility' ? i : -1)).filter((i) => i >= 0);
/** Rent for a Transit Hub when its owner holds 1..4 hubs. */
export const HUB_RENT = [25, 50, 100, 200] as const;

export function isProperty(sp: BoardSpace): sp is PropertySpace {
  return sp.type === 'district' || sp.type === 'hub' || sp.type === 'utility';
}

// ----------------------------------------------------------------- cards

export type CardEffect =
  | { kind: 'move_to'; space: number }
  | { kind: 'move_by'; steps: number }
  | { kind: 'pay'; amount: number }
  | { kind: 'collect'; amount: number }
  | { kind: 'collect_each'; amount: number }
  | { kind: 'out_card' }
  | { kind: 'go_to_lock_up' }
  | { kind: 'repairs'; office: number; tower: number }
  | { kind: 'nearest_hub' }
  | { kind: 'nearest_utility' };

export interface Card {
  text: string;
  effect: CardEffect;
}

export const FORTUNE_CARDS: readonly Card[] = [
  { text: 'A ribbon-cutting at Payday needs a guest of honour. Advance to Payday and collect 200.', effect: { kind: 'move_to', space: 0 } },
  { text: 'Your investors want a view. Advance to Skyline Terrace.', effect: { kind: 'move_to', space: 37 } },
  { text: 'Opening night! Advance to Theatre Row. Collect 200 if you pass Payday.', effect: { kind: 'move_to', space: 21 } },
  { text: 'A tech conference calls. Advance to Silicon Heights. Collect 200 if you pass Payday.', effect: { kind: 'move_to', space: 26 } },
  { text: 'Your train is early. Advance to the North Transit Hub. Collect 200 if you pass Payday.', effect: { kind: 'move_to', space: 5 } },
  { text: 'Catch the next connection. Advance to the nearest Transit Hub. If it is owned, pay the owner double rent.', effect: { kind: 'nearest_hub' } },
  { text: 'Catch the next connection. Advance to the nearest Transit Hub. If it is owned, pay the owner double rent.', effect: { kind: 'nearest_hub' } },
  { text: 'A blackout hits the city. Advance to the nearest utility. If it is owned, pay the owner 10 times your dice roll.', effect: { kind: 'nearest_utility' } },
  { text: 'You left your briefcase behind. Go back 3 spaces.', effect: { kind: 'move_by', steps: -3 } },
  { text: 'The auditors found irregular filings. Go directly to the Lock-up. Do not pass Payday.', effect: { kind: 'go_to_lock_up' } },
  { text: 'Your lawyer owes you a favour. Keep this card to leave the Lock-up for free.', effect: { kind: 'out_card' } },
  { text: 'Building inspection! Pay 25 per office and 100 per tower you own.', effect: { kind: 'repairs', office: 25, tower: 100 } },
  { text: 'Your start-up pays its first dividend. Collect 50.', effect: { kind: 'collect', amount: 50 } },
  { text: 'A bond you forgot about matures. Collect 150.', effect: { kind: 'collect', amount: 150 } },
  { text: 'Parking fines pile up at head office. Pay 15.', effect: { kind: 'pay', amount: 15 } },
  { text: 'You are elected chair of the trade board. Every rival pays you 50 in dues.', effect: { kind: 'collect_each', amount: 50 } },
];

export const MARKET_CARDS: readonly Card[] = [
  { text: 'Quarterly results are in. Advance to Payday and collect 200.', effect: { kind: 'move_to', space: 0 } },
  { text: 'The city refunds an overpaid levy. Collect 200.', effect: { kind: 'collect', amount: 200 } },
  { text: 'A late supplier invoice arrives. Pay 50.', effect: { kind: 'pay', amount: 50 } },
  { text: 'You sell surplus office furniture. Collect 50.', effect: { kind: 'collect', amount: 50 } },
  { text: 'A regulator reviews your books. Keep this card to leave the Lock-up for free.', effect: { kind: 'out_card' } },
  { text: 'Insider trading allegations! Go directly to the Lock-up. Do not pass Payday.', effect: { kind: 'go_to_lock_up' } },
  { text: 'It is your birthday. Every rival chips in 10 for the party.', effect: { kind: 'collect_each', amount: 10 } },
  { text: 'A life insurance policy pays out. Collect 100.', effect: { kind: 'collect', amount: 100 } },
  { text: 'Staff health check-ups are due. Pay 100.', effect: { kind: 'pay', amount: 100 } },
  { text: 'Tuition for your management course. Pay 50.', effect: { kind: 'pay', amount: 50 } },
  { text: 'A consulting contract pays off. Collect 25.', effect: { kind: 'collect', amount: 25 } },
  { text: 'Street repairs outside your buildings. Pay 40 per office and 115 per tower you own.', effect: { kind: 'repairs', office: 40, tower: 115 } },
  { text: 'You win second prize in the city business awards. Collect 10.', effect: { kind: 'collect', amount: 10 } },
  { text: 'A long-lost client settles an old account. Collect 100.', effect: { kind: 'collect', amount: 100 } },
  { text: 'Year-end tax rebate. Collect 20.', effect: { kind: 'collect', amount: 20 } },
  { text: 'A charity gala honours your firm. Collect 100.', effect: { kind: 'collect', amount: 100 } },
];
