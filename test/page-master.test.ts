import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createArtboard, createNode, createProject, isMasterId, normalizeProject, Player, walk, withMaster, type Artboard, type Project, type SceneNode } from 'interactives-player';
import { apply, diff } from '../shared/ops.mjs';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { brandedPage, brandedProject, contentBox, text } from '../src/lib/branded/kit';
import { COLOURWAYS } from '../src/lib/branded/looks';
import { brandLookViolation } from '../src/lib/branded/lock';
import { detachMaster, extractMaster, markMaster, masterOutlines, setMaster, withMasterCached } from '../src/lib/page-master';
import { analyzeUsage } from '../src/lib/dependencies';
import { applyTemplateUpdate } from '../src/lib/templates';
import { baselineOf, partsOf } from '../shared/template.mjs';
import { instanceDepsKey } from '../src/canvas/instances';
import { stillHash } from '../src/lib/still-cache';
import { exportLottie } from '../src/lib/lottie-export';
import { buildSnapshot } from '../shared/library.mjs';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const json = (v: unknown) => JSON.stringify(v).length;
const CHROME = ['Brand accent', 'UniSQ logo'];

/**
 * A branded deck as the starters were before they had masters: hero, twelve content pages with a body each, a section page and an
 * end page, the chrome copied onto every page (the kit now builds masters, so they are put back on the pages here, for extractMaster to find).
 */
function deck(pages = 12) {
  const ctx = brandedProject(COLOURWAYS[1], 'Spelling');
  brandedPage(ctx, 'Welcome', { kind: 'hero', subtitle: 'Sub' });
  for (let i = 1; i <= pages; i++) {
    const page = brandedPage(ctx, `Word ${i}`, { footer: `Word ${i} of ${pages}` });
    page.children.push(text(ctx, 'Body', 'Spell it', contentBox(page).x, contentBox(page).y, 400));
  }
  brandedPage(ctx, 'Part two', { kind: 'section' });
  brandedPage(ctx, 'Thank you', { kind: 'end' });
  for (const a of [...ctx.project.artboards]) if (a.master) detachMaster(ctx.project, a.id);
  ctx.project.artboards = ctx.project.artboards.filter((a) => !a.isMaster);
  return ctx.project;
}

const word1 = (p: Project) => p.artboards.find((a) => a.name === 'Word 1')!;
const contentMaster = (p: Project) => p.artboards.find((a) => a.id === word1(p).master)!;

const names = (nodes: SceneNode[]) => {
  const out: string[] = [];
  walk(nodes, (n) => void out.push(n.name));
  return out;
};

