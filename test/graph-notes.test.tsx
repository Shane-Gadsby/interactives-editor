//Notes in the interaction graph: the edits (undo, live ops, following a node or group), the graph drawing them, the tidy making room for
//them, the copy and paste carrying them, the starter kit's helper, and that no player-facing output carries one.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject, countNotes, makeNote, type Artboard, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { addGraphNote, anchorOrigin, attachGraphNote, findGraphNote, graphNotePlace, leaveGraphNote, moveGraphNote, noteHeightFor, patchGraphNote, removeGraphNote } from '../src/lib/graph-notes';
import { crossings, tidyGraph, TIDY, type TidyNode } from '../src/lib/graph-tidy';
import { cloneFragment, fragmentOf } from '../src/lib/logic-clipboard';
import { graphNote, nodeSizeGuess, tidyBoardGraph } from '../src/lib/branded/graph-kit';
import { gnode, edge } from '../src/lib/branded/kit';
import { setPrefs } from '../src/lib/prefs';
import { getTopic, topicBody } from '../src/help/topics';
import { standaloneHtml } from '../src/lib/export';
import * as ops from '../shared/ops.mjs';
import * as serverNotes from '../shared/notes.mjs';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SECRET = 'GRAPH-NOTE-TEXT-q2z';

function fresh(): { s: EditorStore; ab: string } {
  const p = createProject('Graph notes');
  const a = p.artboards[0];
  a.logic.nodes.push({ id: 'ev', kind: 'event.start', x: 100, y: 200, params: {} }, { id: 'act', kind: 'action.log', x: 400, y: 200, params: {} });
  a.logic.edges.push({ id: 'e1', from: 'ev', fromPort: 'out', to: 'act', toPort: 'in' });
  a.logic.groups = [{ id: 'grp', label: 'Flow', x: 50, y: 500, width: 300, height: 160 }];
  const s = new EditorStore(p);
  setCurrentStore(s);
  return { s, ab: a.id };
}
const logicOf = (s: EditorStore) => s.get().project.artboards[0].logic;

