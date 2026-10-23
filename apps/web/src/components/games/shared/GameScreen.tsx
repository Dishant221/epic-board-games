import { getEngine, getGameLayout, TURN_TIMEOUT_MS, type GameInfo, type GameLayout } from '@ebg/game-core';
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import type { GameSessionView } from '../../../lib/session';
import { isMuted, setMuted } from '../../../lib/sound';
import { BottomSheet } from './BottomSheet';
import { GameOverModal } from './GameOverModal';
import { InGameChat, QuickEmoteBar } from './InGameChat';
import { PlayerPanel, SEAT_COLORS } from './PlayerPanel';
import { VoiceControls } from './VoiceControls';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BoardProps = { session: GameSessionView<any, any>; size: number; dicePosition: GameLayout['dicePosition'] };
type BoardComponent = ComponentType<BoardProps>;

const BOARDS: Record<string, BoardComponent> = {
  tic_tac_toe: lazy(() => import('../boards/TicTacToeBoard')) as BoardComponent,
  connect4: lazy(() => import('../boards/Connect4Board')) as BoardComponent,
  snakes_ladders: lazy(() => import('../boards/SnakesLaddersBoard')) as BoardComponent,
  chess: lazy(() => import('../boards/ChessBoard')) as BoardComponent,
  checkers: lazy(() => import('../boards/CheckersBoard')) as BoardComponent,
  epic_business: lazy(() => import('../boards/EpicBusinessBoard')) as BoardComponent,
  sudoku: lazy(() => import('../boards/SudokuBoard')) as BoardComponent,
  word_puzzle: lazy(() => import('../boards/WordPuzzleBoard')) as BoardComponent,
  crossword: lazy(() => import('../boards/CrosswordBoard')) as BoardComponent,
  mahjong: lazy(() => import('../boards/MahjongBoard')) as BoardComponent,
  epic_puzzle: lazy(() => import('../boards/EpicPuzzleBoard')) as BoardComponent,
};

/** Games where bare letter keys are input, so single-key shortcuts (F) are disabled. */
const TYPING_GAMES = new Set(['word_puzzle', 'crossword']);

/** How long to let the winning move animate before the game-over dialog appears. */
const GAME_OVER_DELAY: Record<string, number> = {
  snakes_ladders: 2200, chess: 1200, checkers: 1000, epic_business: 1500, word_puzzle: 1800, sudoku: 1200, crossword: 900, mahjong: 900, epic_puzzle: 1800,
};

function useViewport() {
  const read = () => ({ width: window.innerWidth, height: window.innerHeight });
  const [vp, setVp] = useState(read);
  useEffect(() => {
    let t: number | undefined;
    const onResize = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => setVp(read()), 100);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  return vp;
}

/**
 * Fullscreen toggle: uses the Fullscreen API when available and falls back to
 * a fixed-position CSS class (iOS Safari has no element fullscreen).
 */
export function useFullscreen(ref: React.RefObject<HTMLElement | null>) {
  const [active, setActive] = useState(false);
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    const onChange = () => setActive(document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [ref]);
  // Esc leaves the CSS fallback too.
  useEffect(() => {
    if (!fallback) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFallback(false);
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [fallback]);
  const toggle = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (document.fullscreenEnabled && typeof el.requestFullscreen === 'function') {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => setFallback((f) => !f));
      else void el.requestFullscreen({ navigationUI: 'hide' }).catch(() => setFallback(true));
    } else {
      setFallback((f) => !f);
    }
  }, [ref]);
  return { isFullscreen: active || fallback, fallback, toggle };
}

