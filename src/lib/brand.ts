/**
 * Brand kits, the project side.
 *
 * A brand kit is a published library (see `libraries.ts`) that its publisher has marked as one (server: `index.js`, "brand" on the
 * library). Everything from the kit that lands in a project is locked more firmly than an ordinary library copy: the artboards
 * can't be detached, deleted or edited, except for the text of layers the kit marked `brandEditable`, and instances of them
 * keep their proportions and stay within a size range. The rest of the project is free. A power user (or someone in the
 * server's brand group) can switch the override on in the editor to get past all of it.
 *
 * Here: the lock rules that go beyond `libraries.ts`'s read-only copies, the sizes of instances, the kit's palette, and the
 * off-brand check (informational: it lists what the project uses that the kit doesn't have, and blocks nothing).
 * No imports from `libraries.ts`, which imports this.
 */
import { produce } from 'immer';
import { defaultTheme, isContainer, isTokenRef, tokenValue, walk, type Artboard, type InstanceNode, type Paint, type Project, type SceneNode, type TextNode } from 'interactives-player';
import { toRgba } from './a11y/colour';
import { BRAND_FONT } from './branded/looks';
import { isChromeNode } from './branded/lock';

/** How far an instance of a brand kit artboard may be scaled, against the artboard's own size. */
export const BRAND_SCALE = { min: 0.5, max: 2 } as const;

/** How far an instance's proportions may be off the artboard's before they are put back (a fraction, so a drag that lands near is fine). */
const RATIO_SLACK = 0.02;

export const isBrandArtboard = (ab: Artboard | undefined | null): boolean => !!ab?.library?.brand;

export const hasBrandArtboards = (p: Project): boolean => p.artboards.some(isBrandArtboard);

/** The brand kits a project uses (the libraries panel marks them). */
export const brandKits = (p: Project) => (p.libraries ?? []).filter((l) => l.brand);

// ---------------------------------------------------------------- locks

/** What the lock leaves alone on any library copy. */
const FREE_KEYS = new Set(['canvasX', 'canvasY', 'canvasHidden', 'name', 'guides', 'grid', 'group']);

/** Both lists hold the same layers in the same order, and the only differences are the text of layers marked editable. */
function onlyEditableText(before: SceneNode[], after: SceneNode[]): boolean {
  if (before.length !== after.length) return false;
  for (let i = 0; i < before.length; i++) {
    const na = before[i];
    const nb = after[i];
    const a = na as unknown as Record<string, unknown>;
    const b = nb as unknown as Record<string, unknown>;
    if (a === b) continue;
    if (a.id !== b.id) return false;
    const editable = a.type === 'text' && a.brandEditable === true;
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[k] === b[k]) continue;
      if (editable && (k === 'text' || k === 'runs')) continue;
      if (k === 'children' && isContainer(na) && isContainer(nb) && onlyEditableText(na.children, nb.children)) continue;
      return false;
    }
  }
  return true;
}

/**
 * Is this change to a brand kit copy more than the person may do? Moving it and renaming it are free (as on any library copy);
 * so is the text of a layer the kit marked editable. Anything else, and removing the artboard, is not.
 */
