import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createArtboard, createNode, defaultModifier, createProject, type NodeType, type Project, type SceneNode } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { Inspector } from '../src/panels/Inspector';
import { locate } from '../src/store/doc';
import { scoreEntry, suggest, type PropEntry } from '../src/lib/prop-search';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  disconnect() {}
  unobserve() {}
};

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const TYPES: NodeType[] = ['rect', 'ellipse', 'polygon', 'star', 'path', 'text', 'image', 'group', 'frame', 'button', 'input', 'link', 'embed', 'video', 'draw', 'shader', 'bone', 'progress', 'chart', 'connector'];

interface Scene {
  s: EditorStore;
  ids: Record<string, string>;
}
/** A project with one of everything on the first artboard, a second artboard, and a frame with auto layout and a child in it. */
function scene(): Scene {
  const p: Project = createProject('T');
  const ab = p.artboards[0];
  const ids: Record<string, string> = {};
  for (const t of TYPES) {
    const n = createNode(t as 'rect', { name: t } as never) as SceneNode;
    ab.children.push(n);
    ids[t] = n.id;
  }
  const second = createArtboard({ name: 'Second', width: 600, height: 400, canvasX: 1000, canvasY: 0 });
  p.artboards.push(second);
  const inst = createNode('instance', { name: 'inst', artboardId: second.id, width: 600, height: 400 });
  ab.children.push(inst);
  ids.instance = inst.id;
  const frame = createNode('frame', { name: 'stack' }) as SceneNode & { children: SceneNode[]; layout?: unknown };
  frame.layout = { direction: 'column', gap: 8, padding: [8, 8, 8, 8], align: 'start', justify: 'start' };
  const child = createNode('rect', { name: 'kid' });
  frame.children.push(child);
  ab.children.push(frame);
  ids.stack = frame.id;
  ids.kid = child.id;
  // one with the optional parts switched on: a binding, a text modifier, a constraint, a shadow, a repeat, a blur, a mask
  const rich = createNode('text', {
    name: 'rich',
    bindings: { text: '1 + 1' },
    modifiers: [defaultModifier()],
    constraints: [{ id: 'c1', type: 'copyPosition', target: ids.rect, strength: 1 }],
    shadow: { x: 2, y: 2, blur: 4, color: '#000000' },
    layerBlur: 3,
    mask: true,
    shortcut: 'r',
  } as never);
  ab.children.push(rich);
  ids.rich = rich.id;
  const list = createNode('group', { name: 'list', repeat: { items: '[1, 2]', layout: 'vertical', gap: 8, columns: 1 }, solo: { active: null } } as never);
  (list as unknown as { children: SceneNode[] }).children.push(createNode('rect', { name: 'row' }));
  ab.children.push(list);
  ids.list = list.id;
  ids.ab = ab.id;
  ids.second = second.id;
  const s = new EditorStore(p);
  setCurrentStore(s);
  return { s, ids };
}

/** Renders the panel with every section open, so the ones that start folded are counted too. */
function render() {
  act(() => root.render(<Inspector />));
  for (let i = 0; i < 5; i++) {
    const closed = [...host.querySelectorAll<HTMLElement>('.section-title[aria-expanded="false"]')];
    if (!closed.length) break;
    act(() => closed.forEach((b) => b.click()));
  }
}

/** Everything in a section that isn't carrying a search key (and isn't holding something that does). */
function unkeyed(): string[] {
  const out: string[] = [];
  for (const body of host.querySelectorAll('.section-body')) {
    for (const el of body.children) {
      if (el.hasAttribute('data-prop') || el.querySelector('[data-prop]')) continue;
      // a hint, a heading or a note has nothing to edit, so nothing to find
      if (!el.matches('button, input, select, textarea, a, .code-field') && !el.querySelector('button, input, select, textarea, a, .code-editor')) continue;
      out.push(`${body.previousElementSibling?.textContent?.trim() ?? '?'}: ${el.outerHTML.slice(0, 140)}`);
    }
  }
  return out;
}

