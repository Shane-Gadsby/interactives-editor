import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type TextNode } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { RichTextEditor } from '../src/canvas/Canvas';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

//jsdom has no text layout
const rangeProto = Range.prototype as unknown as { getBoundingClientRect?: () => unknown; getClientRects?: () => unknown };
rangeProto.getBoundingClientRect ??= () => ({ x: 0, y: 0, left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10, toJSON() {} });
rangeProto.getClientRects ??= () => [];

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

function open(text = 'Hello world') {
  const p = createProject('T');
  const t = createNode('text', { name: 'T', text, x: 40, y: 40, width: 200, height: 40 } as never) as TextNode;
  p.artboards[0].children.push(t);
  const s = new EditorStore(p);
  setCurrentStore(s);
  s.select([t.id]);
  s.set({ editingTextId: t.id });
  const render = () => {
    const ab = s.artboard()!;
    const n = ab.children.find((c) => c.id === t.id) as TextNode;
    act(() => root.render(<RichTextEditor node={n} ab={ab} zoom={1} panX={0} panY={0} bounds={{ width: 800, height: 600 }} />));
  };
  render();
  return { s, t, render, node: () => s.artboard()!.children.find((c) => c.id === t.id) as TextNode };
}
const tb = (sel: string) => host.querySelector<HTMLInputElement>(`.text-toolbar ${sel}`)!;
const type = (el: HTMLInputElement, v: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v);
  act(() => void el.dispatchEvent(new Event('input', { bubbles: true })));
};
const key = (el: Element, k: string, extra: KeyboardEventInit = {}) => act(() => void el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra })));

describe('the real text editor with its toolbar', () => {
  it('editing opens with everything selected and the focus in the text', () => {
    open();
    expect(document.activeElement).toBe(host.querySelector('.text-editor'));
  });

  it('changing size, font and colour from the toolbar never pulls the focus back into the text', () => {
    const { s, node, render } = open();
    const editor = host.querySelector<HTMLElement>('.text-editor')!;
    act(() => void s.set({ textSelection: { id: node().id, start: 0, end: 5 } }));
    const size = tb('.tt-size');
    act(() => size.focus());
    //the page's own selection is somewhere else (as it is in a browser once an input has the focus): a repaint must leave it alone, since setting it in the text would take the focus
    const away = document.createElement('p');
    away.textContent = 'elsewhere';
    document.body.appendChild(away);
    document.getSelection()!.selectAllChildren(away);
    type(size, '40');
    key(size, 'Enter');
    render();
    expect(node().runs![0].fontSize).toBe(40);
    expect(document.activeElement).toBe(size);
    expect(document.getSelection()!.toString()).toBe('elsewhere');
    away.remove();
    key(size, 'ArrowUp');
    render();
    expect(node().runs![0].fontSize).toBe(41);
    expect(document.activeElement).toBe(size);
    const col = tb('.tt-swatch input');
    act(() => col.focus());
    type(col, '#ff0000');
    render();
    expect(node().runs![0].color).toBe('#ff0000');
    expect(document.activeElement).toBe(col);
    expect(document.activeElement).not.toBe(editor);
    // the text still shows the change, and Escape goes back to it with the selection as it was
    expect(editor.textContent).toBe('Hello world');
    key(col, 'Escape');
    expect(document.activeElement).toBe(editor);
    expect(s.get().textSelection).toMatchObject({ start: 0, end: 5 });
    expect(document.getSelection()!.toString()).toBe('Hello');
  });
});
