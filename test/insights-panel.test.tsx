import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject, CATALOG_BY_KIND } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { InsightsPanel } from '../src/panels/InsightsPanel';
import { RecordsSection, patchRecords } from '../src/panels/RecordsSection';
import { funnel, heatFor, insightsCsv, questionRows, stepRows } from '../src/lib/insights';
import { addQuestion } from '../src/lib/question-kit';
import { useEditor } from '../src/store/store';
import type { Insights } from '../src/lib/db';
import { TOPICS, topicBody } from '../src/help/topics';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let s: EditorStore;

/** A project with a start artboard "Intro", a second "Quiz" holding one question, and a third "End". */
function project() {
  const p = createProject('Course');
  p.id = 'prins001';
  p.artboards[0].id = 'ab1';
  p.artboards[0].name = 'Intro';
  p.settings.startArtboardId = 'ab1';
  const quiz = createProject('q').artboards[0];
  quiz.id = 'ab2';
  quiz.name = 'Quiz';
  const end = createProject('e').artboards[0];
  end.id = 'ab3';
  end.name = 'End';
  p.artboards.push(quiz, end);
  addQuestion(p, 'ab2', 'single');
  const q = (quiz.children.find((n) => n.type === 'frame' && n.question) as { question: { prefix: string; prompt: string; options: { id: string; text: string; correct?: boolean }[] } }).question;
  q.prompt = 'Which planet is largest?';
  q.options.forEach((o, i) => {
    o.text = ['Mars', 'Jupiter', 'Venus', 'Earth'][i] ?? o.text;
    o.correct = i === 1;
  });
  return { p, prefix: q.prefix };
}

const data = (prefix: string): Insights => ({
  records: 40,
  learners: 8,
  visits: 11,
  first: 1,
  last: 2,
  truncated: false,
  days: 30,
  shared: true,
  artboards: [
    { id: 'ab2', name: 'Quiz', views: 6, learners: 6 },
    { id: 'ab1', name: 'Intro', views: 11, learners: 8 },
    { id: 'gone', name: 'Old page', views: 1, learners: 1 },
  ],
  clicks: {
    total: 9,
    positioned: 8,
    onLayers: 5,
    cell: 20,
    artboards: [{ id: 'ab1', name: 'Intro', clicks: 9, cells: [{ x: 40, y: 60, n: 6 }, { x: 200, y: 100, n: 2 }] }],
    layers: [{ artboard: 'ab1', layer: 'go', label: 'Start button', clicks: 5, learners: 4 }],
  },
  steps: [
    { artboard: 'ab1', name: 'Intro', step: 1, steps: 3, visits: 5, learners: 5 },
    { artboard: 'ab1', name: 'Intro', step: 3, steps: 3, visits: 2, learners: 2 },
  ],
  questions: [{ question: prefix, kind: 'single', checks: 10, correct: 4, learners: 6, firstTry: 6, firstTryRight: 2, options: [{ id: 'o2', n: 5 }, { id: 'o1', n: 4 }] }, { question: 'q99', kind: 'blank', checks: 2, correct: 1, learners: 2, firstTry: 2, firstTryRight: 1, options: [] }],
  custom: [{ name: 'opened hint', count: 7, learners: 5, values: [{ value: '=HYPERLINK("x")', n: 4 }, { value: 'b, "quoted"', n: 3 }] }],
  courses: [{ course: 'MAT1000_2026_S1', learners: 6 }, { course: 'PHY2000_2026_S1', learners: 2 }],
  daily: [{ day: '2026-11-03', learners: 5 }],
});

function mount(ui: () => React.ReactElement, p = project().p) {
  s = new EditorStore(p);
  setCurrentStore(s);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(ui()));
}
afterEach(() => {
  if (root) act(() => root.unmount());
  host?.remove();
  vi.unstubAllGlobals();
});
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const fetchWith = (body: unknown, status = 200) => {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fn);
  return fn;
};

