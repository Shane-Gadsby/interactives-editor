import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { cloneWithNewIds, createNode, createProject, layoutConnectors, type Artboard, type ConnectorNode, type Project, type SceneNode } from 'interactives-player';
import { ConnectorSection, joinableLayers } from '../src/panels/ConnectorInspector';
import { inRepeaterTemplate, layerUnder, newConnector, pickEnd, pickedFromEnd, previewPath, snapSide } from '../src/canvas/connect';
import { drawnBox, recordDrawnGeometry, hitTest } from '../src/store/doc';
import { hitsPaintedShape } from '../src/lib/shape-hit';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { lookDefaults, starterThemes } from '../src/lib/themes';
import { analyzeUsage } from '../src/lib/dependencies';
import { copySelection, pasteNodes } from '../src/lib/clipboard';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
});

const rect = (id: string, x: number, y: number, w = 100, h = 60): SceneNode => createNode('rect', { id, name: id, x, y, width: w, height: h });
const board = (children: SceneNode[]): Artboard => ({ ...createProject('T').artboards[0], children });
const drawn = (ab: Artboard) => recordDrawnGeometry(ab.id, ab.children, layoutConnectors(ab.children).nodes);

describe('what the pointer is on', () => {
  const ab = board([rect('a', 0, 0), rect('b', 300, 100)]);

  it('finds the layer under a point and skips connectors and the layers asked to be skipped', () => {
    expect(layerUnder(ab, { x: 50, y: 30 })?.id).toBe('a');
    expect(layerUnder(ab, { x: 50, y: 30 }, ['a'])).toBeNull();
    expect(layerUnder(ab, { x: 200, y: 200 })).toBeNull();
  });

  it('joins a card as the card, not as the words in it (Ctrl goes to the words)', () => {
    const card = createNode('frame', { id: 'card', name: 'card', x: 0, y: 0, width: 150, height: 70, children: [createNode('text', { id: 'words', name: 'words', x: 10, y: 20, width: 100, height: 24, text: 'Hi' } as never)] } as never);
    const grouped = createNode('group', { id: 'grp', name: 'grp', x: 300, y: 0, children: [rect('inner', 0, 0, 80, 40)] } as never);
    const ab2 = board([card, grouped]);
    expect(layerUnder(ab2, { x: 30, y: 30 })?.id).toBe('card');
    expect(layerUnder(ab2, { x: 30, y: 30 }, [], true)?.id).toBe('words');
    expect(layerUnder(ab2, { x: 310, y: 10 })?.id).toBe('inner');
    expect(pickEnd(ab2, { x: 30, y: 30 }, 1).end).toEqual({ layer: 'card' });
  });

  it('snaps to a side when the pointer is near its middle, and is auto elsewhere', () => {
    const box = { x: 0, y: 0, w: 100, h: 60 };
    expect(snapSide(box, { x: 98, y: 30 }, 16)).toBe('right');
    expect(snapSide(box, { x: 50, y: 2 }, 16)).toBe('top');
    expect(snapSide(box, { x: 50, y: 30 }, 16)).toBeNull();
    const near = pickEnd(ab, { x: 98, y: 30 }, 1);
    expect(near.end).toEqual({ layer: 'a', side: 'right' });
    expect(near.at).toEqual({ x: 100, y: 30 });
    const body = pickEnd(ab, { x: 40, y: 20 }, 1);
    expect(body.end).toEqual({ layer: 'a' });
    expect(body.layerId).toBe('a');
    //zoomed in, the reach on screen is smaller in the layer's own px
    expect(pickEnd(ab, { x: 90, y: 30 }, 4).end).toEqual({ layer: 'a' });
  });

  it('a spot with nothing under it is a loose end where it is', () => {
    const p = pickEnd(ab, { x: 220.4, y: 180.6 }, 1);
    expect(p.end).toEqual({ layer: '', x: 220, y: 181 });
    expect(p.layerId).toBeNull();
    expect(p.box).toBeNull();
  });

  it('joins a layer in a repeater as its first copy', () => {
    const tpl = rect('card', 0, 0, 80, 40);
    const group = createNode('group', { id: 'g', name: 'g', repeat: { items: '[1, 2, 3]', layout: 'horizontal', columns: 1, gap: 10 }, children: [tpl] } as never);
    const rep = board([group, rect('plain', 400, 0)]);
    expect(inRepeaterTemplate(rep, 'card')).toBe(true);
    expect(inRepeaterTemplate(rep, 'plain')).toBe(false);
    expect(inRepeaterTemplate(rep, 'g')).toBe(false);
    expect(pickEnd(rep, { x: 40, y: 20 }, 1).end).toEqual({ layer: { repeat: 'card', index: '0' } });
  });

  it('turns a stored end back into where it sits, and draws a line from it', () => {
    const ab2 = board([rect('a', 0, 0), rect('b', 300, 100)]);
    const a = pickedFromEnd(ab2, { layer: 'a', side: 'bottom' });
    expect(a.at).toEqual({ x: 50, y: 60 });
    expect(pickedFromEnd(ab2, { layer: '', x: 7, y: 9 }).at).toEqual({ x: 7, y: 9 });
    const b = pickEnd(ab2, { x: 340, y: 130 }, 1);
    expect(previewPath(a, b, 'straight')).toMatch(/^M[\d.-]+ [\d.-]+L/);
    expect(previewPath(a, b, 'curved')).toContain('C');
  });

  it('makes a connector between two ends, in the look the project has', () => {
    const p = createProject('T');
    p.themes = starterThemes();
    const c = newConnector({ layer: 'a', side: 'right' }, { layer: 'b' }, lookDefaults(p, 'connector') as Partial<ConnectorNode>);
    expect(c.type).toBe('connector');
    expect(c.from).toEqual({ layer: 'a', side: 'right' });
    expect(c.to).toEqual({ layer: 'b' });
    expect(c.endCap).toBe('arrow');
    expect(String((c.stroke!.paint as { color: string }).color)).toMatch(/^token:/);
  });
});

