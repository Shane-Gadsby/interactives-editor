import { describe, expect, it } from 'vitest';
import { createNode, createProject, type LogicNode } from 'interactives-player';
import { EditorStore } from '../src/store/store';

const lg = (id: string, kind: string, params: Record<string, unknown>, y = 0): LogicNode => ({ id, kind, x: 0, y, params });

//A "Next" button that shows a "Dialog" layer and bumps a counter, and a "Close" button that hides the dialog; plus an unrelated flow
function setup() {
  const p = createProject('T');
  const ab = p.artboards[0];
  ab.children.push(
    createNode('rect', { id: 'btn', name: 'Open', x: 10, y: 10 }),
    createNode('rect', { id: 'dlg', name: 'Dialog', x: 200, y: 10 }),
    createNode('rect', { id: 'other', name: 'Other', x: 400, y: 10 }),
  );
  ab.logic.nodes.push(
    lg('e1', 'event.pointer', { target: 'btn', type: 'click' }, 0),
    lg('a1', 'action.setVariable', { variable: 'count', value: 'count + 1' }, 0),
    lg('a2', 'action.visibility', { target: 'dlg', mode: 'show' }, 0),
    lg('e2', 'event.pointer', { target: 'other', type: 'click' }, 200),
    lg('a3', 'action.visibility', { target: 'other', mode: 'hide' }, 200),
  );
  ab.logic.edges.push(
    { id: 'w1', from: 'e1', fromPort: 'out', to: 'a1', toPort: 'in' },
    { id: 'w2', from: 'a1', fromPort: 'out', to: 'a2', toPort: 'in' },
    { id: 'w3', from: 'e2', fromPort: 'out', to: 'a3', toPort: 'in' },
  );
  const s = new EditorStore(p);
  return { s, ab: () => s.artboard()! };
}

describe('Duplicate with what the layer does', () => {
  it('copies the click flow, pointed at the copy, and keeps the original flow', () => {
    const { s, ab } = setup();
    s.select(['btn']);
    s.duplicateSelection();
    const copyId = s.get().selection[0];
    expect(copyId).not.toBe('btn');
    const g = ab().logic;
    expect(g.nodes).toHaveLength(7); // the 5 that were there, a new event, and a copy of the counter step
    const ev = g.nodes.filter((n) => n.kind === 'event.pointer' && n.params.target === copyId);
    expect(ev).toHaveLength(1);
    expect(g.nodes.find((n) => n.id === 'e1')!.params.target).toBe('btn');
    const ids = (n: LogicNode) => g.edges.filter((e) => e.from === n.id).map((e) => g.nodes.find((x) => x.id === e.to)!);
    const step = ids(ev[0])[0];
    expect(step.kind).toBe('action.setVariable');
    expect(step.id).not.toBe('a1'); // copied, since it names no layer
    //the step after it touches only a layer outside the copy, so the copy's chain joins the original step
    expect(ids(step).map((n) => n.id)).toEqual(['a2']);
    //nothing was wired into the copy from the original's nodes
    expect(g.edges.filter((e) => e.from === 'e1' || e.from === 'a1' || e.from === 'a2')).toHaveLength(2);
  });

  it('points steps that name the copied layers at the copies when the dialog is duplicated with its button', () => {
    const { s, ab } = setup();
    s.select(['btn', 'dlg']);
    s.duplicateSelection();
    const [cb, cd] = s.get().selection;
    const g = ab().logic;
    const show = g.nodes.filter((n) => n.kind === 'action.visibility' && n.params.target === cd);
    expect(show).toHaveLength(1);
    expect(g.nodes.filter((n) => n.id === 'a2')[0].params.target).toBe('dlg');
    const ev = g.nodes.find((n) => n.kind === 'event.pointer' && n.params.target === cb)!;
    //event -> copied counter -> copied show, nothing joined to the originals
    const chain: string[] = [];
    let at: string | undefined = ev.id;
    while (at) {
      chain.push(at);
      at = g.edges.find((e) => e.from === at)?.to;
    }
    expect(chain).toHaveLength(3);
    expect(chain.some((id) => ['e1', 'a1', 'a2'].includes(id))).toBe(false);
    expect(g.nodes.every((n) => n.kind !== 'event.pointer' || n.params.target !== 'other' || n.id === 'e2')).toBe(true);
  });

  it('undoes as one step, and Duplicate layer only copies no interactions', () => {
    const { s, ab } = setup();
    s.select(['btn']);
    s.duplicateSelection();
    expect(ab().children).toHaveLength(4);
    s.undo();
    expect(ab().children).toHaveLength(3);
    expect(ab().logic.nodes).toHaveLength(5);
    expect(ab().logic.edges).toHaveLength(3);
    s.select(['btn']);
    s.duplicateSelection(10, { behaviour: false });
    expect(ab().children).toHaveLength(4);
    expect(ab().logic.nodes).toHaveLength(5);
  });

  it('lays the copied nodes out under the lowest node, and Alt-drag in Layers brings the flow too', () => {
    const { s, ab } = setup();
    s.copyNodeTo('btn', null, 0);
    const g = ab().logic;
    const added = g.nodes.slice(5);
    expect(added).toHaveLength(2);
    expect(Math.min(...added.map((n) => n.y))).toBeGreaterThan(200);
  });

  it('copies nothing for a layer no event points at', () => {
    const { s, ab } = setup();
    s.select(['dlg']);
    s.duplicateSelection();
    expect(ab().logic.nodes).toHaveLength(5);
  });
});
