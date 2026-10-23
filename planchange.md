# planchange.md — change map for Epic Board Games

A map of every function and where it lives, plus "to change X, touch these files".
Keep this up to date when you add or move a function. Generated 2026-10-23.

## How a change flows

1. Work on the `testing` branch (never commit straight to `main` = production).
2. Rules live in `packages/game-core` and run **both** in the browser and in the
   `GameRoom` Durable Object. Change a rule once, in the engine — never in a board.
3. Verify before committing:
   - `npx tsc -p packages/game-core` and `npx tsc -p worker` — engine/worker types
   - `npx vitest run` — all game + security tests
   - `npm run check -w @ebg/web` — Astro/React typecheck
   - `npm run build -w @ebg/web` — production build
4. Deploy testing: `npm run build -w @ebg/web` then `npx wrangler deploy --env testing`
   (set `SITE_URL=https://epic-board-games-testing.sarkkarijobseva.workers.dev` for
   correct canonicals). Credentials load from `.env.cloudflare`.
5. Production goes out via a PR from `testing` → `main`.

## Where do I change…

| I want to change… | Touch these files |
|---|---|
| A game's **rules / win condition / AI** | `packages/game-core/src/games/<game>.ts` (engine + its `ai`) |
| A game's **look / animation / input** | `apps/web/src/components/games/boards/<Game>Board.tsx` (+ `styles/games/<game>.css`) |
| **Which games exist**, names, player counts, rules text, play time | `packages/game-core/src/catalog.ts` |
| Register a **new game** | add engine to `games/index.ts` `ENGINES`; add board to `GameScreen.tsx` `BOARDS` |
| **AI difficulty** (think time, mistake rate, personas) | `packages/game-core/src/ai/index.ts` (`AI_PERSONAS`); per-game depth in each engine's `ai.depth` |
| **Player seat colours** | `apps/web/src/styles/global.css` (`--color-p0..p3`), `lib/snakes-scene.ts` `SEAT_HEX`, `GameOverModal.tsx` confetti — colour-blind-safe, re-validate with the dataviz skill |
| **Dice** look/behaviour | `apps/web/src/components/games/shared/Dice.tsx` |
| **Sounds** | `apps/web/src/lib/sound.ts` (`Sfx` type + `play`) |
| **3D Snakes board** (environment, creatures, camera) | `apps/web/src/lib/snakes-scene.ts`; tiers in `lib/performance-tier.ts` |
| **In-game layout / HUD / fullscreen / turn clock** | `apps/web/src/components/games/shared/GameScreen.tsx` |
| **Mode menu** (solo / AI / online / friends / pass-and-play) | `apps/web/src/components/lobby/GameModeSelector.tsx`, `GameLauncher.tsx` |
| **Matchmaking** window / queue | `worker/src/durable/matchmaker.ts`, `protocol.ts` `MATCH_WINDOW_MS` |
| **Online game server** (turns, timeouts, chat, voice relay) | `worker/src/durable/game-room.ts` |
| **Auth** (signup/login/session/password) | `worker/src/auth.ts`, `worker/src/security.ts` |
| **Account** (password change, export, delete) | `worker/src/account.ts` |
| **Friends / blocking / pings** | `worker/src/friends.ts`, UI `components/social/FriendsPage.tsx` |
| **Stats / leaderboards** | `worker/src/stats.ts`, UI `components/social/Leaderboard.tsx`, `ProfilePage.tsx` |
| **API routes** (add/change an endpoint) | `worker/src/index.ts` `ROUTES` table + the handler file |
| **DB schema** | add a `migrations/NNNN_*.sql`; apply with `wrangler d1 migrations apply DB [--remote] [--env testing]` |
| **A page** (About/Contact/FAQ/Cookies/Privacy/Terms) | `apps/web/src/pages/<name>.astro` |
| **Site shell** (header, footer, nav, SEO meta, canonical, JSON-LD) | `apps/web/src/layouts/BaseLayout.astro` |
| **Landing page** | `apps/web/src/pages/index.astro` |
| **Blog** content / pages | `apps/web/src/content/blog/*.md`, `pages/blog/*`, `lib/blog.ts` |
| **Chat moderation** (profanity, rate limit, emotes) | `packages/game-core/src/chat.ts` |
| **Responsive layout math** per device | `packages/game-core/src/layout.ts` |
| **Security headers / CSP** | `apps/web/astro.config.mjs` (CSP), `apps/web/public/_headers`, `worker/src/http.ts` |
| **Cloudflare resources / cron** | `wrangler.jsonc` |

