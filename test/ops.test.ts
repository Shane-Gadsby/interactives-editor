import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { apply, diff, opKey, orderFixes, type Op } from '../shared/ops.mjs';
import { createNode, createProject } from 'interactives-player';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

describe('ops', () => {
  it('diff + apply reproduces any change', () => {
    const a = createProject('A');
    const r1 = createNode('rect', { name: 'r1' });
    const r2 = createNode('ellipse', { name: 'r2' });
    const r3 = createNode('text', { name: 'r3' });
    a.artboards[0].children.push(r1, r2, r3);
    const b = produce(a, (d) => {
      d.artboards[0].children[0].x = 50; // set
      d.artboards[0].children.splice(1, 1); // delete r2
      d.artboards[0].children.unshift(createNode('star', { name: 'new' }) as never); // insert at start
      const [t] = d.artboards[0].children.splice(2, 1); // move r3 before r1
      d.artboards[0].children.splice(1, 0, t);
      d.variables.push({ id: 'v', name: 'x', type: 'number', initial: 1 });
      d.fonts.push({ family: 'Poppins', source: 'google' }); // non-id array: whole set
      delete (d.settings as { description?: string }).description;
    });
    const ops = diff(a, b);
    const c = clone(a);
    apply(c, ops);
    expect(c).toEqual(clone(b));
    expect(ops.find((o) => o.t === 'set' && o.p.at(-1) === 'x')).toBeTruthy();
  });

  it('only walks changed subtrees (no ops for untouched objects)', () => {
    const a = createProject('A');
    const b = produce(a, (d) => {
      d.name = 'B';
    });
    expect(diff(a, b)).toEqual([{ t: 'set', p: ['name'], v: 'B' }]);
  });

  it('merges concurrent edits by id regardless of order', () => {
    const base = createProject('A');
    const n1 = createNode('rect', { name: 'one' });
    const n2 = createNode('rect', { name: 'two' });
    base.artboards[0].children.push(n1, n2);
    // Alice moves "one"; Bob deletes "two" and adds "three"
    const alice = diff(base, produce(base, (d) => void (d.artboards[0].children[0].x = 99)));
    const bob = diff(
      base,
      produce(base, (d) => {
        d.artboards[0].children.splice(1, 1);
        d.artboards[0].children.push(createNode('ellipse', { name: 'three' }) as never);
      }),
    );
    const s1 = clone(base);
    apply(s1, [...alice, ...bob]);
    const s2 = clone(base);
    apply(s2, [...bob, ...alice]);
    expect(s1).toEqual(s2);
    expect(s1.artboards[0].children.map((n) => n.name)).toEqual(['one', 'three']);
    expect(s1.artboards[0].children[0].x).toBe(99);
  });

  it('skips ops on things deleted elsewhere', () => {
    const base = createProject('A');
    const n = createNode('rect');
    base.artboards[0].children.push(n);
    const edit = diff(base, produce(base, (d) => void (d.artboards[0].children[0].y = 5)));
    const s = clone(base);
    s.artboards[0].children = [];
    expect(apply(s, edit)).toBe(0);
  });

  it('refuses prototype keys', () => {
    const doc: Record<string, unknown> = {};
    apply(doc, [{ t: 'set', p: ['__proto__', 'polluted'], v: 1 }]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('sends binding converters and list variables to other people as ordinary changes', () => {
    const a = createProject('A');
    const r = createNode('rect', { name: 'r', bindings: { width: 'amount' } });
    a.artboards[0].children.push(r);
    const b = produce(a, (d) => {
      const n = d.artboards[0].children[0];
      n.converters = { width: [{ type: 'range', inMin: 0, inMax: 1, outMin: 0, outMax: 100, clamp: true }] };
      d.variables.push({ id: 'l', name: 'people', type: 'list', initial: '[{"name":"Ann"}]' });
    });
    const c = clone(a);
    apply(c, diff(a, b));
    expect(c).toEqual(clone(b));
  });

  it('carries the extra fills and strokes of a layer, and their removal', () => {
    const a = createProject('A');
    const r = createNode('rect', { name: 'r', fills: [{ type: 'solid', color: '#111111' }], strokes: [{ paint: { type: 'solid', color: '#000000' }, width: 2 }] });
    a.artboards[0].children.push(r);
    const b = produce(a, (d) => {
      const n = d.artboards[0].children[0] as unknown as { fills?: unknown[]; strokes?: { width: number }[] };
      n.fills!.push({ type: 'linear', angle: 0, stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }], feather: 4 });
      n.strokes![0].width = 5;
    });
    const c = clone(a);
    apply(c, diff(a, b));
    expect(c).toEqual(clone(b));
    const d2 = produce(b, (d) => {
      const n = d.artboards[0].children[0] as unknown as { fills?: unknown[] };
      n.fills = undefined;
    });
    const e = clone(b);
    apply(e, diff(b, d2));
    expect((e.artboards[0].children[0] as { fills?: unknown }).fills).toBeUndefined();
  });

  it('carries a paint order, and its removal', () => {
    const a = createProject('A');
    a.artboards[0].children.push(createNode('rect', { name: 'r', fills: [{ type: 'solid', color: '#111111' }], stroke: { paint: { type: 'solid', color: '#000000' }, width: 2 } }));
    const b = produce(a, (d) => {
      (d.artboards[0].children[0] as unknown as { paintOrder?: string[] }).paintOrder = ['fill', 'stroke', 'fill'];
    });
    const c = clone(a);
    apply(c, diff(a, b));
    expect(c).toEqual(clone(b));
    const d2 = produce(b, (d) => {
      (d.artboards[0].children[0] as unknown as { paintOrder?: string[] }).paintOrder = undefined;
    });
    apply(c, diff(b, d2));
    expect((c.artboards[0].children[0] as { paintOrder?: unknown }).paintOrder).toBeUndefined();
  });
});

describe('mv and orderFixes', () => {
  const doc = (ids: string[]) => ({ list: ids.map((id) => ({ id })) });
  const order = (d: { list: { id: string }[] }) => d.list.map((e) => e.id).join('');
  const L = ['list'];
  const ins = (id: string, after: string | null): Op => ({ t: 'ins', p: L, v: { id }, after });

  it('mv moves an element after an anchor, to the front, or to the end when the anchor is gone, and skips unknown ids', () => {
    const d = doc(['a', 'b', 'c', 'd']);
    apply(d, [{ t: 'mv', p: L, id: 'a', after: 'c' }]);
    expect(order(d)).toBe('bcad');
    apply(d, [{ t: 'mv', p: L, id: 'd', after: null }]);
    expect(order(d)).toBe('dbca');
    apply(d, [{ t: 'mv', p: L, id: 'b', after: 'zzz' }]);
    expect(order(d)).toBe('dcab');
    apply(d, [{ t: 'mv', p: L, id: 'nope', after: 'c' }]);
    expect(order(d)).toBe('dcab');
    expect(opKey({ t: 'mv', p: L, id: 'a', after: null })).toBe('list/#a');
  });

  it('puts a list in the order the server will have once our unanswered ops land after theirs', () => {
    //server had abc; they put x after a; we (not knowing) put y after a. The server ends up with a y x b c
    const shadow = doc(['a', 'x', 'b', 'c']);
    const local = doc(['a', 'x', 'y', 'b', 'c']);
    const own = [ins('y', 'a')];
    const fixes = orderFixes(local, shadow, own, [ins('x', 'a')]);
    apply(local, fixes);
    const server = doc(['a', 'b', 'c']);
    apply(server, [ins('x', 'a'), ...own]);
    expect(order(local)).toBe(order(server));
    expect(order(local)).toBe('ayxbc');
  });

  it('does nothing when the lists already agree, or when we have nothing waiting in that part of the document', () => {
    const shadow = doc(['a', 'x', 'b']);
    expect(orderFixes(doc(['a', 'x', 'b']), shadow, [], [ins('x', 'a')])).toEqual([]);
    expect(orderFixes(doc(['a', 'x', 'b']), shadow, [{ t: 'set', p: ['other'], v: 1 }], [ins('x', 'a')])).toEqual([]);
    expect(orderFixes(doc(['a', 'x', 'b']), shadow, [ins('b', 'x')], [ins('x', 'a')])).toEqual([]);
  });

  it('does not change its inputs', () => {
    const shadow = doc(['a', 'x', 'b']), local = doc(['a', 'y', 'x', 'b']);
    const before = JSON.stringify([shadow, local]);
    orderFixes(local, shadow, [ins('y', 'a')], [ins('x', 'a')]);
    expect(JSON.stringify([shadow, local])).toBe(before);
  });

  it('an insert of a layer that already lives elsewhere in the artboard moves it, so two concurrent moves leave one copy', () => {
    const ab = { id: 'ab', children: [{ id: 'g1', children: [{ id: 'x' }] }, { id: 'g2', children: [] }, { id: 'y' }] };
    const d = { artboards: [ab] };
    const A = ['artboards', { i: 'ab' }, 'children'];
    apply(d, [{ t: 'ins', p: A, v: { id: 'x' }, after: 'g1' }]);
    apply(d, [{ t: 'del', p: [...A, { i: 'g1' }, 'children'], id: 'x' }, { t: 'ins', p: [...A, { i: 'g2' }, 'children'], v: { id: 'x' }, after: null }]);
    const ids = (ns: { id: string; children?: any[] }[]): string[] => ns.flatMap((n) => [n.id, ...ids(n.children ?? [])]);
    expect(ids(ab.children)).toEqual(['g1', 'g2', 'x', 'y']);
    expect(ab.children[1].children).toEqual([{ id: 'x' }]);
  });

  it('orderFixes also drops a doubled layer and puts back one that went missing', () => {
    const mk = (kids: string[]) => ({ artboards: [{ id: 'ab', children: kids.map((id) => ({ id })) }] });
    const A = ['artboards', { i: 'ab' }, 'children'];
    const shadow = mk(['a', 'b', 'c']);
    const local = mk(['a', 'c', 'b', 'c']);
    const own: Op[] = [{ t: 'ins', p: A, v: { id: 'q' }, after: 'a' }];
    local.artboards[0].children.splice(1, 0, { id: 'q' });
    apply(local, orderFixes(local, shadow, own, [{ t: 'ins', p: A, v: { id: 'z' }, after: 'c' }]).concat([]));
    expect(local.artboards[0].children.map((e) => e.id)).toEqual(['a', 'q', 'b', 'c']);
  });

  it('a group inserted with a child that has since moved elsewhere in the artboard comes without that child', () => {
    const A = ['artboards', { i: 'ab' }, 'children'];
    const d = { artboards: [{ id: 'ab', children: [{ id: 'g', children: [{ id: 'k' }, { id: 'm' }] }, { id: 'k2' }] }] };
    //k was moved out to the top level first; then someone moves g (still showing k) into the artboard's end
    apply(d, [{ t: 'del', p: [...A, { i: 'g' }, 'children'], id: 'k' }, { t: 'ins', p: A, v: { id: 'k' }, after: 'g' }]);
    apply(d, [{ t: 'del', p: A, id: 'g' }, { t: 'ins', p: A, v: { id: 'g', children: [{ id: 'k' }, { id: 'm' }] } as { id: string }, after: 'k2' }]);
    expect(d.artboards[0].children.map((e: any) => e.id)).toEqual(['k', 'k2', 'g']);
    expect((d.artboards[0].children[2] as any).children).toEqual([{ id: 'm' }]);
  });
});
