//The contrast check itself: that it finds what it says it finds, and leaves alone what it says it leaves alone.
import { describe, expect, it } from 'vitest';
import { createNode } from 'interactives-player';
import { brandedPage, brandedProject, button, overlay, solid, stroke, text } from '../src/lib/branded/kit';
import { COLOURWAYS } from '../src/lib/branded/looks';
import { checkProjectContrast } from '../src/lib/branded/contrast-check';
import { progressBar } from '../src/lib/branded/parts';

const make = (fn: (ctx: ReturnType<typeof brandedProject>, page: ReturnType<typeof brandedPage>) => void, kind: 'content' | 'hero' = 'content') => {
  const ctx = brandedProject(COLOURWAYS[0], 'T');
  const page = brandedPage(ctx, 'Page', { kind });
  fn(ctx, page);
  return checkProjectContrast(ctx.project, [], ['theme-gold']);
};

describe('the contrast check', () => {
  it('is quiet about a page of ordinary text and a primary button', () => {
    const f = make((ctx, page) => page.children.push(text(ctx, 'Body', 'Words', 60, 200, 300, { color: ctx.L.text }), button(ctx, 'Go', 'Go', 60, 300)));
    expect(f).toEqual([]);
  });

  it('finds text under 4.5:1, and says how far under', () => {
    const f = make((ctx, page) => page.children.push(text(ctx, 'Faint', 'Words', 60, 200, 300, { color: ctx.L.border, fontSize: 16 })));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ kind: 'text', need: 4.5, layer: expect.stringContaining('Faint') });
    expect(f[0].ratio).toBeLessThan(4.5);
  });

  it('asks only 3:1 of large text', () => {
    const big = make((ctx, page) => page.children.push(text(ctx, 'Big', 'Words', 60, 200, 300, { color: ctx.L.border, fontSize: 28 })));
    expect(big).toHaveLength(0);
  });

  it('reads a gradient where the words sit, not at its worst end', () => {
    //Gold's hero: purple words clear both ends of the gradient, white words clear neither
    const ok = make((ctx, page) => page.children.push(text(ctx, 'Sub', 'Words', 60, 300, 300, { color: ctx.L.onGradient })), 'hero');
    expect(ok).toEqual([]);
    const bad = make((ctx, page) => page.children.push(text(ctx, 'Sub', 'Words', 60, 300, 300, { color: ctx.L.onDeep })), 'hero');
    expect(bad.map((x) => x.kind)).toEqual(['text']);
  });

  it('finds a button whose edge is under 3:1 and clears one with a stroke', () => {
    const faint = make((ctx, page) => {
      const b = button(ctx, 'Faint', 'Go', 60, 300, 180, false);
      Object.assign(b, { stroke: stroke(ctx.L.divider) });
      page.children.push(b);
    });
    expect(faint.some((x) => x.kind === 'control-edge')).toBe(true);
    const fine = make((ctx, page) => page.children.push(button(ctx, 'Fine', 'Go', 60, 300, 180, false)));
    expect(fine.some((x) => x.kind === 'control-edge')).toBe(false);
  });

  it('leaves a disabled control alone, and a layer tagged as an overlay', () => {
    const f = make((ctx, page) => {
      const b = button(ctx, 'Off', 'Go', 60, 300, 180, false);
      Object.assign(b, { stroke: stroke(ctx.L.divider), disabled: true, color: ctx.L.divider });
      page.children.push(b, overlay(text(ctx, 'Over', 'Words', 60, 200, 300, { color: ctx.L.border })));
    });
    expect(f).toEqual([]);
  });

  it('finds a progress bar that does not stand off its track', () => {
    const f = make((ctx, page) => {
      const bar = progressBar(ctx, 'Bar', 60, 200, 300, { value: 50, max: 100, label: 'Bar' });
      bar.barFill = solid(ctx.L.surfaceMuted);
      page.children.push(bar);
    });
    expect(f.map((x) => x.kind)).toEqual(['progress']);
  });

  it('runs each theme the project has and names the one that fails', () => {
    const ctx = brandedProject(COLOURWAYS[0], 'T');
    const page = brandedPage(ctx, 'Page');
    //the fixed colour is read the same in every theme; white text on the white page is a failure in all of them but High contrast (black page)
    page.children.push(createNode('text', { name: 'White', text: 'Words', x: 60, y: 200, width: 300, fontSize: 16, color: '#ffffff' }));
    const found = checkProjectContrast(ctx.project, []);
    expect(new Set(found.map((x) => x.theme))).toEqual(new Set(['Gold', 'Purple', 'Blue', 'Green', 'Orange', 'Red']));
  });
});
