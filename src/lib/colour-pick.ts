// The sums behind the colour picker: hue, saturation and brightness to and from red, green and blue, and how a swatch
// shows a colour that is partly see-through.
import { formatColor, parseColor } from 'interactives-player';

/** Hue 0 to 360, saturation and brightness 0 to 1. */
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Red, green and blue (0 to 255) as hue, saturation and brightness. A grey has no hue of its own, so it is given 0. */
export function rgbToHsv(r: number, g: number, b: number): Hsv {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const d = max - Math.min(R, G, B);
  let h = 0;
  if (d > 0) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

/** Hue, saturation and brightness as whole red, green and blue. */
export function hsvToRgb({ h, s, v }: Hsv): [number, number, number] {
  const hh = (((h % 360) + 360) % 360) / 60;
  const c = v * s;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const m = v - c;
  const [r, g, b] = hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/** The colour text for these, in the form every colour field writes (hex when solid, rgba when not). */
export function colourOf(hsv: Hsv, alpha: number): string {
  const [r, g, b] = hsvToRgb(hsv);
  return formatColor([r, g, b, clamp(alpha, 0, 1)]);
}

/**
 * What the picker shows for a colour: its hue, saturation and brightness, and its alpha. `keep` is what it was showing
 * before: when the colour hasn't really changed, the hue and saturation it had are kept, so dragging down to black or
 * across to grey (which have none of their own) doesn't throw away where you were.
 */
export function readColour(value: string, keep?: Hsv): { hsv: Hsv; alpha: number } {
  const c = parseColor(value) ?? [0, 0, 0, 1];
  let hsv = rgbToHsv(c[0], c[1], c[2]);
  if (keep) {
    const was = hsvToRgb(keep);
    if (was[0] === c[0] && was[1] === c[1] && was[2] === c[2]) hsv = keep;
    else if (hsv.s === 0 || hsv.v === 0) hsv = { h: keep.h, s: hsv.v === 0 ? keep.s : hsv.s, v: hsv.v };
  }
  return { hsv, alpha: c[3] };
}

/** The grey and white squares a see-through colour is shown over, as a CSS background. */
export const CHECKER = 'repeating-conic-gradient(#c9c9c9 0% 25%, #ffffff 0% 50%) 50% / 8px 8px';

/** A swatch's background: the colour alone when it is solid, the colour over the squares when any of it shows through. */
export function swatchBackground(value: string): string {
  const c = parseColor(value);
  if (!c || c[3] >= 1) return value;
  return `linear-gradient(${value}, ${value}), ${CHECKER}`;
}
