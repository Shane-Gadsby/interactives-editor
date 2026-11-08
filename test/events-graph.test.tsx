//The graph's view of the event and navigation settings: the face of a node, and its settings form
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CATALOG_BY_KIND, createArtboard, createProject, defaultParams, type LogicNode } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const node = (id: string, kind: string, params: Record<string, unknown> = {}): LogicNode => ({ id, kind, x: 50, y: 50, params });

describe('summary on the face of a node', () => {
  async function summaries() {
    const { summarize } = await import('../src/panels/LogicGraph');
    const p = createProject('T');
    p.artboards.push(createArtboard({ id: 'res', name: 'Results' }));
    const ab = p.artboards[0];
    return (n: LogicNode) => summarize(n, ab, p);
  }

  it('Go to artboard keeps reading as the artboard\'s name for a project saved before "to"', async () => {
    const sum = await summaries();
    expect(sum(node('a', 'action.artboard', { artboard: 'res', transition: 'fade', duration: 300 }))).toBe('Results · Fade · 300');
    expect(sum(node('a', 'action.artboard', { to: 'picked', artboard: 'res', transition: 'none', duration: 0 }))).toBe('Results · Instant · 0');
  });

  it('Go to artboard says what it follows, and "computed" when an expression picks the target', async () => {
    const sum = await summaries();
    expect(sum(node('a', 'action.artboard', { to: 'next', transition: 'fade', duration: 300 }))).toBe('Next artboard · Fade · 300');
    expect(sum(node('a', 'action.artboard', { to: 'back', transition: 'none', duration: 300 }))).toBe('Back (where the learner came from) · Instant · 300');
    expect(sum(node('a', 'action.artboard', { to: 'expression', expr: 'nextPage', transition: 'fade', duration: 300 }))).toBe('computed · Fade · 300');
  });

  it('shows an event\'s Only if on its face, and a timer\'s Only while', async () => {
    const sum = await summaries();
    expect(sum(node('k', 'event.key', { key: 'Enter', type: 'keydown', onlyIf: 'sel >= 0' }))).toContain('if sel >= 0');
    expect(sum(node('k', 'event.key', { key: 'Enter', type: 'keydown', onlyIf: '' }))).not.toContain('if ');
    expect(sum(node('t', 'event.timer', { ms: '1000', repeat: true, while: 'running' }))).toBe('1000 · Repeat · while running');
    expect(sum(node('v', 'event.message', { name: 'ping', onlyIf: 'a  &&\n  b' }))).toBe('ping · if a && b');
  });

  it('a timer saved with a plain number reads as before', async () => {
    const sum = await summaries();
    expect(sum(node('t', 'event.timer', { ms: 1000, repeat: true }))).toBe('1000 · Repeat');
  });
});

describe('the catalog the form is built from', () => {
  it('every event node has an Only if, last, and an empty one by default', () => {
    for (const d of Object.values(CATALOG_BY_KIND).filter((x) => x.category === 'event')) {
      expect(d.params[d.params.length - 1].key, d.kind).toBe('onlyIf');
      expect(defaultParams(d.kind).onlyIf, d.kind).toBe('');
    }
  });

  it('Go to artboard defaults to a chosen artboard, with a No artboard output', () => {
    const d = CATALOG_BY_KIND['action.artboard'];
    expect(defaultParams('action.artboard').to).toBe('picked');
    expect(d.outputs.map((o) => o.id)).toEqual(['out', 'none']);
  });

});

describe('settings form', () => {
  let root: Root | null = null;
  let host: HTMLElement | null = null;
  afterEach(() => {
    if (root) act(() => root!.unmount());
    host?.remove();
    root = host = null;
    vi.unstubAllGlobals();
  });

  async function open(n: LogicNode) {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('DOMMatrixReadOnly', class { m22 = 1; constructor() {} });
    vi.stubGlobal('requestAnimationFrame', (fn: () => void) => void setTimeout(fn, 0));
    const { LogicGraph } = await import('../src/panels/LogicGraph');
    const p = createProject('T');
    p.artboards.push(createArtboard({ id: 'res', name: 'Results' }));
    p.artboards[0].logic.nodes.push(n);
    const s = new EditorStore(p);
    setCurrentStore(s);
    s.set({ logicSelection: n.id, logicPicked: [n.id] });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<LogicGraph />));
    await act(async () => void (await new Promise((r) => setTimeout(r, 5))));
    return s;
  }
  const labels = () => Array.from(host!.querySelectorAll('.param-form label, .param-form .field-label')).map((l) => l.textContent?.trim());

  it('Go to artboard shows the artboard picker for a chosen one and the expression box for a computed one', async () => {
    await open(node('a', 'action.artboard', { to: 'picked', artboard: 'res' }));
    expect(labels().join('|')).toContain('Artboard');
    expect(labels().join('|')).not.toContain('Artboard name or id');
    act(() => root!.unmount());
    host!.remove();
    await open(node('b', 'action.artboard', { to: 'expression', expr: '"Results"' }));
    expect(labels().join('|')).toContain('Artboard name or id');
  });

  it('the node on the graph carries the No artboard output and the Only if on its face', async () => {
    await open(node('a', 'action.artboard', { to: 'next' }));
    expect(host!.querySelector('.gn-out')?.parentElement?.textContent).toContain('No artboard');
    expect(host!.querySelector('.gn-body')?.textContent).toContain('Next artboard');
  });
});
