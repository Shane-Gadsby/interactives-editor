//The toolbox look: what new layers, the question kit and the built-in starters are painted with, and how projects made before it
//are left alone until someone asks.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIGHT_LOOK, OLD_STARTER_VALUES, PALETTE_SNAPSHOT, STARTER_TOKEN_DEFS, createNode, createProject, currentPalette, forgetPaletteFetches, isTokenRef, makeColorResolver, refreshLinkedTokens, resolveSpec, setLivePalette, starterHex, type Project, type ProjectThemes } from 'interactives-player';
import { EditorStore } from '../src/store/store';
import { STARTERS } from '../src/lib/template-starters';
import { addQuestion } from '../src/lib/question-kit';
import { addStepBar, enableSteps } from '../src/lib/steps';
import { checkAccessibility } from '../src/lib/a11y/checks';
import { addTheme, checkThemePairs, lookDefaults, lookFor, setTokenValue, starterThemes, starterUpgrade, upgradeStarterTokens } from '../src/lib/themes';
import { syncProjectWithPalette } from '../src/lib/palette-look';
import { getTopic } from '../src/help/topics';

/** Every string in a value, however deep. */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) strings(x, out);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, out);
  return out;
}
const refsIn = (v: unknown): string[] => strings(v).flatMap((s) => s.match(/token:[\w-]+/g) ?? []);

/** The themes a project from before the toolbox look carries: the old seven tokens, never edited. */
function oldThemes(): ProjectThemes {
  const t = starterThemes();
  t.tokens = t.tokens
    .filter((x) => OLD_STARTER_VALUES[x.name])
    .map((x) => ({ id: x.id, name: x.name, values: Object.fromEntries(t.list.map((th, i) => [th.id, OLD_STARTER_VALUES[x.name][i]])) }));
  return t;
}

//The Light theme is the toolbox as it draws itself, from the shared palette, so these pairs fall below WCAG AA. They are reported as
//they are (Themes panel, accessibility checker) and listed in the themes help and the README. If the palette changes this list
//changes: update the help and the README with it.
const LIGHT_BELOW_AA = [
  'muted text on background 2.59:1',
  'muted text on surface 2.38:1',
  'muted text on muted surface 1.96:1',
  'primary on background 1.75:1',
  'outline against background 2.59:1',
  'outline against surface 2.38:1',
  'focus ring on background 1.75:1',
  'focus ring on surface 1.61:1',
  'success on its surface 3.90:1',
  'error on its surface 3.13:1',
  'warning on its surface 2.67:1',
];

describe('the starter tokens', () => {
  const t = starterThemes();
  const pairs = checkThemePairs(t);
  const nameOf = (id: string) => t.list.find((x) => x.id === id)!.name;

  it('pass every contrast pair in Dark and High contrast', () => {
    expect(pairs.length).toBeGreaterThan(40);
    expect(pairs.filter((p) => !p.pass && nameOf(p.themeId) !== 'Light').map((p) => `${nameOf(p.themeId)}: ${p.label} ${p.ratio.toFixed(2)}`)).toEqual([]);
  });

  it('report the Light pairs that fall below AA as they really are, and the help and README list them', () => {
    const low = pairs.filter((p) => !p.pass).map((p) => `${p.label} ${p.ratio.toFixed(2)}:1`);
    expect(low).toEqual(LIGHT_BELOW_AA);
    const help = getTopic('themes')!.body;
    for (const line of LIGHT_BELOW_AA) expect(help, line).toContain(line);
    const readme = readFileSync('README.md', 'utf8');
    for (const line of LIGHT_BELOW_AA) expect(readme, line).toContain(line);
  });

  it('are the toolbox values, taken from the palette', () => {
    const light = (name: string) => t.tokens.find((x) => x.name === name)!.values['theme-light'];
    expect(light('color/button')).toBe(PALETTE_SNAPSHOT['--ilar-btn-primary-background']);
    expect(light('color/on-button')).toBe(PALETTE_SNAPSHOT['--ilar-btn-primary-text']);
    expect(light('color/border')).toBe(PALETTE_SNAPSHOT['--ilar-swatch-grey-4']);
    expect(light('color/primary')).toBe(PALETTE_SNAPSHOT['--ilar-primary']);
    expect(light('color/focus')).toBe(PALETTE_SNAPSHOT['--ilar-primary']);
    expect(light('color/surface')).toBe(PALETTE_SNAPSHOT['--ilar-swatch-grey-1']);
    expect(light('color/text')).toBe(PALETTE_SNAPSHOT['--ilar-swatch-grey-7']);
    expect(light('color/button')).toBe('#ffb448');
    expect(LIGHT_LOOK.button).toBe('#ffb448');
    expect(STARTER_TOKEN_DEFS.map((d) => d.name)).toEqual(expect.arrayContaining(['color/focus', 'color/divider', 'color/success', 'color/error', 'color/warning']));
  });
});

