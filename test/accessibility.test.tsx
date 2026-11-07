import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, tabStops, type SceneNode } from 'interactives-player';
import { EditorStore, setCurrentStore, useEditor } from '../src/store/store';
import { AccessibilitySection, TabOrderSection } from '../src/panels/AccessibilitySections';
import { prefs, setPrefs } from '../src/lib/prefs';
import { standaloneHtml } from '../src/lib/export';
import { PrefsModal } from '../src/components/PrefsModal';
import { PreviewModal } from '../src/Editor';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let s: EditorStore;

/** Sections start closed when there is nothing set yet */
const open = () => {
  const head = host.querySelector<HTMLButtonElement>('.section-title[aria-expanded="false"]');
  if (head) act(() => head.click());
};

function mount(build: (kids: SceneNode[]) => void, ui: 'layer' | 'order', pick = 0) {
  const p = createProject('T');
  const kids = [1, 2, 3].map((i) => createNode('rect', { id: `r${i}`, name: `R${i}`, width: 50, height: 40 }));
  build(kids);
  p.artboards[0].children.push(...kids);
  s = new EditorStore(p);
  setCurrentStore(s);
  s.set({ activeArtboardId: p.artboards[0].id });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const Harness = () => {
    const ab = useEditor((st) => st.project).artboards[0];
    return ui === 'order' ? <TabOrderSection ab={ab} /> : <AccessibilitySection nodes={[ab.children[pick]]} ab={ab} />;
  };
  act(() => root.render(<Harness />));
  open();
  return kids;
}

afterEach(() => {
  if (root) act(() => root.unmount());
  host?.remove();
  root = undefined as unknown as Root;
});

describe('accessibility preference', () => {
  beforeEach(() => setPrefs({ accessibility: true }));

  it('defaults to on, and Preview is built with the player option only when it is off', async () => {
    expect(prefs().accessibility).toBe(true);
    const p = createProject('T');
    expect(await standaloneHtml(p, { debug: true })).not.toContain("project, { accessibility: false,");
    expect(await standaloneHtml(p, { debug: true, accessibility: true })).not.toContain("project, { accessibility: false,");
    expect(await standaloneHtml(p, { debug: true, accessibility: false })).toContain("project, { accessibility: false,");
  });
});

describe('screen reader preference', () => {
  const mountModal = async (el: React.ReactElement) => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(el);
      await new Promise((r) => setTimeout(r, 30));
    });
  };
  const btn = (text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.startsWith(text))!;
  beforeEach(() => setPrefs({ accessibility: true, screenReader: false }));

  it('is off by default and is its own preference next to Accessibility', async () => {
    localStorage.clear();
    expect(prefs().screenReader).toBe(false);
    await mountModal(<PrefsModal onClose={() => undefined} />);
    const boxes = [...host.querySelectorAll('label')].map((l) => l.textContent);
    const a = boxes.findIndex((t) => t?.includes('Accessibility features'));
    const sr = boxes.findIndex((t) => t?.includes('Screen reader strip'));
    expect(a).toBeGreaterThan(-1);
    expect(sr).toBe(a + 1);
    const input = [...host.querySelectorAll('label')][sr].querySelector('input')!;
    expect(input.checked).toBe(false);
    act(() => input.click());
    expect(prefs().screenReader).toBe(true);
    expect(prefs().accessibility).toBe(true);
  });

  it('the Preview strip shows only with Screen reader and Accessibility both on', async () => {
    const s = new EditorStore(createProject('T'));
    setCurrentStore(s);
    await mountModal(<PreviewModal onClose={() => undefined} />);
    expect(host.querySelector('.preview-said')).toBeNull();
    expect(btn('Screen reader').textContent).toBe('Screen reader off');
    act(() => btn('Screen reader').click());
    expect(prefs().screenReader).toBe(true);
    expect(btn('Screen reader').textContent).toBe('Screen reader on');
    expect(host.querySelector('.preview-said')).not.toBeNull();
    act(() => btn('Accessibility').click());
    expect(prefs().accessibility).toBe(false);
    expect(host.querySelector('.preview-said')).toBeNull();
  });
});

describe('Accessibility section', () => {
  it('sets a role, a text alternative and decorative, and decorative drops the role', () => {
    mount(() => undefined, 'layer');
    const select = host.querySelector('select')!;
    act(() => {
      select.value = 'button';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(s.get().project.artboards[0].children[0].role).toBe('button');
    expect(host.textContent).toContain('Reachable with Tab (button role). Enter and Space click it.');
    act(() => {
      select.value = 'decorative';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const n = s.get().project.artboards[0].children[0];
    expect(n.decorative).toBe(true);
    expect(n.role).toBeUndefined();
    expect(host.textContent).not.toContain('Text alternative');
  });

  it('shows a real control only its name and description', () => {
    const p = createProject('T');
    p.artboards[0].children.push(createNode('button', { id: 'b', label: 'Go' }));
    s = new EditorStore(p);
    setCurrentStore(s);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root.render(<AccessibilitySection nodes={[p.artboards[0].children[0]]} ab={p.artboards[0]} />));
    open();
    expect(host.textContent).toContain('A real control');
    expect(host.textContent).not.toContain('Tab stop');
  });
});

describe('Tab order list', () => {
  it('lists tab stops and the arrows write the whole sequence as numbers; reset clears them', () => {
    mount((k) => k.forEach((n) => (n.role = 'button')), 'order');
    const names = () => [...host.querySelectorAll('.tab-order-name')].map((b) => b.textContent!.trim().replace(/\s+/g, ' ').split(' ')[1]);
    expect(names()).toEqual(['R1', 'R2', 'R3']);
    //move R3 up
    const ups = host.querySelectorAll<HTMLButtonElement>('.tab-order button[title="Earlier in the Tab order"]');
    act(() => ups[2].click());
    expect(tabStops(s.get().project.artboards[0]).map((n) => n.name)).toEqual(['R1', 'R3', 'R2']);
    expect(names()).toEqual(['R1', 'R3', 'R2']);
    expect(s.get().project.artboards[0].children.map((n) => n.tabOrder)).toEqual([1, 3, 2]);
    act(() => [...host.querySelectorAll('button')].find((b) => b.textContent === 'Reset to layer order')!.click());
    expect(s.get().project.artboards[0].children.map((n) => n.tabOrder)).toEqual([undefined, undefined, undefined]);
  });

  it('renders nothing when the artboard has no tab stops', () => {
    mount(() => undefined, 'order');
    expect(host.textContent).toBe('');
  });
});
