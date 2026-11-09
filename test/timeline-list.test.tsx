import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject, uid, type Project, type SceneNode } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { TimelinePanel } from '../src/panels/Timeline';
import { analyzeUsage } from '../src/lib/dependencies';
import { lengthLabel, missingStates, timelineRows } from '../src/lib/timeline-list';
import { groupOpen, hasMedia, laneShow, mediaBrief, mediaMarks, mediaSummary } from '../src/lib/timeline-view';
import { prefs, setPrefs } from '../src/lib/prefs';
import { TOPICS, topicBody } from '../src/help/topics';
import { slug } from '../src/help/markdown';

const confirm = { answer: true, asked: [] as string[] };
vi.mock('../src/components/dialogs', () => ({
  DialogHost: () => null,
  confirmDialog: async (o: { message: string }) => {
    confirm.asked.push(o.message);
    return confirm.answer;
  },
  promptDialog: async () => null,
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;
let s: EditorStore;

beforeEach(() => {
  document.body.innerHTML = '';
  confirm.answer = true;
  confirm.asked = [];
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
  setPrefs({ timelineList: true, timelineFoldEmpty: true, timelineHideSound: false, timelineHideCaptions: false, timelineHideDescriptions: false });
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = host = undefined;
  vi.unstubAllGlobals();
});

const rect = (id: string, name: string): SceneNode => ({ id, name, type: 'rect', x: 0, y: 0, width: 10, height: 10 }) as unknown as SceneNode;
const tl = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, duration: 1000, loop: 'once' as const, autoplay: false, speed: 1, tracks: [], ...extra });
const track = (nodeId: string) => ({ id: uid('tr'), nodeId, prop: 'x', keys: [{ id: uid('k'), t: 0, value: 0, ease: 'linear' }, { id: uid('k'), t: 500, value: 10, ease: 'linear' }] });

function project(): Project {
  const p = createProject('Timelines');
  const a = p.artboards[0];
  a.children.push(rect('r1', 'Title'), rect('r2', 'Button'));
  a.timelines.push(tl('t1', 'Intro', { duration: 1200, loop: 'loop', autoplay: true, tracks: [track('r1'), track('r1'), track('r2')] }), tl('t2', 'Hover', { duration: 400 }), tl('t3', 'Spare'));
  return p;
}
function mount(p: Project = project(), active: string | null = 't1'): void {
  s = new EditorStore(p);
  s.set({ activeTimelineId: active, bottomTab: 'timeline' });
  setCurrentStore(s);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<TimelinePanel />));
}
const ab = () => s.get().project.artboards[0];
const names = () => ab().timelines.map((t) => t.name);
const rows = () => Array.from(host!.querySelectorAll<HTMLElement>('.tl-row:not(.design)'));
const click = (el: Element | null | undefined) => act(() => void el!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
const byTitle = (root: ParentNode, t: string) => root.querySelector<HTMLElement>(`[title="${t}"]`);

describe('what the list knows about a timeline', () => {
  it('reads length, loop, the layers it animates and what plays it', () => {
    const p = project();
    const r = timelineRows(p.artboards[0], analyzeUsage(p));
    expect(r.map((x) => x.name)).toEqual(['Intro', 'Hover', 'Spare']);
    expect(r[0]).toMatchObject({ duration: 1200, loop: 'loop', keyCount: 6, idle: false });
    expect(r[0].layers.map((l) => l.name)).toEqual(['Title', 'Button']);
    expect(r[0].playedBy).toEqual(['itself (autoplay)']);
    // nothing starts these two
    expect(r[1].idle).toBe(true);
    expect(r[2].idle).toBe(true);
  });

  it('says a length the way a person would', () => {
    expect(lengthLabel(800)).toBe('800 ms');
    expect(lengthLabel(1200)).toBe('1.2 s');
    expect(lengthLabel(2000)).toBe('2 s');
  });

  it('only calls an artboard a component when another one places it', () => {
    const p = project();
    const other = createProject('x').artboards[0];
    other.id = 'ab-other';
    other.timelines = [];
    p.artboards.push(other);
    expect(missingStates(p, p.artboards[0])).toBeNull();
    other.children.push({ id: 'i1', name: 'Card', type: 'instance', artboardId: p.artboards[0].id, fit: 'fill', x: 0, y: 0, width: 10, height: 10 } as unknown as SceneNode);
    // there is a Hover timeline, so Idle and Pressed are what is left
    expect(missingStates(p, p.artboards[0])).toEqual(['Idle', 'Pressed']);
    p.artboards[0].timelines.push(tl('t4', 'Resting'), tl('t5', 'On click'));
    expect(missingStates(p, p.artboards[0])).toEqual([]);
  });
});

describe('timeline store commands', () => {
  it('renames, refusing empty names and ones another timeline has', () => {
    mount();
    expect(s.renameTimeline('t2', 'Over')).toBe(true);
    expect(s.renameTimeline('t2', '  ')).toBe(false);
    expect(s.renameTimeline('t2', 'Intro')).toBe(false);
    expect(names()).toEqual(['Intro', 'Over', 'Spare']);
    expect(s.renameTimeline('t2', 'Over')).toBe(true);
  });

  it('moves a timeline, clamping to the ends, as one undo step', () => {
    mount();
    s.moveTimeline('t3', 0);
    expect(names()).toEqual(['Spare', 'Intro', 'Hover']);
    s.moveTimeline('t3', -5);
    expect(names()).toEqual(['Spare', 'Intro', 'Hover']);
    s.undo();
    expect(names()).toEqual(['Intro', 'Hover', 'Spare']);
  });

  it('duplicates with new ids, no autoplay, right after the original, and opens the copy', () => {
    mount();
    const id = s.duplicateTimeline('t1');
    expect(names()).toEqual(['Intro', 'Intro copy', 'Hover', 'Spare']);
    const copy = ab().timelines[1];
    expect(copy.id).toBe(id);
    expect(copy.autoplay).toBe(false);
    expect(copy.tracks).toHaveLength(3);
    const src = ab().timelines[0];
    expect(new Set([...src.tracks, ...copy.tracks].map((t) => t.id)).size).toBe(6);
    expect(copy.tracks[0].keys.map((k) => k.t)).toEqual(src.tracks[0].keys.map((k) => k.t));
    expect(s.get().activeTimelineId).toBe(id);
    expect(s.duplicateTimeline('nope')).toBe('');
  });

  it('adds a named timeline, and deleting the open one goes back to the design view', () => {
    mount();
    s.addTimeline('Pressed');
    expect(names().at(-1)).toBe('Pressed');
    const id = s.get().activeTimelineId!;
    s.deleteTimeline(id);
    expect(names()).toEqual(['Intro', 'Hover', 'Spare']);
    expect(s.get().activeTimelineId).toBeNull();
  });
});

describe('the list beside the Timeline', () => {
  it('lists every timeline with its facts and marks the open one', () => {
    mount();
    expect(host!.querySelector('.tl-list')).toBeTruthy();
    expect(rows().map((r) => r.querySelector('.tl-row-name')!.textContent)).toEqual(['Intro', 'Hover', 'Spare']);
    expect(rows()[0].querySelector('.tl-row-meta')!.textContent).toContain('1.2 s');
    expect(rows()[0].querySelector('.tl-row-meta')!.textContent).toContain('Loop');
    expect(rows()[0].querySelector('.tl-row-meta')!.textContent).toContain('2 layers');
    expect(rows()[0].querySelector('.tl-row-use')!.textContent).toContain('autoplay');
    expect(rows()[1].querySelector('.tl-row-use')!.textContent).toBe('Nothing plays it');
    expect(rows()[0].classList.contains('active')).toBe(true);
    expect(rows()[0].querySelector('[aria-current="true"]')).toBeTruthy();
    expect(rows()[1].querySelector('[aria-current]')).toBeNull();
  });

  it('opens a timeline on click and the design view from its own row', () => {
    mount();
    click(rows()[1].querySelector('.tl-row-pick'));
    expect(s.get().activeTimelineId).toBe('t2');
    click(host!.querySelector('.tl-row.design .tl-row-pick'));
    expect(s.get().activeTimelineId).toBeNull();
    // and the list is still there in the design view
    expect(host!.querySelector('.tl-list')).toBeTruthy();
    click(rows()[2].querySelector('.tl-row-pick'));
    expect(s.get().activeTimelineId).toBe('t3');
  });

  it('marks the timelines that animate the selected layer', () => {
    mount();
    expect(host!.querySelector('.tl-row-hit')).toBeNull();
    act(() => s.select(['r2']));
    const hit = rows().filter((r) => r.classList.contains('animates'));
    expect(hit).toHaveLength(1);
    expect(hit[0].querySelector('.tl-row-hit')!.textContent).toBe('Animates Button');
  });

  it('renames in the row, and refuses a name that is taken', () => {
    mount();
    click(byTitle(rows()[1], 'Rename Hover'));
    const input = host!.querySelector<HTMLInputElement>('.tl-row-edit')!;
    expect(input.value).toBe('Hover');
    const type = (v: string, key: string) =>
      act(() => {
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        set.call(input, v);
        input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      });
    type('Intro', 'Enter');
    expect(host!.querySelector('[role="alert"]')!.textContent).toContain('has that name');
    expect(names()).toEqual(['Intro', 'Hover', 'Spare']);
    type('Over', 'Enter');
    expect(names()).toEqual(['Intro', 'Over', 'Spare']);
    expect(host!.querySelector('.tl-row-edit')).toBeNull();
  });

  it('Escape leaves the old name', () => {
    mount();
    click(byTitle(rows()[2], 'Rename Spare'));
    const input = host!.querySelector<HTMLInputElement>('.tl-row-edit')!;
    input.value = 'Nope';
    act(() => void input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(names()).toEqual(['Intro', 'Hover', 'Spare']);
  });

  it('reorders with the arrows (disabled at the ends) and by dragging', () => {
    mount();
    expect((byTitle(rows()[0], 'Move Intro up the list') as HTMLButtonElement).disabled).toBe(true);
    expect((byTitle(rows()[2], 'Move Spare down the list') as HTMLButtonElement).disabled).toBe(true);
    click(byTitle(rows()[0], 'Move Intro down the list'));
    expect(names()).toEqual(['Hover', 'Intro', 'Spare']);
    // drag Spare onto the first row
    act(() => void rows()[2].dispatchEvent(new Event('dragstart', { bubbles: true })));
    act(() => void rows()[0].dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true })));
    act(() => void rows()[0].dispatchEvent(new Event('drop', { bubbles: true, cancelable: true })));
    expect(names()).toEqual(['Spare', 'Hover', 'Intro']);
  });

  it('has the same actions on a right-click', () => {
    mount();
    act(() => void rows()[1].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })));
    const items = Array.from(document.querySelectorAll('.ctx-menu button')).map((b) => b.textContent);
    expect(items).toEqual(expect.arrayContaining(['Open', 'Rename', 'Duplicate', 'Move up', 'Move down', 'Delete…']));
    click(Array.from(document.querySelectorAll('.ctx-menu button')).find((b) => b.textContent === 'Move up'));
    expect(names()).toEqual(['Hover', 'Intro', 'Spare']);
  });

  it('duplicates from the row', () => {
    mount();
    click(byTitle(rows()[1], 'Duplicate Hover'));
    expect(names()).toEqual(['Intro', 'Hover', 'Hover copy', 'Spare']);
  });

  it('deleting warns about what plays the timeline, and does nothing when declined', async () => {
    mount();
    confirm.answer = false;
    click(byTitle(rows()[0], 'Delete Intro'));
    await act(async () => {});
    expect(confirm.asked[0]).toContain('autoplay');
    expect(confirm.asked[0]).toContain('6 keys');
    expect(names()).toContain('Intro');
    confirm.answer = true;
    click(byTitle(rows()[0], 'Delete Intro'));
    await act(async () => {});
    expect(names()).toEqual(['Hover', 'Spare']);
    // the open timeline went with it
    expect(s.get().activeTimelineId).toBeNull();
  });

  it('can be hidden from its own button and the Timeline bar, and the choice is kept', () => {
    mount();
    click(byTitle(host!, 'Hide the list of timelines (the View button on the Timeline bar brings it back)'));
    expect(host!.querySelector('.tl-list')).toBeNull();
    expect(prefs().timelineList).toBe(false);
    const toggle = Array.from(host!.querySelectorAll('button')).find((b) => b.textContent?.startsWith('List ('))!;
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    click(toggle);
    expect(host!.querySelector('.tl-list')).toBeTruthy();
  });

  it('offers the missing states on a component and adds one on a click', () => {
    const p = project();
    const other = createProject('x').artboards[0];
    other.id = 'ab-other';
    other.children.push({ id: 'i1', name: 'Card', type: 'instance', artboardId: p.artboards[0].id, fit: 'fill', x: 0, y: 0, width: 10, height: 10 } as unknown as SceneNode);
    p.artboards.push(other);
    mount(p);
    const hint = host!.querySelector('.tl-states')!;
    expect(Array.from(hint.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['+ Idle', '+ Pressed']);
    click(Array.from(hint.querySelectorAll('button')).find((b) => b.textContent === '+ Pressed'));
    expect(names().at(-1)).toBe('Pressed');
    expect(Array.from(host!.querySelectorAll('.tl-states button')).map((b) => b.textContent)).toEqual(['+ Idle']);
  });

  it('shows no state hint on an ordinary artboard', () => {
    mount();
    expect(host!.querySelector('.tl-states')).toBeNull();
  });
});

