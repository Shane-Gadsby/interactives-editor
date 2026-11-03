import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { paletteTip, parseCustomProperties, parsePaletteCss } from '../src/lib/palette';

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
    expect(f.mock.calls[0][0]).toBe('/styles/palette.min.css');
    expect(g[0].colors[0]).toMatchObject({ label: 'Blue', value: '#0080a8' });
  });
});
