/**
 * "Fill in this starter": every branded starter declares a form for its content (src/lib/branded/sets/<set>/forms.ts), and every
 * field of it is a plain edit of ordinary document data. These tests hold each starter to that: the form's bindings all resolve, no
 * checklist item about content is left without a field, and every field round-trips (edit it through the store, read it back, undo it).
 */
import { describe, expect, it } from 'vitest';
import { formFields, type ContentForm, type FormColumn, type FormField, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { BRANDED_STARTERS, COLOURWAYS, projectFromBrandedStarter } from '../src/lib/branded';
import { FormKit, REVIEW_ITEM, uncoveredItems } from '../src/lib/branded/form-kit';
import { addRow, canAdd, canRemove, checkForm, columnOptions, layerOf, moveRow, readField, readRows, removeRow, setCell, writeField } from '../src/lib/content-form';

const built = new Map<string, Project>();
const projectOf = (key: string): Project => {
  if (!built.has(key)) built.set(key, projectFromBrandedStarter(BRANDED_STARTERS.find((s) => s.key === key)!, COLOURWAYS[0]));
  return JSON.parse(JSON.stringify(built.get(key)!)) as Project;
};

describe('every branded starter has a Fill in form', () => {
  it('declares one, with fields', () => {
    const none = BRANDED_STARTERS.filter((s) => !s.form).map((s) => s.key);
    expect(none).toEqual([]);
    for (const s of BRANDED_STARTERS) expect(formFields(projectOf(s.key).contentForm).length, s.key).toBeGreaterThan(1);
  });

  it('binds every field to something that is in the project, with no field used twice and no formula in the way', () => {
    for (const s of BRANDED_STARTERS) expect(checkForm(projectOf(s.key)), s.key).toEqual([]);
  });

  it('leaves no checklist item about content without a field (the rest are things to check, or listed as done elsewhere)', () => {
    const gaps: string[] = [];
    for (const s of BRANDED_STARTERS) {
      const p = projectOf(s.key);
      const spec = s.form!(new FormKit(p));
      for (const text of uncoveredItems(p.template!.checklist, spec)) gaps.push(`${s.key}: ${text}`);
    }
    expect(gaps).toEqual([]);
  });

  it('links checklist items to fields that exist, and no item to a field about something else by accident', () => {
    for (const s of BRANDED_STARTERS) {
      const p = projectOf(s.key);
      const ids = new Set(formFields(p.contentForm).map((f) => f.id));
      for (const item of p.template!.checklist) {
        if (item.field) expect(ids.has(item.field), `${s.key}: ${item.text}`).toBe(true);
        //an item that asks to check or try something is not a place to type
        else if (REVIEW_ITEM.test(item.text)) expect(item.field).toBeUndefined();
      }
    }
  });

  it('keeps the field text plain: no jargon, no em dashes', () => {
    const JARGON = /\b(variables?|nodes?|inspector|expressions?|repeater|formulas?|binding|asset id|user data)\b|—|[`]/i;
    const bad: string[] = [];
    for (const s of BRANDED_STARTERS) {
      const form = projectOf(s.key).contentForm as ContentForm;
      for (const sec of form.sections) {
        for (const t of [sec.title, sec.hint ?? '']) if (JARGON.test(t)) bad.push(`${s.key}: ${t}`);
        for (const f of sec.fields) for (const t of [f.label, f.hint ?? '', ...(f.columns ?? []).flatMap((c) => [c.label, c.hint ?? ''])]) if (JARGON.test(t)) bad.push(`${s.key}: ${t}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

// ------------------------------------------------------------------ round trips

const sampleOf = (c: { type: string; options?: { value: string | number }[]; min?: number; max?: number; base?: number }, current: unknown, lines?: unknown): unknown => {
  switch (c.type) {
    case 'text':
    case 'long':
      return `Sample ${current === 'Sample one' ? 'two' : 'one'}`;
    case 'number': {
      const n = Math.min(c.max ?? 90, Math.max(c.min ?? 0, typeof current === 'number' && current === 3 ? 4 : 3));
      return n;
    }
    case 'toggle':
      return current !== true;
    case 'choice':
      return c.options!.find((o) => o.value !== current)!.value;
    case 'asset':
      return 'asset-sample';
    case 'lines':
      return ['alpha', 'beta'];
    case 'tags':
      return ['x', 'y'];
    case 'numbers':
      return [1, 2];
    case 'pick': {
      const n = Array.isArray(lines) ? lines.length : 1;
      const base = c.base ?? 1;
      return current === base + 1 || n < 2 ? base : base + 1;
    }
    default:
      return undefined;
  }
};

function roundTripField(s: EditorStore, f: FormField, where: string) {
  const before = s.get().project;
  if (f.type !== 'list') {
    const v = sampleOf(f, readField(before, f));
    s.update((d) => void writeField(d as Project, f, v));
    const got = readField(s.get().project, f);
    expect(got, `${where}: ${f.id}`).toEqual(v);
    s.undo();
    expect(readField(s.get().project, f), `${where}: ${f.id} after undo`).toEqual(readField(before, f));
    return;
  }
  const rows = readRows(before, f);
  expect(rows.length, `${where}: ${f.id} has rows`).toBeGreaterThan(0);
  const cols = f.columns as FormColumn[];
  for (const col of cols) {
    //a fixed row only has the cells it has a binding for
    const ri = f.rows?.source === 'fixed' ? f.rows.rows.findIndex((r) => r.cells[col.key]) : 0;
    expect(ri, `${where}: ${f.id}.${col.key} is in some row`).toBeGreaterThanOrEqual(0);
    const cur = rows[ri].values[col.key];
    const lines = col.type === 'pick' ? rows[ri].values[col.of!] : undefined;
    const v = sampleOf({ ...col, options: columnOptions(before, f, col) }, cur, lines);
    s.update((d) => void setCell(d as Project, f, ri, col.key, v));
    expect(readRows(s.get().project, f)[ri].values[col.key], `${where}: ${f.id}.${col.key}`).toEqual(v);
    s.undo();
    expect(readRows(s.get().project, f)[ri].values[col.key], `${where}: ${f.id}.${col.key} after undo`).toEqual(cur);
  }
  if (canAdd(before, f)) {
    s.update((d) => void addRow(d as Project, f));
    expect(readRows(s.get().project, f).length, `${where}: ${f.id} add`).toBe(rows.length + 1);
    s.undo();
  }
  if (canRemove(before, f)) {
    s.update((d) => void removeRow(d as Project, f, rows.length - 1));
    expect(readRows(s.get().project, f).length, `${where}: ${f.id} remove`).toBe(rows.length - 1);
    s.undo();
  }
  if (!f.fixed && f.rows?.source !== 'fixed' && rows.length > 1) {
    s.update((d) => void moveRow(d as Project, f, 0, 1));
    expect(readRows(s.get().project, f)[1].values, `${where}: ${f.id} move`).toEqual(rows[0].values);
    s.undo();
  }
  expect(readRows(s.get().project, f), `${where}: ${f.id} back as it was`).toEqual(rows);
}

describe('a form edit is a document edit', () => {
  for (const starter of BRANDED_STARTERS) {
    it(`${starter.key}: every field round-trips through the store and undoes`, () => {
      const p = projectOf(starter.key);
      const s = new EditorStore(p);
      setCurrentStore(s);
      for (const f of formFields(p.contentForm)) roundTripField(s, f, starter.key);
    });
  }
});

describe('the form edits what the advanced panels show', () => {
  it('typing a question in the form changes the list variable the question page reads', () => {
    const p = projectOf('assessment/single-choice-set');
    const s = new EditorStore(p);
    setCurrentStore(s);
    const f = formFields(p.contentForm).find((x) => x.id === 'questions')!;
    s.update((d) => void setCell(d as Project, f, 0, 'prompt', 'Which colour is the sky?'));
    const v = s.get().project.variables.find((x) => x.name === 'questions')!;
    expect(JSON.parse(v.initial as string)[0].prompt).toBe('Which colour is the sky?');
    //the other keys of the row were not lost
    expect(JSON.parse(v.initial as string)[0].explain).toBeTruthy();
  });

  it('a layer text field writes the layer, and a question field writes the question settings', () => {
    const p = projectOf('assessment/multi-page-quiz');
    const s = new EditorStore(p);
    setCurrentStore(s);
    const title = formFields(p.contentForm).find((x) => x.id === 'title')!;
    s.update((d) => void writeField(d as Project, title, 'My quiz'));
    expect(layerOf(s.get().project, title.bind!.k === 'layer' ? title.bind!.a : '', title.bind!.k === 'layer' ? title.bind!.n : '')).toMatchObject({ text: 'My quiz' });
    const prompt = formFields(p.contentForm).find((x) => x.id === 'question-1-prompt')!;
    s.update((d) => void writeField(d as Project, prompt, 'Which is best?'));
    const q = s.get().project.artboards.flatMap((a) => a.children).find((n) => n.name === 'Question 1' && 'question' in n && n.question);
    expect((q as unknown as { question: { prompt: string } }).question.prompt).toBe('Which is best?');
  });

  it('ticking the right answer of a single choice question unticks the others, and a new answer gets a fresh id', () => {
    const p = projectOf('assessment/multi-page-quiz');
    const s = new EditorStore(p);
    setCurrentStore(s);
    const f = formFields(p.contentForm).find((x) => x.id === 'question-1-options')!;
    s.update((d) => void setCell(d as Project, f, 0, 'correct', true));
    const rows = readRows(s.get().project, f);
    expect(rows.map((r) => r.values.correct)).toEqual([true, false, false, false]);
    s.update((d) => void addRow(d as Project, f));
    const q = s.get().project.artboards.flatMap((a) => a.children).find((n) => n.name === 'Question 1' && 'question' in n && n.question) as unknown as { question: { options: { id: string }[] } };
    expect(new Set(q.question.options.map((o) => o.id)).size).toBe(5);
  });

  it('putting a picture in a slot turns the placeholder into that picture, and clearing it puts the placeholder back', () => {
    const p = projectOf('assessment/find-the-hotspot');
    const s = new EditorStore(p);
    setCurrentStore(s);
    const f = formFields(p.contentForm).find((x) => x.bind?.k === 'slot')!;
    const bind = f.bind as Extract<NonNullable<FormField['bind']>, { k: 'slot' }>;
    const original = JSON.stringify((layerOf(p, bind.a, bind.n) as unknown as { fill: unknown }).fill);
    s.update((d) => void writeField(d as Project, f, 'asset-1'));
    expect((layerOf(s.get().project, bind.a, bind.n) as unknown as { fill: { type: string; assetId: string } }).fill).toMatchObject({ type: 'image', assetId: 'asset-1' });
    s.update((d) => void writeField(d as Project, f, ''));
    expect(JSON.stringify((layerOf(s.get().project, bind.a, bind.n) as unknown as { fill: unknown }).fill)).toBe(original);
  });

  it('the form goes with Save as template: it is part of the project document', () => {
    const p = projectOf('assessment/essay');
    const copy = JSON.parse(JSON.stringify(p)) as Project;
    expect(copy.contentForm?.sections.length).toBeGreaterThan(2);
    expect(checkForm(copy)).toEqual([]);
  });
});

describe('a saved template keeps the link from a checklist item to its field', () => {
  it('passes the field through the server cleaning of a checklist', async () => {
    const { cleanChecklist } = await import('../shared/template.mjs');
    const out = cleanChecklist([{ text: 'Write your questions', field: 'questions' }, { text: 'Bad link', field: 'no spaces allowed' }, { text: 'Plain' }], () => 'ck1');
    expect((out as { field?: string }[]).map((i) => i.field)).toEqual(['questions', undefined, undefined]);
  });
});