describe('the Sound and captions group', () => {
  const clip = { id: 'a1', name: 'Narration', assetId: 'as1', offset: 200, volume: 1, duration: 600 };
  const caps = { id: 'c1', name: 'English', lang: 'en', cues: [{ id: 'q1', start: 0, end: 300, text: 'Hi' }, { id: 'q2', start: 400, end: 700, text: 'There' }] };
  const show = laneShow({});

  it('decides open or folded from what is in it, unless the person chose', () => {
    const empty = tl('e', 'E');
    const full = tl('f', 'F', { audio: [clip] });
    expect(hasMedia(empty, show)).toBe(false);
    expect(groupOpen(empty, show, true, undefined)).toBe(false);
    expect(groupOpen(full, show, true, undefined)).toBe(true);
    expect(groupOpen(empty, show, false, undefined)).toBe(true);
    expect(groupOpen(full, show, true, false)).toBe(false);
    expect(groupOpen(empty, show, true, true)).toBe(true);
    // a hidden lane's contents do not count
    expect(groupOpen(full, { ...show, audio: false }, true, undefined)).toBe(false);
  });

  it('summarises and draws marks for what is there', () => {
    const t = tl('f', 'F', { audio: [clip], captions: [caps], descriptions: [{ id: 'd1', name: 'English', cues: [{ id: 'z', start: 100, end: 200, text: 'A door' }] }] });
    expect(mediaSummary(t, show)).toBe('1 sound, 2 captions, 1 description');
    expect(mediaSummary(t, { ...show, captions: false })).toBe('1 sound, 1 description');
    expect(mediaSummary(tl('e', 'E'), show)).toBe('nothing yet');
    expect(mediaBrief(t, show)).toBe('4 items');
    expect(mediaBrief(tl('e', 'E'), show)).toBe('empty');
    // a caption track with no cues yet is a row, so the group is not empty, but it has nothing to count
    const bare = tl('b', 'B', { captions: [{ id: 'c', name: 'English', cues: [] }] });
    expect(hasMedia(bare, show)).toBe(true);
    expect(groupOpen(bare, show, true, undefined)).toBe(true);
    expect(mediaSummary(bare, show)).toBe('no captions yet');
    expect(mediaBrief(bare, show)).toBe('empty');
    const m = mediaMarks(t, show);
    expect(m.map((x) => x.kind)).toEqual(['audio', 'captions', 'captions', 'descriptions']);
    expect(m[0]).toMatchObject({ from: 200, to: 800 });
    expect(mediaMarks(t, { audio: false, captions: false, descriptions: false })).toEqual([]);
  });

  const toggle = () => host!.querySelector<HTMLButtonElement>('.media-fold');

  it('starts folded to one row on a timeline with none, and unfolds from its arrow', () => {
    mount();
    expect(toggle()!.getAttribute('aria-expanded')).toBe('false');
    expect(host!.querySelector('.media-labels .media-add')).toBeNull();
    expect(host!.querySelector('.media-summary')!.textContent).toBe('empty');
    click(toggle());
    expect(toggle()!.getAttribute('aria-expanded')).toBe('true');
    expect(host!.querySelectorAll('.media-labels .media-add')).toHaveLength(3);
    // it stays open on this timeline (the choice is the person's), and folds again by hand
    click(toggle());
    expect(host!.querySelector('.media-labels .media-add')).toBeNull();
  });

  it('starts open when the timeline has a sound or captions, and draws marks when folded', () => {
    const p = project();
    p.artboards[0].timelines[0].audio = [clip];
    p.artboards[0].timelines[0].captions = [caps];
    mount(p);
    expect(toggle()!.getAttribute('aria-expanded')).toBe('true');
    expect(host!.querySelectorAll('.media-labels .media-add')).toHaveLength(3);
    expect(host!.querySelectorAll('.media-mark')).toHaveLength(0);
    click(toggle());
    expect(host!.querySelectorAll('.media-mark')).toHaveLength(3);
    expect(host!.querySelector('.media-summary')!.textContent).toBe('3 items');
    expect(toggle()!.title).toContain('1 sound, 2 captions');
  });

  it('hides a lane from the View menu, and brings the whole group back with the pref', () => {
    mount();
    click(toggle());
    expect(host!.querySelectorAll('.media-labels .media-add')).toHaveLength(3);
    act(() => setPrefs({ timelineHideCaptions: true }));
    expect(host!.querySelectorAll('.media-labels .media-add')).toHaveLength(2);
    act(() => setPrefs({ timelineHideSound: true, timelineHideDescriptions: true }));
    expect(host!.querySelector('.media-labels')).toBeNull();
    expect(host!.querySelector('.media-lanes')).toBeNull();
    act(() => setPrefs({ timelineHideSound: false, timelineHideCaptions: false, timelineHideDescriptions: false }));
    expect(host!.querySelector('.media-labels')).toBeTruthy();
  });

  it('keeps every lane open when "fold when empty" is off', () => {
    act(() => setPrefs({ timelineFoldEmpty: false }));
    mount();
    expect(toggle()!.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('help', () => {
  it('the Timelines topic explains the list and the view menu', () => {
    const body = topicBody(TOPICS.find((t) => t.id === 'timelines')!);
    const anchors = new Set([...body.matchAll(/^#{1,6} (.+)$/gm)].map((m) => slug(m[1])));
    expect(anchors.has('the-list-of-timelines')).toBe(true);
    expect(anchors.has('sound-and-captions-rows')).toBe(true);
  });
});
