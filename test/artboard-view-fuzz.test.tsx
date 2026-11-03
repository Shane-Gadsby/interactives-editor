//Differential fuzz of the canvas's incremental redraw. A random document is edited through EditorStore (property edits,
//bindings, repeaters, solo, masks, auto layout, constraints, instances, text modifiers, paint order, structure, undo and redo,
//variables, a timeline being scrubbed) while one ArtboardView stays mounted and redraws what changed. After every step its
//DOM has to equal what a freshly mounted view draws of the same document in one go.
//Scale with ARTBOARD_FUZZ_RUNS (documents, default 40) and ARTBOARD_FUZZ_STEPS (steps each, default 25).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Renderer, sampleArtboard, createNode, createProject, isContainer, uid, walk, type Artboard, type BoneNode, type PathNode, type Project, type SceneNode, type Timeline } from 'interactives-player';
import { bindPath, worldMatrices } from '../../interactives-player/src/skeleton';
import { ArtboardView } from '../src/canvas/ArtboardView';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { rng, type Rng } from './helpers/rng';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RUNS = Number(process.env.ARTBOARD_FUZZ_RUNS ?? 40);
const STEPS = Number(process.env.ARTBOARD_FUZZ_STEPS ?? 25);

const COLORS = ['#ff0000', '#00ff00', '#0000ff', '#ffaa00', '#123456'];

function paints(r: Rng, n: Record<string, unknown>) {
  const fill = () => ({ type: 'solid', color: r.pick(COLORS), ...(r.chance(0.3) ? { opacity: r.int(100) / 100 } : {}), ...(r.chance(0.15) ? { feather: r.int(4) } : {}) });
  const stroke = () => ({ paint: { type: 'solid', color: r.pick(COLORS) }, width: r.int(5), ...(r.chance(0.2) ? { align: r.pick(['center', 'inside', 'outside']) } : {}) });
  n.fill = r.chance(0.8) ? fill() : null;
  n.stroke = r.chance(0.5) ? stroke() : null;
  if (r.chance(0.3)) n.fills = Array.from({ length: 1 + r.int(2) }, fill);
  if (r.chance(0.3)) n.strokes = Array.from({ length: 1 + r.int(2) }, stroke);
  if (r.chance(0.4)) n.paintOrder = Array.from({ length: r.int(6) }, () => r.pick(['fill', 'stroke', 'fill', 'bogus']));
}

const BINDS = ['opacity: n / 8', 'x: n * 7', 'y: n * 3 + 2', 'rotation: n * 10', 'visible: n != 3', 'scaleX: 1 + n / 10', 'width: 10 + n * 4'];

interface Ctx {
  r: Rng;
  ids: string[];
  feat: Set<string>;
  instanceTarget: string | null;
}

