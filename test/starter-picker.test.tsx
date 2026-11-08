import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const db = vi.hoisted(() => ({
  createProjectRecord: vi.fn(async (_p: unknown) => undefined),
  setProjectMeta: vi.fn(async () => ({ tags: [], folder: null })),
}));
vi.mock('../src/lib/db', async (orig) => ({
  ...(await orig<typeof import('../src/lib/db')>()),
  listTemplates: async () => [],
  listExamples: async () => [],
  createProjectRecord: db.createProjectRecord,
  setProjectMeta: db.setProjectMeta,
}));
vi.mock('../src/lib/image-export', () => ({ projectThumbnail: async () => null }));
const played = vi.hoisted(() => ({ calls: [] as { key: string; way?: string; kind: string }[] }));
vi.mock('../src/lib/starter-pick', async (orig) => ({
  ...(await orig<typeof import('../src/lib/starter-pick')>()),
  starterPlayHtml: async (p: { kind: string; s: { key: string }; way?: { id: string } }) => {
    played.calls.push({ key: p.s.key, kind: p.kind, way: p.way?.id });
    return `<p>playing ${p.s.key}</p>`;
  },
}));

import { TemplatesTab } from '../src/components/TemplatesTab';
import { BRANDED_STARTERS, COLOURWAYS } from '../src/lib/branded';
import { STARTERS } from '../src/lib/template-starters';
import { GOALS, goalsOf } from '../src/lib/starter-goals';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
const click = (el: Element | null | undefined) => act(async () => void (el as HTMLElement).click());
const type = (el: HTMLInputElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
const search = () => host.querySelector<HTMLInputElement>('.starter-search')!;
const chip = (label: string) => [...host.querySelectorAll<HTMLElement>('.goal-chips .tag-chip')].find((c) => c.textContent?.startsWith(label))!;
const names = () => [...host.querySelectorAll('.template-card .project-name')].map((n) => n.textContent);
const total = STARTERS.length + BRANDED_STARTERS.length;

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  db.createProjectRecord.mockClear();
  played.calls.length = 0;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<TemplatesTab folder={null} folders={[]} open={() => undefined} />));
  await flush();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = '';
});

describe('finding a starter', () => {
  it('has a search box and goal chips in plain words, each with a count, on the built-in tab', () => {
    expect(host.querySelector('[role=search]')).not.toBeNull();
    expect(search().getAttribute('aria-label')).toBe('Search the built-in starters');
    expect([...host.querySelectorAll('.goal-chips .tag-chip')].map((c) => c.firstChild?.textContent?.trim())).toEqual(['Everything', 'Quiz', 'Explain', 'Practise', 'Story', 'Media']);
    expect(chip('Everything').getAttribute('aria-pressed')).toBe('true');
    expect(chip('Everything').querySelector('.tag-n')?.textContent).toBe(String(total));
    for (const g of GOALS) {
      const n = [...STARTERS, ...BRANDED_STARTERS].filter((s) => goalsOf(s.key).includes(g.id)).length;
      expect(chip(g.chip).querySelector('.tag-n')?.textContent, g.id).toBe(String(n));
    }
    expect(host.querySelector('[role=status]')?.textContent).toBe(`${total} starters`);
  });

  it('a goal chip narrows the list to what it is for, and clicking it again lifts it', async () => {
    await click(chip('Quiz'));
    expect(chip('Quiz').getAttribute('aria-pressed')).toBe('true');
    expect(chip('Everything').getAttribute('aria-pressed')).toBe('false');
    expect(chip('Quiz').classList.contains('active')).toBe(true);
    expect(names()).toContain('Quiz');
    expect(names()).not.toContain('Word search');
    expect(names().length).toBe(Number(chip('Quiz').querySelector('.tag-n')?.textContent));
    await click(chip('Quiz'));
    expect(names().length).toBe(total);
  });

  it('typing narrows it, every word has to match, and the chips\' counts follow', async () => {
    await type(search(), 'hotspot');
    const some = names();
    expect(some.length).toBeGreaterThan(0);
    expect(some.length).toBeLessThan(total);
    expect(some).toContain('Image hotspots');
    expect(chip('Everything').querySelector('.tag-n')?.textContent).toBe(String(some.length));
    await type(search(), 'hotspot picture');
    expect(names().length).toBeLessThanOrEqual(some.length);
    await type(search(), 'hotspot nonsenseword');
    expect(names()).toEqual([]);
    expect(host.querySelector('.empty-state')?.textContent).toContain('No starter matches');
    await click([...host.querySelectorAll('.empty-state button')].find((b) => b.textContent === 'Clear search'));
    expect(search().value).toBe('');
    expect(names().length).toBe(total);
  });

  it('finds a starter by the tool\'s own word that its card no longer shows', async () => {
    await type(search(), 'question kit');
    expect(names()).toContain('Quiz');
    const tags = [...host.querySelectorAll('.template-card .tag-label')].map((t) => t.textContent);
    expect(tags).not.toContain('question kit');
  });

  it('shows no jargon tags on any card', () => {
    const tags = new Set([...host.querySelectorAll('.template-card .tag-label')].map((t) => t.textContent));
    for (const j of ['variables', 'question kit', 'repeater', 'tries', 'list variable', 'user data']) expect(tags.has(j), j).toBe(false);
  });
});

