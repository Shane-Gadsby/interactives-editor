//The opened "From the page master" block sits above the graph in its own space and never covers the zoom buttons or the
//empty-graph hint. jsdom has no layout, so this checks the structure and the CSS that keeps it clear.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRoot, type Root } from 'react-dom/client';
import { createArtboard, createNode, createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const css = readFileSync(join(__dirname, '../src/styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const block = (sel: string) => {
  const out: string[] = [];
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) if (m[1].split(',').some((s) => s.trim() === sel)) out.push(m[2]);
  return out.join('\n');
};

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = host = null;
  vi.unstubAllGlobals();
});

describe('the master flows block and the graph', () => {
  it('is its own row above the graph, which keeps its controls and hint in a stage of their own', async () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('DOMMatrixReadOnly', class { m22 = 1; constructor() {} });
    vi.stubGlobal('requestAnimationFrame', (fn: () => void) => void setTimeout(fn, 0));
    const { LogicGraph } = await import('../src/panels/LogicGraph');
    const p = createProject('Deck');
    p.artboards = [createArtboard({ id: 'page', name: 'Page', master: 'm' }), createArtboard({ id: 'm', name: 'Chrome', isMaster: true })];
    const m = p.artboards[1];
    m.children.push(createNode('button', { id: 'nb', name: 'Next', label: 'Next' }));
    m.logic.nodes.push(
      { id: 'ev', kind: 'event.pointer', x: 0, y: 0, params: { type: 'click', target: 'nb' } },
      { id: 'go', kind: 'action.artboard', x: 100, y: 0, params: { to: 'next', transition: 'none', duration: 0 } },
    );
    m.logic.edges.push({ id: 'e1', from: 'ev', fromPort: 'out', to: 'go', toPort: 'in' });
    const s = new EditorStore(p);
    s.set({ activeArtboardId: 'page' });
    setCurrentStore(s);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<LogicGraph />));
    await act(async () => void (await new Promise((r) => setTimeout(r, 5))));

    const canvas = host.querySelector('.logic-canvas')!;
    const slot = canvas.querySelector('.master-flows-slot')!;
    expect(slot.querySelector('details.master-flows')).not.toBeNull();
    const stage = canvas.querySelector('.logic-stage')!;
    expect(stage).not.toBeNull();
    //the block is a sibling of the stage, not inside it, so it cannot sit over what the stage holds
    expect(slot.parentElement).toBe(canvas);
    expect(stage.parentElement).toBe(canvas);
    expect(stage.contains(slot)).toBe(false);
    expect(stage.querySelector('.react-flow__controls')).not.toBeNull();
    expect(stage.querySelector('.logic-empty')).not.toBeNull();
    //and it is a real button to open and close it
    expect(slot.querySelector('summary')).not.toBeNull();
  });

  it('the CSS puts the block in the flow, scrolls it when it is tall, and clears the view switch', () => {
    const slot = block('.master-flows-slot');
    expect(slot).not.toMatch(/position:\s*absolute/);
    expect(slot).toMatch(/flex:\s*none/);
    expect(slot).toMatch(/overflow-y:\s*auto/);
    expect(slot).toMatch(/max-height:\s*\d+%/);
    expect(block('.logic-canvas')).toMatch(/display:\s*flex/);
    expect(block('.logic-canvas')).toMatch(/flex-direction:\s*column/);
    const stage = block('.logic-stage');
    expect(stage).toMatch(/position:\s*relative/);
    expect(stage).toMatch(/flex:\s*1/);
    expect(stage).toMatch(/min-height:\s*0/);
    expect(block('.master-flows > summary')).toMatch(/margin-right:\s*\d+px/);
  });
});
