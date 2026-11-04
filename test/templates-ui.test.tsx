import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { baselineOf } from '../src/lib/templates';

const db = vi.hoisted(() => ({
  templates: [
    { id: 'tpmine0001', name: 'My quiz', description: 'For week 3', owner: { username: 'me', name: 'Me' }, version: 2, created: '2026-01-01T00:00:00Z', updated: '2026-01-02T00:00:00Z', mine: true, everyone: false, checklist: [{ id: 'c1', text: 'Replace the question text' }], artboards: 1, preview: null, thumb: null, history: [] },
    { id: 'tpothr0001', name: 'Their cards', description: '', owner: { username: 'ann', name: 'Ann' }, version: 1, created: '2026-01-01T00:00:00Z', updated: '2026-01-02T00:00:00Z', mine: false, everyone: true, checklist: [], artboards: 1, preview: null, thumb: null, history: [] },
  ] as Record<string, unknown>[],
  examples: [
    { key: 'lamp', title: 'Lamp', description: 'A bulb', group: 'Getting started', tags: ['tutorial'], artboards: 1, preview: null },
    { key: 'blends', title: 'Blends', description: 'A ball', group: 'Animation', tags: [], artboards: 1, preview: null },
  ] as Record<string, unknown>[],
  useTemplate: vi.fn(async () => 'prnew00001'),
  useExample: vi.fn(async () => 'prnew00002'),
  createProjectRecord: vi.fn(async () => undefined),
  setProjectMeta: vi.fn(async () => ({ tags: [], folder: null })),
  deleteTemplate: vi.fn(async () => ({ ok: true })),
  saveAsTemplate: vi.fn(async () => ({ ok: true, id: 'tpnew00001', unchanged: false, version: 1 })),
  latest: 3,
}));
vi.mock('../src/lib/db', async (orig) => ({
  ...(await orig<typeof import('../src/lib/db')>()),
  listTemplates: async () => db.templates,
  listExamples: async () => db.examples,
  getTemplate: async () => ({ ...db.templates[0], version: db.latest }),
  useTemplate: db.useTemplate,
  useExample: db.useExample,
  createProjectRecord: db.createProjectRecord,
  setProjectMeta: db.setProjectMeta,
  deleteTemplate: db.deleteTemplate,
  saveAsTemplate: db.saveAsTemplate,
}));
vi.mock('../src/lib/image-export', () => ({ projectThumbnail: async () => null }));
const confirm = vi.hoisted(() => ({ answer: true }));
vi.mock('../src/components/dialogs', () => ({ confirmDialog: async () => confirm.answer, promptDialog: async () => null, DialogHost: () => null }));

import { TemplatesTab } from '../src/components/TemplatesTab';
import { ChecklistPanel } from '../src/panels/ChecklistPanel';
import { SaveTemplateModal } from '../src/components/TemplateModals';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
const opened: string[] = [];
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
const click = (el: Element | null | undefined) => act(async () => void (el as HTMLElement).click());
const text = () => host.textContent ?? '';
const byText = (sel: string, t: string) => [...document.querySelectorAll<HTMLElement>(sel)].find((e) => e.textContent?.includes(t));
const typeInto = (el: HTMLInputElement, v: string) =>
  act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

beforeEach(() => {
  for (const k of ['createProjectRecord', 'setProjectMeta', 'useTemplate', 'useExample', 'deleteTemplate', 'saveAsTemplate'] as const) db[k].mockClear();
  opened.length = 0;
  sessionStorage.clear();
  localStorage.clear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = '';
});

const mountTab = async (folder: string | null = null) => {
  await act(async () => root.render(<TemplatesTab folder={folder} folders={['Maths', 'Art']} open={(id) => opened.push(id)} />));
  await flush();
};

