//Responsive artboard sets in the editor: adding a variant (a copy with fresh ids, the breakpoints worked out), joining and
//leaving a set, deleting the base, the Layers order and the labels, the Responsive section with its pairing report, and the
//Preview's width slider helpers.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, Player, setMembers, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore, useEditor } from '../src/store/store';
import { VariantsSection } from '../src/panels/VariantsSection';
import { artboardChoices, orderedArtboards, rangeLabel, variantPlan } from '../src/lib/variants-edit';
import { PreviewWidth, breakpoints, responsiveSets, widthInside } from '../src/components/PreviewWidth';
import { TOPICS, topicBody } from '../src/help/topics';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;
let s: EditorStore;

/** A 900 x 500 "Chart" with a Bars layer, a Panel layer, an Intro timeline and a click interaction. */
function chart(): Project {
  const p = createProject('R');
  const ab = p.artboards[0];
  ab.name = 'Chart';
  ab.width = 900;
  ab.height = 500;
  ab.children.push(createNode('rect', { id: 'bars', name: 'Bars', width: 100, height: 50 }), createNode('rect', { id: 'panel', name: 'Panel', x: 200, width: 80, height: 80 }));
  ab.timelines.push({ id: 'tl', name: 'Intro', duration: 1000, loop: 'once', autoplay: true, speed: 1, tracks: [{ id: 'tr', nodeId: 'bars', prop: 'x', keys: [{ id: 'k1', t: 0, value: 0, ease: 'linear' }, { id: 'k2', t: 1000, value: 100, ease: 'linear' }] }] });
  ab.logic.nodes.push({ id: 'ev', kind: 'event.pointer', x: 0, y: 0, params: { target: 'panel', type: 'click' } }, { id: 'act', kind: 'action.setProperty', x: 100, y: 0, params: { target: 'panel', prop: 'opacity', value: '0.2' } });
  ab.logic.edges.push({ id: 'e', from: 'ev', fromPort: 'out', to: 'act', toPort: 'in' });
  return p;
}
const abs = () => s.get().project.artboards;

beforeEach(() => {
  document.body.innerHTML = '';
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  s = new EditorStore(chart());
  setCurrentStore(s);
});
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  host?.remove();
  host = undefined;
  vi.unstubAllGlobals();
});

describe('adding a variant', () => {
  it('copies the artboard with fresh ids, joins it to the set and gives the old artboard a breakpoint', () => {
    const id = s.addVariant(abs()[0].id, 'narrower')!;
    const [base, v] = abs();
    expect(v.id).toBe(id);
    expect(v.name).toBe('Chart narrow');
    expect(v.variantOf).toBe(base.id);
    expect(v.width).toBe(360);
    expect(v.height).toBe(500);
    expect(v.minWidth).toBe(0);
    expect(base.minWidth).toBe(600);
    //the same names, new ids, and the interaction and the timeline point at the copy's own
    expect(v.children.map((n) => n.name)).toEqual(['Bars', 'Panel']);
    expect(v.children[0].id).not.toBe('bars');
    expect(v.timelines[0].id).not.toBe('tl');
    expect(v.timelines[0].tracks[0].nodeId).toBe(v.children[0].id);
    expect(v.logic.nodes.find((n) => n.kind === 'event.pointer')!.params.target).toBe(v.children[1].id);
    expect(s.get().activeArtboardId).toBe(id);
    //it sits to the right on the canvas
    expect(v.canvasX).toBeGreaterThanOrEqual(base.canvasX + base.width + 100);
  });

  it('is one undo step', () => {
    s.addVariant(abs()[0].id);
    expect(abs()).toHaveLength(2);
    s.undo();
    expect(abs()).toHaveLength(1);
    expect(abs()[0].minWidth).toBeUndefined();
  });

  it('adds a wider one above the widest, and a second narrow one below the narrowest', () => {
    const base = abs()[0].id;
    s.addVariant(base, 'narrower');
    s.addVariant(base, 'wider');
    const [, , wide] = abs();
    expect(wide.width).toBe(1260);
    expect(wide.minWidth).toBe(900);
    expect(abs()[0].minWidth).toBe(600);
    //adding to a variant adds to the same set
    s.addVariant(abs()[1].id, 'narrower');
    const tiny = abs()[3];
    expect(tiny.variantOf).toBe(abs()[0].id);
    //the narrow one that was the narrowest takes a breakpoint, and the new one is shown below it
    expect(tiny.minWidth).toBe(0);
    expect(abs()[1].minWidth).toBeGreaterThan(0);
    expect(setMembers(abs(), tiny).map((a) => a.name)).toEqual(['Chart narrow 2', 'Chart narrow', 'Chart', 'Chart wide']);
  });

  it('gives a duplicate of a variant an artboard of its own', () => {
    s.addVariant(abs()[0].id);
    s.duplicateArtboard(abs()[1].id);
    const copy = abs()[2];
    expect(copy.variantOf).toBeUndefined();
    expect(copy.minWidth).toBeUndefined();
  });

  it('plans small artboards and artboards that already have a breakpoint', () => {
    const mk = (width: number, minWidth?: number) => ({ ...abs()[0], width, minWidth });
    expect(variantPlan([mk(900)], 'narrower')).toMatchObject({ width: 360, minWidth: 0, edgeMinWidth: 600 });
    expect(variantPlan([mk(500)], 'narrower')).toMatchObject({ width: 300, minWidth: 0, edgeMinWidth: 350 });
    expect(variantPlan([mk(900, 600)], 'narrower')).toEqual({ width: 360, height: 500, minWidth: 0 });
    expect(variantPlan([mk(360), mk(900, 600)], 'wider')).toMatchObject({ width: 1260, minWidth: 900 });
    expect(variantPlan([mk(900, 1000)], 'wider').minWidth).toBe(1100);
  });
});