describe('adding, moving and following', () => {
  it('a loose note sits where it was put, with the signed in author left off in tests', () => {
    const { s, ab } = fresh();
    const id = addGraphNote(ab, { x: 12.34, y: 56, text: 'hello', colour: 'sky' }, { author: 'Sam' })!;
    const n = logicOf(s).notes![0];
    expect(n).toMatchObject({ id, x: 12.3, y: 56, text: 'hello', colour: 'sky', author: 'Sam' });
    expect(n.anchor).toBeUndefined();
    expect(graphNotePlace(logicOf(s), n)).toEqual({ x: 12.3, y: 56, detached: false });
    expect(countNotes(s.get().project)).toBe(1);
    expect(addGraphNote('nope', { x: 0, y: 0 })).toBeNull();
  });

  it('a note on a node keeps its offset, so it goes where the node goes', () => {
    const { s, ab } = fresh();
    const id = addGraphNote(ab, { x: 100, y: 70, anchorId: 'ev' }, { author: 'Sam' })!;
    expect(logicOf(s).notes![0].anchor).toEqual({ layerId: 'ev', lx: 0, ly: -130 });
    s.update((d) => {
      const n = d.artboards[0].logic.nodes.find((x) => x.id === 'ev')!;
      n.x += 250;
      n.y += 40;
    });
    expect(graphNotePlace(logicOf(s), findGraphNote(s.get().project, id)!.note)).toEqual({ x: 350, y: 110, detached: false });
  });

  it('a note on a group follows the group too', () => {
    const { s, ab } = fresh();
    addGraphNote(ab, { x: 50, y: 420, anchorId: 'grp' }, { author: 'Sam' });
    expect(logicOf(s).notes![0].anchor).toEqual({ layerId: 'grp', lx: 0, ly: -80 });
    s.update((d) => void (d.artboards[0].logic.groups![0].y = 900));
    expect(graphNotePlace(logicOf(s), logicOf(s).notes![0]).y).toBe(820);
  });

  it('dragging a note that follows something changes its offset, not the node', () => {
    const { s, ab } = fresh();
    const id = addGraphNote(ab, { x: 100, y: 70, anchorId: 'ev' }, { author: 'Sam' })!;
    moveGraphNote(id, 160, 20);
    expect(logicOf(s).notes![0].anchor).toEqual({ layerId: 'ev', lx: 60, ly: -180 });
    expect(logicOf(s).nodes[0]).toMatchObject({ x: 100, y: 200 });
  });

  it('when what it followed is deleted the note stays where it was left, dashed', () => {
    const { s, ab } = fresh();
    addGraphNote(ab, { x: 100, y: 70, anchorId: 'ev' }, { author: 'Sam' });
    s.update((d) => {
      d.artboards[0].logic.nodes = d.artboards[0].logic.nodes.filter((n) => n.id !== 'ev');
      d.artboards[0].logic.edges = [];
    });
    expect(graphNotePlace(logicOf(s), logicOf(s).notes![0])).toEqual({ x: 100, y: 70, detached: true });
  });

  it('attach and detach from where it is now', () => {
    const { s, ab } = fresh();
    const id = addGraphNote(ab, { x: 410, y: 120 }, { author: 'Sam' })!;
    expect(attachGraphNote(id, 'act')).toBe(true);
    expect(logicOf(s).notes![0].anchor).toEqual({ layerId: 'act', lx: 10, ly: -80 });
    expect(attachGraphNote(id, null)).toBe(true);
    expect(logicOf(s).notes![0].anchor).toBeUndefined();
    expect(logicOf(s).notes![0]).toMatchObject({ x: 410, y: 120 });
    expect(attachGraphNote(id, 'missing')).toBe(false);
    expect(anchorOrigin(logicOf(s), 'grp')).toMatchObject({ kind: 'group', x: 50, y: 500 });
    expect(anchorOrigin(logicOf(s), 'x')).toBeNull();
  });

  it('size, text and colour change with limits, and an emptied one goes away when you leave it', () => {
    const { s, ab } = fresh();
    const id = addGraphNote(ab, { x: 0, y: 0 }, { author: 'Sam' })!;
    patchGraphNote(id, { w: 10, h: 10, text: 'x'.repeat(9000), colour: 'rose' });
    const n = logicOf(s).notes![0];
    expect(n.w).toBe(80);
    expect(n.h).toBe(48);
    expect(n.text.length).toBe(4000);
    expect(n.colour).toBe('rose');
    patchGraphNote(id, { text: '   ' });
    s.set({ editingNote: id });
    leaveGraphNote(id);
    expect(s.get().editingNote).toBeNull();
    expect(logicOf(s).notes).toBeUndefined();
  });

  it('deleting the last one removes the list from the document', () => {
    const { s, ab } = fresh();
    const id = addGraphNote(ab, { x: 0, y: 0, text: 'a' }, { author: 'Sam' })!;
    removeGraphNote(id);
    expect('notes' in logicOf(s)).toBe(false);
  });
});