function genNode(c: Ctx, depth: number): SceneNode {
  const { r } = c;
  const kind = r.pick(['rect', 'rect', 'ellipse', 'text', 'text', 'group', 'group', 'frame', 'frame', 'path', 'polygon', 'star', 'instance']);
  const base = { x: r.int(100), y: r.int(100), width: 10 + r.int(40), height: 10 + r.int(40), name: 'L' + c.ids.length, opacity: r.chance(0.2) ? r.int(100) / 100 : 1, rotation: r.chance(0.2) ? r.int(90) : 0 } as Record<string, unknown>;
  let node: SceneNode;
  if (kind === 'text') {
    node = createNode('text', { ...base, text: r.pick(['Hello world', 'a b c d', '{n} items {s}', 'x']), autoSize: r.pick(['none', 'height', 'width']), fontSize: 10 + r.int(10) } as never);
    if (c.feat.has('modifiers') && r.chance(0.5)) (node as { modifiers?: unknown }).modifiers = [{ unit: r.pick(['letter', 'word', 'line']), start: 0, end: 80, offset: 0, shape: 'triangle', strength: 100, x: r.int(10), y: r.int(10), rotation: r.int(30), scale: 1, opacity: 0.8, letterSpacing: 1, blur: 0 }];
    if (r.chance(0.2)) (node as { runs?: unknown }).runs = [{ text: 'Run ', fontWeight: 700 }, { text: '{n}', color: '#00f' }];
  } else if (kind === 'path') node = createNode('path', { ...base, paths: [{ closed: r.chance(0.5), points: Array.from({ length: 3 + r.int(3) }, () => ({ x: r.int(40), y: r.int(40) })) }] } as never);
  else if (kind === 'polygon') node = createNode('polygon', { ...base, sides: 3 + r.int(4) } as never);
  else if (kind === 'instance') {
    if (!c.instanceTarget) return genNode(c, depth);
    node = createNode('instance', { ...base, artboardId: c.instanceTarget, inputs: {} } as never);
  } else if (kind === 'group' || kind === 'frame') {
    const kids: SceneNode[] = [];
    for (let i = 0, n = depth >= 3 ? 0 : 1 + r.int(4); i < n; i++) kids.push(genNode(c, depth + 1));
    node = createNode(kind, { ...base, children: kids } as never) as SceneNode;
    const ct = node as unknown as Record<string, unknown>;
    if (kind === 'frame' && c.feat.has('layout') && r.chance(0.6)) ct.layout = { direction: r.pick(['row', 'column']), gap: r.int(8), padding: { top: r.int(6), right: r.int(6), bottom: r.int(6), left: r.int(6) }, justify: r.pick(['start', 'center', 'end', 'space-between']), align: r.pick(['start', 'center', 'end', 'stretch']), wrap: r.chance(0.3), hugWidth: r.chance(0.3), hugHeight: r.chance(0.3) };
    if (kids.length && c.feat.has('solo') && r.chance(0.3)) ct.solo = { active: r.pick(kids).id };
    if (kids.length > 1 && c.feat.has('order') && r.chance(0.3)) ct.drawOrder = kids.map((k) => k.id).reverse();
    if (kind === 'group' && kids.length && depth < 2 && c.feat.has('repeat') && r.chance(0.3)) {
      ct.children = [createNode('group', { name: 'tmpl', width: 40, height: 20, children: [createNode('rect', { width: 40, height: 20, bindings: { opacity: '0.4 + index / 10' } } as never), createNode('text', { text: '{item.t}{index}', width: 40, height: 20 } as never)] as SceneNode[] } as never)];
      ct.repeat = { items: 'items', layout: r.pick(['vertical', 'horizontal', 'grid', 'none']), gap: r.int(6), columns: 2 };
      ct.solo = undefined;
      ct.drawOrder = undefined;
    }
  } else node = createNode(kind as 'rect', base as never);
  if ('fill' in node) paints(r, node as never);
  if (c.feat.has('mask') && r.chance(0.12) && (node.type === 'rect' || node.type === 'ellipse')) node.mask = true;
  if (c.feat.has('bindings') && r.chance(0.3)) {
    const b: Record<string, string> = {};
    for (let i = 0; i < 1 + r.int(2); i++) {
      const [k, e] = r.pick(BINDS).split(': ');
      b[k] = e;
    }
    if (node.type === 'text' && r.chance(0.5)) b.text = "'v' + n + s";
    node.bindings = b;
  }
  c.ids.push(node.id);
  return node;
}

