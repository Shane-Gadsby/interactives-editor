//The inspector side of disabled look, pressed / current, dialogs, keyboard navigation and shortcuts; the checker's findings for
//them; and that they survive loading and the live-editing ops.
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, normalizeProject, type Artboard, type LogicNode, type Project, type SceneNode } from 'interactives-player';
import { EditorStore, setCurrentStore, useEditor } from '../src/store/store';
import { AccessibilitySection } from '../src/panels/AccessibilitySections';
import { DialogSection, KeyNavSection } from '../src/panels/FrameA11ySections';
import { checkAccessibility } from '../src/lib/a11y/checks';
import type { Finding } from '../src/lib/a11y/types';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;
let s: EditorStore;

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = host = undefined;
});

type Which = 'a11y' | 'dialog' | 'keynav';

function mount(which: Which, nodes: SceneNode[], pick = 0, setup?: (p: Project) => void) {
  const p = createProject('T');
  p.artboards[0].children.push(...nodes);
  setup?.(p);
  s = new EditorStore(p);
  setCurrentStore(s);
  s.set({ activeArtboardId: p.artboards[0].id });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const Harness = () => {
    const project = useEditor((st) => st.project);
    const ab = project.artboards[0];
    const n = ab.children[pick];
    if (which === 'dialog') return <DialogSection node={n as never} ab={ab} project={project} />;
    if (which === 'keynav') return <KeyNavSection node={n as never} project={project} />;
    return <AccessibilitySection nodes={[n]} ab={ab} />;
  };
  act(() => root!.render(<Harness />));
  //sections start closed when there is nothing set yet
  const head = host.querySelector<HTMLButtonElement>('.section-title[aria-expanded="false"]');
  if (head) act(() => head.click());
  return p;
}

