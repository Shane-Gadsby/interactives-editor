//The Fill in panel: the form a starter carries, typed into like any form, with every change a document edit (undoable) and the checklist pointing into it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { formFields, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';

vi.mock('../src/lib/db', async (orig) => ({ ...(await orig<typeof import('../src/lib/db')>()), getTemplate: async () => ({ version: 1 }) }));

import { ContentFormPanel } from '../src/panels/ContentFormPanel';
import { ChecklistPanel } from '../src/panels/ChecklistPanel';
import { BRANDED_STARTERS, COLOURWAYS, projectFromBrandedStarter } from '../src/lib/branded';
import { FILL_IN_FOCUS, layerOf } from '../src/lib/content-form';
import { getDock, defaultLayout, setDock } from '../src/lib/dock';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let s: EditorStore;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const start = async (key: string, panel = <ContentFormPanel />) => {
  const p = projectFromBrandedStarter(BRANDED_STARTERS.find((x) => x.key === key)!, COLOURWAYS[0]);
  s = new EditorStore(p);
  setCurrentStore(s);
  await act(async () => root.render(panel));
  return p;
};
const type = (el: HTMLInputElement | HTMLTextAreaElement, value: string) =>
  act(() => {
    const set = Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')!.set!;
    set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
const blur = (el: HTMLElement) => act(() => void el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
const field = (id: string) => host.querySelector(`[data-field="${id}"]`) as HTMLElement;
const click = (el: Element | null | undefined) => act(async () => void (el as HTMLElement).click());

describe('the Fill in panel', () => {
  it('lists the form of the project in sections, with each field holding what is in the project now', async () => {
    const p = await start('assessment/single-choice-set');
    const titles = [...host.querySelectorAll('section h3')].map((h) => h.textContent);
    expect(titles).toEqual(['Title page', 'Questions', 'Timing', 'Messages']);
    expect([...host.querySelectorAll('.fillin-nav .chip')].map((c) => c.textContent)).toEqual(titles);
    const title = field('title').querySelector('input') as HTMLInputElement;
    const bind = formFields(p.contentForm).find((f) => f.id === 'title')!.bind as { a: string; n: string };
    expect(title.value).toBe((layerOf(p, bind.a, bind.n) as unknown as { text: string }).text);
    //one card for each question in the list
    expect(field('questions').querySelectorAll('details.fillin-row')).toHaveLength(8);
  });

  it('typing changes the layer on the page, and one undo puts the old words back', async () => {
    const p = await start('assessment/single-choice-set');
    const f = formFields(p.contentForm).find((x) => x.id === 'title')!;
    const b = f.bind as { a: string; n: string };
    const before = (layerOf(p, b.a, b.n) as unknown as { text: string }).text;
    await type(field('title').querySelector('input')!, 'My own title');
    expect((layerOf(s.get().project, b.a, b.n) as unknown as { text: string }).text).toBe('My own title');
    await type(field('title').querySelector('input')!, 'My own title, again');
    s.undo();
    expect((layerOf(s.get().project, b.a, b.n) as unknown as { text: string }).text).toBe(before);
  });

  it('adds, moves and removes list rows in the list variable, and a tick marks the right answer', async () => {
    await start('assessment/single-choice-set');
    const rows = () => JSON.parse(s.get().project.variables.find((v) => v.name === 'questions')!.initial as string) as { prompt: string }[];
    const first = rows()[0].prompt;
    await click([...field('questions').querySelectorAll('button')].find((b) => b.textContent?.startsWith('+ Add')));
    expect(rows()).toHaveLength(9);
    await click(field('questions').querySelector('button[title^="Move Question 9"][title$="up"]'));
    expect(rows()[7].prompt).toBe('');
    await click(field('questions').querySelector('button[title^="Remove Question 8"]'));
    expect(rows()).toHaveLength(8);
    expect(rows()[0].prompt).toBe(first);
  });

  it('ticking the right answer of a quiz question writes the question, and its other answers are unticked', async () => {
    await start('assessment/multi-page-quiz');
    const boxes = () => [...field('question-1-options').querySelectorAll('input[type=checkbox]')] as HTMLInputElement[];
    expect(boxes().map((b) => b.checked)).toEqual([false, true, false, false]);
    await click(boxes()[0]);
    expect(boxes().map((b) => b.checked)).toEqual([true, false, false, false]);
    const q = s.get().project.artboards.flatMap((a) => a.children).find((n) => n.name === 'Question 1' && 'question' in n) as unknown as { question: { options: { correct?: boolean }[] } };
    expect(q.question.options.map((o) => !!o.correct)).toEqual([true, false, false, false]);
  });

  it('keeps a lines box as typed until you click away, then writes one entry for each line', async () => {
    await start('assessment/essay');
    const area = field('required').querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => area.focus());
    await type(area, 'alpha\nbeta\n\ngamma');
    expect(JSON.parse(s.get().project.variables.find((v) => v.name === 'required')!.initial as string)).toHaveLength(4);
    await blur(area);
    expect(JSON.parse(s.get().project.variables.find((v) => v.name === 'required')!.initial as string)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('says so, and carries on, when something a field edits has been deleted', async () => {
    const p = await start('assessment/single-choice-set');
    const f = formFields(p.contentForm).find((x) => x.id === 'messageHigh')!;
    await act(async () => s.update((d) => void (d.variables = d.variables.filter((v) => v.id !== (f.bind as { v: string }).v))));
    expect(field('messageHigh').textContent).toContain('has been deleted');
    expect(field('messageMid').querySelector('input')).not.toBeNull();
  });

  it('shows a project with no form a plain note', async () => {
    s = new EditorStore({ ...(projectFromBrandedStarter(BRANDED_STARTERS[0], COLOURWAYS[0])), contentForm: undefined } as Project);
    setCurrentStore(s);
    await act(async () => root.render(<ContentFormPanel />));
    expect(host.textContent).toContain('no fill-in form');
  });
});

describe('the checklist points into the form', () => {
  it('has a Fill in button on each item that has a field, which opens the panel and asks it to focus that field', async () => {
    setDock(() => defaultLayout());
    const p = await start('assessment/single-choice-set', <ChecklistPanel />);
    const linked = p.template!.checklist.filter((i) => i.field);
    expect(linked.length).toBeGreaterThan(3);
    const buttons = [...host.querySelectorAll('ol.checklist li button')].filter((b) => b.textContent === 'Fill in');
    expect(buttons).toHaveLength(linked.length);
    const seen: string[] = [];
    const on = (e: Event) => seen.push((e as CustomEvent<string>).detail);
    window.addEventListener(FILL_IN_FOCUS, on);
    await click(buttons[1]);
    window.removeEventListener(FILL_IN_FOCUS, on);
    expect(seen).toEqual([linked[1].field]);
    expect(getDock().zones.bottom.active).toBe('content');
  });
});