describe('the Templates tab', () => {
  it('counts each group and opens on yours when there is something there', async () => {
    await mountTab();
    const tabs = [...host.querySelectorAll('[role=tab]')].map((t) => t.textContent);
    expect(tabs).toEqual(['Mine 1', 'Shared 1', 'Examples 2', 'Built-in 6'].sort((a, b) => ['Mine', 'Shared', 'Built-in', 'Examples'].indexOf(a.split(' ')[0]) - ['Mine', 'Shared', 'Built-in', 'Examples'].indexOf(b.split(' ')[0])));
    expect(host.querySelector('[aria-selected=true]')?.textContent).toContain('Mine');
    expect(text()).toContain('My quiz');
    expect(text()).toContain('For week 3');
    expect(text()).toContain('Only you');
    expect(text()).not.toContain('Their cards');
  });

  it('Shared shows what others let everyone use, without edit or delete', async () => {
    await mountTab();
    await click(byText('[role=tab]', 'Shared'));
    expect(text()).toContain('Their cards');
    expect(text()).toContain('by Ann');
    expect(host.querySelector('[aria-label^="Delete"]')).toBeNull();
    await click(byText('[role=tab]', 'Mine'));
    expect(host.querySelector('[aria-label="Delete My quiz"]')).not.toBeNull();
  });

  it('Built-in lists the six starters', async () => {
    await mountTab();
    await click(byText('[role=tab]', 'Built-in'));
    const names = [...host.querySelectorAll('.template-card .project-name')].map((e) => e.textContent);
    expect(names).toEqual(['Quiz', 'Step-through explainer', 'Flip cards', 'Drag and drop sorting', 'Branching story', 'Animated timeline intro']);
  });

  it('using a saved template shows its checklist, then makes the project in the folder and opens it with the checklist flag', async () => {
    await mountTab('Maths');
    await click(host.querySelector('.template-card .btn.primary'));
    expect(document.body.textContent).toContain('Replace the question text');
    expect((document.querySelector('.modal select') as HTMLSelectElement).value).toBe('Maths');
    await typeInto(document.querySelector('.modal input') as HTMLInputElement, 'Week 3 quiz');
    await click(byText('.modal .btn.primary', 'Create project'));
    await flush();
    expect(db.useTemplate).toHaveBeenCalledWith('tpmine0001', { name: 'Week 3 quiz', folder: 'Maths' });
    expect(opened).toEqual(['prnew00001']);
    expect(sessionStorage.getItem('ix.checklist.open')).toBe('prnew00001');
  });

  it('using a built-in starter creates the project in the browser with its checklist and the folder', async () => {
    await mountTab('Maths');
    await click(byText('[role=tab]', 'Built-in'));
    await click(host.querySelector('.template-card .btn.primary'));
    await click(byText('.modal .btn.primary', 'Create project'));
    await flush();
    expect(db.createProjectRecord).toHaveBeenCalledTimes(1);
    const p = (db.createProjectRecord.mock.calls[0] as unknown as [Project])[0];
    expect(p.name).toBe('Quiz');
    expect(p.template?.builtin).toBe('quiz');
    expect(p.template?.checklist.length).toBeGreaterThan(3);
    expect(db.setProjectMeta).toHaveBeenCalledWith(p.id, { folder: 'Maths' });
    expect(opened).toEqual([p.id]);
    expect(sessionStorage.getItem('ix.checklist.open')).toBe(p.id);
  });

  it('a failed copy shows the reason and keeps the window', async () => {
    db.useTemplate.mockRejectedValueOnce(new Error('That template is not shared with you'));
    await mountTab();
    await click(host.querySelector('.template-card .btn.primary'));
    await click(byText('.modal .btn.primary', 'Create project'));
    await flush();
    expect(document.querySelector('.modal .error')?.textContent).toContain('not shared with you');
    expect(opened).toEqual([]);
  });

  it('deleting asks first', async () => {
    await mountTab();
    confirm.answer = false;
    await click(host.querySelector('[aria-label="Delete My quiz"]'));
    expect(db.deleteTemplate).not.toHaveBeenCalled();
    confirm.answer = true;
    await click(host.querySelector('[aria-label="Delete My quiz"]'));
    await flush();
    expect(db.deleteTemplate).toHaveBeenCalledWith('tpmine0001');
    expect(text()).not.toContain('My quiz');
  });

  it('Examples are grouped, play without creating anything, and a copy is made from the example without a checklist', async () => {
    await mountTab('Art');
    await click(byText('[role=tab]', 'Examples'));
    expect([...host.querySelectorAll('.example-group h3')].map((h) => h.textContent)).toEqual(['Getting started', 'Animation']);
    expect(host.querySelector('.example-card .btn.primary')?.textContent).toBe('Make my copy');
    await click(host.querySelector('.example-card .btn.primary'));
    expect(document.body.textContent).toContain('stays as it is for everyone');
    await click(byText('.modal .btn.primary', 'Make my copy'));
    await flush();
    expect(db.useExample).toHaveBeenCalledWith('lamp', { name: 'Lamp', folder: 'Art' });
    expect(db.createProjectRecord).not.toHaveBeenCalled();
    expect(opened).toEqual(['prnew00002']);
    expect(sessionStorage.getItem('ix.checklist.open')).toBeNull();
  });

  it('no templates of yours: says how to make one and points at the starters', async () => {
    db.templates = [];
    try {
      await mountTab();
      expect(host.querySelector('[aria-selected=true]')?.textContent).toContain('Built-in');
      await click(byText('[role=tab]', 'Mine'));
      expect(text()).toContain('Share > Save as template');
    } finally {
      db.templates = [
        { id: 'tpmine0001', name: 'My quiz', description: 'For week 3', owner: { username: 'me', name: 'Me' }, version: 2, created: '2026-01-01T00:00:00Z', updated: '2026-01-02T00:00:00Z', mine: true, everyone: false, checklist: [{ id: 'c1', text: 'Replace the question text' }], artboards: 1, preview: null, thumb: null, history: [] },
      ];
    }
  });
});

function fromTemplate(): Project {
  const p = createProject('From a template');
  p.artboards[0].children.push(createNode('text', { id: 't1', name: 'Title', text: 'Title here' }), createNode('text', { id: 't2', name: 'Body', text: 'Body here' }));
  p.template = {
    id: 'tpmine0001',
    name: 'My quiz',
    version: 2,
    base: baselineOf(p),
    checklist: [
      { id: 'c1', text: 'Replace the title', artboardId: p.artboards[0].id, nodeId: 't1', done: false },
      { id: 'c2', text: 'Rewrite the body', artboardId: p.artboards[0].id, nodeId: 't2', done: false },
      { id: 'c3', text: 'Pick colours', done: false },
    ],
  };
  return p;
}