describe('extractMaster', () => {
  it('moves the shared chrome of identical pages into one master and the pages name it', () => {
    const p = deck();
    const before = json(p);
    const r = extractMaster(p, CHROME);
    // the twelve content pages share one; the hero and the end page share the same logo, so those two get another
    expect(r.masters).toHaveLength(2);
    const m = contentMaster(p);
    expect(m.isMaster).toBe(true);
    expect(m.children.map((n) => n.name)).toEqual(CHROME);
    // 12 pages x 2 chrome layers came off, and 2 logos
    expect(r.removed).toBe(26);
    const content = p.artboards.filter((a) => a.master === m.id);
    expect(content).toHaveLength(12);
    for (const a of content) expect(a.children.map((n) => n.name)).toEqual(['Page title', 'Footer text', 'Body']);
    // the section page differs from every other: it keeps its own
    expect(p.artboards.find((a) => a.name === 'Part two')!.children.some((n) => n.name === 'UniSQ logo')).toBe(true);
    const after = json(p);
    // the size win on a branded starter fixture
    expect(after).toBeLessThan(before * 0.6);
  });

  it('draws the same layers on the page as before', () => {
    const p = deck(3);
    const page = word1(p);
    const was = names(withMaster(p.artboards, page));
    const full = names(page.children);
    extractMaster(p, CHROME);
    const now = names(withMaster(p.artboards, word1(p)));
    // same layers on the page, the copies under it (a footer-type layer would go over, these sit under the title)
    expect(was).toEqual(full);
    expect([...now].filter((n) => !n.startsWith('Master')).sort()).toEqual([...full].sort());
  });

  it('plays with the master drawn', () => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    vi.stubGlobal('requestAnimationFrame', () => 0);
    const p = deck(3);
    extractMaster(p, CHROME);
    const page = word1(p);
    const player = new Player(document.getElementById('stage')!, normalizeProject(clone({ ...p, settings: { ...p.settings, startArtboardId: page.id } })));
    const drawn = [...document.querySelectorAll<HTMLElement>('[data-ix-id]')].map((e) => e.dataset.ixId!);
    expect(drawn.some((id) => isMasterId(id))).toBe(true);
    expect(document.body.textContent).toContain('Word 1');
    player.destroy();
    vi.unstubAllGlobals();
  });

  it('keeps layers a timeline or an interaction uses, and lone pages', () => {
    const p = deck(3);
    const a = word1(p);
    const accent = a.children.find((n) => n.name === 'Brand accent')!;
    a.timelines.push({ id: 'tl', name: 'T', duration: 1000, loop: 'once', autoplay: false, speed: 1, markers: [], tracks: [{ id: 'tr', nodeId: accent.id, prop: 'opacity', keys: [{ id: 'k', t: 0, value: 1, ease: 'linear' }] }] } as never);
    const r = extractMaster(p, CHROME);
    expect(r.kept).toHaveLength(1);
    expect(a.master).toBeUndefined();
    expect(a.children.some((n) => n.name === 'Brand accent')).toBe(true);
    // the other two content pages still share one (and the hero and end page another)
    expect(r.masters).toHaveLength(2);
    expect(p.artboards.filter((x) => x.master && x.name.startsWith('Word'))).toHaveLength(2);
    const lone = extractMaster(deck(1), ['Brand accent']);
    expect(lone.masters).toHaveLength(0);
  });

  it('puts layers that sat above the page content over the pages', () => {
    const p = createProject('P');
    for (const i of [1, 2]) {
      const ab = createArtboard({ name: `P${i}`, width: 400, height: 300 });
      ab.children.push(createNode('rect', { name: 'Bar', x: 0, y: 0, width: 400, height: 10 }), createNode('text', { name: `Body ${i}`, text: 'x' }), createNode('rect', { name: 'Fold', x: 380, y: 280, width: 20, height: 20 }));
      p.artboards.push(ab);
    }
    const r = extractMaster(p, ['Bar', 'Fold']);
    const m = r.masters[0];
    expect(m.masterOver).toEqual([m.children[1].id]);
    const live = withMaster(p.artboards, p.artboards[1]);
    expect(live.map((n) => n.id)).toEqual(['ixm~under', p.artboards[1].children[0].id, 'ixm~over']);
  });
});