const node = (i = 0) => s.get().project.artboards[0].children[i] as SceneNode & Record<string, any>;
const field = (label: string) => [...host!.querySelectorAll<HTMLElement>('label.field, label.check-field')].find((l) => l.textContent?.trim().startsWith(label))!;
const select = (label: string, value: string) => {
  const el = field(label).querySelector('select')!;
  act(() => {
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const tick = (label: string) => act(() => field(label).querySelector<HTMLInputElement>('input[type=checkbox]')!.click());
const type = (label: string, value: string) => {
  const el = field(label).querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')!;
  act(() => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    el.blur();
  });
};

const frame = (o: object = {}) => createNode('frame', { id: 'f', name: 'Panel', x: 0, y: 0, width: 300, height: 200, ...o } as never) as SceneNode;

describe('pressed and current fields', () => {
  it('sets a pressed state on a button and a button-role layer, and clears it with Not a toggle', () => {
    mount('a11y', [createNode('button', { id: 'b', label: 'Go' } as never)]);
    select('Pressed state', 'on');
    expect(node().ariaPressed).toBe(true);
    select('Pressed state', 'off');
    expect(node().ariaPressed).toBe(false);
    select('Pressed state', 'none');
    expect(node().ariaPressed).toBeUndefined();
  });

  it('offers Pressed only on buttons and button roles', () => {
    mount('a11y', [createNode('rect', { id: 'r' } as never)]);
    expect(host!.textContent).not.toContain('Pressed state');
    select('Role', 'button');
    expect(host!.textContent).toContain('Pressed state');
  });

  it('sets what is current: yes, a kind, or no', () => {
    mount('a11y', [createNode('button', { id: 'b', label: 'Go' } as never)]);
    select('Current', 'true');
    expect(node().ariaCurrent).toBe(true);
    select('Current', 'page');
    expect(node().ariaCurrent).toBe('page');
    select('Current', 'none');
    expect(node().ariaCurrent).toBeUndefined();
  });
});

describe('disabled look', () => {
  it('is a bindable property pair in the property list', async () => {
    const { animatableProp } = await import('interactives-player');
    expect(animatableProp('disabled')?.kind).toBe('boolean');
    expect(animatableProp('disabledOpacity')?.kind).toBe('number');
    expect(animatableProp('ariaPressed')?.kind).toBe('boolean');
    expect(animatableProp('ariaCurrent')?.kind).toBe('string');
  });
});

describe('Dialog section', () => {
  it('turns a frame into a dialog and back', () => {
    mount('dialog', [frame()]);
    expect(node().dialog).toBeUndefined();
    tick('This frame is a dialog');
    expect(node().dialog).toEqual({});
    tick('This frame is a dialog');
    expect(node().dialog).toBeNull();
  });

  it('keeps only what differs from the defaults', () => {
    mount('dialog', [frame({ dialog: {} })]);
    tick('Modal');
    expect(node().dialog).toEqual({ modal: false });
    tick('Modal');
    expect(node().dialog).toEqual({});
    tick('Close on Escape');
    expect(node().dialog).toEqual({ closeOnEscape: false });
    tick('Return focus');
    expect(node().dialog).toEqual({ closeOnEscape: false, returnFocus: false });
  });

  it('picks an open variable and an initial focus layer from the frame\'s tab stops', () => {
    mount('dialog', [frame({ dialog: {}, children: [createNode('button', { id: 'ok', name: 'OK', label: 'OK' } as never), createNode('rect', { id: 'plain', name: 'Plain' } as never)] })], 0, (p) => p.variables.push({ id: 'vo', name: 'isOpen', type: 'boolean', initial: false } as never));
    const options = [...field('Initial focus').querySelectorAll('option')].map((o) => o.textContent);
    expect(options).toEqual(['Automatic (first tab stop)', 'OK']);
    select('Initial focus', 'ok');
    select('Open variable', 'vo');
    expect(node().dialog).toEqual({ initialFocus: 'ok', openVariable: 'vo' });
    select('Open variable', '');
    expect(node().dialog).toEqual({ initialFocus: 'ok' });
  });

  it('adds a scrim colour and strength, and a click outside is only offered for a modal', () => {
    mount('dialog', [frame({ dialog: {} })]);
    tick('Scrim');
    expect(node().dialog.scrim).toEqual({ type: 'solid', color: '#000000', opacity: 0.5 });
    expect(host!.textContent).toContain('Close on click outside');
    tick('Modal');
    expect(host!.textContent).not.toContain('Close on click outside');
    tick('Scrim');
    expect(node().dialog.scrim).toBeUndefined();
  });

  it('warns about a dialog with no text alternative', () => {
    mount('dialog', [frame({ dialog: {} })]);
    expect(host!.textContent).toContain('Give the dialog a Text alternative');
  });
});

describe('Keyboard navigation section', () => {
  const list = (o: object = {}) => frame({ children: [createNode('rect', { id: 'row', name: 'Row' } as never)], repeat: { items: '[1,2,3]', layout: 'vertical', gap: 4, columns: 1 }, ...o });

  it('turns navigation on as a list, or a grid for a grid repeater, and off again', () => {
    mount('keynav', [list()]);
    tick('Arrow keys move between the items');
    expect(node().keyNav).toEqual({ mode: 'list' });
    tick('Arrow keys move between the items');
    expect(node().keyNav).toBeNull();
    mount('keynav', [list({ repeat: { items: '[1,2,3]', layout: 'grid', gap: 4, columns: 3 } })]);
    tick('Arrow keys move between the items');
    expect(node().keyNav).toEqual({ mode: 'grid' });
    expect(host!.textContent).toContain("Uses the repeater's 3 columns");
  });

  it('changes mode, arrows, wrap and the focused-item variable', () => {
    mount('keynav', [list({ keyNav: { mode: 'list' } })], 0, (p) => p.variables.push({ id: 'vf', name: 'focused', type: 'number', initial: -1 } as never));
    select('Mode', 'radio');
    expect(node().keyNav.mode).toBe('radio');
    expect(host!.textContent).not.toContain('Wrap round');
    select('Mode', 'list');
    select('Arrows', 'horizontal');
    tick('Wrap round');
    select('Focused item', 'vf');
    expect(node().keyNav).toEqual({ mode: 'list', orientation: 'horizontal', wrap: true, indexVariable: 'vf' });
    select('Arrows', '');
    expect(node().keyNav.orientation).toBeUndefined();
  });

  it('asks for the column count of a grid on a plain container', () => {
    mount('keynav', [frame({ keyNav: { mode: 'grid' }, children: [createNode('button', { id: 'b1' } as never)] })]);
    type('Columns', '4');
    expect(node().keyNav.columns).toBe(4);
  });
});

describe('Shortcut field', () => {
  it('saves the text, trimmed, and clears when emptied', () => {
    mount('a11y', [createNode('button', { id: 'b', label: 'Go' } as never)]);
    type('Shortcut', ' Ctrl+Enter ');
    expect(node().shortcut).toBe('Ctrl+Enter');
    type('Shortcut', '');
    expect(node().shortcut).toBeUndefined();
  });

  it('warns about something that is not a key, about two layers with the same keys, and about an On key event', () => {
    mount('a11y', [createNode('button', { id: 'a', name: 'A', label: 'A' } as never), createNode('button', { id: 'b', name: 'B', label: 'B', shortcut: 'R' } as never)], 0, (p) => {
      p.artboards[0].logic.nodes.push({ id: 'k', kind: 'event.key', x: 0, y: 0, params: { key: 'q' } });
    });
    type('Shortcut', 'Bogus+R');
    expect(host!.textContent).toContain('That is not a key');
    type('Shortcut', 'r');
    expect(host!.textContent).toContain('Another layer uses these keys too (B)');
    type('Shortcut', 'q');
    expect(host!.textContent).toContain('An On key event also listens');
    type('Shortcut', 'w');
    expect(host!.textContent).not.toContain('uses these keys too');
    expect(host!.textContent).not.toContain('On key event also');
  });
});

describe('accessibility checker', () => {
  const scene = (children: SceneNode[], logic: LogicNode[] = []): Project => {
    const p = createProject('T');
    p.settings.title = 'T';
    const ab = p.artboards[0] as Artboard;
    ab.children.push(...children);
    ab.logic.nodes.push(...logic);
    return p;
  };
  const of = (p: Project, check: string): Finding[] => checkAccessibility(p).findings.filter((f) => f.check === check);

  it('flags a dialog with no name, and one with nothing a keyboard can reach', () => {
    const p = scene([frame({ dialog: {}, children: [createNode('rect', { id: 'r' } as never)] })]);
    expect(of(p, 'name').map((f) => f.title)).toEqual(['Dialog has no name']);
    expect(of(p, 'name')[0].fix?.set).toHaveProperty('ariaLabel');
    expect(of(p, 'keyboard').map((f) => f.title)).toEqual(['Nothing in the dialog can be reached by keyboard']);
  });

  it('passes a named dialog with a button in it', () => {
    const p = scene([frame({ ariaLabel: 'Settings', dialog: {}, children: [createNode('button', { id: 'b', label: 'OK' } as never)] })]);
    expect(of(p, 'name')).toEqual([]);
    expect(of(p, 'keyboard')).toEqual([]);
  });

  it('flags shortcuts that are not keys, shared, or shared with an On key event', () => {
    const p = scene([createNode('button', { id: 'a', name: 'A', label: 'A', shortcut: 'nope+' } as never), createNode('button', { id: 'b', name: 'B', label: 'B', shortcut: 'r' } as never), createNode('button', { id: 'c', name: 'C', label: 'C', shortcut: 'R' } as never), createNode('button', { id: 'd', name: 'D', label: 'D', shortcut: 'q' } as never)], [{ id: 'k', kind: 'event.key', x: 0, y: 0, params: { key: 'q' } }]);
    expect(of(p, 'keyboard').map((f) => `${f.nodeName}: ${f.title}`).sort()).toEqual(['A: Shortcut is not a key', 'B: Two layers use the same shortcut', 'C: Two layers use the same shortcut', 'D: A shortcut and an On key event share keys']);
  });

  it('counts a shortcut as the key way to a clickable shape', () => {
    const shape = (o: object) => createNode('rect', { id: 'r', name: 'Arrow', x: 0, y: 0, width: 60, height: 60, ariaLabel: 'Next', ...o } as never);
    const logic: LogicNode[] = [
      { id: 'e1', kind: 'event.pointer', x: 0, y: 0, params: { target: 'r', type: 'click' } },
      { id: 'a1', kind: 'action.timeline', x: 0, y: 0, params: { timeline: 't', op: 'play' } },
    ];
    const edges = [{ id: 'x', from: 'e1', fromPort: 'out', to: 'a1', toPort: 'in' }];
    const build = (o: object) => {
      const p = scene([shape(o)], logic);
      p.artboards[0].logic.edges.push(...edges);
      return p;
    };
    expect(of(build({}), 'keyboard').map((f) => f.title)).toEqual(['Only works with a mouse or touch']);
    expect(of(build({ shortcut: 'n' }), 'keyboard')).toEqual([]);
    expect(of(build({ shortcut: 'nope+' }), 'keyboard').map((f) => f.title)).toEqual(['Only works with a mouse or touch', 'Shortcut is not a key']);
    //A button role is a tab stop with Enter and Space in the player, Tab stop left on Auto; Never takes that away again
    expect(of(build({ role: 'button' }), 'keyboard')).toEqual([]);
    expect(of(build({ role: 'button', focusable: false }), 'keyboard').map((f) => f.title)).toEqual(['Only works with a mouse or touch']);
  });
});

describe('loading and saving', () => {
  it('keeps the new fields through load, and drops malformed ones', () => {
    const p = createProject('T');
    p.artboards[0].children.push(
      frame({ id: 'f', dialog: { modal: false, scrim: { type: 'solid', color: '#000' }, initialFocus: 'x', openVariable: 'v', closeOnEscape: 'yes', junk: 1 }, keyNav: { mode: 'grid', columns: 3, wrap: true, orientation: 'sideways' } }),
      createNode('button', { id: 'b', label: 'x', ariaPressed: true, ariaCurrent: 'page', shortcut: 'Ctrl+K', disabled: true, disabledOpacity: 0.3 } as never),
      createNode('button', { id: 'c', label: 'x', ariaPressed: 'yes', ariaCurrent: 'bogus', shortcut: 5, disabledOpacity: 'lots' } as never),
      createNode('rect', { id: 'r', dialog: { modal: false }, keyNav: { mode: 'list' } } as never),
    );
    const q = normalizeProject(JSON.parse(JSON.stringify(p)));
    const [f, b, c, r] = q.artboards[0].children as (SceneNode & Record<string, any>)[];
    expect(f.dialog).toEqual({ modal: false, scrim: { type: 'solid', color: '#000' }, initialFocus: 'x', openVariable: 'v' });
    expect(f.keyNav).toEqual({ mode: 'grid', columns: 3, wrap: true });
    expect([b.ariaPressed, b.ariaCurrent, b.shortcut, b.disabledOpacity]).toEqual([true, 'page', 'Ctrl+K', 0.3]);
    expect([c.ariaPressed, c.ariaCurrent, c.shortcut, c.disabledOpacity]).toEqual([undefined, undefined, undefined, undefined]);
    expect([r.dialog, r.keyNav]).toEqual([undefined, undefined]);
  });

  it('goes through the live-editing ops as ordinary layer properties', async () => {
    const { diff, apply } = (await import('../shared/ops.mjs')) as unknown as { diff: (a: unknown, b: unknown) => unknown[]; apply: (doc: unknown, ops: unknown[]) => unknown };
    const before = createProject('T');
    before.artboards[0].children.push(frame({ id: 'f' }), createNode('button', { id: 'b', label: 'x' } as never));
    const after = structuredClone(before);
    const [f, b] = after.artboards[0].children as (SceneNode & Record<string, any>)[];
    f.dialog = { modal: false, scrim: { type: 'solid', color: '#000', opacity: 0.4 } };
    f.keyNav = { mode: 'radio', indexVariable: 'v' };
    b.shortcut = 'r';
    b.ariaPressed = true;
    b.disabledOpacity = 0.2;
    const ops = diff(before, after);
    expect(ops.length).toBeGreaterThan(0);
    const doc = structuredClone(before);
    apply(doc, ops);
    expect(doc).toEqual(after);
  });
});
