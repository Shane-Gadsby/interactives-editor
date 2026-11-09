//The old blue (--accent, --accent-2, the palette blue) is retired: chosen, hover, focus and highlight states are the brand
//gold. This fails when something new picks the blue up by accident, and checks the focus ring and link colours still clear
//the contrast they are meant to
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../src');
const css = readFileSync(join(SRC, 'styles.css'), 'utf8');
const root = postcss.parse(css, { from: 'src/styles.css' });

/** Every .ts/.tsx file under src. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}

type RGB = [number, number, number];
const hex = (h: string): RGB => {
  const x = h.replace('#', '');
  const f = x.length === 3 ? x.replace(/./g, (c) => c + c) : x;
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
};
const lum = (c: RGB): number => {
  const l = c.map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
};
const ratio = (a: RGB, b: RGB): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const hueOf = ([r, g, b]: RGB): { h: number; s: number } => {
  const mx = Math.max(r, g, b) / 255;
  const mn = Math.min(r, g, b) / 255;
  const d = mx - mn;
  if (!d) return { h: 0, s: 0 };
  const l = (mx + mn) / 2;
  const s = d / (1 - Math.abs(2 * l - 1));
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const h = mx === R ? ((G - B) / d) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { h: (h * 60 + 360) % 360, s };
};

/** A palette colour's fallback, as written in the first :root (var(--ilar-swatch-x, #rrggbb)). */
function token(name: string): RGB {
  const m = new RegExp(`${name}:\\s*var\\([^,]+,\\s*(#[0-9a-fA-F]{6})\\)`).exec(css);
  if (!m) throw new Error(`no fallback for ${name}`);
  return hex(m[1]);
}

describe('the old blue is gone from the editor', () => {
  it('has no --accent or --accent-2 anywhere in the stylesheet or the code', () => {
    //the header comment of styles.css says they are gone, so it is the one place the name may appear
    const hits = /--accent/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')) ? ['styles.css'] : [];
    for (const f of sourceFiles(SRC)) {
      if (f.endsWith('code-theme.ts')) continue;
      if (/--accent/.test(readFileSync(f, 'utf8'))) hits.push(f.replace(SRC, 'src'));
    }
    expect(hits).toEqual([]);
  });

  it('uses --u-blue and --u-sky only to define the information colour and the sky sticky note', () => {
    const uses: string[] = [];
    root.walkDecls((d) => {
      if (/var\(--u-(blue|sky)\b/.test(d.value)) uses.push(`${d.parent && 'selector' in d.parent ? (d.parent as { selector: string }).selector : ''} ${d.prop}`.trim());
    });
    const allowed = [':root --info', ':root[data-theme=\'light\'] --info', ':root[data-theme=\'auto\'] --info', '.note-sky --paper', '.note-sky --paper-edge', '.note-sky --paper-head'];
    expect(uses.filter((u) => !allowed.includes(u))).toEqual([]);
  });

  it('uses --action (the blue of an action node) only on the node category, review dots and receive tags', () => {
    const uses: string[] = [];
    root.walkDecls((d) => {
      if (/var\(--action\)/.test(d.value)) uses.push(`${(d.parent as { selector?: string }).selector ?? ''}`.replace(/\s+/g, ' '));
    });
    expect(uses.sort()).toEqual(['.a11y-chip.review::before, .a11y-dot.review', '.pi-dir.receive'].sort());
  });

  it('writes no blue colour out literally, except the ones that are information', () => {
    //a swatch of every hue, the captions track (blue cues beside green description cues) and the palette's own definitions
    const allowed = new Set([
      ':root --u-blue',
      ':root --u-sky',
      '.tt-swatch.mixed .tt-bar background',
      '.cue background',
      '.cue border',
      '.cue.live background',
    ]);
    const found: string[] = [];
    root.walkDecls((d) => {
      const sel = ((d.parent as { selector?: string }).selector ?? '').replace(/\s+/g, ' ');
      const colours: RGB[] = [];
      for (const m of d.value.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) colours.push(hex(m[0]));
      for (const m of d.value.matchAll(/rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/g)) colours.push([+m[1], +m[2], +m[3]]);
      for (const c of colours) {
        const { h, s } = hueOf(c);
        if (s > 0.2 && h >= 190 && h <= 260 && !allowed.has(`${sel} ${d.prop}`)) found.push(`${sel} { ${d.prop}: ${d.value.slice(0, 60)} }`);
      }
    });
    expect(found).toEqual([]);
  });

  it('takes React Flow\'s blue drag-box and resize handles for the gold', () => {
    expect(css).toMatch(/\.react-flow \{[^}]*--xy-selection-border:[^;]*var\(--key-on\)/);
    expect(css).toMatch(/\.react-flow \{[^}]*--xy-resize-background-color: var\(--primary-bg\)/);
  });

  it('gives the dark code editors a gold cursor and find match, not oneDark\'s blue', () => {
    const src = readFileSync(join(SRC, 'lib/code-theme.ts'), 'utf8');
    expect(src).toMatch(/darkGold/);
    expect(src).toMatch(/\[oneDark, darkGold\]/);
    expect(src).not.toMatch(/#528bff|#457dff/);
  });
});

describe('every keyboard focus ring is the one gold ring', () => {
  it('draws a :focus-visible outline only from --focus-outline (or inherits the colour of one)', () => {
    const odd: string[] = [];
    root.walkRules((r) => {
      if (!/:focus(-visible|-within)?\b/.test(r.selector)) return;
      r.walkDecls('outline', (d) => {
        const v = d.value.trim();
        if (v === 'none' || v === '0' || v === 'var(--focus-outline)') return;
        odd.push(`${r.selector.replace(/\s+/g, ' ')} { outline: ${v} }`);
      });
    });
    expect(odd).toEqual([]);
  });

  it('has the gold ring defined once, with a dark edge', () => {
    expect(css).toMatch(/--focus-ring: var\(--u-gold\);/);
    expect(css).toMatch(/--focus-edge: var\(--u-g7\);/);
    expect(css).toMatch(/--focus-outline: 2px solid var\(--focus-ring\);/);
  });
});

describe('contrast of the gold ring, the links and the selection', () => {
  const gold = token('--u-gold');
  const dark = token('--u-g7');
  const white = token('--u-white');
  const text = token('--u-gt');

  it('keeps the focus ring at 3:1 on a white panel, a dark panel and a gold chosen row', () => {
    //two tones: at least one of the ring and its edge clears each surface
    for (const [name, bg] of [['white panel', white], ['dark panel', dark], ['gold row', gold]] as const) {
      const best = Math.max(ratio(gold, bg), ratio(dark, bg));
      expect(best, name).toBeGreaterThanOrEqual(3);
    }
    //and the edge alone does it on the light surfaces, where gold alone fails
    expect(ratio(gold, white)).toBeLessThan(3);
    expect(ratio(dark, white)).toBeGreaterThanOrEqual(3);
  });

  it('keeps text links at 4.5:1: dark text on the light panel, gold on the dark one', () => {
    expect(ratio(text, white)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(gold, dark)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps dark text on every gold fill (badges, pills, chosen rows) at 4.5:1', () => {
    expect(ratio(dark, gold)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps selected text readable: dark text on the gold selection over white (and gold over dark with the light text)', () => {
    const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => Math.round(a[i] * t + b[i] * (1 - t))) as RGB;
    expect(ratio(dark, mix(gold, white, 0.7))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(dark, gold)).toBeGreaterThanOrEqual(4.5);
  });
});
