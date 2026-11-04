import { beforeAll, describe, expect, it } from 'vitest';
import { statSync } from 'node:fs';
import { createNode, DEFAULT_FONT as PLAYER_FONT, type FontRef } from 'interactives-player';
import { CATEGORIES, catalogFont, ensureGoogleFont, filterOptions, firstFamily, fontOptions, fontStack, loadCatalog, matchRank, previewFonts, previewUrl, weightsFor, type CatalogFont } from '../src/lib/font-catalog';
import { GOOGLE_FONT_FAMILIES } from '../src/lib/google-fonts';
import { DEFAULT_FONT } from '../src/lib/prefs';
// @ts-expect-error a plain script, no types
import { compact, render } from '../scripts/google-fonts.mjs';

let list: CatalogFont[];
beforeAll(async () => {
  list = await loadCatalog();
});

describe('the shipped family list', () => {
  it('has every Google family, in a handful of categories, with weights', () => {
    expect(list.length).toBeGreaterThan(1500);
    expect(new Set(list.map((f) => f.category))).toEqual(new Set(CATEGORIES.map((c) => c.id)));
    expect(list.every((f) => f.weights.length > 0 && f.weights.every((w) => w >= 100 && w <= 900))).toBe(true);
    expect(new Set(list.map((f) => f.family.toLowerCase())).size).toBe(list.length);
    expect(catalogFont('open sans')).toMatchObject({ family: 'Open Sans', category: 'sans' });
    expect(catalogFont('Open Sans')!.weights).toEqual(expect.arrayContaining([400, 600, 700]));
    expect(catalogFont('Playfair Display')!.category).toBe('serif');
    expect(catalogFont('Roboto Mono')!.category).toBe('mono');
  });
  it('stays small: names, categories and weights only', () => {
    expect(statSync('src/data/google-fonts.json').size).toBeLessThan(120_000);
  });
  it('is the list the importers use too', () => {
    expect(GOOGLE_FONT_FAMILIES).toHaveLength(list.length);
    expect(GOOGLE_FONT_FAMILIES).toContain('Montserrat');
  });
  it('the refresh script keeps just family, category and weights', () => {
    const rows = compact({
      familyMetadataList: [
        { family: 'Zed', category: 'Serif', popularity: 9, fonts: { '400': {}, '400i': {}, '700': {} }, axes: [], designers: ['x'] },
        { family: 'Aye', category: 'Monospace', popularity: 1, fonts: { '300': {} }, size: 3 },
        { family: 'Bee', category: 'Handwriting', popularity: 5, fonts: {} },
      ],
    });
    expect(rows).toEqual([['Aye', 'm', [300]], ['Bee', 'h', [400]], ['Zed', 'r', [400, 700]]]);
    const out = JSON.parse(render(rows, new Date('2026-11-04T10:00:00Z')));
    expect(out.updated).toBe('2026-11-04');
    expect(out.fonts).toEqual(rows);
    expect(() => compact({ familyMetadataList: [{ family: 'X', category: 'Weird', fonts: {} }] })).toThrow(/Unknown category/);
    expect(() => compact({})).toThrow();
  });
});

describe('Open Sans is the default', () => {
  it('everywhere that names it agrees', () => {
    expect(DEFAULT_FONT).toBe('Open Sans');
    expect(PLAYER_FONT).toBe('Open Sans');
    for (const type of ['text', 'button', 'input', 'link'] as const) expect(firstFamily((createNode(type) as unknown as { fontFamily: string }).fontFamily)).toBe('Open Sans');
  });
});

describe('font values', () => {
  it('firstFamily reads the first family of a CSS value', () => {
    expect(firstFamily('"Open Sans", system-ui, sans-serif')).toBe('Open Sans');
    expect(firstFamily("'Playfair Display', serif")).toBe('Playfair Display');
    expect(firstFamily('Georgia, serif')).toBe('Georgia');
    expect(firstFamily('')).toBe('');
  });
  it('fontStack quotes names with spaces and falls back by category', () => {
    expect(fontStack('Open Sans')).toBe('"Open Sans", system-ui, sans-serif');
    expect(fontStack('Playfair Display')).toBe('"Playfair Display", serif');
    expect(fontStack('Roboto Mono')).toBe('"Roboto Mono", monospace');
    expect(fontStack('Caveat')).toBe('Caveat, cursive');
    expect(fontStack('Nobody Knows This')).toBe('"Nobody Knows This", system-ui, sans-serif');
  });
});

describe('weightsFor', () => {
  it('always includes regular and bold, and the weights asked for, moved to what the family has', () => {
    expect(weightsFor('Open Sans', [])).toEqual([400, 700]);
    expect(weightsFor('Open Sans', [600])).toEqual([400, 600, 700]);
    // Lato has no 600: the browser would use 700 for it
    expect(weightsFor('Lato', [600])).toEqual([400, 700]);
    expect(weightsFor('Lato', [200])).toEqual([100, 400, 700]);
    expect(weightsFor('Unlisted Face', [500])).toEqual([400, 500, 700]);
  });
});

