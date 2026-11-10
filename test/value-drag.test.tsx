//Dragging a variable or a data field onto the page: a new text that shows it, or added to the text it lands on.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type TextNode } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { Canvas } from '../src/canvas/Canvas';
import { VariablesPanel } from '../src/panels/ScriptsVariables';
import { VALUE_DRAG, getDraggedValue, placeValue, placeValueHere, readValueDrag, startValueDrag, withValue } from '../src/lib/value-drag';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  disconnect() {}
  unobserve() {}
};

Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

let root: Root | null = null;
let host: HTMLElement | null = null;
let s: EditorStore;

function setup() {
  const p = createProject('T');
  p.artboards[0].width = 1000;
  p.artboards[0].height = 800;
  p.variables.push({ id: 'v1', name: 'quizScore', label: 'Quiz score', type: 'number', initial: 3 }, { id: 'v2', name: 'cards', type: 'list', initial: '[1,2]' });
  p.artboards[0].children.push(createNode('text', { id: 'head', name: 'Heading', x: 100, y: 100, width: 300, height: 40, text: 'Your score:', autoSize: 'none' } as Partial<TextNode>));
  s = new EditorStore(p);
  setCurrentStore(s);
  return p;
}
function mount(ui: JSX.Element) {
  setup();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(ui));
}
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => void setTimeout(fn, 0));
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = host = null;
  vi.unstubAllGlobals();
});

const texts = () => s.get().project.artboards[0].children.filter((n) => n.type === 'text') as TextNode[];
const dt = (data: Record<string, string> = {}) => ({ types: Object.keys(data), dropEffect: '', effectAllowed: '', setData(k: string, v: string) { data[k] = v; }, getData: (k: string) => data[k] ?? '' });

describe('the value that is dragged', () => {
  it('is read back from the drop, and refused when it is not a plain formula', () => {
    expect(readValueDrag(dt({ [VALUE_DRAG]: JSON.stringify({ expr: 'quizScore', label: 'Quiz score' }) }) as never)).toEqual({ expr: 'quizScore', label: 'Quiz score' });
    expect(readValueDrag(dt({ [VALUE_DRAG]: JSON.stringify({ expr: 'a}{b', label: 'x' }) }) as never)).toBeNull();
    expect(readValueDrag(dt({ [VALUE_DRAG]: 'not json' }) as never)).toBeNull();
    expect(readValueDrag(dt() as never)).toBeNull();
  });

  it('starting a drag leaves the drop the value, as plain text for anything else, and what is being dragged for the canvas', () => {
    const data: Record<string, string> = {};
    startValueDrag({ dataTransfer: dt(data) as never }, { expr: 'people[0].name', label: 'people: name' });
    expect(JSON.parse(data[VALUE_DRAG])).toEqual({ expr: 'people[0].name', label: 'people: name' });
    expect(data['text/plain']).toBe('{people[0].name}');
    expect(getDraggedValue()?.expr).toBe('people[0].name');
  });

  it('goes at the end of a text, with a space unless there is one', () => {
    expect(withValue('Score:', 'x')).toBe('Score: {x}');
    expect(withValue('Score: ', 'x')).toBe('Score: {x}');
    expect(withValue('', 'x')).toBe('{x}');
  });
});