describe('seeing and picking it on the canvas', () => {
  const link = (extra: Partial<ConnectorNode> = {}) => createNode('connector', { id: 'k', name: 'k', from: { layer: 'a' }, to: { layer: 'b' }, route: 'straight', endCap: 'none', ...extra } as Partial<ConnectorNode>);

  it('records the route as drawn, so the outline hugs it', () => {
    const ab = board([rect('a', 0, 0), rect('b', 300, 100), link()]);
    drawn(ab);
    const k = ab.children[2] as ConnectorNode;
    const box = drawnBox(ab, k);
    expect(box.width).toBeGreaterThan(150);
    expect(box.computed?.points.length).toBeGreaterThan(1);
    expect(box.x).toBeLessThan(300);
  });

  it('is picked on its line, not anywhere in the box round it', () => {
    const ab = board([rect('a', 0, 0), rect('b', 300, 100), link()]);
    drawn(ab);
    const k = drawnBox(ab, ab.children[2] as ConnectorNode);
    //the middle of the line
    const mid = k.computed!.points[Math.floor(k.computed!.points.length / 2)];
    expect(hitsPaintedShape(k, mid.x, mid.y, 3)).toBe(true);
    //a far corner of its box, off the diagonal
    expect(hitsPaintedShape(k, 1, k.height - 1, 3)).toBe(false);
    const hit = hitTest(ab, k.x + mid.x, k.y + mid.y);
    expect(hit.map((n) => n.id)).toEqual(['k']);
  });

  it('cannot be picked before it has been drawn', () => {
    expect(hitsPaintedShape(link(), 0, 0, 3)).toBe(false);
  });

  it('a hidden connector (a layer is missing) records no box', () => {
    const ab = board([rect('a', 0, 0), link()]);
    drawn(ab);
    expect(drawnBox(ab, ab.children[1] as ConnectorNode).width).toBe(0);
  });
});