describe('palette links', () => {
  afterEach(() => setLivePalette(null));

  it('every starter colour remembers the palette property it came from', () => {
    const t = starterThemes();
    for (const token of t.tokens) {
      for (const th of t.list) {
        const spec = token.palette?.[th.id];
        expect(spec, `${token.name} in ${th.name}`).toBeTruthy();
        expect(resolveSpec(spec!, PALETTE_SNAPSHOT)).toBe(token.values[th.id]);
      }
    }
    const button = t.tokens.find((x) => x.name === 'color/button')!;
    expect(button.palette!['theme-light']).toBe('--ilar-btn-primary-background');
  });

  it('are refreshed from the live palette when a project opens, and a hand edit drops the link', () => {
    const p = createProject();
    p.themes = starterThemes();
    const button = () => p.themes!.tokens.find((x) => x.name === 'color/button')!;
    const text = () => p.themes!.tokens.find((x) => x.name === 'color/text')!;
    setLivePalette({ '--ilar-btn-primary-background': '#00aa55', '--ilar-swatch-grey-7': '#101010' });
    const s = new EditorStore(p);
    const edit = text().id;
    s.update((d) => void setTokenValue(d, edit, 'theme-light', '#222222'));
    const before = s.get().project;
    expect(before.themes!.tokens.find((x) => x.id === edit)!.palette!['theme-light']).toBeUndefined();
    expect(before.themes!.tokens.find((x) => x.id === edit)!.palette!['theme-dark']).toBeTruthy();
    const opened = JSON.parse(JSON.stringify(before)) as Project;
    expect(refreshLinkedTokens(opened.themes, currentPalette())).toBeGreaterThan(0);
    const btn = opened.themes!.tokens.find((x) => x.name === 'color/button')!;
    expect(btn.values).toEqual({ 'theme-light': '#00aa55', 'theme-dark': '#00aa55', 'theme-high-contrast': '#00aa55' });
    const txt = opened.themes!.tokens.find((x) => x.id === edit)!;
    // the edited colour stays; the linked ones follow
    expect(txt.values['theme-light']).toBe('#222222');
    expect(txt.values['theme-high-contrast']).toBe(starterHex(STARTER_TOKEN_DEFS.find((d) => d.key === 'text')!, 'highContrast'));
    expect(button().values['theme-light']).toBe('#ffb448');
  });

  it('with the palette unreachable the stored colours stand', async () => {
    forgetPaletteFetches();
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline');
    });
    const p = createProject();
    p.themes = starterThemes();
    p.themes.tokens[0].values['theme-light'] = '#123456';
    expect(await syncProjectWithPalette(p)).toBe(0);
    expect(p.themes.tokens[0].values['theme-light']).toBe('#123456');
    vi.unstubAllGlobals();
    forgetPaletteFetches();
  });

  it('a colour set to what the palette gives keeps its link, any other colour cuts it', () => {
    const s = new EditorStore({ ...createProject(), themes: starterThemes() });
    const t = s.get().project.themes!.tokens.find((x) => x.name === 'color/button')!;
    s.update((d) => void setTokenValue(d, t.id, 'theme-light', t.values['theme-light']));
    expect(s.get().project.themes!.tokens.find((x) => x.id === t.id)!.palette!['theme-light']).toBeTruthy();
    s.update((d) => void setTokenValue(d, t.id, 'theme-light', '#000000'));
    expect(s.get().project.themes!.tokens.find((x) => x.id === t.id)!.palette!['theme-light']).toBeUndefined();
  });

  it('copying a theme copies the links, and the upgrade for an older project links what it writes', () => {
    const p = createProject();
    p.themes = starterThemes();
    const s = new EditorStore(p);
    s.update((d) => void addTheme(d, 'Sepia'));
    const sepia = s.get().project.themes!.list.find((x) => x.name === 'Sepia')!;
    expect(s.get().project.themes!.tokens.every((x) => x.palette![sepia.id] === x.palette!['theme-light'])).toBe(true);
    const old = createProject();
    old.themes = oldThemes();
    const s2 = new EditorStore(old);
    s2.update((d) => void upgradeStarterTokens(d));
    expect(s2.get().project.themes!.tokens.every((x) => Object.keys(x.palette ?? {}).length === 3)).toBe(true);
  });
});

