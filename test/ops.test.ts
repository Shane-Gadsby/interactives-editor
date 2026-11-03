import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { apply, diff } from '../shared/ops.mjs';
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
});
