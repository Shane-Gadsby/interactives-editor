import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const db = vi.hoisted(() => ({
  projects: [
    { id: 'pa', name: 'In folder', folder: 'Maths', tags: ['quiz'], updated: '2026-01-01T00:00:00Z', artboards: 1, thumb: null },
    { id: 'pb', name: 'Loose', folder: null, tags: [], updated: '2026-01-02T00:00:00Z', artboards: 2, thumb: null },
  ] as Record<string, unknown>[],
  templates: [
    { id: 'tpmine0001', name: 'My quiz', description: 'For week 3', owner: { username: 'me', name: 'Me' }, version: 2, created: '2026-01-01T00:00:00Z', updated: '2026-01-02T00:00:00Z', mine: true, everyone: false, checklist: [{ id: 'c1', text: 'Replace the question text' }], artboards: 1, preview: null, thumb: null, history: [] },
    { id: 'tpothr0001', name: 'Their cards', description: 'Flip cards', owner: { username: 'ann', name: 'Ann' }, version: 1, created: '2026-01-01T00:00:00Z', updated: '2026-01-02T00:00:00Z', mine: false, everyone: true, checklist: [], artboards: 1, preview: null, thumb: null, history: [] },
  ] as Record<string, unknown>[],
  examples: [
    { key: 'lamp', title: 'Lamp', description: 'A bulb', group: 'Getting started', tags: ['tutorial'], artboards: 1, preview: null },
    { key: 'blends', title: 'Blends', description: 'A ball', group: 'Animation', tags: [], artboards: 1, preview: null },
  ] as Record<string, unknown>[],
  duplicateProject: vi.fn(async (_id: string, _name?: string) => 'prdup00001'),
  useTemplate: vi.fn(async (_id: string, _o: unknown) => 'prtpl00001'),
  useExample: vi.fn(async (_k: string, _o: unknown) => 'prex000001'),
  createProjectRecord: vi.fn(async (_p: { name: string }) => undefined),
  setProjectMeta: vi.fn(async (_id: string, patch: { folder?: string | null }) => ({ tags: [], folder: patch.folder ?? null })),
}));
vi.mock('../src/lib/db', async (orig) => ({
  ...(await orig<typeof import('../src/lib/db')>()),
  listProjects: async () => db.projects,
  session: async () => ({ user: { username: 'me' } }),
  listTemplates: async () => db.templates,
  listExamples: async () => db.examples,
  duplicateProject: db.duplicateProject,
  useTemplate: db.useTemplate,
  useExample: db.useExample,
  createProjectRecord: db.createProjectRecord,
  setProjectMeta: db.setProjectMeta,
}));
vi.mock('../src/lib/image-export', () => ({ projectThumbnail: async () => null }));
vi.mock('../src/lib/session', () => ({ sessionUser: async () => null }));