---

## Function index

### packages/game-core — shared rules, AI, protocol (runs in browser AND server)

**`games/types.ts`** — the engine contract
- `GameEngine<S,M>` (interface) — every game implements this: `init/currentPlayer/legalMoves/applyMove/isTerminal/winner/parseMove/sameMove`, optional `ai`, `validateMove`, `summary`, `simultaneous`.
- `EngineAI<S,M>` — AI config: `evaluate`, `depth`, `orderMoves?`, `timeBudgetMs?`, `choose?`.
- `DRAW = -1`, `LOST = -2` — winner sentinels. `IllegalMoveError` — thrown on bad moves.

**`ai/index.ts`** — generic AI
- `AI_PERSONAS` / `AI_DIFFICULTIES` / `AIPersona` / `AIDifficulty` — the four personas (Buddy/Nova/Titan/Oracle), think delay, mistake rate.
- `isDifficulty(v)` — type guard. `negamax(...)` — alpha-beta search. `chooseMove(engine,state,difficulty,rng)` — the move the AI plays (mistake roll → heuristic `choose` → iterative-deepening search).

**`catalog.ts`** — the 12-game catalog
- `GameInfo`, `GameId`, `GameStatus`, `GameKind`, `AISupport` (types). `GAMES` (the list).
- `getGame(id)`, `getGameBySlug(slug)`, `isGameId(v)`.

**`rng.ts`** — `createRng(seed)` (mulberry32, deterministic), `randomSeed()`, `Rng` interface.

**`chat.ts`** — moderation shared by client + server
- `QUICK_EMOTES`, `getEmote(id)`, `DEFAULT_PROFANITY`, `buildProfanityFilter(words)`, `RateLimiter` (class), `validateChatMessage(raw,limiter,filter?)`, `MAX_MESSAGE_LENGTH`, `RATE_LIMIT`.

**`layout.ts`** — `getGameLayout(w,h,gameType)` → device/orientation/board size/dice & chat position (`GameLayout`).

**`protocol.ts`** — wire types browser↔worker
- REST types: `PublicUser`, `MeResponse`, `FriendEntry`, `ProfileStats/Response`, `LeaderboardEntry/Response`, `Notification`.
- Matchmaking: `MatchClientMessage`, `MatchServerMessage`. Game room: `RoomPlayer`, `ChatMessage`, `RoomStatus`, `RoomSnapshot`, `RoomClientMessage`, `RoomServerMessage`, `VoiceSignal`.
- `parseRoomClientMessage(raw)` — shape-check an inbound WS frame. Constants `MATCH_WINDOW_MS`, `TURN_TIMEOUT_MS`, `MAX_WS_MESSAGE_BYTES`.

**`games/index.ts`** — registry
- `ENGINES` (GameId → engine), `getEngine(id)`, `isLegalMove(engine,state,move)` (uses `validateMove` when present).

