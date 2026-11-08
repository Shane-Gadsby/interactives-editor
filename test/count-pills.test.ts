import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '../src/styles.css'), 'utf8');
const rule = (sel: string): string => {
  const m = new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css);
  return m ? m[1] : '';
};
const swatch = (name: string): [number, number, number] => {
  const m = new RegExp(`--${name}:\\s*var\\([^,]+,\\s*(#[0-9a-fA-F]{6})\\)`).exec(css)!;
  const h = m[1];
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
};
const lum = (c: number[]) => {
  const [r, g, b] = c.map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: number[], b: number[]) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
const over = (top: number[], alpha: number, under: number[]) => top.map((v, i) => v * alpha + under[i] * (1 - alpha));

describe('count pills', () => {
  it('take their text from the palette dark grey, through the variable, never a hex', () => {
    expect(css).toMatch(/--pill-fg:\s*var\(--u-g7\);/);
    for (const sel of ['.tag-n', '.badge', '.tag-chip.active .tag-n,\n.folder-item.active .tag-n,\n.folder-row.active .tag-n']) {
      const body = rule(sel);
      expect(body, sel).toMatch(/color:\s*var\(--pill-fg\)/);
      expect(body, sel).not.toMatch(/#[0-9a-f]{3,6}/i);
    }
    expect(rule('.templates-head .seg button.on .tag-n')).toMatch(/color:\s*var\(--pill-fg\)/);
    expect(rule('.artboard-row.selected .badge')).toMatch(/color:\s*var\(--pill-fg\)/);
  });
  it('are readable on the grey pill and on the gold row, in both themes (palette greys do not change with the theme)', () => {
    const g7 = swatch('u-g7');
    const g3 = swatch('u-g3');
    const gold = swatch('u-gold');
    const white = swatch('u-white');
    expect(ratio(g7, g3)).toBeGreaterThanOrEqual(7);
    expect(ratio(g7, over(white, 0.75, gold))).toBeGreaterThanOrEqual(7);
    // the pill still reads as a pill against the panel in the dark theme (g7 panel) and the light one (grey panel)
    expect(ratio(g3, g7)).toBeGreaterThanOrEqual(7);
    expect(ratio(g3, swatch('u-gp'))).toBeGreaterThan(1.3);
  });
});