describe('undo and live editing', () => {
  it('an add, an edit and a delete each undo and redo as one step', () => {
    const { s, ab } = fresh();
    const id = addGraphNote(ab, { x: 0, y: 0, text: 'one' }, { author: 'Sam' })!;
    expect(logicOf(s).notes).toHaveLength(1);
    s.undo();
    expect(logicOf(s).notes).toBeUndefined();
    s.redo();
    expect(logicOf(s).notes![0].text).toBe('one');
    patchGraphNote(id, { text: 'two' });
    s.undo();
    expect(logicOf(s).notes![0].text).toBe('one');
    removeGraphNote(id);
    s.undo();
    expect(logicOf(s).notes).toHaveLength(1);
  });

  it('travels as ordinary id-addressed ops, in both directions', () => {
    const { s, ab } = fresh();
    const before = s.get().project;
    const id = addGraphNote(ab, { x: 5, y: 6, text: 'hello', anchorId: 'ev' }, { author: 'Sam' })!;
    const there = JSON.parse(JSON.stringify(before));
    ops.apply(there, ops.diff(before, s.get().project));
    expect(there.artboards[0].logic.notes[0]).toMatchObject({ id, text: 'hello', anchor: { layerId: 'ev' } });
    const mid = s.get().project;
    patchGraphNote(id, { text: 'again', colour: 'green' });
    const second = addGraphNote(ab, { x: 50, y: 60, text: 'two' }, { author: 'Sam' })!;
    ops.apply(there, ops.diff(mid, s.get().project));
    expect(there.artboards[0].logic.notes.map((n: { id: string }) => n.id)).toEqual([id, second]);
    expect(there.artboards[0].logic.notes[0]).toMatchObject({ text: 'again', colour: 'green' });
    const prev = s.get().project;
    removeGraphNote(id);
    removeGraphNote(second);
    ops.apply(there, ops.diff(prev, s.get().project));
    expect('notes' in there.artboards[0].logic).toBe(false);
  });

  it('a note from another person shows up through applyRemote', () => {
    const { s } = fresh();
    const note = { id: 'n-remote', x: 1, y: 1, w: 200, h: 100, text: 'from a friend' };
    s.applyRemote([{ t: 'ins', p: ['artboards', { i: s.get().project.artboards[0].id }, 'logic', 'notes'], v: note, after: null }]);
    expect(findGraphNote(s.get().project, 'n-remote')!.note.text).toBe('from a friend');
  });

  it('editing a graph note is not a change to the nodes: node references stay the same objects', () => {
    const { s, ab } = fresh();
    const nodes = logicOf(s).nodes;
    addGraphNote(ab, { x: 0, y: 0, text: 'x' }, { author: 'Sam' });
    expect(logicOf(s).nodes).toBe(nodes);
  });
});