describe('every inspector row has a search key', () => {
  const cases: [string, (x: Scene) => void][] = [
    ['the artboard and project', ({ s, ids }) => s.set({ activeArtboardId: ids.ab, selection: [], artboardSelected: true })],
    ['two artboards', ({ s, ids }) => s.pickArtboards([ids.ab, ids.second], ids.ab)],
    ...TYPES.map((t): [string, (x: Scene) => void] => [`a ${t}`, ({ s, ids }) => s.select([ids[t]])]),
    ['an instance', ({ s, ids }) => s.select([ids.instance])],
    ['a frame with auto layout', ({ s, ids }) => s.select([ids.stack])],
    ['a layer inside auto layout', ({ s, ids }) => s.select([ids.kid])],
    ['a text with bindings, modifiers, a constraint and a shadow', ({ s, ids }) => s.select([ids.rich])],
    ['a repeating group', ({ s, ids }) => s.select([ids.list])],
    ['several layers', ({ s, ids }) => s.select([ids.rect, ids.ellipse])],
    ['several layers of different kinds', ({ s, ids }) => s.select([ids.rect, ids.text, ids.frame])],
  ];
  for (const [name, pick] of cases) {
    it(name, () => {
      const x = scene();
      pick(x);
      render();
      expect(host.querySelectorAll('.section-body').length).toBeGreaterThan(0);
      expect(unkeyed()).toEqual([]);
      expect([...host.querySelectorAll('[data-prop]')].filter((el) => !el.getAttribute('data-prop')).map((el) => el.outerHTML.slice(0, 160))).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------- the scorer

const E = (label: string, section = 'Layer', tip?: string): PropEntry => ({ key: label.toLowerCase(), label, section, tip });
const ROWS = [E('α'), E('Radius', 'Rectangle'), E('Description', 'Accessibility'), E('Visible'), E('Colour', 'Fill'), E('Draw order', 'Draw order'), E('Size', 'Text'), E('Opacity', 'Effects'), E('W'), E('H'), E('X'), E('↻'), E('Blend'), E('Font', 'Text'), E('Weight', 'Text'), E('Text alternative', 'Accessibility'), E('Corner radius', 'Rectangle')];
/** Labels in the order a query ranks them, best first, only those that would be kept. */
const found = (q: string) => {
  const scored = ROWS.map((e) => [e.label, scoreEntry(q, e)] as const).filter((x) => x[1] > 0);
  const best = Math.max(0, ...scored.map((x) => x[1]));
  return scored.filter((x) => x[1] >= best * 0.5).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
};

describe('the property scorer', () => {
  it('finds a property by what else people call it', () => {
    expect(found('transparency')).toEqual(expect.arrayContaining(['Opacity', 'α']));
    expect(found('round')).toEqual(expect.arrayContaining(['Radius', 'Corner radius']));
    expect(found('alt')).toEqual(expect.arrayContaining(['Description', 'Text alternative']));
    expect(found('hide')).toEqual(['Visible']);
    expect(found('colour')).toEqual(['Colour']);
    expect(found('color')).toEqual(['Colour']);
    expect(found('z-order')).toEqual(['Draw order']);
    expect(found('font size')).toEqual(['Size']);
    expect(found('aria')).toEqual(expect.arrayContaining(['Description']));
    expect(found('width')).toEqual(['W']);
    expect(found('rotate')).toEqual(['↻']);
  });
  it('lets a typo through', () => {
    expect(found('opacty')[0]).toBe('Opacity');
    expect(found('blnd')).toEqual(['Blend']);
    expect(found('wdth')).toEqual(['W']);
    expect(found('transparancy')).toEqual(expect.arrayContaining(['Opacity']));
  });
  it('ranks an exact label over a prefix over a word start over a fuzzy hit', () => {
    const at = (q: string, label: string) => scoreEntry(q, E(label, ''));
    const exact = at('radius', 'Radius');
    const prefix = at('rad', 'Radius');
    const wordStart = at('rad', 'Corner radius');
    const inside = at('dius', 'Radius');
    const typo = at('radus', 'Radius');
    expect([exact, prefix, wordStart, inside, typo].every((n) => n > 0)).toBe(true);
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(wordStart);
    expect(wordStart).toBeGreaterThan(inside);
    expect(inside).toBeGreaterThan(typo);
  });
  it('does not mind the order of the words, and wants every one of them', () => {
    expect(scoreEntry('radius corner', E('Corner radius', ''))).toBeGreaterThan(0);
    expect(scoreEntry('corner banana', E('Corner radius', ''))).toBe(0);
    expect(found('rad corner')).toEqual(expect.arrayContaining(['Corner radius']));
  });
  it('reads a short label by its tip and its section', () => {
    expect(scoreEntry('opacity', E('α', 'Layer', 'Opacity (0 to 1)'))).toBeGreaterThan(0);
    expect(scoreEntry('text', E('Wrap', 'Text'))).toBeGreaterThan(0);
    expect(scoreEntry('text', E('Wrap', 'Fill'))).toBe(0);
  });
  it('suggests the closest name when nothing matches', () => {
    expect(suggest('transparncy', ROWS)).toBe('Opacity');
    expect(suggest('colr', ROWS)).toBe('Colour');
    expect(suggest('qqqq', ROWS)).toBeNull();
  });
});

// ---------------------------------------------------------------- the box in the panel

const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
const box = () => host.querySelector<HTMLInputElement>('.prop-search-input')!;
const type = async (v: string) => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    set.call(box(), v);
    box().dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle();
};
const key = (el: Element, k: string, mods: KeyboardEventInit = {}) => act(() => void el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods })));
const shown = () => [...new Set([...host.querySelectorAll<HTMLElement>('.section-body [data-prop]:not(.ps-hide)')].map((e) => e.getAttribute('data-prop')))];
const sections = () => [...host.querySelectorAll<HTMLElement>('.section:not(.ps-hide) .section-title')].map((e) => e.textContent?.trim());
const status = () => host.querySelector('.prop-search-status')?.textContent ?? '';

describe('searching the properties panel', () => {
  it('filters a layer to the matching rows and the sections they are in', async () => {
    const x = scene();
    x.s.select([x.ids.rect]);
    render();
    expect(shown().length).toBeGreaterThan(10);
    await type('transparency');
    expect(shown()).toEqual(['opacity']);
    expect(sections()).toEqual(['Layer', 'Fill']);
    expect(status()).toMatch(/^\d+ propert/);
    expect(host.querySelector('.inspector')!.classList.contains('ps-on')).toBe(true);
  });
  it('opens sections that start folded, and puts them back when the search is cleared', async () => {
    const x = scene();
    x.s.select([x.ids.rect]);
    act(() => root.render(<Inspector />));
    const open = () => host.querySelectorAll('.section-title[aria-expanded="true"]').length;
    const before = open();
    await type('interactions');
    expect(sections()).toContain('Interactions');
    await type('hide');
    expect(shown()).toContain('visible');
    await type('');
    expect(open()).toBe(before);
    expect(host.querySelector('.inspector')!.classList.contains('ps-on')).toBe(false);
    expect(host.querySelectorAll('.ps-hide').length).toBe(0);
  });
  it('finds a property by its synonym and shows several matches', async () => {
    const x = scene();
    x.s.select([x.ids.rect]);
    render();
    await type('round');
    expect(shown()).toEqual(expect.arrayContaining(['top-left', 'bottom-right']));
    await type('colour');
    expect(shown().length).toBeGreaterThan(0);
    expect(shown().every((k) => k !== 'x')).toBe(true);
  });
  it('says so when nothing matches, and offers the closest name', async () => {
    const x = scene();
    x.s.select([x.ids.rect]);
    render();
    await type('transparncy');
    expect(shown()).toEqual(['opacity']);
    await type('zzzzzz');
    expect(shown()).toEqual([]);
    expect(sections()).toEqual([]);
    expect(status()).toContain('No property called “zzzzzz”');
    expect(status()).not.toContain('Did you mean');
    // every word has to match, so a stray one is a miss, and the near one is offered
    await type('opacitty zzzzzz');
    expect(shown()).toEqual([]);
    expect(status()).toMatch(/Did you mean\s*Opacity/);
    act(() => host.querySelector<HTMLButtonElement>('.prop-search-status .link-btn')!.click());
    await settle();
    expect(box().value).toBe('Opacity');
    expect(shown()).toEqual(['opacity']);
  });
  it('leaves a found field fully usable', async () => {
    const x = scene();
    x.s.select([x.ids.rect]);
    render();
    await type('opacity');
    const input = host.querySelector<HTMLInputElement>('[data-prop="opacity"] input')!;
    act(() => {
      input.focus();
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(input, '50');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      input.blur();
    });
    expect(locate(x.s.artboard()!, x.ids.rect)!.node.opacity).toBe(0.5);
    // and the search is still on, on the same row
    expect(shown()).toEqual(['opacity']);
  });
  it('keeps the search when another layer is picked', async () => {
    const x = scene();
    x.s.select([x.ids.rect]);
    render();
    await type('opacity');
    act(() => x.s.select([x.ids.ellipse]));
    await settle();
    expect(box().value).toBe('opacity');
    expect(shown()).toEqual(['opacity']);
  });
  it('works on the artboard, the project, a multi-selection and several artboards', async () => {
    const x = scene();
    x.s.set({ activeArtboardId: x.ids.ab, selection: [], artboardSelected: true });
    render();
    await type('page title');
    expect(shown()).toEqual(['page-title']);
    expect(sections()).toEqual(['Project']);
    await type('preset');
    expect(shown()).toContain('preset');
    act(() => x.s.select([x.ids.rect, x.ids.ellipse]));
    await settle();
    await type('hide');
    expect(shown()).toEqual(['visible']);
    act(() => x.s.pickArtboards([x.ids.ab, x.ids.second], x.ids.ab));
    await settle();
    await type('align');
    expect(shown()).toContain('align-artboards');
  });
  it('sorts the best section first', async () => {
    const x = scene();
    x.s.select([x.ids.text]);
    render();
    await type('size');
    const order = [...host.querySelectorAll<HTMLElement>('.section:not(.ps-hide)')].map((s) => Number(s.style.order));
    expect(order.length).toBeGreaterThan(0);
    expect(order.every((n) => n <= 0)).toBe(true);
    expect(Math.min(...order)).toBeLessThan(0);
  });
  it('focuses with / and Ctrl+F, clears with Esc, and the down arrow goes to the first match', async () => {
    const x = scene();
    x.s.select([x.ids.rect]);
    render();
    const panel = host.querySelector('.inspector')!;
    const outside = panel.querySelector<HTMLElement>('.section-title')!;
    outside.focus();
    key(outside, '/');
    expect(document.activeElement).toBe(box());
    outside.focus();
    key(outside, 'f', { ctrlKey: true });
    expect(document.activeElement).toBe(box());
    await type('opacity');
    key(box(), 'ArrowDown');
    expect(document.activeElement).toBe(host.querySelector('[data-prop="opacity"] input'));
    // a slash typed into a field stays a slash
    const field = host.querySelector<HTMLInputElement>('[data-prop="opacity"] input')!;
    key(field, '/');
    expect(document.activeElement).toBe(field);
    key(box(), 'Escape');
    expect(box().value).toBe('');
    await settle();
    expect(host.querySelectorAll('.ps-hide').length).toBe(0);
  });
});
