/**
 * Which layers a click in the Layers list leaves selected. The list works like a file manager: a plain click picks one
 * and sets the anchor, Ctrl/Cmd+click toggles one (and moves the anchor), Shift+click takes everything from the anchor
 * to the clicked row in the order shown, and Ctrl/Cmd+Shift+click adds that range to what is already picked.
 * A collapsed group is one row, so its hidden children are never in a range. A range never leaves the artboard it
 * started on: a Shift+click on another artboard's layer starts over there.
 */

export type RangeRow = { id: string; held?: boolean };

export type PickMods = { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean };

export type PickResult = { selection: string[]; anchor: string };

/** The ids from the anchor to the target in the rows as listed, both ends included, skipping locked brand rows. */
export function rangeBetween(rows: RangeRow[], anchor: string, target: string): string[] | null {
  const a = rows.findIndex((r) => r.id === anchor);
  const b = rows.findIndex((r) => r.id === target);
  if (a < 0 || b < 0) return null;
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const ids = rows.slice(lo, hi + 1).filter((r) => !r.held).map((r) => r.id);
  // in the order of the sweep, anchor first
  return b < a ? ids.reverse() : ids;
}

/**
 * The selection after a click on `id`.
 * `rows` are the visible layer rows of the clicked layer's artboard. `selection` is what is selected now on that
 * artboard (empty when the selection is somewhere else) and `anchor` the row the last plain or toggling click set.
 */
export function pickLayer(rows: RangeRow[], id: string, selection: string[], anchor: string | null, mods: PickMods): PickResult {
  const toggle = !!(mods.ctrlKey || mods.metaKey);
  if (mods.shiftKey) {
    // no anchor on this artboard yet: the last thing picked here is the start of the range
    const from = anchor && rows.some((r) => r.id === anchor) ? anchor : selection.length ? selection[selection.length - 1] : null;
    const range = from ? rangeBetween(rows, from, id) : null;
    if (range) {
      if (toggle) return { selection: [...selection.filter((x) => !range.includes(x)), ...range], anchor: from! };
      return { selection: range, anchor: from! };
    }
    // nothing to range from (or the anchor is on another artboard): behaves as a plain pick, and this is the anchor now
    return { selection: toggle && selection.includes(id) ? selection : [...(toggle ? selection : []), id], anchor: id };
  }
  if (toggle) return { selection: selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id], anchor: id };
  return { selection: [id], anchor: id };
}

/**
 * Shift+Up / Shift+Down from the keyboard: the range from the anchor to the neighbour of the row that has focus.
 * Returns null at the ends of the list.
 */
export function extendLayers(rows: RangeRow[], focused: string, delta: 1 | -1, anchor: string | null): (PickResult & { focus: string }) | null {
  const i = rows.findIndex((r) => r.id === focused);
  if (i < 0) return null;
  let j = i + delta;
  while (rows[j]?.held) j += delta;
  const next = rows[j];
  if (!next) return null;
  const from = anchor && rows.some((r) => r.id === anchor) ? anchor : focused;
  const range = rangeBetween(rows, from, next.id);
  return range ? { selection: range, anchor: from, focus: next.id } : null;
}