describe('the tidy makes room for notes', () => {
  const box = (id: string, x: number, y: number): TidyNode => ({ id, x, y, width: 180, height: 70 });
  const overlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

  it('a note on a node moves with it and has room above it, so the row above is not run over', () => {
    const nodes = [box('a', 0, 0), box('b', 0, 100), box('c', 300, 0)];
    const edges = [{ from: 'a', to: 'c' }];
    // a note above b (110 tall, 14 clear of it): that is where the rows above must stop
    const notes = [{ id: 'n1', x: 0, y: 100 - 124, width: 230, height: 110, host: 'b' }];
    const out = tidyGraph(nodes, edges, [], notes);
    const n = out.notes.get('n1')!;
    const b = out.positions.get('b')!;
    expect(n.x).toBe(b.x);
    expect(n.y).toBe(b.y - 124);
    const rect = { x: n.x, y: n.y, width: 230, height: 110 };
    for (const id of ['a', 'b', 'c']) {
      const p = out.positions.get(id)!;
      if (id === 'b') continue;
      expect(overlap(rect, { x: p.x, y: p.y, width: 180, height: 70 }), `note over ${id}`).toBe(false);
    }
  });

  it('a note on a group moves with the frame and leaves room', () => {
    const nodes = [box('a', 100, 100), box('b', 400, 100)];
    const notes = [{ id: 'n1', x: 80, y: -34, width: 220, height: 80, host: 'g' }];
    const out = tidyGraph(nodes, [{ from: 'a', to: 'b' }], [{ id: 'g', members: ['a', 'b'], x: 76, y: 60 }], notes);
    const g = out.groups.get('g')!;
    const n = out.notes.get('n1')!;
    expect(n.x - g.x).toBe(4);
    expect(n.y - g.y).toBe(-94);
    expect(overlap({ x: n.x, y: n.y, width: 220, height: 80 }, g)).toBe(false);
  });

  it('a loose note that landed on a node is moved clear of it, one that is clear stays', () => {
    const nodes = [box('a', 0, 0), box('b', 300, 0)];
    const out = tidyGraph(nodes, [{ from: 'a', to: 'b' }], [], [
      { id: 'on', x: 20, y: 10, width: 200, height: 60 },
      { id: 'clear', x: 2000, y: 2000, width: 200, height: 60 },
    ]);
    const on = out.notes.get('on')!;
    expect(overlap({ ...on, width: 200, height: 60 }, { ...out.positions.get('a')!, width: 180, height: 70 })).toBe(false);
    expect(out.notes.get('clear')).toEqual({ x: 2000, y: 2000 });
  });

  it('with no notes it gives the same layout as before', () => {
    const nodes = [box('a', 0, 0), box('b', 0, 100), box('c', 300, 0), box('d', 300, 100)];
    const edges = [
      { from: 'a', to: 'd' },
      { from: 'b', to: 'c' },
    ];
    const one = tidyGraph(nodes, edges);
    const two = tidyGraph(nodes, edges, [], []);
    expect([...two.positions]).toEqual([...one.positions]);
    expect(crossings(nodes, edges, two.positions)).toBe(0);
    expect(two.notes.size).toBe(0);
  });

  it('tidyBoardGraph keeps kit notes off the nodes, whatever order the starter built in', () => {
    const p = createProject('kit');
    const ab = p.artboards[0] as Artboard;
    const a = gnode('event.start', 0, 0, {});
    const b = gnode('action.log', 0, 0, {});
    const c = gnode('event.pointer', 0, 0, {});
    ab.logic.nodes.push(a, b, c);
    ab.logic.edges.push(edge(a, b));
    graphNote(ab, { text: '**Start** runs once and logs.\n- [ ] swap the message', anchor: a });
    graphNote(ab, { text: 'This one is about the click', anchor: c });
    graphNote(ab, { text: 'A loose one', anchor: { x: 10, y: 10 } });
    tidyBoardGraph(ab);
    const rects = ab.logic.nodes.map((n) => ({ x: n.x, y: n.y, ...nodeSizeGuess(n) }));
    for (const n of ab.logic.notes!) {
      const at = graphNotePlace(ab.logic, n);
      const r = { x: at.x, y: at.y, width: n.w, height: n.h };
      rects.forEach((nr, i) => expect(overlap(r, nr), `note ${n.id} over node ${i}`).toBe(false));
    }
    expect(TIDY.noteGap).toBeGreaterThan(0);
  });
});

describe('the starter kit helper', () => {
  it('writes a note sized to its words, above its node, as the template author', () => {
    const p = createProject('kit');
    const ab = p.artboards[0];
    const a = gnode('event.start', 40, 300, {});
    ab.logic.nodes.push(a);
    const n = graphNote(ab, { text: '**Only if** stops the arrow keys while a dialog is open', anchor: a, colour: 'sky' });
    expect(ab.logic.notes).toEqual([n]);
    expect(n).toMatchObject({ colour: 'sky', author: 'Template', w: 230 });
    expect(n.anchor).toMatchObject({ layerId: a.id, lx: 0 });
    expect(n.anchor!.ly).toBe(-n.h - 14);
    expect(graphNotePlace(ab.logic, n).y).toBe(300 - n.h - 14);
    expect(noteHeightFor('short', 230)).toBe(48);
    expect(noteHeightFor('a\n'.repeat(10), 230)).toBeGreaterThan(noteHeightFor('a', 230));
    const g = graphNote(ab, { text: 'loose', anchor: { x: 5, y: 6 } });
    expect(g).toMatchObject({ x: 5, y: 6 });
    expect(g.anchor).toBeUndefined();
  });
});

