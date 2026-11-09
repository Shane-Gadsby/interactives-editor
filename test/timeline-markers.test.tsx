import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { TimelinePanel } from '../src/panels/Timeline';
import { addMarkerInteraction, markerEvents, nextMarkerName, nudgeMarker, renameMarker } from '../src/lib/marker-actions';
import { TOPICS, topicBody } from '../src/help/topics';
import { CATALOG_BY_KIND } from 'interactives-player';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;
let s: EditorStore;

beforeEach(() => {
  document.body.innerHTML = '';
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = host = undefined;
  vi.unstubAllGlobals();
});

function project(withVariable = true): Project {
  const p = createProject('Markers');
  p.artboards[0].timelines.push({
    id: 'tl',
    name: 'Intro',
    duration: 4000,
    loop: 'once',
    autoplay: false,
    speed: 1,
    tracks: [],
    markers: [
      { id: 'mk1', time: 1000, name: 'Intro' },
      { id: 'mk2', time: 2500, name: 'Middle' },
    ],
  });
  if (withVariable) p.variables.push({ id: 'v1', name: 'stage', type: 'number', initial: 0 });
  return p;
}
function mount(p: Project = project()): void {
  s = new EditorStore(p);
  s.set({ activeTimelineId: 'tl', bottomTab: 'timeline' });
  setCurrentStore(s);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<TimelinePanel />));
}
const ab = () => s.get().project.artboards[0];
const tl = () => ab().timelines[0];
const markers = () => Array.from(host!.querySelectorAll<HTMLElement>('.marker'));
const down = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })));
const key = (el: Element, k: string, init: KeyboardEventInit = {}) => act(() => void el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })));
const button = (text: string) => Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;

describe('marker names and events', () => {
  it('names a new marker with a free number', () => {
    expect(nextMarkerName(undefined)).toBe('Marker 1');
    expect(nextMarkerName([{ name: 'Marker 2' }, { name: 'a' }])).toBe('Marker 3');
    expect(nextMarkerName([{ name: 'Marker 2' }])).toBe('Marker 3');
  });

  it('"when the playhead reaches this" makes an On timeline marker event wired to a Set variable action', () => {
    const p = project();
    const made = addMarkerInteraction(p, p.artboards[0].id, 'tl', 'mk2')!;
    const [ev, act2] = p.artboards[0].logic.nodes;
    expect(ev).toMatchObject({ id: made.eventId, kind: 'event.timelineMarker', params: { timeline: 'tl', marker: 'Middle' } });
    expect(act2).toMatchObject({ id: made.actionId, kind: 'action.setVariable', params: { variable: 'v1', op: 'set' } });
    expect(p.artboards[0].logic.edges).toEqual([expect.objectContaining({ from: ev.id, to: act2.id, fromPort: 'out', toPort: 'in' })]);
    expect(CATALOG_BY_KIND['event.timelineMarker']).toBeTruthy();
  });

  it('leaves the variable empty when the project has none, and does nothing for a marker that is gone', () => {
    const p = project(false);
    addMarkerInteraction(p, p.artboards[0].id, 'tl', 'mk1');
    expect(p.artboards[0].logic.nodes[1].params.variable).toBeUndefined();
    expect(addMarkerInteraction(p, p.artboards[0].id, 'tl', 'nope')).toBeNull();
    expect(addMarkerInteraction(p, p.artboards[0].id, 'nope', 'mk1')).toBeNull();
  });

  it('renaming a marker moves its events with it, and leaves other markers\' events alone', () => {
    const p = project();
    const a = p.artboards[0];
    addMarkerInteraction(p, a.id, 'tl', 'mk1');
    addMarkerInteraction(p, a.id, 'tl', 'mk2');
    renameMarker(p, a.id, 'tl', 'mk1', 'Start');
    expect(a.timelines[0].markers![0].name).toBe('Start');
    expect(markerEvents(a, a.timelines[0], { name: 'Start' })).toHaveLength(1);
    expect(markerEvents(a, a.timelines[0], { name: 'Middle' })).toHaveLength(1);
    expect(markerEvents(a, a.timelines[0], { name: 'Intro' })).toHaveLength(0);
  });

  it('does not re-point events when two markers share the old name', () => {
    const p = project();
    const a = p.artboards[0];
    a.timelines[0].markers!.push({ id: 'mk3', time: 3000, name: 'Intro' });
    addMarkerInteraction(p, a.id, 'tl', 'mk1');
    renameMarker(p, a.id, 'tl', 'mk3', 'Other');
    expect(markerEvents(a, a.timelines[0], { name: 'Intro' })).toHaveLength(1);
  });

  it('nudging stays inside the timeline', () => {
    const t = project().artboards[0].timelines[0];
    nudgeMarker(t, 'mk1', -5000);
    expect(t.markers![0].time).toBe(0);
    nudgeMarker(t, 'mk2', 99999);
    expect(t.markers![1].time).toBe(4000);
  });
});