describe('master actions', () => {
  function make() {
    const p = createProject('M');
    p.artboards[0].name = 'Page';
    const m = createArtboard({ name: 'Master', width: 800, height: 600 });
    m.children.push(createNode('rect', { name: 'Bar' }), createNode('text', { name: 'Title', text: '{pageTitle}' }));
    p.artboards.push(m, createArtboard({ name: 'Page 2', width: 800, height: 600 }));
    const s = new EditorStore(p);
    setCurrentStore(s);
    return { s, id: (n: string) => s.get().project.artboards.find((a) => a.name === n)!.id, get: () => s.get().project };
  }

  it('uses an artboard as the master of several pages, and undoes', () => {
    const { s, id, get } = make();
    s.setMasterOf([id('Page'), id('Page 2')], id('Master'));
    expect(get().artboards.filter((a) => a.master === id('Master'))).toHaveLength(2);
    expect(get().artboards.find((a) => a.name === 'Master')!.isMaster).toBe(true);
    s.undo();
    expect(get().artboards.some((a) => a.master)).toBe(false);
  });

  it('refuses a master of a master and a page as its own master', () => {
    const { s, id, get } = make();
    s.setMasterOf([id('Page')], id('Master'));
    s.setMasterOf([id('Master')], id('Page 2'));
    expect(get().artboards.find((a) => a.name === 'Master')!.master).toBeUndefined();
    s.setMasterOf([id('Page 2')], id('Page 2'));
    expect(get().artboards.find((a) => a.name === 'Page 2')!.master).toBeUndefined();
    s.setMasterOf([id('Page 2')], id('Page'));
    expect(get().artboards.find((a) => a.name === 'Page 2')!.master).toBeUndefined();
  });

  it('hides master layers by name and fills slots on one page only', () => {
    const { s, id, get } = make();
    s.setMasterOf([id('Page'), id('Page 2')], id('Master'));
    s.setMasterHidden(id('Page'), 'Bar', true);
    s.setMasterSlot(id('Page'), 'pageTitle', 'One');
    const page = get().artboards.find((a) => a.name === 'Page')!;
    expect(page.masterHide).toEqual(['Bar']);
    const under = withMaster(get().artboards, page)[0] as unknown as { children: SceneNode[] };
    expect(under.children.map((n) => n.name)).toEqual(['Title']);
    expect((under.children[0] as { text: string }).text).toBe('One');
    const other = get().artboards.find((a) => a.name === 'Page 2')!;
    expect(other.masterHide).toBeUndefined();
    s.setMasterHidden(id('Page'), 'Bar', false);
    s.setMasterSlot(id('Page'), 'pageTitle', '');
    expect(get().artboards.find((a) => a.name === 'Page')!.masterHide).toBeUndefined();
    expect(get().artboards.find((a) => a.name === 'Page')!.masterSlots).toBeUndefined();
  });

  it('keeps a page\'s slot text through Master None and back (Use for all other pages)', () => {
    const { s, id, get } = make();
    s.setMasterOf([id('Page')], id('Master'));
    s.setMasterSlot(id('Page'), 'pageTitle', 'One');
    s.setMasterOf([id('Page')], null);
    expect(get().artboards.find((a) => a.name === 'Page')!.master).toBeUndefined();
    s.setMasterOf([id('Page'), id('Page 2')], id('Master'));
    const page = get().artboards.find((a) => a.name === 'Page')!;
    const under = withMaster(get().artboards, page)[0] as unknown as { children: SceneNode[] };
    expect((under.children.find((n) => n.name === 'Title') as { text: string }).text).toBe('One');
  });

  it('moves a layer between under and over on the master', () => {
    const { s, get } = make();
    const m = get().artboards.find((a) => a.name === 'Master')!;
    s.setMasterOver(m.id, m.children[0].id, true);
    expect(get().artboards.find((a) => a.name === 'Master')!.masterOver).toEqual([m.children[0].id]);
    s.setMasterOver(m.id, m.children[0].id, false);
    expect(get().artboards.find((a) => a.name === 'Master')!.masterOver).toBeUndefined();
  });

  it('deleting a master frees its pages, and duplicating one remaps what it draws over', () => {
    const { s, id, get } = make();
    s.setMasterOf([id('Page')], id('Master'));
    const m = get().artboards.find((a) => a.name === 'Master')!;
    s.setMasterOver(m.id, m.children[0].id, true);
    s.duplicateArtboard(m.id);
    const copy = get().artboards.find((a) => a.name !== 'Master' && a.isMaster && a.id !== m.id)!;
    expect(copy.masterOver).toEqual([copy.children[0].id]);
    expect(copy.children[0].id).not.toBe(m.children[0].id);
    s.deleteArtboard(m.id);
    expect(get().artboards.find((a) => a.name === 'Page')!.master).toBeUndefined();
    s.undo();
    expect(get().artboards.find((a) => a.name === 'Page')!.master).toBe(m.id);
  });

  it('detaches: the master layers become the page own, with fresh ids', () => {
    const { s, id, get } = make();
    s.setMasterOf([id('Page')], id('Master'));
    s.setMasterSlot(id('Page'), 'pageTitle', 'Hi');
    s.detachMasterOf(id('Page'));
    const page = get().artboards.find((a) => a.name === 'Page')!;
    expect(page.master).toBeUndefined();
    expect(page.children.map((n) => n.name)).toEqual(['Bar', 'Title']);
    expect(page.children.every((n) => !isMasterId(n.id) && n.locked !== true && n.decorative === undefined)).toBe(true);
    expect((page.children[1] as { text: string }).text).toBe('Hi');
    expect(get().artboards.find((a) => a.name === 'Master')!.children.map((n) => n.id)).not.toContain(page.children[0].id);
  });

  it('edit master selects it and shows it on the canvas', () => {
    const { s, id, get } = make();
    s.setMasterOf([id('Page')], id('Master'));
    s.update((d) => void (d.artboards.find((a) => a.id === id('Master'))!.canvasHidden = true));
    s.editMasterOf(id('Page'));
    expect(s.get().activeArtboardId).toBe(id('Master'));
    expect(get().artboards.find((a) => a.id === id('Master'))!.canvasHidden).toBeUndefined();
  });

  it('markMaster keeps a master that pages use', () => {
    const { s, id, get } = make();
    s.markAsMaster(id('Master'), true);
    s.setMasterOf([id('Page')], id('Master'));
    s.markAsMaster(id('Master'), false);
    expect(get().artboards.find((a) => a.name === 'Master')!.isMaster).toBe(true);
    const p = clone(get());
    markMaster(p, id('Master'), true);
    expect(setMaster(p, id('Page 2'), id('Master'))).toBe(true);
  });
});

