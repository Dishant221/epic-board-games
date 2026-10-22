import { describe, expect, it } from 'vitest';
import { buildProfanityFilter, getGameLayout, parseRoomClientMessage, RateLimiter, validateChatMessage } from '../src';

describe('chat moderation', () => {
  it('filters profanity with word boundaries', () => {
    const filter = buildProfanityFilter(['darn']);
    expect(filter('darn it, darnell')).toBe('**** it, darnell');
  });

  it('enforces length, spam and rate limits', () => {
    const limiter = new RateLimiter(5, 10_000);
    expect(validateChatMessage('x'.repeat(201), limiter)).toMatchObject({ valid: false, reason: 'Message too long' });
    expect(validateChatMessage('heyyyyyyy', limiter)).toMatchObject({ valid: false, reason: 'No spam' });
    for (let i = 0; i < 5; i++) expect(validateChatMessage('hello', limiter, undefined, 1000 + i).valid).toBe(true);
    expect(validateChatMessage('hello', limiter, undefined, 1006)).toMatchObject({ valid: false, reason: 'Slow down!' });
    expect(validateChatMessage('hello', limiter, undefined, 12_000).valid).toBe(true);
  });

  it('strips bidi override characters', () => {
    const res = validateChatMessage('hi‮there', new RateLimiter());
    expect(res).toEqual({ valid: true, filtered: 'hithere' });
  });
});

describe('protocol parsing', () => {
  it('rejects unknown types, bad JSON and oversize frames', () => {
    expect(parseRoomClientMessage('{"type":"MOVE","payload":{"move":{"cell":1},"turn":0}}')?.type).toBe('MOVE');
    expect(parseRoomClientMessage('{"type":"HACK"}')).toBeNull();
    expect(parseRoomClientMessage('not json')).toBeNull();
    expect(parseRoomClientMessage('"x"'.padEnd(20_000, ' '))).toBeNull();
  });
});

describe('responsive layout', () => {
  it('classifies devices', () => {
    expect(getGameLayout(375, 812, 'snakes_ladders')).toMatchObject({ device: 'mobile', chatPosition: 'bottom-sheet', boardSize: { width: 359 } });
    expect(getGameLayout(812, 375, 'chess')).toMatchObject({ device: 'mobile', playerPanel: 'sidebar', suggestRotate: false });
    expect(getGameLayout(375, 812, 'chess').suggestRotate).toBe(true);
    expect(getGameLayout(820, 1180, 'connect4')).toMatchObject({ device: 'tablet', chatPosition: 'overlay' });
    expect(getGameLayout(1440, 900, 'connect4')).toMatchObject({ device: 'desktop', boardSize: { width: 700 } });
  });
});