describe('the timeline panel', () => {
  it('a click selects a marker, shows its editor and a selected state', () => {
    mount();
    expect(host!.querySelector('.marker-editor')).toBeNull();
    down(markers()[1]);
    expect(markers()[1].classList.contains('selected')).toBe(true);
    expect(markers()[0].classList.contains('selected')).toBe(false);
    expect(host!.querySelector('.marker-editor')?.textContent).toContain('Marker');
    expect(host!.querySelector<HTMLInputElement>('.marker-editor input')!.value).toBe('Middle');
    expect(host!.querySelector('.marker-line')).not.toBeNull();
  });

  it('the editor shows the step title and caption fields when Steps use the timeline', () => {
    const p = project();
    p.artboards[0].steps = { timeline: 'tl' } as never;
    mount(p);
    down(markers()[0]);
    const text = host!.querySelector('.marker-editor')!.textContent!;
    expect(text).toContain('Title');
    expect(text).toContain('Caption');
  });

  it('"+ When the playhead reaches this…" adds the nodes and opens Interactions on them', () => {
    mount();
    down(markers()[1]);
    act(() => button('+ When the playhead reaches this…')!.click());
    expect(ab().logic.nodes.map((n) => n.kind)).toEqual(['event.timelineMarker', 'action.setVariable']);
    expect(ab().logic.nodes[0].params.marker).toBe('Middle');
    expect(s.get().bottomTab).toBe('logic');
    expect(s.get().logicSelection).toBe(ab().logic.nodes[0].id);
    expect(s.get().logicPicked).toEqual(ab().logic.nodes.map((n) => n.id));
  });

  it('Delete removes the focused marker, arrow keys nudge it, Shift is bigger', () => {
    mount();
    down(markers()[0]);
    key(markers()[0], 'ArrowRight');
    expect(tl().markers![0].time).toBe(1010);
    key(markers()[0], 'ArrowLeft', { shiftKey: true });
    expect(tl().markers![0].time).toBe(910);
    key(markers()[0], 'Delete');
    expect(tl().markers!.map((m) => m.id)).toEqual(['mk2']);
    expect(host!.querySelector('.marker-editor')).toBeNull();
  });

  it('editing the name in the editor renames the marker and its events', () => {
    mount();
    down(markers()[0]);
    act(() => void s.update((d) => void addMarkerInteraction(d as Project, ab().id, 'tl', 'mk1')));
    const input = host!.querySelector<HTMLInputElement>('.marker-editor input')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Start');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      input.blur();
    });
    expect(tl().markers![0].name).toBe('Start');
    expect(ab().logic.nodes[0].params.marker).toBe('Start');
  });

  it('right-click opens a menu with the same action, and a ruler right-click adds a marker', () => {
    mount();
    act(() => void markers()[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })));
    const items = Array.from(document.querySelectorAll('.ctx-menu *')).map((n) => n.textContent);
    expect(items.join('|')).toContain('When the playhead reaches this…');
    expect(items.join('|')).toContain('Delete marker');
    const item = Array.from(document.querySelectorAll<HTMLElement>('.ctx-menu button, .ctx-menu [role=menuitem], .ctx-menu div')).find((n) => n.textContent?.startsWith('When the playhead reaches this'));
    act(() => item!.click());
    expect(ab().logic.nodes).toHaveLength(2);
  });

  it('+ Marker names markers with a free number after one was deleted', () => {
    mount();
    act(() => void s.updateTimeline((d) => void (d.markers = [{ id: 'm9', time: 10, name: 'Marker 2' }])));
    act(() => button('+ Marker')!.click());
    expect(tl().markers!.map((m) => m.name).sort()).toEqual(['Marker 2', 'Marker 3']);
  });
});

describe('help', () => {
  it('the timelines topic explains selecting a marker and the When the playhead reaches this action', () => {
    const body = topicBody(TOPICS.find((t) => t.id === 'timelines')!);
    expect(body).toContain('When the playhead reaches this');
    expect(body).toMatch(/arrow keys/i);
  });
});
