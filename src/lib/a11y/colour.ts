/** Colour maths for the accessibility checker (WCAG 2 relative luminance and contrast ratio). Pure: nothing here touches the DOM. */
import { parseColor, type RGBA } from 'interactives-player';

export type RGB = [number, number, number];

/** parseColor asks the browser for names; these few work without one (tests, servers) */
const NAMED: Record<string, RGB> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  red: [255, 0, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  yellow: [255, 255, 0],
  orange: [255, 165, 0],
  purple: [128, 0, 128],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  silver: [192, 192, 192],
  navy: [0, 0, 128],
  teal: [0, 128, 128],
  maroon: [128, 0, 0],
  lime: [0, 255, 0],
  aqua: [0, 255, 255],
  cyan: [0, 255, 255],
  magenta: [255, 0, 255],
  fuchsia: [255, 0, 255],
  pink: [255, 192, 203],
  brown: [165, 42, 42],
};

/** A CSS colour as [r, g, b, a], or null when it can't be read (a name the browser doesn't know, a var(), ...). */
export function toRgba(input: unknown): RGBA | null {
  if (typeof input !== 'string') return null;
  const s = input.trim().toLowerCase();
  if (!s || /^(var|calc|env|color-mix|currentcolor)/.test(s)) return null;
  const named = NAMED[s];
  if (named) return [named[0], named[1], named[2], 1];
  const hsl = /^hsla?\(\s*([\d.+-]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,/]+([\d.]+)(%?))?\s*\)$/.exec(s);
  if (hsl) {
    const h = (((parseFloat(hsl[1]) % 360) + 360) % 360) / 360;
    const sat = Math.min(1, parseFloat(hsl[2]) / 100);
    const l = Math.min(1, parseFloat(hsl[3]) / 100);
    const a = hsl[4] === undefined ? 1 : hsl[5] ? parseFloat(hsl[4]) / 100 : parseFloat(hsl[4]);
    const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
    const p = 2 * l - q;
    const f = (t: number) => {
      t = (t + 1) % 1;
      const v = t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
      return Math.round(v * 255);
    };
    return [f(h + 1 / 3), f(h), f(h - 1 / 3), Number.isNaN(a) ? 1 : a];
  }
  const c = parseColor(s);
  if (!c || c.some((v) => Number.isNaN(v))) return null;
  return c;
}

const lin = (v: number) => {
  const c = Math.min(255, Math.max(0, v)) / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(c: readonly number[]): number {
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}

/** Contrast ratio of two opaque colours, 1 to 21. */
export function contrastRatio(a: readonly number[], b: readonly number[]): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `fg` (with its alpha, times `extraAlpha`) laid over an opaque `bg`. */
export function over(fg: readonly number[], bg: readonly number[], extraAlpha = 1): RGB {
  const a = Math.min(1, Math.max(0, (fg[3] ?? 1) * extraAlpha));
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a)];
}

/** The ratio text needs: 3:1 for large text (24 px and up, or 18.66 px and up in bold), 4.5:1 otherwise. */
export function requiredRatio(fontSize: number, fontWeight: number): number {
  return fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700) ? 3 : 4.5;
}

export function toHex(c: readonly number[]): string {
  return '#' + [c[0], c[1], c[2]].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
}

/**
 * The nearest colour to `fg` (moving it toward black or white, which keeps its hue) that reaches `required` against every
 * one of `backgrounds`, as a hex string. Null when no amount of darkening or lightening gets there (the backgrounds span
 * light and dark), so the fix is not offered.
 */
export function suggestColour(fg: readonly number[], backgrounds: readonly (readonly number[])[], required: number): string | null {
  if (!backgrounds.length) return null;
  const worst = (c: readonly number[]) => Math.min(...backgrounds.map((b) => contrastRatio(c, b)));
  let best: { t: number; c: RGB } | null = null;
  for (const target of [0, 255]) {
    for (let t = 0; t <= 1.0001; t += 0.02) {
      const c: RGB = [fg[0] + (target - fg[0]) * t, fg[1] + (target - fg[1]) * t, fg[2] + (target - fg[2]) * t];
      if (worst(c) >= required + 0.05) {
        if (!best || t < best.t) best = { t, c };
        break;
      }
    }
  }
  return best ? toHex(best.c) : null;
}
