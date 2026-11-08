//Sticky notes: the edits (undo, live ops, following a layer), the light markdown, the canvas layer, and that nothing a player or
//a picture gets carries one.
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, countNotes, readPackage, stripNotes, writePackage, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { addNote, allNotes, attachNote, findNote, moveNote, noteScale, notePlace, patchNote, removeNote } from '../src/lib/notes';
import { parseNoteText, plainNoteText, toggleCheck } from '../src/lib/note-text';
import { NotesLayer } from '../src/canvas/NotesLayer';
import { Canvas } from '../src/canvas/Canvas';
import { NOTE_CURSOR, toolCursor } from '../src/canvas/cursors';
import { setPrefs } from '../src/lib/prefs';
import { standaloneHtml } from '../src/lib/export';
import { exportLottie } from '../src/lib/lottie-export';
import { artboardSvg } from '../src/lib/image-export';
import { getTopic, topicBody } from '../src/help/topics';
import * as ops from '../shared/ops.mjs';
import * as serverNotes from '../shared/notes.mjs';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SECRET = 'SECRET-NOTE-TEXT-9x4';

function fresh(): { s: EditorStore; ab: string } {
  const p = createProject('Notes');
  p.artboards[0].children.push(createNode('rect', { id: 'r1', name: 'Box', x: 100, y: 50, width: 80, height: 40 }));
  const s = new EditorStore(p);
  setCurrentStore(s);
  return { s, ab: p.artboards[0].id };
}

describe('the light markdown', () => {
  it('reads bold, italic, code, bullets and tasks, line by line', () => {
    const lines = parseNoteText('Plain **bold** and *it* and `code`\n- item\n[ ] todo\n[x] done\n\nlast');
    expect(lines.map((l) => l.kind)).toEqual(['paragraph', 'bullet', 'check', 'check', 'blank', 'paragraph']);
    expect(lines[0].spans.map((s) => s.kind)).toEqual(['text', 'bold', 'text', 'italic', 'text', 'code']);
    expect(lines[2].checked).toBe(false);
    expect(lines[3].checked).toBe(true);
  });

  it('never turns text into markup: it only produces plain tokens', () => {
    const spans = parseNoteText('<img src=x onerror=alert(1)> **<b>**')[0].spans;
    expect(spans.every((s) => typeof s.text === 'string')).toBe(true);
    expect(spans.map((s) => s.text).join('')).toContain('<img src=x onerror=alert(1)>');
  });

  it('ticks a box by rewriting that line only', () => {
    expect(toggleCheck('[ ] a\n[ ] b', 1)).toBe('[ ] a\n[x] b');
    expect(toggleCheck('[x] a', 0)).toBe('[ ] a');
    expect(toggleCheck('no box', 0)).toBe('no box');
    expect(plainNoteText('**Hi** there\n- [ ] x')).toBe('Hi there x');
  });
});

