import { afterEach, beforeEach, describe, expect, it, vi, beforeAll } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';

const db = vi.hoisted(() => ({
  projects: [] as unknown[],
  createProjectRecord: vi.fn(async (_p: unknown) => undefined),
  setProjectMeta: vi.fn(async () => ({ tags: [], folder: null })),
  putAsset: vi.fn(async () => undefined),
}));
vi.mock('../src/lib/db', async (orig) => ({
  ...(await orig<typeof import('../src/lib/db')>()),
  listProjects: async () => db.projects,
  listBin: async () => [],
  session: async () => ({ user: { username: 'me' } }),
  listTemplates: async () => [],
  listExamples: async () => [],
  createProjectRecord: db.createProjectRecord,
  setProjectMeta: db.setProjectMeta,
  putAsset: db.putAsset,
}));
vi.mock('../src/lib/image-export', () => ({ projectThumbnail: async () => null }));
vi.mock('../src/lib/session', () => ({ sessionUser: async () => null, session: async () => null, installSessionHeader: () => undefined }));
vi.mock('../src/lib/palette', async (orig) => ({ ...(await orig<typeof import('../src/lib/palette')>()), whenPaletteReady: async () => undefined }));
vi.mock('../src/lib/starter-pick', async (orig) => ({ ...(await orig<typeof import('../src/lib/starter-pick')>()), starterPlayHtml: async () => '<p>playing</p>' }));

import { Home } from '../src/Home';
import { GettingStarted } from '../src/components/GettingStarted';
import { FIRST_RUN } from '../src/lib/starter-goals';
import { JOBS, jobDone, markJob, wantsEssentials } from '../src/lib/onboarding';
import { prefs, setPrefs } from '../src/lib/prefs';
import { warmStarters, warmHelp } from './lazy-chunks';

//the editor loads these in chunks of their own; the test starts with them in
beforeAll(() => Promise.all([warmStarters(), warmHelp()]));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= class {
  observe() {}
  disconnect() {}
};

let root: Root;
let host: HTMLElement;
let opened: string[] = [];
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
const click = (el: Element | null | undefined) => act(async () => void (el as HTMLElement).click());
const button = (label: string | RegExp) => [...document.querySelectorAll<HTMLElement>('button')].find((b) => (typeof label === 'string' ? b.textContent?.trim() === label : label.test(b.textContent ?? '')));

async function home() {
  await act(async () => root.render(<Home open={(id) => opened.push(id)} />));
  await flush();
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  setPrefs({ onboarding: {}, gettingStarted: true });
  localStorage.removeItem('ix-dock-v1');
  db.projects = [];
  db.createProjectRecord.mockClear();
  db.putAsset.mockClear();
  opened = [];
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = '';
});

