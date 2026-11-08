//The second batch of the explore set (Image sequence, Information wall, Collage, Chart): each builds in every colourway,
//normalises, paints only with tokens, plays in the player without throwing, and its main interaction works.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, REPEAT_SEP, normalizeProject, walk, type Project, type SceneNode } from 'interactives-player';
import { STARTERS } from '../src/lib/branded/sets/explore';
import { projectFromBrandedStarter } from '../src/lib/branded';
import { COLOURWAYS } from '../src/lib/branded/looks';

const KEYS = ['explore/image-sequence', 'explore/information-wall', 'explore/collage', 'explore/chart'];
const NEW = STARTERS.filter((s) => KEYS.includes(s.key));
const starter = (key: string) => NEW.find((s) => s.key === key)!;

const flush = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const el = (id: string) => document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`)!;
const layer = (p: Project, name: string, page = -1): SceneNode => {
  let hit: SceneNode | undefined;
  for (const ab of page < 0 ? p.artboards : [p.artboards[page]]) walk(ab.children, (n) => void (!hit && n.name === name && (hit = n)));
  if (!hit) throw new Error(`no layer ${name}`);
  return hit;
};

describe('explore starters, second batch', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:1024px;height:640px"></div>';
    vi.stubGlobal('requestAnimationFrame', (fn: () => void) => setTimeout(fn, 0) as unknown as number);
    vi.stubGlobal('cancelAnimationFrame', (h: number) => clearTimeout(h));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('has the four starters, keyed explore/..., after the first five', () => {
    expect(NEW.map((s) => s.key)).toEqual(KEYS);
    expect(STARTERS.slice(0, 5).map((s) => s.key)).toEqual(['explore/image-hotspots', 'explore/accordion', 'explore/flip-and-dialog-cards', 'explore/image-slider', 'explore/before-and-after']);
    for (const s of NEW) {
      expect(s.description.length).toBeGreaterThan(40);
      expect(s.description).not.toMatch(/—/);
    }
  });

  for (const s of NEW) {
    describe(s.name, () => {
      for (const way of COLOURWAYS) {
        it(`builds in ${way.name}, normalises and paints only with tokens`, () => {
          const project = projectFromBrandedStarter(s, way);
          expect(project.themes!.default).toBe(`theme-${way.id}`);
          expect(project.settings.startArtboardId).toBe(project.artboards[0].id);
          expect(project.artboards[0].name).not.toBe('');
          //no hex colour in a layer, a background or an expression
          expect(JSON.stringify(project.artboards.map((a) => [a.children, a.background, a.logic]))).not.toMatch(/#[0-9a-f]{3,8}\b/i);
          const again = normalizeProject(JSON.parse(JSON.stringify(project)));
          expect(again.artboards.length).toBe(project.artboards.length);
          const ids = new Set<string>();
          for (const ab of project.artboards) walk(ab.children, (n) => (expect(ids.has(n.id)).toBe(false), ids.add(n.id)));
        });
      }

      it('has a checklist pointing at real layers, and no em dashes in the words people read', () => {
        const { project, checklist } = s.build(COLOURWAYS[0]);
        expect(checklist.length).toBeGreaterThanOrEqual(6);
        for (const c of checklist) {
          expect(c.text).not.toMatch(/—/);
          if (c.nodeId) {
            let found = false;
            for (const ab of project.artboards) walk(ab.children, (n) => void (n.id === c.nodeId && (found = true)));
            expect(found, c.text).toBe(true);
          }
          if (c.artboardId) expect(project.artboards.some((a) => a.id === c.artboardId)).toBe(true);
        }
        const words: string[] = [];
        for (const ab of project.artboards) walk(ab.children, (n) => void ('text' in n && typeof n.text === 'string' && words.push(n.text)));
        expect(words.join(' ')).not.toMatch(/—/);
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
          for (let i = 0; i < s.build(way).project.artboards.length; i++) {
            const { project } = s.build(way);
            project.settings.startArtboardId = project.artboards[i].id;
            const errors: unknown[] = [];
            const spy = vi.spyOn(console, 'error').mockImplementation((...a) => void errors.push(a));
            const player = new Player(document.getElementById('stage')!, JSON.parse(JSON.stringify(project)), { loadData: false });
            await flush();
            player.step(16);
            player.destroy();
            spy.mockRestore();
            expect(errors).toEqual([]);
          }
        }
      });

      it('starts on a hero page whose button goes to the activity', async () => {
        const { project } = s.build(COLOURWAYS[0]);
        const player = new Player(document.getElementById('stage')!, project, { loadData: false });
        await flush();
        expect(player.artboard.id).toBe(project.artboards[0].id);
        el(layer(project, 'Start').id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flush(400);
        expect(player.artboard.id).toBe(project.artboards[1].id);
        player.destroy();
      });
    });
  }

  const play = async (project: Project, page = 1) => {
    project.settings.startArtboardId = project.artboards[page].id;
    const player = new Player(document.getElementById('stage')!, project, { loadData: false });
    await flush();
    return player;
  };
  const click = async (id: string, ms = 30) => {
    el(id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush(ms);
  };
  const shown = (id: string) => !!el(id) && el(id).style.display !== 'none';
  const inputValue = async (id: string, value: string) => {
    const input = el(id).querySelector('input')!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(30);
  };

  it('image sequence: the slider, Previous, Next and the stage names move the stage, one picture and caption at a time', async () => {
    const { project } = starter('explore/image-sequence').build(COLOURWAYS[0]);
    const player = await play(project);
    const frames = () => [1, 2, 3, 4, 5, 6].filter((i) => shown(layer(project, `Image ${i}`).id));
    const caption = () => el(layer(project, 'Stage caption').id).textContent;
    const slider = el(layer(project, 'Stage slider').id).querySelector('input')!;
    expect(slider.type).toBe('range');
    expect(slider.min).toBe('1');
    expect(slider.max).toBe('6');
    expect(frames()).toEqual([1]);
    expect(caption()).toContain('tiny plant');
    expect(el(layer(project, 'Stage count').id).textContent).toBe('Stage 1 of 6');
    //the slider moves the stage
    slider.value = '4';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(30);
    expect(player.getVariable('step')).toBe(4);
    expect(frames()).toEqual([4]);
    expect(caption()).toContain('stem gets taller');
    expect(el(layer(project, 'Stage title').id).textContent).toBe('A young plant');
    //Next and Previous, and their ends
    await click(layer(project, 'Next').id);
    expect(frames()).toEqual([5]);
    await click(layer(project, 'Previous').id);
    await click(layer(project, 'Previous').id);
    expect(player.getVariable('step')).toBe(3);
    const prev = el(layer(project, 'Previous').id).querySelector('button') ?? el(layer(project, 'Previous').id);
    await click(layer(project, 'Stage 1 name').id);
    expect(frames()).toEqual([1]);
    expect((prev as HTMLButtonElement).disabled).toBe(true);
    await click(layer(project, 'Stage 6 name').id);
    expect(frames()).toEqual([6]);
    const next = el(layer(project, 'Next').id).querySelector('button') ?? el(layer(project, 'Next').id);
    expect((next as HTMLButtonElement).disabled).toBe(true);
    //the stage names are keyboard buttons that say where they go
    expect(el(layer(project, 'Stage 3 name').id).getAttribute('role')).toBe('button');
    expect(el(layer(project, 'Stage 3 name').id).getAttribute('aria-label')).toBe('Go to stage 3: A seedling');
    expect(el(layer(project, 'Stage 6 name').id).getAttribute('aria-current')).toBe('step');
    expect(el(layer(project, 'Stage 3 name').id).hasAttribute('aria-current')).toBe(false);
    //native pieces: one Solo group for the pictures, one flow for the names (event.childIndex), and a live total
    const images = layer(project, 'Images') as SceneNode & { solo?: { active: string | null }; bindings?: Record<string, string> };
    expect(images.solo).toBeTruthy();
    expect(images.bindings!['solo.active']).toBe('"Image " + step');
    const nameFlows = project.artboards[1].logic.nodes.filter((g) => g.kind === 'event.pointer' && g.params.target === layer(project, 'Stage names').id);
    expect(nameFlows).toHaveLength(1);
    expect(nameFlows[0].params.childrenOnly).toBe(true);
    expect(project.variables.find((v) => v.name === 'total')).toMatchObject({ live: true, formula: 'stages.length' });
    //the slider is in the tab order and has the focus on arrival, so the arrow keys work straight away
    expect(document.activeElement).toBe(slider);
    player.destroy();
  });

  it('information wall: the search filters as you type, a tag narrows it, and Clear brings everything back', async () => {
    const { project } = starter('explore/information-wall').build(COLOURWAYS[0]);
    const player = await play(project);
    const tiles = () => document.querySelectorAll(`[data-ix-id^="${layer(project, 'Panel').id}"]`).length;
    const titles = () => [...document.querySelectorAll(`[data-ix-id^="${layer(project, 'Panel title').id}"]`)].map((e) => e.textContent);
    const count = () => el(layer(project, 'Count').id).textContent;
    expect(count()).toBe('Showing 12 of 12');
    expect(titles()).toHaveLength(12);
    expect(titles()[0]).toBe('Make a weekly plan');
    expect(tiles()).toBeGreaterThanOrEqual(12);
    //typing filters straight away, in titles, text and tags, ignoring case
    await inputValue(layer(project, 'Search box').id, 'READ');
    expect(player.getVariable('query')).toBe('READ');
    expect(count()).toBe('Showing 4 of 12');
    expect(titles()).toEqual(['Skim before you read', 'Read with a question', 'Take notes in your words', 'Reference as you go']);
    //a tag on top of the search, and pressing it again lets it go (the topic buttons are one repeated button: Writing is copy 3)
    const topic = (k: number) => `${layer(project, 'Topic button').id}${REPEAT_SEP}${k}`;
    await click(topic(3));
    expect(player.getVariable('tag')).toBe('Writing');
    expect(titles()).toEqual(['Take notes in your words', 'Reference as you go']);
    expect(el(topic(3)).querySelector('button')!.getAttribute('aria-pressed')).toBe('true');
    expect(el(topic(0)).querySelector('button')!.getAttribute('aria-pressed')).toBe('false');
    await click(topic(3));
    expect(player.getVariable('tag')).toBe('');
    expect(count()).toBe('Showing 4 of 12');
    //nothing found says so
    await inputValue(layer(project, 'Search box').id, 'zebra');
    expect(count()).toBe('Showing 0 of 12');
    expect(titles()).toHaveLength(0);
    expect(shown(layer(project, 'Nothing found').id)).toBe(true);
    //Clear
    expect(shown(layer(project, 'Clear button').id)).toBe(true);
    await click(layer(project, 'Clear button').id);
    expect(player.getVariable('query')).toBe('');
    expect(count()).toBe('Showing 12 of 12');
    expect(titles()).toHaveLength(12);
    expect(shown(layer(project, 'Nothing found').id)).toBe(false);
    expect(shown(layer(project, 'Clear button').id)).toBe(false);
    //a tag alone
    await click(topic(3));
    expect(count()).toBe('Showing 5 of 12');
    await click(topic(0));
    expect(count()).toBe('Showing 12 of 12');
    expect(el(topic(0)).querySelector('button')!.getAttribute('aria-pressed')).toBe('true');
    //native pieces: the shown panels are a live variable, one flow serves every topic button, and Clear is a Reset variables node
    expect(project.variables.find((v) => v.name === 'shown')).toMatchObject({ live: true });
    const flows = project.artboards[1].logic.nodes;
    expect(flows.filter((g) => g.kind === 'event.pointer' && g.params.childrenOnly)).toHaveLength(1);
    expect(flows.some((g) => g.kind === 'action.resetVariables')).toBe(true);
    player.destroy();
  });

  it('collage: the layout variable picks the layout, buttons switch it, and hiding the buttons lifts the pictures', async () => {
    const { project } = starter('explore/collage').build(COLOURWAYS[0]);
    const player = await play(project);
    const cellId = layer(project, 'Collage cell').id;
    const cell = (k: number) => el(`${cellId}${REPEAT_SEP}${k}`);
    const btn = (k: number) => `${layer(project, 'Layout button').id}${REPEAT_SEP}${k}`;
    const at = (k: number) => {
      const m = /translate\(([-\d.]+)px, ([-\d.]+)px/.exec(cell(k).style.transform)!;
      return [Number(m[1]), Number(m[2]), parseFloat(cell(k).style.width), parseFloat(cell(k).style.height)];
    };
    const pressed = (k: number) => el(btn(k)).querySelector('button')!.getAttribute('aria-pressed');
    //one cell repeated for six pictures, whatever the layout, with each caption from the shared list
    expect(document.querySelectorAll(`[data-ix-id^="${cellId}${REPEAT_SEP}"]`).length).toBeGreaterThanOrEqual(6);
    expect(cell(5)).toBeTruthy();
    expect(cell(6)).toBeFalsy();
    const caption = (k: number) => el(`${layer(project, 'Caption').id}${REPEAT_SEP}${k}`).textContent;
    expect(caption(3)).toBe('Labs and studios');
    expect(pressed(0)).toBe('true');
    expect(pressed(2)).toBe('false');
    //grid: three across, two down
    expect(at(0)[2]).toBeCloseTo((928 - 20) / 3, 0);
    expect(at(3)[1]).toBeGreaterThan(at(0)[1]);
    await click(btn(2));
    expect(player.getVariable('layout')).toBe(3);
    expect(pressed(2)).toBe('true');
    expect(pressed(0)).toBe('false');
    //feature: the first picture is the big one
    expect(at(0)[2]).toBe(500);
    expect(at(0)[3]).toBe(408);
    expect(caption(3)).toBe('Labs and studios');
    await click(btn(3));
    expect(player.getVariable('layout')).toBe(4);
    //columns: six tall ones side by side
    expect(at(0)[3]).toBe(408);
    expect(at(5)[0]).toBeGreaterThan(at(4)[0]);
    //the author picks one with the variable and hides the buttons: no buttons, and the pictures move up
    const top = (id: string) => /translate\(([-\d.]+)px, ([-\d.]+)px/.exec(el(id).style.transform)?.[2];
    const before = Number(top(layer(project, 'Collage').id));
    player.setVariable('showButtons', false);
    await flush(30);
    expect(shown(layer(project, 'Layout bar').id)).toBe(false);
    expect(Number(top(layer(project, 'Collage').id))).toBe(before - 52);
    //every layout's pictures stay inside the page
    const layouts = player.getVariable('layouts') as number[][][];
    expect(layouts).toHaveLength(4);
    for (const rects of layouts) {
      expect(rects).toHaveLength(6);
      for (const [x, y, w, h] of rects) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x + w).toBeLessThanOrEqual(928.5);
        expect(y + h).toBeLessThanOrEqual(408.5);
      }
    }
    //native pieces: the cells are a live list, and one flow serves all the buttons
    expect(project.variables.find((v) => v.name === 'cells')).toMatchObject({ live: true });
    expect(project.artboards[1].logic.nodes.filter((g) => g.kind === 'event.pointer' && g.params.childrenOnly)).toHaveLength(1);
    player.destroy();
  });

  //The marks (bars, slices) of a native chart layer, and what each says: the layer draws them and speaks them itself
  const marks = (id: string) => [...el(id).querySelectorAll<SVGElement>('[data-ix-point]')];
  const says = (id: string) => marks(id).map((m) => m.getAttribute('aria-label'));
  const barH = (id: string, k: number) => Number(marks(id)[k].getAttribute('height'));
  const copy = (id: string, k: number) => `${id}${REPEAT_SEP}${k}`;
  const hoverReadout = (id: string) => el(id).querySelector<HTMLElement>('.ix-chart-readout')!;

  it('chart: the bars are a native chart layer on the data, redrawn when it changes, with its own scale and hidden table', async () => {
    const { project } = starter('explore/chart').build(COLOURWAYS[0]);
    const player = await play(project);
    const chartId = layer(project, 'Bar chart').id;
    expect((layer(project, 'Bar chart') as SceneNode & { type: string; kind: string; data: string }).type).toBe('chart');
    expect((layer(project, 'Bar chart') as SceneNode & { kind: string }).kind).toBe('column');
    expect((layer(project, 'Bar chart') as SceneNode & { data: string }).data).toBe('rows');
    //normal week: the biggest is 8, so Assignments (8) is a third taller than Reading (6) and the scale tops out at 8
    expect(marks(chartId)).toHaveLength(6);
    expect(barH(chartId, 2) / barH(chartId, 0)).toBeCloseTo(8 / 6, 1);
    expect(says(chartId)[2]).toBe('Assignments: 8 hours');
    expect(el(chartId).textContent).toContain('Reading');
    //the layer keeps a hidden table of the same numbers for screen readers
    expect(el(chartId).querySelector('table')).toBeTruthy();
    //the exam week button sets the data and everything redraws with a new scale
    await click(copy(layer(project, 'Data button').id, 1));
    expect((player.getVariable('rows') as { value: number }[])[4].value).toBe(14);
    expect(says(chartId)[4]).toBe('Revision: 14 hours');
    expect(barH(chartId, 4) / barH(chartId, 2)).toBeCloseTo(14 / 4, 1);
    expect(el(copy(layer(project, 'Data button').id, 1)).querySelector('button')!.getAttribute('aria-pressed')).toBe('true');
    expect(el(copy(layer(project, 'Data button').id, 0)).querySelector('button')!.getAttribute('aria-pressed')).toBe('false');
    //so does setting the list from anywhere else (an author's own numbers, any labels)
    player.setVariable('rows', [{ label: 'A', value: 1 }, { label: 'B', value: 2 }, { label: 'C', value: 3 }, { label: 'D', value: 4 }, { label: 'E', value: 2 }, { label: 'F', value: 1 }]);
    await flush(30);
    expect(says(chartId)[3]).toBe('D: 4 hours');
    expect(barH(chartId, 3) / barH(chartId, 0)).toBeCloseTo(4, 1);
    //the data buttons and the views are each one repeated button with one flow
    const flows = project.artboards[1].logic.nodes.filter((g) => g.kind === 'event.pointer' && g.params.childrenOnly);
    expect(flows).toHaveLength(2);
    expect(project.variables.find((v) => v.name === 'rowsTotal')).toMatchObject({ live: true });
    player.destroy();
  });

  it('chart: a value shows on hover and on focus, a click or Enter keeps it in the line below, and the other views clear it', async () => {
    const { project } = starter('explore/chart').build(COLOURWAYS[0]);
    const player = await play(project);
    const chartId = layer(project, 'Bar chart').id;
    const readout = () => el(layer(project, 'Readout').id).textContent;
    expect(readout()).toContain('Hover over, or Tab to');
    //the layer's own readout shows on hover and goes on leaving
    const third = marks(chartId)[2];
    third.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, relatedTarget: document.getElementById('stage') }));
    await flush(30);
    expect(hoverReadout(chartId).style.display).toBe('block');
    expect(hoverReadout(chartId).textContent).toBe('Assignments: 8 hours');
    third.dispatchEvent(new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.getElementById('stage') }));
    await flush(30);
    expect(hoverReadout(chartId).style.display).toBe('none');
    //a click on a mark gives event.index, which sets the line below with the share
    third.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush(30);
    expect(player.getVariable('pick')).toBe(3);
    expect(readout()).toBe('Assignments: 8 hours (29% of the total)');
    //focus does the same, and each mark says its value out loud and is in the tab order
    const fifth = marks(chartId)[4];
    expect(fifth.getAttribute('role')).toBe('img');
    expect(fifth.getAttribute('aria-label')).toBe('Revision: 5 hours');
    expect(marks(chartId).some((m) => m.tabIndex === 0)).toBe(true);
    fifth.focus();
    await flush(30);
    expect(player.getVariable('pick')).toBe(5);
    expect(readout()).toBe('Revision: 5 hours (18% of the total)');
    expect(hoverReadout(chartId).textContent).toBe('Revision: 5 hours');
    //changing the view clears it
    await click(copy(layer(project, 'View button').id, 1));
    expect(player.getVariable('pick')).toBe(0);
    expect(readout()).toContain('Hover over, or Tab to');
    player.destroy();
  });

  it('chart: the pie is a native chart layer that follows the data, and the table has every number', async () => {
    const { project } = starter('explore/chart').build(COLOURWAYS[0]);
    const player = await play(project);
    const pieId = layer(project, 'Pie chart').id;
    const view = (k: number) => copy(layer(project, 'View button').id, k);
    expect(shown(pieId)).toBe(false);
    expect(shown(layer(project, 'Data table').id)).toBe(false);
    expect(el(view(0)).querySelector('button')!.getAttribute('aria-pressed')).toBe('true');
    await click(view(1));
    expect(player.getVariable('view')).toBe('pie');
    expect(el(view(1)).querySelector('button')!.getAttribute('aria-pressed')).toBe('true');
    expect(shown(pieId)).toBe(true);
    expect(shown(layer(project, 'Bar chart').id)).toBe(false);
    expect((layer(project, 'Pie chart') as SceneNode & { kind: string }).kind).toBe('pie');
    //each slice says its value and its share, and they are drawn for every item
    expect(marks(pieId)).toHaveLength(6);
    expect(says(pieId)[2]).toBe('Assignments: 8 hours (28.6%)');
    expect(el(pieId).textContent).toContain('Online forums');
    //a mark picked on the pie sets the line below
    marks(pieId)[3].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush(30);
    expect(player.getVariable('pick')).toBe(4);
    expect(el(layer(project, 'Readout').id).textContent).toBe('Group work: 3 hours (11% of the total)');
    //new data redraws the pie
    await click(copy(layer(project, 'Data button').id, 1));
    expect(says(pieId)[4]).toBe('Revision: 14 hours (46.7%)');
    //the table: a row for each item of the data, repeated, and a total
    await click(view(2));
    expect(shown(layer(project, 'Data table').id)).toBe(true);
    expect(shown(pieId)).toBe(false);
    const row = (name: string, k: number) => el(copy(layer(project, name).id, k)).textContent;
    expect(row('Row category', 4)).toBe('Revision');
    expect(row('Row value', 4)).toBe('14');
    expect(row('Row share', 4)).toBe('47%');
    expect(el(layer(project, 'Total value').id).textContent).toBe('30');
    expect(shown(layer(project, 'Readout').id)).toBe(false);
    expect(el(layer(project, 'Data table').id).getAttribute('aria-label')).toContain('Table of hours');
    player.destroy();
  });

  it('chart: the unit is one variable, and every chart (the guess chart too) reads its suffix from it', async () => {
    const { project } = starter('explore/chart').build(COLOURWAYS[0]);
    for (const c of ['Bar chart', 'Pie chart', 'Guess chart']) expect((layer(project, c, c === 'Guess chart' ? 2 : 1) as SceneNode & { suffix: string }).suffix).toBe(' {unit}');
    const player = await play(project);
    expect(says(layer(project, 'Bar chart').id)[0]).toBe('Reading: 6 hours');
    player.setVariable('unit', 'minutes');
    await flush(30);
    expect(says(layer(project, 'Bar chart').id)[0]).toBe('Reading: 6 minutes');
    player.destroy();
  });

  it('chart: a guess is made before the reveal, the answer is hidden until then, and Next moves on', async () => {
    const { project } = starter('explore/chart').build(COLOURWAYS[0]);
    const player = await play(project);
    const gl = (name: string) => layer(project, name, 2);
    await click(layer(project, 'Take a guess button', 1).id, 400);
    expect(player.artboard.name).toBe('Your guess');
    expect(el(gl('Question').id).textContent).toContain('on Reading');
    //before the reveal: the bar being guessed is a hidden item (a dashed "?" outline, read out as hidden, never as 0 hours or its real value), and the guess is the last bar
    const chartId = gl('Guess chart').id;
    expect(says(chartId)[0]).toBe('Reading: hidden');
    expect(says(chartId)[1]).toBe('Lectures: 4 hours');
    expect(says(chartId)).toHaveLength(7);
    expect(marks(chartId)[0].getAttribute('stroke-dasharray')).toBeTruthy();
    expect(marks(chartId)[0].getAttribute('fill')).toBe('none');
    expect(marks(chartId)[1].getAttribute('stroke-dasharray')).toBeNull();
    expect(el(chartId).textContent).toContain('?');
    //the table for screen readers says hidden too
    expect(el(chartId).textContent).toContain('Readinghidden');
    expect(JSON.stringify(document.body.innerHTML)).not.toContain('Reading: 6');
    //the slider makes the guess bar (20 is the top of the scale, the chart is 250 high)
    const slider = el(gl('Guess slider').id).querySelector('input')!;
    expect(slider.max).toBe('20');
    slider.value = '5';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(30);
    expect(player.getVariable('guess')).toBe(5);
    expect(says(chartId)[6]).toBe('Your guess: 5 hours');
    expect(barH(chartId, 6) / barH(chartId, 1)).toBeCloseTo(5 / 4, 1);
    expect(el(gl('Guess readout').id).textContent).toBe('Your guess: 5 hours');
    expect(player.getVariable('verdict')).toBe('');
    //reveal: the live verdict says how it went, the real bar is there, the slider is dimmed and stops
    await click(gl('Reveal button').id);
    expect(player.getVariable('revealed')).toBe(true);
    expect(String(player.getVariable('verdict'))).toBe('You guessed 5 hours. The answer is 6: 1 too low.');
    expect(says(chartId)[0]).toBe('Reading: 6 hours');
    expect(barH(chartId, 0) / barH(chartId, 1)).toBeCloseTo(6 / 4, 1);
    expect(shown(gl('Reveal button').id)).toBe(false);
    expect(shown(gl('Next category button').id)).toBe(true);
    expect(slider.disabled).toBe(true);
    //the focus moves on to Next, now the Reveal button has gone
    await flush(30);
    expect(document.activeElement?.closest('[data-ix-id]')).toBe(el(gl('Next category button').id));
    //next one: the guess starts again and the next category is hidden
    await click(gl('Next category button').id);
    expect(player.getVariable('target')).toBe(2);
    expect(player.getVariable('guess')).toBe(0);
    expect(player.getVariable('revealed')).toBe(false);
    expect(slider.disabled).toBe(false);
    expect(el(gl('Question').id).textContent).toContain('on Lectures');
    expect(says(chartId)[1]).toBe('Lectures: hidden');
    expect(says(chartId)[0]).toBe('Reading: 6 hours');
    //a guess that is spot on, and one that is too high, then the last category offers Start again
    slider.value = '4';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(30);
    await click(gl('Reveal button').id);
    expect(String(player.getVariable('verdict'))).toContain('exactly right');
    player.setVariable('target', 6);
    player.setVariable('revealed', false);
    player.setVariable('guess', 9);
    await flush(30);
    await click(gl('Reveal button').id);
    expect(String(player.getVariable('verdict'))).toBe('You guessed 9 hours. The answer is 2: 7 too high.');
    expect(shown(gl('Next category button').id)).toBe(false);
    expect(shown(gl('Start again button').id)).toBe(true);
    await click(gl('Start again button').id);
    expect(player.getVariable('target')).toBe(1);
    expect(player.getVariable('revealed')).toBe(false);
    //back to the chart keeps the data
    await click(gl('Back to the chart').id, 400);
    expect(player.artboard.name).toBe('Chart');
    player.destroy();
  });
});
