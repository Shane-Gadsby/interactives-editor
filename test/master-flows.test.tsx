import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createArtboard, createNode, createProject, type Artboard, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { MasterFlows } from '../src/panels/MasterFlows';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function deck(): Project {
  const p = createProject('Deck');
  p.artboards = [createArtboard({ id: 'page', name: 'Page', master: 'm' }), createArtboard({ id: 'm', name: 'Chrome', isMaster: true })];
  const m = p.artboards[1];
  m.children.push(createNode('button', { id: 'nb', name: 'Next', label: 'Next' }));
  m.logic.nodes.push(
    { id: 'ev', kind: 'event.pointer', x: 0, y: 0, params: { type: 'click', target: 'nb' } },
    { id: 'go', kind: 'action.artboard', x: 100, y: 0, params: { to: 'next', transition: 'none', duration: 0 } },
    { id: 'dr', kind: 'event.dragStart', x: 0, y: 100, params: {} },
  );
  m.logic.edges.push({ id: 'e1', from: 'ev', fromPort: 'out', to: 'go', toPort: 'in' });
  return p;
}

let root: Root | null = null;
const host = document.createElement('div');
document.body.appendChild(host);
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});
function draw(ab: Artboard, p: Project) {
  setCurrentStore(new EditorStore(p));
  root = createRoot(host);
  act(() => root!.render(<MasterFlows ab={ab} project={p} />));
}

describe('the master\'s flows on the Interactions tab', () => {
  it('a page lists the master\'s flows that run on it, read only, with a way to edit the master', () => {
    const p = deck();
    draw(p.artboards[0], p);
    expect(host.textContent).toContain('From the page master “Chrome”: 1 flow run on this page');
    expect(host.textContent).toContain('Next');
    expect(host.textContent).not.toContain('drag');
    expect(host.textContent).toContain('Edit the master');
  });

  it('the master says where its flows run and which events do nothing from a master', () => {
    const p = deck();
    draw(p.artboards[1], p);
    expect(host.textContent).toContain('These flows run on 1 page');
    expect(host.textContent).toContain('1 event here');
  });

  it('a page without a master, or a master with no flows, shows nothing', () => {
    const p = deck();
    p.artboards[0].master = undefined;
    draw(p.artboards[0], p);
    expect(host.textContent).toBe('');
  });
});