**`games/tic-tac-toe.ts`** — `ticTacToe` engine, `TicTacToeState/Move`, `Cell`, `TTT_LINES`.
**`games/connect4.ts`** — `connect4` engine, `Connect4State/Move`, `c4Cell(...)`, `evaluateConnect4(s,seat)`, `C4_COLS/ROWS`.
**`games/snakes-ladders.ts`** — `snakesLadders` engine, `applyRoll(s,roll)`, `squareToGrid(sq)`, `JUMPS`, `BOARD_SIZE`, state/move/event types.
**`games/chess.ts`** — `chess` engine + `fromFEN/toFEN`, `isInCheck`, `movesFrom`, `toSAN`, `perft`, `chessPly`, `squareName`, `parseSquare`, `evaluateChess`, `START_FEN`, `PIECE_VALUES`.
**`games/checkers.ts`** — `checkers` engine + `checkersLegalMoves`, `makeCheckersState`, `jumpsFrom`, `stepsFrom`, `evaluateCheckers`, `countPieces`, square helpers (`sqRow/sqCol/toSquare/isDarkSquare/squareName/isKing/pieceSeat/isJump/jumpedSquare`).
**`games/epic-business.ts`** — `epicBusiness` engine + `rentFor`, `netWorth`, `canBuild/canSellBuilding/canMortgage/canUnmortgage`, `mortgageValue/unmortgageCost/buildCost`, `ownedSpaces/hubsOwned/utilitiesOwned`, `ownsGroup`, `raisableCash`, `tradeError`, `chooseEpicBusinessMove`; constants `STARTING_CASH/PAYDAY_BONUS/BAIL/MAX_ROUNDS/MAX_TRADES_PER_TURN/BID_INCREMENTS`; all state/move/`Phase`/`Event` types.
**`games/epic-business-data.ts`** — board data: `BOARD_SPACES`, `COLOUR_GROUPS`/`GROUP_BY_ID`/`GROUP_SPACES`, `HUB_SPACES`/`UTILITY_SPACES`/`HUB_RENT`, `FORTUNE_CARDS`, `MARKET_CARDS`, `isProperty(sp)`, prices/sizes.
**`games/sudoku.ts`** — `sudoku` engine + `solveSudoku`, `countSolutions`, `generateSudoku`, `findHint`, `candidates`, `PEERS`, `BOX_OF`, `SUDOKU_CLUES`.
**`games/word-puzzle.ts`** + `word-puzzle-data.ts` — `wordPuzzle` engine, `scoreGuess(answer,guess)`, `isValidWord(w)`, `ANSWERS`, `ALLOWED`, `WORD_LENGTH`, `MAX_GUESSES`.
**`games/crossword.ts`** + `crossword-data.ts` — `crossword` engine + `getCrosswordPuzzle`, `wordsOf`, `cellsOfWord`, `solutionAt`, `CROSSWORD_PUZZLES`.
**`games/mahjong.ts`** + `mahjong-data.ts` — `mahjong` engine + `isFree`, `findMatches`, `tileMatches`, `generateDeal`, `getMahjongLayout`, `MAHJONG_LAYOUTS`.
**`games/epic-puzzle.ts`** + `epic-puzzle-data.ts` — `epicPuzzle` engine (co-op `simultaneous`) + `pieceSlot`, `puzzlePlacedCount`, `formatPuzzleDuration`, `PUZZLE_IMAGES`, `PUZZLE_SIZES`, `getPuzzleImage/getPuzzleSize`.

### worker — API + Durable Objects

**`index.ts`** — `fetch` (router over the `ROUTES` table, applies security headers), `scheduled` (nightly retention clean-up). Exports the three Durable Objects. **Add a route here.**
**`http.ts`** — `HttpError`, `json`, `errorResponse`, `withApiHeaders`, `readJson`, `API_HEADERS`.
**`security.ts`** — crypto + cookies + validation: `hashPassword/verifyPassword`, `sha256Hex`, `timingSafeEqual`, `randomToken/randomBytes`, base64 helpers, `sessionCookie/clearSessionCookie/parseCookies`, `isSameOrigin/assertSameOrigin` (CSRF), `clientIp`, `normalizeUsername/Email/DisplayName/Avatar`, `validatePassword`, regexes/constants.
**`auth.ts`** — `handleSignup/handleLogin/handleLogout/handleMe`, `getSessionUser`, `requireUser`, `audit`, `toPublicUser`, `PUBLIC_USER_COLUMNS`.
**`account.ts`** — `handleChangePassword`, `handleExportAccount`, `handleDeleteAccount`.
**`profile.ts`** — `handleUpdateProfile`.
**`stats.ts`** — `loadProfileStats`, `handleLeaderboard`, `handleGetProfile`.
**`friends.ts`** — `handleListFriends/FriendRequest/FriendRespond/RemoveFriend/FriendPing/BlockUser/UnblockUser/UserSearch`.
**`notifications.ts`** — `createNotification`, `handleListNotifications`, `handleReadNotifications`.
**`contact.ts`** — `handleContact` (contact form → `contact_messages`).
**`rooms.ts`** — `parseRoomId`, `handleMatchmakingWs/RoomWs/PresenceWs`, `handleCreateAiRoom/CreatePrivateRoom`.
**`voice.ts`** — `handleTurnCredentials` (Cloudflare TURN, players-only).
**`durable/game-room.ts`** — `GameRoom` DO: `init`, `isPlayer`, `fetch` (WS upgrade), `webSocketMessage/Close/Error`, `alarm` (AI + timeout turns). Authoritative game state, chat, voice relay, D1 recording.
**`durable/matchmaker.ts`** — `Matchmaker` DO: one queue per game, 60s window, creates rooms.
**`durable/presence.ts`** — `Presence` DO: `isOnline`, `notify` (live notifications per user).
**`durable/ws.ts`** — `userFromHeader`, `safeClose`, `safeSend`, `upgradeRequired`, `USER_HEADER`.
**`env.ts`** — `Env` bindings interface.