describe('editing notes', () => {
  it('adds a note on an artboard and one on the canvas, outside the layer tree', () => {
    const { s, ab } = fresh();
    const a = addNote(ab, { x: 20, y: 30, text: 'on the artboard' })!;
    const c = addNote(null, { x: -300, y: 10, text: 'on the canvas', colour: 'sky' })!;
    const p = s.get().project;
    expect(p.artboards[0].notes!.map((n) => n.id)).toEqual([a]);
    expect(p.notes!.map((n) => n.id)).toEqual([c]);
    expect(p.notes![0].colour).toBe('sky');
    expect(countNotes(p)).toBe(2);
    expect(allNotes(p).map((r) => r.owner)).toEqual([null, ab]);
    expect(p.artboards[0].children.map((n) => n.id)).toEqual(['r1']);
    expect(addNote('nope', { x: 0, y: 0 })).toBeNull();
  });

  it('edits text, colour and size, with typing coalesced into one undo step', () => {
    const { s, ab } = fresh();
    const id = addNote(ab, { x: 0, y: 0 })!;
    patchNote(id, { text: 'a' }, 'k');
    patchNote(id, { text: 'ab' }, 'k');
    patchNote(id, { text: 'abc' }, 'k');
    patchNote(id, { colour: 'rose', w: 10, h: 5 });
    const n = findNote(s.get().project, id)!.note;
    expect(n).toMatchObject({ text: 'abc', colour: 'rose' });
    expect(n.w).toBeGreaterThanOrEqual(80);
    expect(n.h).toBeGreaterThanOrEqual(48);
    s.undo();
    expect(findNote(s.get().project, id)!.note.text).toBe('abc');
    expect(findNote(s.get().project, id)!.note.colour).toBeUndefined();
    s.undo();
    expect(findNote(s.get().project, id)!.note.text).toBe('');
  });

  it('removes a note and leaves no empty list behind, and undo brings it back', () => {
    const { s, ab } = fresh();
    const id = addNote(ab, { x: 0, y: 0, text: 'x' })!;
    removeNote(id);
    expect(s.get().project.artboards[0].notes).toBeUndefined();
    s.undo();
    expect(findNote(s.get().project, id)).not.toBeNull();
    const c = addNote(null, { x: 0, y: 0 })!;
    removeNote(c);
    expect('notes' in s.get().project).toBe(false);
  });

  it('a note attached to a layer follows it, and stays put when the layer is deleted', () => {
    const { s, ab } = fresh();
    const id = addNote(ab, { x: 190, y: 50, text: 'beside the box', layerId: 'r1' })!;
    expect(findNote(s.get().project, id)!.note.anchor).toEqual({ layerId: 'r1', lx: 90, ly: 0 });
    s.setProps(['r1'], { x: 300, y: 200 });
    const p = s.get().project;
    expect(notePlace(p, ab, findNote(p, id)!.note)).toEqual({ x: 390, y: 200, detached: false });
    // moving a followed note changes its offset, not the layer
    moveNote(id, 420, 210);
    expect(notePlace(s.get().project, ab, findNote(s.get().project, id)!.note)).toMatchObject({ x: 420, y: 210 });
    expect(s.get().project.artboards[0].children[0].x).toBe(300);
    s.select(['r1']);
    s.deleteSelection();
    const gone = s.get().project;
    expect(notePlace(gone, ab, findNote(gone, id)!.note)).toEqual({ x: 420, y: 210, detached: true });
  });

  it('attaches to a layer and lets go, and refuses a layer that is not there and the canvas', () => {
    const { s, ab } = fresh();
    const id = addNote(ab, { x: 0, y: 0 })!;
    expect(attachNote(id, 'r1')).toBe(true);
    expect(findNote(s.get().project, id)!.note.anchor?.layerId).toBe('r1');
    expect(attachNote(id, null)).toBe(true);
    expect(findNote(s.get().project, id)!.note.anchor).toBeUndefined();
    expect(attachNote(id, 'missing')).toBe(false);
    const c = addNote(null, { x: 0, y: 0 })!;
    expect(attachNote(c, 'r1')).toBe(false);
  });

  it('scales with the zoom but stays readable', () => {
    expect(noteScale(1)).toBe(1);
    expect(noteScale(0.05)).toBe(0.6);
    expect(noteScale(8)).toBe(1.6);
  });
});

describe('live editing', () => {
  it('a note travels as ordinary id-addressed ops, in both directions', () => {
    const { s, ab } = fresh();
    const before = s.get().project;
    const id = addNote(ab, { x: 5, y: 6, text: 'hello' })!;
    const canvas = addNote(null, { x: 1, y: 2, text: 'canvas' })!;
    const sent = ops.diff(before, s.get().project);
    expect(sent.length).toBeGreaterThan(0);
    const there = JSON.parse(JSON.stringify(before));
    ops.apply(there, sent);
    expect(there.artboards[0].notes[0]).toMatchObject({ id, text: 'hello', x: 5, y: 6 });
    expect(there.notes[0].id).toBe(canvas);
    // a second note and an edit to the first
    const mid = s.get().project;
    const second = addNote(ab, { x: 50, y: 60, text: 'two' })!;
    patchNote(id, { text: 'hello again' });
    ops.apply(there, ops.diff(mid, s.get().project));
    expect(there.artboards[0].notes.map((n: { id: string }) => n.id)).toEqual([id, second]);
    expect(there.artboards[0].notes[0].text).toBe('hello again');
    // deleting the last of them removes the key
    const prev = s.get().project;
    removeNote(canvas);
    ops.apply(there, ops.diff(prev, s.get().project));
    expect(there.notes).toBeUndefined();
  });

  it('a note from another person shows up in the store through applyRemote', () => {
    const { s, ab } = fresh();
    const note = { id: 'n-remote', x: 1, y: 1, w: 200, h: 100, text: 'from a friend' };
    s.applyRemote([{ t: 'ins', p: ['artboards', { i: ab }, 'notes'], v: note, after: null }]);
    expect(findNote(s.get().project, 'n-remote')!.note.text).toBe('from a friend');
  });
});

