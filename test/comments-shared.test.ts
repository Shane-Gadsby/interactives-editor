// @vitest-environment node
//The pure side of review comments (shared/comments.mjs): what a browser may say, rows into threads, the panel's
//filters, who gets told, where a pin goes, and the sliding window.
import { describe, expect, it } from 'vitest';
import { Limiter, cleanAnchor, cleanAssignee, cleanMentions, cleanName, cleanText, countsOf, matchesFilter, noticesFor, peopleOf, pinSpot, snippet, threadsOf, validCommentID } from '../shared/comments.mjs';

const row = (id: string, thread: string, by: any, created: number, extra: Record<string, unknown> = {}) => ({ _id: id, thread, by, text: id, created: new Date(created), ...extra });
const root = (id: string, n: number, by: any, created: number, extra: Record<string, unknown> = {}) => row(id, id, by, created, { root: true, n, anchor: { artboardId: 'ab1', layerId: null, x: 1, y: 2 }, status: 'open', ...extra });

describe('what a browser may say', () => {
  it('keeps text between 1 and 2000 characters, newlines and all, minus control characters', () => {
    expect(cleanText('  hi\r\nthere\u0007  ')).toBe('hi\nthere');
    expect(cleanText('')).toBeNull();
    expect(cleanText('   ')).toBeNull();
    expect(cleanText('x'.repeat(2000))).toHaveLength(2000);
    expect(cleanText('x'.repeat(2001))).toBeNull();
    expect(cleanText(5)).toBeNull();
  });

  it('keeps a guest name to letters, numbers and a little punctuation', () => {
    expect(cleanName('  Dr   Who ')).toBe('Dr Who');
    expect(cleanName("Siobhan O'Neil-Smith")).toBe("Siobhan O'Neil-Smith");
    expect(cleanName('<script>')).toBe('script');
    expect(cleanName('a')).toBeNull();
    expect(cleanName('x'.repeat(41))).toBeNull();
    expect(cleanName({})).toBeNull();
  });

  it('takes an anchor with a point, and a layer spot only with a layer', () => {
    expect(cleanAnchor({ artboardId: 'ab1', x: 1, y: 2 })).toEqual({ artboardId: 'ab1', layerId: null, x: 1, y: 2 });
    expect(cleanAnchor({ artboardId: 'ab1', layerId: 'n1', lx: 3, ly: 4, x: 1, y: 2 })).toEqual({ artboardId: 'ab1', layerId: 'n1', lx: 3, ly: 4, x: 1, y: 2 });
    expect(cleanAnchor({ artboardId: 'ab1', layerId: 'n1', x: 1, y: 2 })).toEqual({ artboardId: 'ab1', layerId: null, x: 1, y: 2 });
    expect(cleanAnchor({ artboardId: 'ab 1', x: 1, y: 2 })).toBeNull();
    expect(cleanAnchor({ artboardId: 'ab1', x: Infinity, y: 2 })).toBeNull();
    expect(cleanAnchor({ artboardId: 'ab1', x: 1e12, y: -1e12 })).toEqual({ artboardId: 'ab1', layerId: null, x: 1e6, y: -1e6 });
    expect(cleanAnchor(null)).toBeNull();
    expect(cleanAnchor([])).toBeNull();
  });

  it('takes usernames for mentions and an assignee, nothing odd', () => {
    expect(cleanMentions(['bob', 'bob', 'a b', 5, 'ann@x.edu'])).toEqual(['bob', 'ann@x.edu']);
    expect(cleanMentions(Array.from({ length: 30 }, (_, i) => `u${i}`))).toHaveLength(10);
    expect(cleanMentions('bob')).toEqual([]);
    expect(cleanAssignee({ username: 'bob', name: 'Bob  B' })).toEqual({ username: 'bob', name: 'Bob B' });
    expect(cleanAssignee({ username: 'bob' })).toEqual({ username: 'bob', name: 'bob' });
    expect(cleanAssignee({ username: '$ne' })).toBeNull();
    expect(cleanAssignee(null)).toBeNull();
  });

  it('knows its own ids', () => {
    expect(validCommentID('cm0123456789abcdef01')).toBe(true);
    expect(validCommentID('cm0123')).toBe(false);
    expect(validCommentID({ $ne: 1 })).toBe(false);
  });
});