function genProject(seed: number): Project {
  const r = rng(seed);
  const p = createProject('EV' + seed);
  p.variables.push({ id: 'vn', name: 'n', type: 'number', initial: 3 }, { id: 'vs', name: 's', type: 'string', initial: 'x' }, { id: 'vi', name: 'items', type: 'list', initial: JSON.stringify([{ t: 'a' }, { t: 'b' }]) });
  const hard = r.chance(0.5);
  const plain = r.chance(0.65);
  const feat = new Set(['bindings', 'repeat', 'solo', 'order', 'layout', 'mask', 'constraints', 'modifiers', 'skin'].filter((f) => r.chance(0.45) && (hard || !['repeat', 'constraints', 'skin'].includes(f)) && (!plain || ['modifiers', 'mask'].includes(f))));
  const ab = p.artboards[0];
  const c: Ctx = { r, ids: [], feat, instanceTarget: !plain && r.chance(0.2) ? 'ab2' : null };
  for (let i = 0, n = 3 + r.int(6); i < n; i++) ab.children.push(genNode(c, 0));
  for (let i = 1; i < ab.children.length; i++) if (feat.has('constraints') && r.chance(0.3)) ab.children[i].constraints = [{ id: uid('c'), type: 'copyPosition', target: ab.children[r.int(i)].id, strength: 1 } as never];
  if (feat.has('skin')) {
    const fore = createNode('bone', { name: 'fore', x: 50, y: 0, width: 50 }) as BoneNode;
    const upper = createNode('bone', { name: 'upper', x: 10, y: 60, width: 50, children: [fore] }) as BoneNode;
    const path = createNode('path', { width: 100, height: 100, originX: 0, originY: 0, paths: [{ closed: false, points: [{ x: 20, y: 62 }, { x: 70, y: 58 }, { x: 110, y: 62 }] }] } as never) as PathNode;
    ab.children.push(upper, path);
    const w = worldMatrices(ab.children);
    path.skin = bindPath(path, w.get(path.id)!, [{ id: upper.id, world: w.get(upper.id)!, length: 50 }, { id: fore.id, world: w.get(fore.id)!, length: 50 }]);
    c.ids.push(upper.id, fore.id, path.id);
  }
  if (c.instanceTarget) p.artboards.push({ ...structuredClone(ab), id: 'ab2', name: 'Other', canvasX: 900, children: [createNode('rect', { width: 30, height: 30 }), createNode('text', { text: 'inst {n}' })] as SceneNode[], timelines: [] } as Artboard);
  const tl: Timeline = { id: 'tl0', name: 'T0', duration: 1000, loop: 'loop', autoplay: false, speed: 1, tracks: [] };
  for (let k = 0; k < 1 + r.int(4); k++) {
    const [prop, v0, v1] = r.pick<[string, unknown, unknown]>([['x', 0, 100], ['y', 0, 90], ['rotation', 0, 90], ['opacity', 0, 1], ['width', 10, 60], ['height', 10, 60], ['fill.color', '#ff0000', '#0000ff'], ['fills.0.color', '#ff0000', '#00ff00'], ['strokes.0.width', 0, 5], ['visible', true, false]]);
    tl.tracks.push({ id: uid('tr'), nodeId: r.pick(c.ids), prop, keys: [{ id: uid('k'), t: 0, value: v0, ease: prop === 'visible' ? 'step' : 'linear' }, { id: uid('k'), t: 1000, value: v1, ease: prop === 'visible' ? 'step' : 'linear' }] as never });
  }
  ab.timelines.push(tl);
  return p;
}

//---- random edits through the store

function allIds(ab: Artboard): SceneNode[] {
  const out: SceneNode[] = [];
  walk(ab.children, (n) => out.push(n));
  return out;
}

