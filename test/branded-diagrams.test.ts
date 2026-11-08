//The mind map and flowchart starters (explore set), built on connectors and the diagram layouts: each builds in every colourway,
//paints only with tokens, and plays; the mind map opens details, folds, moves with the arrow keys and is built up and edited by the
//learner; the flowchart is walked, decision by decision, and completed by dragging steps into blanks.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, evaluate, mindMap, normalizeProject, walk, type ConnectorNode, type Project, type SceneNode } from 'interactives-player';
import { BRANDED_STARTERS, COLOURWAYS, HIGH_CONTRAST, projectFromBrandedStarter } from '../src/lib/branded';
import { byName } from '../src/lib/branded/kit';
import { partsOf, questionFrames } from '../src/lib/question-kit';
import { checkProjectLayout } from '../src/lib/branded/layout-check';
import { checkAccessibility } from '../src/lib/a11y/checks';
import { contrastRatio, toRgba } from '../src/lib/a11y/colour';

const KEYS = ['explore/mind-map', 'explore/flowchart'];
const STARTS = BRANDED_STARTERS.filter((s) => KEYS.includes(s.key));
const starter = (key: string) => STARTS.find((s) => s.key === key)!;

const flush = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const elOf = (id: string) => document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`);
const must = (id: string) => {
  const el = elOf(id);
  if (!el) throw new Error(`no layer ${id}`);
  return el;
};
const shown = (id: string) => !!elOf(id) && elOf(id)!.style.display !== 'none';
const layer = (p: Project, name: string, page = ''): SceneNode => {
  let hit: SceneNode | undefined;
  for (const ab of page ? p.artboards.filter((a) => a.name === page) : p.artboards) walk(ab.children, (n) => void (!hit && n.name === name && (hit = n)));
  if (!hit) throw new Error(`no layer ${name}`);
  return hit;
};
let current: Player | null = null;
const click = async (id: string) => {
  must(id).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
  await flush();
  //(the frame loop is stubbed, so what the click changed is drawn when the test says so)
  current?.step(16);
};
const key = (el: Element, k: string) => {
  (el as HTMLElement).focus?.();
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
};

const build = (k: string, way = COLOURWAYS[0]) => JSON.parse(JSON.stringify(projectFromBrandedStarter(starter(k), way))) as Project;
const play = (project: Project, page: string) => {
  project.settings.startArtboardId = project.artboards.find((a) => a.name === page)!.id;
  return (current = new Player(document.getElementById('stage')!, project, { loadData: false }));
};

beforeEach(() => {
  document.body.innerHTML = '<div id="stage" style="width:1024px;height:640px"></div>';
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe('the two diagram starters', () => {
  it('are in the explore set, with words people read and no em dashes', () => {
    expect(STARTS.map((s) => s.key)).toEqual(KEYS);
    for (const s of STARTS) {
      expect(s.set).toBe('explore');
      expect(s.description.length).toBeGreaterThan(60);
      expect(s.description).not.toMatch(/—/);
      expect(s.tags).toContain('connectors');
    }
  });

  for (const s of STARTS) {
    describe(s.name, () => {
      for (const way of [...COLOURWAYS, HIGH_CONTRAST]) {
        it(`builds in ${way.name}, normalises and paints only with tokens`, () => {
          const project = projectFromBrandedStarter(s, way);
          expect(project.themes!.default).toBe(`theme-${way.id}`);
          expect(project.settings.startArtboardId).toBe(project.artboards[0].id);
          expect(JSON.stringify(project.artboards.map((a) => [a.children, a.background, a.logic]))).not.toMatch(/#[0-9a-f]{3,8}\b/i);
          const again = normalizeProject(JSON.parse(JSON.stringify(project)));
          expect(again.artboards.length).toBe(project.artboards.length);
          const ids = new Set<string>();
          for (const ab of project.artboards) walk(ab.children, (n) => (expect(ids.has(n.id)).toBe(false), ids.add(n.id)));
        });
      }

      it('has a checklist that points at real layers, and notes under every page that is built from data', () => {
        const { project, checklist } = s.build(COLOURWAYS[0]);
        expect(checklist.length).toBeGreaterThanOrEqual(7);
        for (const c of checklist) {
          expect(c.text).not.toMatch(/—/);
          if (c.nodeId) {
            let found = false;
            for (const ab of project.artboards) walk(ab.children, (n) => void (n.id === c.nodeId && (found = true)));
            expect(found, c.text).toBe(true);
          }
        }
        const pages = project.artboards.filter((a) => !a.isMaster);
        const notes = pages.reduce((n, a) => n + (a.notes?.length ?? 0), 0);
        expect(notes).toBeGreaterThanOrEqual(4);
        for (const a of pages) for (const note of a.notes ?? []) {
          expect(note.text).not.toMatch(/—/);
          expect(note.text.split('\n').length).toBeLessThanOrEqual(3);
          //beside the page, never over its content
          expect(note.y >= a.height || note.x >= a.width || note.x + note.w <= 0).toBe(true);
        }
      });

      it('wires its graph to things that exist', () => {
        const { project } = s.build(COLOURWAYS[0]);
        for (const ab of project.artboards) {
          const ids = new Set<string>();
          walk(ab.children, (n) => ids.add(n.id));
          const nodes = new Set(ab.logic.nodes.map((g) => g.id));
          for (const e of ab.logic.edges) expect(nodes.has(e.from) && nodes.has(e.to)).toBe(true);
          for (const g of ab.logic.nodes) {
            const t = (g.params as Record<string, unknown>).target;
            if (typeof t === 'string' && t) expect(ids.has(t), `${g.kind} target`).toBe(true);
            const v = (g.params as Record<string, unknown>).variable;
            if (typeof v === 'string' && v) expect(project.variables.some((x) => x.id === v)).toBe(true);
          }
        }
      });

      it('plays every page without throwing, in every colourway', async () => {
        for (const way of COLOURWAYS) {
          const n = s.build(way).project.artboards.filter((a) => !a.isMaster).length;
          for (let i = 0; i < n; i++) {
            const { project } = s.build(way);
            project.settings.startArtboardId = project.artboards[i].id;
            const errors: unknown[] = [];
            const spy = vi.spyOn(console, 'error').mockImplementation((...a) => void errors.push(a));
            const player = new Player(document.getElementById('stage')!, JSON.parse(JSON.stringify(project)), { loadData: false });
            await flush(10);
            player.step(16);
            player.destroy();
            spy.mockRestore();
            expect(errors).toEqual([]);
          }
        }
      });

      it('passes the layout check on every page and in each of its states, in every colourway', () => {
        for (const way of [...COLOURWAYS, HIGH_CONTRAST]) expect(checkProjectLayout(projectFromBrandedStarter(s, way), s.layoutStates).filter((v) => v.kind !== 'text-text')).toEqual([]);
      });

      it('has nothing the accessibility checker calls an issue (bar the brand\'s own web address, which every starter shares), and no connector that tries to speak', () => {
        const report = checkAccessibility(projectFromBrandedStarter(s, COLOURWAYS[0]));
        const issues = report.findings.filter((f) => f.severity === 'issue' && !/Brand web address/.test(f.detail));
        expect(issues.map((f) => `${f.title}: ${f.detail.slice(0, 100)}`)).toEqual([]);
        const project = projectFromBrandedStarter(s, COLOURWAYS[0]);
        walk(project.artboards.flatMap((a) => a.children), (n) => {
          if (n.type === 'connector') expect((n as ConnectorNode).ariaLabel ?? '').toBe('');
        });
      });
    });
  }
});

//Text and the shapes it sits on, and the lines, in every colourway (WCAG 2.2 AA: 4.5 for text, 3 for lines, outlines and shapes that carry meaning)
describe('contrast of what the two starters paint', () => {
  const rgb = (project: Project, theme: string, name: string) => {
    const t = project.themes!;
    const tk = t.tokens.find((x) => x.name === name)!;
    return toRgba(tk.values[theme])!.slice(0, 3) as [number, number, number];
  };
  const pairs: { what: string; fg: string; bg: string; min: number }[] = [
    { what: 'ideas and steps: text on the page', fg: 'color/text', bg: 'color/background', min: 4.5 },
    { what: 'ideas and steps: text on the grey surface', fg: 'color/text', bg: 'color/surface', min: 4.5 },
    { what: 'the root idea: white words on the deep colour', fg: 'brand/on-deep', bg: 'brand/deep', min: 4.5 },
    { what: 'the step you are at: words on the button colour', fg: 'color/on-button', bg: 'color/button', min: 4.5 },
    { what: 'a step you have been through: words on the success surface', fg: 'color/text', bg: 'color/success-surface', min: 4.5 },
    { what: 'lines and arrows on the page', fg: 'color/muted', bg: 'color/background', min: 3 },
    { what: 'the arrows you have taken on the page', fg: 'color/success', bg: 'color/background', min: 3 },
    { what: 'a step you have been through: its outline on the success surface', fg: 'color/success', bg: 'color/success-surface', min: 3 },
    { what: 'a first level idea and the step you are at: their outline on the page', fg: 'color/text', bg: 'color/background', min: 3 },
    { what: 'an idea\'s outline on the page', fg: 'color/muted', bg: 'color/background', min: 3 },
    { what: 'the root idea: its outline in the page colour of the deep box', fg: 'brand/on-deep', bg: 'brand/deep', min: 3 },
    { what: 'an arrow label on its chip', fg: 'color/text', bg: 'color/background', min: 4.5 },
    { what: 'the blank shapes\' numbers and the hint line on the grey card', fg: 'color/muted', bg: 'color/surface', min: 4.5 },
  ];
  it('the root idea\'s box stands out from the page by its fill or by its outline, in every colourway', () => {
    for (const way of [...COLOURWAYS, HIGH_CONTRAST]) {
      const project = projectFromBrandedStarter(starter('explore/mind-map'), way);
      const t = `theme-${way.id}`;
      expect(Math.max(contrastRatio(rgb(project, t, 'brand/deep'), rgb(project, t, 'color/background')), contrastRatio(rgb(project, t, 'brand/on-deep'), rgb(project, t, 'color/background'))), way.name).toBeGreaterThanOrEqual(3);
    }
  });

  for (const way of [...COLOURWAYS, HIGH_CONTRAST]) {
    it(`${way.name}: every pair of colours the starters use clears its target`, () => {
      const project = projectFromBrandedStarter(starter('explore/mind-map'), way);
      const fails = pairs.map((p) => ({ ...p, ratio: contrastRatio(rgb(project, `theme-${way.id}`, p.fg), rgb(project, `theme-${way.id}`, p.bg)) })).filter((p) => p.ratio < p.min);
      expect(fails.map((f) => `${f.what}: ${f.ratio.toFixed(2)} (needs ${f.min})`)).toEqual([]);
    });
  }
});

describe('mind map: explore', () => {
  const setup = async () => {
    const project = build('explore/mind-map');
    const player = play(project, 'Explore');
    await flush(20);
    const copy = (name: string, i: number) => `${layer(project, name, 'Explore').id}~${i}`;
    const at = (id: string) => (player.getVariable('place') as { id: string }[]).findIndex((p) => p.id === id);
    return { project, player, copy, at };
  };

  it('draws one box, one line and one fold button for every idea, from the list, and the lines are connectors', async () => {
    const { project, player, copy } = await setup();
    const place = player.getVariable('place') as { id: string; visible: boolean }[];
    expect(place).toHaveLength(15);
    for (let i = 0; i < 15; i++) expect(shown(copy('Idea', i))).toBe(true);
    //the root has no line and no fold button
    expect(shown(copy('Branch line', 0))).toBe(false);
    for (let i = 1; i < 15; i++) expect(shown(copy('Branch line', i)), `line ${i}`).toBe(true);
    expect(shown(copy('Fold button', 0))).toBe(false);
    //ideas with others under them have one (plan, read, notes, remember, care)
    const folds = [...Array(15).keys()].filter((i) => shown(copy('Fold button', i)));
    expect(folds.map((i) => place[i].id)).toEqual(['plan', 'read', 'notes', 'remember', 'care']);
    const line = layer(project, 'Branch line', 'Explore') as ConnectorNode;
    expect(line.type).toBe('connector');
    expect(typeof line.from.layer).toBe('object');
    //a box is a button with its words, its state and what is under it said aloud
    expect(must(copy('Idea', 4)).textContent).toContain('Read actively');
    expect(must(copy('Idea', 4)).querySelector('button')?.getAttribute('aria-label') ?? must(copy('Idea', 4)).getAttribute('aria-label')).toContain('2 ideas under it');
    player.destroy();
  });

  it('the lines run from the box of the parent to the box of the idea, on the side the idea is on', async () => {
    const { player, copy, project } = await setup();
    const place = player.getVariable('place') as { id: string; side: string; x: number; w: number; parentIndex: number }[];
    const maps = place.find((p) => p.id === 'maps')!;
    const notes = place[maps.parentIndex];
    //a left-hand idea: its line leaves its parent's left edge and ends at its own right edge
    expect(maps.side).toBe('left');
    const el = must(copy('Branch line', place.indexOf(maps)));
    const x = Number(/translate\(([-\d.]+)px/.exec(el.style.transform)![1]);
    const w = parseFloat(el.style.width);
    expect(x).toBeGreaterThanOrEqual(maps.x + maps.w - 8);
    expect(x).toBeLessThanOrEqual(maps.x + maps.w + 8);
    expect(x + w).toBeLessThanOrEqual(notes.x + 8);
    expect(x + w).toBeGreaterThanOrEqual(notes.x - 8);
    expect(project).toBeTruthy();
    player.destroy();
  });

  it('a click on an idea gives it the keyboard and opens its details in a dialog', async () => {
    const { project, player, copy, at } = await setup();
    await click(copy('Idea', at('cornell')));
    expect(player.getVariable('focused')).toBe(at('cornell'));
    expect(player.getVariable('detailOpen')).toBe(true);
    player.step(16);
    const dialog = layer(project, 'Idea dialog', 'Explore');
    expect(shown(dialog.id)).toBe(true);
    expect(must(layer(project, 'Idea dialog title', 'Explore').id).textContent).toBe('Cornell notes');
    expect(must(layer(project, 'Idea detail', 'Explore').id).textContent).toContain('Leave a margin');
    expect(must(layer(project, 'Idea parent', 'Explore').id).textContent).toBe('Part of: Take notes');
    await click(layer(project, 'Idea dialog close button', 'Explore').id);
    expect(player.getVariable('detailOpen')).toBe(false);
    player.destroy();
  });

  it('a fold button folds its branch away, takes it out of the layout and out of the lines, and unfolds it again', async () => {
    const { player, copy, at } = await setup();
    const plan = at('plan');
    await click(copy('Fold button', plan));
    expect(player.getVariable('folded')).toEqual(['plan']);
    player.step(16);
    expect(shown(copy('Idea', at('goals')))).toBe(false);
    expect(shown(copy('Branch line', at('goals')))).toBe(false);
    expect(shown(copy('Idea', plan))).toBe(true);
    expect(must(copy('Fold button', plan)).textContent).toContain('+');
    await click(copy('Fold button', plan));
    expect(player.getVariable('folded')).toEqual([]);
    player.step(16);
    expect(shown(copy('Idea', at('goals')))).toBe(true);
    player.destroy();
  });

  it('Fold all and Unfold all, and the view toggle, work from the buttons', async () => {
    const { project, player } = await setup();
    await click(layer(project, 'Fold all button', 'Explore').id);
    expect((player.getVariable('folded') as string[]).sort()).toEqual(['care', 'notes', 'plan', 'read', 'remember']);
    await click(layer(project, 'Unfold all button', 'Explore').id);
    expect(player.getVariable('folded')).toEqual([]);
    expect(shown(layer(project, 'Mind map', 'Explore').id)).toBe(true);
    expect(shown(layer(project, 'Outline', 'Explore').id)).toBe(false);
    await click(layer(project, 'View button', 'Explore').id);
    player.step(16);
    expect(shown(layer(project, 'Mind map', 'Explore').id)).toBe(false);
    expect(shown(layer(project, 'Outline', 'Explore').id)).toBe(true);
    const text = must(layer(project, 'Outline text', 'Explore').id).textContent!;
    expect(text).toContain('Learning well');
    expect(text).toContain('- Plan: Decide what you will do');
    expect(text).toContain('      - Cornell notes: Leave a margin');
    expect(must(layer(project, 'View button', 'Explore').id).textContent).toContain('Show as a map');
    player.destroy();
  });

  it('the arrow keys move between ideas by the layout: outwards to a child, inwards to the parent, up and down by height', async () => {
    const { player, copy, at } = await setup();
    const press = (id: string, k: string) => {
      //(a real focus move makes the list's key navigation write the index variable; here the idea is named outright)
      player.setVariable('focused', at(id));
      key(must(copy('Idea', at(id))), k);
      player.step(16);
    };
    expect(player.getVariable('focused')).toBe(0);
    press('r', 'ArrowRight');
    expect(player.getVariable('focused')).toBe(at('plan'));
    press('plan', 'ArrowRight');
    expect(player.getVariable('focused')).toBe(at('goals'));
    press('goals', 'ArrowDown');
    expect(player.getVariable('focused')).toBe(at('week'));
    press('week', 'ArrowLeft');
    expect(player.getVariable('focused')).toBe(at('plan'));
    press('plan', 'ArrowLeft');
    expect(player.getVariable('focused')).toBe(0);
    //the left side goes the other way
    press('r', 'ArrowLeft');
    expect(player.getVariable('focused')).toBe(at('read'));
    press('read', 'ArrowLeft');
    expect(player.getVariable('focused')).toBe(at('skim'));
    //at the edge of the map nothing moves
    press('skim', 'ArrowLeft');
    expect(player.getVariable('focused')).toBe(at('skim'));
    player.destroy();
  });

  it('plus and minus fold and unfold the branch with the keyboard, and the arrow outwards unfolds a folded one first', async () => {
    const { player, copy, at } = await setup();
    const press = (id: string, k: string) => {
      //(a real focus move makes the list's key navigation write the index variable; here the idea is named outright)
      player.setVariable('focused', at(id));
      key(must(copy('Idea', at(id))), k);
      player.step(16);
    };
    press('remember', '-');
    expect(player.getVariable('folded')).toEqual(['remember']);
    press('remember', '+');
    expect(player.getVariable('folded')).toEqual([]);
    //the root and a leaf have nothing to fold
    press('r', '-');
    press('sleep', '-');
    expect(player.getVariable('folded')).toEqual([]);
    press('care', '-');
    player.setVariable('focused', at('care'));
    press('care', 'ArrowLeft');
    //care is on the left side: outwards (left) unfolds it, and the focus has not moved yet
    expect(player.getVariable('folded')).toEqual([]);
    expect(player.getVariable('focused')).toBe(at('care'));
    press('care', 'ArrowLeft');
    expect(player.getVariable('focused')).toBe(at('sleep'));
    player.destroy();
  });

  it('is one Tab stop in a list that counts hidden boxes, and the focus ring follows the keyboard', async () => {
    const { project, player } = await setup();
    const ideas = layer(project, 'Ideas', 'Explore') as unknown as { keyNav: { mode: string; countHidden: boolean; indexVariable: string } };
    expect(ideas.keyNav).toMatchObject({ mode: 'list', countHidden: true });
    expect(ideas.keyNav.indexVariable).toBe(project.variables.find((v) => v.name === 'focused')!.id);
    //the idea with the keyboard has the heavy outline
    const outline = (i: number) => must(`${layer(project, 'Idea', 'Explore').id}~${i}`).querySelector<HTMLElement>('.ix-stroke')!.style.cssText;
    expect(outline(0)).toMatch(/border[^;]*\b4px/);
    expect(outline(1)).not.toMatch(/border[^;]*\b4px/);
    player.setVariable('focused', 1);
    player.step(16);
    expect(outline(0)).not.toMatch(/border[^;]*\b4px/);
    expect(outline(1)).toMatch(/border[^;]*\b4px/);
    //the fold buttons are not stops of their own: the keys do their work
    expect((layer(project, 'Fold button', 'Explore') as { focusable?: boolean }).focusable).toBe(false);
    player.destroy();
  });
});

describe('mind map: build your own', () => {
  const setup = async () => {
    const project = build('explore/mind-map');
    const player = play(project, 'Build your own');
    await flush(20);
    const id = (name: string) => layer(project, name, 'Build your own').id;
    const copy = (name: string, i: number) => `${id(name)}~${i}`;
    const labels = () => (player.getVariable('mine') as { label: string }[]).map((n) => n.label);
    const type = async (value: string) => {
      const input = must(id('Idea text box')).querySelector('input')!;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await flush(10);
    };
    return { project, player, id, copy, labels, type };
  };

  it('starts with one idea, kept by the author\'s keepMap setting, and lays it out in the middle', async () => {
    const { project, player, labels } = await setup();
    expect(labels()).toEqual(['My topic']);
    expect(project.variables.find((v) => v.name === 'mine')).toMatchObject({ type: 'list' });
    expect(project.variables.find((v) => v.name === 'keepMap')).toMatchObject({ type: 'boolean', initial: true });
    expect(player.getVariable('draft')).toBe('My topic');
    //the buttons that need an idea to hang from are off for the idea in the middle
    for (const name of ['Add beside button', 'Delete button', 'Move up button', 'Move down button', 'Move in button', 'Move out button']) expect(must(id2(project, name)).querySelector('button')?.disabled ?? must(id2(project, name)).hasAttribute('disabled')).toBe(true);
    player.destroy();
  });

  const id2 = (project: Project, name: string) => layer(project, name, 'Build your own').id;

  it('adds ideas inside and beside the selected one, with the words in the box, and selects the new one', async () => {
    const { player, id, labels, type } = await setup();
    await type('Sleep');
    await click(id('Add inside button'));
    player.step(16);
    expect(labels()).toEqual(['My topic', 'Sleep']);
    expect((player.getVariable('mine') as { parent: string }[])[1].parent).toBe('n1');
    expect(player.getVariable('mineAt')).toBe(1);
    expect(player.getVariable('draft')).toBe('Sleep');
    await type('Diet');
    await click(id('Add beside button'));
    player.step(16);
    expect(labels()).toEqual(['My topic', 'Sleep', 'Diet']);
    expect((player.getVariable('mine') as { parent: string }[])[2].parent).toBe('n1');
    expect(player.getVariable('mineAt')).toBe(2);
    //a blank box adds "New idea"
    await type('  ');
    await click(id('Add inside button'));
    expect(labels()[3]).toBe('New idea');
    player.destroy();
  });

  it('renames, moves up and down, in and out, and deletes with what is under, keeping the selection on the same idea', async () => {
    const { player, id, copy, labels, type } = await setup();
    for (const w of ['A', 'B', 'C']) {
      player.setVariable('mineAt', 0);
      await flush(5);
      await type(w);
      await click(id('Add inside button'));
    }
    expect(labels()).toEqual(['My topic', 'A', 'B', 'C']);
    //select B (the second branch) by clicking it, which puts its words in the box
    const at = (label: string) => labels().indexOf(label);
    await click(copy('Idea', at('B')));
    expect(player.getVariable('draft')).toBe('B');
    await type('Bee');
    await click(id('Rename button'));
    expect(labels()).toContain('Bee');
    await click(id('Move up button'));
    const branches = () => (player.getVariable('mine') as { label: string; parent: string }[]).filter((n) => n.parent === 'n1').map((n) => n.label);
    expect(branches()).toEqual(['Bee', 'A', 'C']);
    expect(player.getVariable('draft')).toBe('Bee');
    await click(id('Move down button'));
    expect(branches()).toEqual(['A', 'Bee', 'C']);
    //Bee goes inside A, and then back out beside it
    await click(id('Move in button'));
    const parentOf = (label: string) => (player.getVariable('mine') as { id: string; label: string; parent: string }[]).find((n) => n.label === label)!.parent;
    expect(parentOf('Bee')).toBe((player.getVariable('mine') as { id: string; label: string }[]).find((n) => n.label === 'A')!.id);
    await click(id('Move out button'));
    expect(parentOf('Bee')).toBe('n1');
    expect(branches()).toEqual(['A', 'Bee', 'C']);
    expect(labels()[player.getVariable('mineAt') as number]).toBe('Bee');
    //delete: the selection goes to where it hung from
    await click(id('Delete button'));
    expect(labels()).toEqual(['My topic', 'A', 'C']);
    expect(labels()[player.getVariable('mineAt') as number]).toBe('My topic');
    player.destroy();
  });

  it('the Delete key deletes the selected idea, but never the one in the middle', async () => {
    const { player, id, copy, labels, type } = await setup();
    await type('Only child');
    await click(id('Add inside button'));
    player.setVariable('mineAt', 0);
    key(must(copy('Idea', 0)), 'Delete');
    player.step(16);
    expect(labels()).toEqual(['My topic', 'Only child']);
    player.setVariable('mineAt', 1);
    key(must(copy('Idea', 1)), 'Delete');
    player.step(16);
    expect(labels()).toEqual(['My topic']);
    expect(player.getVariable('mineAt')).toBe(0);
    player.destroy();
  });

  it('dragging an idea onto another puts it inside it, and the arrow keys move round the learner\'s map', async () => {
    const { project, player, id, copy, labels, type } = await setup();
    for (const w of ['A', 'B']) {
      player.setVariable('mineAt', 0);
      await flush(5);
      await type(w);
      await click(id('Add inside button'));
    }
    const mine = () => player.getVariable('mine') as { id: string; label: string; parent: string }[];
    const idx = (label: string) => labels().indexOf(label);
    //press on B, let go over A (the page says which copy is under the pointer)
    const ideas = layer(project, 'Ideas', 'Build your own');
    expect(ideas.type).toBe('group');
    const doc = document as unknown as { elementsFromPoint: (x: number, y: number) => Element[] };
    //(the page is not laid out here, so the pointer is given in artboard px: the middle of an idea's box on the map)
    const centre = (label: string) => {
      const p = (player.getVariable('mineLayout') as { x: number; y: number; w: number; h: number }[])[idx(label)];
      return { x: 48 + p.x + p.w / 2, y: 114 + p.y + p.h / 2 };
    };
    const mouse = (type: string, target: Element | Window, over: string) => {
      doc.elementsFromPoint = () => [document.body, must(copy('Idea', idx(over)))];
      const at = centre(over);
      const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y });
      Object.defineProperty(e, 'pointerId', { value: 1 });
      target.dispatchEvent(e);
    };
    mouse('pointerdown', must(copy('Idea', idx('B'))), 'B');
    mouse('pointermove', must(copy('Idea', idx('B'))), 'B');
    mouse('pointermove', must(copy('Idea', idx('A'))), 'A');
    mouse('pointerup', window, 'A');
    await flush(10);
    expect(mine().find((n) => n.label === 'B')!.parent).toBe(mine().find((n) => n.label === 'A')!.id);
    expect(labels()[player.getVariable('mineAt') as number]).toBe('B');
    //let go on nothing, or on itself: nothing moves
    const before = JSON.stringify(mine());
    mouse('pointerdown', must(copy('Idea', idx('B'))), 'B');
    mouse('pointerup', window, 'B');
    await flush(10);
    expect(JSON.stringify(mine())).toBe(before);
    //the arrow keys use the learner's layout, where B is now under A
    player.setVariable('mineAt', 0);
    player.step(16);
    key(must(copy('Idea', 0)), 'ArrowRight');
    player.step(16);
    expect(labels()[player.getVariable('mineAt') as number]).toBe('A');
    key(must(copy('Idea', idx('A'))), 'ArrowRight');
    player.step(16);
    expect(labels()[player.getVariable('mineAt') as number]).toBe('B');
    player.destroy();
  });

  it('puts the saved map back, with the selected idea in the box, when the learner comes back', async () => {
    const project = build('explore/mind-map');
    const mine = project.variables.find((v) => v.name === 'mine')!;
    mine.initial = JSON.stringify([{ id: 'n1', parent: '', label: 'Saved topic' }, { id: 'n2', parent: 'n1', label: 'Saved branch' }]);
    const player = play(project, 'Build your own');
    await flush(10);
    expect(player.getVariable('draft')).toBe('Saved topic');
    expect(shown(`${layer(project, 'Idea', 'Build your own').id}~1`)).toBe(true);
    player.destroy();
  });

  it('downloads the outline as text and a page with the picture in it, from the learner\'s own map', () => {
    const project = build('explore/mind-map');
    const files = project.artboards.find((a) => a.name === 'Build your own')!.logic.nodes.filter((n) => n.kind === 'action.saveFile');
    expect(files.map((f) => f.params.mime)).toEqual(['text/plain', 'text/html', 'application/json']);
    const mine = [{ id: 'n1', parent: '', label: 'Topic <b>' }, { id: 'n2', parent: 'n1', label: 'Branch' }];
    const vars = { mine, mineOutline: 'Topic <b>\n  - Branch', mineLayout: mindMap(mine, { width: 640, height: 372 }) };
    expect(evaluate(String(files[0].params.text), { vars })).toBe('Topic <b>\n  - Branch');
    const page = String(evaluate(String(files[1].params.text), { vars }));
    expect(page).toContain('<svg');
    expect(page).toContain('Topic &lt;b&gt;');
    expect(page).not.toContain('<b>');
    expect(page.startsWith('<!doctype html>')).toBe(true);
  });
});

describe('mind map: keeping the learner\'s map', () => {
  //a progress store that keeps user data in memory, so what was saved can be looked at
  const store = (kept: Record<string, unknown> = {}) => {
    const saves: Record<string, unknown>[] = [];
    return {
      kept,
      saves,
      load: () => null,
      save: () => undefined,
      saveUserData: async (values: Record<string, unknown>) => {
        saves.push(JSON.parse(JSON.stringify(values)));
        Object.assign(kept, JSON.parse(JSON.stringify(values)));
      },
      loadUserData: async (names: string[]) => {
        const got: Record<string, unknown> = {};
        for (const n of names) if (n in kept) got[n] = kept[n];
        return Object.keys(got).length ? got : null;
      },
    };
  };
  const open = async (opts: { keep?: boolean; kept?: Record<string, unknown> } = {}) => {
    const project = build('explore/mind-map');
    if (opts.keep === false) project.variables.find((v) => v.name === 'keepMap')!.initial = false;
    const progress = store(opts.kept);
    project.settings.startArtboardId = project.artboards.find((a) => a.name === 'Build your own')!.id;
    const player = (current = new Player(document.getElementById('stage')!, project, { loadData: false, progress }));
    await flush(30);
    const id = (name: string) => layer(project, name, 'Build your own').id;
    const type = async (value: string) => {
      const input = must(id('Idea text box')).querySelector('input')!;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await flush(10);
    };
    const labels = () => (player.getVariable('mine') as { label: string }[]).map((n) => n.label);
    return { project, player, progress, id, type, labels };
  };

  it('puts the map back from what was saved when the page opens, and says it is saved', async () => {
    const { player, labels } = await open({ kept: { mine: [{ id: 'n1', parent: '', label: 'Kept topic' }, { id: 'n2', parent: 'n1', label: 'Kept branch' }] } });
    expect(labels()).toEqual(['Kept topic', 'Kept branch']);
    expect(player.getVariable('draft')).toBe('Kept topic');
    expect(player.getVariable('mapSaved')).toBe(true);
    player.destroy();
  });

  it('saves every change when the author keeps the map, and the Save button reads Saved once it has', async () => {
    const { player, progress, id, type, labels } = await open();
    expect(progress.saves).toEqual([]);
    await type('Sleep');
    await click(id('Add inside button'));
    await flush(20);
    expect(labels()).toEqual(['My topic', 'Sleep']);
    expect((progress.kept.mine as { label: string }[]).map((n) => n.label)).toEqual(['My topic', 'Sleep']);
    expect(player.getVariable('mapSaved')).toBe(true);
    expect(must(id('Save button')).textContent).toContain('Saved');
    expect(must(id('Keep status')).textContent).toContain('Saved for you on this course page');
    player.destroy();
  });

  it('keeps nothing when the author does not keep it, and says so, and hides the Save button', async () => {
    const { player, progress, id, type, labels } = await open({ keep: false, kept: { mine: [{ id: 'n1', parent: '', label: 'An old save' }] } });
    //(an old save is not read back either)
    expect(labels()).toEqual(['My topic']);
    await type('Sleep');
    await click(id('Add inside button'));
    await flush(20);
    expect(labels()).toEqual(['My topic', 'Sleep']);
    expect(progress.saves).toEqual([]);
    expect(must(id('Keep status')).textContent).toContain('Only until you leave');
    expect(shown(id('Save button'))).toBe(false);
    player.destroy();
  });

  it('starts a new map only after asking', async () => {
    const { player, progress, id, type, labels } = await open();
    await type('Sleep');
    await click(id('Add inside button'));
    expect(labels()).toHaveLength(2);
    await click(id('New map button'));
    expect(player.getVariable('newMapOpen')).toBe(true);
    //asking changes nothing, and keeping the map closes the question
    expect(labels()).toHaveLength(2);
    await click(id('New map dialog close button'));
    expect(player.getVariable('newMapOpen')).toBe(false);
    expect(labels()).toHaveLength(2);
    await click(id('New map button'));
    await click(id('Clear map button'));
    await flush(20);
    expect(labels()).toEqual(['My topic']);
    expect(player.getVariable('mineAt')).toBe(0);
    expect(player.getVariable('newMapOpen')).toBe(false);
    expect((progress.kept.mine as unknown[]).length).toBe(1);
    player.destroy();
  });

  it('opens a map saved by Download a copy, and refuses anything that is not one', async () => {
    const { project, player, id, labels } = await open();
    //the copy the download button writes
    const dl = project.artboards.find((a) => a.name === 'Build your own')!.logic.nodes.find((n) => n.kind === 'action.saveFile' && n.params.mime === 'application/json')!;
    const mine = [{ id: 'n1', parent: '', label: 'Topic' }, { id: 'n2', parent: 'n1', label: 'Branch <b>' }];
    const copy = String(evaluate(String(dl.params.text), { vars: { mine } }));
    expect(JSON.parse(copy)).toEqual(mine);
    const paste = async (text: string) => {
      await click(id('Open map button'));
      expect(player.getVariable('openMapOpen')).toBe(true);
      player.setVariable('pastedMap', text);
      await click(id('Open this map button'));
      await flush(20);
    };
    for (const bad of ['', 'not json', '[oops', '{"id":"a"}', '[]', '[{"id":1,"label":"x"}]', '[{"id":"a"}]']) {
      await paste(bad);
      expect(player.getVariable('openMapOpen')).toBe(true);
      expect(player.getVariable('openMapMessage')).toContain('not a map saved from this page');
      expect(labels()).toEqual(['My topic']);
    }
    //only the fields a map uses are kept, whatever else the pasted words carry
    await paste(JSON.stringify([{ id: 'n1', parent: '', label: 'Topic', extra: 'x' }, { id: 'n2', parent: 'n1', label: 'Branch <b>' }]));
    expect(player.getVariable('openMapOpen')).toBe(false);
    expect(player.getVariable('mine')).toEqual(mine);
    expect(player.getVariable('mineAt')).toBe(0);
    expect(player.getVariable('draft')).toBe('Topic');
    player.destroy();
  });
});

// ------------------------------------------------------------------ flowchart

describe('flowchart: follow', () => {
  const setup = async () => {
    const project = build('explore/flowchart');
    const player = play(project, 'Follow the flowchart');
    await flush(20);
    const id = (name: string) => layer(project, name, 'Follow the flowchart').id;
    const copy = (name: string, i: number) => `${id(name)}~${i}`;
    const stepAt = (sid: string) => (player.getVariable('fc') as { id: string }[]).findIndex((s) => s.id === sid);
    const choices = () => [...document.querySelectorAll(`[data-ix-id^="${id('Choice button')}~"]`)].map((e) => e.textContent);
    const choose = async (label: string) => {
      const buttons = [...document.querySelectorAll<HTMLElement>(`[data-ix-id^="${id('Choice button')}~"]`)];
      const b = buttons.find((x) => x.textContent === label);
      if (!b) throw new Error(`no choice ${label}: ${buttons.map((x) => x.textContent)}`);
      b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
      await flush(10);
      player.step(16);
    };
    return { project, player, id, copy, stepAt, choices, choose };
  };

  it('draws a shape for every step and an arrow for every link, the right kind of shape for each, and the arrows are connectors', async () => {
    const { project, player, copy, stepAt } = await setup();
    const fc = player.getVariable('fc') as { id: string; kind: string }[];
    expect(fc).toHaveLength(7);
    for (let i = 0; i < 7; i++) expect(shown(copy('Flowchart step', i))).toBe(true);
    const kindShown = (i: number) => ({ box: shown(copy('Box shape', i)), diamond: shown(copy('Decision shape', i)), slanted: shown(copy('Input and output shape', i)) });
    expect(kindShown(stepAt('s1'))).toEqual({ box: true, diamond: false, slanted: false });
    expect(kindShown(stepAt('d1'))).toEqual({ box: false, diamond: true, slanted: false });
    expect(kindShown(stepAt('io1'))).toEqual({ box: false, diamond: false, slanted: true });
    expect(kindShown(stepAt('p1')).box).toBe(true);
    for (let i = 0; i < 7; i++) expect(shown(copy('Flow arrow', i))).toBe(true);
    expect(layer(project, 'Flow arrow', 'Follow the flowchart').type).toBe('connector');
    //the arrows carry their answers as labels
    expect(must(copy('Flow arrow', 1)).querySelector('.ix-connector-label')!.textContent).toBe('Yes');
    expect(must(copy('Flow arrow', 2)).querySelector('.ix-connector-label')!.textContent).toBe('No');
    player.destroy();
  });

  it('is read in order, with the step you are at marked as the current step', async () => {
    const { player, copy, stepAt } = await setup();
    expect(must(copy('Flowchart step', stepAt('s1'))).getAttribute('aria-current')).toBe('step');
    expect(must(copy('Flowchart step', stepAt('d1'))).hasAttribute('aria-current')).toBe(false);
    player.destroy();
  });

  it('walks the route: Continue, then the answer to each decision, lighting up the route and the arrows taken', async () => {
    const { player, copy, stepAt, choices, choose, project } = await setup();
    expect(choices()).toEqual(['Continue']);
    expect(must(layer(project, 'Current step', 'Follow the flowchart').id).textContent).toBe('Need a quiet place to study?');
    await choose('Continue');
    expect(player.getVariable('current')).toBe('d1');
    expect(choices()).toEqual(['Yes', 'No']);
    expect(must(copy('Flowchart step', stepAt('d1'))).getAttribute('aria-current')).toBe('step');
    expect(must(copy('Flowchart step', stepAt('s1'))).hasAttribute('aria-current')).toBe(false);
    expect(must(layer(project, 'Current step', 'Follow the flowchart').id).textContent).toBe('Is a room free?');
    //No loops back to the decision
    await choose('No');
    expect(player.getVariable('current')).toBe('p3');
    await choose('Continue');
    expect(player.getVariable('current')).toBe('d1');
    expect(player.getVariable('path')).toEqual(['s1', 'd1', 'p3', 'd1']);
    await choose('Yes');
    for (let i = 0; i < 3; i++) await choose('Continue');
    expect(player.getVariable('current')).toBe('e1');
    expect(player.getVariable('atEnd')).toBe(true);
    expect(choices()).toEqual([]);
    expect(shown(layer(project, 'Start again button', 'Follow the flowchart').id)).toBe(true);
    expect(must(layer(project, 'Route readout', 'Follow the flowchart').id).textContent).toContain('Your route: ... > ');
    //Step back goes one step, and Start again goes home
    await click(layer(project, 'Step back button', 'Follow the flowchart').id);
    player.step(16);
    expect(player.getVariable('current')).toBe('p2');
    expect(choices()).toEqual(['Continue']);
    await choose('Continue');
    await click(layer(project, 'Start again button', 'Follow the flowchart').id);
    expect(player.getVariable('current')).toBe('s1');
    expect(player.getVariable('path')).toEqual(['s1']);
    expect(shown(layer(project, 'Step back button', 'Follow the flowchart').id)).toBe(false);
    player.destroy();
  });

  it('shows the text version on request: every step numbered with where each answer goes', async () => {
    const { project, player } = await setup();
    expect(shown(layer(project, 'Flowchart', 'Follow the flowchart').id)).toBe(true);
    expect(shown(layer(project, 'Flowchart text version', 'Follow the flowchart').id)).toBe(false);
    await click(layer(project, 'View button', 'Follow the flowchart').id);
    player.step(16);
    expect(shown(layer(project, 'Flowchart', 'Follow the flowchart').id)).toBe(false);
    const text = must(layer(project, 'Flowchart as text', 'Follow the flowchart').id).textContent!;
    expect(text).toContain('2. Decision: Is a room free?');
    expect(text).toContain('Yes: go to step 3');
    expect(text).toContain('No: go to step 7');
    expect(text).toContain('go back to step 2');
    expect(text).toContain('The flowchart ends here.');
    //the walk carries on from the text version
    expect(shown(layer(project, 'Walk panel', 'Follow the flowchart').id)).toBe(true);
    player.destroy();
  });

  it('is data: a step and a link added to the lists are drawn and followed with no layer added', async () => {
    const project = build('explore/flowchart');
    const steps = project.variables.find((v) => v.name === 'steps')!;
    const links = project.variables.find((v) => v.name === 'links')!;
    const list = JSON.parse(String(steps.initial)) as Record<string, unknown>[];
    list.push({ id: 'p4', kind: 'process', label: 'Tell a friend', detail: 'Share it.' });
    steps.initial = JSON.stringify(list);
    const l = JSON.parse(String(links.initial)) as Record<string, unknown>[];
    l.push({ from: 'p2', to: 'p4' });
    links.initial = JSON.stringify(l);
    const player = play(project, 'Follow the flowchart');
    player.setVariable('current', 'p2');
    player.setVariable('path', ['p2']);
    player.step(16);
    const id = layer(project, 'Flowchart step', 'Follow the flowchart').id;
    expect(shown(`${id}~7`)).toBe(true);
    const buttons = [...document.querySelectorAll(`[data-ix-id^="${layer(project, 'Choice button', 'Follow the flowchart').id}~"]`)].map((e) => e.textContent);
    expect(buttons).toHaveLength(2);
    player.destroy();
  });
});

describe('flowchart: complete', () => {
  const setup = async () => {
    const project = build('explore/flowchart');
    const page = project.artboards.find((a) => a.name === 'Complete the flowchart')!;
    const frame = questionFrames(page)[0];
    const player = play(project, 'Complete the flowchart');
    await flush(20);
    const id = (name: string) => byName(page, name)!.id;
    const place = async (word: string, blank: number) => {
      await click(id(word));
      await click(id(`Blank ${blank}`));
      player.step(400);
    };
    return { project, page, frame, player, id, place };
  };

  it('is a matching question: three blanks in the chart, three steps and a wrong one, and keyboard drag works', async () => {
    const { page, frame, player, id } = await setup();
    expect(frame.question).toMatchObject({ kind: 'matching', points: 3 });
    expect(frame.question!.pairs).toHaveLength(3);
    expect(frame.question!.extras).toHaveLength(1);
    const all: SceneNode[] = [];
    walk(page.children, (n: SceneNode) => void all.push(n));
    expect(all.filter((n) => n.dropZone)).toHaveLength(3);
    expect(all.filter((n) => n.draggable)).toHaveLength(4);
    expect(partsOf(frame).matchDefinition ?? []).toHaveLength(0);
    const step = must(id('Book the room'));
    step.focus();
    key(step, ' ');
    key(step, 'ArrowRight');
    key(step, ' ');
    expect(Object.values(player.dragState()).filter(Boolean)).toHaveLength(1);
    player.destroy();
  });

  it('draws the chart with connectors that join the blanks and the shapes, and they follow when a blank moves', async () => {
    const { project, page, player } = await setup();
    const wires: ConnectorNode[] = [];
    walk(page.children, (n: SceneNode) => void (n.type === 'connector' && wires.push(n as ConnectorNode)));
    expect(wires).toHaveLength(5);
    const ids = new Set<string>();
    walk(page.children, (n: SceneNode) => ids.add(n.id));
    for (const w of wires) for (const e of [w.from, w.to]) expect(ids.has(e.layer as string), `${w.name}`).toBe(true);
    //every wire is drawn (none is hidden for a missing end), the answers are labels
    for (const w of wires) expect(must(w.id).style.display).not.toBe('none');
    expect(wires.filter((w) => w.label).map((w) => w.label)).toEqual(['Yes', 'No']);
    expect(project).toBeTruthy();
    player.destroy();
  });

  it('marks right and wrong at Check, then a perfect round goes on to the results', async () => {
    const { project, player, frame, id, place } = await setup();
    await flush();
    //Book and Pick another time are swapped, and the wrong step sits in Blank 3
    await place('Pick another time', 1);
    await place('Book the room', 2);
    await place('Cancel the booking', 3);
    const check = partsOf(frame).check[0].id;
    await click(check);
    expect(player.getVariable('flow_correct')).toBe(false);
    await click(check);
    await click(check);
    expect(player.getVariable('flow_locked')).toBe(true);
    player.step(100);
    expect(must(id('Blank 1 result')).textContent).toContain('Wrong');
    expect(player.getVariable('flow_score')).toBe(0);
    await click(id('See results button'));
    player.step(400);
    expect(must(layer(project, 'Result text', 'Results').id).textContent).toBe('You put 0 of 3 steps in the right place.');
    await click(layer(project, 'Try again button', 'Results').id);
    player.step(400);
    for (const [word, blank] of [['Book the room', 1], ['Pick another time', 2], ['Go and study', 3]] as const) await place(word, blank);
    await click(check);
    expect(player.getVariable('flow_correct')).toBe(true);
    expect(player.getVariable('flow_score')).toBe(3);
    player.destroy();
  });
});
