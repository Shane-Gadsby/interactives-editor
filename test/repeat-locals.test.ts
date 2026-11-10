//item and index for formula fields on a layer in a repeater's template: the first copy's values, nested repeaters from the outside in
import { describe, expect, it } from 'vitest';
import { createNode, createProject } from 'interactives-player';
import { repeatLocals } from '../src/lib/repeat-locals';

function project() {
  const p = createProject('R');
  const ab = p.artboards[0];
  p.variables.push({ id: 'v', name: 'rows', type: 'list', initial: '[{"name": "Ann", "pets": ["cat", "dog"]}, {"name": "Bob", "pets": []}]' } as never);
  const pet = createNode('text', { id: 'pet', name: 'Pet', text: '{item}' });
  const inner = createNode('frame', { id: 'inner', name: 'Pets', repeat: { items: 'item.pets', layout: 'horizontal', gap: 4, columns: 1 }, children: [pet] } as never);
  const label = createNode('text', { id: 'label', name: 'Name', text: '{item.name}' });
  const card = createNode('frame', { id: 'card', name: 'Card', children: [label, inner] } as never);
  const extra = createNode('rect', { id: 'extra', name: 'Not repeated' });
  const list = createNode('frame', { id: 'list', name: 'List', repeat: { items: 'rows', layout: 'vertical', gap: 4, columns: 1 }, children: [card, extra] } as never);
  ab.children.push(list, createNode('rect', { id: 'loose', name: 'Loose' }));
  return { p, ab };
}

describe('repeatLocals', () => {
  it('gives the first item to a layer in the template, at any depth', () => {
    const { p, ab } = project();
    expect(repeatLocals(p, ab, 'label')).toEqual({ locals: ['item', 'index'], values: { item: { name: 'Ann', pets: ['cat', 'dog'] }, index: 0 } });
  });
  it('works nested repeaters out from the outside in', () => {
    const { p, ab } = project();
    expect(repeatLocals(p, ab, 'pet')?.values).toEqual({ item: 'cat', index: 0 });
  });
  it('is null outside a repeater, and for a repeater\'s other children', () => {
    const { p, ab } = project();
    expect(repeatLocals(p, ab, 'loose')).toBeNull();
    expect(repeatLocals(p, ab, 'extra')).toBeNull();
    expect(repeatLocals(p, ab, 'list')).toBeNull();
  });
  it('adds isSelected when the repeater has a selection, from the variable\'s starting value', () => {
    const { p, ab } = project();
    p.variables.push({ id: 'pick', name: 'picked', type: 'number', initial: 0 } as never);
    (ab.children[0] as unknown as { repeat: object }).repeat = { items: 'rows', layout: 'vertical', gap: 4, columns: 1, select: { mode: 'one', variable: 'pick' } };
    const r = repeatLocals(p, ab, 'label')!;
    expect(r.locals).toEqual(['item', 'index', 'isSelected']);
    expect(r.values).toEqual({ item: { name: 'Ann', pets: ['cat', 'dog'], selected: true }, index: 0, isSelected: true });
    p.variables[p.variables.length - 1].initial = -1;
    expect(repeatLocals(p, ab, 'label')?.values.isSelected).toBe(false);
  });
});
