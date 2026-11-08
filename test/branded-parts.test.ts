//The kit's native piece helpers (parts.ts), the shared graph module (graph-kit.ts), page masters from brandedPage and the layout check.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, normalizeProject } from 'interactives-player';
import { brandedPage, brandedProject, button, contentBox, overlay, text, LOGO_CLEAR } from '../src/lib/branded/kit';
import { COLOURWAYS } from '../src/lib/branded/looks';
import { BRANDED_STARTERS, projectFromBrandedStarter } from '../src/lib/branded';
import { addVar, click, graph, nodeSizeGuess, set, tidyBoardGraph } from '../src/lib/branded/graph-kit';
import { dialogPanel, fill, keyNavList, openDialog, pageNav, progressBar, stack } from '../src/lib/branded/parts';
import { checkProjectLayout } from '../src/lib/branded/layout-check';
import { previewScope } from '../src/lib/data';
import { tidyGraph } from '../src/lib/graph-tidy';

const flush = (ms = 8) => new Promise((r) => setTimeout(r, ms));

describe('page masters from the kit', () => {
  it('make one master per kind and size, lock its layers, and leave the page with only what an author edits', () => {
    const ctx = brandedProject(COLOURWAYS[0], 'T');
    const a = brandedPage(ctx, 'One');
    const b = brandedPage(ctx, 'Two');
    const hero = brandedPage(ctx, 'Hi', { kind: 'hero', subtitle: 's' });
    const port = brandedPage(ctx, 'Narrow', { width: 480, height: 960 });
    const masters = ctx.project.artboards.filter((x) => x.isMaster);
    expect(masters.map((m) => m.name).sort()).toEqual(['Content master', 'Content master 480x960', 'Hero master']);
    expect(a.master).toBe(b.master);
    expect(port.master).not.toBe(a.master);
    expect(a.children.map((n) => n.name)).toEqual(['Page title', 'Footer text']);
    expect(hero.children.map((n) => n.name)).toEqual(['Page title', 'Subtitle']);
    //pages come first in the list and the start page is the first page
    expect(ctx.project.artboards.slice(0, 4)).toEqual([a, b, hero, port].filter((x) => x !== undefined));
    expect(ctx.project.settings.startArtboardId).toBe(a.id);
    expect(() => normalizeProject(JSON.parse(JSON.stringify(ctx.project)))).not.toThrow();
  });

  it('keep Next and the page count to the pages, not the masters', async () => {
    document.body.innerHTML = '<div id="stage" style="width:1024px;height:640px"></div>';
    const ctx = brandedProject(COLOURWAYS[0], 'T');
    const one = brandedPage(ctx, 'One');
    brandedPage(ctx, 'Two');
    const nav = pageNav(ctx, one);
    const player = new Player(document.getElementById('stage')!, JSON.parse(JSON.stringify(ctx.project)), { loadData: false });
    await flush();
    expect(document.body.textContent).toContain('Page 1 of 2');
    document.querySelector<HTMLElement>(`[data-ix-id="${nav.next.id}"]`)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(player.artboard.name).toBe('Two');
    player.destroy();
  });

  it('give the editor canvas and pictures pageNumber and pageCount too', () => {
    const ctx = brandedProject(COLOURWAYS[0], 'T');
    brandedPage(ctx, 'One');
    const two = brandedPage(ctx, 'Two');
    const scope = previewScope(ctx.project, two);
    expect([scope.pageNumber, scope.pageCount]).toEqual([2, 2]);
  });
});