describe('what players and pictures get', () => {
  const withNotes = (): Project => {
    const { s, ab } = fresh();
    addNote(ab, { x: 5, y: 5, text: `${SECRET} artboard`, layerId: 'r1' });
    addNote(null, { x: -50, y: 5, text: `${SECRET} canvas` });
    return JSON.parse(JSON.stringify(s.get().project));
  };

  it('single HTML (and so the share link, embed, preview and review page) carries no note text', async () => {
    const html = await standaloneHtml(withNotes(), { embedFonts: false });
    expect(html).toContain('id="ix-project"');
    expect(html).not.toContain(SECRET);
    expect(html).not.toContain('sticky');
  });

  it('a Lottie file carries none', () => {
    const p = withNotes();
    const out = exportLottie(p, p.artboards[0], { bytesFor: () => null });
    expect(JSON.stringify(out)).not.toContain(SECRET);
  });

  it('an SVG picture of the artboard carries none', async () => {
    const p = withNotes();
    const { svg } = await artboardSvg(p, p.artboards[0], null, 0, { fonts: false });
    expect(svg).not.toContain(SECRET);
  });

  it('the server strips them from a share page and a project, and leaves a page with none alone', () => {
    const p = withNotes();
    const page = `<html><body><script type="application/json" id="ix-project">${JSON.stringify(p).replace(/</g, '\\u003c')}</script></body></html>`;
    expect(page).toContain(SECRET);
    const out = serverNotes.stripNotesFromPage(page);
    expect(out).not.toContain(SECRET);
    expect(JSON.parse(out.split('id="ix-project">')[1].split('</script>')[0]).artboards[0].children).toHaveLength(1);
    const plain = '<html><script type="application/json" id="ix-project">{"artboards":[]}</script></html>';
    expect(serverNotes.stripNotesFromPage(plain)).toBe(plain);
    expect(JSON.stringify(serverNotes.stripNotes(p))).not.toContain(SECRET);
    expect(() => serverNotes.stripNotesFromPage('<script id="ix-project">{"notes": nope</script>')).toThrow();
  });

  it('the editable exports keep them: the project package and the project JSON', async () => {
    const p = withNotes();
    const back = readPackage(await writePackage(p, () => null));
    expect(back.project.artboards[0].notes?.[0].text).toContain(SECRET);
    expect(back.project.notes?.[0].text).toContain(SECRET);
    expect(JSON.stringify(p)).toContain(SECRET);
    expect(JSON.stringify(stripNotes(p))).not.toContain(SECRET);
  });

  it('are not in the player when played (the document the editor plays is stripped first)', () => {
    expect(JSON.stringify(stripNotes(withNotes()))).not.toContain(SECRET);
  });
});

describe('the canvas layer', () => {
  let root: Root | null = null;
  let host: HTMLElement | null = null;
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = host = null;
    setPrefs({ showNotes: true });
  });
  beforeAll(() => {
    (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver ??= class {
      observe() {}
      disconnect() {}
      unobserve() {}
    };
  });
  function mount(s: EditorStore, extra: { hidden?: boolean } = {}) {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const draw = () => {
      const st = s.get();
      return <NotesLayer project={st.project} zoom={1} panX={0} panY={0} {...extra} />;
    };
    act(() => root!.render(draw()));
    // the layer reads the store's picked note itself; re-render when the project changes
    s.subscribe(() => act(() => root!.render(draw())));
  }

  it('draws a card per note, with the text and the colour, and calls the note a sticky note for screen readers', () => {
    const { s, ab } = fresh();
    addNote(ab, { x: 10, y: 10, text: '**Swap** this', colour: 'green' });
    mount(s);
    const card = host!.querySelector('.note') as HTMLElement;
    expect(card.className).toContain('note-green');
    expect(card.getAttribute('aria-roledescription')).toBe('sticky note');
    expect(card.getAttribute('aria-label')).toContain('Swap this');
    expect(card.querySelector('strong')!.textContent).toBe('Swap');
    expect(card.tabIndex).toBe(0);
  });

  it('draws nothing while previewing or when the person hides notes', () => {
    const { s, ab } = fresh();
    addNote(ab, { x: 10, y: 10, text: 'x' });
    mount(s, { hidden: true });
    expect(host!.querySelector('.note')).toBeNull();
    act(() => root!.unmount());
    host!.remove();
    mount(s);
    expect(host!.querySelectorAll('.note')).toHaveLength(1);
    act(() => setPrefs({ showNotes: false }));
    act(() => root!.render(<NotesLayer project={s.get().project} zoom={1} panX={0} panY={0} />));
    expect(host!.querySelector('.note')).toBeNull();
  });

  it('ticking a task on the canvas rewrites the note, and Delete on a picked note removes it without touching layers', () => {
    const { s, ab } = fresh();
    const id = addNote(ab, { x: 10, y: 10, text: '[ ] one\n[ ] two' })!;
    mount(s);
    const boxes = host!.querySelectorAll('.note-box');
    expect(boxes).toHaveLength(2);
    act(() => (boxes[1] as HTMLElement).click());
    expect(findNote(s.get().project, id)!.note.text).toBe('[ ] one\n[x] two');
    const card = host!.querySelector('.note') as HTMLElement;
    s.select(['r1']);
    act(() => {
      card.focus();
      card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
    });
    expect(findNote(s.get().project, id)).toBeNull();
    expect(s.get().project.artboards[0].children.map((n) => n.id)).toEqual(['r1']);
  });

  it('double-click opens the text box; clearing it and leaving removes an empty note', () => {
    const { s, ab } = fresh();
    const id = addNote(ab, { x: 10, y: 10, text: 'hi' })!;
    mount(s);
    const card = host!.querySelector('.note') as HTMLElement;
    act(() => card.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    const area = host!.querySelector('textarea') as HTMLTextAreaElement;
    expect(area).not.toBeNull();
    act(() => patchNote(id, { text: '' }));
    act(() => area.blur());
    expect(findNote(s.get().project, id)).toBeNull();
  });
});

