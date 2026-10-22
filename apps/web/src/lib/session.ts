import {
  AI_PERSONAS,
  chooseMove,
  createRng,
  getEmote,
  getEngine,
  randomSeed,
  RateLimiter,
  validateChatMessage,
  type AIDifficulty,
  type ChatMessage,
  type GameId,
  type RoomPlayer,
  type RoomServerMessage,
  type RoomSnapshot,
  type RoomStatus,
} from '@ebg/game-core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { wsUrl } from './api';

/** Everything a board + HUD needs, independent of where the game runs. */
export interface GameSessionView<S = unknown, M = unknown> {
  /** `solo` = single-player puzzle/arcade; `local` = pass-and-play on one device. */
  mode: 'ai' | 'local' | 'online' | 'solo';
  gameId: GameId;
  status: RoomStatus | 'connecting' | 'error';
  state: S | null;
  players: RoomPlayer[];
  /** Seats this browser controls. */
  mySeats: number[];
  currentSeat: number | null;
  canMove: boolean;
  thinkingSeat: number | null;
  winner: number | null;
  /** Server-side deadline for the current turn (online only). */
  turnDeadline: number | null;
  chat: ChatMessage[];
  typingUserIds: string[];
  error: string | null;
  /** The last move applied, for board animations. Incremented key forces re-animation. */
  moveKey: number;
  submitMove(move: M): void;
  sendChat(text: string): string | null;
  sendEmote(emoteId: string): void;
  sendTyping(): void;
  rematch(): void;
  /** Raw socket for the voice signaling channel (online mode only). */
  socket: WebSocket | null;
  localUserId: string;
}

const uid = () => crypto.randomUUID();

function systemMessage(content: string): ChatMessage {
  return { id: uid(), messageType: 'system', content, senderId: 'system', senderName: 'System', senderAvatar: '⚙️', timestamp: Date.now() };
}

// ------------------------------------------------------------------ local

export interface LocalSetup {
  gameId: GameId;
  /** One entry per AI opponent; empty array + humans>1 means pass-and-play. */
  ai: AIDifficulty[];
  humans: { name: string; avatar: string }[];
}

/**
 * Runs the engine in the browser: vs-AI games (spec: client-side AI for simple
 * games), single-player puzzles and same-device pass-and-play. Nothing here is
 * trusted by the server.
 */
