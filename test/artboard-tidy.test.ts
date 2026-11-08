import { beforeEach, describe, expect, it } from 'vitest';
import { createArtboard, createNode, createProject, type Artboard, type Project } from 'interactives-player';
import { BRANDED_STARTERS, COLOURWAYS, projectFromBrandedStarter } from '../src/lib/branded';
import { STARTERS, projectFromStarter } from '../src/lib/template-starters';
import { TIDY_GAP_VARIANT, TIDY_GAP_X, TIDY_GAP_Y, TIDY_GROUP_PAD, TIDY_GROUP_TOP, applyTidy, boardFootprint, tidyCells, tidyColumns } from '../src/lib/artboard-tidy';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { brandHeldIds, isBrandHeld, lockBrandChrome } from '../src/lib/branded/lock';
import { brandedPage, brandedProject, isChrome } from '../src/lib/branded/kit';
import { hitTest } from '../src/store/doc';

//a board's box with the strip above it that its name label sits in
const LABEL = 24;
const box = (a: Artboard) => ({ x0: a.canvasX, x1: a.canvasX + a.width, y0: a.canvasY - LABEL, y1: a.canvasY + a.height });
const touch = (a: Artboard, b: Artboard) => {
  const p = box(a);
  const q = box(b);
  return p.x0 < q.x1 && q.x0 < p.x1 && p.y0 < q.y1 && q.y0 < p.y1;
};

function checkLaidOut(key: string, p: Project) {
  const on = p.artboards.filter((a) => !a.canvasHidden);
  for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++) expect(touch(on[i], on[j]), `${key}: "${on[i].name}" and "${on[j].name}" overlap`).toBe(false);
  //reading order: the cells of the grid, left to right then down, are the tidy order
  const cells = tidyCells(p);
  const lead = cells.map((c) => c.boards[0]);
  //the artboards of a group are a block that sits in the grid as one cell, so between groups (and ungrouped pages) the order is the blocks' top left corners, and inside a group it is the pages' own
  const known = new Set((p.artboardGroups ?? []).map((g) => g.id));
  const unitOf = (a: Artboard) => (a.group && known.has(a.group) ? on.filter((m) => m.group === a.group) : [a]);
  //(a group's block starts a frame's padding up and left of its first page)
  const corner = (a: Artboard) => {
    const grouped = !!a.group && known.has(a.group);
    return { x: Math.min(...unitOf(a).map((m) => m.canvasX)) - (grouped ? TIDY_GROUP_PAD : 0), y: Math.min(...unitOf(a).map((m) => m.canvasY)) - (grouped ? TIDY_GROUP_TOP : 0) };
  };
  for (let i = 1; i < lead.length; i++) {
    const a = lead[i - 1];
    const b = lead[i];
    const same = !!a.group && a.group === b.group;
    const pa = same ? { x: a.canvasX, y: a.canvasY } : corner(a);
    const pb = same ? { x: b.canvasX, y: b.canvasY } : corner(b);
    const sameRow = Math.abs(pa.y - pb.y) < 1;
    expect(sameRow ? pb.x > pa.x : pb.y > pa.y, `${key}: "${b.name}" is out of order after "${a.name}"`).toBe(true);
  }
  //the start page leads (top left), and a variant sits right beside its main page
  const start = p.artboards.find((a) => a.id === p.settings.startArtboardId);
  if (start && !start.variantOf) expect(lead[0], key).toBe(start);
  for (const a of on.filter((x) => x.variantOf)) {
    const base = on.find((x) => x.id === a.variantOf)!;
    expect(a.canvasY, `${key}: ${a.name} beside ${base.name}`).toBe(base.canvasY);
    expect(a.canvasX).toBeGreaterThan(base.canvasX + base.width);
  }
  //nothing starts left of or above the origin
  for (const a of on) {
    expect(a.canvasX).toBeGreaterThanOrEqual(0);
    expect(a.canvasY).toBeGreaterThanOrEqual(0);
  }
}

