# Building a game for Epic Board Games

Every game is two pieces: a **pure engine** in `packages/game-core` (rules + AI, no DOM) and a
**React board** in `apps/web` (rendering + input). The same engine runs in the browser for solo /
vs-AI / pass-and-play, and inside the `GameRoom` Durable Object for online play, so **never put
rules in the board** and **never put browser APIs in the engine**.

Read these before you start (they are the real contract):

- `packages/game-core/src/games/types.ts` — `GameEngine`, `EngineAI`, `DRAW`, `LOST`
- `packages/game-core/src/ai/index.ts` — `chooseMove` (generic alpha-beta w/ iterative deepening)
- `packages/game-core/src/rng.ts` — seedable RNG (**all randomness must come from the `rng` arg**)
- `packages/game-core/src/games/connect4.ts` + `apps/web/src/components/games/boards/Connect4Board.tsx` — a complete worked example
- `packages/game-core/src/games/snakes-ladders.ts` — dice game example (randomness via rng)
- `apps/web/src/lib/session.ts` — `GameSessionView` (what the board receives)
- `apps/web/src/components/games/shared/GameScreen.tsx` — how boards are mounted and sized
- `apps/web/src/lib/sound.ts` — `play(sfx)`; available sfx names are in the `Sfx` type
- `apps/web/src/styles/global.css` + `game-responsive.css` — utilities (`card`, `btn-primary`, `btn-ghost`, `input`, `animate-pop`, `animate-drop`, `piece-enter`, `shake`, `flip-in`) and theme tokens (`--color-p0..p3` seat colours, `--color-ink-*`)
- `packages/game-core/src/catalog.ts` — the game's `id`, `minPlayers`/`maxPlayers`, `rules` (already written; match them)

## Engine rules

```ts
export const myGame: GameEngine<MyState, MyMove> = {
  id: 'my_game',          // must equal the catalog id
  simultaneous?: true,    // ONLY for co-operative games (any seat may move any time)
  init(playerCount, rng)  // fresh state; MUST be deterministic given rng
  currentPlayer(s)        // seat index to move (advisory for simultaneous games)
  legalMoves(s)           // [] when terminal. For big move sets this must still be fast.
  applyMove(s, m, rng, seat?)  // NEVER mutate s; throw IllegalMoveError on illegal moves
  isTerminal(s), winner(s)     // winner: seat | DRAW | LOST (single player lost) | null
  parseMove(raw)          // validate UNTRUSTED network JSON → MyMove | null (check types, ranges)
  sameMove(a, b)          // structural equality
  ai?: { evaluate, depth, orderMoves?, timeBudgetMs?, choose? }   // see EngineAI
  summary?(s)             // optional one-liner for the game-over dialog
};
```

- State must be **plain JSON** (it is persisted in Durable Object storage and sent over WebSocket).
  No class instances, Maps, Sets, functions, `undefined` in arrays, or Infinity. Keep it compact
  (< ~30 KB serialized). Derived data (e.g. "is in check") may be recomputed by helpers.
- The GameRoom validates `legalMoves(s).some(m => sameMove(m, move))` before applying, so
  `legalMoves` must enumerate every legal move. Keep `applyMove` O(small).
- Evaluation scale for `ai.evaluate`: a decided win should be ≥ 900 000 (minus plies) and a loss
  ≤ −900 000 so iterative deepening can stop early. Use `timeBudgetMs` (≈1 500 ms) for games with
  branching factor > 10; keep the deepest `depth` such that depth-1 search is instant.
- Multi-step turns (e.g. a checkers multi-jump, "roll then decide") are modelled as separate moves
  by the same player; `negamax` already handles consecutive moves by the same seat.
- Single-player games: `init(1, rng)`, `currentPlayer` returns 0, `winner` returns `0` when solved
  and `LOST` when failed. Hints are **engine helper functions** (exported alongside), not moves,
  unless they change state (then they are moves, e.g. `{ type: 'reveal', cell }`).
- Co-operative games (`simultaneous: true`): `applyMove` receives `seat` of the mover; use it for
  scoring. There is no turn timer online.

## Board rules

```tsx
export default function MyBoard({ session, size }: { session: GameSessionView<MyState, MyMove>; size: number; dicePosition: ... }) {
  const s = session.state;            // null while connecting
  if (!s) return null;
  // Only call session.submitMove(...) when session.canMove is true.
  // Re-animate on session.moveKey changes (it increments on every applied move).
}
```

- `size` is the pixel width you are given (a square `size × size` region fits). You may be
  taller/wider than `size` for side panels but keep **width ≤ size** on mobile (`size` < 768).
- Touch targets ≥ 44 px on mobile; keyboard operable (arrow keys / Enter / Escape where it makes
  sense); every interactive element has an accessible name; use `aria-live="polite"` for
  announcements (e.g. "Check!", "Rent paid"); respect `prefers-reduced-motion` (CSS handles the
  global reduction; avoid JS-driven infinite animations when
  `matchMedia('(prefers-reduced-motion: reduce)').matches`).
- Use Tailwind v4 utility classes (already configured). For keyframes you need, create
  `apps/web/src/styles/games/<name>.css` and `import '../../../styles/games/<name>.css'` from your
  board. Do NOT edit `global.css` or `game-responsive.css`.
- Sounds: `import { play } from '../../../lib/sound'` and call `play('capture')` etc. Only use
  names from the `Sfx` type.
- Seat colours: `SEAT_COLORS` from `../shared/PlayerPanel` (CSS vars), or `text-p0`… utilities.
- Show the opponent's last move (highlight), the current selection, legal targets, and a
  clear "your turn / waiting" affordance (the HUD already shows whose turn it is).
- The board must work in all of: solo/pass-and-play (`session.mode` 'solo' | 'local'), vs AI, and
  online (state arrives asynchronously; `session.canMove` false while waiting). Never assume you
  are seat 0: use `session.mySeats` to orient the board (e.g. flip chess for Black).
- No `fetch`, no `localStorage` needed except for purely cosmetic prefs (wrap in try/catch).

## Files you may create / edit

- `packages/game-core/src/games/<name>.ts` (+ optional `<name>-data.ts` for puzzle/word data)
- `packages/game-core/test/<name>.test.ts` (vitest; aim for meaningful rules + AI sanity tests)
- `apps/web/src/components/games/boards/<Name>Board.tsx` (+ sub-components in
  `apps/web/src/components/games/<name>/` if large)
- `apps/web/src/styles/games/<name>.css`
- `apps/web/public/<name>/...` for static assets you author (SVG only; no downloads)

**Do not edit** any other existing file (catalog, `games/index.ts`, `ai/index.ts`, `GameScreen`,
`session.ts`, `sound.ts`, global CSS, worker, pages). The integrator registers your engine and board.
If you believe a shared change is required, finish your work and list it in your final report.

## Verify before you finish

```bash
npx tsc -p packages/game-core                      # engine typecheck (strict, noUncheckedIndexedAccess)
npx vitest run packages/game-core/test/<name>.test.ts
npm run check -w @ebg/web                           # astro check: typechecks your .tsx too
```

All three must pass. Match the surrounding code style (2-space, single quotes, trailing commas,
small focused comments explaining *why*).

## Final report (keep it short)

1. Export names: engine const, State/Move type names, board default export path.
2. Any catalog mismatch (player counts, rules text) you noticed.
3. Anything the integrator must do (e.g. "needs sfx 'x'", "GameScreen detail line for seat").
4. Test results.
