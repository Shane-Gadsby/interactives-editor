// The design baseline every kit builds from: one spacing scale, one set of corner radii, one type scale and two shadows.
// A kit takes its numbers from here instead of typing its own, which is what makes the things the editor builds agree
// with each other. The colours come from `lookFor(themes)`; this is everything else.
//
// The scales are written up on the board (doc `design-baseline`). Change a number here and every kit follows.
import type { Shadow } from 'interactives-player';

/** Spacing, for gaps and padding. Nothing a kit builds is spaced by a number that isn't one of these. */
export const SPACE = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const;

/**
 * Corner radii. `small` for something little that sits on top (a tooltip, a tag), `control` for anything you press or
 * type in (a button, an input, an answer row), `card` for a box that holds other things (a question, a dialog, a toast,
 * an accordion).
 */
export const RADIUS = { small: 6, control: 8, card: 12 } as const;

/**
 * Text sizes: `small` for hints and captions, `body` for everything you read and every control's label, `heading` for
 * the heading of a card, `title` for the heading of a page. Four, not seven.
 */
export const TYPE = { small: 13, body: 15, heading: 18, title: 22 } as const;

/** How tall anything you press is: big enough for a finger. */
export const CONTROL_H = 44;

/** Depth. `raised` lifts something small off the page (a tooltip, a toast), `floating` is a dialog over a dimmed page. */
export const SHADOW: Record<'raised' | 'floating', Shadow> = {
  raised: { x: 0, y: 4, blur: 12, spread: 0, color: 'rgba(0,0,0,0.18)' },
  floating: { x: 0, y: 16, blur: 40, spread: 0, color: 'rgba(0,0,0,0.22)' },
};

/** Padding from the scale: the same all round, or top and bottom then the sides. */
export const pad = (v: number, h: number = v) => ({ top: v, right: h, bottom: v, left: h });
