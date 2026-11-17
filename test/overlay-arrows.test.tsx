//The lines from an overlay to the layers it belongs to and the layers that show it
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type Project } from 'interactives-player';
import { PageLinkLayer } from '../src/canvas/PageLinkLayer';
import { addDialog } from '../src/lib/dialog-kit';
import { overlayArrows } from '../src/lib/overlay-arrows';
import { EditorStore, setCurrentStore } from '../src/store/store';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setUp(kind: 'tooltip' | 'modal' | 'confirm' | 'input') {
  const p = createProject() as Project;
  const ab = p.artboards[0];
  ab.children.push(createNode('button', { id: 'icon', name: 'Icon', x: 10, y: 10 }), createNode('rect', { id: 'area', name: 'Area', x: 0, y: 0 }), createNode('rect', { id: 'other', name: 'Other' }));
  const { overlayId } = addDialog(p, kind, { targetId: 'icon', artboardId: ab.id });
  const page = p.artboards.find((a) => a.id === overlayId)!;
  const icon = ab.children.find((c) => c.id === 'icon')!;
  return { p, ab, page, icon };
}
const brief = (list: ReturnType<typeof overlayArrows>) => list.map((a) => `${a.role}:${a.name}`);

describe('overlay arrows', () => {
  it('an open tooltip page points at its layer, which is target and trigger in one', () => {
    const { p, page } = setUp('tooltip');
    expect(brief(overlayArrows(p, page, []))).toEqual(['both:Icon']);
  });

  it('with another trigger picked there are two lines, one to each', () => {
    const { p, page, icon } = setUp('tooltip');
    icon.overlay!.trigger = 'area';
    expect(brief(overlayArrows(p, page, []))).toEqual(['target:Icon', 'trigger:Area']);
  });

  it('a trigger that has since been deleted falls back to the layer itself', () => {
    const { p, page, icon } = setUp('tooltip');
    icon.overlay!.trigger = 'gone';
    expect(brief(overlayArrows(p, page, []))).toEqual(['both:Icon']);
  });

  it('a modal, a confirmation and a prompt only show what opens them', () => {
    for (const kind of ['modal', 'confirm', 'input'] as const) {
      const { p, page, icon } = setUp(kind);
      expect(brief(overlayArrows(p, page, [])), kind).toEqual(['trigger:Icon']);
      icon.overlay!.trigger = 'area';
      expect(brief(overlayArrows(p, page, [])), kind).toEqual(['trigger:Area']);
    }
  });

  it('every layer sharing an overlay gets its line', () => {
    const { p, ab, page } = setUp('modal');
    ab.children.find((c) => c.id === 'other')!.overlay = { overlayId: page.id };
    expect(brief(overlayArrows(p, page, []))).toEqual(['trigger:Icon', 'trigger:Other']);
  });

  it('selecting the layer, or its trigger, shows the same lines from the page it is on', () => {
    const { p, ab, page, icon } = setUp('tooltip');
    icon.overlay!.trigger = 'area';
    const fromTarget = overlayArrows(p, ab, ['icon']);
    expect(brief(fromTarget)).toEqual(['target:Icon', 'trigger:Area']);
    expect(fromTarget.every((a) => a.overlay === page.id && a.page === ab.id)).toBe(true);
    expect(brief(overlayArrows(p, ab, ['area']))).toEqual(['target:Icon', 'trigger:Area']);
  });

  it('nothing is drawn for a layer with no overlay, for several layers at once, or with nothing open', () => {
    const { p, ab } = setUp('tooltip');
    expect(overlayArrows(p, ab, ['other'])).toEqual([]);
    expect(overlayArrows(p, ab, ['icon', 'other'])).toEqual([]);
    expect(overlayArrows(p, ab, [])).toEqual([]);
    expect(overlayArrows(p, undefined, ['icon'])).toEqual([]);
  });
});

describe('overlay arrows on the canvas', () => {
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
  const show = (p: Project, activeId: string, selection: string[] = [], hidden = false) => {
    setCurrentStore(new EditorStore(p));
    act(() => root.render(<PageLinkLayer project={p} zoom={1} panX={0} panY={0} active={p.artboards.find((a) => a.id === activeId)} selection={selection} tool="select" hidden={hidden} />));
  };
  const lines = () => [...host.querySelectorAll<SVGGElement>('g.overlay-link')].map((g) => `${g.dataset.role}:${g.dataset.layer}`);

  it('draws a line and a word for each, and says them for a screen reader', () => {
    const { p, page, icon } = setUp('tooltip');
    icon.overlay!.trigger = 'area';
    show(p, page.id);
    expect(lines()).toEqual(['target:icon', 'trigger:area']);
    expect([...host.querySelectorAll('.overlay-link-chip')].map((c) => c.textContent)).toEqual(['Target', 'Trigger']);
    expect([...host.querySelectorAll('ul[aria-label="Overlay links"] li')].map((l) => l.textContent)).toEqual(['Tooltip: target is Icon', 'Tooltip: trigger is Area']);
    //the two lines swing opposite ways, so they and their words do not sit on each other
    const [a, b] = [...host.querySelectorAll<HTMLElement>('.overlay-link-chip')].map((c) => `${c.style.left} ${c.style.top}`);
    expect(a).not.toBe(b);
  });

  it('each line ends in a head of its own kind', () => {
    const { p, page, icon } = setUp('tooltip');
    icon.overlay!.trigger = 'area';
    show(p, page.id);
    const ends = [...host.querySelectorAll('.overlay-link-line')].map((l) => l.getAttribute('marker-end'));
    expect(ends).toEqual(['url(#overlay-link-head-target)', 'url(#overlay-link-head-trigger)']);
    for (const role of ['target', 'trigger', 'both']) expect(host.querySelector(`#overlay-link-head-${role}`)).not.toBeNull();
  });

  it('draws nothing while previewing, or for a page that has no overlay to do with what is picked', () => {
    const { p, ab, page } = setUp('modal');
    show(p, page.id, [], true);
    expect(lines()).toEqual([]);
    show(p, ab.id, ['other']);
    expect(lines()).toEqual([]);
    expect(host.querySelector('.overlay-links')).toBeNull();
  });
});