describe('what depends on a master', () => {
  it('redraw keys, stills and the usage list follow the master', () => {
    const p = deck(2);
    extractMaster(p, CHROME);
    const page = word1(p);
    const k1 = instanceDepsKey(p, page);
    const h1 = stillHash(p, page);
    const edited = clone(p);
    const m = edited.artboards.find((a) => a.id === page.master)!;
    m.children[0].x += 5;
    expect(instanceDepsKey(edited, edited.artboards.find((a) => a.id === page.id)!)).not.toBe(k1);
    expect(stillHash(edited, edited.artboards.find((a) => a.id === page.id)!)).not.toBe(h1);
    const usage = analyzeUsage(p);
    const item = usage.artboards.find((x) => x.id === page.master)!;
    expect(item.unused).toBe(false);
    expect(item.usedBy.some((u) => u.how === 'page master')).toBe(true);
  });

  it('the canvas copies are the same objects until the master changes', () => {
    const p = deck(2);
    extractMaster(p, CHROME);
    const page = word1(p);
    const a = withMasterCached(p.artboards, page, page.children);
    const b = withMasterCached(p.artboards, page, [...page.children]);
    expect(a[0]).toBe(b[0]);
    const q = clone(p);
    q.artboards.find((x) => x.id === page.master)!.children[0].x += 3;
    const c = withMasterCached(q.artboards, q.artboards.find((x) => x.id === page.id)!, page.children);
    expect(c[0]).not.toBe(a[0]);
  });

  it('a library snapshot carries the master along as an inner artboard', () => {
    const p = deck(2);
    extractMaster(p, CHROME);
    const page = word1(p);
    page.publish = true;
    const snap = buildSnapshot(p);
    expect(snap.components.map((c) => c.id)).toEqual([page.id]);
    expect(snap.internals.map((c) => c.id)).toEqual([page.master]);
  });

  it('a Lottie of a page includes the master layers', () => {
    const p = deck(2);
    extractMaster(p, CHROME);
    const page = word1(p);
    const out = exportLottie(p, page, { bytesFor: () => null });
    const nm = (out.json.layers as { nm: string }[]).map((l) => l.nm);
    expect(nm).toContain('UniSQ logo');
    expect(nm).toContain('Brand accent');
  });

  it('survives live ops and a save round trip', () => {
    const p = deck(2);
    const before = clone(p);
    extractMaster(p, CHROME);
    const ops = diff(before, p);
    const doc = clone(before);
    apply(doc, ops);
    expect(doc).toEqual(clone(p));
    expect(normalizeProject(clone(p)).artboards.filter((a) => a.master && a.name.startsWith('Word'))).toHaveLength(2);
  });
});

