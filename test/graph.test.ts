import { describe, expect, it } from 'vitest';
import { CATALOG, CATALOG_BY_KIND } from 'interactives-player';
import { compatibleKinds, newNodePort } from '../src/lib/graph';

describe('compatibleKinds', () => {
  it('from an output lists only nodes with an input (no events)', () => {
    const kinds = compatibleKinds('from-output');
    expect(kinds.length).toBeGreaterThan(0);
    expect(kinds.every((k) => CATALOG_BY_KIND[k].hasInput)).toBe(true);
    expect(kinds.some((k) => CATALOG_BY_KIND[k].category === 'event')).toBe(false);
    expect(kinds).toContain('action.setVariable');
  });

  it('from an input lists only nodes with outputs (events, actions and logic)', () => {
    const kinds = compatibleKinds('from-input');
    expect(kinds.every((k) => CATALOG_BY_KIND[k].outputs.length > 0)).toBe(true);
    const cats = new Set(kinds.map((k) => CATALOG_BY_KIND[k].category));
    expect(cats.has('event')).toBe(true);
    expect(cats.has('logic')).toBe(true);
  });

  it('every catalog node is reachable from at least one direction', () => {
    const all = new Set([...compatibleKinds('from-output'), ...compatibleKinds('from-input')]);
    for (const d of CATALOG) if (d.hasInput || d.outputs.length) expect(all.has(d.kind)).toBe(true);
  });
});

describe('newNodePort', () => {
  it('uses the input going forwards and the first output going backwards', () => {
    const action = CATALOG.find((d) => d.category === 'action' && d.hasInput)!;
    expect(newNodePort(action.kind, 'from-output')).toBe('in');
    expect(newNodePort(action.kind, 'from-input')).toBe(action.outputs[0].id);
    const event = CATALOG.find((d) => d.category === 'event')!;
    expect(newNodePort(event.kind, 'from-output')).toBeUndefined();
    expect(newNodePort(event.kind, 'from-input')).toBe(event.outputs[0].id);
    expect(newNodePort('nope', 'from-input')).toBeUndefined();
  });
});
