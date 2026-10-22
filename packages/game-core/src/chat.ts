// Chat moderation shared by the client (instant feedback) and the GameRoom
// Durable Object (authoritative). The server is the source of truth: the
// client copy only exists so users see "Slow down!" without a round-trip.

export const MAX_MESSAGE_LENGTH = 200;
export const RATE_LIMIT = { messages: 5, windowMs: 10_000 } as const;

export const QUICK_EMOTES = [
  { id: 'gg', emoji: '🏆', text: 'Good game!' },
  { id: 'nice', emoji: '👍', text: 'Nice move!' },
  { id: 'hurry', emoji: '⏰', text: 'Hurry up!' },
  { id: 'oops', emoji: '😅', text: 'Oops!' },
  { id: 'laugh', emoji: '😂', text: 'Haha!' },
  { id: 'angry', emoji: '😤', text: 'Grr!' },
  { id: 'hi', emoji: '👋', text: 'Hello!' },
  { id: 'bye', emoji: '✌️', text: 'See ya!' },
  { id: 'think', emoji: '🤔', text: 'Hmm...' },
  { id: 'wow', emoji: '😮', text: 'Wow!' },
] as const;

export type EmoteId = (typeof QUICK_EMOTES)[number]['id'];

export function getEmote(id: string) {
  return QUICK_EMOTES.find((e) => e.id === id);
}

/**
 * Baseline list. Production extends it from KV (key `profanity:list`) so
 * moderators can update it without a deploy.
 */
export const DEFAULT_PROFANITY: readonly string[] = ['fuck', 'shit', 'bitch', 'cunt', 'asshole', 'bastard', 'dick', 'slut', 'whore'];

export type ChatValidation =
  | { valid: true; filtered: string }
  | { valid: false; reason: string };

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function buildProfanityFilter(words: readonly string[]): (text: string) => string {
  const clean = words.map((w) => w.trim().toLowerCase()).filter(Boolean);
  if (clean.length === 0) return (t) => t;
  const re = new RegExp(`\\b(${clean.map(escapeRegex).join('|')})\\b`, 'gi');
  return (text) => text.replace(re, (m) => '*'.repeat(m.length));
}

const defaultFilter = buildProfanityFilter(DEFAULT_PROFANITY);

/** Sliding-window limiter. Keep one instance per player. */
export class RateLimiter {
  private stamps: number[] = [];
  constructor(
    private readonly limit = RATE_LIMIT.messages,
    private readonly windowMs: number = RATE_LIMIT.windowMs,
  ) {}

  /** Records an attempt; returns false if the caller is over the limit. */
  tryConsume(now = Date.now()): boolean {
    this.stamps = this.stamps.filter((t) => now - t < this.windowMs);
    if (this.stamps.length >= this.limit) return false;
    this.stamps.push(now);
    return true;
  }
}

export function validateChatMessage(
  raw: unknown,
  limiter: RateLimiter,
  filter: (text: string) => string = defaultFilter,
  now = Date.now(),
): ChatValidation {
  if (typeof raw !== 'string') return { valid: false, reason: 'Invalid message' };
  // Strip control characters (incl. bidi overrides) that can spoof the UI.
  const content = raw.replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, '').trim();
  if (content.length === 0) return { valid: false, reason: 'Message is empty' };
  if (content.length > MAX_MESSAGE_LENGTH) return { valid: false, reason: 'Message too long' };
  if (/(.)\1{5,}/u.test(content)) return { valid: false, reason: 'No spam' };
  if (content.length >= 8 && content === content.toUpperCase() && /[A-Z]/.test(content)) {
    return { valid: false, reason: 'Please don’t shout' };
  }
  if (!limiter.tryConsume(now)) return { valid: false, reason: 'Slow down!' };
  return { valid: true, filtered: filter(content) };
}
