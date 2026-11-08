//The canvas measures auto-sized text in repeater copies, so a template needs no guessed heights
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, defaultAutoLayout, type FrameNode, type Project, type SceneNode } from 'interactives-player';
import { ArtboardView } from '../src/canvas/ArtboardView';
import { EditorStore, setCurrentStore } from '../src/store/store';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let measures = 0;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  measures = 0;
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      measures++;
      return Math.max(1, Math.ceil((this.textContent ?? '').length / 10)) * 20;
    },
  });
  (Range.prototype as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = function (this: Range) {
    const len = this.toString().length;
    return { x: 0, y: 0, left: 0, top: 0, right: len * 8, bottom: 20, width: len * 8, height: 20, toJSON: () => ({}) } as DOMRect;
  };
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}) }) as DOMRect);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight;
  delete (Range.prototype as unknown as Record<string, unknown>).getBoundingClientRect;
});

function build(items: string[]): Project {
  const p = createProject('T');
  p.variables.push({ id: 'rows', name: 'rows', type: 'list', initial: JSON.stringify(items) } as never);
  const text = createNode('text', { id: 't', name: 't', text: '{item}', width: 100, height: 20, autoSize: 'height' } as Partial<SceneNode>);
  const layout = { ...defaultAutoLayout('column'), gap: 4, padding: { top: 0, right: 0, bottom: 0, left: 0 }, hugHeight: true, hugWidth: false };
  p.artboards[0].children.push(createNode('frame', { id: 'list', name: 'list', width: 300, height: 100, layout, repeat: { items: 'rows', layout: 'none', gap: 0, columns: 1 }, children: [text] } as Partial<SceneNode>) as FrameNode);
  setCurrentStore(new EditorStore(p));
  return p;
}
const show = (p: Project, live = true) => act(() => root.render(<ArtboardView artboard={p.artboards[0]} project={p} timeline={null} time={0} active live={live} assetVersion={0} dataVersion={0} />));
const height = (id: string) => parseFloat(host.querySelector<HTMLElement>(`[data-ix-id="${id}"]`)!.style.height);

describe('repeater copies on the canvas', () => {
  it('measures the text in each copy and lays the frame out with it', () => {
    const p = build(['short', 'a rather longer line of words that wraps']);
    show(p);
    expect(height('t~0')).toBe(20);
    expect(height('t~1')).toBe(80);
    expect(height('list')).toBe(20 + 4 + 80);
    //the document is untouched: copies are not layers
    expect((p.artboards[0].children[0] as FrameNode).children).toHaveLength(1);
  });

  it('does not measure again for a draw that changed nothing in the copies', () => {
    const p = build(['short', 'a rather longer line of words that wraps']);
    show(p);
    const before = measures;
    expect(before).toBeGreaterThan(0);
    show(p);
    expect(measures).toBe(before);
  });

  it('leaves an artboard that is not the one being worked on alone', () => {
    const p = build(['short', 'a rather longer line of words that wraps']);
    show(p, false);
    expect(height('t~1')).toBe(20);
  });
});
