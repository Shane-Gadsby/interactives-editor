//The player (src/rooms.ts) and the server (shared/rooms.mjs) each clean a room's settings and a message, and they have to agree: the
//server decides what is kept and what is blocked, the player shows what it worked out from a reply and refuses the same things early.
import { describe, expect, it } from 'vitest';
import { cleanMessage, cleanRoomSettings, roomAllows } from 'interactives-player';
// @ts-expect-error plain ESM shared with index.js
import * as server from '../shared/rooms.mjs';

describe('player and server agree', () => {
  it('on cleaning a message', () => {
    for (const w of ['hi', '  hi   there ', '', '   ', 'x'.repeat(5000), 'a\u0000b\nc', 'café', 5, {}, null, undefined]) expect(server.cleanMessage(w)).toBe(cleanMessage(w));
  });

  it('on what is blocked', () => {
    const lists = [[], ['spam'], ['bad phrase'], ['SPAM', ' bad phrase ']];
    for (const list of lists) for (const w of ['spam', 'Spam!', 'a bad phrase here', 'bad', 'classy', 'unspammed']) expect(!server.isBlockedMessage(w, list)).toBe(roomAllows(w, list));
  });

  it('on the settings and their defaults', () => {
    for (const raw of [undefined, {}, { names: 'first', show: 9999, blocked: [' a ', 5] }, { names: 'real', show: -1 }, { show: 'x' }]) {
      const c = cleanRoomSettings(raw);
      const d = server.cleanRoomDeclaration(raw);
      expect(d).toEqual({ names: c.names, show: c.show, blocked: c.blocked });
    }
  });

  it('on reading what a shared page declares', () => {
    const page = (ds: unknown[]) => `<html><script type="application/json" id="ix-project">${JSON.stringify({ dataSources: ds })}</script></html>`;
    expect(server.declaredRooms('<html></html>')).toEqual({});
    expect(server.declaredRooms(page([{ id: 'a', name: 'chat', kind: 'json', source: 'room', room: { names: 'first' } }, { id: 'b', name: 'words', kind: 'json', source: 'shared' }, { id: 'bad id!', name: 'x', source: 'room' }]))).toEqual({ a: { names: 'first', show: 100, blocked: [], name: 'chat' } });
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, name: `r${i}`, kind: 'json', source: 'room' }));
    expect(Object.keys(server.declaredRooms(page(many)))).toHaveLength(10);
  });
});

describe('seats', () => {
  it('are the same for the same person and room, different between rooms and people, and carry nothing of the username', () => {
    const a = server.seatFor('secret-secret-secret-secret-secret-', 'p1', 'rm', 'MAT1000', 'sam');
    expect(server.seatFor('secret-secret-secret-secret-secret-', 'p1', 'rm', 'MAT1000', 'sam')).toBe(a);
    expect(a).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+ \d\d$/);
    const seats = new Set(['sam', 'lee', 'kim', 'ann', 'bob', 'cat', 'dan', 'eve'].map((u) => server.seatFor('secret-secret-secret-secret-secret-', 'p1', 'rm', 'MAT1000', u)));
    expect(seats.size).toBeGreaterThan(6);
    expect(server.seatFor('secret-secret-secret-secret-secret-', 'p1', 'rm', 'PHY2000', 'sam')).not.toBe(a);
    expect(server.seatFor('another-secret-another-secret-another', 'p1', 'rm', 'MAT1000', 'sam')).not.toBe(a);
    expect(a.toLowerCase()).not.toContain('sam');
  });

  it('are a first name only when the author said so, and only a first name', () => {
    expect(server.displayName({ names: 'seat' }, 'Quiet Otter 41', 'Sam')).toBe('Quiet Otter 41');
    expect(server.displayName({ names: 'first' }, 'Quiet Otter 41', 'Sam')).toBe('Sam');
    expect(server.displayName({ names: 'first' }, 'Quiet Otter 41', '')).toBe('Quiet Otter 41');
    expect(server.displayName({ names: 'first' }, 'Quiet Otter 41', undefined)).toBe('Quiet Otter 41');
    expect(server.displayName({ names: 'first' }, 'Quiet Otter 41', 'x'.repeat(100))).toHaveLength(40);
  });

  it('give ids that sort in the order messages were made', () => {
    const ids = Array.from({ length: 200 }, () => server.messageId());
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(200);
  });
});
