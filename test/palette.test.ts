import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { nameFromComment, paletteTip, parseCustomProperties, parsePaletteCss } from '../src/lib/palette';

const SAMPLE = `
/*Declare the pallet*/
:root {
	/* ----------- Old ----------- */
	--ilar-btn-primary: #fff;
	--ilar-swatch-yellow: #FFB448;
	--ilar-swatch-yellow-dark: #fb9400;
	--ilar-swatch-grey-1: #f4f4f4;
	--ilar-swatch-off-white: #fefefe;
	--ilar-swatch-hyperlink: #428bca;
	--ilar-swatch-error: #f44336;
	--feature-colour-gold: var(--ilar-swatch-yellow);
	--feature-colour-ghost: var(--nope);
	--feature-colour-fallback: var(--nope, #123456);
	--ilar-primary: var(--ilar-swatch-yellow);
	--ilar-btn-hover: var(--ilar-swatch-grey-1);
	--ilar-btn-background: transparent;
	--ilar-loop-a: var(--ilar-loop-b);
	--ilar-loop-b: var(--ilar-loop-a);
	--gold-gradient-1: #f58220;
	--gold-gradient-2: var(--ilar-swatch-yellow);
	--charcoal-gradient-2: rgb(from var(--feature-colour-charcoal) r g b / 0.5);
	--gold-gradient: linear-gradient(90deg, var(--gold-gradient-1), var(--gold-gradient-2));
	--ilar-rgb: rgb(10, 20, 30);
	--ilar-radius: 4px;
}
@property --feature-colour { syntax: '<color>'; inherits: true; initial-value: #777777; }
.not-root { --ilar-swatch-bogus: #000; }
`;

const all = (css: string) => parsePaletteCss(css).flatMap((g) => g.colors);
const find = (css: string, name: string) => all(css).find((c) => c.name === name);

