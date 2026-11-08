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
  const WORDS = ['Evaporation', 'Condensation', 'Precipitation', 'Collection', 'Transpiration', 'Runoff'];
  const setup = () => {
    const { project, board } = build('drag/label-the-diagram');
    const page = board('Activity');
    const frame = questionFrames(page)[0];
    const player = play(project, page);
    const id = (name: string) => byName(page, name)!.id;
    const place = async (word: string, spot: number) => {
      await click(id(word));
      await click(id(`Spot ${spot}`));
      player.step(400);
    };
    return { project, page, frame, player, id, place };
  };

  it('is a matching question: six spots on the picture, six labels and a wrong one, and keyboard drag works', () => {
    const { page, frame, player, id } = setup();
    expect(frame.question).toMatchObject({ kind: 'matching', points: 6 });
    expect(frame.question!.pairs).toHaveLength(6);
    expect(frame.question!.extras).toHaveLength(1);
    const all: SceneNode[] = [];
    walk(page.children, (n: SceneNode) => void all.push(n));
    expect(all.filter((n) => n.dropZone)).toHaveLength(6);
    expect(all.filter((n) => n.draggable)).toHaveLength(7);
    //the spots sit on the picture, not in a list of definitions
    expect(partsOf(frame).matchDefinition ?? []).toHaveLength(0);
    const label = must(id('Condensation'));
    expect(label.tabIndex).toBe(0);
    label.focus();
    key(label, ' ');
    key(label, 'ArrowRight');
    key(label, ' ');
    expect(Object.values(player.dragState()).filter(Boolean)).toHaveLength(1);
    expect(player.dragState().Condensation).toMatch(/^Spot \d$/);
    player.destroy?.();
  });

  it('marks right and wrong at Check, says what belongs on a wrong spot, and starts again', async () => {
    const { player, frame, id, place } = setup();
    await flush();
    //Precipitation and Condensation are swapped, and the wrong label sits on Spot 6
    await place('Evaporation', 1);
    await place('Condensation', 3);
    await place('Precipitation', 2);
    await place('Collection', 4);
    await place('Transpiration', 5);
    await place('Infiltration', 6);
    expect(player.dragState().Infiltration).toBe('Spot 6');
    const check = partsOf(frame).check[0].id;
    await click(check);
    expect(player.getVariable('label_correct')).toBe(false);
    expect(player.getVariable('label_locked')).toBe(false);
    await click(check);
    await click(check);
    expect(player.getVariable('label_locked')).toBe(true);
    const items = player.getVariable('label_items') as { state: string; answer?: string }[];
    //the last row is the wrong label, which counts against the spot it was put on
    expect(items.map((i) => i.state)).toEqual(['correct', 'wrong', 'wrong', 'correct', 'correct', 'wrong', 'wrong']);
    expect(items[5].answer).toBe('Runoff');
    player.step(100);
    expect(must(id('Spot 1 result')).textContent).toContain('Right');
    expect(must(id('Spot 2 result')).textContent).toContain('Wrong. The answer is Condensation');
    expect(player.getVariable('label_score')).toBeLessThan(6);
    await click(id('Try again'));
    player.step(400);
    expect(player.getVariable('label_locked')).toBe(false);
    expect(Object.values(player.dragState()).every((z) => !z)).toBe(true);
    //and a perfect round, on to the results
    for (let i = 0; i < 6; i++) await place(WORDS[i], i + 1);
    await click(check);
    expect(player.getVariable('label_correct')).toBe(true);
    expect(player.getVariable('label_score')).toBe(6);
    expect(String(player.getVariable('label_feedback'))).toContain('Every label');
    await click(id('See results button'));
    await flush();
    expect(player.artboard.name).toBe('Results');
    expect(document.body.textContent).toContain('You put 6 of 6 labels on the right spot.');
    player.destroy?.();
  });
});