function randomEdit(s: EditorStore, r: Rng): string {
  const ab = s.artboard()!;
  const nodes = allIds(ab);
  if (!nodes.length) return 'none';
  const n = r.pick(nodes);
  const id = n.id;
  const op = r.chance(0.75) ? r.pick([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 28, 29, 17, 27]) : r.int(30);
  const any = n as unknown as Record<string, unknown>;
  switch (op) {
    case 0:
    case 1:
    case 2:
      s.setProps([id], { x: r.int(200), y: r.int(200) });
      return `move ${id}`;
    case 3:
      s.setProps([id], { opacity: r.int(100) / 100 });
      return `opacity ${id}`;
    case 4:
      s.setProps([id], { width: 10 + r.int(60), height: 10 + r.int(60), rotation: r.int(90) });
      return `size ${id}`;
    case 5:
      s.setProps([id], { visible: r.chance(0.5) });
      return `visible ${id}`;
    case 6:
      if (n.type === 'text') s.setProps([id], { text: r.pick(['one', 'two words here', '{n}', '']) });
      return `text ${id}`;
    case 7:
      s.setProps([id], { fill: { type: 'solid', color: r.pick(COLORS) } });
      return `fill ${id}`;
    case 8:
      s.setProps([id], { fills: [{ type: 'solid', color: r.pick(COLORS) }, { type: 'solid', color: r.pick(COLORS), opacity: 0.5 }], paintOrder: r.pick([undefined, ['fill', 'stroke', 'fill'], ['stroke', 'fill', 'fill']]) });
      return `fills ${id}`;
    case 9:
      s.setProps([id], { strokes: [{ paint: { type: 'solid', color: r.pick(COLORS) }, width: 1 + r.int(4) }], paintOrder: r.pick([undefined, ['stroke', 'fill'], ['fill', 'stroke']]) });
      return `strokes ${id}`;
    case 10:
      s.setProps([id], { bindings: r.chance(0.7) ? { [r.pick(['opacity', 'x', 'rotation'])]: r.pick(['n / 8', 'n * 5']) } : undefined });
      return `bindings ${id}`;
    case 11:
      if (n.type === 'frame') s.setProps([id], { layout: r.chance(0.7) ? { direction: r.pick(['row', 'column']), gap: r.int(8), padding: { top: 2, right: 2, bottom: 2, left: 2 }, justify: 'start', align: r.pick(['start', 'stretch']), wrap: false, hugWidth: r.chance(0.3), hugHeight: r.chance(0.3) } : undefined });
      return `layout ${id}`;
    case 12:
      if (isContainer(n) && n.children.length) s.setProps([id], { solo: r.chance(0.7) ? { active: r.pick(n.children).id } : undefined });
      return `solo ${id}`;
    case 13:
      if (isContainer(n) && n.children.length > 1) s.setProps([id], { drawOrder: r.chance(0.7) ? n.children.map((c) => c.id).reverse() : undefined });
      return `drawOrder ${id}`;
    case 14:
      if (n.type === 'rect' || n.type === 'ellipse') s.setProps([id], { mask: r.chance(0.5) });
      return `mask ${id}`;
    case 15: {
      const other = nodes.filter((o) => o.id !== id);
      if (other.length) s.setProps([id], { constraints: r.chance(0.7) ? [{ id: uid('c'), type: 'copyPosition', target: r.pick(other).id, strength: 1 }] : undefined });
      return `constraints ${id}`;
    }
    case 16:
      if (n.type === 'group' && n.children.length) s.setProps([id], { repeat: r.chance(0.7) ? { items: 'items', layout: 'vertical', gap: 2, columns: 1 } : undefined });
      return `repeat ${id}`;
    case 17:
      s.update((d) => {
        const v = d.variables.find((x) => x.name === 'n');
        if (v) v.initial = r.int(8);
      });
      return 'variable n';
    case 18:
      s.update((d) => {
        const v = d.variables.find((x) => x.name === 'items');
        if (v) v.initial = JSON.stringify(r.pick([[{ t: 'q' }], [{ t: 'a' }, { t: 'b' }, { t: 'c' }], []]));
      });
      return 'variable items';
    case 19:
      s.addNodes([createNode(r.pick(['rect', 'ellipse', 'text'] as const), { name: 'New', x: r.int(200), y: r.int(200) })]);
      return 'add';
    case 20:
      s.select([id]);
      s.deleteSelection();
      return `delete ${id}`;
    case 21:
      s.select([id]);
      s.duplicateSelection();
      return `duplicate ${id}`;
    case 22:
      if (ab.children.length > 1) {
        s.select(ab.children.slice(0, 2).map((c) => c.id));
        s.groupSelection();
      }
      return 'group';
    case 23: {
      const g = nodes.find((x) => x.type === 'group');
      if (g) {
        s.select([g.id]);
        s.ungroupSelection();
      }
      return 'ungroup';
    }
    case 24:
      s.select([id]);
      s.reorder(r.pick([-1, 1]));
      return `reorder ${id}`;
    case 25:
      if (s.canUndo()) s.undo();
      return 'undo';
    case 26:
      if (s.canRedo()) s.redo();
      return 'redo';
    case 27:
      if (n.type === 'text') s.addTextModifier(id, { unit: 'letter', start: 0, end: 60 });
      return `modifier ${id}`;
    case 28:
      s.setProps([id], { blur: r.int(3), blendMode: r.pick(['normal', 'multiply']), cornerRadius: r.int(8), name: 'N' + r.int(9) });
      return `style ${id}`;
    default:
      void any;
      s.setProps([id], { x: r.int(200) }, 'drag-' + id);
      return `drag ${id}`;
  }
}

//---- harness

let root: Root;
let host: HTMLElement;
//jsdom has no text layout: give ranges a size from their text, so auto-sized text is measured and written back like in a browser
const rangeProto = Range.prototype as unknown as { getBoundingClientRect?: () => unknown; getClientRects?: () => unknown };
rangeProto.getBoundingClientRect ??= function (this: Range) {
  const w = this.toString().length * 6;
  return { x: 0, y: 0, left: 0, top: 0, right: w, bottom: 12, width: w, height: 12, toJSON() {} };
};
rangeProto.getClientRects ??= () => [];
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

