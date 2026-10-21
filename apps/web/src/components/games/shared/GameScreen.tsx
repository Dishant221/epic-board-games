import { getGameLayout, type GameInfo, type GameLayout } from '@ebg/game-core';
import { lazy, Suspense, useEffect, useState, type ComponentType } from 'react';
import type { GameSessionView } from '../../../lib/session';
import { isMuted, setMuted } from '../../../lib/sound';
import { BottomSheet } from './BottomSheet';
import { GameOverModal } from './GameOverModal';
import { InGameChat, QuickEmoteBar } from './InGameChat';
import { PlayerPanel, SEAT_COLORS } from './PlayerPanel';
import { VoiceControls } from './VoiceControls';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BoardComponent = ComponentType<{ session: GameSessionView<any, any>; size: number; dicePosition: GameLayout['dicePosition'] }>;

const BOARDS: Record<string, BoardComponent> = {
  tic_tac_toe: lazy(() => import('../boards/TicTacToeBoard')) as BoardComponent,
  connect4: lazy(() => import('../boards/Connect4Board')) as BoardComponent,
  snakes_ladders: lazy(() => import('../boards/SnakesLaddersBoard')) as BoardComponent,
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

interface Props {
  game: GameInfo;
  session: GameSessionView;
  roomId?: string;
  onExit(): void;
}

/** ResponsiveGameWrapper: picks a desktop / tablet / mobile layout and arranges the board, players and chat. */
export function GameScreen({ game, session, roomId, onExit }: Props) {
  const vp = useViewport();
  const layout = getGameLayout(vp.width, vp.height - 56, game.id);
  const [sheet, setSheet] = useState<'chat' | 'emotes' | null>(null);
  const [overlayChat, setOverlayChat] = useState(false);
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const [muted, setMutedState] = useState(isMuted());
  const [dismissedRotate, setDismissedRotate] = useState(false);
  const [unread, setUnread] = useState(0);
  const [seenCount, setSeenCount] = useState(session.chat.length);
  const Board = BOARDS[game.id];

  // Let the winning move finish animating before the game-over dialog covers it.
  const [showGameOver, setShowGameOver] = useState(false);
  useEffect(() => {
    if (session.winner === null) return setShowGameOver(false);
    const t = window.setTimeout(() => setShowGameOver(true), game.id === 'snakes_ladders' ? 2200 : 700);
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

  // Keyboard shortcut: space / R rolls in dice games.
  useEffect(() => {
    if (game.id !== 'snakes_ladders') return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return;
      if ((e.code === 'Space' || e.key === 'r') && session.canMove) {
        e.preventDefault();
        session.submitMove({ type: 'roll' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game.id, session]);

  const current = session.currentSeat === null ? null : session.players[session.currentSeat];
  const myTurn = session.canMove;
  const turnText =
    session.status === 'connecting' ? 'Connecting…'
      : session.status === 'waiting' ? 'Waiting for players…'
      : session.winner !== null ? 'Game over'
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
    : undefined;

  const players = (
    <PlayerPanel players={session.players} currentSeat={session.currentSeat} thinkingSeat={session.thinkingSeat} mySeats={session.mySeats} speaking={speaking} variant={layout.playerPanel} detail={detail} />
  );

  const hud = (
    <div className="game-hud flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-2 ring-1 ring-white/10" role="status">
      <span className="size-3 shrink-0 rounded-full" style={{ background: session.currentSeat === null ? '#64748b' : SEAT_COLORS[session.currentSeat] }} aria-hidden="true" />
      <span className={`font-display font-semibold ${myTurn ? 'text-white' : 'text-slate-300'}`}>{turnText}</span>
      {session.error && <span className="text-sm text-rose-300" role="alert">{session.error}</span>}
      <span className="ml-auto flex items-center gap-1">
        <button type="button" className="btn-ghost px-2 py-1 text-sm" onClick={toggleSound} aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}>{muted ? '🔈' : '🔊'}</button>
        <button type="button" className="btn-ghost px-2 py-1 text-sm" onClick={onExit} aria-label="Leave game">🚪</button>
      </span>
    </div>
  );

  const board = Board && (
    <Suspense fallback={<div className="animate-pulse rounded-3xl bg-white/5" style={{ width: layout.boardSize.width, height: layout.boardSize.height }} />}>
      <Board session={session} size={layout.boardSize.width} dicePosition={layout.dicePosition} />
    </Suspense>
  );

  return (
    <div className={`game-wrapper w-full ${layout.device}-game ${layout.orientation === 'landscape' ? 'landscape-game' : ''}`}>
      {layout.suggestRotate && !dismissedRotate && (
        <div className="mx-4 mt-2 flex items-center gap-2 rounded-xl bg-amber-500/15 px-3 py-2 text-sm text-amber-100 ring-1 ring-amber-400/30">
          📱↻ Rotate your device for a better experience
          <button type="button" className="ml-auto text-amber-200" onClick={() => setDismissedRotate(true)} aria-label="Dismiss">✕</button>
        </div>
      )}

      {layout.device === 'desktop' ? (
        <div className="mx-auto grid max-w-[1600px] grid-cols-[240px_1fr_320px] gap-4 p-4">
          <aside className="space-y-3">
            <h2 className="font-display text-xl font-bold">{game.emoji} {game.name}</h2>
            {players}
          </aside>
          <section className="flex flex-col items-center gap-3">
            <div className="w-full max-w-[700px]">{hud}</div>
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
      )}

      {showGameOver && session.winner !== null && (
        <GameOverModal winner={session.winner} players={session.players} mySeats={session.mySeats} onRematch={session.rematch} onExit={onExit} />
      )}
    </div>
  );
}