describe('what Insights works out', () => {
  it('orders the funnel by the project, start first, with shares of the start, and keeps removed artboards last', () => {
    const { p, prefix } = project();
    p.settings.startArtboardId = 'ab1';
    const rows = funnel(p, data(prefix));
    expect(rows.map((r) => [r.name, r.learners, r.ofStart, r.ofPrevious])).toEqual([
      ['Intro', 8, 100, null],
      ['Quiz', 6, 75, 75],
      ['End', 0, 0, 0],
      ['Old page', 1, 12.5, null],
    ]);
    expect(rows[0].start).toBe(true);
    expect(rows[3].removed).toBe(true);
  });
  it('a project whose start is not the first artboard puts the start first', () => {
    const { p, prefix } = project();
    p.settings.startArtboardId = 'ab2';
    expect(funnel(p, data(prefix))[0].name).toBe('Quiz');
  });
  it('lists every option of a question, the ones nobody chose as zero, and marks the right one', () => {
    const { p, prefix } = project();
    const rows = questionRows(p, data(prefix));
    const q = rows.find((r) => r.question === prefix)!;
    expect(q).toMatchObject({ prompt: 'Which planet is largest?', checks: 10, learners: 6, rightRate: 40, firstTryRate: 33.3 });
    expect(q.options.map((o) => [o.text, o.chosen, o.correct])).toEqual([['Mars', 4, false], ['Jupiter', 5, true], ['Venus', 0, false], ['Earth', 0, false]]);
    expect(rows.find((r) => r.question === 'q99')).toMatchObject({ removed: true, checks: 2 });
  });
  it('a question nobody answered still shows, at zero', () => {
    const { p, prefix } = project();
    const none = { ...data(prefix), questions: [] };
    expect(questionRows(p, none)[0]).toMatchObject({ checks: 0, rightRate: null, firstTryRate: null });
  });
  it('fills in the steps nobody reached', () => {
    const { p, prefix } = project();
    expect(stepRows(p, data(prefix))).toEqual([{ artboard: 'ab1', name: 'Intro', steps: [{ step: 1, title: '', learners: 5 }, { step: 2, title: '', learners: 0 }, { step: 3, title: '', learners: 2 }] }]);
  });
  it('gives the heat cells of one artboard, scaled by the biggest', () => {
    const { prefix } = project();
    expect(heatFor(data(prefix), 'ab1')).toMatchObject({ max: 6, cell: 20, clicks: 9 });
    expect(heatFor(data(prefix), 'ab2')).toBeNull();
  });
});

describe('CSV export', () => {
  it('has a row for each count, quotes what needs it, defuses spreadsheet formulas and names nobody', () => {
    const { p, prefix } = project();
    const csv = insightsCsv(p, data(prefix));
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('section,item,detail,count,learners,percent');
    expect(lines).toContain('summary,Course,last 30 days,40,8,');
    expect(lines.some((l) => l.startsWith('artboard views,Intro,start,11,8,100'))).toBe(true);
    expect(lines.some((l) => l.startsWith('question option,Which planet is largest?,Jupiter (right answer),5,,50'))).toBe(true);
    expect(lines).toContain(`record value,opened hint,'=HYPERLINK("x"),4,,57.1`.replace('\'=HYPERLINK("x")', '"\'=HYPERLINK(""x"")"'));
    expect(lines.some((l) => l.includes('"b, ""quoted"""'))).toBe(true);
    expect(lines.some((l) => l.startsWith('click heat,Intro,x 40, y 60'.replace('x 40, y 60', '"x 40, y 60, 20px cell"')))).toBe(true);
    expect(csv).not.toMatch(/username|userID/);
  });
});