describe('linking, unlinking and deleting', () => {
  it('makes an artboard a variant of another (its set, never a variant of a variant), and standalone again', () => {
    s.addArtboard({ name: 'Other' });
    s.addArtboard({ name: 'Third' });
    const [a, b, c] = abs();
    s.setVariantOf(b.id, a.id);
    expect(abs()[1].variantOf).toBe(a.id);
    s.setVariantOf(c.id, b.id);
    expect(abs()[2].variantOf).toBe(a.id);
    s.setVariantOf(a.id, b.id);
    expect(abs()[0].variantOf).toBeUndefined();
    s.setVariantOf(b.id, null);
    expect(abs()[1].variantOf).toBeUndefined();
  });

  it('keeps the breakpoint to a whole number from 0, and drops it at 0', () => {
    s.addVariant(abs()[0].id);
    const v = abs()[1].id;
    s.setBreakpoint(v, 480.4);
    expect(abs()[1].minWidth).toBe(480);
    s.setBreakpoint(v, -20);
    expect(abs()[1].minWidth).toBeUndefined();
  });

  it('promotes the narrowest variant when the base is deleted', () => {
    const base = abs()[0].id;
    s.addVariant(base, 'narrower');
    s.addVariant(base, 'wider');
    s.update((d) => void (d.settings.startArtboardId = base));
    s.deleteArtboard(base);
    const [narrow, wide] = abs();
    expect(narrow.variantOf).toBeUndefined();
    expect(wide.variantOf).toBe(narrow.id);
    expect(s.get().project.settings.startArtboardId).toBe(narrow.id);
  });

  it('just removes a variant', () => {
    s.addVariant(abs()[0].id);
    s.deleteArtboard(abs()[1].id);
    expect(abs()).toHaveLength(1);
  });
});

describe('listing', () => {
  it('puts variants under their base, narrowest first, and labels the ranges', () => {
    const base = abs()[0].id;
    s.addArtboard({ name: 'Solo' });
    s.addVariant(base, 'wider');
    s.addVariant(base, 'narrower');
    const order = orderedArtboards(abs());
    expect(order.map((a) => a.name)).toEqual(['Chart', 'Chart narrow', 'Chart wide', 'Solo']);
    expect(order.map((a) => rangeLabel(abs(), a))).toEqual(['600–899 px', '0–599 px', '900+ px', '']);
  });

  it('offers a set once where an interaction names an artboard, keeping a chosen member', () => {
    const base = abs()[0].id;
    s.addVariant(base);
    expect(artboardChoices(s.get().project)).toEqual([{ value: base, label: 'Chart (responsive)' }]);
    expect(artboardChoices(s.get().project, abs()[1].id).map((o) => o.value)).toEqual([base, abs()[1].id]);
  });
});