describe('the native piece helpers', () => {
  it('progressBar is a progress layer with its value and max bound and a spoken value', () => {
    const ctx = brandedProject(COLOURWAYS[0], 'T');
    const bar = progressBar(ctx, 'Steps', 10, 20, 300, { value: 'step', max: 5, label: 'Steps done', valueText: 'Step {value} of {max}' });
    expect(bar.type).toBe('progress');
    expect(bar.max).toBe(5);
    expect(bar.bindings).toEqual({ value: 'step' });
    expect(bar.semantics).toBe('progressbar');
    expect(bar.ariaLabel).toBe('Steps done');
    expect(JSON.stringify(bar)).not.toMatch(/"#[0-9a-f]{3,8}"/i);
    expect(progressBar(ctx, 'Deco', 0, 0, 100, { value: 3, max: 4, decorative: true }).semantics).toBe('none');
  });

  it('dialogPanel opens on its variable, closes on its button, and is a modal dialog with focus on Close', async () => {
    document.body.innerHTML = '<div id="stage" style="width:1024px;height:640px"></div>';
    const ctx = brandedProject(COLOURWAYS[0], 'T');
    const page = brandedPage(ctx, 'One');
    const open = addVar(ctx.project, 'helpOpen', 'boolean', false);
    const opener = button(ctx, 'Help button', 'Help', 48, 120);
    page.children.push(opener);
    const d = dialogPanel(ctx, page, 'Help dialog', open, { x: 200, y: 140, width: 600, height: 260, title: 'How this works', children: [text(ctx, 'Help text', 'Words', 24, 64, 552)] });
    const g = graph(page);
    g.run(click(g, opener, 'Open help'), openDialog(open));
    expect(d.frame.dialog).toMatchObject({ modal: true, closeOnEscape: true, openVariable: open.id, initialFocus: d.close.id });
    const player = new Player(document.getElementById('stage')!, JSON.parse(JSON.stringify(ctx.project)), { loadData: false });
    await flush();
    expect(player.getVariable('helpOpen')).toBe(false);
    document.querySelector<HTMLElement>(`[data-ix-id="${opener.id}"]`)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(player.getVariable('helpOpen')).toBe(true);
    document.querySelector<HTMLElement>(`[data-ix-id="${d.close.id}"]`)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(player.getVariable('helpOpen')).toBe(false);
    player.destroy();
  });

  it('keyNavList is a repeater with arrow key navigation, and stack is an auto layout frame', () => {
    const ctx = brandedProject(COLOURWAYS[0], 'T');
    const idx = addVar(ctx.project, 'focused', 'number', 0);
    const row = text(ctx, 'Row', '{item}', 0, 0, 200);
    const list = keyNavList('Options', 10, 10, 300, 200, { items: 'options', row, mode: 'radio', wrap: true, indexVariable: idx, ariaLabel: 'Options' });
    expect(list.repeat).toMatchObject({ items: 'options', layout: 'vertical' });
    expect(list.keyNav).toMatchObject({ mode: 'radio', wrap: true, indexVariable: idx.id });
    expect(list.children).toEqual([row]);
    const s = stack('S', 0, 0, 300, { gap: 10, children: [fill(row)] });
    expect(s.layout).toMatchObject({ direction: 'column', gap: 10, hugHeight: true, align: 'stretch' });
    expect(row.layoutItem).toEqual({ width: 'fill' });
  });
});

describe('graph tidy on built graphs', () => {
  it('lays the wired nodes out in columns without crossings, and keeps the wires', () => {
    const ctx = brandedProject(COLOURWAYS[0], 'T');
    const page = brandedPage(ctx, 'One');
    const v = addVar(ctx.project, 'n', 'number', 0);
    const b = button(ctx, 'B', 'Go', 0, 0);
    page.children.push(b);
    const g = graph(page);
    const e = click(g, b);
    const last = g.run(e, set(v, '1'), set(v, '2'), ['action.announce', { text: '"x"' }]);
    const before = JSON.stringify(page.logic.edges);
    //scramble, then tidy
    page.logic.nodes.forEach((n, i) => ((n.x = (i * 37) % 11), (n.y = (i * 53) % 7)));
    tidyBoardGraph(page);
    expect(JSON.stringify(page.logic.edges)).toBe(before);
    const xs = page.logic.nodes.map((n) => n.x);
    expect(xs).toEqual([...xs].sort((p, q) => p - q));
    expect(new Set(xs).size).toBe(4);
    expect(page.logic.nodes.at(-1)).toBe(last);
    expect(nodeSizeGuess(e).width).toBeGreaterThanOrEqual(170);
    expect(tidyGraph).toBeTypeOf('function');
  });

  it('is run on every starter that projectFromBrandedStarter makes: no two nodes of a graph overlap', () => {
    for (const s of BRANDED_STARTERS.slice(0, 12)) {
      const p = projectFromBrandedStarter(s, COLOURWAYS[0]);
      for (const ab of p.artboards) {
        const boxes = ab.logic.nodes.map((n) => ({ ...nodeSizeGuess(n), x: n.x, y: n.y, id: n.id }));
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i];
            const c = boxes[j];
            const over = Math.min(a.x + a.width, c.x + c.width) - Math.max(a.x, c.x) > 4 && Math.min(a.y + a.height, c.y + c.height) - Math.max(a.y, c.y) > 4;
            expect(over, `${s.key} ${ab.name}`).toBe(false);
          }
        }
      }
    }
  });
});

