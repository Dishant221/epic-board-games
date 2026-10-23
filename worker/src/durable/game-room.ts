import { DurableObject } from 'cloudflare:workers';
import {
  AI_PERSONAS,
  DEFAULT_PROFANITY,
  DRAW,
  RateLimiter,
  TURN_TIMEOUT_MS,
  buildProfanityFilter,
  chooseMove,
  createRng,
  getEmote,
  getEngine,
  getGame,
  IllegalMoveError,
  isLegalMove,
  parseRoomClientMessage,
  randomSeed,
  validateChatMessage,
  type AIDifficulty,
  type ChatMessage,
  type GameEngine,
  type GameId,
  type PublicUser,
  type Rng,
  type RoomClientMessage,
  type RoomPlayer,
  type RoomServerMessage,
  type RoomSnapshot,
  type RoomStatus,
} from '@ebg/game-core';
import type { Env } from '../env';
import { safeClose, safeSend, upgradeRequired, userFromHeader } from './ws';

export type RoomMode = 'matchmaking' | 'ai' | 'private';

export interface RoomInit {
  roomId: string;
  gameId: GameId;
  mode: RoomMode;
  /** Humans in seat order. For private rooms this is just the owner. */
  humans: PublicUser[];
  ai?: AIDifficulty[];
}

interface Seat extends Omit<RoomPlayer, 'connected'> {
  timeouts: number;
  /** Set after repeated timeouts in 3–4 player games: the server plays for them. */
  forfeited: boolean;
  rematch: boolean;
}

interface RoomRecord {
  roomId: string;
  gameId: GameId;
  mode: RoomMode;
  status: RoomStatus;
  ownerId: string;
  seats: Seat[];
  state: unknown;
  round: number;
  seed: number;
  rngState: number;
  /** Monotonic move counter; clients echo it to make stale moves detectable. */
  turn: number;
  turnDeadline: number | null;
  aiMoveAt: number | null;
  /** When to wipe storage for a finished/abandoned room nobody is in. */
  expireAt: number | null;
  winner: number | null;
  chat: ChatMessage[];
  moveLog: [number, unknown][];
}

interface Attachment {
  userId: string;
  seat: number | null;
}

const MAX_SOCKETS_PER_USER = 4;
const MAX_TIMEOUTS = 3;
const CHAT_HISTORY = 50;
const TYPING_THROTTLE_MS = 2_000;
const AUTOPILOT_DELAY_MS = 800;
const ROOM_TTL_MS = 60 * 60 * 1000;
const PROFANITY_CACHE_MS = 5 * 60 * 1000;

/**
 * One authoritative game table. Owns the game state, validates every move
 * with the shared engine, drives AI and timeout turns with a single alarm,
 * moderates chat and relays WebRTC voice signalling between its players.
 */