describe('ensureGoogleFont', () => {
  it('adds a listed family with the weights in use', () => {
    const fonts: FontRef[] = [];
    expect(ensureGoogleFont(fonts, 'poppins', [600])).toBe(true);
    expect(fonts).toEqual([{ family: 'Poppins', source: 'google', weights: [400, 600, 700] }]);
  });
  it('tops up a family the project has, and does nothing when nothing is missing', () => {
    const fonts: FontRef[] = [{ family: 'Open Sans', source: 'google', weights: [400, 700] }];
    expect(ensureGoogleFont(fonts, 'Open Sans', [800])).toBe(true);
    expect(fonts[0].weights).toEqual([400, 700, 800]);
    expect(ensureGoogleFont(fonts, 'Open Sans', [800, 400])).toBe(false);
    expect(fonts).toHaveLength(1);
  });
  it('leaves an uploaded font of the same name alone', () => {
    const fonts: FontRef[] = [{ family: 'Open Sans', source: 'asset', assetId: 'a1' }];
    expect(ensureGoogleFont(fonts, 'Open Sans', [400])).toBe(false);
    expect(fonts).toEqual([{ family: 'Open Sans', source: 'asset', assetId: 'a1' }]);
  });
  it('only adds a name the list does not know when asked to', () => {
    const fonts: FontRef[] = [];
    expect(ensureGoogleFont(fonts, 'Brand New Face', [400])).toBe(false);
    expect(ensureGoogleFont(fonts, 'Brand New Face', [400], { force: true })).toBe(true);
    expect(fonts).toEqual([{ family: 'Brand New Face', source: 'google', weights: [400, 700] }]);
    expect(ensureGoogleFont(fonts, '  ', [400], { force: true })).toBe(false);
  });
  it('existing: tops up but never adds', () => {
    const fonts: FontRef[] = [];
    expect(ensureGoogleFont(fonts, 'Poppins', [600], { existing: true })).toBe(false);
    expect(fonts).toEqual([]);
  });
});

describe('the rows of the picker', () => {
  const project: FontRef[] = [
    { family: 'Brand Sans', source: 'asset', assetId: 'b' },
    { family: 'Lato', source: 'google', weights: [400] },
  ];
  it('lists the project fonts first, then the system ones, then every Google family once', () => {
    const rows = fontOptions(project, list);
    expect(rows.slice(0, 2).map((r) => [r.family, r.kind])).toEqual([['Brand Sans', 'upload'], ['Lato', 'project']]);
    expect(rows[2].kind).toBe('system');
    expect(rows.filter((r) => r.family === 'Lato')).toHaveLength(1);
    expect(rows.filter((r) => r.kind === 'google')).toHaveLength(list.length - 1);
    expect(rows.find((r) => r.family === 'Georgia')).toMatchObject({ category: 'serif', stack: 'Georgia, serif' });
    expect(fontOptions([], list, { system: false }).some((r) => r.kind === 'system')).toBe(false);
  });
  it('ranks an exact name, then a prefix, then a word prefix, then anywhere', () => {
    expect([matchRank('Open Sans', ['open', 'sans']), matchRank('Open Sans Condensed', ['open', 'sans']), matchRank('Noto Open Sans', ['open', 'sans']), matchRank('Reopen Sans', ['open'])]).toEqual([0, 1, 2, 3]);
    expect(matchRank('Lato', ['open'])).toBe(-1);
    expect(matchRank('Open Sans', ['sans', 'open'])).toBe(2);
  });
  it('filters by words and by category', () => {
    const rows = fontOptions(project, list);
    const hits = filterOptions(rows, 'open sans');
    expect(hits[0].family).toBe('Open Sans');
    expect(hits.every((r) => /open/i.test(r.family) && /sans/i.test(r.family))).toBe(true);
    const mono = filterOptions(rows, '', 'mono');
    expect(mono.length).toBeGreaterThan(20);
    expect(mono.every((r) => r.category === 'mono')).toBe(true);
    // an uploaded font nobody has categorised is not in any category
    expect(filterOptions(rows, '', 'sans').some((r) => r.family === 'Brand Sans')).toBe(false);
    expect(filterOptions(rows, 'serif', 'serif').every((r) => r.category === 'serif')).toBe(true);
    expect(filterOptions(rows, 'zzzzqq')).toEqual([]);
    expect(filterOptions(rows, '')).toBe(rows);
  });
});

describe('previews', () => {
  it('ask css2 for just the letters of the name, once per family, and skip fonts the project loads', () => {
    expect(previewUrl('Open Sans')).toBe('https://fonts.googleapis.com/css2?family=Open+Sans&text=Open%20Sans&display=swap');
    previewFonts(['Zilla Slab', 'Zilla Slab', 'Pacifico'], ['pacifico']);
    previewFonts(['Zilla Slab']);
    const links = [...document.head.querySelectorAll<HTMLLinkElement>('link[data-font-preview]')];
    expect(links.map((l) => l.dataset.fontPreview)).toEqual(['Zilla Slab']);
    expect(links[0].href).toContain('text=Zilla%20Slab');
  });
});