describe('Learner records settings', () => {
  const Harness = () => {
    const project = useEditor((st) => st.project);
    return <RecordsSection project={project} />;
  };
  const open = () => act(() => (host.querySelector('.section-title') as HTMLElement).click());
  const box = (label: string) => Array.from(host.querySelectorAll('label')).find((l) => l.textContent?.trim() === label)!.querySelector('input') as HTMLInputElement;
  const records = () => s.get().project.settings.records;

  it('drops keys that go back to the default and the object when empty', () => {
    const p = createProject('x');
    p.settings.records = { clicks: false, views: false };
    expect(patchRecords(p, { clicks: true })).toEqual({ views: false });
    p.settings.records = { off: true };
    expect(patchRecords(p, { off: false })).toBeUndefined();
  });

  it('is on by default with every kind ticked, and each can be switched off alone', () => {
    mount(() => <Harness />);
    open();
    expect(box('Record learner activity').checked).toBe(true);
    for (const l of ['Artboard views', 'Clicks', 'Steps', 'Question answers']) expect(box(l).checked).toBe(true);
    act(() => box('Clicks').click());
    expect(records()).toEqual({ clicks: false });
    expect(box('Clicks').checked).toBe(false);
    act(() => box('Clicks').click());
    expect(records()).toBeUndefined();
  });

  it('the master switch turns it all off, hides the kinds, and undoes', () => {
    mount(() => <Harness />);
    open();
    act(() => box('Record learner activity').click());
    expect(records()).toEqual({ off: true });
    expect(host.textContent).toContain('Nothing is recorded about what learners do');
    expect(Array.from(host.querySelectorAll('label')).some((l) => l.textContent?.trim() === 'Clicks')).toBe(false);
    act(() => s.undo());
    expect(records()).toBeUndefined();
  });

  it('opens the Insights tab', () => {
    mount(() => <Harness />);
    open();
    act(() => (Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Open Insights') as HTMLButtonElement).click());
    expect(s.get().bottomTab).toBe('insights');
  });
});

describe('Insights tab', () => {
  it('asks for the project\'s insights and shows counts, the funnel, question bars and the clicked layers', async () => {
    const { p, prefix } = project();
    const fn = fetchWith(data(prefix));
    mount(() => <InsightsPanel />, p);
    await flush();
    expect(String((fn.mock.calls[0] as unknown[])[0])).toMatch(/projects\/prins001\/insights\?days=30$/);
    const tiles = host.querySelector('.ins-tiles')!.textContent!;
    expect(tiles).toContain('8learners');
    expect(tiles).toContain('11visits');
    expect(tiles).toContain('12answers checked');
    const cards = Array.from(host.querySelectorAll('.ins-card')).map((c) => c.querySelector('h4')!.textContent);
    expect(cards).toEqual(['Artboards reached', 'Steps reached on Intro', 'Which planet is largest?', 'q99 (removed)', 'Where learners clicked', 'Your records', 'Courses']);
    const bars = (title: string) => Array.from(Array.from(host.querySelectorAll('.ins-card')).find((c) => c.querySelector('h4')!.textContent === title)!.querySelectorAll('.ins-bar')).map((b) => b.textContent);
    expect(bars('Artboards reached')[0]).toContain('Intro');
    expect(bars('Artboards reached')[1]).toContain('75%');
    expect(bars('Which planet is largest?')).toEqual(['Mars4', 'Jupiter5', 'Venus0', 'Earth0']);
    expect(host.querySelector('.ins-bar-fill.ok')).toBeTruthy();
    expect(bars('Where learners clicked')[0]).toContain('Start button');
    expect(host.textContent).toContain('40% right');
  });

  it('counts again for another period', async () => {
    const { prefix } = project();
    const fn = fetchWith(data(prefix));
    mount(() => <InsightsPanel />);
    await flush();
    const sel = host.querySelector('select')!;
    act(() => {
      sel.value = '7';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
    expect(String((fn.mock.calls[1] as unknown[])[0])).toMatch(/days=7$/);
  });

  it('draws the click heat for the artboard being edited, and takes it away', async () => {
    const { p, prefix } = project();
    fetchWith(data(prefix));
    mount(() => <InsightsPanel />, p);
    await flush();
    expect(s.get().heat).toBeNull();
    const tick = host.querySelector('.insights-bar input[type=checkbox]') as HTMLInputElement;
    act(() => tick.click());
    expect(s.get().heat).toMatchObject({ artboardId: 'ab1', cell: 20, max: 6 });
    //another artboard has no clicks
    act(() => s.set({ activeArtboardId: 'ab2' }));
    expect(s.get().heat).toBeNull();
    expect(host.textContent).toContain('No clicks recorded on Quiz');
    act(() => s.set({ activeArtboardId: 'ab1' }));
    expect(s.get().heat).not.toBeNull();
    act(() => tick.click());
    expect(s.get().heat).toBeNull();
    act(() => tick.click());
    act(() => root.unmount());
    expect(s.get().heat).toBeNull();
    root = createRoot(host);
  });

  it('says what to do when nothing has been recorded', async () => {
    const { prefix } = project();
    fetchWith({ ...data(prefix), records: 0, learners: 0, artboards: [], shared: false });
    mount(() => <InsightsPanel />);
    await flush();
    expect(host.textContent).toContain('Nothing recorded in the last 30 days');
    expect(host.textContent).toContain('There is no share link on yet');
    expect((Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Export CSV') as HTMLButtonElement).disabled).toBe(true);
  });

  it('warns about a handful of learners and about too many records', async () => {
    const { prefix } = project();
    fetchWith({ ...data(prefix), learners: 3, truncated: true });
    mount(() => <InsightsPanel />);
    await flush();
    expect(host.textContent).toContain('a count can be one person');
    expect(host.textContent).toContain('more records than Insights reads at once');
  });

  it('shows the server error instead of numbers', async () => {
    fetchWith({ error: 'That project belongs to someone else' }, 403);
    mount(() => <InsightsPanel />);
    await flush();
    expect(host.querySelector('.error')!.textContent).toBe('That project belongs to someone else');
  });

  it('downloads the CSV', async () => {
    const { prefix } = project();
    fetchWith(data(prefix));
    const made: Blob[] = [];
    const real = URL.createObjectURL;
    URL.createObjectURL = (b: Blob) => (made.push(b), 'blob:x');
    URL.revokeObjectURL = () => undefined;
    HTMLAnchorElement.prototype.click = () => undefined;
    mount(() => <InsightsPanel />);
    await flush();
    act(() => (Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Export CSV') as HTMLButtonElement).click());
    expect(made).toHaveLength(1);
    expect(await new Promise<string>((r) => { const f = new FileReader(); f.onload = () => r(String(f.result)); f.readAsText(made[0]); })).toContain('section,item,detail,count,learners,percent');
    URL.createObjectURL = real;
  });
});

describe('help and catalog', () => {
  it('has a help topic, the Record node and the tab', () => {
    const t = TOPICS.find((x) => x.id === 'insights')!;
    expect(t).toBeDefined();
    expect(topicBody(t)).toContain('Record');
    expect(CATALOG_BY_KIND['action.record']).toBeDefined();
  });
});
