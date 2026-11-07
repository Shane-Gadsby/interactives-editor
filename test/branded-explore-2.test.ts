//The second batch of the explore set (Image sequence, Information wall, Collage, Chart): each builds in every colourway,
//normalises, paints only with tokens, plays in the player without throwing, and its main interaction works.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, normalizeProject, walk, type Project, type SceneNode } from 'interactives-player';
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
    expect(el(layer(project, 'Stage 6 name').id).getAttribute('aria-description')).toBe('Current stage');
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
    //a tag on top of the search, and pressing it again lets it go
    await click(layer(project, 'Tag Writing').id);
    expect(player.getVariable('tag')).toBe('Writing');
    expect(titles()).toEqual(['Take notes in your words', 'Reference as you go']);
    expect(el(layer(project, 'Tag Writing').id).getAttribute('aria-description')).toBe('Showing this topic');
    await click(layer(project, 'Tag Writing').id);
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
    await click(layer(project, 'Tag Writing').id);
    expect(count()).toBe('Showing 5 of 12');
    await click(layer(project, 'Tag All').id);
    expect(count()).toBe('Showing 12 of 12');
    player.destroy();
  });

  it('collage: the layout variable picks the layout, buttons switch it, and hiding the buttons lifts the pictures', async () => {
    const { project } = starter('explore/collage').build(COLOURWAYS[0]);
    const player = await play(project);
    const names = ['Layout 1 Grid', 'Layout 2 Banner', 'Layout 3 Feature', 'Layout 4 Columns'];
    const showing = () => names.map((nm, i) => (shown(layer(project, nm).id) ? i + 1 : 0)).filter(Boolean);
    expect(showing()).toEqual([1]);
    for (const nm of names) {
      const frame = layer(project, nm) as SceneNode & { children: SceneNode[] };
      //six pictures, each with a caption that reads the shared list
      expect(frame.children.filter((c) => /picture \d$/.test(c.name))).toHaveLength(6);
      expect(frame.children.filter((c) => /caption \d$/.test(c.name))).toHaveLength(6);
    }
    expect(el(layer(project, 'Grid caption 4').id).textContent).toBe('Labs and studios');
    expect(el(layer(project, 'Layout 1 button').id).getAttribute('aria-description')).toBe('Current layout');
    await click(layer(project, 'Layout 3 button').id);
    expect(player.getVariable('layout')).toBe(3);
    expect(showing()).toEqual([3]);
    expect(el(layer(project, 'Feature caption 4').id).textContent).toBe('Labs and studios');
    expect(el(layer(project, 'Layout 3 button').id).getAttribute('aria-description')).toBe('Current layout');
    expect(el(layer(project, 'Layout 1 button').id).getAttribute('aria-description') || '').toBe('');
    await click(layer(project, 'Layout 4 button').id);
    expect(showing()).toEqual([4]);
    //the author picks one with the variable and hides the buttons: no buttons, and the pictures move up
    const top = (id: string) => /translate\(([-\d.]+)px, ([-\d.]+)px/.exec(el(id).style.transform)?.[2];
    const before = Number(top(layer(project, 'Layout 4 Columns').id));
    player.setVariable('showButtons', false);
    await flush(30);
    expect(shown(layer(project, 'Layout 4 button').id)).toBe(false);
    expect(Number(top(layer(project, 'Layout 4 Columns').id))).toBe(before - 52);
    //every layout's pictures stay inside the page
    for (const nm of names) {
      for (const c of (layer(project, nm) as SceneNode & { children: SceneNode[] }).children) {
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.x + c.width).toBeLessThanOrEqual(928.5);
        expect(c.y + c.height).toBeLessThanOrEqual(408.5);
      }
    }
    player.destroy();
  });

  //Where a layer's centre is on the stage (the stage is unscaled in jsdom): walks up through the parents' positions
  const centre = (project: Project, name: string) => {
    let hit: { x: number; y: number } | undefined;
    const look = (list: SceneNode[], ox: number, oy: number) => {
      for (const n of list) {
        if (n.name === name && !hit) hit = { x: ox + n.x + n.width / 2, y: oy + n.y + n.height / 2 };
        if ('children' in n && Array.isArray(n.children)) look(n.children as SceneNode[], ox + n.x, oy + n.y);
      }
    };
    for (const ab of project.artboards) look(ab.children, 0, 0);
    return hit!;
  };
  //Hover is the DOM's pointerover and pointerout; a move on the pie carries the pointer's position
  const over = async (id: string) => {
    el(id).dispatchEvent(new MouseEvent('pointerover', { bubbles: true, relatedTarget: document.getElementById('stage') }));
    await flush(30);
  };
  const out = async (id: string) => {
    el(id).dispatchEvent(new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.getElementById('stage') }));
    await flush(30);
  };
  const moveOn = async (id: string, x: number, y: number) => {
    el(id).dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: x, clientY: y }));
    await flush(30);
  };
  const px = (id: string, prop: 'height' | 'width') => parseFloat(el(id).style[prop]);

  it('chart: the bars are sized by the data and redraw when it changes, with the scale following', async () => {
    const { project } = starter('explore/chart').build(COLOURWAYS[0]);
    const player = await play(project);
    const bar = (k: number) => layer(project, `Bar ${k}`).id;
    //normal week: the biggest is 8, so the scale tops out at 8 and a bar is value / 8 of 240
    expect(px(bar(3), 'height')).toBeCloseTo(240);
    expect(px(bar(1), 'height')).toBeCloseTo(180);
    expect(px(bar(6), 'height')).toBeCloseTo(60);
    expect(el(layer(project, 'Scale 4').id).textContent).toBe('8');
    expect(el(layer(project, 'Scale 2').id).textContent).toBe('4');
    expect(el(layer(project, 'Bar 1 label').id).textContent).toBe('Reading');
    //the bars sit on the baseline: a taller bar starts higher
    const top = (id: string) => parseFloat(/translate\([-\d.]+px, ([-\d.]+)px/.exec(el(id).style.transform)![1]);
    expect(top(bar(3))).toBeCloseTo(0);
    expect(top(bar(1))).toBeCloseTo(60);
    //the exam week button sets the data and everything redraws, with a new scale (14 rounds up to 16)
    await click(layer(project, 'Exam week button').id);
    expect((player.getVariable('rows') as { value: number }[])[4].value).toBe(14);
    expect(el(layer(project, 'Scale 4').id).textContent).toBe('16');
    expect(px(bar(5), 'height')).toBeCloseTo(210);
    expect(px(bar(3), 'height')).toBeCloseTo(60);
    expect(el(layer(project, 'Exam week button').id).getAttribute('aria-description')).toBe('Showing now');
    //so does setting the list from anywhere else (an author's own numbers, any labels)
    player.setVariable('rows', [{ label: 'A', value: 1 }, { label: 'B', value: 2 }, { label: 'C', value: 3 }, { label: 'D', value: 4 }, { label: 'E', value: 2 }, { label: 'F', value: 1 }]);
    await flush(30);
    expect(el(layer(project, 'Scale 4').id).textContent).toBe('4');
    expect(px(bar(4), 'height')).toBeCloseTo(240);
    expect(el(layer(project, 'Bar 2 label').id).textContent).toBe('B');
    expect(el(layer(project, 'Bar column 4').id).getAttribute('aria-label')).toBe('D: 4 hours');
    player.destroy();
  });

  it('chart: a value shows on hover and on focus, and goes again on leaving and blurring', async () => {
    const { project } = starter('explore/chart').build(COLOURWAYS[0]);
    const player = await play(project);
    const value = (k: number) => shown(layer(project, `Bar ${k} value`).id);
    const readout = () => el(layer(project, 'Readout').id).textContent;
    expect(readout()).toContain('Hover over, or Tab to');
    expect([1, 2, 3, 4, 5, 6].filter(value)).toEqual([]);
    //hover over the third bar
    await over(layer(project, 'Bar column 3').id);
    expect(player.getVariable('pick')).toBe(3);
    expect(value(3)).toBe(true);
    expect(el(layer(project, 'Bar 3 value').id).textContent).toBe('8');
    expect(readout()).toBe('Assignments: 8 hours (29% of the total)');
    //the other bars dim
    expect(parseFloat(el(layer(project, 'Bar 1').id).style.opacity)).toBeCloseTo(0.5);
    await out(layer(project, 'Bar column 3').id);
    expect(player.getVariable('pick')).toBe(0);
    expect(value(3)).toBe(false);
    expect(parseFloat(el(layer(project, 'Bar 1').id).style.opacity || '1')).toBeCloseTo(1);
    //focus does the same, and the column says its value out loud
    const col = el(layer(project, 'Bar column 5').id);
    expect(col.getAttribute('role')).toBe('img');
    expect(col.getAttribute('aria-label')).toBe('Revision: 5 hours');
    expect(col.tabIndex).toBe(0);
    col.focus();
    await flush(30);
    expect(player.getVariable('pick')).toBe(5);
    expect(readout()).toContain('Revision: 5 hours');
    col.blur();
    await flush(30);
    expect(player.getVariable('pick')).toBe(0);
    player.destroy();
  });

  it('chart: the pie is six trimmed outlines that follow the data, the legend and pointer show values, and the table has every number', async () => {
    const { project } = starter('explore/chart').build(COLOURWAYS[0]);
    const player = await play(project);
    expect(shown(layer(project, 'Pie chart').id)).toBe(false);
    expect(shown(layer(project, 'Data table').id)).toBe(false);
    await click(layer(project, 'Pie chart button').id);
    expect(player.getVariable('view')).toBe('pie');
    expect(shown(layer(project, 'Pie chart').id)).toBe(true);
    expect(shown(layer(project, 'Bar chart').id)).toBe(false);
    //each slice draws the part of the way round that is its share (6 of 28 is 21.4 percent, then 4 of 28)
    const dash = (k: number) => {
      const path = el(layer(project, `Slice ${k}`).id).querySelector('path[pathLength]');
      return path ? path.getAttribute('stroke-dasharray')!.split(' ').map(Number) : [];
    };
    const off = (k: number) => Number(el(layer(project, `Slice ${k}`).id).querySelector('path[pathLength]')?.getAttribute('stroke-dashoffset'));
    expect(dash(1)[0]).toBeCloseTo(21.43, 1);
    expect(dash(2)[0]).toBeCloseTo(14.29, 1);
    expect(off(2)).toBeCloseTo(-21.43, 1);
    expect(dash(3)[0]).toBeCloseTo(28.57, 1);
    //the slices together go all the way round
    let sum = 0;
    for (let k = 1; k <= 6; k++) sum += dash(k)[0];
    expect(sum).toBeCloseTo(100, 0);
    //the legend says the numbers, and a legend row shows the value on focus
    expect(el(layer(project, 'Legend 3').id).getAttribute('aria-label')).toBe('Assignments: 8 hours, 29 percent');
    expect(el(layer(project, 'Legend 3 share').id).textContent).toBe('29%');
    el(layer(project, 'Legend 4').id).focus();
    await flush(30);
    expect(player.getVariable('pick')).toBe(4);
    expect(el(layer(project, 'Readout').id).textContent).toBe('Group work: 3 hours (11% of the total)');
    expect(parseFloat(el(layer(project, 'Slice 1').id).querySelector('path[pathLength]')!.getAttribute('stroke-opacity') ?? '0.4')).toBeLessThan(1);
    (document.activeElement as HTMLElement).blur();
    await flush(30);
    //the pointer on the pie picks the slice under it by its angle round from the top: a point just right of the top is slice 1
    const pie = layer(project, 'Pie').id;
    const hit = centre(project, 'Pie');
    await moveOn(pie, hit.x + 10, hit.y - 100);
    expect(player.getVariable('pick')).toBe(1);
    //the slices end at 21, 36, 64, 75, 93 and 100 percent: half way round (the bottom) is in the third
    await moveOn(pie, hit.x, hit.y + 100);
    expect(player.getVariable('pick')).toBe(3);
    //three quarters of the way round is the left, where slice 4 ends, so a little past it is slice 5
    await moveOn(pie, hit.x - 100, hit.y - 5);
    expect(player.getVariable('pick')).toBe(5);
    //outside the disc picks nothing
    await moveOn(pie, hit.x + 140, hit.y - 140);
    expect(player.getVariable('pick')).toBe(0);
    await moveOn(pie, hit.x + 10, hit.y - 100);
    expect(player.getVariable('pick')).toBe(1);
    await out(pie);
    expect(player.getVariable('pick')).toBe(0);
    //new data redraws the pie
    await click(layer(project, 'Exam week button').id);
    expect(dash(5)[0]).toBeCloseTo(46.67, 1);
    //the table
    await click(layer(project, 'Table button').id);
    expect(shown(layer(project, 'Data table').id)).toBe(true);
    expect(shown(layer(project, 'Pie chart').id)).toBe(false);
    expect(el(layer(project, 'Row 5 category').id).textContent).toBe('Revision');
    expect(el(layer(project, 'Row 5 value').id).textContent).toBe('14');
    expect(el(layer(project, 'Row 5 share').id).textContent).toBe('47%');
    expect(el(layer(project, 'Total value').id).textContent).toBe('30');
    expect(shown(layer(project, 'Readout').id)).toBe(false);
    expect(el(layer(project, 'Data table').id).getAttribute('aria-label')).toContain('Table of hours');
    player.destroy();
  });

  it('chart: a guess is made before the reveal, the answer is hidden until then, and Next moves on', async () => {
    const { project } = starter('explore/chart').build(COLOURWAYS[0]);
    const player = await play(project);
    const gl = (name: string) => layer(project, name, 2);
    await click(layer(project, 'Take a guess button', 1).id, 400);
    expect(player.artboard.name).toBe('Your guess');
    expect(el(gl('Question').id).textContent).toContain('on Reading');
    //before the reveal: a question mark where the bar is, no real bar, and the value is not spoken
    expect(shown(gl('Mystery bar').id)).toBe(true);
    const bar1 = gl('Bar 1').id;
    expect(shown(bar1)).toBe(false);
    const col = el(gl('Bar column 1').id);
    expect(col.getAttribute('aria-label')).toBe('Reading: hidden until you reveal it');
    expect(JSON.stringify(document.body.innerHTML)).not.toContain('Reading: 6');
    col.focus();
    await flush(30);
    expect(shown(gl('Bar 1 value').id)).toBe(false);
    //the other bars show their values on focus as usual
    el(gl('Bar column 2').id).focus();
    await flush(30);
    expect(shown(gl('Bar 2 value').id)).toBe(true);
    //the slider makes the guess bar (20 is the top of the scale, the chart is 200 high)
    const slider = el(gl('Guess slider').id).querySelector('input')!;
    slider.value = '5';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(30);
    expect(player.getVariable('guess')).toBe(5);
    expect(px(gl('Guess bar').id, 'height')).toBeCloseTo(50);
    expect(el(gl('Guess readout').id).textContent).toBe('Your guess: 5 hours');
    //reveal
    await click(gl('Reveal button').id);
    expect(player.getVariable('revealed')).toBe(true);
    expect(String(player.getVariable('verdict'))).toBe('You guessed 5 hours. The answer is 6: 1 too low.');
    expect(shown(bar1)).toBe(true);
    expect(px(bar1, 'height')).toBeCloseTo(60);
    expect(shown(gl('Mystery bar').id)).toBe(false);
    expect(el(gl('Bar column 1').id).getAttribute('aria-label')).toBe('Reading: 6 hours');
    expect(shown(gl('Reveal button').id)).toBe(false);
    expect(shown(gl('Next category button').id)).toBe(true);
    //the slider goes, so the guess cannot change after the answer, and the focus moves on to Next
    expect(shown(gl('Guess slider').id)).toBe(false);
    await flush(200);
    expect(document.activeElement?.closest('[data-ix-id]')).toBe(el(gl('Next category button').id));
    //next one: the guess starts again and the next category is hidden
    await click(gl('Next category button').id);
    expect(player.getVariable('target')).toBe(2);
    expect(player.getVariable('guess')).toBe(0);
    expect(player.getVariable('revealed')).toBe(false);
    expect(el(gl('Question').id).textContent).toContain('on Lectures');
    expect(shown(gl('Bar 2').id)).toBe(false);
    expect(shown(bar1)).toBe(true);
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
