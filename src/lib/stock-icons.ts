import { LIGHT_LOOK, createNode, hasTokens, pathBounds, type Project, type SceneNode, type SubPath } from 'interactives-player';
import { parsePathData } from './svg-import';
import { lookFor } from './themes';
import type { StockIconData } from './stock-icons-data';

/**
 * The Toolbox's own Icon Set, as vector layers. Nothing here is a new icon set: the 25 icons are the ones the Toolbox puts on
 * StudyDesk pages (its Icon Set item, plus the chevron its buttons use), copied as path data by scripts/gen-stock-icons.mjs.
 * Each is two shapes, a ring and a glyph, so each can take its own colour, and they are plain path layers in a group.
 * The data is a separate chunk that is only fetched when the Icons panel is opened.
 */

export type StockIcon = StockIconData;

let loaded: Promise<StockIcon[]> | null = null;
/** The icons, fetched on first use. */
export function loadStockIcons(): Promise<StockIcon[]> {
  return (loaded ??= import('./stock-icons-data').then((m) => m.STOCK_ICON_DATA));
}

/** The Toolbox's theme colours for an icon's ring (the glyph is always its near-black). Same values as the Toolbox's Icon Set. */
export const ICON_COLOURS = [
  { id: 'gold', name: 'Gold', hex: '#ffb448' },
  { id: 'orange', name: 'Orange', hex: '#ED6A21' },
  { id: 'green', name: 'Green', hex: '#3E8521' },
  { id: 'blue', name: 'Blue', hex: '#0080A8' },
  { id: 'purple', name: 'Purple', hex: '#775d94' },
  { id: 'charcoal', name: 'Charcoal', hex: '#777777' },
] as const;
export type IconColourId = (typeof ICON_COLOURS)[number]['id'];
/** Ring and glyph follow the project's colour tokens, so a theme change recolours the icon. */
export type IconColour = IconColourId | 'theme';

export const GLYPH_HEX = '#1e1e1e';

/** What an icon's ring and glyph are painted with. 'theme' is the project's tokens when it has them (the starter look's colours otherwise). */
export function iconPaints(colour: IconColour, project: Project): { ring: string; glyph: string } {
  if (colour === 'theme') {
    const look = lookFor(hasTokens(project.themes) ? project.themes : null);
    return {
      ring: look.button ?? LIGHT_LOOK.button,
      glyph: look.text ?? LIGHT_LOOK.text,
    };
  }
  return {
    ring: ICON_COLOURS.find((c) => c.id === colour)?.hex ?? ICON_COLOURS[0].hex,
    glyph: GLYPH_HEX,
  };
}

/** The colour a new icon starts in: the project's own tokens when it has them, the Toolbox's gold when it does not. */
export const defaultIconColour = (project: Project): IconColour => (hasTokens(project.themes) ? 'theme' : 'gold');

// ---------------------------------------------------------------- finding one

const words = (s: string): string[] =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/**
 * Icons that match what was typed, best first. Every word has to match something: the start of a word in the name scores
 * most, the start of one of the other words people use for it next, a bit of a name least. Nothing typed is all of them in
 * the Toolbox's order.
 */
export function searchIcons(list: StockIcon[], query: string): StockIcon[] {
  const q = words(query);
  if (!q.length) return list;
  const scored: { icon: StockIcon; score: number; i: number }[] = [];
  list.forEach((icon, i) => {
    const name = words(icon.title);
    const other = words(icon.words);
    let total = 0;
    for (const w of q) {
      let best = 0;
      if (name.includes(w)) best = 6;
      else if (name.some((n) => n.startsWith(w))) best = 5;
      else if (other.includes(w)) best = 4;
      else if (other.some((n) => n.startsWith(w))) best = 3;
      else if (w.length > 2 && icon.title.toLowerCase().includes(w)) best = 1;
      if (!best) return;
      total += best;
    }
    scored.push({ icon, score: total, i });
  });
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).map((s) => s.icon);
}

// ---------------------------------------------------------------- making one

/** The size a new icon is drawn at, in artboard pixels. */
export const ICON_SIZE = 96;

const r2 = (v: number) => Math.round(v * 100) / 100;

/** A shape of the icon as a path layer at its place on the board, scaled to `size`. */
function shape(name: string, ds: string[], fill: string, k: number): SceneNode {
  const raw: SubPath[] = ds.flatMap((d) => parsePathData(d));
  const paths: SubPath[] = raw.map((sp) => ({
    closed: sp.closed,
    points: sp.points.map((p) => ({
      x: p.x * k,
      y: p.y * k,
      in: p.in ? { x: p.in.x * k, y: p.in.y * k } : null,
      out: p.out ? { x: p.out.x * k, y: p.out.y * k } : null,
    })),
  }));
  const b = pathBounds(paths);
  return createNode('path', {
    name,
    x: r2(b.x),
    y: r2(b.y),
    width: Math.max(0.01, r2(b.width)),
    height: Math.max(0.01, r2(b.height)),
    fill: { type: 'solid', color: fill },
    stroke: null,
    fillRule: 'nonzero',
    paths: paths.map((s) => ({
      closed: s.closed,
      points: s.points.map((p) => ({
        ...p,
        x: r2(p.x - b.x),
        y: r2(p.y - b.y),
      })),
    })),
  } as never);
}

/**
 * The layers for one icon: a group named for it holding a Ring and an Icon path, painted for `colour`, at `size` pixels
 * across. The group is marked decorative (as the Toolbox does for its icons: they sit beside text that says the same),
 * and gets an `ariaLabel` of its own only if the person adds one.
 */
export function iconNode(icon: StockIcon, colour: IconColour, project: Project, at: { x: number; y: number }, size = ICON_SIZE): SceneNode {
  const { ring, glyph } = iconPaints(colour, project);
  const k = size / 32;
  const children = [shape('Ring', icon.ring, ring, k), shape('Icon', icon.glyph, glyph, k)];
  return createNode('group', {
    name: `${icon.title} icon`,
    x: Math.round(at.x - size / 2),
    y: Math.round(at.y - size / 2),
    width: size,
    height: size,
    decorative: true,
    children,
  } as never);
}
