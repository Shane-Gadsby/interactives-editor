import { fillList, isContainer, walk, type Artboard, type Paint, type SceneNode } from 'interactives-player';
import type { MenuItem } from '../components/ContextMenu';
import { store } from '../store/store';

/** Node types whose own text style (font, colour) is what draws their words. */
const WORDY = new Set(['text', 'button', 'link', 'input']);

type Wordy = SceneNode & { fontFamily?: string; color?: string; text?: string; label?: string; runs?: { text: string; fontFamily?: string }[] };

/** The words a layer shows: a text layer's text (or its runs joined), a button's label. */
export function layerWords(n: SceneNode): string {
  const w = n as Wordy;
  if (n.type === 'button') return w.label ?? '';
  if (n.type === 'text' || n.type === 'link') {
    const runs = Array.isArray(w.runs) && w.runs.length ? w.runs.map((r) => r.text).join('') : '';
    return runs || w.text || '';
  }
  return '';
}

export interface LayerFilter {
  /** Layers whose name (or words, with `inText`) match. */
  hits: Set<string>;
  /** The hits and every group, frame and layer above them, so a hit is never shown without its place in the tree. */
  keep: Set<string>;
  /** Artboards whose own name matches. */
  artboards: Set<string>;
}

/**
 * Which rows the Layers panel shows for a search. Case does not matter. A layer matches on its name, and with `inText` also on
 * the words it shows (rich-text runs included). Collapsed groups don't hide a hit: the caller shows everything in `keep`.
 */
export function filterLayers(artboards: Artboard[], query: string, inText: boolean): LayerFilter {
  const q = query.trim().toLowerCase();
  const out: LayerFilter = { hits: new Set(), keep: new Set(), artboards: new Set() };
  if (!q) return out;
  for (const ab of artboards) {
    if (ab.name.toLowerCase().includes(q)) out.artboards.add(ab.id);
    const visit = (list: SceneNode[]): boolean => {
      let any = false;
      for (const n of list) {
        const hit = n.name.toLowerCase().includes(q) || (inText && layerWords(n).toLowerCase().includes(q));
        const below = isContainer(n) ? visit(n.children) : false;
        if (hit) out.hits.add(n.id);
        if (hit || below) {
          out.keep.add(n.id);
          any = true;
        }
      }
      return any;
    };
    visit(ab.children);
  }
  return out;
}

// ---------------------------------------------------------------- select same


/** What a paint looks like with the bits that don't change which fill it is (opacity, blend, hidden, feather, offset) taken off. */
function paintKey(p: Paint): string {
  switch (p.type) {
    case 'solid':
      return `solid:${p.color.trim().toLowerCase()}`;
    case 'linear':
      return `linear:${JSON.stringify([p.angle, p.stops, p.from ?? null, p.to ?? null])}`;
    case 'radial':
      return `radial:${JSON.stringify([p.stops, p.center ?? null, p.radius ?? null])}`;
    default:
      return `image:${p.assetId}:${p.fit}`;
  }
}

/** Every fill a layer paints with, as keys. A word-bearing layer's text colour counts as a solid fill, since that is how it is coloured. */
export function fillKeys(n: SceneNode): string[] {
  const keys = fillList(n as never).map(paintKey);
  const c = (n as Wordy).color;
  if (WORDY.has(n.type) && typeof c === 'string' && c) keys.push(paintKey({ type: 'solid', color: c }));
  return keys;
}

/** The fill "Select same fill" starts from: the bottom fill of the layer, or its text colour when it has none. */
export function referenceFill(n: SceneNode): string | null {
  return fillKeys(n)[0] ?? null;
}

/** Every font family a layer uses: its own, and any rich-text run that picks another. */
export function fontFamilies(n: SceneNode): string[] {
  if (!WORDY.has(n.type)) return [];
  const w = n as Wordy;
  const out = new Set<string>();
  if (w.fontFamily) out.add(w.fontFamily);
  if (Array.isArray(w.runs)) for (const r of w.runs) if (r.fontFamily) out.add(r.fontFamily);
  return [...out];
}

/** The family "Select same font" starts from. */
export function referenceFont(n: SceneNode): string | null {
  return (n as Wordy).fontFamily && WORDY.has(n.type) ? (n as Wordy).fontFamily! : null;
}

/** Layers of an artboard that use this fill. Locked layers are left out, like the canvas leaves them out of a click. */
export function sameFill(ab: Artboard, key: string): string[] {
  const ids: string[] = [];
  walk(ab.children, (n) => {
    if (!n.locked && fillKeys(n).includes(key)) ids.push(n.id);
  });
  return ids;
}

/** Layers of an artboard that use this font family, in a run or as the layer's own. */
export function sameFont(ab: Artboard, family: string): string[] {
  const ids: string[] = [];
  walk(ab.children, (n) => {
    if (!n.locked && fontFamilies(n).includes(family)) ids.push(n.id);
  });
  return ids;
}


/**
 * The two "Select same" items for a right-click menu on one layer: every unlocked layer of its artboard with the same fill,
 * or the same font. Greyed out when the layer has no fill (or no font) to go by.
 */
export function selectSameItems(ab: Artboard, n: SceneNode): MenuItem[] {
  const fill = referenceFill(n);
  const font = referenceFont(n);
  const pick = (ids: string[], what: string) => {
    store().select(ids, { artboardId: ab.id });
    store().toast(`${ids.length} ${ids.length === 1 ? 'layer uses' : 'layers use'} ${what}`);
  };
  return [
    { label: 'Select same fill', disabled: !fill, title: fill ? 'Select every layer on this artboard with this fill' : 'This layer has no fill', onClick: () => fill && pick(sameFill(ab, fill), 'this fill') },
    { label: 'Select same font', disabled: !font, title: font ? `Select every layer on this artboard set in ${font}` : 'This layer has no font', onClick: () => font && pick(sameFont(ab, font), font) },
  ];
}
