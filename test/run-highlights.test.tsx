import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { clearFlow, currentHits, flashOf, flowVersion, FLASH_MS, lastQuietHit, pushFlow, whyNothing, wireClass } from '../src/lib/run-flow';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  clearFlow();
});

describe('run flow store', () => {
  beforeEach(() => vi.useFakeTimers());

  it('lights a node, a held-back event and a wire, then lets them go out', () => {
    pushFlow([
      { k: 'node', a: 'a', id: 'n1', s: 'ran' },
      { k: 'node', a: 'a', id: 'n2', s: 'blocked' },
      { k: 'edge', a: 'a', id: 'e1' },
    ]);
    expect(flashOf('n1')?.kind).toBe('ran');
    expect(flashOf('n2')?.kind).toBe('blocked');
    expect(flashOf('e1')?.kind).toBe('wire');
    expect(flashOf('nope')).toBeNull();
    vi.advanceTimersByTime(FLASH_MS + 200);
    expect(flashOf('n1')).toBeNull();
    expect(flashOf('e1')).toBeNull();
  });

  it('starts the flash over when the same node runs again (the counter changes)', () => {
    pushFlow([{ k: 'node', a: 'a', id: 'n1', s: 'ran' }]);
    const first = flashOf('n1')!.n;
    pushFlow([{ k: 'node', a: 'a', id: 'n1', s: 'ran' }]);
    expect(flashOf('n1')!.n).not.toBe(first);
  });

  it('tells subscribers at most about once every 80ms however fast it is fed', () => {
    const v0 = flowVersion();
    for (let i = 0; i < 50; i++) pushFlow([{ k: 'node', a: 'a', id: `t${i}`, s: 'ran' }]);
    vi.advanceTimersByTime(300);
    expect(flowVersion() - v0).toBeLessThanOrEqual(3);
  });

  it('ignores junk from the page', () => {
    pushFlow([null, 5, { k: 'node' }, { k: 'weird' }] as never);
    pushFlow('nope' as never);
    expect(flashOf('undefined')).toBeNull();
  });

  it('keeps hits for a moment and says why a click that ran nothing did nothing', () => {
    pushFlow([{ k: 'hit', a: 'a', layer: 'btn', name: 'Next', ran: 0, blocked: 0 }]);
    expect(currentHits()).toHaveLength(1);
    expect(lastQuietHit()?.reason).toMatch(/Nothing listens for a click on “Next”/);
    pushFlow([{ k: 'hit', a: 'a', layer: 'btn', name: 'Next', ran: 0, blocked: 1 }]);
    expect(lastQuietHit()?.reason).toMatch(/“Only if” said no/);
    pushFlow([{ k: 'hit', a: 'a', layer: '', ran: 0, blocked: 0 }]);
    expect(lastQuietHit()?.reason).toMatch(/empty space/);
    //a click that did something clears the line
    pushFlow([{ k: 'hit', a: 'a', layer: 'btn', ran: 2, blocked: 0 }]);
    expect(lastQuietHit()).toBeNull();
    vi.advanceTimersByTime(1500);
    expect(currentHits()).toHaveLength(0);
  });

  it('words the reasons for layers with and without a name', () => {
    expect(whyNothing({ layer: 'x', blocked: 0 })).toMatch(/that layer/);
    expect(whyNothing({ layer: '', blocked: 3 })).toMatch(/empty space/);
  });
});

