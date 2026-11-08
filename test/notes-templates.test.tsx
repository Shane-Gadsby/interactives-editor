//Notes and templates: a template's notes come along when a project is made from it, edits to notes are never "changes to the
//template's artboard", Update from template leaves yours alone, a branded or library copy still lets you leave notes, and the
//kit helper starters use to carry notes.
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { createNode, normalizeProject, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { addNote as kitNote, brandedPage, brandedProject, contentBox, text } from '../src/lib/branded/kit';
import { COLOURWAYS } from '../src/lib/branded/looks';
import { applyTemplateUpdate, baselineOf, planTemplateUpdate } from '../src/lib/templates';
import { lockViolation } from '../src/lib/libraries';
import { addNote, findNote, patchNote } from '../src/lib/notes';
import * as kit from '../shared/template.mjs';

function template(): Project {
  const p = normalizeProject({
    format: 'interactives',
    version: 1,
    id: 'tp',
    name: 'T',
    created: '',
    updated: '',
    artboards: [{ id: 'ab1', name: 'Main', width: 400, height: 300, children: [createNode('text', { id: 't1', name: 'Title', text: 'Title here' })], timelines: [], logic: { nodes: [], edges: [] }, notes: [{ id: 'tn1', x: 10, y: 10, w: 200, h: 100, text: 'Replace the title' }] }],
    variables: [],
    notes: [{ id: 'tn2', x: -300, y: 0, w: 200, h: 100, text: 'Canvas level hint' }],
  });
  return p;
}
const useIt = (t: Project): Project => {
  const copy = JSON.parse(JSON.stringify(kit.cleanProject(t))) as Project;
  copy.id = 'mine';
  copy.template = { id: 'tpl', name: 'T', version: 1, base: baselineOf(copy), checklist: [] };
  return copy;
};

describe('a project made from a template', () => {
  it('starts with the template\'s notes, on the artboards and on the canvas', () => {
    const mine = useIt(template());
    expect(mine.artboards[0].notes![0].text).toBe('Replace the title');
    expect(mine.notes![0].text).toBe('Canvas level hint');
  });

  it('editing notes does not count as changing the artboard, so the template update has nothing to say', () => {
    const t = template();
    let mine = useIt(t);
    mine = produce(mine, (d) => {
      d.artboards[0].notes![0].text = 'Done that';
      d.artboards[0].notes!.push({ id: 'mine', x: 0, y: 0, w: 200, h: 100, text: 'mine' });
    });
    expect(planTemplateUpdate(mine, t)).toEqual({ changes: [], kept: [], removed: 0 });
  });

  it('Update from template leaves your notes alone, even when the template has moved on', () => {
    const t = template();
    let mine = useIt(t);
    mine = produce(mine, (d) => {
      d.artboards[0].notes![0].text = 'Mine now';
    });
    const t2 = produce(t, (d) => {
      d.artboards[0].name = 'Renamed';
      d.artboards[0].notes = [{ id: 'new', x: 0, y: 0, w: 200, h: 100, text: 'Template says something else' }];
    });
    const plan = planTemplateUpdate(mine, t2);
    mine = produce(mine, (d) => {
      applyTemplateUpdate(d, t2, plan.changes.map((c) => c.key), { version: 2 });
    });
    expect(mine.artboards[0].name).toBe('Renamed');
    expect(mine.artboards[0].notes!.map((n) => n.text)).toEqual(['Mine now']);
  });

  it('Save as template keeps notes (the saved copy is the whole project)', () => {
    const saved = kit.cleanProject(template()) as Project;
    expect(saved.artboards[0].notes).toHaveLength(1);
    expect(saved.notes).toHaveLength(1);
  });
});

describe('locked copies still take notes', () => {
  it('a library copy accepts a note without being "edited"', () => {
    const t = template();
    const before = produce(t, (d) => {
      d.artboards[0].library = { libraryId: 'lib', componentId: 'c1', version: 1 } as never;
    });
    const after = produce(before, (d) => {
      (d.artboards[0].notes ??= []).push({ id: 'x', x: 1, y: 1, w: 200, h: 100, text: 'hi' });
    });
    expect(lockViolation(before, after)).toBeNull();
    const changed = produce(before, (d) => {
      d.artboards[0].width = 999;
    });
    expect(lockViolation(before, changed)).not.toBeNull();
  });

  it('a branded project lets you leave a note on its locked pages', () => {
    const ctx = brandedProject(COLOURWAYS[1], 'Pack');
    const page = brandedPage(ctx, 'One', { footer: 'Page 1' });
    page.children.push(text(ctx, 'Body', 'Hello', contentBox(page).x, contentBox(page).y, 400));
    const s = new EditorStore(ctx.project);
    setCurrentStore(s);
    const id = addNote(page.id, { x: 5, y: 5, text: 'add the real intro here, colour #ff0000 please' });
    expect(id).toBeTruthy();
    expect(findNote(s.get().project, id!)).not.toBeNull();
    patchNote(id!, { text: 'edited' });
    expect(findNote(s.get().project, id!)!.note.text).toBe('edited');
  });
});

describe('the kit helper', () => {
  it('puts a note on a starter page and, with a layer, follows it at the same offset', () => {
    const ctx = brandedProject(COLOURWAYS[0], 'T');
    const page = brandedPage(ctx, 'One');
    const body = text(ctx, 'Body', 'Hello', 100, 120, 300);
    page.children.push(body);
    const free = kitNote(page, { x: 900, y: 40, text: '**Hint**', colour: 'sky' });
    const tied = kitNote(page, { x: 420, y: 120, text: 'Replace this', anchor: body });
    expect(page.notes).toEqual([free, tied]);
    expect(free).toMatchObject({ x: 900, y: 40, colour: 'sky', author: 'Template' });
    expect(free.anchor).toBeUndefined();
    expect(tied.anchor).toEqual({ layerId: body.id, lx: 320, ly: 0 });
    // an anchor that is not on the page is ignored rather than left dangling
    expect(kitNote(page, { x: 0, y: 0, text: 'x', anchor: 'nope' }).anchor).toBeUndefined();
  });
});