export function useLocalSession<S, M>(setup: LocalSetup): GameSessionView<S, M> {
  const engine = getEngine(setup.gameId);
  if (!engine) throw new Error(`No engine for ${setup.gameId}`);
  const rng = useMemo(() => createRng(randomSeed()), []);

  const players = useMemo<RoomPlayer[]>(() => {
    const humans = setup.humans.map((h, i) => ({
      seat: i, userId: `local-${i}`, displayName: h.name, avatar: h.avatar,
      connected: true, isAI: false, voice: 'off' as const,
    }));
    const ais = setup.ai.map((d, i) => {
      const p = AI_PERSONAS[d];
      // "Nova", "Nova 2"… when several AIs share a difficulty.
      const nth = setup.ai.slice(0, i).filter((x) => x === d).length;
      return {
        seat: humans.length + i, userId: `ai-${i}`, displayName: nth ? `${p.name} ${nth + 1}` : p.name, avatar: p.emoji,
        connected: true, isAI: true, aiDifficulty: d, aiPersona: p.id, voice: 'off' as const,
      };
    });
    return [...humans, ...ais];
  }, [setup]);

  const [state, setState] = useState<S>(() => engine.init(players.length, rng));
  const [moveKey, setMoveKey] = useState(0);
  const [thinkingSeat, setThinkingSeat] = useState<number | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>(() => [systemMessage('Game started. Good luck!')]);
  const limiter = useRef(new RateLimiter());

  const winner = engine.winner(state);
  const currentSeat = winner === null ? engine.currentPlayer(state) : null;
  const current = currentSeat === null ? undefined : players[currentSeat];
  const humanSeats = useMemo(() => players.filter((p) => !p.isAI).map((p) => p.seat), [players]);

  const apply = useCallback(
    (move: M, seat: number) => {
      setState((s) => {
        if (engine.isTerminal(s)) return s;
        const legal = engine.legalMoves(s).some((m: M) => engine.sameMove(m, move));
        return legal ? engine.applyMove(s, move, rng, seat) : s;
      });
      setMoveKey((k) => k + 1);
    },
    [engine, rng],
  );

  // AI turn loop with a persona-specific "thinking" delay.
  useEffect(() => {
    if (!current?.isAI || !current.aiDifficulty) return;
    const difficulty = current.aiDifficulty;
    const seat = current.seat;
    setThinkingSeat(seat);
    const timer = window.setTimeout(() => {
      setThinkingSeat(null);
      apply(chooseMove(engine, state, difficulty, rng) as M, seat);
    }, AI_PERSONAS[difficulty].thinkDelayMs);
    return () => window.clearTimeout(timer);
    // Re-run on every state change so consecutive AI turns (extra rolls) work.
  }, [current, state, engine, rng, apply]);

  const postAs = useCallback((p: RoomPlayer, messageType: ChatMessage['messageType'], content: string) => {
    setChat((c) => [...c.slice(-99), { id: uid(), messageType, content, senderId: p.userId, senderName: p.displayName, senderAvatar: p.avatar, timestamp: Date.now() }]);
  }, []);

  // AI reaction emotes after the game ends.
  useEffect(() => {
    if (winner === null) return;
    const ai = players.find((p) => p.isAI);
    if (!ai) return;
    postAs(ai, 'emote', winner === ai.seat ? '😎 Good game!' : '🏆 Good game!');
  }, [winner, players, postAs]);

  const mode: GameSessionView['mode'] = setup.ai.length > 0 ? 'ai' : players.length === 1 ? 'solo' : 'local';
  // Co-operative games let any human move; otherwise only the seat to play.
  const canMove =
    thinkingSeat === null && winner === null && (engine.simultaneous ? humanSeats.length > 0 : currentSeat !== null && humanSeats.includes(currentSeat));

  return {
    mode,
    gameId: setup.gameId,
    status: winner === null ? 'playing' : 'finished',
    state,
    players,
    mySeats: humanSeats,
    currentSeat,
    canMove,
    thinkingSeat,
    winner,
    turnDeadline: null,
    chat,
    typingUserIds: [],
    error: null,
    moveKey,
    submitMove: (move) => {
      if (!canMove) return;
      const seat = engine.simultaneous ? humanSeats[0] ?? 0 : currentSeat!;
      apply(move, seat);
    },
    sendChat: (text) => {
      const res = validateChatMessage(text, limiter.current);
      if (!res.valid) return res.reason;
      postAs(players[humanSeats[0] ?? 0]!, 'text', res.filtered);
      return null;
    },
    sendEmote: (id) => {
      const e = getEmote(id);
      if (e) postAs(players[humanSeats[0] ?? 0]!, 'emote', `${e.emoji} ${e.text}`);
    },
    sendTyping: () => {},
    rematch: () => {
      setState(engine.init(players.length, rng));
      setMoveKey((k) => k + 1);
      setChat((c) => [...c, systemMessage(players.length === 1 ? 'New puzzle started.' : 'Rematch! New game started.')]);
    },
    socket: null,
    localUserId: 'local-0',
  };
}

// ----------------------------------------------------------------- online