describe('starters come out laid out', () => {
  it('every branded starter, in every colourway it can open in, has its artboards in order in a grid, none overlapping', () => {
    for (const s of BRANDED_STARTERS) for (const way of [COLOURWAYS[0], COLOURWAYS[3]]) checkLaidOut(`${s.key}/${way.id}`, projectFromBrandedStarter(s, way));
  });

  it('every older built-in starter does too', () => {
    for (const s of STARTERS) checkLaidOut(s.key, projectFromStarter(s));
  });

  it('puts a multi page starter in a real grid with even gaps', () => {
    const s = BRANDED_STARTERS.find((x) => x.key === 'assessment/spelling-test')!;
    const p = projectFromBrandedStarter(s);
    const pages = p.artboards.filter((a) => !a.isMaster);
    expect(pages.length).toBe(8);
    //the masters come after the pages, in cells of the same grid
    expect(p.artboards.slice(0, 8)).toEqual(pages);
    const xs = [...new Set(p.artboards.map((a) => a.canvasX))].sort((a, b) => a - b);
    const ys = [...new Set(p.artboards.map((a) => a.canvasY))].sort((a, b) => a - b);
    expect(xs.length).toBeGreaterThan(1);
    expect(ys.length).toBeGreaterThan(1);
    //each column and row is as wide or tall as the widest or tallest artboard in it with its notes, then the gap
    const boxes = p.artboards.map((a) => {
      const f = boardFootprint(a);
      return { x0: a.canvasX + f.left, y0: a.canvasY + f.top, x1: a.canvasX + f.left + f.width, y1: a.canvasY + f.top + f.height };
    });
    for (const [i, a] of boxes.entries())
      for (const b of boxes.slice(i + 1)) {
        const apart = a.x1 + TIDY_GAP_X <= b.x0 || b.x1 + TIDY_GAP_X <= a.x0 || a.y1 + TIDY_GAP_Y <= b.y0 || b.y1 + TIDY_GAP_Y <= a.y0;
        expect(apart).toBe(true);
      }
    //reading order is the artboard list order
    expect(pages.map((a) => a.name)).toEqual(['Spelling test', 'Word 1', 'Word 2', 'Word 3', 'Word 4', 'Word 5', 'Word 6', 'Your result']);
    expect(p.artboards[0].canvasX).toBe(0);
    expect(p.artboards[0].canvasY).toBe(0);
  });

  it('keeps a portrait variant beside its page, and the Model clips board after the pages', () => {
    const s = BRANDED_STARTERS.find((x) => x.key === 'practice/sign-practice')!;
    const p = projectFromBrandedStarter(s);
    const clips = p.artboards.find((a) => a.name === 'Model clips')!;
    const pages = p.artboards.filter((a) => a !== clips && !a.variantOf && !a.isMaster);
    const last = Math.max(...pages.map((a) => a.canvasY * 1e6 + a.canvasX));
    expect(clips.canvasY * 1e6 + clips.canvasX).toBeGreaterThan(last);
    for (const a of p.artboards.filter((x) => x.variantOf)) {
      const base = p.artboards.find((x) => x.id === a.variantOf)!;
      expect(a.canvasX - (base.canvasX + base.width)).toBe(TIDY_GAP_VARIANT);
    }
  });
});

const board = (name: string, x = 0, y = 0, extra: Partial<Artboard> = {}) => createArtboard({ name, width: 400, height: 300, canvasX: x, canvasY: y, ...extra });
function messy(n: number): Project {
  const p = createProject('Messy');
  p.artboards = Array.from({ length: n }, (_, i) => board(`Board ${i + 1}`, 0, 0));
  p.settings.startArtboardId = p.artboards[0].id;
  return p;
}