function TurnTimer({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [deadline]);
  const remaining = Math.max(0, deadline - now);
  const pct = Math.min(100, (remaining / TURN_TIMEOUT_MS) * 100);
  const secs = Math.ceil(remaining / 1000);
  return (
    <div className="flex items-center gap-2" aria-label={`${secs} seconds left in this turn`}>
      <div className="h-1 w-16 overflow-hidden rounded-full bg-white/10 sm:w-24">
        <div className={`turn-bar ${secs <= 10 ? 'urgent' : ''}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`tabular-nums text-xs ${secs <= 10 ? 'font-bold text-rose-300' : 'text-slate-400'}`}>{secs}s</span>
    </div>
  );
}

interface Props {
  game: GameInfo;
  session: GameSessionView;
  roomId?: string;
  onExit(): void;
}

/** ResponsiveGameWrapper: picks a desktop / tablet / mobile layout and arranges the board, players and chat. */
export function GameScreen({ game, session, roomId, onExit }: Props) {
  const vp = useViewport();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, fallback, toggle: toggleFullscreen } = useFullscreen(wrapperRef);
  const layout = getGameLayout(vp.width, vp.height - (isFullscreen ? 0 : 56), game.id);
  const [sheet, setSheet] = useState<'chat' | 'emotes' | null>(null);
  const [overlayChat, setOverlayChat] = useState(false);
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const [muted, setMutedState] = useState(isMuted());
  const [dismissedRotate, setDismissedRotate] = useState(false);
  const [unread, setUnread] = useState(0);
  const [seenCount, setSeenCount] = useState(session.chat.length);
  // One-time onboarding tip (per device) about the fullscreen shortcut.
  const [tip, setTip] = useState(() => {
    try {
      return localStorage.getItem('ebg:tip:fullscreen') !== '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (!tip) return;
    const t = window.setTimeout(() => {
      setTip(false);
      try {
        localStorage.setItem('ebg:tip:fullscreen', '1');
      } catch {
        /* storage unavailable */
      }
    }, 7000);
    return () => window.clearTimeout(t);
  }, [tip]);
  const Board = BOARDS[game.id];
  const solo = session.mode === 'solo';

  // Let the winning move finish animating before the game-over dialog covers it.
  const [showGameOver, setShowGameOver] = useState(false);
  useEffect(() => {
    if (session.winner === null) return setShowGameOver(false);
    const t = window.setTimeout(() => setShowGameOver(true), GAME_OVER_DELAY[game.id] ?? 700);
    return () => window.clearTimeout(t);
  }, [session.winner, game.id]);

  const chatOpen = layout.chatPosition === 'sidebar' || overlayChat || sheet === 'chat';
  useEffect(() => {
    if (chatOpen) {
      setSeenCount(session.chat.length);
      setUnread(0);
    } else {
      setUnread(session.chat.length - seenCount);
    }
  }, [session.chat.length, chatOpen, seenCount]);

  // Keyboard shortcuts: space / R rolls in dice games, F toggles fullscreen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select, [contenteditable]')) return;
      if ((e.key === 'f' || e.key === 'F') && !TYPING_GAMES.has(game.id) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        toggleFullscreen();
        return;
      }
      if (game.id === 'snakes_ladders' && (e.code === 'Space' || e.key === 'r') && session.canMove) {
        e.preventDefault();
        session.submitMove({ type: 'roll' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game.id, session, toggleFullscreen]);

  const current = session.currentSeat === null ? null : session.players[session.currentSeat];
  const myTurn = session.canMove;
  const simultaneous = !!getEngine(game.id)?.simultaneous;
  const turnText =
    session.status === 'connecting' ? 'Connecting…'
      : session.status === 'waiting' ? 'Waiting for players…'
      : session.winner !== null ? 'Game over'
      : solo ? game.name
      : simultaneous ? 'Work together!'
      : myTurn ? (session.mySeats.length > 1 ? `${current?.displayName}’s turn` : 'Your turn!')
      : current ? `${current.displayName}’s turn` : '';

  const toggleSound = () => {
    setMuted(!muted);
    setMutedState(!muted);
  };

  const isOnline = session.mode === 'online';
  const voice = isOnline && roomId && (
    <VoiceControls socket={session.socket} roomId={roomId} localUserId={session.localUserId} players={session.players} onSpeaking={setSpeaking} compact={layout.controlSize !== 'full'} />
  );
  const chat = (
    <InGameChat
      messages={session.chat}
      players={session.players}
      typingUserIds={session.typingUserIds}
      localUserId={session.localUserId}
      onSend={session.sendChat}
      onEmote={session.sendEmote}
      onTyping={session.sendTyping}
      textEnabled={session.mode !== 'ai'}
    />
  );
  const detail = game.id === 'snakes_ladders'
    ? (p: { seat: number }) => {
        const pos = (session.state as { positions?: number[] } | null)?.positions?.[p.seat];
        return pos === undefined ? null : pos === 0 ? 'Start' : `Square ${pos}`;
      }
    : game.id === 'epic_business'
      ? (p: { seat: number }) => {
          const cash = (session.state as { players?: { cash?: number; bankrupt?: boolean }[] } | null)?.players?.[p.seat];
          return cash === undefined ? null : cash.bankrupt ? 'Bankrupt' : `${cash.cash?.toLocaleString() ?? 0} cr`;
        }
      : undefined;

  const players = (
    <PlayerPanel players={session.players} currentSeat={session.currentSeat} thinkingSeat={session.thinkingSeat} mySeats={session.mySeats} speaking={speaking} variant={layout.playerPanel} detail={detail} />
  );

  const hud = (
    <div className="game-hud flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-2 ring-1 ring-white/10" role="status">
      {!solo && (
        <span className="size-3 shrink-0 rounded-full" style={{ background: session.currentSeat === null ? '#64748b' : SEAT_COLORS[session.currentSeat] }} aria-hidden="true" />
      )}
      {solo && <span aria-hidden="true">{game.emoji}</span>}
      <span className={`truncate font-display font-semibold ${myTurn ? 'text-white' : 'text-slate-300'}`}>{turnText}</span>
      {isOnline && session.turnDeadline !== null && session.winner === null && !simultaneous && <TurnTimer deadline={session.turnDeadline} />}
      {session.error && <span className="text-sm text-rose-300" role="alert">{session.error}</span>}
      <span className="ml-auto flex shrink-0 items-center gap-1">
        <button type="button" className="btn-ghost px-2 py-1 text-sm" onClick={toggleSound} aria-label={muted ? 'Unmute sounds' : 'Mute sounds'} aria-pressed={!muted}>{muted ? '🔈' : '🔊'}</button>
        <button type="button" className="btn-ghost px-2 py-1 text-sm" onClick={toggleFullscreen} aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} aria-pressed={isFullscreen} title="Fullscreen (F)">{isFullscreen ? '🗗' : '⛶'}</button>
        <button type="button" className="btn-ghost px-2 py-1 text-sm" onClick={onExit} aria-label="Leave game">🚪</button>
      </span>
    </div>
  );

  const board = Board && (
    <Suspense fallback={<div className="animate-pulse rounded-3xl bg-white/5" style={{ width: layout.boardSize.width, height: layout.boardSize.height }} />}>
      <Board session={session} size={layout.boardSize.width} dicePosition={layout.dicePosition} />
    </Suspense>
  );

  const summary = session.winner !== null && session.state ? getEngine(game.id)?.summary?.(session.state) ?? null : null;

  // Single-player puzzles: board front and centre, no player list or chat.
  const content = solo ? (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-3 p-2 sm:p-4">
      <div className="w-full max-w-[900px]">{hud}</div>
      {board}
    </div>
  ) : layout.device === 'desktop' ? (
    <div className="mx-auto grid max-w-[1600px] grid-cols-[240px_1fr_320px] gap-4 p-4">
      <aside className="space-y-3">
        <h2 className="font-display text-xl font-bold">{game.emoji} {game.name}</h2>
        {players}
      </aside>
      <section className="flex flex-col items-center gap-3">
        <div className="w-full max-w-[900px]">{hud}</div>
        {board}
      </section>
      <aside className="card flex h-[calc(100dvh-7rem)] flex-col gap-3 p-3">
        {voice}
        {chat}
      </aside>
    </div>
  ) : layout.device === 'tablet' ? (
    <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4">
      {players}
      {board && <div className="flex justify-center">{board}</div>}
      {hud}
      <div className="flex items-center gap-2">
        <button type="button" className="btn-ghost relative" onClick={() => setOverlayChat((v) => !v)} aria-expanded={overlayChat}>
          💬 Chat {unread > 0 && <span className="rounded-full bg-rose-500 px-1.5 text-xs">{unread}</span>}
        </button>
        {voice}
      </div>
      {overlayChat && <div className="card fixed right-4 bottom-4 z-40 flex h-[60dvh] w-96 flex-col p-3 shadow-2xl">{chat}</div>}
    </div>
  ) : (
    <div className={`flex gap-2 p-2 ${layout.playerPanel === 'sidebar' ? 'flex-row items-start' : 'flex-col'}`}>
      <div className={layout.playerPanel === 'sidebar' ? 'w-28 shrink-0' : ''}>{players}</div>
      {board && <div className="flex justify-center">{board}</div>}
      <div className="flex flex-col gap-2">
        {hud}
        {/* Icon-only toolbar */}
        <div className="flex items-center gap-2" role="toolbar" aria-label="Game tools">
          <button type="button" className="btn-ghost relative size-11 p-0" onClick={() => setSheet('chat')} aria-label="Open chat">
            💬 {unread > 0 && <span className="absolute -top-1 -right-1 rounded-full bg-rose-500 px-1.5 text-[10px]">{unread}</span>}
          </button>
          {voice}
          <div className="min-w-0 flex-1"><QuickEmoteBar onEmote={session.sendEmote} /></div>
        </div>
      </div>
      <BottomSheet open={sheet === 'chat'} title="Chat" onClose={() => setSheet(null)}>{chat}</BottomSheet>
    </div>
  );

  return (
    <div
      ref={wrapperRef}
      className={`game-wrapper w-full ${layout.device}-game ${layout.orientation === 'landscape' ? 'landscape-game' : ''} ${fallback ? 'game-fullscreen' : ''}`}
    >
      {layout.suggestRotate && !dismissedRotate && (
        <div className="mx-4 mt-2 flex items-center gap-2 rounded-xl bg-amber-500/15 px-3 py-2 text-sm text-amber-100 ring-1 ring-amber-400/30">
          📱↻ Rotate your device for a better experience
          <button type="button" className="ml-auto text-amber-200" onClick={() => setDismissedRotate(true)} aria-label="Dismiss">✕</button>
        </div>
      )}

      {content}

      {tip && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4 md:bottom-6" aria-live="polite">
          <p className="animate-pop rounded-full bg-black/70 px-4 py-2 text-sm shadow-lg ring-1 ring-white/10">
            Tip: tap ⛶ or press <kbd className="rounded bg-white/10 px-1">F</kbd> for fullscreen{game.id === 'snakes_ladders' ? ' · Space rolls the dice' : ''}
          </p>
        </div>
      )}

      {showGameOver && session.winner !== null && (
        <GameOverModal winner={session.winner} players={session.players} mySeats={session.mySeats} summary={summary} onRematch={session.rematch} onExit={onExit} />
      )}
    </div>
  );
}