/** Connects to a GameRoom Durable Object; the server is authoritative. */
export function useOnlineSession<S, M>(roomId: string, gameId: GameId, localUserId: string): GameSessionView<S, M> {
  const [snapshot, setSnapshot] = useState<RoomSnapshot<S> | null>(null);
  const [status, setStatus] = useState<GameSessionView['status']>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [thinkingSeat, setThinkingSeat] = useState<number | null>(null);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [moveKey, setMoveKey] = useState(0);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const turnRef = useRef(0);
  const lastTypingSent = useRef(0);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry = 0;
    let closed = false;
    let timer: number | undefined;
    let ping: number | undefined;

    const connect = () => {
      ws = new WebSocket(wsUrl(`/api/rooms/${encodeURIComponent(roomId)}/ws`));
      setSocket(ws);
      ws.addEventListener('open', () => {
        retry = 0;
        ping = window.setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send('{"type":"PING"}'), 25_000);
      });
      ws.addEventListener('message', (ev) => {
        let msg: RoomServerMessage<S>;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        switch (msg.type) {
          case 'SNAPSHOT':
            turnRef.current = msg.payload.turn;
            setSnapshot(msg.payload);
            setStatus(msg.payload.status);
            setMoveKey((k) => k + 1);
            break;
          case 'STATE':
            turnRef.current = msg.payload.turn;
            setThinkingSeat(null);
            setSnapshot((s) => (s ? { ...s, state: msg.payload.state, turnDeadline: msg.payload.turnDeadline } : s));
            setMoveKey((k) => k + 1);
            break;
          case 'PLAYER_UPDATE':
            setSnapshot((s) => (s ? { ...s, players: msg.payload.players } : s));
            break;
          case 'CHAT':
            setSnapshot((s) => (s ? { ...s, chat: [...s.chat.slice(-99), msg.payload] } : s));
            break;
          case 'TYPING':
            setTyping((t) => ({ ...t, [msg.payload.userId]: Date.now() }));
            break;
          case 'AI_THINKING':
            setThinkingSeat(msg.payload.seat);
            break;
          case 'GAME_OVER':
            setStatus('finished');
            setSnapshot((s) => (s ? { ...s, status: 'finished', winner: msg.payload.winner, turnDeadline: null } : s));
            break;
          case 'ERROR':
            setError(msg.payload.message);
            window.setTimeout(() => setError(null), 4000);
            break;
        }
      });
      ws.addEventListener('close', (ev) => {
        window.clearInterval(ping);
        if (closed) return;
        // 4xxx = application-level refusal (not a player, room gone): don't retry.
        if (ev.code >= 4000) {
          setStatus('error');
          setError(ev.reason || 'Could not join this room');
          return;
        }
        setStatus('connecting');
        timer = window.setTimeout(connect, Math.min(1000 * 2 ** retry++, 15_000));
      });
    };
    connect();
    return () => {
      closed = true;
      window.clearTimeout(timer);
      window.clearInterval(ping);
      ws?.close(1000);
    };
  }, [roomId]);

  const send = useCallback((msg: unknown) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
  }, [socket]);

  const engine = getEngine(gameId);
  const state = snapshot?.state ?? null;
  const winner = snapshot?.winner ?? (state && engine ? engine.winner(state) : null);
  const currentSeat = state && engine && winner === null ? engine.currentPlayer(state) : null;
  const yourSeat = snapshot?.yourSeat ?? null;
  const now = Date.now();
  const canMove =
    status === 'playing' && yourSeat !== null && winner === null && (engine?.simultaneous ? true : currentSeat !== null && currentSeat === yourSeat);

  return {
    mode: 'online',
    gameId,
    status,
    state,
    players: snapshot?.players ?? [],
    mySeats: yourSeat === null ? [] : [yourSeat],
    currentSeat,
    canMove,
    thinkingSeat,
    winner,
    turnDeadline: status === 'playing' ? snapshot?.turnDeadline ?? null : null,
    chat: snapshot?.chat ?? [],
    typingUserIds: Object.entries(typing).filter(([id, t]) => now - t < 3000 && id !== localUserId).map(([id]) => id),
    error,
    moveKey,
    submitMove: (move) => send({ type: 'MOVE', payload: { move, turn: turnRef.current } }),
    sendChat: (text) => {
      const trimmed = text.trim();
      if (!trimmed) return 'Message is empty';
      if (trimmed.length > 200) return 'Message too long';
      send({ type: 'CHAT', payload: { content: trimmed } });
      return null;
    },
    sendEmote: (emoteId) => send({ type: 'EMOTE', payload: { emoteId } }),
    sendTyping: () => {
      if (Date.now() - lastTypingSent.current < 2000) return;
      lastTypingSent.current = Date.now();
      send({ type: 'TYPING' });
    },
    rematch: () => send({ type: 'REMATCH' }),
    socket,
    localUserId,
  };
}
