import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { defaultTheme, findTheme, pickTheme, walk, type Project, type SceneNode } from 'interactives-player';
import { EditorStore, setCurrentStore, useEditor } from '../src/store/store';

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

import { TemplatesTab } from '../src/components/TemplatesTab';
import { ColorField } from '../src/components/ui';
import { ColourwayRow } from '../src/panels/ColourwayRow';
import { BRANDED_STARTERS, COLOURWAYS, projectFromBrandedStarter, type BrandedStarter } from '../src/lib/branded';
import { brandedPage, brandedProject, button, contentBox, isChrome, item, text } from '../src/lib/branded/kit';
import { addLearnerSwitcher, colourwayThemes, hasLearnerSwitcher, removeLearnerSwitcher, setColourway } from '../src/lib/branded/colourway';
import { TOPICS, topicBody, getTopic } from '../src/help/topics';
import '../src/help/branded-help';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
const click = (el: Element | null | undefined) => act(async () => void (el as HTMLElement).click());
const byText = (sel: string, t: string) => [...document.querySelectorAll<HTMLElement>(sel)].find((e) => e.textContent?.includes(t));

beforeEach(() => {
  db.createProjectRecord.mockClear();
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

/** A starter of the test's own: a hero page and one content page with a checklist item. */
const fake = (key = 'assessment/fake-quiz', set: BrandedStarter['set'] = 'assessment'): BrandedStarter => ({
  key,
  set,
  name: `Fake ${key}`,
  description: 'A starter made for the test.',
  tags: ['test'],
  build(way) {
    const ctx = brandedProject(way, 'Fake');
    brandedPage(ctx, 'Welcome', { kind: 'hero', subtitle: 'Hi' });
    const page = brandedPage(ctx, 'One');
    const body = text(ctx, 'Body', 'Hello', contentBox(page).x, contentBox(page).y, 300);
    page.children.push(body, button(ctx, 'Go', 'Go', 100, 300));
    return { project: ctx.project, checklist: [item('Replace the sample text', body, page)] };
  },
});

const mountTab = async (opened: string[] = []) => {
  await act(async () => root.render(<TemplatesTab folder={null} folders={[]} open={(id) => opened.push(id)} />));
  await flush();
  await click(byText('button[role=tab]', 'Built-in'));
};

describe('the Branded starter packs section', () => {
  it('is not there with no starter registered', async () => {
    expect(BRANDED_STARTERS).toHaveLength(0);
    await mountTab();
    expect(document.body.textContent).not.toContain('Branded starter packs');
    expect(document.body.textContent).toContain('Quiz');
  });

  it('shows the picker and the starters by set with the empty sets hidden, and makes a project in the chosen colourway', async () => {
    const a = fake('assessment/fake-quiz', 'assessment');
    const b = fake('story/fake-story', 'story');
    BRANDED_STARTERS.push(a, b);
    try {
      const opened: string[] = [];
      await mountTab(opened);
      expect(document.body.textContent).toContain('Branded starter packs');
      expect(byText('h3', 'Quizzes and questions')).toBeTruthy();
      expect(byText('h3', 'Stories and presentations')).toBeTruthy();
      expect(byText('h3', 'Explore and reveal')).toBeUndefined();
      expect(byText('h3', 'Drag, sort and timelines')).toBeUndefined();
      expect(document.body.textContent).toContain('Fake assessment/fake-quiz');
      expect(document.body.textContent).toContain('A starter made for the test.');
      const swatches = [...document.querySelectorAll<HTMLElement>('.colourway-swatch')];
      expect(swatches.map((x) => x.getAttribute('aria-label'))).toEqual(COLOURWAYS.map((c) => c.name));
      expect(swatches[0].getAttribute('aria-checked')).toBe('true');
      //pick Blue: remembered in this browser, and the pick makes the project in it
      await click(document.querySelector('[aria-label="Blue"]'));
      expect(localStorage.getItem('ix.branded.colourway')).toBe('blue');
      expect(document.querySelector('[aria-label="Blue"]')!.getAttribute('aria-checked')).toBe('true');
      await click(document.querySelector('[aria-label="Use the Fake assessment/fake-quiz starter in Blue"]'));
      expect(document.body.textContent).toContain('Replace the sample text');
      expect(document.body.textContent).toContain('Blue');
      await click(byText('button', 'Create project'));
      await flush();
      expect(db.createProjectRecord).toHaveBeenCalledTimes(1);
      const made = db.createProjectRecord.mock.calls[0][0] as Project;
      expect(made.brandLook?.id).toBe('blue');
      expect(made.themes?.default).toBe('theme-blue');
      expect(made.template?.builtin).toBe('branded:assessment/fake-quiz');
      expect(made.template?.checklist).toHaveLength(1);
      expect(opened).toEqual([made.id]);
      expect(sessionStorage.getItem('ix.checklist')).toBeDefined();
    } finally {
      BRANDED_STARTERS.splice(BRANDED_STARTERS.indexOf(a), 1);
      BRANDED_STARTERS.splice(BRANDED_STARTERS.indexOf(b), 1);
    }
  });

  it('remembers the colourway across visits and moves between swatches with the arrow keys', async () => {
    localStorage.setItem('ix.branded.colourway', 'green');
    const a = fake();
    BRANDED_STARTERS.push(a);
    try {
      await mountTab();
      expect(document.querySelector('[aria-label="Green"]')!.getAttribute('aria-checked')).toBe('true');
      await act(async () => void document.querySelector('[aria-label="Green"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
      expect(document.querySelector('[aria-label="Orange"]')!.getAttribute('aria-checked')).toBe('true');
    } finally {
      BRANDED_STARTERS.splice(BRANDED_STARTERS.indexOf(a), 1);
    }
  });
});

describe('switching colourway', () => {
  const make = () => projectFromBrandedStarter(fake(), COLOURWAYS[0]);

  it('sets the default theme and the brand look, in the project, and is undoable', () => {
    const s = new EditorStore(make());
    setCurrentStore(s);
    expect(colourwayThemes(s.get().project).map((c) => c.way.id)).toEqual(['gold', 'purple', 'blue', 'green', 'orange', 'red']);
    s.update((d) => void setColourway(d as Project, 'theme-red'));
    const p = s.get().project;
    expect(p.themes!.default).toBe('theme-red');
    expect(p.brandLook).toMatchObject({ id: 'red', name: 'Red' });
    s.undo();
    expect(s.get().project.themes!.default).toBe('theme-gold');
    //High contrast is not a colourway
    expect(setColourway(make(), 'theme-high-contrast')).toBe(false);
  });

  it('is what the canvas and the preview show: the default theme, for any viewer', () => {
    const p = make();
    const t = p.themes!;
    s0(p, 'theme-purple');
    expect(defaultTheme(t).id).toBe('theme-purple');
    //a viewer in dark mode (and not asking for more contrast) still gets it; the preview and exports follow the same rule
    expect(pickTheme(t, { dark: true, contrast: false }).id).toBe('theme-purple');
    expect(pickTheme(t, { dark: false, contrast: false }).id).toBe('theme-purple');
    expect(pickTheme(t, { dark: false, contrast: true }).highContrast).toBe(true);
  });
  function s0(p: Project, id: string) {
    p.themes!.default = id;
  }

  it('adds a chrome switcher to the start page with one Set theme button per colourway, and takes it away again', () => {
    const p = make();
    expect(hasLearnerSwitcher(p)).toBe(false);
    expect(addLearnerSwitcher(p)).toBe(true);
    const start = p.artboards.find((a) => a.id === p.settings.startArtboardId)!;
    const group = start.children.find((n) => n.name === 'Colourway switcher') as SceneNode & { children: SceneNode[] };
    expect(isChrome(group)).toBe(true);
    expect(group.children).toHaveLength(6);
    for (const b of group.children) {
      expect(b.type).toBe('button');
      expect(b.ariaLabel).toMatch(/^Switch to the \w+ colourway$/);
      expect(b.width).toBeGreaterThanOrEqual(24);
    }
    const sets = start.logic.nodes.filter((n) => n.kind === 'action.setTheme');
    expect(sets.map((n) => JSON.parse(String(n.params.theme)))).toEqual(['Gold', 'Purple', 'Blue', 'Green', 'Orange', 'Red']);
    for (const n of sets) expect(findTheme(p.themes!, JSON.parse(String(n.params.theme)))).toBeTruthy();
    const clicks = start.logic.nodes.filter((n) => n.kind === 'event.pointer');
    expect(clicks.map((n) => n.params.target)).toEqual(group.children.map((c) => c.id));
    expect(start.logic.edges).toHaveLength(6);
    //adding again replaces, not doubles
    addLearnerSwitcher(p);
    expect(start.children.filter((n) => n.name === 'Colourway switcher')).toHaveLength(1);
    expect(start.logic.nodes.filter((n) => n.kind === 'action.setTheme')).toHaveLength(6);
    removeLearnerSwitcher(p);
    expect(hasLearnerSwitcher(p)).toBe(false);
    expect(start.logic.nodes).toHaveLength(0);
    expect(start.logic.edges).toHaveLength(0);
    let left = 0;
    for (const ab of p.artboards) walk(ab.children, (n) => void (n.name.startsWith('Colourway') && left++));
    expect(left).toBe(0);
  });

  function Wrap() {
    const p = useEditor((st) => st.project);
    return <ColourwayRow project={p} />;
  }

  it('the Project settings row: swatches switch the default (and reset the canvas theme), the box adds and removes the switcher despite the lock', async () => {
    const s = new EditorStore(make());
    setCurrentStore(s);
    s.set({ canvasTheme: 'theme-blue' });
    await act(async () => root.render(<Wrap />));
    const radios = [...host.querySelectorAll<HTMLElement>('[role=radio]')];
    expect(radios).toHaveLength(6);
    expect(host.querySelector('[aria-label="Gold"]')!.getAttribute('aria-checked')).toBe('true');
    await click(host.querySelector('[aria-label="Green"]'));
    expect(s.get().project.themes!.default).toBe('theme-green');
    expect(s.get().canvasTheme).toBeNull();
    expect(host.querySelector('[aria-label="Green"]')!.getAttribute('aria-checked')).toBe('true');
    const box = host.querySelector<HTMLInputElement>('input[type=checkbox]')!;
    expect(box.checked).toBe(false);
    await click(box);
    expect(hasLearnerSwitcher(s.get().project)).toBe(true);
    expect(host.querySelector<HTMLInputElement>('input[type=checkbox]')!.checked).toBe(true);
    await click(host.querySelector('input[type=checkbox]'));
    expect(hasLearnerSwitcher(s.get().project)).toBe(false);
    //one undo step each
    s.undo();
    expect(hasLearnerSwitcher(s.get().project)).toBe(true);
  });

  it('draws nothing for a project that is not branded', async () => {
    const s = new EditorStore({ ...make(), brandLook: undefined } as Project);
    setCurrentStore(s);
    await act(async () => root.render(<Wrap />));
    expect(host.textContent).toBe('');
  });
});

describe('the branded-starters help topic', () => {
  it('exists, is linked from templates and themes, and lists the registered starters by set at read time', () => {
    const t = getTopic('branded-starters')!;
    expect(t).toBeTruthy();
    expect(TOPICS.map((x) => x.id)).toContain('branded-starters');
    expect(topicBody(getTopic('templates')!)).toContain('(branded-starters)');
    expect(topicBody(getTopic('themes')!)).toContain('(branded-starters)');
    expect(topicBody(t)).not.toContain('Fake assessment/fake-quiz');
    const a = fake();
    BRANDED_STARTERS.push(a);
    try {
      const body = topicBody(t);
      expect(body).toContain('### Quizzes and questions');
      expect(body).toContain('**Fake assessment/fake-quiz**: A starter made for the test.');
      expect(body).not.toContain('### Explore and reveal');
      for (const c of COLOURWAYS) expect(body).toContain(`**${c.name}**`);
    } finally {
      BRANDED_STARTERS.splice(BRANDED_STARTERS.indexOf(a), 1);
    }
  });
});

describe('the colour picker in a branded project', () => {
  const make = () => projectFromBrandedStarter(fake(), COLOURWAYS[0]);

  it('offers the theme tokens only: no hex box, no native picker, no detach', async () => {
    const p = make();
    const s = new EditorStore(p);
    setCurrentStore(s);
    const token = p.themes!.tokens.find((t) => t.name === 'color/text')!;
    await act(async () => root.render(<ColorField tokens value={`token:${token.id}`} onChange={() => undefined} />));
    expect(host.querySelector('.token-chip')).toBeTruthy();
    expect(host.querySelector('.token-detach')).toBeNull();
    expect(host.querySelector('input.color-text')).toBeNull();
    //a plain colour (an old one) shows without a way to type another
    await act(async () => root.render(<ColorField tokens value="#123456" onChange={() => undefined} />));
    expect(host.querySelector('input.color-text')).toBeNull();
    expect(host.querySelector('input[type=color]')).toBeNull();
    expect(host.textContent).toContain('Theme colours only');
  });

  it('is the ordinary picker with the override on, and in an ordinary project', async () => {
    const s = new EditorStore(make());
    setCurrentStore(s);
    s.set({ brandOverride: true });
    await act(async () => root.render(<ColorField tokens value="#123456" onChange={() => undefined} />));
    expect(host.querySelector('input.color-text')).toBeTruthy();
  });
});
