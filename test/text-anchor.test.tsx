import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type SceneNode, type TextNode } from 'interactives-player';
import { ArtboardView } from '../src/canvas/ArtboardView';
import { EditorStore, setCurrentStore } from '../src/store/store';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

//jsdom has no text layout: ranges are as wide as their text (6px a letter)
const rangeProto = Range.prototype as unknown as { getBoundingClientRect?: () => unknown; getClientRects?: () => unknown };
rangeProto.getBoundingClientRect = function (this: Range) {
  const w = this.toString().length * 6;
  return { x: 0, y: 0, left: 0, top: 0, right: w, bottom: 12, width: w, height: 12, toJSON() {} };
};
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

function measured(text: Partial<TextNode>) {
  const p = createProject('T');
  const t = createNode('text', { id: 't', text: 'MMMMMMMMMM', fontSize: 10, x: 100, y: 40, width: 20, height: 12, autoSize: 'width', ...text } as never) as SceneNode;
  p.artboards[0].children.push(t);
  const store = new EditorStore(p);
  setCurrentStore(store);
  const ab = store.get().project.artboards[0];
  act(() => root.render(<ArtboardView artboard={ab} project={store.get().project} timeline={null} time={0} active live assetVersion={0} dataVersion={0} />));
  return () => store.get().project.artboards[0].children.find((n) => n.id === 't') as TextNode;
}

describe('measured hugging text keeps its alignment point', () => {
  //ten letters measure 60px wide, plus the one pixel the measure adds
  it('keeps the middle of centred text where it was (x moves by half the growth)', async () => {
    const get = measured({ align: 'center' });
    await act(async () => void (await Promise.resolve()));
    expect(get().width).toBe(61);
    expect(get().x).toBe(100 - (61 - 20) / 2);
  });

  it('keeps the right edge of right-aligned text', async () => {
    const get = measured({ align: 'right' });
    await act(async () => void (await Promise.resolve()));
    expect(get().width).toBe(61);
    expect(get().x).toBe(100 - 41);
  });

  it('leaves the x of left-aligned text alone', async () => {
    const get = measured({ align: 'left' });
    await act(async () => void (await Promise.resolve()));
    expect(get().width).toBe(61);
    expect(get().x).toBe(100);
  });
});
