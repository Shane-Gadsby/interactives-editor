//The branded drag set: each starter builds in every colourway, survives normalising, paints only with tokens, plays in the
//player, and its main interaction works (a drop is counted, the order check passes, an event opens its detail).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, normalizeProject, walk, type Artboard, type Project, type SceneNode } from 'interactives-player';
import { BRANDED_STARTERS, COLOURWAYS, projectFromBrandedStarter } from '../src/lib/branded';
import { byName } from '../src/lib/branded/kit';
import { partsOf, questionFrames } from '../src/lib/question-kit';

const DRAG = BRANDED_STARTERS.filter((s) => s.set === 'drag');
const flush = () => new Promise((r) => setTimeout(r, 0));
const elOf = (id: string) => document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`);
const must = (id: string) => {
  const el = elOf(id);
  if (!el) throw new Error(`no layer ${id}`);
  return el;
};
const click = async (id: string) => {
  must(id).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
  await flush();
};
/** jsdom has no PointerEvent: a mouse event with the pointer fields on it. */
const ptr = (type: string, x: number, y: number, target: Element | Window = window) => {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(e, 'pointerId', { value: 1 });
  Object.defineProperty(e, 'pointerType', { value: 'mouse' });
  target.dispatchEvent(e);
};
/** Drag a layer by its centre onto another layer's centre. */
const dragOnto = (from: { x: number; y: number; width: number; height: number }, id: string, to: { x: number; y: number; width: number; height: number }) => {
  const a: [number, number] = [from.x + from.width / 2, from.y + from.height / 2];
  const b: [number, number] = [to.x + to.width / 2, to.y + to.height / 2];
  const el = must(id);
  ptr('pointerdown', a[0], a[1], el);
  for (let i = 1; i <= 4; i++) ptr('pointermove', a[0] + ((b[0] - a[0]) * i) / 4, a[1] + ((b[1] - a[1]) * i) / 4, el);
  ptr('pointerup', b[0], b[1], el);
};
const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

const build = (key: string, way = COLOURWAYS[0]) => {
  const s = DRAG.find((x) => x.key === key)!;
  const project = JSON.parse(JSON.stringify(projectFromBrandedStarter(s, way))) as Project;
  const board = (name: string) => project.artboards.find((a) => a.name === name)!;
  return { project, board };
};

beforeEach(() => {
  document.body.innerHTML = '<div id="stage" style="width:1024px;height:640px"></div>';
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
afterEach(() => vi.unstubAllGlobals());

const play = (project: Project, at?: Artboard) => {
  const player = new Player(document.getElementById('stage')!, project, { loadData: false });
  if (at) player.goTo(at.id);
  return player;
};

describe('the drag set', () => {
  it('has the first four starters, keyed drag/... (more follow, see branded-drag-2)', () => {
    expect(DRAG.slice(0, 4).map((s) => s.key)).toEqual(['drag/label-the-diagram', 'drag/sort-into-groups', 'drag/put-in-order', 'drag/interactive-timeline']);
    for (const s of DRAG) {
      expect(s.description.length).toBeGreaterThan(40);
      expect(s.description).not.toMatch(/—/);
    }
  });

  for (const s of DRAG) {
    describe(s.name, () => {
      for (const way of COLOURWAYS) {
        it(`builds in ${way.name}, normalises, paints with tokens only, and plays`, async () => {
          const { project, checklist } = s.build(way);
          expect(project.themes!.default).toBe(`theme-${way.id}`);
          expect(project.settings.startArtboardId).toBe(project.artboards[0].id);
          expect(project.artboards[0].name).toBe('Start');
          expect(() => normalizeProject(JSON.parse(JSON.stringify(project)))).not.toThrow();
          //no hex colour in a layer, a background or an expression
          const layers = JSON.stringify(project.artboards.map((a) => [a.children, a.background, a.logic]));
          expect(layers).not.toMatch(/#[0-9a-f]{3,8}\b/i);
          //checklist items point at real layers
          const ids = new Set<string>();
          for (const ab of project.artboards) walk(ab.children, (n: SceneNode) => void ids.add(n.id));
          expect(checklist.length).toBeGreaterThanOrEqual(6);
          for (const c of checklist) {
            if (c.nodeId) expect(ids.has(c.nodeId), c.text).toBe(true);
            expect(c.text).not.toMatch(/—/);
          }
          //every graph wire joins nodes that exist
          for (const ab of project.artboards) {
            const have = new Set(ab.logic.nodes.map((n) => n.id));
            for (const e of ab.logic.edges) expect(have.has(e.from) && have.has(e.to)).toBe(true);
          }
          const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
          const player = play(JSON.parse(JSON.stringify(project)));
          for (const ab of project.artboards) {
            player.goTo(ab.id);
            player.step(3000);
            await flush();
          }
          expect(err).not.toHaveBeenCalled();
          err.mockRestore();
          player.destroy?.();
        });
      }

      it('starts on a hero page whose Start button goes to the activity', async () => {
        const { project, board } = build(s.key);
        const player = play(project);
        expect(player.artboard.name).toBe('Start');
        await click(byName(board('Start'), 'Start button')!.id);
        await flush();
        expect(player.artboard.id).toBe(project.artboards[1].id);
        player.destroy?.();
      });
    });
  }
});

describe('Label the diagram', () => {
  const setup = () => {
    const { project, board } = build('drag/label-the-diagram');
    const page = board('Activity');
    const player = play(project, page);
    const id = (name: string) => byName(page, name)!.id;
    const place = async (label: number, spot: number) => {
      await click(id(`Label ${label}`));
      await click(id(`Spot ${spot}`));
      player.step(400);
    };
    return { project, page, player, id, place };
  };

  it('has six spots, six draggable labels, and keyboard drag works', () => {
    const { page, player, id } = setup();
    const all: SceneNode[] = [];
    walk(page.children, (n: SceneNode) => void all.push(n));
    expect(all.filter((n) => n.dropZone)).toHaveLength(6);
    expect(all.filter((n) => n.draggable)).toHaveLength(6);
    const label = must(id('Label 2'));
    expect(label.tabIndex).toBe(0);
    label.focus();
    key(label, ' ');
    key(label, 'ArrowRight');
    key(label, ' ');
    expect(Object.values(player.dragState()).filter(Boolean)).toHaveLength(1);
    expect(player.dragState()['Label 2']).toMatch(/^Spot \d$/);
    expect(player.getVariable('label2Spot')).toBe(player.dragState()['Label 2']);
    player.destroy?.();
  });

  it('counts a placed label, marks right and wrong at Check, shows the answers and starts again', async () => {
    const { player, id, place } = setup();
    await place(1, 1);
    expect(player.getVariable('label1Spot')).toBe('Spot 1');
    await place(2, 3);
    await place(3, 2);
    await place(4, 4);
    await place(5, 5);
    await place(6, 6);
    expect(player.dragState()['Label 4']).toBe('Spot 4');
    await click(id('Check button'));
    player.step(100);
    //labels 2 and 3 are swapped: four right
    expect(player.getVariable('checked')).toBe(true);
    expect(player.getVariable('score')).toBe(4);
    expect(String(player.getVariable('message'))).toContain('4 of 6');
    //the labels are locked once checked
    expect(must(id('Label 1')).getAttribute('aria-description')).toBe('Right');
    expect(must(id('Label 2')).getAttribute('aria-description')).toBe('Wrong');
    await click(id('Show answers button'));
    player.step(400);
    expect(player.dragState()['Label 2']).toBe('Spot 2');
    expect(player.dragState()['Label 3']).toBe('Spot 3');
    expect(player.getVariable('shown')).toBe(true);
    await click(id('Try again button'));
    player.step(400);
    expect(player.getVariable('checked')).toBe(false);
    expect(player.getVariable('score')).toBe(0);
    expect(Object.values(player.dragState()).every((z) => !z)).toBe(true);
    expect(player.getVariable('label2Spot')).toBe('');
    //and a perfect round
    for (let i = 1; i <= 6; i++) await place(i, i);
    await click(id('Check button'));
    expect(player.getVariable('score')).toBe(6);
    expect(String(player.getVariable('message'))).toContain('All 6');
    player.destroy?.();
  });
});

describe('Sort into groups', () => {
  it('counts right drops, refuses wrong ones with feedback, finishes on a results page and tries again', async () => {
    const { project, board } = build('drag/sort-into-groups');
    const page = board('Activity');
    const player = play(project, page);
    const id = (name: string) => byName(page, name)!.id;
    const drop = async (card: string, group: string) => {
      await click(id(card));
      await click(id(group));
      player.step(400);
    };
    await drop('Ice cube', 'Solid');
    expect(player.getVariable('solidCards')).toEqual(['Ice cube']);
    expect(String(player.getVariable('message'))).toBe('Ice cube goes in Solid. Right.');
    const honey = byName(page, 'Honey')!;
    dragOnto(honey, honey.id, byName(page, 'Solid')!);
    await flush();
    expect(player.getVariable('misses')).toBe(1);
    expect(String(player.getVariable('message'))).toContain('Honey does not go in Solid');
    expect(player.dragState().Honey).toBeNull();
    expect(player.getVariable('liquidCards')).toEqual([]);
    const cards: [string, string][] = [['Brick', 'Solid'], ['Wooden chair', 'Solid'], ['Honey', 'Liquid'], ['Orange juice', 'Liquid'], ['Water vapour', 'Gas'], ['Oxygen', 'Gas'], ['Helium', 'Gas']];
    for (const [c, g] of cards) await drop(c, g);
    expect(String(player.getVariable('message'))).toBe('All 8 sorted. Well done!');
    expect(String((player.getVariable('solidCards') as unknown[]).length + (player.getVariable('liquidCards') as unknown[]).length + (player.getVariable('gasCards') as unknown[]).length)).toBe('8');
    await click(id('See results button'));
    await flush();
    expect(player.artboard.name).toBe('Results');
    expect(document.body.textContent).toContain('1 wrong drop.');
    await click(byName(board('Results'), 'Try again button')!.id);
    await flush();
    expect(player.artboard.name).toBe('Activity');
    expect(player.getVariable('misses')).toBe(0);
    expect(player.getVariable('solidCards')).toEqual([]);
    expect(player.dragState()['Ice cube']).toBeNull();
    player.destroy?.();
  });
});

describe('Put in order', () => {
  it('passes the check in the right order, and carries on to the results', async () => {
    const { project, board } = build('drag/put-in-order');
    const page = board('Activity');
    const frame = questionFrames(page)[0];
    expect(frame.question!.kind).toBe('ordering');
    expect(frame.question!.options).toHaveLength(6);
    const player = play(project, page);
    await flush();
    const parts = partsOf(frame);
    const right = frame.question!.options.map((o) => o.id);
    const order = () => (player.getVariable('order_items') as { id: string }[]).map((i) => i.id);
    //walk each item up to its place with the move up buttons
    for (let target = 0; target < right.length; target++) {
      for (let at = order().indexOf(right[target]); at > target; at--) await click(`${parts.moveUp[0].id}~${at}`);
    }
    expect(order()).toEqual(right);
    await click(parts.check[0].id);
    expect(player.getVariable('order_correct')).toBe(true);
    expect(player.getVariable('order_score')).toBe(6);
    expect(player.getVariable('order_locked')).toBe(true);
    await click(byName(page, 'See results button')!.id);
    await flush();
    expect(player.artboard.name).toBe('Results');
    expect(document.body.textContent).toContain('You scored 6 of 6.');
    player.destroy?.();
  });

  it('says a wrong order is wrong', async () => {
    const { project, board } = build('drag/put-in-order');
    const page = board('Activity');
    const frame = questionFrames(page)[0];
    const player = play(project, page);
    await flush();
    const parts = partsOf(frame);
    const items = player.getVariable('order_items') as { id: string }[];
    const right = frame.question!.options.map((o) => o.id);
    //put it right, then swap the first two
    for (let target = 0; target < right.length; target++) {
      for (let at = (player.getVariable('order_items') as typeof items).findIndex((i) => i.id === right[target]); at > target; at--) await click(`${parts.moveUp[0].id}~${at}`);
    }
    await click(`${parts.moveDown[0].id}~0`);
    await click(parts.check[0].id);
    expect(player.getVariable('order_correct')).toBe(false);
    expect(String(player.getVariable('order_feedback'))).toContain('right place');
    player.destroy?.();
  });
});

describe('Interactive timeline', () => {
  it('draws the line on a timeline when the page opens, and respects reduced motion', () => {
    const { project, board } = build('drag/interactive-timeline');
    const page = board('Timeline');
    expect(page.timelines).toHaveLength(1);
    expect(page.timelines[0]).toMatchObject({ name: 'Intro', autoplay: true, loop: 'once' });
    const line = byName(page, 'Timeline line')!;
    expect(page.timelines[0].tracks.some((t) => t.nodeId === line.id && t.prop === 'scaleX')).toBe(true);
    expect(project.settings.reducedMotion).toBe(true);
    const dots = page.children.filter((n) => /^Event \d dot$/.test(n.name));
    expect(dots).toHaveLength(7);
  });

  it('opens an event on a click or when tabbed to, and Previous and Next walk along', async () => {
    const { project, board } = build('drag/interactive-timeline');
    const page = board('Timeline');
    const player = play(project, page);
    player.step(4000);
    await flush();
    const id = (name: string) => byName(page, name)!.id;
    const shown = (name: string) => {
      const el = elOf(id(name));
      return !!el && el.style.display !== 'none';
    };
    expect(player.getVariable('current')).toBe(0);
    await click(id('Event 3 dot'));
    expect(player.getVariable('current')).toBe(3);
    player.step(50);
    //the detail panel for 3 is showing, and the others are not
    expect(shown('Event 3 details')).toBe(true);
    expect(shown('Event 2 details')).toBe(false);
    expect(elOf(id('Event 3 details'))!.textContent).toContain('Apollo 11');
    await click(id('Next button'));
    expect(player.getVariable('current')).toBe(4);
    await click(id('Previous button'));
    await click(id('Previous button'));
    expect(player.getVariable('current')).toBe(2);
    (must(id('Event 6 dot')).querySelector('button') ?? must(id('Event 6 dot'))).focus();
    await flush();
    expect(player.getVariable('current')).toBe(6);
    player.step(50);
    expect(shown('Event 5 details')).toBe(false);
    expect(elOf(id('Event 6 details'))!.textContent).toContain('International Space Station');
    player.destroy?.();
  });
});
