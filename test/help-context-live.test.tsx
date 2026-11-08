import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nodeHeading, nodeLabel } from '../src/lib/plain-words';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CATALOG, createNode, createProject, type SceneNode } from 'interactives-player';
import { slug } from '../src/help/markdown';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { DockZone, currentHelpTarget, openHeaderHelp, trackPanelFocus, useDockSync, useHeaderHelpTitle } from '../src/components/Dock';
import { closeHelp, helpHistory, HelpHost } from '../src/help/Help';
import { DialogHost } from '../src/components/dialogs';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  disconnect() {}
  unobserve() {}
};
(globalThis as unknown as { CSS: { escape: (s: string) => string } }).CSS ??= { escape: (s: string) => s };
Element.prototype.scrollIntoView ??= () => undefined;

function Shell() {
  useDockSync();
  const tip = useHeaderHelpTitle();
  return (
    <>
      <header className="topbar">
        <button id="top-help" title={tip} onClick={openHeaderHelp}>
          Help
        </button>
      </header>
      <DockZone zone="left" />
      <DockZone zone="right" />
      <DockZone zone="bottom" />
      <main className="canvas" id="canvas" tabIndex={0} />
      <HelpHost />
      <DialogHost />
    </>
  );
}

const ACTION = CATALOG.find((d) => d.category === 'action')!;
let root: Root;
let host: HTMLElement;
let s: EditorStore;
let chart: string;
let rect: string;
beforeEach(() => {
  const p = createProject('T');
  const c = createNode('chart', { name: 'c' }) as SceneNode;
  const r = createNode('rect', { name: 'r' }) as SceneNode;
  p.artboards[0].children.push(c, r);
  p.artboards[0].logic.nodes.push({ id: 'n1', kind: ACTION.kind, x: 0, y: 0, params: {} });
  chart = c.id;
  rect = r.id;
  s = new EditorStore(p);
  setCurrentStore(s);
  helpHistory.clear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<Shell />));
  //start from "the canvas was clicked": no panel
  act(() => void document.getElementById('canvas')!.dispatchEvent(new Event('pointerdown', { bubbles: true })));
});
afterEach(() => {
  act(() => closeHelp());
  act(() => root.unmount());
  host.remove();
});

const tip = () => document.getElementById('top-help')!.title;
const drawerTitle = () => document.querySelector('.help-drawer h1')?.textContent ?? '';
const press = (el: Element) => act(() => void el.dispatchEvent(new Event('pointerdown', { bubbles: true })));

describe('the Help button follows what is highlighted', () => {
  it('opens the selected layer type, says so in its tooltip, and shows a way back to general help', () => {
    act(() => s.select([chart]));
    expect(tip()).toContain('Help: Chart layer');
    act(() => document.getElementById('top-help')!.click());
    expect(drawerTitle()).toContain('Charts');
    expect(document.querySelector('.help-context')?.textContent).toContain('Chart layer');
    act(() => document.querySelector<HTMLElement>('.help-context button')!.click());
    expect(drawerTitle()).toContain('Welcome');
  });

  it('changes with the selection', () => {
    act(() => s.select([chart]));
    expect(tip()).toContain('Chart layer');
    act(() => s.select([rect]));
    expect(tip()).toContain('Rectangle layer');
    act(() => s.select([chart, rect]));
    expect(tip()).toContain('Selected layers');
    act(() => s.select([]));
    expect(tip()).toMatch(/^Help \(/);
  });

  it('uses the active tool when nothing is selected', () => {
    act(() => s.set({ tool: 'progress' }));
    expect(tip()).toContain('Progress bar tool');
    act(() => s.set({ tool: 'select' }));
    expect(currentHelpTarget().label).toBe('Help');
  });

  it('uses the Properties section of the field that has the focus, and forgets it on a click that is not a field', () => {
    act(() => s.select([rect]));
    const panel = document.querySelector<HTMLElement>('[data-panel="inspector"]')!;
    expect(panel).toBeTruthy();
    const sec = document.createElement('section');
    sec.className = 'section';
    sec.setAttribute('data-help', 'auto-layout');
    sec.setAttribute('data-section-title', 'Auto layout');
    sec.innerHTML = '<div data-prop="gap"><input /></div><button class="plain">x</button>';
    panel.appendChild(sec);
    act(() => void sec.querySelector('input')!.dispatchEvent(new Event('focusin', { bubbles: true })));
    expect(currentHelpTarget()).toEqual({ to: 'auto-layout', label: 'Auto layout' });
    act(() => document.getElementById('top-help')!.click());
    expect(drawerTitle()).toContain('Auto layout');
    //a click inside the panel that isn't on a field, then the layer type wins again
    act(() => closeHelp());
    press(sec.querySelector('.plain')!);
    expect(currentHelpTarget().label).toBe('Rectangle layer');
    sec.remove();
  });

  it('prefers a selected graph node while working in Interactions, and a keyframe in the Timeline', () => {
    const ab = s.get().project.artboards[0];
    const kind = ACTION;
    act(() => s.set({ activeArtboardId: ab.id, logicSelection: 'n1', logicPicked: ['n1'], selectedKeys: ['t:k'] }));
    act(() => s.select([rect]));
    //selected in the graph, but the canvas was the last click: the layer
    expect(currentHelpTarget().label).toBe('Rectangle layer');
    press(document.querySelector('[data-dock-tab="logic"]')!);
    expect(currentHelpTarget().label).toBe(`${nodeLabel(kind)} node`);
    act(() => document.getElementById('top-help')!.click());
    expect(drawerTitle()).toContain('Interaction node reference');
    expect(helpHistory.current?.anchor).toBe(slug(nodeHeading(kind)));
    act(() => closeHelp());
    press(document.querySelector('[data-dock-tab="timeline"]')!);
    expect(currentHelpTarget().label).toBe('Keyframes');
  });
});

describe('the keyboard way', () => {
  it('trackPanelFocus ignores the header and help itself', () => {
    act(() => s.select([chart]));
    press(document.getElementById('top-help')!);
    expect(currentHelpTarget().label).toBe('Chart layer');
    trackPanelFocus(new Event('pointerdown'));
  });
});
