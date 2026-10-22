import { MAX_MESSAGE_LENGTH, QUICK_EMOTES, type ChatMessage, type RoomPlayer } from '@ebg/game-core';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { play } from '../../../lib/sound';

interface Props {
  messages: ChatMessage[];
  players: RoomPlayer[];
  typingUserIds: string[];
  localUserId: string;
  onSend(text: string): string | null;
  onEmote(id: string): void;
  onTyping(): void;
  /** Text chat is disabled vs AI (spec: AI uses emotes only), emotes still work. */
  textEnabled?: boolean;
}

export function QuickEmoteBar({ onEmote }: { onEmote(id: string): void }) {
  return (
    <div className="no-scrollbar flex gap-1 overflow-x-auto" role="toolbar" aria-label="Quick emotes">
      {QUICK_EMOTES.map((e) => (
        <button
          key={e.id}
          type="button"
          onClick={() => onEmote(e.id)}
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/5 text-lg transition hover:scale-110 hover:bg-white/10"
          title={e.text}
          aria-label={e.text}
        >
          {e.emoji}
        </button>
      ))}
    </div>
  );
}

export function InGameChat({ messages, players, typingUserIds, localUserId, onSend, onEmote, onTyping, textEnabled = true }: Props) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const lastCount = useRef(messages.length);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    if (messages.length > lastCount.current && messages.at(-1)?.senderId !== localUserId) play('chat');
    lastCount.current = messages.length;
  }, [messages, localUserId]);

  const submit = (e: SubmitEvent) => {
    e.preventDefault();
    const err = onSend(text);
    setError(err);
    if (!err) setText('');
  };

  const typingNames = typingUserIds.map((id) => players.find((p) => p.userId === id)?.displayName).filter(Boolean);

  return (
    <section className="flex h-full min-h-0 flex-col gap-2" aria-label="Chat">
      <ol ref={listRef} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1 text-sm" aria-live="polite">
        {messages.map((m) =>
          m.messageType === 'system' ? (
            <li key={m.id} className="text-center text-xs text-slate-500">{m.content}</li>
          ) : (
            <li key={m.id} className={`flex gap-2 ${m.senderId === localUserId ? 'flex-row-reverse text-right' : ''}`}>
              <span aria-hidden="true">{m.senderAvatar}</span>
              <span className={`max-w-[80%] rounded-xl px-2.5 py-1.5 ${m.senderId === localUserId ? 'bg-violet-500/30' : 'bg-white/5'} ${m.messageType === 'emote' ? 'text-base' : ''}`}>
                <span className="block text-[10px] font-semibold text-slate-400">{m.senderName}</span>
                {/* React escapes text content, so user messages can't inject HTML. */}
                <span className="break-words">{m.content}</span>
              </span>
            </li>
          ),
        )}
      </ol>
      <p className="h-4 text-xs text-slate-400" aria-live="polite">
        {typingNames.length > 0 && `${typingNames.join(', ')} ${typingNames.length > 1 ? 'are' : 'is'} typing…`}
        {error && <span className="text-rose-300">{error}</span>}
      </p>
      {textEnabled && (
        <form onSubmit={submit} className="flex gap-2">
          <label className="sr-only" htmlFor="chat-input">Message</label>
          <input
            id="chat-input"
            className="input py-2 text-sm"
            placeholder="Type message…"
            maxLength={MAX_MESSAGE_LENGTH}
            value={text}
            autoComplete="off"
            onChange={(e) => {
              setText(e.target.value);
              onTyping();
            }}
          />
          <button type="submit" className="btn-primary px-3 py-2 text-sm" disabled={!text.trim()}>
            Send
          </button>
        </form>
      )}
      <QuickEmoteBar onEmote={onEmote} />
    </section>
  );
}