describe('the Responsive section', () => {
  function mount(id: string) {
    function Harness() {
      const project = useEditor((st) => st.project);
      return <VariantsSection ab={project.artboards.find((a) => a.id === id)!} project={project} />;
    }
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<Harness />));
  }
  const button = (text: string) => Array.from(host!.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;

  it('offers to add a variant to an artboard on its own, and does it', () => {
    mount(abs()[0].id);
    act(() => (host!.querySelector('.section-title') as HTMLElement).click());
    expect(button('Add narrow variant')).toBeTruthy();
    act(() => button('Add narrow variant')!.click());
    expect(abs()).toHaveLength(2);
  });

  it('lists the members and the pairing report between this one and each other', () => {
    s.addVariant(abs()[0].id);
    //a layer only the copy has, and a timeline only the original has
    s.update((d) => {
      d.artboards[1].children.push(createNode('rect', { id: 'menu', name: 'Menu' }));
      d.artboards[0].timelines.push({ id: 'x', name: 'Extra', duration: 100, loop: 'once', autoplay: false, speed: 1, tracks: [] });
    });
    mount(abs()[0].id);
    const members = Array.from(host!.querySelectorAll('.variant-name')).map((b) => b.textContent);
    expect(members).toEqual(['Chart narrow', 'Chartbase']);
    expect(host!.querySelectorAll('.variant-list li')).toHaveLength(2);
    const text = host!.querySelector('.variant-report')!.textContent!;
    expect(text).toContain('2 layers paired by name');
    expect(text).toContain('"Menu" is only in Chart narrow');
    expect(text).toContain('Timeline "Extra" is only in Chart');
  });

  it('says so when nothing is left over', () => {
    s.addVariant(abs()[0].id);
    mount(abs()[1].id);
    expect(host!.querySelector('.variant-report')!.textContent).toContain('nothing left over');
  });

  it('edits a breakpoint and makes a variant standalone', () => {
    s.addVariant(abs()[0].id);
    mount(abs()[1].id);
    const input = host!.querySelectorAll<HTMLInputElement>('.variant-list input')[0];
    act(() => {
      input.focus();
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(input, '420');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.blur();
    });
    expect(abs()[1].minWidth).toBe(420);
    act(() => button('Make standalone')!.click());
    expect(abs()[1].variantOf).toBeUndefined();
  });
});

describe('the Preview width slider', () => {
  it('finds the sets, the widths they switch at, and a width inside a member\'s range', () => {
    const p = s.get().project;
    expect(responsiveSets(p)).toEqual([]);
    s.addVariant(abs()[0].id, 'narrower');
    s.addVariant(abs()[0].id, 'wider');
    const sets = responsiveSets(s.get().project);
    expect(sets).toHaveLength(1);
    expect(breakpoints(sets)).toEqual([600, 900]);
    const [narrow, base, wide] = sets[0];
    expect([narrow.name, base.name, wide.name]).toEqual(['Chart narrow', 'Chart', 'Chart wide']);
    //the middle of each range, within the room there is
    expect(widthInside(sets[0], narrow, 1400)).toBe(400);
    expect(widthInside(sets[0], base, 1400)).toBe(750);
    expect(widthInside(sets[0], wide, 1400)).toBe(1150);
    expect(widthInside(sets[0], wide, 1000)).toBe(950);
  });

  it('shows a mark at each breakpoint, names the ranges, and reports the width', () => {
    s.addVariant(abs()[0].id, 'narrower');
    const sets = responsiveSets(s.get().project);
    const seen: (number | null)[] = [];
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<PreviewWidth sets={sets} width={420} max={1000} current="Chart narrow" onChange={(w) => seen.push(w)} />));
    expect(Array.from(host.querySelectorAll('.pw-mark')).map((m) => m.textContent)).toEqual(['600']);
    expect(Array.from(host.querySelectorAll('.pw-zone')).map((z) => z.textContent)).toEqual(['Chart narrow', 'Chart']);
    expect(host.querySelector('.pw-value')!.textContent).toBe('420 px');
    expect(host.querySelector('.pw-now')!.textContent).toContain('Chart narrow');
    act(() => (host!.querySelector('.pw-mark') as HTMLElement).click());
    expect(seen).toEqual([600]);
    act(() => (Array.from(host!.querySelectorAll('button')).find((b) => b.textContent === 'Full width') as HTMLElement).click());
    expect(seen).toEqual([600, null]);
  });
});

describe('what the editor makes plays', () => {
  it('shows the variant that fits and keeps the timeline when the box is resized', () => {
    s.addVariant(abs()[0].id);
    const stage = document.createElement('div');
    document.body.appendChild(stage);
    let w = 900;
    Object.defineProperty(stage, 'clientWidth', { get: () => w });
    const player = new Player(stage, JSON.parse(JSON.stringify(s.get().project)), { loadData: false });
    expect(player.artboard.name).toBe('Chart');
    player.step(400);
    w = 320;
    player.resize();
    expect(player.artboard.name).toBe('Chart narrow');
    expect(player.debugState().timelines[0]).toMatchObject({ name: 'Intro', time: 400, playing: true });
    player.destroy();
  });
});

describe('the help', () => {
  it('has a Responsive topic with a worked example, and the Preview and Artboards topics point at it', () => {
    const t = TOPICS.find((x) => x.id === 'responsive')!;
    expect(topicBody(t)).toContain('A worked example');
    expect(topicBody(TOPICS.find((x) => x.id === 'artboards')!)).toContain('(responsive)');
    expect(topicBody(TOPICS.find((x) => x.id === 'getting-started' || x.id === 'interface') ?? t)).toBeTruthy();
  });
});