import { Home } from '../src/Home';
import { loadCatalog } from '../src/lib/font-catalog';
import { CHECKLIST_FLAG } from '../src/lib/templates';
import { TOPICS, topicBody } from '../src/help/topics';
import { TUTORIALS } from '../src/help/tutorials';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
const opened: string[] = [];
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
const click = (el: Element | null | undefined) => act(async () => void (el as HTMLElement).click());
const dlg = () => document.querySelector<HTMLElement>('.np-modal');
const tabs = () => [...document.querySelectorAll<HTMLElement>('.np-modal [role=tab]')];
const tab = (label: string) => tabs().find((t) => t.textContent?.includes(label))!;
const options = () => [...document.querySelectorAll<HTMLElement>('.np-modal [role=option]')];
const option = (label: string) => options().find((o) => o.textContent?.includes(label))!;
const nameBox = () => document.querySelector<HTMLInputElement>('.np-name input')!;
const create = () => click(document.querySelector('.np-buttons .btn.primary'));
const press = (el: Element, key: string, init: KeyboardEventInit = {}) => act(async () => void el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })));
const typeInto = (el: HTMLInputElement, v: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
const folderButton = (name: string) => [...host.querySelectorAll<HTMLButtonElement>('.folder-item')].find((b) => b.textContent?.includes(name));
const openChooser = async () => {
  await click(host.querySelector('.home-actions .btn.primary'));
  await flush();
};

beforeEach(async () => {
  await loadCatalog();
  for (const f of [db.duplicateProject, db.useTemplate, db.useExample, db.createProjectRecord, db.setProjectMeta]) f.mockClear();
  opened.length = 0;
  sessionStorage.clear();
  localStorage.clear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<Home open={(id) => opened.push(id)} />));
  await flush();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('Start a new project', () => {
  it('New project and the + card both open the chooser, with its four choices', async () => {
    expect(dlg()).toBeNull();
    await openChooser();
    expect(dlg()!.getAttribute('role')).toBe('dialog');
    expect(dlg()!.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById('np-title')!.textContent).toBe('Start a new project');
    expect(tabs().map((t) => t.querySelector('.np-tab-label')!.textContent)).toEqual(['Blank project', 'Copy a project or template', 'Built-in template', 'Copy an example']);
    expect(db.createProjectRecord).not.toHaveBeenCalled();
    await press(document.body, 'Escape');
    expect(dlg()).toBeNull();
    await click(host.querySelector('.new-thumb'));
    await flush();
    expect(dlg()).not.toBeNull();
  });

  it('Blank takes a name and the folder being looked at, and opens the project', async () => {
    await click(folderButton('Maths'));
    await openChooser();
    expect(nameBox().value).toBe('Untitled project');
    expect(document.querySelector<HTMLSelectElement>('.np-folder select')!.value).toBe('Maths');
    await typeInto(nameBox(), 'Week 1');
    await create();
    await flush();
    expect(db.createProjectRecord).toHaveBeenCalledTimes(1);
    expect(db.createProjectRecord.mock.calls[0][0].name).toBe('Week 1');
    expect(db.setProjectMeta).toHaveBeenCalledWith(opened[0], { folder: 'Maths' });
    expect(opened).toHaveLength(1);
  });

  it('the folder can be changed in the chooser, and No folder keeps it out of the one being looked at', async () => {
    await click(folderButton('Maths'));
    await openChooser();
    const sel = document.querySelector<HTMLSelectElement>('.np-folder select')!;
    await act(async () => {
      sel.value = '';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await create();
    await flush();
    expect(db.setProjectMeta).not.toHaveBeenCalled();
    expect(opened).toHaveLength(1);
  });

  it('Copy a project or template lists mine, my templates and shared ones, and search filters them', async () => {
    await openChooser();
    await click(tab('Copy a project'));
    await flush();
    expect(options().map((o) => o.querySelector('.np-opt-name')!.textContent)).toEqual(['In folder', 'Loose', 'My quiz', 'Their cards']);
    const search = document.querySelector<HTMLInputElement>('.np-search')!;
    await typeInto(search, 'cards');
    expect(options().map((o) => o.querySelector('.np-opt-name')!.textContent)).toEqual(['Their cards']);
    await typeInto(search, 'quiz');
    //the tag on a project counts as well as the name of a template
    expect(options().map((o) => o.querySelector('.np-opt-name')!.textContent)).toEqual(['In folder', 'My quiz']);
    await typeInto(search, 'zzz');
    expect(options()).toHaveLength(0);
    expect(dlg()!.textContent).toContain('Nothing matches');
  });

  it('copying a project names it "Copy of ..." and puts it in the chosen folder', async () => {
    await openChooser();
    await click(tab('Copy a project'));
    await flush();
    expect((document.querySelector('.np-buttons .btn.primary') as HTMLButtonElement).disabled).toBe(true);
    await click(option('Loose'));
    expect(nameBox().value).toBe('Copy of Loose');
    expect(option('Loose').getAttribute('aria-selected')).toBe('true');
    await create();
    await flush();
    expect(db.duplicateProject).toHaveBeenCalledWith('pb', 'Copy of Loose');
    expect(db.setProjectMeta).toHaveBeenCalledWith('prdup00001', { folder: null });
    expect(opened).toEqual(['prdup00001']);
  });

  it('a name typed by hand survives picking something else; an untouched one follows the pick', async () => {
    await openChooser();
    await click(tab('Copy a project'));
    await flush();
    await click(option('Loose'));
    await click(option('In folder'));
    expect(nameBox().value).toBe('Copy of In folder');
    await typeInto(nameBox(), 'Mine now');
    await click(option('Loose'));
    expect(nameBox().value).toBe('Mine now');
  });

  it('copying a template of mine uses it, shows its checklist note and opens the checklist', async () => {
    await openChooser();
    await click(tab('Copy a project'));
    await flush();
    await click(option('My quiz'));
    expect(dlg()!.querySelector('.np-detail')!.textContent).toContain('Replace the question text');
    await create();
    await flush();
    expect(db.useTemplate).toHaveBeenCalledWith('tpmine0001', { name: 'My quiz', folder: null });
    expect(sessionStorage.getItem(CHECKLIST_FLAG)).toBe('prtpl00001');
    expect(opened).toEqual(['prtpl00001']);
  });

  it('Built-in template shows the six starters as cards and makes a project from one', async () => {
    await openChooser();
    await click(tab('Built-in'));
    await flush();
    expect(options()).toHaveLength(6);
    expect(dlg()!.querySelectorAll('.np-thumb')).toHaveLength(6);
    await click(options()[0]);
    const nm = nameBox().value;
    expect(nm).toBeTruthy();
    await create();
    await flush();
    expect(db.createProjectRecord).toHaveBeenCalledTimes(1);
    expect(db.createProjectRecord.mock.calls[0][0].name).toBe(nm);
    expect(sessionStorage.getItem(CHECKLIST_FLAG)).toBe(opened[0]);
  });

  it('Copy an example lists them by group and makes the user their copy, with no checklist', async () => {
    await openChooser();
    await click(tab('Copy an example'));
    await flush();
    expect([...dlg()!.querySelectorAll('.np-group h4')].map((h) => h.textContent)).toEqual(['Getting started 1', 'Animation 1']);
    await typeInto(document.querySelector<HTMLInputElement>('.np-search')!, 'bulb');
    expect(options().map((o) => o.querySelector('.np-opt-name')!.textContent)).toEqual(['Lamp']);
    await click(option('Lamp'));
    await create();
    await flush();
    expect(db.useExample).toHaveBeenCalledWith('lamp', { name: 'Lamp', folder: null });
    expect(sessionStorage.getItem(CHECKLIST_FLAG)).toBeNull();
    expect(opened).toEqual(['prex000001']);
  });

  it('a failure shows in the chooser and leaves it open to try again', async () => {
    db.useExample.mockRejectedValueOnce(new Error('server said no'));
    await openChooser();
    await click(tab('Copy an example'));
    await flush();
    await click(option('Lamp'));
    await create();
    await flush();
    expect(dlg()!.querySelector('[role=alert]')!.textContent).toBe('server said no');
    expect(opened).toHaveLength(0);
    expect((document.querySelector('.np-buttons .btn.primary') as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('keyboard and screen reader behaviour', () => {
  it('the choices are a tablist: arrows move between them, one is in the tab order, each labels its panel', async () => {
    await openChooser();
    expect(document.querySelector('.np-nav')!.getAttribute('role')).toBe('tablist');
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1, -1]);
    expect(document.activeElement).toBe(tab('Blank'));
    await press(tab('Blank'), 'ArrowDown');
    expect(tab('Copy a project').getAttribute('aria-selected')).toBe('true');
    expect(tabs().map((t) => t.tabIndex)).toEqual([-1, 0, -1, -1]);
    expect(document.querySelector('[role=tabpanel]')!.getAttribute('aria-labelledby')).toBe(tab('Copy a project').id);
    await press(tab('Copy a project'), 'End');
    expect(tab('Copy an example').getAttribute('aria-selected')).toBe('true');
    await press(tab('Copy an example'), 'ArrowDown');
    expect(tab('Blank').getAttribute('aria-selected')).toBe('true');
    await press(tab('Blank'), 'ArrowUp');
    expect(tab('Copy an example').getAttribute('aria-selected')).toBe('true');
  });

  it('options are a listbox with one tab stop; arrows move the pick, Enter on the pick makes the project', async () => {
    await openChooser();
    await click(tab('Built-in'));
    await flush();
    expect(options().filter((o) => o.tabIndex === 0)).toHaveLength(1);
    expect(dlg()!.querySelector('[role=listbox]')).not.toBeNull();
    const first = options()[0];
    first.focus();
    await press(first, ' ');
    expect(first.getAttribute('aria-selected')).toBe('true');
    await press(first, 'ArrowRight');
    expect(options()[1].getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(options()[1]);
    expect(options().filter((o) => o.tabIndex === 0)).toEqual([options()[1]]);
    await press(options()[1], 'End');
    expect(options()[5].getAttribute('aria-selected')).toBe('true');
    await press(options()[5], 'Home');
    expect(options()[0].getAttribute('aria-selected')).toBe('true');
    await press(options()[0], 'Enter');
    await flush();
    expect(db.createProjectRecord).toHaveBeenCalledTimes(1);
  });

  it('Enter in the name box makes the project', async () => {
    await openChooser();
    await press(nameBox(), 'Enter');
    await flush();
    expect(db.createProjectRecord).toHaveBeenCalledTimes(1);
    expect(opened).toHaveLength(1);
  });

  it('Escape closes the chooser, makes nothing and gives focus back', async () => {
    const opener = host.querySelector<HTMLElement>('.home-actions .btn.primary')!;
    opener.focus();
    await openChooser();
    expect(dlg()).not.toBeNull();
    await press(nameBox(), 'Escape');
    expect(dlg()).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(db.createProjectRecord).not.toHaveBeenCalled();
  });

  it('Tab stays inside the dialog', async () => {
    await openChooser();
    const focusable = [...dlg()!.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])')];
    const last = focusable[focusable.length - 1];
    last.focus();
    await press(last, 'Tab');
    expect(document.activeElement).toBe(focusable[0]);
    await press(focusable[0], 'Tab', { shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('the search box and result count are labelled for a screen reader', async () => {
    await openChooser();
    await click(tab('Built-in'));
    await flush();
    const search = document.querySelector<HTMLInputElement>('.np-search')!;
    expect(search.getAttribute('aria-label')).toMatch(/Search/);
    expect(dlg()!.querySelector('[role=status]')!.textContent).toBe('6 choices');
    await typeInto(search, 'quiz');
    expect(dlg()!.querySelector('[role=status]')!.textContent).toMatch(/^\d+ choices?$/);
  });
});

describe('help describes the chooser', () => {
  const body = (id: string) => topicBody(TOPICS.find((t) => t.id === id)!);
  it('the projects, templates and welcome topics and tutorial 1 mention it', () => {
    expect(body('projects')).toMatch(/Start a new project/);
    expect(body('projects')).toMatch(/Blank project/);
    expect(body('templates')).toMatch(/Start a new project/);
    expect(body('welcome')).toMatch(/Start a new project/);
    const t1 = TUTORIALS.find((t) => t.id === 'tutorial-first-animation')!;
    expect(t1.body).toMatch(/Blank project/);
  });
});
