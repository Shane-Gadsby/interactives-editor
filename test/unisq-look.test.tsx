//"Apply the UniSQ look": a project that did not start from a branded pack gets a colourway theme, the brand tokens, a page master with the
//logo and accent bar, and its pages set to use it, without any of its own layers moved, in one undo step.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createArtboard, createNode, createProject, tokenByName, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { COLOURWAYS } from '../src/lib/branded/looks';
import { BRAND_TOKEN_NAMES, CHROME_TAG } from '../src/lib/branded/kit';
import { applyUniSQLook, applyUniSQLookCommand, lookBlocked, lookMessage } from '../src/lib/branded/unisq-look';
import { buildCommands } from '../src/lib/commands';
import { UniSQLookPick } from '../src/components/UniSQLookPick';
import { brandedStarters } from '../src/lib/branded-lazy';
import { projectFromBrandedStarter } from '../src/lib/branded';
import { isBrandLocked } from '../src/lib/branded/lock';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function fixture() {
  const p = createProject('Space week');
  const one = p.artboards[0];
  one.name = 'Welcome';
  one.width = 800;
  one.height = 500;
  const title = createNode('text', { name: 'Title', x: 40, y: 30, width: 300, height: 40 } as never);
  const card = createNode('rect', { name: 'Card', x: 40, y: 120, width: 400, height: 200, fill: { type: 'solid', color: '#123456' } });
  one.children.push(title, card);
  const two = createArtboard({ name: 'Quiz', width: 800, height: 500, canvasX: 900 });
  const wide = createArtboard({ name: 'Wide', width: 1024, height: 640, canvasX: 1800 });
  p.artboards.push(two, wide);
  return { p, one, two, wide, title, card };
}

describe('applyUniSQLook', () => {
  it('adds the theme and brand tokens, opens in the colourway, makes a master per page size and sets every page to it', () => {
    const f = fixture();
    const store = new EditorStore(f.p);
    let result!: ReturnType<typeof applyUniSQLook>;
    store.update((d) => void (result = applyUniSQLook(d as Project, COLOURWAYS[1])));
    const p = store.get().project;
    expect(p.themes!.list.some((t) => t.id === 'theme-purple')).toBe(true);
    expect(p.themes!.default).toBe('theme-purple');
    for (const name of Object.values(BRAND_TOKEN_NAMES)) expect(tokenByName(p.themes!, name), name).toBeTruthy();
    const masters = p.artboards.filter((a) => a.isMaster);
    expect(masters.map((m) => m.name).sort()).toEqual(['Content master', 'Content master 800x500']);
    //the pages follow their size's master, and the masters sit after the pages
    const pages = p.artboards.filter((a) => !a.isMaster);
    expect(pages.map((a) => a.name)).toEqual(['Welcome', 'Quiz', 'Wide']);
    expect(p.artboards.indexOf(masters[0])).toBeGreaterThan(p.artboards.indexOf(pages[2]));
    const sized = (w: number) => masters.find((m) => m.width === w)!;
    expect(pages[0].master).toBe(sized(800).id);
    expect(pages[1].master).toBe(sized(800).id);
    expect(pages[2].master).toBe(sized(1024).id);
    //the frame: the accent bar and the logo, as brand chrome painted with tokens, the logo drawn over the page
    const m = sized(800);
    expect(m.children.map((c) => c.name)).toEqual(['Brand accent', 'UniSQ logo']);
    for (const c of m.children) expect((c as { tags?: string[] }).tags).toContain(CHROME_TAG);
    expect(m.masterOver).toEqual([m.children[1].id]);
    expect(JSON.stringify(m.children)).not.toMatch(/"#[0-9a-f]{6}"/i);
    //off to the right of the pages, in a row, covering nothing
    expect(m.canvasX).toBeGreaterThanOrEqual(1800 + 1024 + 100);
    expect(sized(1024).canvasX).toBeGreaterThan(m.canvasX);
    expect(result).toMatchObject({ themeAdded: true, madeDefault: true, pages: 3, keptMasters: 0, changed: true });
    expect(result.masters.length).toBe(2);
  });

  it('does not move or recolour the author\'s own layers, and does not turn on the brand lock', () => {
    const f = fixture();
    const before = JSON.stringify(f.p.artboards.map((a) => a.children));
    const store = new EditorStore(f.p);
    store.update((d) => void applyUniSQLook(d as Project, COLOURWAYS[0]));
    const p = store.get().project;
    expect(JSON.stringify(p.artboards.filter((a) => !a.isMaster).map((a) => a.children))).toBe(before);
    expect(p.brandLook).toBeUndefined();
    expect(isBrandLocked(p)).toBe(false);
    //a plain colour the author chose is still plain
    expect(JSON.stringify(p.artboards[0].children)).toContain('#123456');
  });

  it('leaves a page that already has a master alone, and says so', () => {
    const f = fixture();
    const own = createArtboard({ name: 'My master', width: 800, height: 500, isMaster: true });
    f.p.artboards.push(own);
    f.two.master = own.id;
    const store = new EditorStore(f.p);
    let result!: ReturnType<typeof applyUniSQLook>;
    store.update((d) => void (result = applyUniSQLook(d as Project, COLOURWAYS[0])));
    const p = store.get().project;
    expect(p.artboards.find((a) => a.id === f.two.id)!.master).toBe(own.id);
    expect(result.keptMasters).toBe(1);
    expect(result.pages).toBe(2);
    expect(lookMessage(result)).toMatch(/1 page already had a master and kept it/);
  });

  it('is the same on a second go: nothing changes', () => {
    const f = fixture();
    const store = new EditorStore(f.p);
    store.update((d) => void applyUniSQLook(d as Project, COLOURWAYS[0]));
    const once = JSON.stringify(store.get().project);
    let result!: ReturnType<typeof applyUniSQLook>;
    store.update((d) => void (result = applyUniSQLook(d as Project, COLOURWAYS[0])));
    expect(result.changed).toBe(false);
    expect(JSON.stringify(store.get().project)).toBe(once);
    expect(lookMessage(result)).toMatch(/already has the UniSQ look in Gold/);
  });

  it('a later colourway only switches the theme the project opens in', () => {
    const f = fixture();
    const store = new EditorStore(f.p);
    store.update((d) => void applyUniSQLook(d as Project, COLOURWAYS[0]));
    let result!: ReturnType<typeof applyUniSQLook>;
    store.update((d) => void (result = applyUniSQLook(d as Project, COLOURWAYS[1])));
    const p = store.get().project;
    expect(result).toMatchObject({ themeAdded: true, madeDefault: true, pages: 0, masters: [] });
    expect(p.themes!.default).toBe('theme-purple');
    expect(p.artboards.filter((a) => a.isMaster).length).toBe(2);
  });

  it('says which pages have a layer where the logo or the accent bar goes', () => {
    const f = fixture();
    f.two.children.push(createNode('rect', { name: 'Corner', x: 50, y: 440, width: 60, height: 30 }));
    f.wide.children.push(createNode('rect', { name: 'Under the title', x: 50, y: 88, width: 200, height: 20 }));
    const store = new EditorStore(f.p);
    let result!: ReturnType<typeof applyUniSQLook>;
    store.update((d) => void (result = applyUniSQLook(d as Project, COLOURWAYS[0])));
    expect(result.crowded).toEqual(['Quiz', 'Wide']);
    expect(lookMessage(result)).toMatch(/Layers on Quiz, Wide sit where the logo or accent bar goes/);
  });
});

