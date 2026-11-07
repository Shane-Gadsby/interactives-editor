//The explore set of branded starters: each builds in every colourway, normalises, paints only with tokens, plays in the
//player without throwing, and its main interaction works.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, normalizeProject, walk, type Project, type SceneNode } from 'interactives-player';
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

  it('image hotspots: a point opens its panel, marks it explored, counts it, and Esc or Close shuts it', async () => {
    const { project } = STARTERS[0].build(COLOURWAYS[0]);
    start(project, 'Explore the water cycle');
    const player = await play(project);
    expect(player.getVariable('open')).toBe(0);
    const panel = layer(project, 'Panel 2');
    expect(el(panel.id)?.style.display ?? 'none').toBe('none');
    //click the second point
    el(layer(project, 'Hotspot 2').id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush(150);
    expect(player.getVariable('open')).toBe(2);
    expect(player.getVariable('seen2')).toBe(true);
    expect(player.getVariable('explored')).toBe(1);
    expect(el(panel.id).style.display).not.toBe('none');
    expect(document.activeElement).toBe(el(layer(project, 'Panel 2 heading').id));
    //Esc closes it and puts the focus back on the point
    key(document.activeElement!, 'Escape');
    await flush(150);
    expect(player.getVariable('open')).toBe(0);
    expect(document.activeElement).toBe(el(layer(project, 'Hotspot 2').id));
    //opening it again does not count twice; the Close button shuts it
    el(layer(project, 'Hotspot 2').id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush(150);
    expect(player.getVariable('explored')).toBe(1);
    el(layer(project, 'Panel 2 close').id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush(150);
    expect(player.getVariable('open')).toBe(0);
    //the count text
    expect(document.body.textContent).toContain('1 of 5 explored');
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
    const player = await play(project);
    const h = (i: number) => layer(project, `Section ${i} header`);
    const sec = (i: number) => layer(project, `Section ${i}`);
    expect(el(h(1).id).getAttribute('role')).toBe('button');
    expect(el(h(1).id).getAttribute('aria-expanded')).toBe('true');
    expect(el(h(2).id).getAttribute('aria-expanded')).toBe('false');
    const top3Before = Number(top(sec(3).id));
    await click(h(2).id);
    expect(player.getVariable('open1')).toBe(false);
    expect(player.getVariable('open2')).toBe(true);
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
    expect(player.getVariable('open2')).toBe(false);
    expect(parseFloat(el(sec(2).id).style.height)).toBeLessThan(70);
    //enter on a header acts like a click
    el(h(4).id).focus();
    el(h(4).id).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    el(h(4).id).dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    await flush(30);
    expect(player.getVariable('open4')).toBe(true);
    //with allowMany on, a second one stays open next to it
    player.setVariable('allowMany', true);
    await click(h(5).id);
    expect(player.getVariable('open4')).toBe(true);
    expect(player.getVariable('open5')).toBe(true);
    player.destroy();
  });

  it('flip cards: a card flips on click and on Enter, showing the back text from the shared list, and all turn back', async () => {
    const { project } = STARTERS[2].build(COLOURWAYS[0]);
    project.settings.startArtboardId = project.artboards[1].id;
    const player = await play(project);
    const card = layer(project, 'Card 3');
    expect(el(card.id).getAttribute('role')).toBe('button');
    expect(el(card.id).textContent).toContain('Citation');
    await click(card.id);
    expect(player.getVariable('flipped3')).toBe(true);
    expect(el(card.id).textContent).toContain('A short note in your text');
    //the front face is gone (display none, so out of the accessibility tree too) and the back is showing
    expect(el(layer(project, 'Card 3 front').id).style.display).toBe('none');
    expect(el(layer(project, 'Card 3 back').id).style.display).not.toBe('none');
    //Enter flips another one
    const other = layer(project, 'Card 5');
    el(other.id).focus();
    el(other.id).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    el(other.id).dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    await flush(30);
    expect(player.getVariable('flipped5')).toBe(true);
    await click(layer(project, 'Turn all back').id);
    expect(player.getVariable('flipped3')).toBe(false);
    expect(player.getVariable('flipped5')).toBe(false);
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
    const shown = () => [1, 2, 3, 4, 5].filter((i) => el(layer(project, `Slide ${i}`).id).style.display !== 'none');
    expect(shown()).toEqual([1]);
    await click(layer(project, 'Next').id);
    expect(player.getVariable('slide')).toBe(2);
    expect(shown()).toEqual([2]);
    key(document.body, 'ArrowRight');
    await flush(30);
    expect(shown()).toEqual([3]);
    key(document.body, 'ArrowLeft');
    key(document.body, 'ArrowLeft');
    key(document.body, 'ArrowLeft');
    await flush(30);
    expect(shown()).toEqual([5]);
    await click(layer(project, 'Dot 2').id);
    expect(shown()).toEqual([2]);
    expect(el(layer(project, 'Dot 2').id).getAttribute('role')).toBe('button');
    expect(el(layer(project, 'Dot 2').id).getAttribute('aria-label')).toBe('Go to slide 2');
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