function view(project: Project, ab: Artboard, tl: Timeline | null, time: number) {
  return <ArtboardView artboard={ab} project={project} timeline={tl} time={time} active live assetVersion={0} dataVersion={0} />;
}

/** The DOM of a view, with generated ids numbered by first appearance and style declarations sorted (their written order is not what is drawn). */
function norm(el: HTMLElement): string {
  const seen = new Map<string, string>();
  return el.innerHTML
    .replace(/\bix[a-z]{1,3}\d+\b/g, (m) => {
      if (!seen.has(m)) seen.set(m, `#${seen.size}`);
      return seen.get(m)!;
    })
    .replace(/ style="([^"]*)"/g, (_m, st: string) => ` style="${st.split(';').map((d) => d.trim()).filter(Boolean).sort().join('; ')}"`);
}

function fresh(project: Project, ab: Artboard, tl: Timeline | null, time: number): string {
  const h = document.createElement('div');
  document.body.appendChild(h);
  const rt = createRoot(h);
  act(() => rt.render(view(project, ab, tl, time)));
  const out = norm(h);
  act(() => rt.unmount());
  h.remove();
  return out;
}

describe('canvas incremental redraw equals a full redraw (editor, differential)', () => {
  const base = Number(process.env.ARTBOARD_FUZZ_SEED ?? 1);
  for (let run = 0; run < RUNS; run++) {
    const seed = base * 1000 + run;
    it(`seed ${seed}`, () => {
      const store = new EditorStore(genProject(seed));
      setCurrentStore(store);
      const r = rng(seed ^ 0x9e3779b9);
      const log: string[] = [];
      const spyU = vi.spyOn(Renderer.prototype, 'updateNodes');
      const spyR = vi.spyOn(Renderer.prototype, 'render');
      let time = 0;
      let scrub = false;
      for (let i = 0; i <= STEPS; i++) {
        if (i > 0) {
          const op = r.int(12);
          if (op === 0) {
            scrub = !scrub;
            log.push(scrub ? 'timeline on' : 'timeline off');
          } else if (op <= 3 && scrub) {
            time = r.int(1000);
            log.push(`time ${time}`);
          } else log.push(randomEdit(store, r));
        }
        const project = store.get().project;
        const ab = store.artboard()!;
        const tl = scrub ? ab.timelines[0] ?? null : null;
        act(() => root.render(view(project, ab, tl, time)));
        const got = norm(host);
        const want = fresh(project, ab, tl, time);
        if (got !== want) {
          if (process.env.ARTBOARD_FUZZ_DUMP) {
            const wantEl = document.createElement('div');
            wantEl.innerHTML = want;
            const gotEl = document.createElement('div');
            gotEl.innerHTML = got;
            for (const el of Array.from(gotEl.querySelectorAll('[data-ix-id]'))) {
              const id = el.getAttribute('data-ix-id')!;
              const other = wantEl.querySelector(`[data-ix-id="${id}"]`);
              const own = (x: Element) => { const c = x.cloneNode(true) as Element; c.querySelectorAll('[data-ix-id]').forEach((k) => k.remove()); return c.outerHTML; };
              if (!other || own(other) !== own(el)) {
                let found: SceneNode | undefined;
                walk(sampleArtboard(ab.children, tl, time), (n) => { if (n.id === id) found = n; });
                console.log('FIRST DIFF', id, JSON.stringify(found), '\nINC ', own(el), '\nFULL', other && own(other));
                break;
              }
            }
          }
          let k = 0;
          while (k < got.length && got[k] === want[k]) k++;
          throw new Error(`${process.env.ARTBOARD_FUZZ_DUMP ? JSON.stringify({ tracks: ab.timelines[0]?.tracks.map((t) => [t.nodeId, t.prop, t.keys.map((k) => [k.t, k.value])]), nodes: ab.children }, null, 1).slice(0, 6000) : ''}\nstep ${i} (${log[i - 1]}) differs from a full redraw\nops: ${log.join(' | ')}\nincremental ...${got.slice(Math.max(0, k - 200), k + 250)}\nfull        ...${want.slice(Math.max(0, k - 200), k + 250)}`);
        }
        expect(got).toBe(want);
      }
      if (process.env.ARTBOARD_FUZZ_STATS) console.log('STATS', spyU.mock.calls.length, spyU.mock.results.filter((x) => x.value).length, spyR.mock.calls.length);
    });
  }
});