describe('new layers', () => {
  it('keep the plain toolbox colours in a project with no tokens', () => {
    const p = createProject();
    expect(lookDefaults(p, 'button')).toEqual({});
    expect(lookFor(p.themes)).toEqual(LIGHT_LOOK);
  });

  it('follow the starter tokens in a project that has them', () => {
    const p = createProject();
    p.themes = starterThemes();
    const id = (name: string) => `token:${p.themes!.tokens.find((t) => t.name === name)!.id}`;
    const b = createNode('button', lookDefaults(p, 'button') as never);
    expect(b.fill).toEqual({ type: 'solid', color: id('color/button') });
    expect(b.color).toBe(id('color/on-button'));
    const i = createNode('input', lookDefaults(p, 'input') as never);
    expect(i.fill).toEqual({ type: 'solid', color: id('color/background') });
    expect(i.stroke!.paint).toEqual({ type: 'solid', color: id('color/border') });
    expect(createNode('text', lookDefaults(p, 'text') as never).color).toBe(id('color/text'));
    expect(createNode('rect', lookDefaults(p, 'rect') as never).fill).toEqual({ type: 'solid', color: id('color/surface-muted') });
    // and a button reads gold with dark text in Light, the same gold in Dark
    const light = makeColorResolver(p.themes, 'theme-light');
    const dark = makeColorResolver(p.themes, 'theme-dark');
    expect(light(b.fill?.type === 'solid' ? b.fill.color : '')).toBe('#ffb448');
    expect(dark(b.color)).toBe('#1e1e1e');
  });

  it('use a token by its name, so projects with their own token ids work, and fall back to the plain colour for one they lack', () => {
    const p = createProject();
    p.themes = oldThemes();
    const b = createNode('button', lookDefaults(p, 'button') as never);
    expect(b.fill).toEqual({ type: 'solid', color: LIGHT_LOOK.button });
    const t = createNode('text', lookDefaults(p, 'text') as never);
    expect(isTokenRef(t.color)).toBe(true);
  });
});