describe('tidyCells and applyTidy', () => {
  it('lays stacked boards out in list order, even gaps, from where the group sits now', () => {
    const p = messy(6);
    p.artboards.forEach((a) => ((a.canvasX = 500), (a.canvasY = 200)));
    expect(applyTidy(p)).toBe(true);
    for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) expect(touch(p.artboards[i], p.artboards[j])).toBe(false);
    expect(Math.min(...p.artboards.map((a) => a.canvasX))).toBe(500);
    expect(Math.min(...p.artboards.map((a) => a.canvasY))).toBe(200);
    const b1 = p.artboards[0];
    const b2 = p.artboards[1];
    expect(b2.canvasX - (b1.canvasX + b1.width)).toBe(TIDY_GAP_X);
    //running it again changes nothing
    expect(applyTidy(p)).toBe(false);
  });

  it('puts the start board first even when it is not first in the list, and component boards last', () => {
    const p = messy(4);
    const [a, b, c, d] = p.artboards;
    p.settings.startArtboardId = c.id;
    //b is only used inside another board
    a.children.push(createNode('instance', { artboardId: b.id } as never));
    expect(tidyCells(p).map((x) => x.boards[0].name)).toEqual(['Board 3', 'Board 1', 'Board 4', 'Board 2']);
    expect(d.name).toBe('Board 4');
  });

  it('a board that a Go to artboard leads to is a page, not a component, even if an instance shows it too', () => {
    const p = messy(3);
    const [a, b] = p.artboards;
    a.children.push(createNode('instance', { artboardId: b.id } as never));
    a.logic.nodes.push({ id: 'n1', kind: 'action.artboard', x: 0, y: 0, params: { artboard: b.id } });
    expect(tidyCells(p).map((x) => x.boards[0].name)).toEqual(['Board 1', 'Board 2', 'Board 3']);
  });

  it('leaves boards that are off the canvas where they are', () => {
    const p = messy(3);
    p.artboards[1].canvasHidden = true;
    p.artboards[1].canvasX = 9999;
    applyTidy(p);
    expect(p.artboards[1].canvasX).toBe(9999);
    expect(p.artboards[2].canvasX).toBeGreaterThan(p.artboards[0].canvasX);
  });

  it('picks a few columns for many boards, one row for two or three, and never a tall stack of tiny rows', () => {
    const size = { width: 1024, height: 640 };
    expect(tidyColumns([size, size])).toBe(2);
    expect(tidyColumns(Array(8).fill(size))).toBe(3);
    expect(tidyColumns(Array(20).fill(size))).toBeGreaterThanOrEqual(4);
  });
});

describe('the Tidy up artboards command', () => {
  let s: EditorStore;
  beforeEach(() => {
    s = new EditorStore(messy(5));
    setCurrentStore(s);
  });

  it('is one undo step, and says how many moved', () => {
    const moved = s.tidyArtboards();
    expect(moved).toBe(4);
    const after = s.get().project.artboards.map((a) => [a.canvasX, a.canvasY]);
    expect(new Set(after.map((p) => p.join(','))).size).toBe(5);
    s.undo();
    expect(s.get().project.artboards.every((a) => a.canvasX === 0 && a.canvasY === 0)).toBe(true);
    //already tidy: no change, no history entry
    s.redo();
    expect(s.tidyArtboards()).toBe(0);
  });

  it('reaches a live room as ordinary changes', () => {
    const seen: [Project, Project][] = [];
    s.onLocalChange = (a, b) => seen.push([a, b]);
    s.tidyArtboards();
    expect(seen.length).toBe(1);
    expect(seen[0][1].artboards.map((a) => a.canvasX)).not.toEqual(seen[0][0].artboards.map((a) => a.canvasX));
  });

  it('works on a branded project, whose brand lock does not mind boards moving', () => {
    const ctx = brandedProject(COLOURWAYS[0], 'B');
    brandedPage(ctx, 'One', { kind: 'hero' });
    brandedPage(ctx, 'Two');
    brandedPage(ctx, 'Three');
    const st = new EditorStore(ctx.project);
    setCurrentStore(st);
    //(the hero and the content page each have a master, so five boards to lay out, and the first stays put)
    expect(st.tidyArtboards()).toBe(4);
    expect(st.get().toast).toBeNull();
  });
});