describe('template update', () => {
  it('brings a new master and the pages that use it, and stands a page alone when its master was not taken', () => {
    const tpl = deck(2);
    const mine = clone(tpl);
    mine.template = { id: 't', name: 'T', version: 1, base: baselineOf(mine), checklist: [] } as never;
    extractMaster(tpl, CHROME);
    const parts = [...partsOf(tpl)].map(([k]) => k as string);
    // pages first, no master taken
    const pageKeys = tpl.artboards.filter((a) => a.master).map((a) => 'a:' + a.id);
    const d1 = clone(mine);
    applyTemplateUpdate(d1, tpl, pageKeys, { version: 2 });
    expect(d1.artboards.some((a) => a.master)).toBe(false);
    // with the master too
    const m = contentMaster(tpl);
    const d2 = clone(mine);
    applyTemplateUpdate(d2, tpl, parts.filter((k) => k.startsWith('a:') || k.startsWith('n:')), { version: 2 });
    expect(d2.artboards.find((a) => a.id === m.id)?.children.map((n) => n.name)).toEqual(CHROME);
    expect(d2.artboards.filter((a) => a.master === m.id)).toHaveLength(2);
  });
});

describe('the brand lock', () => {
  it('holds the master chrome, the page link to it and the hide list', () => {
    const p = deck(2);
    extractMaster(p, CHROME);
    const page = word1(p);
    const m = contentMaster(p);
    const edit = (fn: (d: Project) => void) => {
      const d = clone(p);
      fn(d);
      return brandLookViolation(p, d);
    };
    expect(edit((d) => void (d.artboards.find((a) => a.id === page.id)!.masterSlots = { x: 'y' }))).toBeNull();
    expect(edit((d) => void delete d.artboards.find((a) => a.id === page.id)!.master)).toMatch(/brand layers/);
    expect(edit((d) => void (d.artboards.find((a) => a.id === page.id)!.masterHide = ['UniSQ logo']))).toMatch(/brand/);
    expect(edit((d) => void (d.artboards.find((a) => a.id === m.id)!.children[0].x += 10))).toMatch(/locked/);
    expect(edit((d) => void (d.artboards.find((a) => a.id === m.id)!.masterOver = [m.children[0].id]))).toMatch(/locked/);
    expect(edit((d) => void (d.artboards = d.artboards.filter((a) => a.id !== m.id)))).toMatch(/still in the project/);
    // deleting the master with its pages is fine
    expect(edit((d) => void (d.artboards = d.artboards.filter((a) => a.id !== m.id && a.master !== m.id)))).toBeNull();
  });

  it('the store refuses to delete the master while pages use it', () => {
    const p = deck(2);
    extractMaster(p, CHROME);
    const s = new EditorStore(p);
    setCurrentStore(s);
    const m = contentMaster(p);
    s.deleteArtboard(m.id);
    expect(s.get().project.artboards.some((a) => a.id === m.id)).toBe(true);
  });
});

describe('format', () => {
  it('a project without masters is unchanged by normalizing', () => {
    const p = deck(1);
    const q = normalizeProject(clone(p));
    for (const a of q.artboards) {
      expect(a.master).toBeUndefined();
      expect(a.isMaster).toBeUndefined();
    }
  });
  it('typed fields', () => {
    const a: Artboard = createArtboard({ master: 'x', masterHide: ['a'], masterSlots: { b: 'c' }, masterOver: ['d'], isMaster: true });
    expect(a.master).toBe('x');
  });
});

beforeEach(() => void 0);

describe('master outlines for the canvas', () => {
  it('lists the boxes of the master layers a page draws, minus the ones it leaves off, and nothing for a page without a master', () => {
    const p = deck(2);
    extractMaster(p, CHROME);
    const page = word1(p);
    const out = masterOutlines(p.artboards, page)!;
    expect(out.master).toBe(contentMaster(p).name);
    expect(out.boxes.length).toBeGreaterThan(0);
    expect(out.boxes.every((b) => b.id.startsWith('ixm~') && b.width > 0)).toBe(true);
    const first = out.boxes[0].name;
    page.masterHide = [first];
    expect(masterOutlines(p.artboards, page)!.boxes.some((b) => b.name === first)).toBe(false);
    expect(masterOutlines(p.artboards, contentMaster(p))).toBeNull();
  });
});