describe('Sort into groups', () => {
  it('is a categorise question: a drop says right or wrong, wrong ones are counted, Check marks the lot, and the results and Try again follow', async () => {
    const { project, board } = build('drag/sort-into-groups');
    const page = board('Activity');
    const frame = questionFrames(page)[0];
    expect(frame.question).toMatchObject({ kind: 'categorise', dropFeedback: true, points: 8 });
    expect(frame.question!.groups).toHaveLength(3);
    expect(frame.question!.cards).toHaveLength(8);
    //the hand-built zones, cards and count of drops are gone: the kit's parts are what is dragged
    expect(partsOf(frame).catCard).toHaveLength(8);
    expect(partsOf(frame).catZone).toHaveLength(3);
    expect(project.variables.some((v) => v.name === 'solidCards')).toBe(false);
    const player = play(project, page);
    await flush();
    const id = (name: string) => byName(page, name)!.id;
    const drop = async (card: string, group: string) => {
      await click(id(card));
      await click(id(group));
      player.step(400);
    };
    await drop('Ice cube', 'Solid');
    expect(String(player.getVariable('sort_feedback'))).toBe('Ice cube goes in Solid. Right.');
    expect(player.getVariable('misses')).toBe(0);
    //a wrong drop does not use a try, and is counted
    await drop('Honey', 'Solid');
    expect(player.getVariable('misses')).toBe(1);
    expect(String(player.getVariable('sort_feedback'))).toContain('Honey does not go in Solid');
    expect(player.getVariable('sort_attempts')).toBe(0);
    expect(document.body.textContent).toContain('Wrong drops: 1');
    const cards: [string, string][] = [['Brick', 'Solid'], ['Wooden chair', 'Solid'], ['Honey', 'Liquid'], ['Orange juice', 'Liquid'], ['Water vapour', 'Gas'], ['Oxygen', 'Gas'], ['Helium', 'Gas']];
    for (const [c, g] of cards) await drop(c, g);
    await click(partsOf(frame).check[0].id);
    expect(player.getVariable('sort_correct')).toBe(true);
    expect(player.getVariable('sort_score')).toBe(8);
    expect(player.getVariable('sort_locked')).toBe(true);
    await click(id('See results button'));
    await flush();
    expect(player.artboard.name).toBe('Results');
    expect(document.body.textContent).toContain('8 of 8 cards in the right group, with 1 wrong drop on the way.');
    await click(byName(board('Results'), 'Try again button')!.id);
    await flush();
    expect(player.artboard.name).toBe('Activity');
    expect(player.getVariable('misses')).toBe(0);
    expect(player.getVariable('sort_locked')).toBe(false);
    expect(player.dragState()['Ice cube']).toBeNull();
    player.destroy?.();
  });

  it('Check marks a card in the wrong group and says where it goes', async () => {
    const { project, board } = build('drag/sort-into-groups');
    const page = board('Activity');
    const frame = questionFrames(page)[0];
    const player = play(project, page);
    await flush();
    const id = (name: string) => byName(page, name)!.id;
    //everything in Solid: the solid things are right, the rest are not
    for (const c of ['Brick', 'Ice cube', 'Wooden chair', 'Honey', 'Orange juice', 'Water vapour', 'Oxygen', 'Helium']) {
      await click(id(c));
      await click(id('Solid'));
      player.step(400);
    }
    await click(partsOf(frame).check[0].id);
    expect(player.getVariable('sort_correct')).toBe(false);
    expect(player.getVariable('sort_locked')).toBe(false);
    expect(String(player.getVariable('sort_feedback'))).toContain('3 of 8');
    //three tries, then it is finished and says where each card goes
    await click(partsOf(frame).check[0].id);
    await click(partsOf(frame).check[0].id);
    expect(player.getVariable('sort_locked')).toBe(true);
    const items = player.getVariable('sort_items') as { text: string; state: string; answer?: string }[];
    expect(items.find((i) => i.text === 'Honey')).toMatchObject({ state: 'wrong', answer: 'Liquid' });
    expect(items.find((i) => i.text === 'Ice cube')!.state).toBe('correct');
    expect(player.getVariable('sort_score')).toBe(3);
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
    //the line is a Progress layer, drawn from the left
    expect(line.type).toBe('progress');
    expect(page.timelines[0].tracks.some((t) => t.nodeId === line.id && t.prop === 'scaleX')).toBe(true);
    expect(project.settings.reducedMotion).toBe(true);
  });

  it('is one repeated marker over the events list, with one click flow and one focus flow for every dot', () => {
    const { project, board } = build('drag/interactive-timeline');
    const page = board('Timeline');
    const markers = byName(page, 'Event markers') as SceneNode & { repeat: { items: string } };
    expect(markers.repeat.items).toBe('events');
    expect(project.variables.find((v) => v.name === 'events')!.initial).toContain('Apollo 11');
    //the total is a live variable on the list
    expect(project.variables.find((v) => v.name === 'total')).toMatchObject({ formula: 'events.length', live: true });
    const flows = page.logic.nodes.filter((n) => (n.kind === 'event.pointer' || n.kind === 'event.focus') && n.params.target === markers.id);
    expect(flows.map((n) => n.kind).sort()).toEqual(['event.focus', 'event.pointer']);
    expect(flows.every((n) => n.params.childrenOnly === true)).toBe(true);
    expect(page.children.filter((n) => /^Event \d dot$/.test(n.name))).toHaveLength(0);
  });

  it('opens an event on a click or when tabbed to, and Previous and Next walk along', async () => {
    const { project, board } = build('drag/interactive-timeline');
    const page = board('Timeline');
    const player = play(project, page);
    player.step(4000);
    await flush();
    const id = (name: string) => byName(page, name)!.id;
    const dot = (i: number) => `${id('Event dot')}~${i}`;
    expect(player.getVariable('current')).toBe(0);
    expect(player.getVariable('total')).toBe(7);
    //every event has its marker, with its caption
    expect(document.body.textContent).toContain('Moon landing');
    expect(document.body.textContent).toContain('Curiosity on Mars');
    await click(dot(2));
    expect(player.getVariable('current')).toBe(3);
    player.step(50);
    //the detail card shows event 3, and says which dot is current
    const details = elOf(id('Event details'))!;
    expect(details.style.display).not.toBe('none');
    expect(details.textContent).toContain('Apollo 11');
    const control = (i: number) => must(dot(i)).querySelector('button') ?? must(dot(i));
    expect(control(2).getAttribute('aria-current')).toBe('step');
    expect(control(1).getAttribute('aria-current')).toBeNull();
    await click(id('Next button'));
    expect(player.getVariable('current')).toBe(4);
    await click(id('Previous button'));
    await click(id('Previous button'));
    expect(player.getVariable('current')).toBe(2);
    (must(dot(5)).querySelector('button') ?? must(dot(5))).focus();
    await flush();
    expect(player.getVariable('current')).toBe(6);
    player.step(50);
    expect(elOf(id('Event details'))!.textContent).toContain('International Space Station');
    //Next stops at the last event, and opening the page again starts from nothing chosen
    for (let i = 0; i < 4; i++) await click(id('Next button'));
    expect(player.getVariable('current')).toBe(7);
    player.goTo(board('Start').id);
    player.goTo(page.id);
    await flush();
    expect(player.getVariable('current')).toBe(0);
    player.destroy?.();
  });
});