describe('the question kit', () => {
  const build = (themed: boolean): Project => {
    const p = createProject();
    if (themed) p.themes = starterThemes();
    const s = new EditorStore(p);
    s.update((d) => void addQuestion(d, d.artboards[0].id, 'single'));
    s.update((d) => void addQuestion(d, d.artboards[0].id, 'ordering'));
    return s.get().project;
  };

  it('is painted with the plain toolbox colours in a project with no tokens', () => {
    const p = build(false);
    expect(refsIn(p.artboards[0])).toEqual([]);
    const all = strings(p.artboards[0]).join(' ');
    expect(all).toContain('#ffb448');
    expect(all).not.toContain('#3b5bfd');
  });

  it('follows the tokens in a project that has them, in the layers and in the answer-state bindings', () => {
    const p = build(true);
    const ids = new Set(p.themes!.tokens.map((t) => `token:${t.id}`));
    const used = refsIn(p.artboards[0]);
    expect(used.length).toBeGreaterThan(20);
    expect(used.every((r) => ids.has(r))).toBe(true);
    const id = (name: string) => `token:${p.themes!.tokens.find((t) => t.name === name)!.id}`;
    const bindings = strings(p.artboards[0]).filter((s) => s.includes('item.state'));
    expect(bindings.some((s) => s.includes(id('color/success-surface')) && s.includes(id('color/error-surface')))).toBe(true);
    // no leftover raw hex colours in the question's own layers (the hotspot picture is not part of these two)
    expect(strings(p.artboards[0].children).filter((s) => /^#[0-9a-f]{6}$/i.test(s))).toEqual([]);
  });
});

describe('the built-in starters', () => {
  for (const s of STARTERS) {
    it(`${s.name} carries the themes and uses the tokens`, () => {
      const { project } = s.build();
      expect(project.themes?.tokens.length).toBe(STARTER_TOKEN_DEFS.length);
      const ids = new Set(project.themes!.tokens.map((t) => `token:${t.id}`));
      const used = refsIn(project.artboards);
      //The animated intro is a dark hero on purpose: it carries the themes but keeps its own fixed colours
      if (s.key !== 'timeline-intro') expect(used.length).toBeGreaterThan(3);
      expect(used.every((r) => ids.has(r))).toBe(true);
    });

    it(`${s.name} has no contrast findings in Dark or High contrast`, () => {
      const { project } = s.build();
      //Light is the toolbox palette as drawn, so it may report some; the other themes are built to pass
      const bad = checkAccessibility(project).findings.filter((f) => f.check === 'contrast' && /^In (Dark|High contrast)/.test(f.detail));
      expect(bad.map((f) => f.detail)).toEqual([]);
    });
  }

  it('step bars take the same look', () => {
    const p = createProject();
    p.themes = starterThemes();
    const ab = p.artboards[0];
    enableSteps(p, ab);
    const id = addStepBar(p, ab);
    expect(refsIn(ab.children.find((n) => n.id === id)).length).toBeGreaterThan(5);
  });
});

describe('projects made before the toolbox look', () => {
  it('do not change when nothing is done: their token values are their own', () => {
    const p = createProject();
    p.themes = oldThemes();
    const before = JSON.stringify(p.themes);
    createNode('button', lookDefaults(p, 'button') as never);
    expect(JSON.stringify(p.themes)).toBe(before);
    expect(starterUpgrade(p.themes).restyle).toHaveLength(7);
    expect(starterUpgrade(p.themes).missing).toHaveLength(STARTER_TOKEN_DEFS.length - 7);
  });

  it('move to the new look on request, keeping edited tokens and adding what is missing', () => {
    const p = createProject();
    p.themes = oldThemes();
    const edited = p.themes.tokens.find((t) => t.name === 'color/primary')!;
    edited.values['theme-light'] = '#ff0000';
    const ids = p.themes.tokens.map((t) => t.id);
    const s = new EditorStore(p);
    s.update((d) => void upgradeStarterTokens(d));
    const t = s.get().project.themes!;
    expect(t.tokens.slice(0, ids.length).map((x) => x.id)).toEqual(ids);
    const val = (name: string, theme: string) => t.tokens.find((x) => x.name === name)!.values[theme];
    expect(val('color/text', 'theme-light')).toBe('#1e1e1e');
    expect(val('color/text', 'theme-dark')).toBe('#f4f4f4');
    expect(val('color/primary', 'theme-light')).toBe('#ff0000');
    expect(val('color/button', 'theme-high-contrast')).toBe('#ffb448');
    expect(t.tokens).toHaveLength(STARTER_TOKEN_DEFS.length);
    expect(starterUpgrade(t).restyle.map((x) => x.name)).toEqual([]);
    expect(starterUpgrade(t).missing).toEqual([]);
  });

  it('are not offered anything when they never had the starter tokens', () => {
    const p = createProject();
    p.themes = { list: [{ id: 'a', name: 'A' }], tokens: [{ id: 'k', name: 'color/brand', values: { a: '#123456' } }] };
    expect(starterUpgrade(p.themes)).toEqual({ restyle: [], missing: [] });
    expect(starterUpgrade(undefined)).toEqual({ restyle: [], missing: [] });
  });
});