describe('the checklist panel', () => {
  let s: EditorStore;
  const mount = async (p: Project) => {
    s = new EditorStore(p);
    setCurrentStore(s);
    await act(async () => root.render(<ChecklistPanel />));
    await flush();
  };
  const items = () => [...host.querySelectorAll('.checklist li')];

  it('lists the items with progress, and ticking one is a document change', async () => {
    await mount(fromTemplate());
    expect(items()).toHaveLength(3);
    expect(text()).toContain('0 of 3 done');
    await click(items()[2].querySelector('input'));
    expect(s.get().project.template!.checklist[2].done).toBe(true);
    expect(text()).toContain('1 of 3 done');
    expect(items()[2].classList.contains('done')).toBe(true);
    await act(async () => s.undo());
    await flush();
    expect(s.get().project.template!.checklist[2].done).toBe(false);
  });

  it('clicking an item selects the layer it is about', async () => {
    await mount(fromTemplate());
    await click(items()[1].querySelector('.checklist-text'));
    expect(s.get().selection).toEqual(['t2']);
  });

  it('a general item is not a link', async () => {
    await mount(fromTemplate());
    expect((items()[2].querySelector('.checklist-text') as HTMLButtonElement).disabled).toBe(true);
  });

  it('flags a layer that is still the template\'s, and one that was deleted', async () => {
    await mount(fromTemplate());
    expect(items()[0].textContent).toContain('Still the template');
    act(() =>
      s.update((d) => {
        (d.artboards[0].children[0] as { text: string }).text = 'Mine';
        d.artboards[0].children.pop();
      }),
    );
    await flush();
    expect(items()[0].textContent).not.toContain('Still the template');
    expect(items()[1].textContent).toContain('Layer deleted');
  });

  it('offers the update only when the saved template has a newer version', async () => {
    db.latest = 2;
    await mount(fromTemplate());
    expect(text()).not.toContain('Update available');
    act(() => root.unmount());
    root = createRoot(host);
    db.latest = 3;
    await mount(fromTemplate());
    expect(text()).toContain('Update available: v3');
  });

  it('Review lists what is left, and marking it reviewed is recorded', async () => {
    await mount(fromTemplate());
    await click(byText('.btn.primary', 'Review'));
    const modal = document.querySelector('.modal')!;
    expect(modal.textContent).toContain('Not ticked yet');
    expect(modal.textContent).toContain('Replace the title');
    await click(byText('.modal .btn.primary', 'Mark as reviewed anyway'));
    expect(s.get().project.template!.reviewed).toBeTruthy();
    expect(text()).toContain('Reviewed');
  });

  it('Remove takes the link away after asking', async () => {
    await mount(fromTemplate());
    confirm.answer = false;
    await click(byText('.btn', 'Remove'));
    expect(s.get().project.template).toBeTruthy();
    confirm.answer = true;
    await click(byText('.btn', 'Remove'));
    expect(s.get().project.template).toBeUndefined();
  });
});

describe('Save as template', () => {
  it('sends the title, description, visibility and a checklist item pointed at the selected layer', async () => {
    const p = fromTemplate();
    delete p.template;
    const s = new EditorStore(p);
    setCurrentStore(s);
    s.select(['t1']);
    await act(async () => root.render(<SaveTemplateModal onClose={() => undefined} />));
    await flush();
    const inputs = () => [...document.querySelectorAll<HTMLInputElement>('.modal input[type=text], .modal input:not([type])')];
    await typeInto(inputs()[0], 'Cards template');
    await typeInto(document.querySelector('.checklist-editor .cl-add input') as HTMLInputElement, 'Replace the heading');
    await click(byText('.cl-add .btn', 'Add'));
    await click(byText('.checklist-editor .btn.small', 'Link'));
    await click(document.querySelector('.modal input[type=checkbox]'));
    await click(byText('.modal .btn.primary', 'Save template'));
    await flush();
    expect(db.saveAsTemplate).toHaveBeenCalledTimes(1);
    const [id, body] = db.saveAsTemplate.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(id).toBe(p.id);
    expect(body).toMatchObject({ name: 'Cards template', everyone: true, templateId: undefined });
    expect(body.checklist).toEqual([{ text: 'Replace the heading', nodeId: 't1', artboardId: p.artboards[0].id }]);
  });

  it('can add one item for each selected layer', async () => {
    const p = fromTemplate();
    delete p.template;
    const s = new EditorStore(p);
    setCurrentStore(s);
    s.select(['t1', 't2']);
    await act(async () => root.render(<SaveTemplateModal onClose={() => undefined} />));
    await flush();
    await click(byText('.cl-add .btn', 'Add for the 2 selected layers'));
    const rows = [...document.querySelectorAll<HTMLInputElement>('.checklist-editor li input')].map((i) => i.value);
    expect(rows).toEqual(['Change "Title"', 'Change "Body"']);
  });
});