describe('the command', () => {
  let store: EditorStore;
  beforeEach(() => {
    const f = fixture();
    store = new EditorStore(f.p);
    setCurrentStore(store);
    store.set({ activeArtboardId: f.one.id });
  });
  afterEach(() => void setCurrentStore(null));

  it('is one undo step and says what it did', () => {
    const before = JSON.stringify(store.get().project);
    const r = applyUniSQLookCommand('purple')!;
    expect(r.changed).toBe(true);
    const p = store.get().project;
    expect(p.themes!.default).toBe('theme-purple');
    expect(store.get().toast?.text).toMatch(/^Applied the UniSQ look in Purple: added the Purple theme and the brand colours, made Purple the theme it opens in, made 2 page masters/);
    expect(store.get().toast?.action).toMatchObject({ kind: 'undo', steps: 1 });
    store.undo();
    expect(JSON.stringify(store.get().project)).toBe(before);
  });

  it('leaves the undo history alone when there is nothing to change', () => {
    applyUniSQLookCommand('gold');
    store.undo();
    applyUniSQLookCommand('gold');
    const redoable = store.canUndo();
    applyUniSQLookCommand('gold');
    expect(store.canUndo()).toBe(redoable);
  });

  it('is in Ctrl+K once for each colourway, and refuses a project that already has the look', async () => {
    const ids = buildCommands().filter((c) => c.id.startsWith('project:unisq-look-'));
    expect(ids.map((c) => c.title)).toEqual(['Apply the UniSQ look', ...COLOURWAYS.slice(1).map((w) => `Apply the UniSQ look in ${w.name}`)]);
    expect(ids.every((c) => !c.disabled)).toBe(true);
    ids[1].run();
    await new Promise((r) => setTimeout(r, 200));
    await brandedStarters.ensure();
    expect(store.get().project.themes!.default).toBe('theme-purple');
    const mod = await brandedStarters.ensure();
    const branded = projectFromBrandedStarter(mod.BRANDED_STARTERS[0]);
    expect(lookBlocked(branded)).toMatch(/already has the UniSQ look/);
    setCurrentStore(new EditorStore(branded));
    expect(buildCommands().find((c) => c.id === 'project:unisq-look-gold')!.disabled).toMatch(/already has the UniSQ look/);
  });
});

describe('the colourway picker', () => {
  let root: Root;
  let host: HTMLElement;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    setCurrentStore(null);
  });

  it('applies the colourway chosen, and is not there for a project that has the look from a starter', async () => {
    const f = fixture();
    const store = new EditorStore(f.p);
    setCurrentStore(store);
    act(() => root.render(<UniSQLookPick />));
    const sel = host.querySelector('select')!;
    expect([...sel.options].map((o) => o.value)).toEqual(['', ...COLOURWAYS.map((w) => w.id)]);
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(sel, 'blue');
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(store.get().project.themes!.default).toBe('theme-blue');
    const mod = await brandedStarters.ensure();
    const branded = new EditorStore(projectFromBrandedStarter(mod.BRANDED_STARTERS[0]));
    setCurrentStore(branded);
    act(() => root.render(<UniSQLookPick />));
    expect(host.querySelector('select')).toBeNull();
  });
});