describe('copy and paste', () => {
  it('a copied node brings the notes that follow it, wired to the copy', () => {
    const { s, ab } = fresh();
    addGraphNote(ab, { x: 100, y: 70, anchorId: 'ev', text: 'on ev' }, { author: 'Sam' });
    addGraphNote(ab, { x: 900, y: 70, text: 'loose' }, { author: 'Sam' });
    const f = fragmentOf(logicOf(s), ['ev'], () => []);
    expect(f.notes!.map((n) => n.text)).toEqual(['on ev']);
    const c = cloneFragment(f, 30, 30);
    expect(c.notes![0].id).not.toBe(f.notes![0].id);
    expect(c.notes![0].anchor!.layerId).toBe(c.nodes[0].id);
    expect(c.notes![0]).toMatchObject({ x: 130, y: 100 });
    // a note picked on its own copies on its own, and loses an anchor that was not copied
    const solo = cloneFragment(fragmentOf(logicOf(s), [logicOf(s).notes![0].id], () => []), 0, 0);
    expect(solo.nodes).toHaveLength(0);
    expect(solo.notes![0].anchor).toBeUndefined();
    expect(fragmentOf(logicOf(s), ['act'], () => []).notes).toBeUndefined();
  });
});

describe('what players and pictures get', () => {
  const withGraphNote = (): Project => {
    const { s, ab } = fresh();
    addGraphNote(ab, { x: 5, y: 5, text: `${SECRET} one`, anchorId: 'ev' }, { author: 'Sam' });
    return JSON.parse(JSON.stringify(s.get().project));
  };

  it('single HTML carries no graph note text', async () => {
    const html = await standaloneHtml(withGraphNote(), { embedFonts: false });
    expect(html).toContain('id="ix-project"');
    expect(html).not.toContain(SECRET);
  });

  it('the server strips them from a share page and a project, and leaves one with none alone', () => {
    const p = withGraphNote();
    const page = `<html><body><script type="application/json" id="ix-project">${JSON.stringify(p).replace(/</g, '\\u003c')}</script></body></html>`;
    expect(page).toContain(SECRET);
    expect(serverNotes.stripNotesFromPage(page)).not.toContain(SECRET);
    const stripped = serverNotes.stripNotes(p) as Project;
    expect(JSON.stringify(stripped)).not.toContain(SECRET);
    expect(stripped.artboards[0].logic.nodes).toHaveLength(2);
    expect(stripped.artboards[0].logic.groups).toHaveLength(1);
    const none = createProject('none');
    expect(serverNotes.stripNotes(none)).toBe(none);
  });

  it('only the graph holding notes is enough to be stripped', () => {
    const p = createProject('g');
    p.artboards[0].logic.notes = [makeNote({ x: 0, y: 0, text: SECRET })];
    expect(JSON.stringify(serverNotes.stripNotes(p))).not.toContain(SECRET);
    expect(serverNotes.stripNotes(p)).not.toBe(p);
  });
});

describe('help', () => {
  it('says what graph notes are, how to add one, and that players never see them', () => {
    const body = topicBody(getTopic('interactions')!);
    expect(body).toMatch(/Add note here/);
    expect(body).toMatch(/Add note to this node/);
    expect(body).toMatch(/graph notes/i);
    expect(body).toMatch(/never/i);
  });
});