export function brandCopyViolated(a: Artboard, b: Artboard | undefined): boolean {
  if (!b) return true;
  if (b === a) return false;
  const x = a as unknown as Record<string, unknown>;
  const y = b as unknown as Record<string, unknown>;
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
    if (x[k] === y[k] || FREE_KEYS.has(k)) continue;
    if (k === 'children' && onlyEditableText(a.children, b.children)) continue;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- instances of kit artboards

/** What an instance's size has to be, given the artboard it places and what it was asked to be. Null: it is fine as it is. */
export function brandSize(target: Artboard, node: Pick<InstanceNode, 'width' | 'height'>): { width: number; height: number } | null {
  if (!(target.width > 0) || !(target.height > 0)) return null;
  const ratio = target.width / target.height;
  let { width, height } = node;
  let fixed = false;
  if (!(width > 0) || !(height > 0)) return null;
  if (Math.abs(width / height - ratio) / ratio > RATIO_SLACK) {
    // Whichever side is further from the artboard's own size is the one that was dragged
    const dw = Math.abs(width / target.width - 1);
    const dh = Math.abs(height / target.height - 1);
    if (dw >= dh) height = width / ratio;
    else width = height * ratio;
    fixed = true;
  }
  const scale = width / target.width;
  const limited = Math.min(BRAND_SCALE.max, Math.max(BRAND_SCALE.min, scale));
  if (limited !== scale) {
    width = target.width * limited;
    height = target.height * limited;
    fixed = true;
  }
  return fixed ? { width: Math.round(width * 100) / 100, height: Math.round(height * 100) / 100 } : null;
}

/**
 * Puts instances of brand kit artboards that were just changed back to the kit's proportions and size range. Only instances that
 * are new or changed since `before` are looked at, so a project that was already off is not fixed behind the person's back.
 * Returns `after` itself when nothing needed fixing.
 */
export function clampBrandInstances(before: Project, after: Project): Project {
  const brand = new Map(after.artboards.filter(isBrandArtboard).map((a) => [a.id, a]));
  if (!brand.size) return after;
  const seen = new Set<SceneNode>();
  for (const ab of before.artboards) walk(ab.children, (n) => void seen.add(n));
  const todo: string[] = [];
  for (const ab of after.artboards) {
    if (ab.library) continue;
    walk(ab.children, (n) => {
      if (n.type !== 'instance' || seen.has(n)) return;
      const target = brand.get((n as InstanceNode).artboardId);
      if (target && brandSize(target, n as InstanceNode)) todo.push(n.id);
    });
  }
  if (!todo.length) return after;
  return produce(after, (d) => {
    for (const ab of d.artboards as Artboard[]) {
      if (ab.library) continue;
      walk(ab.children, (n) => {
        if (n.type !== 'instance' || !todo.includes(n.id)) return;
        const size = brandSize(brand.get((n as InstanceNode).artboardId)!, n as InstanceNode);
        if (size) Object.assign(n, size);
      });
    }
  });
}

// ---------------------------------------------------------------- the kit's palette

/** A colour as `#rrggbb` (alpha ignored), or null for something that isn't one colour ("transparent", var(), gradients...). */
export function colourKey(input: unknown, project?: Pick<Project, 'themes'>): string | null {
  if (typeof input !== 'string') return null;
  let value = input;
  if (isTokenRef(value)) {
    const t = project?.themes;
    const token = t?.tokens.find((x) => `token:${x.id}` === value);
    const resolved = t && token ? tokenValue(t, token, defaultTheme(t)?.id) : undefined;
    if (!resolved) return null;
    value = resolved;
  }
  const c = toRgba(value);
  if (!c || c[3] === 0) return null;
  const hex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${hex(c[0])}${hex(c[1])}${hex(c[2])}`;
}

/** The first family of a font stack (`"Inter", sans-serif` is Inter), which is the font the author picked. */
const firstFamily = (stack: string): string => {
  const m = /^\s*(?:"([^"]*)"|'([^']*)'|([^,]*))/.exec(stack ?? '');
  return (m?.[1] ?? m?.[2] ?? m?.[3] ?? '').trim();
};
const familyKey = (f: string) => firstFamily(f).toLowerCase();

/** What a kit defines, from its styles and fonts: the colours and font families the off-brand check allows. */
export function kitPalette(snap: { styles: { colors: { color: string }[]; texts: { fontFamily: string; color?: string }[] }; fonts: { family: string }[] }) {
  const colors = new Set<string>();
  const fonts = new Set<string>();
  for (const c of snap.styles.colors) {
    const k = colourKey(c.color);
    if (k) colors.add(k);
  }
  for (const t of snap.styles.texts) {
    const k = colourKey(t.color);
    if (k) colors.add(k);
    if (t.fontFamily) fonts.add(familyKey(t.fontFamily));
  }
  for (const f of snap.fonts) if (f.family) fonts.add(familyKey(f.family));
  return { colors: [...colors].sort(), fonts: [...fonts].sort() };
}

// ---------------------------------------------------------------- off-brand check

export interface OffBrandItem {
  /** The colour (`#rrggbb`) or the font family as the project spells it. */
  value: string;
  uses: number;
  /** Names of the artboards it is on (up to three). */
  where: string[];
}

export interface OffBrandReport {
  kits: string[];
  colors: OffBrandItem[];
  fonts: OffBrandItem[];
}

function paintColors(p: Paint | null | undefined): unknown[] {
  if (!p) return [];
  if (p.type === 'solid') return [p.color];
  if (p.type === 'linear' || p.type === 'radial') return p.stops.map((s) => s.color);
  return [];
}

/**
 * Colours and fonts the project's own artboards use that none of its brand kits have. Artboards that come from a library are
 * left out (they are what they are), and so is anything that is not one plain colour. Null when the project uses no brand kit.
 * Informational only: nothing in the editor stops on it. A project made from a branded starter pack (`brandLook`) is checked too:
 * there a theme token colour is on brand by definition, plain colours aren't, and the font is Open Sans.
 */
export function offBrand(project: Project): OffBrandReport | null {
  const kits = brandKits(project);
  const look = project.brandLook;
  if (!kits.length && !look) return null;
  const okColors = new Set(kits.flatMap((k) => k.brand!.colors));
  const okFonts = new Set(kits.flatMap((k) => k.brand!.fonts.map(familyKey)));
  if (look) okFonts.add(familyKey(BRAND_FONT));
  const colors = new Map<string, OffBrandItem>();
  const fonts = new Map<string, OffBrandItem>();
  const note = (map: Map<string, OffBrandItem>, key: string, value: string, board: string) => {
    const item = map.get(key) ?? { value, uses: 0, where: [] };
    item.uses++;
    if (!item.where.includes(board) && item.where.length < 3) item.where.push(board);
    map.set(key, item);
  };
  const colour = (c: unknown, board: string) => {
    if (look && isTokenRef(c)) return;
    const k = colourKey(c, project);
    if (k && !okColors.has(k)) note(colors, k, k, board);
  };
  const font = (f: unknown, board: string) => {
    if (typeof f !== 'string' || !f.trim()) return;
    const k = familyKey(f);
    if (!okFonts.has(k)) note(fonts, k, firstFamily(f), board);
  };

  for (const ab of project.artboards) {
    if (ab.library) continue;
    for (const c of paintColors(ab.background)) colour(c, ab.name);
    //the brand's own layers (and the colourway swatches among them) are what the brand is
    const own = new Set<string>();
    if (look) walk(ab.children, (n) => void (isChromeNode(n) && walk([n], (x) => void own.add(x.id))));
    walk(ab.children, (n) => {
      if (own.has(n.id)) return;
      const r = n as unknown as { fill?: Paint | null; fills?: Paint[]; stroke?: { paint: Paint } | null; strokes?: { paint: Paint }[]; shadow?: { color: string } | null; color?: string };
      for (const p of [r.fill, ...(r.fills ?? [])]) for (const c of paintColors(p)) colour(c, ab.name);
      for (const s of [r.stroke, ...(r.strokes ?? [])]) for (const c of paintColors(s?.paint)) colour(c, ab.name);
      if (r.shadow) colour(r.shadow.color, ab.name);
      if (n.type === 'text') {
        const t = n as TextNode;
        colour(t.color, ab.name);
        font(t.fontFamily, ab.name);
        for (const run of t.runs ?? []) {
          if (run.fontFamily) font(run.fontFamily, ab.name);
          if (run.color) colour(run.color, ab.name);
        }
      }
    });
  }
  const sorted = (m: Map<string, OffBrandItem>) => [...m.values()].sort((a, b) => b.uses - a.uses || a.value.localeCompare(b.value));
  return { kits: [...kits.map((k) => k.name), ...(look ? [`${look.name} colourway`] : [])], colors: sorted(colors), fonts: sorted(fonts) };
}
