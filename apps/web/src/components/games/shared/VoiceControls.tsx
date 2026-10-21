import type { RoomPlayer } from '@ebg/game-core';
import { useEffect, useRef, useState } from 'react';
import { VoiceChatManager } from '../../../lib/voice-chat';

interface Props {
  socket: WebSocket | null;
  roomId: string;
  localUserId: string;
  players: RoomPlayer[];
  onSpeaking(speaking: Set<string>): void;
  compact?: boolean;
}

export function VoiceControls({ socket, roomId, localUserId, players, onSpeaking, compact }: Props) {
  const manager = useRef<VoiceChatManager | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showVolumes, setShowVolumes] = useState(false);

  const voicePeers = players.filter((p) => !p.isAI && p.userId !== localUserId && p.voice !== 'off').map((p) => p.userId);

  // Connect to players who turn voice on after us.
  useEffect(() => {
    voicePeers.forEach((id) => void manager.current?.connectTo(id));
  }, [voicePeers.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => manager.current?.disconnect(), []);

  const start = async () => {
    if (!socket) return;
    setError(null);
    const m = new VoiceChatManager({ gameRoomWs: socket, roomId, localPlayerId: localUserId, remotePlayers: voicePeers, onSpeaking });
    try {
      await m.startVoice();
      manager.current = m;
      setEnabled(true);
    } catch (err) {
      m.disconnect();
      setError(err instanceof DOMException && err.name === 'NotAllowedError' ? 'Microphone permission denied' : 'Could not start voice chat');
    }
  };

  const stop = () => {
    manager.current?.disconnect();
    manager.current = null;
    setEnabled(false);
    setMuted(false);
    setDeafened(false);
    onSpeaking(new Set());
  };

  const label = (full: string) => (compact ? undefined : full);

  if (!enabled) {
    return (
      <div className="flex items-center gap-2">
        <button type="button" className="btn-ghost text-sm" onClick={start} disabled={!socket} aria-label="Enable voice chat">
          🎤 {label('Enable voice')}
        </button>
        {error && <span className="text-xs text-rose-300" role="alert">{error}</span>}
      </div>
    );
  }

  const remote = players.filter((p) => !p.isAI && p.userId !== localUserId);
  return (
    <div className="relative flex items-center gap-2">
      <button type="button" className={`btn-ghost text-sm ${muted ? 'bg-rose-500/20' : ''}`} aria-pressed={muted} onClick={() => setMuted(manager.current?.toggleMute() ?? false)}>
        {muted ? '🔇' : '🎤'} {label(muted ? 'Unmute' : 'Mute')}
      </button>
      <button type="button" className={`btn-ghost text-sm ${deafened ? 'bg-rose-500/20' : ''}`} aria-pressed={deafened} onClick={() => setDeafened(manager.current?.toggleDeafen() ?? false)}>
        🎧 {label(deafened ? 'Undeafen' : 'Deafen')}
      </button>
      <button type="button" className="btn-ghost text-sm" aria-expanded={showVolumes} aria-label="Voice settings" onClick={() => setShowVolumes((v) => !v)}>
        ⚙️
      </button>
      <button type="button" className="btn-ghost text-sm" onClick={stop} aria-label="Leave voice">
        ✕
      </button>
      {showVolumes && (
        <div className="card absolute bottom-full left-0 z-20 mb-2 w-64 space-y-3 p-3">
          {remote.length === 0 && <p className="text-xs text-slate-400">No other players in voice yet.</p>}
          {remote.map((p) => (
            <label key={p.userId} className="block text-xs">
              {p.avatar} {p.displayName}
              <input type="range" min={0} max={1} step={0.05} defaultValue={1} className="w-full accent-violet-400" onChange={(e) => manager.current?.setPlayerVolume(p.userId, Number(e.target.value))} />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
