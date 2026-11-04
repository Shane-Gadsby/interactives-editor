import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject } from 'interactives-player';
import { EditorStore, setCurrentStore, useEditor } from '../src/store/store';
import { ReportingSection, patchReporting } from '../src/panels/ReportingSection';
import { ResultsModal } from '../src/components/ProjectModals';
import { CATALOG_BY_KIND } from 'interactives-player';
import { TOPICS, topicBody } from '../src/help/topics';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let s: EditorStore;

function mount(extra: (p: ReturnType<typeof createProject>) => void = () => undefined, ui: () => React.ReactElement = () => <Harness />) {
  const p = createProject('Quiz');
  p.variables.push({ id: 'vs', name: 'score', type: 'number', initial: 0 }, { id: 'vd', name: 'done', type: 'boolean', initial: false });
  extra(p);
  s = new EditorStore(p);
  setCurrentStore(s);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(ui()));
}
function Harness() {
  const project = useEditor((st) => st.project);
  return <ReportingSection project={project} />;
}
const open = () => act(() => (host.querySelector('.section-title') as HTMLElement).click());
const field = (label: string) => Array.from(host.querySelectorAll('label')).find((l) => (l.querySelector('.field-label') ?? l).textContent?.trim() === label) as HTMLElement | undefined;
const pick = (label: string, value: string) => {
  const sel = field(label)!.querySelector('select')!;
  act(() => {
    sel.value = value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const reporting = () => s.get().project.settings.reporting;

afterEach(() => {
  if (root) act(() => root.unmount());
  host?.remove();
  vi.unstubAllGlobals();
});

describe('patchReporting', () => {
  it('drops a key that goes back to nothing, and the whole object when it is empty', () => {
    const p = createProject('x');
    p.settings.reporting = { scoreVariable: 'v', passMark: 80, completion: 'pass' };
    expect(patchReporting(p, { passMark: undefined })).toEqual({ scoreVariable: 'v', completion: 'pass' });
    expect(patchReporting(p, { completion: 'manual' })).toEqual({ scoreVariable: 'v', passMark: 80 });
    p.settings.reporting = { resumeArtboard: true };
    expect(patchReporting(p, { resumeArtboard: undefined })).toBeUndefined();
  });
  it('starts a fresh object', () => {
    expect(patchReporting(createProject('x'), { scoreVariable: 'v' })).toEqual({ scoreVariable: 'v' });
  });
});

describe('Results and progress section', () => {
  it('is closed to begin with and offers only a score variable and completion', () => {
    mount();
    expect(field('Score variable')).toBeUndefined();
    open();
    expect(field('Score variable')).toBeDefined();
    expect(field('Top score')).toBeUndefined();
    expect(field('Pass mark')).toBeUndefined();
    expect(field('Complete when')).toBeDefined();
  });

  it('lists the number variables for the score and writes the choice into the settings', () => {
    mount();
    open();
    const options = Array.from(field('Score variable')!.querySelectorAll('option')).map((o) => o.textContent);
    expect(options).toEqual(['No score', 'score']);
    pick('Score variable', 'vs');
    expect(reporting()).toEqual({ scoreVariable: 'vs' });
    expect(field('Top score')).toBeDefined();
    expect(field('Pass mark')).toBeDefined();
  });

  it('adds a pass mark of 80% and takes it away again, with the score variable going last', () => {
    mount();
    open();
    pick('Score variable', 'vs');
    act(() => field('Pass mark')!.querySelector('input')!.click());
    expect(reporting()).toEqual({ scoreVariable: 'vs', passMark: 80 });
    expect(field('Pass at')).toBeDefined();
    act(() => field('Pass mark')!.querySelector('input')!.click());
    expect(reporting()).toEqual({ scoreVariable: 'vs' });
    pick('Score variable', '');
    expect(reporting()).toBeUndefined();
  });

  it('removing the score also forgets the top score and pass mark', () => {
    mount((p) => (p.settings.reporting = { scoreVariable: 'vs', maxScore: 20, passMark: 50 }));
    open();
    pick('Score variable', '');
    expect(reporting()).toBeUndefined();
  });

  it('asks which artboard or variable completes the project, and clears the other when the rule changes', () => {
    mount((p) => p.artboards.push({ ...p.artboards[0], id: 'end', name: 'End' }));
    open();
    pick('Complete when', 'artboard');
    pick('Artboard', 'end');
    expect(reporting()).toEqual({ completion: 'artboard', completionArtboard: 'end' });
    pick('Complete when', 'variable');
    expect(reporting()).toEqual({ completion: 'variable' });
    pick('Variable', 'vd');
    expect(reporting()).toEqual({ completion: 'variable', completionVariable: 'vd' });
    pick('Complete when', 'manual');
    expect(reporting()).toBeUndefined();
  });

  it('warns when completing on a pass has nothing to pass', () => {
    mount();
    open();
    pick('Complete when', 'pass');
    expect(host.textContent).toContain('this never completes');
    pick('Score variable', 'vs');
    act(() => field('Pass mark')!.querySelector('input')!.click());
    expect(host.textContent).not.toContain('this never completes');
  });

  it('resumes on the same artboard when ticked, and counts remembered variables', () => {
    mount((p) => (p.variables[0].persist = true));
    open();
    act(() => field('Resume on the same artboard')!.querySelector('input')!.click());
    expect(reporting()).toEqual({ resumeArtboard: true });
    expect(host.textContent).toContain('1 variable is remembered');
  });

  it('every change undoes', () => {
    mount();
    open();
    pick('Score variable', 'vs');
    act(() => s.undo());
    expect(reporting()).toBeUndefined();
  });
});

describe('Results view', () => {
  const sample = {
    learners: 2,
    records: 3,
    completed: 2,
    completionRate: 66.67,
    passed: 2,
    scored: 3,
    passRate: 66.67,
    averageBestPercent: 56.67,
    averageAttempts: 1.33,
    courses: [
      { course: 'MAT1000', learners: 2, completed: 1 },
      { course: 'PHY2000', learners: 1, completed: 1 },
    ],
    list: [
      { username: 'sam', name: 'Sam S', course: 'MAT1000', attempts: 2, completed: true, passed: true, bestPercent: 90, lastPercent: 80, updated: '2026-11-04T01:00:00Z' },
      { username: 'lee', name: null, course: null, attempts: 1, completed: false, passed: false, bestPercent: 30, lastPercent: 30, updated: null },
    ],
    truncated: false,
    shared: true,
  };
  const fetchWith = (body: unknown, status = 200) => {
    const fn = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fn);
    return fn;
  };
  const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

  it('shows the totals and a row for each learner', async () => {
    const fn = fetchWith(sample);
    mount(() => undefined, () => <ResultsModal onClose={() => undefined} />);
    await flush();
    expect(String((fn.mock.calls[0] as unknown[])[0])).toMatch(/projects\/.+\/results$/);
    const tiles = host.querySelector('.result-tiles')!.textContent!;
    expect(tiles).toContain('66.7%');
    expect(tiles).toContain('56.7%');
    expect(host.textContent).toContain('MAT1000: 2 learners, 1 completed');
    const rows = Array.from(host.querySelectorAll('.results-table tbody tr')).map((r) => Array.from(r.querySelectorAll('td')).map((c) => c.textContent));
    expect(rows[0]).toEqual(['Sam S (sam)', 'MAT1000', 'Passed', '90%', '80%', '2', expect.any(String)]);
    expect(rows[1].slice(0, 6)).toEqual(['lee', '–', 'In progress', '30%', '30%', '1']);
  });

  it('says so when nobody has played, and when there is no share link', async () => {
    fetchWith({ ...sample, records: 0, learners: 0, list: [], courses: [], shared: false });
    mount(() => undefined, () => <ResultsModal onClose={() => undefined} />);
    await flush();
    expect(host.textContent).toContain('Nobody has played it');
    expect(host.textContent).toContain('There is none on yet');
    expect((Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Clear results') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the server error instead of numbers', async () => {
    fetchWith({ error: 'That project belongs to someone else' }, 403);
    mount(() => undefined, () => <ResultsModal onClose={() => undefined} />);
    await flush();
    expect(host.querySelector('.error')!.textContent).toBe('That project belongs to someone else');
  });
});

describe('help and catalog', () => {
  it('has a help topic for results, and the nodes are in the catalog', () => {
    expect(TOPICS.some((t) => t.id === 'results')).toBe(true);
    expect(topicBody(TOPICS.find((t) => t.id === 'results')!)).toContain('Report result');
    expect(CATALOG_BY_KIND['action.reportResult']).toBeDefined();
    expect(CATALOG_BY_KIND['action.startOver']).toBeDefined();
  });
});
