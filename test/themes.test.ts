import { describe, expect, it } from 'vitest';
import { STARTER_TOKEN_DEFS, createNode, createProject, type Project, type RectNode, type TextNode } from 'interactives-player';
import { EditorStore } from '../src/store/store';
import { addColorStyle, applyColorStyle, editStyle, syncLibraryStyles } from '../src/lib/libraries';
import { addTheme, addToken, bakedForExport, canvasResolver, checkThemePairs, convertStylesToTokens, ensureThemes, removeTheme, removeToken, setTokenValue, shownTheme, starterThemes, themeCounts } from '../src/lib/themes';
import { checkAccessibility } from '../src/lib/a11y/checks';

const solid = (color: string) => ({ type: 'solid' as const, color });
const tokenId = (p: Project, name: string) => p.themes!.tokens.find((t) => t.name === name)!.id;

function themed(): Project {
  const p = createProject('Themed');
  p.themes = starterThemes();
  return p;
}

describe('themes: starter, editing', () => {
  it('starts with three themes and the toolbox-look tokens, each with a value in every theme', () => {
    const t = starterThemes();
    expect(t.list.map((x) => x.name)).toEqual(['Light', 'Dark', 'High contrast']);
    expect(t.list[2].highContrast).toBe(true);
    expect(t.tokens).toHaveLength(STARTER_TOKEN_DEFS.length);
    expect(t.tokens.map((x) => x.name)).toEqual(expect.arrayContaining(['color/button', 'color/on-button', 'color/surface-muted', 'color/focus', 'color/border']));
    for (const token of t.tokens) expect(Object.keys(token.values).sort()).toEqual(t.list.map((x) => x.id).sort());
  });

  it('adds a theme as a copy of the default, and takes it away again', () => {
    const s = new EditorStore(themed());
    s.update((d) => void addTheme(d, 'Sepia'));
    const p = s.get().project;
    const sepia = p.themes!.list.find((x) => x.name === 'Sepia')!;
    for (const token of p.themes!.tokens) expect(token.values[sepia.id]).toBe(token.values[p.themes!.list[0].id]);
    s.update((d) => void removeTheme(d, sepia.id));
    expect(s.get().project.themes!.list).toHaveLength(3);
    expect(s.get().project.themes!.tokens.every((t) => !(sepia.id in t.values))).toBe(true);
    // the last theme stays
    const one = new EditorStore({ ...createProject(), themes: { list: [{ id: 'a', name: 'A' }], tokens: [] } });
    one.update((d) => void removeTheme(d, 'a'));
    expect(one.get().project.themes!.list).toHaveLength(1);
  });

  it('a token that goes leaves its default theme colour behind on the layers that used it', () => {
    const p = themed();
    const id = tokenId(p, 'color/primary');
    p.artboards[0].children.push(createNode('rect', { fill: solid(`token:${id}`), stroke: { paint: solid(`token:${id}`), width: 2 } }), createNode('text', { color: `token:${id}` }));
    const s = new EditorStore(p);
    s.update((d) => void removeToken(d, id));
    const [r, t] = s.get().project.artboards[0].children as [RectNode, TextNode];
    expect(r.fill).toEqual(solid('#a35f00'));
    expect(r.stroke!.paint).toEqual(solid('#a35f00'));
    expect(t.color).toBe('#a35f00');
    expect(s.get().project.themes!.tokens.some((x) => x.id === id)).toBe(false);
  });

  it('creates themes on first use and counts what follows them', () => {
    const s = new EditorStore(createProject());
    s.update((d) => void ensureThemes(d));
    const token = s.get().project.themes!.tokens[0];
    s.update((d) => void addToken(d, 'color/accent', '#ff00aa'));
    const accent = s.get().project.themes!.tokens.find((t) => t.name === 'color/accent')!;
    expect(Object.values(accent.values)).toEqual(['#ff00aa', '#ff00aa', '#ff00aa']);
    const p = s.get().project;
    s.update((d) => {
      d.artboards[0].children.push(createNode('rect', { fill: solid(`token:${token.id}`) }), createNode('rect', { fill: solid('#123456'), stroke: { paint: solid('#654321'), width: 1 } }), createNode('text', { color: '#000' }));
    });
    const c = themeCounts(s.get().project);
    expect(c.used.get(token.id)).toBe(1);
    expect(c.raw).toBe(3);
    expect(p.artboards[0].children).toHaveLength(0);
  });

  it('draws the theme being shown, and bakes it for exports', () => {
    const p = themed();
    const id = tokenId(p, 'color/background');
    p.artboards[0].children.push(createNode('rect', { fill: solid(`token:${id}`) }));
    expect(shownTheme(p, null)!.name).toBe('Light');
    expect(shownTheme(p, 'theme-dark')!.name).toBe('Dark');
    expect(shownTheme(p, 'gone')!.name).toBe('Light');
    expect(canvasResolver(p, 'theme-dark')!(`token:${id}`)).toBe('#1e1e1e');
    expect(canvasResolver(p, 'theme-dark')).toBe(canvasResolver(p, 'theme-dark'));
    expect(canvasResolver(createProject(), null)).toBeNull();
    const baked = bakedForExport(p, 'theme-dark');
    expect((baked.artboards[0].children[0] as RectNode).fill).toEqual(solid('#1e1e1e'));
    expect(bakedForExport(createProject(), null)).toBeInstanceOf(Object);
  });
});

