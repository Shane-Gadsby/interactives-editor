import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, defaultAutoLayout, type FrameNode } from 'interactives-player';
import { EditorStore, setCurrentStore, useEditor } from '../src/store/store';
import { AutoLayoutSection } from '../src/panels/Inspector';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let s: EditorStore;
let frameId: string;

/** The frame's Auto layout section, reading the frame from the store so it re-renders as the document changes. */
function Harness() {
  const frame = useEditor((st) => st.project.artboards[0].children.find((c) => c.id === frameId) as FrameNode);
  return <AutoLayoutSection frame={frame} />;
}
const frame = () => s.get().project.artboards[0].children.find((c) => c.id === frameId) as FrameNode;
const field = (label: string) => Array.from(host.querySelectorAll('label')).find((l) => l.querySelector('.field-label, span')?.textContent === label) as HTMLElement | undefined;
const pick = (label: string, value: string) => {
  const sel = field(label)!.querySelector('select')!;
  act(() => {
    sel.value = value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

beforeEach(() => {
  const p = createProject('T');
  const f = createNode('frame', { name: 'List', layout: defaultAutoLayout('column') });
  frameId = f.id;
  p.artboards[0].children.push(f);
  s = new EditorStore(p);
  setCurrentStore(s);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<Harness />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('Animate changes (auto layout inspector)', () => {
  it('is off by default and shows no settings', () => {
    expect(frame().layout!.animate).toBeUndefined();
    expect(field('Animate changes')!.querySelector('input')!.checked).toBe(false);
    expect(field('Duration')).toBeUndefined();
  });

  it('writes the format when toggled on and off', () => {
    act(() => field('Animate changes')!.querySelector('input')!.click());
    expect(frame().layout!.animate).toEqual({ duration: 250, ease: 'easeOut' });
    expect(field('Duration')).toBeDefined();
    act(() => field('Animate changes')!.querySelector('input')!.click());
    expect(frame().layout!.animate).toBeNull();
    expect(field('Duration')).toBeUndefined();
  });

  it('edits easing, enter and exit, leaving "none" out of the document', () => {
    act(() => field('Animate changes')!.querySelector('input')!.click());
    pick('Easing', 'backOut');
    pick('Enter', 'fade-scale');
    pick('Exit', 'fade');
    expect(frame().layout!.animate).toEqual({ duration: 250, ease: 'backOut', enter: 'fade-scale', exit: 'fade' });
    pick('Exit', 'none');
    expect(frame().layout!.animate).toEqual({ duration: 250, ease: 'backOut', enter: 'fade-scale' });
    // a custom curve starts from the preset and is stored as a cubic-bezier
    pick('Easing', 'custom');
    expect(Array.isArray(frame().layout!.animate!.ease)).toBe(true);
    expect(host.querySelector('.curve-editor')).not.toBeNull();
  });

  it('keeps the other auto layout settings when animate changes', () => {
    act(() => field('Animate changes')!.querySelector('input')!.click());
    expect(frame().layout!.direction).toBe('column');
    expect(frame().layout!.gap).toBe(8);
  });
});
