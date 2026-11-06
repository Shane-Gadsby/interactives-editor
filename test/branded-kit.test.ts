import { describe, expect, it } from 'vitest';
import { normalizeProject } from 'interactives-player';
import { brandedPage, brandedProject, contentBox, isChrome, text } from '../src/lib/branded/kit';
import { COLOURWAYS } from '../src/lib/branded/looks';

describe('branded kit', () => {
  it('carries every colourway as a theme, opens in the chosen one, and paints only with tokens', () => {
    for (const way of COLOURWAYS) {
      const ctx = brandedProject(way, 'T');
      const hero = brandedPage(ctx, 'Welcome', { kind: 'hero', subtitle: 'Sub' });
      const page = brandedPage(ctx, 'One', { footer: 'Page 1 of 3' });
      brandedPage(ctx, 'Part two', { kind: 'section' });
      brandedPage(ctx, 'Thank you', { kind: 'end' });
      page.children.push(text(ctx, 'Body', 'Hello', contentBox(page).x, contentBox(page).y, 400));
      const th = ctx.project.themes!;
      expect(th.list.map((t) => t.name)).toEqual(['Gold', 'Purple', 'Blue', 'Green', 'Orange', 'Red', 'High contrast']);
      expect(th.default).toBe(`theme-${way.id}`);
      expect(ctx.project.settings.startArtboardId).toBe(hero.id);
      const start = th.tokens.find((t) => t.name === 'brand/gradient-start')!;
      expect(start.values[`theme-${way.id}`]).toBe(way.brand.gradientStart);
      //every layer colour and every background is a token
      for (const ab of ctx.project.artboards) expect(JSON.stringify([ab.children, ab.background])).not.toMatch(/"#[0-9a-f]{3,8}"/i);
      expect(JSON.stringify(ctx.project.artboards)).toContain('"fontFamily":"Open Sans"');
      expect(page.children.filter(isChrome).map((n) => n.name)).toEqual(['Brand accent', 'UniSQ logo']);
      expect(() => normalizeProject(JSON.parse(JSON.stringify(ctx.project)))).not.toThrow();
    }
  });
});