export class GameRoom extends DurableObject<Env> {
  private room: RoomRecord | null = null;
  // In-memory only: lost on hibernation, which merely resets these windows.
  private chatLimiters = new Map<string, RateLimiter>();
  private lastTyping = new Map<string, number>();
  private profanity: { filter: (t: string) => string; loadedAt: number } | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"PING"}', '{"type":"PONG"}'));
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get<RoomRecord>('room')) ?? null;
    });
  }

  // ------------------------------------------------------------------ RPC

  async init(opts: RoomInit): Promise<void> {
    if (this.room) throw new Error('Room already initialised');
    const game = getGame(opts.gameId);
    if (!getEngine(opts.gameId)) throw new Error(`No engine for ${opts.gameId}`);
    const ai = opts.ai ?? [];
    const owner = opts.humans[0];
    if (!owner) throw new Error('A room needs at least one human');
    if (opts.humans.length + ai.length > game.maxPlayers) throw new Error('Too many players');

    const seats: Seat[] = opts.humans.map((u, i) => this.humanSeat(u, i));
    ai.forEach((difficulty, i) => {
      const persona = AI_PERSONAS[difficulty];
      const seat = seats.length;
      seats.push({
        seat,
        userId: `ai:${persona.id}:${i}`,
        displayName: persona.name,
        avatar: persona.emoji,
        isAI: true,
        aiDifficulty: difficulty,
        aiPersona: persona.id,
        voice: 'off',
        timeouts: 0,
        forfeited: false,
        rematch: false,
      });
    });

    const seed = randomSeed();
    this.room = {
      roomId: opts.roomId,
      gameId: opts.gameId,
      mode: opts.mode,
      status: 'waiting',
      ownerId: owner.id,
      seats,
      state: null,
      round: 0,
      seed,
      rngState: seed,
      turn: 0,
      turnDeadline: null,
      aiMoveAt: null,
      // A room that nobody ever joins cleans itself up.
      expireAt: Date.now() + ROOM_TTL_MS,
      winner: null,
      chat: [],
      moveLog: [],
    };
    if (opts.mode !== 'private') await this.startGame();
    await this.persist();
  }

  /** True if `userId` holds a human seat here (used to gate TURN credentials). */
  isPlayer(userId: string): boolean {
    return this.room?.seats.some((s) => !s.isAI && s.userId === userId) ?? false;
  }

  // ------------------------------------------------------------ WebSocket

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return upgradeRequired();
    const user = userFromHeader(request);
    const room = this.room;
    if (!user) return new Response('Unauthenticated', { status: 401 });
    if (!room) return new Response('Room not found', { status: 404 });

    let seat = room.seats.find((s) => s.userId === user.id) ?? null;
    let joinedNow = false;
    if (!seat && room.status === 'waiting' && room.seats.length < getGame(room.gameId).maxPlayers) {
      seat = this.humanSeat(user, room.seats.length);
      room.seats.push(seat);
      joinedNow = true;
    }
    // Only private rooms admit spectators; matchmade/AI tables are players-only.
    if (!seat && room.mode !== 'private') return new Response('Not a player in this room', { status: 403 });

    const existing = this.ctx.getWebSockets(user.id);
    if (existing.length >= MAX_SOCKETS_PER_USER && existing[0]) safeClose(existing[0], 4001, 'Too many connections');
    const firstSocket = existing.length === 0;

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [user.id]);
    server.serializeAttachment({ userId: user.id, seat: seat?.seat ?? null } satisfies Attachment);
    room.expireAt = null;

    if (seat && (firstSocket || joinedNow)) {
      this.systemMessage(`${seat.displayName} joined`);
      this.broadcastPlayers();
    }
    if (joinedNow && room.seats.length === getGame(room.gameId).maxPlayers) await this.startGame();
    this.sendSnapshot(server);
    await this.persist();
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const room = this.room;
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!room || !att) return safeClose(ws, 1011, 'Room unavailable');
    const msg = parseRoomClientMessage(raw);
    if (!msg) return this.sendError(ws, 'Malformed message', 'bad_message');
    const seat = att.seat === null ? null : room.seats[att.seat] ?? null;

    switch (msg.type) {
      case 'PING':
        return safeSend(ws, { type: 'PONG' } satisfies RoomServerMessage);
      case 'MOVE':
        return this.onMove(ws, seat, msg.payload);
      case 'CHAT':
      case 'EMOTE':
        return this.onChat(ws, seat, msg);
      case 'TYPING':
        return this.onTyping(ws, att.userId, seat);
      case 'REMATCH':
        return this.onRematch(ws, seat);
      case 'VOICE_OFFER':
      case 'VOICE_ANSWER':
      case 'VOICE_ICE_CANDIDATE':
        return this.relayVoice(ws, seat, msg);
      case 'VOICE_MUTE_STATUS':
      case 'VOICE_STATE':
        return this.onVoiceState(ws, seat, msg);
    }
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    safeClose(ws);
    await this.onSocketGone(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.onSocketGone(ws);
  }

  // --------------------------------------------------------------- alarm

  override async alarm(): Promise<void> {
    const room = this.room;
    if (!room) return;
    const now = Date.now();

    if (room.expireAt !== null && now >= room.expireAt) {
      if (this.ctx.getWebSockets().length === 0) {
        if (room.status === 'playing') await this.recordEnd(null, 'abandoned');
        this.room = null;
        await this.ctx.storage.deleteAll();
        return;
      }
      room.expireAt = now + ROOM_TTL_MS; // Someone is still here; check again later.
    }

    if (room.status === 'playing') {
      const engine = this.engine();
      const current = room.seats[engine.currentPlayer(room.state)];
      if (current && room.aiMoveAt !== null && now >= room.aiMoveAt) {
        const rng = this.rng();
        const move =
          current.isAI && current.aiDifficulty
            ? chooseMove(engine, room.state, current.aiDifficulty, rng)
            : rng.pick(engine.legalMoves(room.state));
        await this.applyMove(current.seat, move, rng);
      } else if (current && room.turnDeadline !== null && now >= room.turnDeadline) {
        await this.onTurnTimeout(current);
      }
    }
    // Never leave a past deadline armed, or the alarm would refire immediately forever.
    if (room.aiMoveAt !== null && room.aiMoveAt <= now) room.aiMoveAt = null;
    if (room.turnDeadline !== null && room.turnDeadline <= now) room.turnDeadline = null;
    await this.persist();
  }

  // ------------------------------------------------------------ gameplay

  private async onMove(ws: WebSocket, seat: Seat | null, payload: { move: unknown; turn: number }): Promise<void> {
    const room = this.room!;
    if (!seat) return this.sendError(ws, 'Spectators cannot move', 'not_player');
    if (room.status !== 'playing') return this.sendError(ws, 'The game is not running', 'not_playing');
    const engine = this.engine();
    // Co-operative games accept moves from any seated player at any time.
    if (!engine.simultaneous && engine.currentPlayer(room.state) !== seat.seat) {
      return this.sendError(ws, 'Not your turn', 'not_your_turn');
    }
    // A stale turn number means the client acted on an old state (double click, lag).
    // Simultaneous games tolerate it: two players may legitimately race.
    if (!engine.simultaneous && payload?.turn !== room.turn) return this.sendError(ws, 'Out of date — resyncing', 'stale_turn');
    const move = engine.parseMove(payload.move);
    if (move === null || !isLegalMove(engine, room.state, move)) {
      return this.sendError(ws, 'Illegal move', 'illegal_move');
    }
    seat.timeouts = 0;
    try {
      await this.applyMove(seat.seat, move, this.rng());
    } catch (err) {
      // Free-form moves (validateMove) can still be rejected by the engine itself.
      if (err instanceof IllegalMoveError) {
        this.sendError(ws, err.message, 'illegal_move');
        this.sendSnapshot(ws);
        return;
      }
      throw err;
    }
    await this.persist();
  }

  private async applyMove(seatIndex: number, move: unknown, rng: Rng): Promise<void> {
    const room = this.room!;
    const engine = this.engine();
    room.state = engine.applyMove(room.state, move, rng, seatIndex);
    room.rngState = rng.state();
    room.turn += 1;
    room.moveLog.push([seatIndex, move]);

    if (engine.isTerminal(room.state)) {
      room.turnDeadline = room.aiMoveAt = null;
      this.broadcastState(move, seatIndex);
      const winner = engine.winner(room.state);
      await this.finish(winner, winner === DRAW ? 'draw' : 'win');
      return;
    }
    const thinkingSeat = this.scheduleTurn();
    this.broadcastState(move, seatIndex);
    if (thinkingSeat !== null) this.broadcast({ type: 'AI_THINKING', payload: { seat: thinkingSeat } });
  }

  /** Arms the alarm for the next turn. Returns the AI seat that is now thinking, if any. */
  private scheduleTurn(): number | null {
    const room = this.room!;
    const engine = this.engine();
    const current = room.seats[engine.currentPlayer(room.state)]!;
    const now = Date.now();
    let thinking: number | null = null;
    if (engine.simultaneous) {
      // No turn clock in co-operative games; the room TTL handles abandonment.
      room.aiMoveAt = null;
      room.turnDeadline = null;
    } else if (current.isAI) {
      room.aiMoveAt = now + AI_PERSONAS[current.aiDifficulty ?? 'easy'].thinkDelayMs;
      room.turnDeadline = null;
      thinking = current.seat;
    } else if (current.forfeited) {
      room.aiMoveAt = now + AUTOPILOT_DELAY_MS;
      room.turnDeadline = null;
    } else {
      room.aiMoveAt = null;
      room.turnDeadline = now + TURN_TIMEOUT_MS;
    }
    return thinking;
  }

  private async onTurnTimeout(seat: Seat): Promise<void> {
    const room = this.room!;
    seat.timeouts += 1;
    if (seat.timeouts >= MAX_TIMEOUTS) {
      if (room.seats.length === 2) {
        this.systemMessage(`${seat.displayName} timed out and forfeits`);
        await this.finish(seat.seat === 0 ? 1 : 0, 'forfeit');
        return;
      }
      seat.forfeited = true;
      this.systemMessage(`${seat.displayName} timed out — the server will play for them`);
      if (room.seats.every((s) => s.isAI || s.forfeited)) {
        await this.finish(null, 'abandoned');
        return;
      }
    } else {
      this.systemMessage(`${seat.displayName} ran out of time (${seat.timeouts}/${MAX_TIMEOUTS})`);
    }
    const rng = this.rng();
    await this.applyMove(seat.seat, rng.pick(this.engine().legalMoves(room.state)), rng);
  }

  private async startGame(): Promise<void> {
    const room = this.room!;
    const engine = this.engine();
    const rng = createRng(room.seed);
    room.state = engine.init(room.seats.length, rng);
    room.rngState = rng.state();
    room.status = 'playing';
    room.round += 1;
    room.turn = 0;
    room.winner = null;
    room.moveLog = [];
    room.expireAt = null;
    for (const s of room.seats) Object.assign(s, { timeouts: 0, forfeited: false, rematch: false });

    const thinking = this.scheduleTurn();
    this.systemMessage(`Game started — ${room.seats[engine.currentPlayer(room.state)]!.displayName} goes first`);
    for (const ws of this.ctx.getWebSockets()) this.sendSnapshot(ws);
    if (thinking !== null) this.broadcast({ type: 'AI_THINKING', payload: { seat: thinking } });
    await this.recordStart();
  }

  private async finish(winner: number | null, reason: 'win' | 'draw' | 'forfeit' | 'abandoned'): Promise<void> {
    const room = this.room!;
    room.status = 'finished';
    room.winner = winner;
    room.turnDeadline = room.aiMoveAt = null;
    room.expireAt = Date.now() + ROOM_TTL_MS;
    this.broadcast({ type: 'GAME_OVER', payload: { winner, reason } });
    const w = winner !== null && winner >= 0 ? room.seats[winner] : undefined;
    this.systemMessage(reason === 'draw' ? 'It’s a draw!' : w ? `${w.displayName} wins! 🏆` : 'Game over');
    await this.recordEnd(winner, reason);
  }

  private async onRematch(ws: WebSocket, seat: Seat | null): Promise<void> {
    const room = this.room!;
    if (!seat) return this.sendError(ws, 'Spectators cannot start games', 'not_player');
    const minPlayers = Math.max(2, getGame(room.gameId).minPlayers);

    // In a waiting private room, REMATCH from the owner means "start now".
    if (room.status === 'waiting') {
      if (seat.userId !== room.ownerId) return this.sendError(ws, 'Only the host can start', 'not_host');
      if (room.seats.length < minPlayers) return this.sendError(ws, `Need at least ${minPlayers} players`, 'not_enough_players');
      await this.startGame();
      return this.persist();
    }
    if (room.status !== 'finished') return this.sendError(ws, 'The game is still running', 'not_finished');

    seat.rematch = true;
    const humans = room.seats.filter((s) => !s.isAI && this.isConnected(s.userId));
    if (humans.every((s) => s.rematch)) {
      room.seed = randomSeed();
      await this.startGame();
    } else {
      this.systemMessage(`${seat.displayName} wants a rematch`);
    }
    await this.persist();
  }

  // ---------------------------------------------------------------- chat

  private async onChat(ws: WebSocket, seat: Seat | null, msg: Extract<RoomClientMessage, { type: 'CHAT' | 'EMOTE' }>) {
    if (!seat) return this.sendError(ws, 'Spectators cannot chat', 'not_player');
    let limiter = this.chatLimiters.get(seat.userId);
    if (!limiter) this.chatLimiters.set(seat.userId, (limiter = new RateLimiter()));

    let content: string;
    let messageType: ChatMessage['messageType'];
    if (msg.type === 'EMOTE') {
      const emote = getEmote(String(msg.payload?.emoteId ?? ''));
      if (!emote) return this.sendError(ws, 'Unknown emote', 'bad_emote');
      if (!limiter.tryConsume()) return this.sendError(ws, 'Slow down!', 'chat_rejected');
      content = `${emote.emoji} ${emote.text}`;
      messageType = 'emote';
    } else {
      const result = validateChatMessage(msg.payload?.content, limiter, await this.profanityFilter());
      if (!result.valid) return this.sendError(ws, result.reason, 'chat_rejected');
      content = result.filtered;
      messageType = 'text';
    }
    this.pushChat({
      id: crypto.randomUUID(),
      messageType,
      content,
      senderId: seat.userId,
      senderName: seat.displayName,
      senderAvatar: seat.avatar,
      timestamp: Date.now(),
    });
    await this.persist();
  }

  private onTyping(ws: WebSocket, userId: string, seat: Seat | null): void {
    if (!seat) return;
    const now = Date.now();
    if (now - (this.lastTyping.get(userId) ?? 0) < TYPING_THROTTLE_MS) return;
    this.lastTyping.set(userId, now);
    this.broadcast({ type: 'TYPING', payload: { userId } }, ws);
  }

  private async profanityFilter(): Promise<(t: string) => string> {
    if (this.profanity && Date.now() - this.profanity.loadedAt < PROFANITY_CACHE_MS) return this.profanity.filter;
    let extra: string[] = [];
    try {
      const list = await this.env.KV.get<unknown>('profanity:list', 'json');
      if (Array.isArray(list)) extra = list.filter((w): w is string => typeof w === 'string');
    } catch (err) {
      console.error('profanity list load failed', err);
    }
    const filter = buildProfanityFilter([...DEFAULT_PROFANITY, ...extra]);
    this.profanity = { filter, loadedAt: Date.now() };
    return filter;
  }

  private systemMessage(content: string): void {
    this.pushChat({
      id: crypto.randomUUID(),
      messageType: 'system',
      content,
      senderId: 'system',
      senderName: 'System',
      senderAvatar: '📣',
      timestamp: Date.now(),
    });
  }

  private pushChat(message: ChatMessage): void {
    const room = this.room!;
    room.chat.push(message);
    if (room.chat.length > CHAT_HISTORY) room.chat.splice(0, room.chat.length - CHAT_HISTORY);
    this.broadcast({ type: 'CHAT', payload: message });
  }

  // --------------------------------------------------------------- voice

  /** Point-to-point relay: only between two human players of this room. */
  private relayVoice(
    ws: WebSocket,
    seat: Seat | null,
    msg: Extract<RoomClientMessage, { type: 'VOICE_OFFER' | 'VOICE_ANSWER' | 'VOICE_ICE_CANDIDATE' }>,
  ): void {
    const room = this.room!;
    const targetId = msg.payload?.targetPlayerId;
    const target = room.seats.find((s) => !s.isAI && s.userId === targetId);
    if (!seat || !target || target.userId === seat.userId) return this.sendError(ws, 'Invalid voice target', 'bad_voice_target');

    let out: RoomServerMessage;
    if (msg.type === 'VOICE_ICE_CANDIDATE') {
      if (!msg.payload.candidate || typeof msg.payload.candidate !== 'object') return this.sendError(ws, 'Bad ICE candidate', 'bad_voice');
      out = { type: 'VOICE_ICE_CANDIDATE', payload: { fromPlayerId: seat.userId, candidate: msg.payload.candidate } };
    } else {
      const sdp = msg.payload.sdp;
      if (!sdp || typeof sdp !== 'object' || typeof sdp.sdp !== 'string') return this.sendError(ws, 'Bad SDP', 'bad_voice');
      out = { type: msg.type, payload: { fromPlayerId: seat.userId, sdp: { type: sdp.type, sdp: sdp.sdp } } };
    }
    for (const peer of this.ctx.getWebSockets(target.userId)) safeSend(peer, out);
  }

  private async onVoiceState(
    ws: WebSocket,
    seat: Seat | null,
    msg: Extract<RoomClientMessage, { type: 'VOICE_MUTE_STATUS' | 'VOICE_STATE' }>,
  ): Promise<void> {
    if (!seat || seat.isAI) return this.sendError(ws, 'Spectators cannot use voice', 'not_player');
    if (msg.type === 'VOICE_MUTE_STATUS') {
      const muted = msg.payload?.muted === true;
      seat.voice = muted ? 'muted' : 'on';
      this.broadcast({ type: 'VOICE_MUTE_STATUS', payload: { playerId: seat.userId, muted } }, ws);
    } else {
      const voice = msg.payload?.voice;
      if (voice !== 'off' && voice !== 'on' && voice !== 'muted') return this.sendError(ws, 'Bad voice state', 'bad_voice');
      seat.voice = voice;
    }
    this.broadcastPlayers();
    await this.persist();
  }

  // ------------------------------------------------------------- sockets

  private async onSocketGone(ws: WebSocket): Promise<void> {
    const room = this.room;
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!room || !att) return;
    const stillHere = this.ctx.getWebSockets(att.userId).some((s) => s !== ws && s.readyState === WebSocket.OPEN);
    if (!stillHere && att.seat !== null) {
      const seat = room.seats[att.seat];
      if (seat) {
        seat.voice = 'off';
        this.systemMessage(`${seat.displayName} left`);
        this.broadcastPlayers();
      }
    }
    if (this.ctx.getWebSockets().every((s) => s === ws || s.readyState !== WebSocket.OPEN)) {
      room.expireAt = Date.now() + ROOM_TTL_MS;
    }
    await this.persist();
  }

  private isConnected(userId: string): boolean {
    return this.ctx.getWebSockets(userId).some((s) => s.readyState === WebSocket.OPEN);
  }

  private players(): RoomPlayer[] {
    return this.room!.seats.map(({ timeouts: _t, forfeited: _f, rematch: _r, ...p }) => ({
      ...p,
      connected: p.isAI || this.isConnected(p.userId),
    }));
  }

  private sendSnapshot(ws: WebSocket): void {
    const room = this.room!;
    const att = ws.deserializeAttachment() as Attachment | null;
    const snapshot: RoomSnapshot = {
      roomId: room.roomId,
      gameId: room.gameId,
      status: room.status,
      players: this.players(),
      state: room.state,
      yourSeat: att?.seat ?? null,
      turnDeadline: room.turnDeadline,
      turn: room.turn,
      winner: room.winner,
      chat: room.chat,
    };
    safeSend(ws, { type: 'SNAPSHOT', payload: snapshot } satisfies RoomServerMessage);
  }

  private broadcastState(lastMove: unknown, bySeat: number): void {
    const room = this.room!;
    this.broadcast({
      type: 'STATE',
      payload: { state: room.state, lastMove, bySeat, turnDeadline: room.turnDeadline, turn: room.turn },
    });
  }

  private broadcastPlayers(): void {
    this.broadcast({ type: 'PLAYER_UPDATE', payload: { players: this.players() } });
  }

  private broadcast(msg: RoomServerMessage, except?: WebSocket): void {
    const frame = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) if (ws !== except) safeSend(ws, frame);
  }

  private sendError(ws: WebSocket, message: string, code: string): void {
    safeSend(ws, { type: 'ERROR', payload: { message, code } } satisfies RoomServerMessage);
  }

  // ------------------------------------------------------------- helpers

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private engine(): GameEngine<any, any> {
    return getEngine(this.room!.gameId)!;
  }

  /** Continues the room's RNG stream from where it left off (survives eviction). */
  private rng(): Rng {
    return createRng(this.room!.rngState);
  }

  private humanSeat(u: PublicUser, seat: number): Seat {
    return {
      seat,
      userId: u.id,
      displayName: u.displayName,
      avatar: u.avatar,
      isAI: false,
      voice: 'off',
      timeouts: 0,
      forfeited: false,
      rematch: false,
    };
  }

  /** Saves the record and re-arms the alarm to the earliest pending deadline. */
  private async persist(): Promise<void> {
    const room = this.room;
    if (!room) return;
    await this.ctx.storage.put('room', room);
    const next = [room.aiMoveAt, room.turnDeadline, room.expireAt].filter((t): t is number => t !== null);
    if (next.length > 0) await this.ctx.storage.setAlarm(Math.min(...next));
    else await this.ctx.storage.deleteAlarm();
  }

  private sessionId(): string {
    return `${this.room!.roomId}:${this.room!.round}`;
  }

  // D1 writes are best-effort: a reporting failure must never break a live game.
  private async recordStart(): Promise<void> {
    const room = this.room!;
    const id = this.sessionId();
    const hasAi = room.seats.some((s) => s.isAI) ? 1 : 0;
    try {
      await this.env.DB.batch([
        this.env.DB.prepare(
          "INSERT OR IGNORE INTO game_sessions (id, room_id, game_id, status, mode, has_ai_players, started_at, rng_seed) VALUES (?, ?, ?, 'playing', ?, ?, ?, ?)",
        ).bind(id, room.roomId, room.gameId, room.mode, hasAi, Date.now(), room.seed),
        ...room.seats.map((s) =>
          this.env.DB.prepare(
            'INSERT OR IGNORE INTO game_players (game_session_id, seat, user_id, is_ai, ai_difficulty, ai_persona) VALUES (?, ?, ?, ?, ?, ?)',
          ).bind(id, s.seat, s.isAI ? null : s.userId, s.isAI ? 1 : 0, s.aiDifficulty ?? null, s.aiPersona ?? null),
        ),
      ]);
    } catch (err) {
      console.error('recordStart failed', err);
    }
  }

  private async recordEnd(winner: number | null, reason: 'win' | 'draw' | 'forfeit' | 'abandoned'): Promise<void> {
    const room = this.room!;
    const id = this.sessionId();
    const winnerSeat = winner !== null && winner >= 0 ? room.seats[winner] : undefined;
    const resultFor = (s: Seat): string | null => {
      if (reason === 'abandoned') return null;
      if (winner === DRAW) return 'draw';
      if (s.seat === winner) return 'win';
      return s.forfeited || (reason === 'forfeit' && s.timeouts >= MAX_TIMEOUTS) ? 'forfeit' : 'loss';
    };
    try {
      await this.env.DB.batch([
        this.env.DB.prepare(
          'UPDATE game_sessions SET status = ?, ended_at = ?, winner_seat = ?, winner_user_id = ?, move_log = ? WHERE id = ?',
        ).bind(
          reason === 'abandoned' ? 'abandoned' : 'finished',
          Date.now(),
          winner !== null && winner >= 0 ? winner : null,
          winnerSeat && !winnerSeat.isAI ? winnerSeat.userId : null,
          JSON.stringify(room.moveLog),
          id,
        ),
        ...room.seats.map((s) =>
          this.env.DB.prepare('UPDATE game_players SET result = ? WHERE game_session_id = ? AND seat = ?').bind(resultFor(s), id, s.seat),
        ),
      ]);
    } catch (err) {
      console.error('recordEnd failed', err);
    }
  }
}