describe('themes: colour styles become tokens', () => {
  function withStyle() {
    const p = createProject('Styled');
    p.artboards[0].children.push(createNode('rect', { id: 'a', fill: solid('#ff0000') }), createNode('rect', { id: 'b', fill: solid('#00ff00') }), createNode('text', { id: 'c', color: '#0000ff' }));
    const s = new EditorStore(p);
    s.update((d) => {
      const red = addColorStyle(d, 'Brand', '#ff0000');
      const blue = addColorStyle(d, 'color/ink', '#0000ff');
      applyColorStyle(d.artboards[0].children[0], 'fill', red);
      applyColorStyle(d.artboards[0].children[2], 'color', blue);
    });
    return s;
  }

  it('makes a token per style, points the layers that follow it at it, and leaves the others raw', () => {
    const s = withStyle();
    let made = 0;
    s.update((d) => void (made = convertStylesToTokens(d)));
    expect(made).toBe(2);
    const p = s.get().project;
    const brand = p.styles!.colors.find((c) => c.name === 'Brand')!;
    expect(p.themes!.tokens.map((t) => t.name).sort()).toEqual(['color/Brand', 'color/ink', ...starterThemes().tokens.map((t) => t.name)].sort());
    expect(brand.token).toBeTruthy();
    const [a, b, c] = p.artboards[0].children as [RectNode, RectNode, TextNode];
    expect(a.fill).toEqual(solid(`token:${brand.token}`));
    expect(a.styleRefs?.fill).toBe(brand.id);
    expect(b.fill).toEqual(solid('#00ff00'));
    expect(c.color).toBe(`token:${p.styles!.colors[1].token}`);
    // a second press has nothing to do
    s.update((d) => void (made = convertStylesToTokens(d)));
    expect(made).toBe(0);
  });

  it('keeps following through a style edit, and the token keeps the style in step', () => {
    const s = withStyle();
    s.update((d) => void convertStylesToTokens(d));
    const brand = s.get().project.styles!.colors.find((c) => c.name === 'Brand')!;
    s.update((d) => void editStyle(d, brand.id, { color: '#aa0000' }));
    const p = s.get().project;
    const token = p.themes!.tokens.find((t) => t.id === brand.token)!;
    const light = p.themes!.list[0].id;
    expect(token.values[light]).toBe('#aa0000');
    expect((p.artboards[0].children[0] as RectNode).fill).toEqual(solid(`token:${brand.token}`));
    // editing the token's default colour moves the style's swatch
    s.update((d) => setTokenValue(d, brand.token!, light, '#bb0000'));
    expect(s.get().project.styles!.colors.find((c) => c.id === brand.id)!.color).toBe('#bb0000');
    // a hand edit on the layer cuts it loose from the style as before
    s.setProps(['a'], { 'fill.color': '#123123' });
    expect(s.get().project.artboards[0].children[0].styleRefs?.fill).toBeUndefined();
  });

  it('library styles convert too, and a library update keeps the link and drops the library\'s own token id', () => {
    const p = createProject('Consumer');
    const s = new EditorStore(p);
    s.update((d) => syncLibraryStyles(d, 'lib1', { colors: [{ id: 'ls1', name: 'Accent', color: '#ff8800' }], texts: [] }));
    s.update((d) => void convertStylesToTokens(d));
    const style = s.get().project.styles!.colors[0];
    expect(style.library?.libraryId).toBe('lib1');
    expect(style.token).toBeTruthy();
    s.update((d) => syncLibraryStyles(d, 'lib1', { colors: [{ id: 'ls1', name: 'Accent', color: '#ff9900', token: 'theirs' } as never], texts: [] }));
    const after = s.get().project.styles!.colors[0];
    expect(after.color).toBe('#ff9900');
    expect(after.token).toBe(style.token);
    // a library style that arrives carrying a token id of its own does not keep it
    s.update((d) => syncLibraryStyles(d, 'lib2', { colors: [{ id: 'x', name: 'Other', color: '#111111', token: 'theirs' } as never], texts: [] }));
    expect(s.get().project.styles!.colors.find((c) => c.name === 'Other')!.token).toBeUndefined();
  });
});