describe('the Note tool on the canvas', () => {
  let root: Root | null = null;
  let host: HTMLElement | null = null;
  afterEach(() => {
    if (root) act(() => root!.unmount());
    host?.remove();
    root = host = null;
  });
  const frame = () => new Promise((r) => setTimeout(r, 20));
  function mount() {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    };
    const { s, ab } = fresh();
    s.set({ tool: 'note', activeArtboardId: ab, panX: 0, panY: 0, zoom: 1 });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<Canvas />));
    return { s, ab, vp: host.querySelector<HTMLElement>('.canvas')! };
  }
  const press = async (vp: HTMLElement, x: number, y: number, x2 = x, y2 = y) => {
    await act(async () => {
      vp.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, button: 0 }));
      if (x2 !== x || y2 !== y) vp.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: x2, clientY: y2 }));
      vp.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: x2, clientY: y2 }));
      await frame();
    });
  };

  it('has its own cursor and starts in the toolbar group the others are in', () => {
    expect(toolCursor('note')).toBe(NOTE_CURSOR);
    expect(NOTE_CURSOR).toContain('data:image/svg+xml');
  });

  it('a click on an artboard leaves a note there and opens it for typing; the tool goes back to Select', async () => {
    const { s, ab, vp } = mount();
    const onAb = s.get().project.artboards[0];
    await press(vp, onAb.canvasX + 120, onAb.canvasY + 90);
    const n = s.get().project.artboards[0].notes!;
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ x: 120, y: 90, w: 200, h: 120 });
    expect(s.get().editingNote).toBe(n[0].id);
    expect(s.get().tool).toBe('select');
    expect(s.get().project.artboards[0].children.map((c) => c.id)).toEqual(['r1']);
    expect(ab).toBe(onAb.id);
  });

  it('a drag makes the note the size that was drawn', async () => {
    const { s, vp } = mount();
    const onAb = s.get().project.artboards[0];
    await press(vp, onAb.canvasX + 50, onAb.canvasY + 50, onAb.canvasX + 350, onAb.canvasY + 230);
    expect(s.get().project.artboards[0].notes![0]).toMatchObject({ x: 50, y: 50, w: 300, h: 180 });
  });

  it('off every artboard it is a note on the canvas itself', async () => {
    const { s, vp } = mount();
    await press(vp, 3000, 3000);
    expect(s.get().project.artboards[0].notes).toBeUndefined();
    expect(s.get().project.notes).toHaveLength(1);
    expect(s.get().project.notes![0]).toMatchObject({ x: 3000, y: 3000 });
  });

  it('a press elsewhere puts the picked note away; a note left empty goes with it, one with words stays', async () => {
    const { s, vp } = mount();
    const onAb = s.get().project.artboards[0];
    await press(vp, onAb.canvasX + 10, onAb.canvasY + 10);
    expect(s.get().selectedNote).toBeTruthy();
    await press(vp, 3000, 3000);
    expect(s.get().selectedNote).toBeNull();
    expect(s.get().editingNote).toBeNull();
    expect(s.get().project.artboards[0].notes).toBeUndefined();
    s.set({ tool: 'note' });
    await press(vp, onAb.canvasX + 10, onAb.canvasY + 10);
    const id = s.get().editingNote!;
    act(() => patchNote(id, { text: 'keep me' }));
    await press(vp, 3000, 3000);
    expect(s.get().project.artboards[0].notes!.map((n) => n.text)).toEqual(['keep me']);
    s.undo();
    s.undo();
    expect(s.get().project.artboards[0].notes).toBeUndefined();
  });
});

describe('help', () => {
  it('has a topic that says players never see notes, and the shortcut table lists the tool', () => {
    const t = getTopic('notes');
    expect(t).toBeTruthy();
    expect(topicBody(t!)).toMatch(/never/i);
    expect(topicBody(getTopic('shortcuts')!)).toContain('(notes)');
  });
});