describe('keeping hold of layers', () => {
  it('copies a group with a connector so the copy joins the copies', () => {
    const g = createNode('group', { id: 'g', name: 'g', children: [rect('a', 0, 0), rect('b', 300, 0), createNode('connector', { id: 'k', name: 'k', from: { layer: 'a' }, to: { layer: 'b' } })] } as never);
    const map = new Map<string, string>();
    const copy = cloneWithNewIds(g, map) as unknown as { children: SceneNode[] };
    const k = copy.children[2] as ConnectorNode;
    expect([k.from.layer, k.to.layer]).toEqual([map.get('a'), map.get('b')]);
  });

  it('pasting layers with a connector joins the pasted copies, and a lone connector for layers that are not there is not pasted', () => {
    const p = createProject('T');
    p.artboards[0].children.push(rect('a', 0, 0), rect('b', 300, 0), createNode('connector', { id: 'k', name: 'k', from: { layer: 'a' }, to: { layer: 'b' } }));
    p.artboards.push({ ...createProject('U').artboards[0], id: 'ab2', name: 'Other' });
    const s = new EditorStore(p);
    setCurrentStore(s);
    s.select(['a', 'b', 'k']);
    copySelection();
    expect(pasteNodes()).toBe(true);
    const kids = s.artboard()!.children;
    expect(kids).toHaveLength(6);
    const copyK = kids.filter((n) => n.type === 'connector')[1] as ConnectorNode;
    const copyIds = kids.filter((n) => n.type === 'rect').slice(2).map((n) => n.id);
    expect([copyK.from.layer, copyK.to.layer]).toEqual(copyIds);
    //just the connector, onto another artboard, where its layers are not
    s.select(['k']);
    copySelection();
    s.set({ activeArtboardId: 'ab2', selection: [] });
    expect(pasteNodes()).toBe(false);
    expect(s.artboard()!.children).toHaveLength(0);
    //just the connector on its own artboard: it still joins the layers it did
    s.set({ activeArtboardId: p.artboards[0].id });
    expect(pasteNodes()).toBe(true);
    expect((s.artboard()!.children.filter((n) => n.type === 'connector').pop() as ConnectorNode).from.layer).toBe('a');
  });

  it('duplicating an artboard keeps the connectors joining its own layers, whatever the layer order', () => {
    const p = createProject('T');
    //(the connector comes first, so its layers have no copies yet when it is copied)
    p.artboards[0].children.push(createNode('connector', { id: 'k', name: 'k', from: { layer: 'a' }, to: { layer: 'b' } }), rect('a', 0, 0), rect('b', 300, 0));
    const s = new EditorStore(p);
    setCurrentStore(s);
    s.duplicateArtboard(p.artboards[0].id);
    const copy = s.get().project.artboards[1];
    const k = copy.children.find((n) => n.type === 'connector') as ConnectorNode;
    const ids = copy.children.filter((n) => n.type === 'rect').map((n) => n.id);
    expect([k.from.layer, k.to.layer]).toEqual(ids);
    expect(ids).not.toContain('a');
  });

  it('shows the layers a connector joins as used, and a missing one as missing', () => {
    const p = createProject('T');
    p.artboards[0].children.push(
      rect('a', 0, 0),
      rect('b', 300, 0),
      createNode('connector', { id: 'k', name: 'k', from: { layer: 'a' }, to: { layer: { repeat: 'b', index: 'item.to' } } }),
      createNode('connector', { id: 'k2', name: 'k2', from: { layer: 'a' }, to: { layer: 'gone' }, label: '{score} points' }),
    );
    const usage = analyzeUsage(p);
    const used = usage.layers.find((l) => l.id === 'a');
    expect(used?.usedBy.some((u) => u.how === 'connector end')).toBe(true);
    //the repeated layer and its copy-picking expression count too
    expect(usage.layers.find((l) => l.id === 'b')?.usedBy.some((u) => u.how === 'connector end')).toBe(true);
    expect(usage.missing.some((m) => m.what === 'layer' && m.ref === 'gone')).toBe(true);
  });
});