describe('the layout check', () => {
  it('is quiet on a page with nothing in the way', () => {
    const ctx = brandedProject(COLOURWAYS[0], 'T');
    const page = brandedPage(ctx, 'One');
    const box = contentBox(page);
    page.children.push(text(ctx, 'Body', 'Hello there', box.x, box.y, 400), button(ctx, 'Go', 'Go', box.x, box.y + 80));
    expect(checkProjectLayout(ctx.project)).toEqual([]);
  });

  it('finds a button over words, words off the page, words in the accent bar, and a layer in the logo clear space', () => {
    const ctx = brandedProject(COLOURWAYS[0], 'T');
    const page = brandedPage(ctx, 'One');
    const box = contentBox(page);
    page.children.push(text(ctx, 'Para', 'A fairly long paragraph that goes over two lines when it is set at this width, to sit under a button.', box.x, box.y, 300), button(ctx, 'Oops', 'Oops', box.x + 20, box.y + 4, 120));
    page.children.push(text(ctx, 'Wide', 'This text is placed so far right it leaves the page', 900, 300, 300, { wrap: false }));
    page.children.push(text(ctx, 'Bar', 'Over the bar', 48, 82, 300));
    page.children.push(button(ctx, 'Low', 'Low', 48, 560, 150));
    const kinds = checkProjectLayout(ctx.project).map((v) => `${v.kind}:${v.a.split(' ')[0]}`);
    expect(kinds).toContain('button-text:Oops');
    expect(kinds).toContain('text-overflow:Wide');
    expect(kinds).toContain('text-chrome:Bar');
    expect(kinds).toContain('logo-clear:Low');
  });

  it('skips a layer marked as an overlay, a button label, and what is inside a clickable frame', () => {
    const ctx = brandedProject(COLOURWAYS[0], 'T');
    const page = brandedPage(ctx, 'One');
    const box = contentBox(page);
    page.children.push(overlay(text(ctx, 'Caption', 'Under a hotspot', box.x, box.y, 300)));
    const hot = stack('Hot', box.x, box.y, 300, { children: [text(ctx, 'Label', 'Inside', 0, 0, 100)], extra: { role: 'button', focusable: true } });
    page.children.push(hot, button(ctx, 'Own', 'Own label', box.x, box.y + 200));
    expect(checkProjectLayout(ctx.project)).toEqual([]);
  });

  it('runs a starter in its extra states', () => {
    const ctx = brandedProject(COLOURWAYS[0], 'T');
    const page = brandedPage(ctx, 'One');
    const box = contentBox(page);
    const v = addVar(ctx.project, 'long', 'string', 'short');
    page.children.push(text(ctx, 'Body', '{long}', box.x, box.y, 200), button(ctx, 'Under', 'Under', box.x, box.y + 40));
    expect(checkProjectLayout(ctx.project)).toEqual([]);
    const found = checkProjectLayout(ctx.project, [{ label: 'long', vars: { [v.name]: 'a much longer piece of text that wraps onto several lines in a narrow box' } }]);
    expect(found.map((x) => x.kind)).toEqual(['button-text']);
    expect(found[0].page).toBe('One [long]');
  });

  it('knows the logo clear space is a share of its height', () => {
    expect(LOGO_CLEAR).toBeGreaterThan(0.2);
  });
});

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0) as unknown as number);
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});