describe('themes: contrast', () => {
  it('flags the pairs that are too low, per theme', () => {
    const t = starterThemes();
    expect(checkThemePairs(t).every((p) => p.pass)).toBe(true);
    const bg = t.tokens.find((x) => x.name === 'color/background')!;
    const text = t.tokens.find((x) => x.name === 'color/text')!;
    const dark = t.list[1].id;
    bg.values[dark] = '#777777';
    text.values[dark] = '#888888';
    const bad = checkThemePairs(t).filter((p) => !p.pass);
    expect(bad.length).toBeGreaterThan(0);
    expect(bad.every((p) => p.themeId === dark)).toBe(true);
    expect(bad.some((p) => p.label === 'text on background' && p.ratio < 1.5)).toBe(true);
    expect(checkThemePairs(undefined)).toEqual([]);
  });
});

describe('themes: the accessibility checker', () => {
  function scene(textColor: string, backFill: string): Project {
    const p = themed();
    p.artboards[0].children.push(
      createNode('rect', { id: 'back', x: 0, y: 0, width: 800, height: 600, fill: solid(backFill) }),
      createNode('text', { id: 'label', x: 20, y: 20, width: 300, height: 24, text: 'Hello there, this is the text', color: textColor } as never),
    );
    return p;
  }

  it('warns about a theme colour on a fixed colour, and still checks the fixed pair', () => {
    const p = scene('#000000', '#ffffff');
    // (token ids are made per project, so the text takes this project's own)
    (p.artboards[0].children[1] as TextNode).color = `token:${tokenId(p, 'color/text')}`;
    const findings = checkAccessibility(p).findings.filter((f) => f.check === 'contrast');
    const mixed = findings.find((f) => f.title === 'Theme colour on a fixed colour');
    expect(mixed?.severity).toBe('warning');
    expect(mixed?.nodeName).toBeTruthy();
    // In Dark the text is near white on the fixed white: that fails, and says which theme
    const dark = findings.find((f) => f.title === 'Low text contrast');
    expect(dark?.detail.startsWith('In Dark: ')).toBe(true);
    expect(dark?.fix).toBeUndefined();
    expect(findings.some((f) => f.detail.startsWith('In Light: '))).toBe(false);
  });

  it('is quiet when both sides follow the theme', () => {
    const p = themed();
    const bg = tokenId(p, 'color/background');
    const tx = tokenId(p, 'color/text');
    p.artboards[0].children.push(createNode('rect', { x: 0, y: 0, width: 800, height: 600, fill: solid(`token:${bg}`) }), createNode('text', { x: 20, y: 20, width: 300, height: 24, text: 'Hello there, this is the text', color: `token:${tx}` } as never));
    expect(checkAccessibility(p).findings.filter((f) => f.check === 'contrast')).toEqual([]);
  });

  it('reports a theme whose own tokens fail, and offers no fix that would cut the token loose', () => {
    const p = themed();
    const bg = tokenId(p, 'color/background');
    const tx = tokenId(p, 'color/text');
    const hc = p.themes!.list[2].id;
    p.themes!.tokens.find((t) => t.id === tx)!.values[hc] = '#777777';
    p.themes!.tokens.find((t) => t.id === bg)!.values[hc] = '#808080';
    p.artboards[0].children.push(createNode('rect', { x: 0, y: 0, width: 800, height: 600, fill: solid(`token:${bg}`) }), createNode('text', { x: 20, y: 20, width: 300, height: 24, text: 'Hello there, this is the text', color: `token:${tx}` } as never));
    const f = checkAccessibility(p).findings.filter((x) => x.check === 'contrast');
    expect(f).toHaveLength(1);
    expect(f[0].detail.startsWith('In High contrast: ')).toBe(true);
    expect(f[0].fix).toBeUndefined();
  });

  it('projects without tokens give the same findings as before', () => {
    const p = createProject('Plain');
    p.artboards[0].children.push(createNode('rect', { x: 0, y: 0, width: 800, height: 600, fill: solid('#ffffff') }), createNode('text', { x: 20, y: 20, width: 300, height: 24, text: 'Hello there, this is the text', color: '#cccccc' } as never));
    const f = checkAccessibility(p).findings.filter((x) => x.check === 'contrast');
    expect(f).toHaveLength(1);
    expect(f[0].detail.startsWith('In ')).toBe(false);
    expect(f[0].fix).toBeTruthy();
  });
});