describe('the inspector', () => {
  const mount = (children: SceneNode[], id = 'k') => {
    const p = createProject('T');
    p.artboards[0].children.push(...children);
    const s = new EditorStore(p);
    setCurrentStore(s);
    s.select([id]);
    const host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const draw = () => {
      const cur = s.artboard()!.children.find((n) => n.id === id) as ConnectorNode;
      act(() => root!.render(<ConnectorSection nodes={[cur]} project={s.get().project as Project} ab={s.artboard()} />));
    };
    draw();
    s.subscribe(draw);
    return { s, host, node: () => s.artboard()!.children.find((n) => n.id === id) as ConnectorNode };
  };
  const change = (el: HTMLSelectElement, v: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, v);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  const select = (host: HTMLElement, label: string, nth = 0) => [...host.querySelectorAll('.field')].filter((f) => f.querySelector('.field-label')?.textContent === label)[nth]?.querySelector('select') as HTMLSelectElement;

  it('lists the layers it can join and picks them for each end', () => {
    const k = createNode('connector', { id: 'k', name: 'k', from: { layer: 'a' }, to: { layer: 'b' } });
    const { s, host, node } = mount([rect('a', 0, 0), rect('b', 300, 0), rect('c', 0, 200), k]);
    const opts = [...select(host, 'On layer', 0).options].map((o) => o.value);
    expect(opts).toEqual(['', 'a', 'b', 'c']);
    change(select(host, 'On layer', 1), 'c');
    expect(node().to.layer).toBe('c');
    change(select(host, 'Side', 0), 'bottom');
    expect(node().from).toEqual({ layer: 'a', side: 'bottom' });
    change(select(host, 'Side', 0), 'auto');
    expect(node().from).toEqual({ layer: 'a' });
    change(select(host, 'Route'), 'elbow');
    expect(node().route).toBe('elbow');
    change(select(host, 'End'), 'dot');
    expect(node().endCap).toBe('dot');
    void s;
  });

  it('lets an end go loose and keeps where it was', () => {
    const { host, node } = mount([rect('a', 0, 0), rect('b', 300, 0), createNode('connector', { id: 'k', name: 'k', from: { layer: 'a' }, to: { layer: 'b' }, route: 'straight' })]);
    change(select(host, 'On layer', 1), '');
    expect(node().to.layer).toBe('');
    expect(typeof node().to.x).toBe('number');
    expect(host.textContent).toContain('X');
  });

  it('asks which copy for a layer inside a repeater, and says when a layer has gone', () => {
    const tpl = rect('card', 0, 0, 80, 40);
    const group = createNode('group', { id: 'g', name: 'g', repeat: { items: '[1, 2, 3]', layout: 'horizontal', columns: 1, gap: 10 }, children: [tpl] } as never);
    const k = createNode('connector', { id: 'k', name: 'k', from: { layer: { repeat: 'card', index: '0' } }, to: { layer: 'gone' } });
    const { host, node } = mount([group, rect('b', 300, 0), k]);
    expect(host.textContent).toContain('Which copy');
    expect(host.textContent).toMatch(/is gone/);
    change(select(host, 'On layer', 1), 'b');
    expect(host.textContent).not.toMatch(/is gone/);
    expect((node().from.layer as { index: string }).index).toBe('0');
  });

  it('joinableLayers lists layers in order, indented by depth, without connectors', () => {
    const g = createNode('group', { id: 'g', name: 'g', children: [rect('in', 0, 0)] } as never);
    const list = joinableLayers(board([rect('a', 0, 0), g, createNode('connector', { id: 'k', name: 'k' })]));
    expect(list.map((l) => [l.id, l.depth])).toEqual([['a', 0], ['g', 0], ['in', 1]]);
  });
});