describe('the Interactions graph while Preview runs', () => {
  let root: Root | null = null;
  let host: HTMLElement | null = null;
  afterEach(() => {
    if (root) act(() => root!.unmount());
    host?.remove();
    root = host = null;
  });

  async function mount() {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('DOMMatrixReadOnly', class { m22 = 1; constructor() {} });
    vi.stubGlobal('requestAnimationFrame', (fn: () => void) => void setTimeout(fn, 0));
    const { LogicGraph } = await import('../src/panels/LogicGraph');
    const p = createProject('T');
    p.artboards[0].logic.nodes.push({ id: 'ev', kind: 'event.start', x: 50, y: 50, params: {} }, { id: 'act', kind: 'action.emit', x: 350, y: 50, params: { name: 'hi' } });
    p.artboards[0].logic.edges.push({ id: 'w1', from: 'ev', fromPort: 'out', to: 'act', toPort: 'in' });
    setCurrentStore(new EditorStore(p));
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<LogicGraph />));
    await act(async () => void (await new Promise((r) => setTimeout(r, 5))));
  }
  const gnode = (id: string) => host!.querySelector(`.react-flow__node[data-id="${id}"] .ix-graph-node`) as HTMLElement;
  const later = (ms: number) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));

  it('lights the node that ran green with the word, the held-back one grey, and clears them', async () => {
    await mount();
    expect(gnode('ev').className).not.toMatch(/flash/);
    act(() => pushFlow([{ k: 'node', a: 'x', id: 'ev', s: 'ran' }, { k: 'node', a: 'x', id: 'act', s: 'blocked' }]));
    await later(150);
    expect(gnode('ev').className).toMatch(/flash-ran/);
    expect(gnode('ev').querySelector('.gn-ran')?.textContent).toBe('ran');
    expect(gnode('act').className).toMatch(/flash-blocked/);
    expect(gnode('act').querySelector('.gn-ran')?.textContent).toBe('held back');
    act(() => clearFlow());
    await later(10);
    expect(gnode('ev').className).not.toMatch(/flash/);
    expect(gnode('ev').querySelector('.gn-ran')).toBeNull();
  });

  //React Flow draws no wires without real sizes, so this is the class the graph hands the wire
  it('gives the wire that was followed its class while it is lit', async () => {
    await mount();
    expect(wireClass('w1')).toBe('');
    act(() => pushFlow([{ k: 'edge', a: 'x', id: 'w1' }]));
    expect(wireClass('w1')).toMatch(/^flash-wire flash-[01]$/);
  });
});

describe('Preview and the events it reports', () => {
  let root: Root;
  let host: HTMLElement;
  let store: EditorStore;
  beforeEach(async () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    const p = createProject('T');
    p.artboards[0].logic.nodes.push({ id: 'ev', kind: 'event.start', x: 0, y: 0, params: {} });
    store = new EditorStore(p);
    setCurrentStore(store);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const { PreviewModal } = await import('../src/Editor');
    //the player's source is a lazy chunk the editor warms up after its first paint: Preview's frame appears once it is in
    await (await import('../src/lib/player-source')).warmPlayerSource();
    await act(async () => root.render(<PreviewModal onClose={() => undefined} />));
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  const fromPreview = (data: unknown) => {
    const w = host.querySelector('iframe')!.contentWindow;
    act(() => void window.dispatchEvent(new MessageEvent('message', { data, source: w })));
  };

  const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 150))));
  it('answers "Why did nothing happen?" when a click ran nothing, and drops it once one does', async () => {
    fromPreview({ source: 'interactives-debug', flow: [{ k: 'hit', a: 'x', layer: 'btn', name: 'Next', ran: 0, blocked: 0 }] });
    await settle();
    expect(host.querySelector('.why-nothing')?.textContent).toMatch(/Why did nothing happen\?.*Nothing listens for a click on “Next”/);
    fromPreview({ source: 'interactives-debug', flow: [{ k: 'hit', a: 'x', layer: 'btn', ran: 1, blocked: 0 }] });
    await settle();
    expect(host.querySelector('.why-nothing')).toBeNull();
  });

  it('a line of the events list selects its node in the graph and moves Preview beside the editor', () => {
    const ab = store.get().project.artboards[0];
    fromPreview({ source: 'interactives-debug', trace: { artboard: ab.name, artboardId: ab.id, id: 'ev', event: 'On start', then: [], depth: 0 } });
    const row = host.querySelector<HTMLButtonElement>('.trace-node')!;
    expect(row.getAttribute('aria-label')).toMatch(/show this node/);
    expect(host.querySelector('.preview-backdrop')!.classList.contains('peek')).toBe(false);
    act(() => row.click());
    expect(store.get().logicSelection).toBe('ev');
    expect(store.get().bottomTab).toBe('logic');
    expect(host.querySelector('.preview-backdrop')!.classList.contains('peek')).toBe(true);
  });

  it('Beside editor is a pressed/unpressed toggle', () => {
    const btn = [...host.querySelectorAll<HTMLButtonElement>('header .btn')].find((b) => b.textContent === 'Beside editor')!;
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    act(() => btn.click());
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('.preview-backdrop')!.classList.contains('peek')).toBe(true);
    act(() => btn.click());
    expect(host.querySelector('.preview-backdrop')!.classList.contains('peek')).toBe(false);
  });
});