describe('palette parser', () => {
  it('reads custom properties from :root only, minified or not', () => {
    const props = parseCustomProperties(SAMPLE);
    expect(props.get('--ilar-swatch-yellow')).toBe('#FFB448');
    expect(props.has('--ilar-swatch-bogus')).toBe(false);
    const min = parseCustomProperties(':root{--a:#fff;--b:var(--a)}@media (min-width:1px){:root{--c:#000}}');
    expect([...min.keys()]).toEqual(['--a', '--b', '--c']);
  });

  it('groups colours by what they are and names them', () => {
    const groups = parsePaletteCss(SAMPLE);
    expect(groups.map((g) => g.id)).toEqual(['brand', 'greys', 'links', 'feature', 'gradients', 'roles']);
    const brand = groups[0].colors;
    expect(brand.map((c) => c.label)).toEqual(['Yellow', 'Yellow dark']);
    expect(brand[0].value).toBe('#ffb448');
    expect(groups[1].colors.map((c) => c.label)).toEqual(['Grey 1', 'Off white']);
    expect(groups[2].colors.map((c) => c.label)).toEqual(['Hyperlink', 'Error']);
    expect(groups[4].colors.map((c) => c.label)).toEqual(['Gold gradient start', 'Gold gradient end']);
  });

  it('follows var() references, fallbacks and nested chains', () => {
    expect(find(SAMPLE, '--feature-colour-gold')?.value).toBe('#ffb448');
    expect(find(SAMPLE, '--feature-colour-fallback')?.value).toBe('#123456');
    expect(find(SAMPLE, '--gold-gradient-2')?.value).toBe('#ffb448');
  });

  it('leaves out what it cannot settle or what is not a plain colour', () => {
    const names = all(SAMPLE).map((c) => c.name);
    for (const n of ['--feature-colour-ghost', '--ilar-loop-a', '--ilar-loop-b', '--ilar-btn-background', '--charcoal-gradient-2', '--gold-gradient', '--ilar-radius', '--feature-colour']) expect(names, n).not.toContain(n);
    expect(find(SAMPLE, '--ilar-rgb')?.value).toBe('rgb(10, 20, 30)');
  });

  it('notes repeats in the roles group on the colour they repeat instead of listing them again', () => {
    const yellow = find(SAMPLE, '--ilar-swatch-yellow')!;
    expect(yellow.aliases).toContain('--ilar-primary');
    expect(find(SAMPLE, '--ilar-primary')).toBeUndefined();
    expect(find(SAMPLE, '--ilar-swatch-grey-1')!.aliases).toContain('--ilar-btn-hover');
    // a role with a colour of its own still gets listed
    expect(find(SAMPLE, '--ilar-btn-primary')?.value).toBe('#fff');
    expect(paletteTip(yellow)).toBe('Yellow #ffb448 (--ilar-swatch-yellow, also --ilar-primary)');
  });

  it('gives nothing for text that holds no palette', () => {
    expect(parsePaletteCss('')).toEqual([]);
    expect(parsePaletteCss('<!doctype html><html><body>Not found</body></html>')).toEqual([]);
    expect(parsePaletteCss('body { color: #fff }')).toEqual([]);
  });

  it('reads the real stylesheet when the suite is checked out beside it', () => {
    const file = new URL('../../../si-studydesk-styles/public/palette.min.css', import.meta.url);
    if (!existsSync(file)) return;
    const groups = parsePaletteCss(readFileSync(file, 'utf8'));
    expect(groups.length).toBeGreaterThan(3);
    for (const c of groups.flatMap((g) => g.colors)) expect(c.value).toMatch(/^(#[0-9a-f]{3,8}|rgba?\()/);
  });
});

describe('palette name comments', () => {
  const css = (body: string) => `:root {\n${body}\n}`;
  const labels = (c: string) => Object.fromEntries(all(c).map((x) => [x.name, x.label]));

  it('recognises /***name: …***/ and nothing looser', () => {
    expect(nameFromComment('/***name: Gold***/')).toBe('Gold');
    expect(nameFromComment('/***  Name :  Pale   gold  ***/')).toBe('Pale gold');
    expect(nameFromComment('/****name: Gold****/')).toBe('Gold');
    expect(nameFromComment('/*name: Gold*/')).toBeNull();
    expect(nameFromComment('/**name: Gold**/')).toBeNull();
    expect(nameFromComment('/* name: Gold */')).toBeNull();
    expect(nameFromComment('/***name:***/')).toBeNull();
    expect(nameFromComment('/***note: Gold***/')).toBeNull();
    expect(nameFromComment('/***name: ' + 'x'.repeat(100) + '***/')).toHaveLength(60);
  });

  it('a comment after a declaration, on the same line, names that declaration', () => {
    const l = labels(css('\t--feature-colour-gold: #ffb448; /***name: Gold***/\n\t--feature-colour-green: #3E8521;'));
    expect(l['--feature-colour-gold']).toBe('Gold');
    expect(l['--feature-colour-green']).toBe('Green');
  });

  it('a comment on a line of its own names the declaration on the next line', () => {
    const l = labels(css('\t--feature-colour-green: #3E8521;\n\t/***name: Gold***/\n\t--feature-colour-gold: #ffb448;\n\t--feature-colour-blue: #0080A8;'));
    expect(l['--feature-colour-gold']).toBe('Gold');
    expect(l['--feature-colour-green']).toBe('Green');
    expect(l['--feature-colour-blue']).toBe('Blue');
  });

  it('a comment inside the declaration, before its semicolon, names it', () => {
    expect(labels(css('--feature-colour-gold: #ffb448 /***name: Gold***/;'))['--feature-colour-gold']).toBe('Gold');
  });

  it('the last declaration in the rule can carry one too, and the value still parses', () => {
    const c = css('--ilar-swatch-yellow: #ffb448;\n--ilar-swatch-blue: #0080A8; /***name: Sky***/');
    expect(find(c, '--ilar-swatch-blue')).toMatchObject({ label: 'Sky', value: '#0080a8', named: true });
    expect(find(c, '--ilar-swatch-yellow')?.named).toBeUndefined();
  });

  it('a first declaration on the opening line is named by a comment before it', () => {
    expect(labels(':root { /***name: Gold***/ --feature-colour-gold: #ffb448; --feature-colour-blue: #0080A8; }')).toEqual({ '--feature-colour-gold': 'Gold', '--feature-colour-blue': 'Blue' });
  });

  it('works on a var() reference, keeps the property name in the tooltip, and ignores ordinary comments', () => {
    const c = css('--ilar-swatch-yellow: #ffb448;\n--feature-colour-gold: var(--ilar-swatch-yellow); /***name: Gold***/\n/* name: Not this */\n--feature-colour-blue: #0080A8; /* a note */');
    const gold = find(c, '--feature-colour-gold')!;
    expect(gold.label).toBe('Gold');
    expect(find(c, '--feature-colour-blue')!.label).toBe('Blue');
    // yellow and gold share a colour in different groups, so each is listed under its own name
    expect(paletteTip(gold)).toBe('Gold #ffb448 (--feature-colour-gold)');
  });

  it('a name on a role that repeats a swatch is not used for the swatch', () => {
    const c = css('--ilar-swatch-yellow: #ffb448;\n--ilar-primary: var(--ilar-swatch-yellow); /***name: Primary***/');
    expect(find(c, '--ilar-swatch-yellow')!.label).toBe('Yellow');
    expect(find(c, '--ilar-swatch-yellow')!.aliases).toEqual(['--ilar-primary']);
  });

  it('a name comment does not disturb other declarations, brackets or comments with braces', () => {
    const c = css('/* { odd } */\n--ilar-radius: 4px;\n--ilar-swatch-green: rgb(1, 2, 3); /***name: Leaf***/\n--ilar-swatch-blue: #0080A8; /*{*/');
    expect(find(c, '--ilar-swatch-green')).toMatchObject({ label: 'Leaf', value: 'rgb(1, 2, 3)' });
    expect(find(c, '--ilar-swatch-blue')!.label).toBe('Blue');
  });

  it('minified css (no comments survive) just falls back to the property names', () => {
    expect(labels(':root{--feature-colour-gold:#ffb448;--feature-colour-blue:#0080A8}')).toEqual({ '--feature-colour-gold': 'Gold', '--feature-colour-blue': 'Blue' });
  });

  it('the repo minifier (csso) drops these comments, which is why the source is read', () => {
    const dir = new URL('../../../si-studydesk-styles/node_modules/csso', import.meta.url);
    if (!existsSync(dir)) return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const csso = createRequire(import.meta.url)(fileURLToPath(dir)) as { minify(css: string): { css: string } };
    const source = css('--feature-colour-gold: #ffb448; /***name: Gold***/\n/*! keep */\n--feature-colour-blue: #0080A8;');
    const min = csso.minify(source).css;
    expect(min).not.toContain('Gold');
    expect(labels(source)['--feature-colour-gold']).toBe('Gold');
    expect(labels(min)['--feature-colour-gold']).toBe('Gold'); // the property's own name, as before
  });

  it('reads the real palette.css source too', () => {
    const file = new URL('../../../si-studydesk-styles/styles/palette.css', import.meta.url);
    if (!existsSync(file)) return;
    const real = readFileSync(file, 'utf8');
    expect(all(real).length).toBeGreaterThan(10);
    // the same colours as the minified copy
    const min = new URL('../../../si-studydesk-styles/public/palette.min.css', import.meta.url);
    if (existsSync(min)) expect(all(real).map((c) => c.value)).toEqual(all(readFileSync(min, 'utf8')).map((c) => c.value));
  });
});

describe('loadPalette', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is an empty palette, not an error, when the stylesheet is missing or the request fails', async () => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, text: async () => '' }));
    const a = await import('../src/lib/palette');
    expect(await a.loadPalette()).toEqual([]);
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const b = await import('../src/lib/palette');
    expect(await b.loadPalette()).toEqual([]);
  });

  it('fetches once and parses what it gets', async () => {
    vi.resetModules();
    const f = vi.fn().mockResolvedValue({ ok: true, text: async () => ':root{--ilar-swatch-blue:#0080A8}' });
    vi.stubGlobal('fetch', f);
    const m = await import('../src/lib/palette');
    const g = await m.loadPalette();
    await m.loadPalette();
    expect(f).toHaveBeenCalledTimes(1);
    // the source first: it is the one that still has the name comments
    expect(f.mock.calls[0][0]).toBe('/styles/palette.css');
    expect(g[0].colors[0]).toMatchObject({ label: 'Blue', value: '#0080a8' });
  });

  it('falls back to the minified stylesheet when the source is not served', async () => {
    vi.resetModules();
    const f = vi.fn(async (url: string) => (url.endsWith('.min.css') ? { ok: true, text: async () => ':root{--ilar-swatch-blue:#0080A8}' } : { ok: false, text: async () => '' }));
    vi.stubGlobal('fetch', f);
    const m = await import('../src/lib/palette');
    const g = await m.loadPalette();
    expect(f.mock.calls.map((c) => c[0])).toEqual(['/styles/palette.css', '/styles/palette.min.css']);
    expect(g[0].colors[0].label).toBe('Blue');
  });

  it('names come through the loader from the source', async () => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => ':root{--ilar-swatch-blue:#0080A8; /***name: Sky***/}' }));
    const m = await import('../src/lib/palette');
    expect((await m.loadPalette())[0].colors[0].label).toBe('Sky');
  });
});