describe('the first-run screen', () => {
  it('asks what you want to make on an empty projects page, with the four goals and a blank start', async () => {
    await home();
    expect(host.querySelector('#fr-title')?.textContent).toBe('What do you want to make?');
    const goals = [...host.querySelectorAll('.fr-goal strong')].map((e) => e.textContent);
    expect(goals).toEqual(['Test what learners know', 'Explain something step by step', 'Practise a skill', 'Tell a story or show a picture with clickable spots', 'Start from nothing']);
    expect(host.querySelector('.empty-state')).toBeNull();
    // nothing is made by looking
    expect(db.createProjectRecord).not.toHaveBeenCalled();
  });

  it('does not show to someone who already has projects', async () => {
    db.projects = [{ id: 'a', name: 'Mine', tags: [], updated: '2026-01-01T00:00:00Z', artboards: 1 }];
    await home();
    expect(host.querySelector('.first-run')).toBeNull();
    expect(prefs().onboarding?.welcomed).toBeUndefined();
  });

  it('marks the person as new, so their first project opens in Essentials', async () => {
    await home();
    expect(wantsEssentials()).toBe(true);
  });

  it('a goal suggests one starter with the others to pick from, and Back returns to the goals', async () => {
    await home();
    await click(button(/Test what learners know/));
    expect(host.querySelector('#fr-title')?.textContent).toContain('A good place to start: Multi-page quiz');
    expect(host.textContent).toContain('Other ways to start');
    expect(button('True or false')).toBeTruthy();
    await click(button('True or false'));
    expect(host.querySelector('#fr-title')?.textContent).toBe('Or try: True or false');
    await click(button('Back'));
    expect(host.querySelector('#fr-title')?.textContent).toBe('What do you want to make?');
  });

  it('each goal\'s first suggestion is the one in the map', async () => {
    await home();
    await click(button(/Explain something step by step/));
    expect(host.querySelector('#fr-title')?.textContent).toContain('Step-through explainer');
    expect(FIRST_RUN.explain[0]).toBe('step-explainer');
  });

  it('Try it first plays the starter in memory and saves nothing', async () => {
    await home();
    await click(button(/Test what learners know/));
    await click(button('Try it first'));
    await flush();
    const frame = document.querySelector<HTMLIFrameElement>('.example-play iframe');
    expect(frame?.getAttribute('srcdoc')).toBe('<p>playing</p>');
    expect(db.createProjectRecord).not.toHaveBeenCalled();
    expect(opened).toEqual([]);
  });

  it('Start with it makes the project with its checklist, opens it, and the page does not ask again', async () => {
    await home();
    await click(button(/Explain something step by step/));
    await click(button(/Start with Step-through explainer/));
    await flush();
    expect(db.createProjectRecord).toHaveBeenCalledTimes(1);
    const made = db.createProjectRecord.mock.calls[0][0] as { name: string; template?: { builtin: string; checklist: unknown[] } };
    expect(made.name).toBe('Step-through explainer');
    expect(made.template?.builtin).toBe('step-explainer');
    expect(made.template?.checklist.length).toBeGreaterThan(0);
    expect(opened).toHaveLength(1);
    expect(sessionStorage.length).toBeGreaterThan(0);
    expect(prefs().onboarding?.left).toBe(true);
  });

  it('Start from nothing makes a blank project and opens it', async () => {
    await home();
    await click(button(/^Start from nothing/));
    await flush();
    expect(db.createProjectRecord).toHaveBeenCalledTimes(1);
    expect((db.createProjectRecord.mock.calls[0][0] as { template?: unknown }).template).toBeUndefined();
    expect(opened).toHaveLength(1);
  });

  it('I\'ll look around by myself puts the question away for good and shows the ordinary empty page', async () => {
    await home();
    await click(button(/look around by myself/));
    expect(host.querySelector('.first-run')).toBeNull();
    expect(host.querySelector('.empty-state h2')?.textContent).toBe('No projects yet');
    expect(prefs().onboarding?.left).toBe(true);
    act(() => root.unmount());
    root = createRoot(host);
    await home();
    expect(host.querySelector('.first-run')).toBeNull();
  });

  it('See all the starters goes to the Templates tab', async () => {
    await home();
    await click(button(/Test what learners know/));
    await click(button('See all the starters'));
    await flush();
    expect(host.querySelector('.templates-tab')).not.toBeNull();
    expect(db.createProjectRecord).not.toHaveBeenCalled();
  });
});

describe('the Getting started strip', () => {
  let st: EditorStore;
  beforeEach(() => setCurrentStore((st = new EditorStore(createProject('T')))));
  const strip = () => host.querySelector('.getting-started');
  const render = () => act(async () => root.render(<GettingStarted />));
  const labels = () => [...host.querySelectorAll('.gs-job')].map((b) => b.textContent);

  it('lists the five jobs, none ticked, each a button that names its job', async () => {
    await render();
    expect(labels()).toEqual(['Add a shape', 'Move it', 'Make it do something when clicked', 'Preview it', 'Share it']);
    expect(host.querySelector('.gs-count')?.textContent).toBe('0 of 5');
    expect(host.querySelectorAll('.gs-jobs .done')).toHaveLength(0);
    for (const b of host.querySelectorAll('.gs-job')) expect(b.getAttribute('aria-label')).toMatch(/Opens its tutorial/);
  });

  it('ticks a job as it is done, and says so for a screen reader', async () => {
    await render();
    await act(async () => markJob('shape'));
    expect(host.querySelectorAll('.gs-jobs .done')).toHaveLength(1);
    expect(host.querySelector('.gs-job')?.getAttribute('aria-label')).toContain('done');
    expect(host.querySelector('.gs-count')?.textContent).toBe('1 of 5');
    expect(host.querySelector('[role=status]')?.textContent).toBe('Add a shape: done. 1 of 5.');
  });

  it('a job opens its two-minute tutorial in Help', async () => {
    await render();
    const { helpHistory } = await import('../src/help/Help');
    helpHistory.clear();
    const jobs = [...host.querySelectorAll('.gs-job')];
    await click(jobs[2]);
    expect(helpHistory.current?.id).toBe('tutorial-first-interaction');
    await click(jobs[4]);
    expect(helpHistory.current?.id).toBe('tutorial-publish');
  });

  it('goes away with the x, and stays away', async () => {
    await render();
    await click(host.querySelector('[aria-label="Put the Getting started strip away"]'));
    expect(strip()).toBeNull();
    expect(prefs().onboarding?.dismissed).toBe(true);
    await render();
    expect(strip()).toBeNull();
  });

  it('is off when Preferences says so', async () => {
    setPrefs({ gettingStarted: false });
    await render();
    expect(strip()).toBeNull();
  });

  it('goes for good once every job is ticked, with a word about it', async () => {
    await render();
    for (const j of JOBS) await act(async () => markJob(j.id));
    expect(JOBS.every((j) => jobDone(j.id))).toBe(true);
    expect(strip()).toBeNull();
    expect(st.get().toast?.text).toMatch(/All five jobs done/);
  });
});