describe('brand layers are truly locked', () => {
  //the chrome is on the pages' masters (kit.ts brandedPage), the title and footer stay on the page
  const sample = () => {
    const ctx = brandedProject(COLOURWAYS[1], 'Pack');
    brandedPage(ctx, 'Welcome', { kind: 'hero', subtitle: 'Sub' });
    const page = brandedPage(ctx, 'One', { footer: 'Page 1' });
    const master = ctx.project.artboards.find((a) => a.id === page.master)!;
    return { ctx, project: ctx.project, page, master };
  };

  it('every chrome layer carries the ordinary lock, so the canvas skips it for clicks, marquee and select all', () => {
    const { project } = sample();
    for (const ab of project.artboards.filter((a) => a.isMaster)) {
      const chrome = ab.children.filter(isChrome);
      expect(chrome.length).toBeGreaterThan(0);
      for (const n of chrome) expect(n.locked, n.name).toBe(true);
      //a click on the logo or the sweeps picks nothing branded
      for (const n of chrome) {
        const hit = hitTest(ab, n.x + n.width / 2, n.y + n.height / 2);
        expect(hit.some(isChrome), n.name).toBe(false);
      }
    }
  });

  it('own layers stay unlocked and pickable', () => {
    const { page } = sample();
    expect(page.children.find((n) => n.name === 'Page title')!.locked).toBeFalsy();
  });

  it('lists brand layers and what is inside them for the Layers panel, and nothing with the F9 override on', () => {
    const { project, page, master } = sample();
    const held = brandHeldIds(project);
    const logo = master.children.find((n) => n.name === 'UniSQ logo') as unknown as { id: string; children: { id: string }[] };
    expect(held.has(logo.id)).toBe(true);
    for (const k of logo.children) expect(held.has(k.id)).toBe(true);
    expect(held.has(page.children.find((n) => n.name === 'Page title')!.id)).toBe(false);
    expect(brandHeldIds(project, true).size).toBe(0);
    expect(isBrandHeld(project, logo as never)).toBe(true);
    expect(isBrandHeld(project, logo as never, true)).toBe(false);
    project.brandLook!.strict = false;
    expect(brandHeldIds(project).size).toBe(0);
  });

  it('locks the chrome of a branded project saved before chrome carried the lock, when the editor opens it', () => {
    const { project, master } = sample();
    const logo = master.children.find((n) => n.name === 'UniSQ logo')!;
    delete logo.locked;
    const fresh = JSON.parse(JSON.stringify(project)) as Project;
    const store = new EditorStore(fresh);
    const opened = store.get().project.artboards.find((a) => a.id === master.id)!.children.find((n) => n.name === 'UniSQ logo')!;
    expect(opened.locked).toBe(true);
    //an ordinary project is untouched, and a locked one comes back as the same object
    const plain = createProject('P');
    expect(lockBrandChrome(plain)).toBe(plain);
    expect(lockBrandChrome(store.get().project)).toBe(store.get().project);
  });

  it('is still lifted by the override: the layer can be edited, and unlocked by hand', () => {
    const { project, master } = sample();
    const s = new EditorStore(project);
    setCurrentStore(s);
    s.set({ activeArtboardId: master.id });
    const id = master.children.find((n) => n.name === 'UniSQ logo')!.id;
    const logoNow = () => s.get().project.artboards.find((a) => a.id === master.id)!.children.find((n) => n.id === id)!;
    s.setProps([id], { locked: false });
    expect(logoNow().locked).toBe(true);
    s.set({ brandOverride: true });
    s.setProps([id], { locked: false });
    expect(logoNow().locked).toBe(false);
  });
});

describe('notes beside artboards', () => {
  it('a tidied starter never has a note over another artboard or another artboard\'s notes', () => {
    for (const s of BRANDED_STARTERS) {
      const p = projectFromBrandedStarter(s);
      const on = p.artboards.filter((a) => !a.canvasHidden);
      const boxes = on.map((a) => {
        const f = boardFootprint(a);
        return { name: a.name, x0: a.canvasX + f.left, y0: a.canvasY + f.top, x1: a.canvasX + f.left + f.width, y1: a.canvasY + f.top + f.height };
      });
      for (const [i, a] of boxes.entries())
        for (const b of boxes.slice(i + 1)) {
          const apart = a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0;
          if (!apart) throw new Error(`${s.key}: "${a.name}" and its notes run into "${b.name}"`);
        }
    }
  });
});

describe('notes on one artboard', () => {
  it('never overlap each other, or the artboard itself, in any starter', () => {
    const bad: string[] = [];
    for (const s of BRANDED_STARTERS) {
      const p = projectFromBrandedStarter(s);
      for (const a of p.artboards) {
        const ns = a.notes ?? [];
        for (const [i, n] of ns.entries()) {
          if (!n.anchor && n.x < a.width && n.x + n.w > 0 && n.y < a.height && n.y + n.h > 0) bad.push(`${s.key} / ${a.name}: a note sits on the artboard`);
          for (const m of ns.slice(i + 1)) if (n.x < m.x + m.w && m.x < n.x + n.w && n.y < m.y + m.h && m.y < n.y + n.h) bad.push(`${s.key} / ${a.name}: two notes overlap`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