describe('threads', () => {
  const ann = { username: 'ann', name: 'Ann' };
  const bob = { username: 'bob', name: 'Bob' };
  const rows = [row('r2', 't1', bob, 3000), root('t2', 2, bob, 2000, { assignee: { username: 'ann', name: 'Ann' } }), root('t1', 1, ann, 1000, { status: 'resolved' }), row('orphan', 'gone', ann, 1)];

  it('groups rows by thread, oldest first, and drops replies with no root', () => {
    const t = threadsOf(rows);
    expect(t.map((x) => x.id)).toEqual(['t1', 't2']);
    expect(t[0].comments.map((c) => c.id)).toEqual(['t1', 'r2']);
    expect(t[0].status).toBe('resolved');
  });

  it('filters by status, scope and artboard', () => {
    const t = threadsOf(rows);
    expect(t.filter((x) => matchesFilter(x, { status: 'open' }, ann)).map((x) => x.id)).toEqual(['t2']);
    expect(t.filter((x) => matchesFilter(x, { status: 'all', scope: 'mine' }, ann)).map((x) => x.id)).toEqual(['t1']);
    expect(t.filter((x) => matchesFilter(x, { status: 'all', scope: 'assigned' }, ann)).map((x) => x.id)).toEqual(['t2']);
    expect(t.filter((x) => matchesFilter(x, { status: 'all', artboardId: 'zzz' }, ann))).toEqual([]);
    expect(t.filter((x) => matchesFilter(x, { status: 'all', scope: 'mine' }, null))).toEqual([]);
  });

  it('never counts a guest as the person they share a name with', () => {
    const t = threadsOf([root('g1', 1, { name: 'ann', guest: true }, 1)]);
    expect(matchesFilter(t[0], { scope: 'mine' }, { username: 'ann', name: 'ann' })).toBe(false);
  });

  it('counts for the chips', () => {
    expect(countsOf(threadsOf(rows), ann)).toEqual({ open: 1, resolved: 1, mine: 1, assigned: 1 });
  });

  it('lists the people who can be handed a thread: the owner and everyone signed in who wrote', () => {
    const t = threadsOf([...rows, root('g', 3, { name: 'Zed', guest: true }, 4)]);
    expect(peopleOf(t, { username: 'owner', name: 'Olive' })).toEqual([{ username: 'ann', name: 'Ann' }, { username: 'bob', name: 'Bob' }, { username: 'owner', name: 'Olive' }]);
  });
});

describe('who gets told', () => {
  const thread: any = { assignee: { username: 'dee' }, comments: [{ by: { username: 'ann' } }, { by: { name: 'Zed', guest: true } }, { by: { username: 'bob' } }] };
  it('tells the assignee and the mentioned, not the author, once each with the strongest reason', () => {
    expect(noticesFor({ thread, by: { username: 'ann', name: 'Ann' }, kind: 'root', mentions: ['bob', 'ann', 'bob'], assignee: { username: 'bob', name: 'Bob' } })).toEqual([{ user: 'bob', kind: 'assigned' }]);
  });
  it('tells everyone in a thread about a reply, the assignee included, never a guest', () => {
    const got = noticesFor({ thread, by: { username: 'bob', name: 'Bob' }, kind: 'reply' });
    expect(got.sort((a, b) => a.user.localeCompare(b.user))).toEqual([{ user: 'ann', kind: 'reply' }, { user: 'dee', kind: 'reply' }]);
  });
});

describe('pins', () => {
  it('follows the layer, falls back to the saved point when it is gone', () => {
    const a = { artboardId: 'ab', layerId: 'n1', lx: 5, ly: 5, x: 100, y: 100 };
    expect(pinSpot(a, (_id, lx, ly) => ({ x: lx + 50, y: ly + 60 }))).toEqual({ x: 55, y: 65, detached: false });
    expect(pinSpot(a, () => null)).toEqual({ x: 100, y: 100, detached: true });
    expect(pinSpot({ artboardId: 'ab', layerId: null, x: 7, y: 8 }, () => null)).toEqual({ x: 7, y: 8, detached: false });
  });
});

describe('the limiter', () => {
  it('lets max through in a window, then again once the window moves on', () => {
    const l = new Limiter(2, 1000);
    expect([l.hit('a', 0), l.hit('a', 10), l.hit('a', 20)]).toEqual([true, true, false]);
    expect(l.hit('b', 20)).toBe(true);
    expect(l.hit('a', 1005)).toBe(true);
    expect(l.hit('a', 1015)).toBe(true);
    expect(l.hit('a', 1016)).toBe(false);
  });
  it('does not count a refused hit against the person', () => {
    const l = new Limiter(1, 100);
    expect([l.hit('a', 0), l.hit('a', 50), l.hit('a', 99), l.hit('a', 101)]).toEqual([true, false, false, true]);
  });
});

describe('snippet', () => {
  it('flattens and shortens', () => {
    expect(snippet('a\n\n b', 90)).toBe('a b');
    expect(snippet('x'.repeat(100), 10)).toBe('xxxxxxxxx…');
  });
});