describe('placing a value on a page', () => {
  beforeEach(setup);

  it('makes a text layer that shows it where it was dropped, as one undo step', () => {
    const ab = s.get().project.artboards[0];
    const before = texts().length;
    const r = placeValue(ab.id, { x: 500.4, y: 300.6 }, { expr: 'quizScore', label: 'Quiz score' }, {});
    expect(r?.kind).toBe('made');
    const made = texts().find((t) => t.text === '{quizScore}')!;
    expect([made.name, made.x, made.y, made.autoSize]).toEqual(['Quiz score', 500, 301, 'width']);
    expect(s.get().selection).toEqual([made.id]);
    s.undo();
    expect(texts()).toHaveLength(before);
  });

  it('adds it to the end of the text it lands on, keeping that text, and undoes in one step', () => {
    const ab = s.get().project.artboards[0];
    const r = placeValue(ab.id, { x: 150, y: 110 }, { expr: 'quizScore', label: 'Quiz score' });
    expect(r).toMatchObject({ kind: 'added', id: 'head' });
    expect(texts().find((t) => t.id === 'head')!.text).toBe('Your score: {quizScore}');
    expect(texts()).toHaveLength(1);
    s.undo();
    expect(texts()[0].text).toBe('Your score:');
  });

  it('keeps the styling of rich text it is added to', () => {
    s.update((d) => {
      const t = d.artboards[0].children[0] as TextNode;
      t.runs = [{ text: 'Your ', fontWeight: 700 }, { text: 'score:' }] as TextNode['runs'];
      t.text = 'Your score:';
    });
    placeValue(s.get().project.artboards[0].id, { x: 150, y: 110 }, { expr: 'quizScore', label: 'Quiz score' });
    const t = texts()[0];
    expect(t.text).toBe('Your score: {quizScore}');
    expect(t.runs?.[0]).toMatchObject({ text: 'Your ', fontWeight: 700 });
  });

  it('does not change a page that belongs to a library', () => {
    s.update((d) => {
      d.artboards[0].library = { id: 'l', name: 'L' } as never;
    });
    const ab = s.get().project.artboards[0];
    const before = JSON.stringify(ab.children);
    expect(placeValue(ab.id, { x: 500, y: 300 }, { expr: 'x', label: 'x' })).toBeNull();
    expect(JSON.stringify(s.get().project.artboards[0].children)).toBe(before);
  });

  it('the button route adds to the one selected text, otherwise makes a new text on the open page', () => {
    s.select(['head']);
    placeValueHere({ expr: 'quizScore', label: 'Quiz score' }, {});
    expect(texts()[0].text).toBe('Your score: {quizScore}');
    s.select([]);
    placeValueHere({ expr: 'cards.length', label: 'How many in cards' }, {});
    expect(texts().map((t) => t.text)).toEqual(['Your score: {quizScore}', '{cards.length}']);
  });
});

describe('the canvas', () => {
  const canvas = () => host!.querySelector('.canvas')!;
  const dnd = (type: string, x: number, y: number, data: Record<string, string>) => {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(e, { clientX: x, clientY: y, relatedTarget: null, dataTransfer: dt(data) });
    return e;
  };
  const at = (px: number, py: number) => {
    const st = s.get();
    const ab = st.project.artboards[0];
    return { x: st.panX + (ab.canvasX + px) * st.zoom, y: st.panY + (ab.canvasY + py) * st.zoom };
  };
  const value = { [VALUE_DRAG]: JSON.stringify({ expr: 'quizScore', label: 'Quiz score' }) };

  it('takes a dropped variable: a new text on empty page, and the page outlined while over it', () => {
    mount(<Canvas />);
    const { x, y } = at(600, 500);
    act(() => void canvas().dispatchEvent(dnd('dragover', x, y, value)));
    expect(host!.querySelector('.drop-host')).toBeTruthy();
    act(() => void canvas().dispatchEvent(dnd('drop', x, y, value)));
    expect(host!.querySelector('.drop-host')).toBeNull();
    const made = texts().find((t) => t.text === '{quizScore}')!;
    expect([made.x, made.y]).toEqual([600, 500]);
  });

  it('adds a dropped variable to the text under the pointer, with no page outline', () => {
    mount(<Canvas />);
    const { x, y } = at(150, 110);
    act(() => void canvas().dispatchEvent(dnd('dragover', x, y, value)));
    expect(host!.querySelector('.drop-host')).toBeNull();
    act(() => void canvas().dispatchEvent(dnd('drop', x, y, value)));
    expect(texts()).toHaveLength(1);
    expect(texts()[0].text).toBe('Your score: {quizScore}');
  });
});

describe('the Variables tab handle', () => {
  it('is a real button that can be dragged, and pressing it adds the value to the page', () => {
    mount(<VariablesPanel />);
    const grip = host!.querySelector<HTMLButtonElement>('.var-table .show-on-page')!;
    expect(grip.tagName).toBe('BUTTON');
    expect(grip.draggable).toBe(true);
    expect(grip.getAttribute('aria-label')).toBe('Show Quiz score on the page');
    act(() => void grip.click());
    expect(texts().some((t) => t.text === '{quizScore}')).toBe(true);
  });

  it('a list variable shows how many it holds', () => {
    mount(<VariablesPanel />);
    const grips = host!.querySelectorAll<HTMLButtonElement>('.var-table .show-on-page');
    expect(grips[1].getAttribute('aria-label')).toBe('Show How many in cards on the page');
    act(() => void grips[1].click());
    expect(texts().some((t) => t.text === '{cards.length}')).toBe(true);
  });
});