describe('in the graph', () => {
  let root: Root | null = null;
  let host: HTMLElement | null = null;
  beforeEach(() => {
    localStorage.clear();
    setPrefs({ showNotes: true });
  });
  afterEach(() => {
    if (root) act(() => root!.unmount());
    host?.remove();
    root = host = null;
    vi.unstubAllGlobals();
  });
  async function mount() {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('DOMMatrixReadOnly', class { m22 = 1; constructor() {} });
    vi.stubGlobal('requestAnimationFrame', (fn: () => void) => void setTimeout(fn, 0));
    const { LogicGraph } = await import('../src/panels/LogicGraph');
    const { s, ab } = fresh();
    addGraphNote(ab, { x: 100, y: 70, text: `**bold** ${SECRET}`, anchorId: 'ev' }, { author: 'Sam' });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<LogicGraph />));
    await act(async () => void (await new Promise((r) => setTimeout(r, 5))));
    return { s, ab };
  }
  const q = <T extends Element = HTMLElement>(sel: string) => host!.querySelector(sel) as T;

  it('draws a note as paper with its words, and says what it is on', async () => {
    await mount();
    const note = q('.react-flow__node-ixnote .note');
    expect(note).toBeTruthy();
    expect(note.textContent).toContain(SECRET);
    expect(note.querySelector('strong')!.textContent).toBe('bold');
    expect(note.getAttribute('aria-roledescription')).toBe('sticky note');
    expect(note.getAttribute('aria-label')).toContain('Sam');
    expect(note.querySelector('.note-by')!.textContent).toBe('On start');
  });

  it('hides with the other notes when they are put away', async () => {
    await mount();
    act(() => setPrefs({ showNotes: false }));
    expect(host!.querySelector('.react-flow__node-ixnote')).toBeNull();
    act(() => setPrefs({ showNotes: true }));
    expect(host!.querySelector('.react-flow__node-ixnote')).toBeTruthy();
  });

  it('selecting it shows its form: text, colour, what it follows, delete', async () => {
    const { s } = await mount();
    const id = logicOf(s).notes![0].id;
    act(() => s.set({ logicSelection: id, logicPicked: [id] }));
    expect(q('.graph-note-form')).toBeTruthy();
    const swatch = [...host!.querySelectorAll<HTMLButtonElement>('.graph-note-form .note-swatch')].find((b) => b.getAttribute('aria-label') === 'Pink note')!;
    act(() => swatch.click());
    expect(logicOf(s).notes![0].colour).toBe('rose');
    expect(q('.graph-note-form select')).toBeTruthy();
    const del = [...host!.querySelectorAll<HTMLButtonElement>('.graph-note-form button')].find((b) => /Delete note/.test(b.textContent ?? ''))!;
    act(() => del.click());
    expect(logicOf(s).notes).toBeUndefined();
  });

  it('Delete removes the picked note, and only that', async () => {
    const { s } = await mount();
    const id = logicOf(s).notes![0].id;
    act(() => s.set({ logicSelection: id, logicPicked: [id] }));
    const canvas = q('.logic-canvas');
    canvas.focus();
    await act(async () => void canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true })));
    expect(logicOf(s).notes).toBeUndefined();
    expect(logicOf(s).nodes).toHaveLength(2);
  });

  it('double-click opens it for typing, and typing is one undo step', async () => {
    const { s } = await mount();
    const id = logicOf(s).notes![0].id;
    act(() => void q('.react-flow__node-ixnote .note').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(s.get().editingNote).toBe(id);
    const area = q<HTMLTextAreaElement>('.react-flow__node-ixnote textarea');
    expect(area).toBeTruthy();
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    act(() => {
      set.call(area, 'a');
      area.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => {
      set.call(area, 'ab');
      area.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(logicOf(s).notes![0].text).toBe('ab');
    act(() => area.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    s.undo();
    expect(logicOf(s).notes![0].text).toContain(SECRET);
  });

  it('Enter on a picked note opens it for typing', async () => {
    const { s } = await mount();
    const id = logicOf(s).notes![0].id;
    act(() => s.set({ logicSelection: id, logicPicked: [id] }));
    const canvas = q('.logic-canvas');
    await act(async () => void canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
    expect(s.get().editingNote).toBe(id);
  });

  it('the add-note button and the menus put a note on the graph', async () => {
    const { s } = await mount();
    const btn = host!.querySelector<HTMLButtonElement>('button[aria-label="Add a note to the graph"]')!;
    expect(btn).toBeTruthy();
    act(() => btn.click());
    expect(logicOf(s).notes).toHaveLength(2);
    expect(s.get().editingNote).toBe(logicOf(s).notes![1].id);
  });

  it('Tidy up leaves a note off the nodes and with the node it follows', async () => {
    const { s } = await mount();
    const tidy = host!.querySelector<HTMLButtonElement>('button[aria-label="Tidy up the graph"]')!;
    act(() => tidy.click());
    const g = logicOf(s);
    const n = g.notes![0];
    const ev = g.nodes.find((x) => x.id === 'ev')!;
    const at = graphNotePlace(g, n);
    expect(at.x - ev.x).toBe(0);
    expect(at.y).toBeLessThan(ev.y);
    expect(n.anchor).toBeTruthy();
  });
});