describe('Play on a starter', () => {
  const card = (name: string) => [...host.querySelectorAll<HTMLElement>('.template-card')].find((c) => c.querySelector('.project-name')?.textContent === name)!;
  const modal = () => document.querySelector('.example-play');

  it('every card, plain or branded, has a Play button', () => {
    const cards = [...host.querySelectorAll('.template-card')];
    expect(cards).toHaveLength(total);
    for (const c of cards) expect([...c.querySelectorAll('button')].some((b) => b.textContent === 'Play'), c.querySelector('.project-name')?.textContent ?? '').toBe(true);
  });

  it('plays a plain starter in memory: built here, run in a sandbox, nothing saved', async () => {
    await click([...card('Quiz').querySelectorAll('button')].find((b) => b.textContent === 'Play'));
    await flush();
    expect(modal()?.textContent).toContain('Try it: Quiz');
    expect(modal()?.textContent).toContain('Nothing is saved until you use it');
    const frame = modal()!.querySelector('iframe')!;
    expect(frame.getAttribute('srcdoc')).toBe('<p>playing quiz</p>');
    expect(frame.getAttribute('sandbox')).toContain('allow-scripts');
    expect(played.calls).toEqual([{ key: 'quiz', kind: 'builtin', way: undefined }]);
    expect(db.createProjectRecord).not.toHaveBeenCalled();
  });

  it('plays a branded one in the colourway chosen above the packs', async () => {
    const way = COLOURWAYS[1];
    await click(host.querySelector(`.colourway-swatch[aria-label*="${way.name}"], .colourway-swatch[title*="${way.name}"]`));
    const first = host.querySelector('.branded-card')!;
    await click([...first.querySelectorAll('button')].find((b) => b.textContent === 'Play'));
    await flush();
    expect(played.calls).toHaveLength(1);
    expect(played.calls[0].kind).toBe('branded');
    expect(played.calls[0].way).toBe(way.id);
    expect(db.createProjectRecord).not.toHaveBeenCalled();
  });

  it('Use this template in the Play window goes on to the usual Use template window, still saving nothing', async () => {
    await click([...card('Quiz').querySelectorAll('button')].find((b) => b.textContent === 'Play'));
    await flush();
    await click([...modal()!.querySelectorAll('button')].find((b) => b.textContent === 'Use this template'));
    expect(modal()).toBeNull();
    expect(document.body.textContent).toContain('Name of your new project');
    expect(db.createProjectRecord).not.toHaveBeenCalled();
    await click([...document.querySelectorAll('button')].find((b) => b.textContent === 'Create project'));
    await flush();
    expect(db.createProjectRecord).toHaveBeenCalledTimes(1);
  });

  it('closing it leaves everything as it was', async () => {
    await click([...card('Quiz').querySelectorAll('button')].find((b) => b.textContent === 'Play'));
    await flush();
    await click(modal()!.querySelector('[aria-label="Close"], .icon-btn'));
    expect(modal()).toBeNull();
    expect(db.createProjectRecord).not.toHaveBeenCalled();
  });
});