### apps/web/src/lib

- **`api.ts`** — `api<T>(path,init)` (JSON fetch), `wsUrl(path)`, `useAuth()`, `refreshAuth`, `setCurrentUser`, `loginRedirect`, `safeNext`, `ApiRequestError`.
- **`session.ts`** — `useLocalSession(setup)` (solo/AI/pass-and-play), `useOnlineSession(roomId,gameId,userId)` (connects to GameRoom); both return `GameSessionView` (what every board consumes).
- **`sound.ts`** — `play(sfx)`, `isMuted`, `setMuted`, `Sfx` type.
- **`performance-tier.ts`** — `detectPerformanceTier`, `getGraphicsSettings(tier)`, `webglAvailable`.
- **`snakes-scene.ts`** — `SnakesScene` class (3D board: `animateMove`, `setPositions`, `isAnimating`, `resetCamera`, `dispose`), `squareToWorld`, `SEAT_HEX`.
- **`voice-chat.ts`** — `VoiceChatManager` (WebRTC mesh: `toggleMute/toggleDeafen/setPlayerVolume/disconnect`).
- **`blog.ts`** — `getPublishedPosts`, `getPostsForGame`, `getPostsByGame`, `getTagCounts`, `postUrl`, `tagUrl`, `gameFor`, `readingTime`, `formatDate`, `isoDate`.

### apps/web components (React islands unless noted; default export = the component)

- **games/shared**: `GameScreen` + `useFullscreen` (mounts the board, HUD, fullscreen, turn clock, layout), `PlayerPanel` (+ `AIPlayerBadge`, `ThinkingBubble`, `SEAT_COLORS`), `GameOverModal` (+ confetti), `Dice`, `InGameChat` (+ `QuickEmoteBar`), `VoiceControls`, `BottomSheet`.
- **games/boards** (one per game): `TicTacToeBoard`, `Connect4Board`, `SnakesLaddersBoard`, `ChessBoard`, `CheckersBoard`, `EpicBusinessBoard`, `SudokuBoard`, `WordPuzzleBoard`, `CrosswordBoard`, `MahjongBoard`, `EpicPuzzleBoard`.
- **games/arcade**: `FlappyGame` (canvas, its own loop — not the turn engine).
- **games/epic-business** (board sub-parts): `BoardRing`, `Tile`, `CentrePanel`, `ActionBar`, `PlayerStrip`, `EventLog`, `HowToPlay`, `PropertySheet` (+`PropertyContent`), `TradeDialog` (+`TradeForm`), `Dialog`/`Popover`; `format.ts` (ring geometry, banner, trade sentence) + `hooks.ts` (token walk, timers, diffs).
- **games/epic-puzzle**: `PuzzlePicker`, `PuzzlePlay`, `PuzzleHud`, `PuzzlePiece`, `geometry.ts`.
- **lobby**: `GameLauncher` (phase machine: menu/matchmaking/local/room), `GameModeSelector` (+`AIDifficultyPicker`), `Matchmaking`.
- **social**: `FriendsPage`, `ProfilePage`, `Leaderboard`, `NotificationBell`.
- **auth**: `AuthForm`, `UserMenu`.
- **common**: `ContactForm`, `CookieNotice`, `GameCard.astro`.
- **blog**: `PostCard.astro`.

### apps/web pages (Astro, static)

`index` (landing), `games/[slug]` (per-game: launcher island + crawlable rules/guides/leaderboard + JSON-LD), `blog/index`, `blog/[slug]`, `blog/tags/[tag]`, `about`, `contact`, `faq`, `cookies`, `privacy`, `terms`, `login`, `signup`, `profile`, `friends`, `404`, `robots.txt.ts`, `rss.xml.ts`. Shell: `layouts/BaseLayout.astro` (head, SEO, canonical, nav, footer, cookie notice).

### Config / data

- `wrangler.jsonc` — Worker, DOs, D1, KV, rate limits, cron, env.testing.
- `apps/web/astro.config.mjs` — site URL, CSP, integrations, markdown.
- `apps/web/public/_headers` — static-asset security headers + caching.
- `apps/web/content.config.ts` — blog collection schema.
- `migrations/*.sql` — D1 schema (`0001_init`, `0002_contact_messages`).
- `docs/dev/game-contract.md` — the contract for building a new game.
