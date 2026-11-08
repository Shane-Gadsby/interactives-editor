//The explore set of branded starters: each builds in every colourway, normalises, paints only with tokens, plays in the
//player without throwing, and its main interaction works.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, normalizeProject, walk, type FrameNode, type Project, type SceneNode } from 'interactives-player';
import { STARTERS } from '../src/lib/branded/sets/explore';
import { projectFromBrandedStarter } from '../src/lib/branded';
import { COLOURWAYS } from '../src/lib/branded/looks';

const flush = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const el = (id: string) => document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`)!;
const layer = (p: Project, name: string): SceneNode => {
  let hit: SceneNode | undefined;
  for (const ab of p.artboards) walk(ab.children, (n) => void (!hit && n.name === name && (hit = n)));
  if (!hit) throw new Error(`no layer ${name}`);
  return hit;
};
const key = (target: EventTarget, k: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k, bubbles: true, cancelable: true }));

describe('explore starters', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:1024px;height:640px"></div>';
    vi.stubGlobal('requestAnimationFrame', (fn: () => void) => setTimeout(fn, 0) as unknown as number);
    vi.stubGlobal('cancelAnimationFrame', (h: number) => clearTimeout(h));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('has the first five starters, keyed explore/... (more follow, see branded-explore-2)', () => {
    expect(STARTERS.slice(0, 5).map((s) => s.key)).toEqual(['explore/image-hotspots', 'explore/accordion', 'explore/flip-and-dialog-cards', 'explore/image-slider', 'explore/before-and-after']);
  });

  for (const s of STARTERS) {
    describe(s.name, () => {
      for (const way of COLOURWAYS) {
        it(`builds in ${way.name}, normalises and paints only with tokens`, () => {
          const project = projectFromBrandedStarter(s, way);
          expect(project.themes!.default).toBe(`theme-${way.id}`);
          expect(project.settings.startArtboardId).toBe(project.artboards[0].id);
          for (const ab of project.artboards) expect(JSON.stringify([ab.children, ab.background])).not.toMatch(/"#[0-9a-f]{3,8}"/i);
          const again = normalizeProject(JSON.parse(JSON.stringify(project)));
          expect(again.artboards.length).toBe(project.artboards.length);
          const ids = new Set<string>();
          for (const ab of project.artboards) walk(ab.children, (n) => (expect(ids.has(n.id)).toBe(false), ids.add(n.id)));
        });
      }

      it('has a checklist pointing at real layers', () => {
        const { project, checklist } = s.build(COLOURWAYS[0]);
        expect(checklist.length).toBeGreaterThanOrEqual(5);
        for (const c of checklist) {
          if (c.nodeId) {
            let found = false;
            for (const ab of project.artboards) walk(ab.children, (n) => void (n.id === c.nodeId && (found = true)));
            expect(found, c.text).toBe(true);
          }
          if (c.artboardId) expect(project.artboards.some((a) => a.id === c.artboardId)).toBe(true);
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

      it('plays every page without throwing', async () => {
        for (let i = 0; i < s.build(COLOURWAYS[0]).project.artboards.length; i++) {
          const { project } = s.build(COLOURWAYS[0]);
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
      });
    });
  }

  const play = async (project: Project) => {
    const player = new Player(document.getElementById('stage')!, project, { loadData: false });
    await flush();
    return player;
  };
  const start = (project: Project, name: string) => {
    project.settings.startArtboardId = project.artboards.find((a) => a.name === name)!.id;
  };

  it('image hotspots: one flow opens the point pressed in the dialog, marks it explored, counts it, and Esc or Close shuts it', async () => {
    const { project } = STARTERS[0].build(COLOURWAYS[0]);
    start(project, 'Explore the water cycle');
    //one click flow for all five points, off their parent frame (not five copies)
    const page = project.artboards.find((a) => a.name === 'Explore the water cycle')!;
    const presses = page.logic.nodes.filter((g) => g.kind === 'event.pointer' && g.params.childrenOnly);
    expect(presses).toHaveLength(1);
    expect(page.logic.nodes.filter((g) => g.kind === 'event.key')).toHaveLength(0);
    const player = await play(project);
    expect(player.getVariable('open')).toBe(false);
    const dialog = layer(project, 'Point dialog');
    expect((dialog as FrameNode).dialog?.openVariable).toBe(project.variables.find((v) => v.name === 'open')!.id);
    expect(el(dialog.id)?.style.display ?? 'none').toBe('none');
    //click the second point (a real press puts the focus on it first, and the dialog hands the focus back there)
    el(layer(project, 'Point 2').id).focus();
    el(layer(project, 'Point 2').id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush(150);
    expect(player.getVariable('open')).toBe(true);
    expect(player.getVariable('current')).toBe(1);
    expect(player.getVariable('seen')).toEqual([false, true, false, false, false]);
    expect(player.getVariable('explored')).toBe(1);
    expect(el(dialog.id).style.display).not.toBe('none');
    expect(el(layer(project, 'Point dialog title').id).textContent).toBe('2. Condensation');
    expect(el(layer(project, 'Dialog text').id).textContent).toContain('High in the air');
    expect(el(layer(project, 'Point dialog close button').id).contains(document.activeElement)).toBe(true);
    //Esc closes it (the dialog does that itself) and puts the focus back on the point
    key(document.activeElement!, 'Escape');
    await flush(150);
    expect(player.getVariable('open')).toBe(false);
    expect(document.activeElement).toBe(el(layer(project, 'Point 2').id));
    //opening it again does not count twice; the Close button shuts it
    el(layer(project, 'Point 2').id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush(150);
    expect(player.getVariable('explored')).toBe(1);
    el(layer(project, 'Point dialog close button').id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush(150);
    expect(player.getVariable('open')).toBe(false);
    //another point, then the count text, bar and Finish once every point is open
    el(layer(project, 'Point 5').id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush(150);
    expect(player.getVariable('current')).toBe(4);
    expect(el(layer(project, 'Point dialog title').id).textContent).toBe('5. Infiltration');
    expect(document.body.textContent).toContain('2 of 5 explored');
    player.destroy();
  });

  const click = async (id: string, ms = 30) => {
    el(id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush(ms);
  };
  const top = (id: string) => /translate\(([-\d.]+)px, ([-\d.]+)px/.exec(el(id).style.transform)?.[2];

  it('accordion: a header opens its panel, the sections below move down, the others close, and aria-expanded follows', async () => {
    const { project } = STARTERS[1].build(COLOURWAYS[0]);
    project.settings.startArtboardId = project.artboards[1].id;
    //the five sections are one repeated layer, and one click flow (an If and two Set nodes) serves every header
    const page = project.artboards[1];
    expect(page.logic.nodes.filter((g) => g.kind === 'logic.if')).toHaveLength(1);
    expect(page.logic.nodes.filter((g) => g.kind === 'event.pointer')).toHaveLength(1);
    expect(project.variables.some((v) => v.name === 'open2' || v.name === 'which')).toBe(false);
    expect(project.artboards[1].children.some((c) => c.name === 'Section 2')).toBe(false);
    const player = await play(project);
    const h = (i: number) => ({ id: `${layer(project, 'Section header').id}~${i - 1}` });
    const sec = (i: number) => ({ id: `${layer(project, 'Section').id}~${i - 1}` });
    expect(document.querySelectorAll(`[data-ix-id^="${layer(project, 'Section').id}~"]`)).toHaveLength(5);
    expect(el(sec(2).id).textContent).toContain('Study in short blocks');
    expect(el(h(1).id).getAttribute('role')).toBe('button');
    expect(el(h(1).id).getAttribute('aria-expanded')).toBe('true');
    expect(el(h(2).id).getAttribute('aria-expanded')).toBe('false');
    expect(player.getVariable('open')).toEqual([0]);
    const top3Before = Number(top(sec(3).id));
    await click(h(2).id);
    expect(player.getVariable('open')).toEqual([1]);
    expect(el(h(2).id).getAttribute('aria-expanded')).toBe('true');
    expect(el(h(1).id).getAttribute('aria-expanded')).toBe('false');
    //section 1 shut, so section 2 moved up, and its open panel pushes section 3 down below it
    expect(Number(top(sec(2).id))).toBeLessThan(top3Before - 100);
    expect(Number(top(sec(3).id))).toBeGreaterThan(Number(top(sec(2).id)) + 100);
    //open panel makes the section taller
    const h2 = parseFloat(el(sec(2).id).style.height);
    expect(h2).toBeGreaterThan(100);
    //clicking the open header closes it
    await click(h(2).id);
    expect(player.getVariable('open')).toEqual([]);
    expect(parseFloat(el(sec(2).id).style.height)).toBeLessThan(70);
    //enter on a header acts like a click
    el(h(4).id).focus();
    el(h(4).id).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    el(h(4).id).dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    await flush(30);
    expect(player.getVariable('open')).toEqual([3]);
    //with allowMany on, a second one stays open next to it, and pressing one again takes it out of the list
    player.setVariable('allowMany', true);
    await click(h(5).id);
    expect(player.getVariable('open')).toEqual([3, 4]);
    await click(h(4).id);
    expect(player.getVariable('open')).toEqual([4]);
    player.destroy();
  });

  //A repeated layer's copies are its id and the copy's place, joined with ~
  const copyOf = (project: Project, name: string, i: number) => `${layer(project, name).id}~${i}`;

  it('flip cards: one flow flips the card pressed, on click and on Enter, showing the back text from the shared list, and all turn back', async () => {
    const { project } = STARTERS[2].build(COLOURWAYS[0]);
    project.settings.startArtboardId = project.artboards[1].id;
    //the six cards are one repeated layer: one click flow, not six
    expect(project.artboards[1].logic.nodes.filter((g) => g.kind === 'event.pointer' && g.params.target === layer(project, 'Card').id)).toHaveLength(1);
    const player = await play(project);
    const card = copyOf(project, 'Card', 2);
    expect(el(card).getAttribute('role')).toBe('button');
    expect(el(card).getAttribute('aria-pressed')).toBe('false');
    expect(el(card).textContent).toContain('Citation');
    await click(card);
    expect(player.getVariable('flipped')).toEqual([false, false, true, false, false, false]);
    expect(el(card).getAttribute('aria-pressed')).toBe('true');
    expect(el(card).textContent).toContain('A short note in your text');
    //the front face is gone (display none, so out of the accessibility tree too) and the back is showing
    expect(el(copyOf(project, 'Card front', 2)).style.display).toBe('none');
    expect(el(copyOf(project, 'Card back', 2)).style.display).not.toBe('none');
    //Enter flips another one
    const other = copyOf(project, 'Card', 4);
    el(other).focus();
    el(other).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    el(other).dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    await flush(30);
    expect(player.getVariable('flipped')).toEqual([false, false, true, false, true, false]);
    //pressing a flipped card turns it back
    await click(card);
    expect(player.getVariable('flipped')).toEqual([false, false, false, false, true, false]);
    await click(layer(project, 'Turn all back').id);
    expect(player.getVariable('flipped')).toEqual([false, false, false, false, false, false]);
    player.destroy();
  });

  it('dialog cards: Turn shows the back, Next and Previous step through, the arrow keys do too, and the ends are disabled', async () => {
    const { project } = STARTERS[2].build(COLOURWAYS[0]);
    project.settings.startArtboardId = project.artboards[2].id;
    const player = await play(project);
    const text = () => el(layer(project, 'Dialog card').id).textContent;
    const progress = () => el(layer(project, 'Progress').id).textContent;
    expect(progress()).toBe('Card 1 of 6');
    expect(text()).toContain('Plagiarism');
    const prev = el(layer(project, 'Previous').id).querySelector('button') ?? el(layer(project, 'Previous').id);
    expect((prev as HTMLButtonElement).disabled).toBe(true);
    await click(layer(project, 'Turn').id);
    expect(player.getVariable('turned')).toBe(true);
    expect(text()).toContain("someone else's words");
    await click(layer(project, 'Next').id);
    expect(progress()).toBe('Card 2 of 6');
    expect(player.getVariable('turned')).toBe(false);
    expect(text()).toContain('Paraphrase');
    key(document.body, 'ArrowRight');
    await flush(30);
    expect(progress()).toBe('Card 3 of 6');
    key(document.body, 'ArrowLeft');
    await flush(30);
    expect(progress()).toBe('Card 2 of 6');
    await click(layer(project, 'Previous').id);
    expect(progress()).toBe('Card 1 of 6');
    //at the first card going back does nothing
    key(document.body, 'ArrowLeft');
    await flush(30);
    expect(player.getVariable('card')).toBe(1);
    //at the last card Next does nothing
    for (let i = 0; i < 8; i++) key(document.body, 'ArrowRight');
    await flush(40);
    expect(player.getVariable('card')).toBe(6);
    expect(progress()).toBe('Card 6 of 6');
    //clicking the card itself turns it too
    await click(layer(project, 'Dialog card').id);
    expect(player.getVariable('turned')).toBe(true);
    player.destroy();
  });

  it('image slider: Next, Previous, the dots and the arrow keys move the slide (wrapping), and only the current slide shows', async () => {
    const { project } = STARTERS[3].build(COLOURWAYS[0]);
    project.settings.startArtboardId = project.artboards[1].id;
    const player = await play(project);
    //one slide is drawn, for the slide showing, and its words come from the list
    const heading = () => el(`${layer(project, 'Slide caption heading').id}~0`).textContent;
    expect(document.querySelectorAll(`[data-ix-id^="${layer(project, 'Slide').id}~"]`)).toHaveLength(1);
    expect(heading()).toBe('Choose a topic');
    //the arrows are the Previous and Next buttons' own shortcuts, not key flows
    expect(layer(project, 'Next')).toMatchObject({ shortcut: 'ArrowRight' });
    expect(layer(project, 'Previous')).toMatchObject({ shortcut: 'ArrowLeft' });
    expect(project.artboards[1].logic.nodes.filter((g) => g.kind === 'event.key')).toHaveLength(0);
    await click(layer(project, 'Next').id);
    expect(player.getVariable('slide')).toBe(2);
    expect(heading()).toBe('Find sources');
    key(document.body, 'ArrowRight');
    await flush(30);
    expect(heading()).toBe('Read and take notes');
    key(document.body, 'ArrowLeft');
    await flush(30);
    key(document.body, 'ArrowLeft');
    await flush(30);
    key(document.body, 'ArrowLeft');
    await flush(30);
    expect(player.getVariable('slide')).toBe(5);
    expect(heading()).toBe('Review and reference');
    const dot = (i: number) => `${layer(project, 'Dot').id}~${i - 1}`;
    await click(dot(2));
    expect(player.getVariable('slide')).toBe(2);
    expect(el(dot(2)).getAttribute('role')).toBe('button');
    expect(el(dot(2)).getAttribute('aria-label')).toBe('Go to slide 2');
    expect(el(dot(2)).getAttribute('aria-current')).toBe('true');
    expect(el(dot(3)).getAttribute('aria-current')).not.toBe('true');
    await click(layer(project, 'Previous').id);
    await click(layer(project, 'Previous').id);
    expect(player.getVariable('slide')).toBe(5);
    player.destroy();
  });

  it('image slider: autoplay advances while playing, stops when stepped by hand, and stays still for reduced motion', async () => {
    const run = async (reduced: boolean) => {
      vi.stubGlobal('matchMedia', (q: string) => ({ matches: reduced && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
      const { project } = STARTERS[3].build(COLOURWAYS[0]);
      project.settings.startArtboardId = project.artboards[1].id;
      const page = project.artboards[1];
      for (const g of page.logic.nodes) if (g.kind === 'event.timer') g.params.ms = 40;
      project.variables.find((v) => v.name === 'playing')!.initial = true;
      const player = await play(project);
      //a step or two (it wraps round to 1 after five, so do not wait for long)
      await flush(70);
      const at = player.getVariable('slide');
      if (!reduced) {
        expect(at).toBeGreaterThan(1);
        await click(layer(project, 'Next').id);
        expect(player.getVariable('playing')).toBe(false);
        const held = player.getVariable('slide');
        await flush(150);
        expect(player.getVariable('slide')).toBe(held);
      } else {
        expect(at).toBe(1);
      }
      player.destroy();
    };
    await run(false);
    await run(true);
  });

  it('before and after: the divider moves with the arrow keys, Home and End, the Before side follows it, and the buttons jump', async () => {
    const { project } = STARTERS[4].build(COLOURWAYS[0]);
    project.settings.startArtboardId = project.artboards[1].id;
    const player = await play(project);
    //one key node serves the four keys, and one click flow serves both jump buttons (told apart by event.childIndex)
    const page = project.artboards[1];
    expect(page.logic.nodes.filter((g) => g.kind === 'event.key')).toHaveLength(1);
    expect(page.logic.nodes.filter((g) => g.kind === 'event.pointer' && g.params.childrenOnly)).toHaveLength(1);
    const handle = el(layer(project, 'Divider handle').id);
    const reveal = () => parseFloat(el(layer(project, 'Before reveal').id).style.width);
    expect(player.getVariable('dividerAt')).toBe(464);
    expect(reveal()).toBe(464);
    //keys only count while the handle has the focus
    key(document.body, 'ArrowRight');
    await flush(30);
    expect(player.getVariable('dividerAt')).toBe(464);
    handle.focus();
    key(handle, 'ArrowRight');
    await flush(30);
    expect(player.getVariable('dividerAt')).toBe(510);
    expect(reveal()).toBe(510);
    key(handle, 'ArrowLeft');
    key(handle, 'ArrowLeft');
    await flush(30);
    expect(player.getVariable('dividerAt')).toBe(418);
    key(handle, 'Home');
    await flush(30);
    expect(player.getVariable('dividerAt')).toBe(0);
    key(handle, 'ArrowLeft');
    await flush(30);
    expect(player.getVariable('dividerAt')).toBe(0);
    key(handle, 'End');
    await flush(30);
    expect(player.getVariable('dividerAt')).toBe(928);
    key(handle, 'ArrowRight');
    await flush(30);
    expect(player.getVariable('dividerAt')).toBe(928);
    expect(handle.getAttribute('aria-label')).toContain('100 percent Before');
    await click(layer(project, 'Show After').id);
    expect(player.getVariable('dividerAt')).toBe(0);
    await click(layer(project, 'Show Before').id);
    expect(player.getVariable('dividerAt')).toBe(928);
    //pressing and dragging on the pictures puts the divider under the pointer (the stage is unscaled in jsdom, the pictures start at x 48)
    const stack = el(layer(project, 'Comparison').id);
    stack.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 400, clientY: 300 }));
    await flush(30);
    expect(player.getVariable('dividerAt')).toBe(352);
    stack.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 700, clientY: 300 }));
    await flush(30);
    expect(player.getVariable('dividerAt')).toBe(652);
    stack.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 5000, clientY: 300 }));
    await flush(30);
    expect(player.getVariable('dividerAt')).toBe(928);
    window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    //the labels are there
    expect(document.body.textContent).toContain('Before');
    expect(document.body.textContent).toContain('After');
    player.destroy();
  });
});
