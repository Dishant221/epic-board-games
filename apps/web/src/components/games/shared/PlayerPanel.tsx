import { AI_PERSONAS, type RoomPlayer } from '@ebg/game-core';

export const SEAT_COLORS = ['var(--color-p0)', 'var(--color-p1)', 'var(--color-p2)', 'var(--color-p3)'];

interface Props {
  players: RoomPlayer[];
  currentSeat: number | null;
  thinkingSeat: number | null;
  mySeats: number[];
  speaking: Set<string>;
  variant: 'sidebar' | 'top-bar' | 'compact-strip';
  /** Optional per-seat extra line, e.g. "Square 42". */
  detail?: (p: RoomPlayer) => string | null;
}

export function AIPlayerBadge({ player }: { player: RoomPlayer }) {
  if (!player.isAI || !player.aiDifficulty) return null;
  return (
    <span className="rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200">
      AI · {AI_PERSONAS[player.aiDifficulty].difficulty}
    </span>
  );
}

function VoiceIndicator({ player, speaking }: { player: RoomPlayer; speaking: boolean }) {
  if (player.isAI) return null;
  const icon = speaking ? '🔊' : player.voice === 'muted' ? '🔇' : player.voice === 'on' ? '🎤' : null;
  if (!icon) return null;
  return (
    <span className="text-xs" aria-label={speaking ? 'speaking' : player.voice === 'muted' ? 'muted' : 'mic on'}>
      {icon}
    </span>
  );
}

export function ThinkingBubble() {
  return (
    <span className="thinking-dots inline-flex items-end gap-0.5 rounded-full bg-white/10 px-2 py-1" aria-label="thinking">
      {[0, 1, 2].map((i) => (
        <span key={i} className="block size-1.5 rounded-full bg-white" />
      ))}
    </span>
  );
}

export function PlayerPanel({ players, currentSeat, thinkingSeat, mySeats, speaking, variant, detail }: Props) {
  const compact = variant !== 'sidebar';
  return (
    <ul
      className={
        variant === 'sidebar'
          ? 'flex flex-col gap-2'
          : 'no-scrollbar flex gap-2 overflow-x-auto'
      }
      aria-label="Players"
    >
      {players.map((p) => {
        const active = p.seat === currentSeat;
        const isSpeaking = speaking.has(p.userId);
        return (
          <li
            key={p.seat}
            className={`relative flex shrink-0 items-center gap-2 rounded-xl px-2.5 py-2 ring-1 transition ${
              active ? 'bg-white/10 ring-white/30' : 'bg-white/[0.03] ring-white/5'
            } ${!p.connected ? 'opacity-50' : ''}`}
            aria-current={active ? 'true' : undefined}
          >
            <span
              className={`grid size-9 shrink-0 place-items-center rounded-full text-lg ${isSpeaking ? 'speaking-ring' : ''}`}
              style={{ background: `color-mix(in srgb, ${SEAT_COLORS[p.seat]} 35%, transparent)`, boxShadow: active ? `0 0 0 2px ${SEAT_COLORS[p.seat]}` : undefined }}
              aria-hidden="true"
            >
              {p.avatar}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className={`truncate font-semibold ${compact ? 'max-w-20 text-xs' : 'max-w-32 text-sm'}`}>
                  {p.displayName}
                  {mySeats.includes(p.seat) && mySeats.length === 1 && <span className="text-slate-400"> (you)</span>}
                </span>
                <VoiceIndicator player={p} speaking={isSpeaking} />
              </span>
              {!compact && (
                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                  <AIPlayerBadge player={p} />
                  {detail?.(p)}
                  {!p.connected && 'Reconnecting…'}
                </span>
              )}
            </span>
            {thinkingSeat === p.seat && (
              <span className="absolute -top-2 -right-1">
                <ThinkingBubble />
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
