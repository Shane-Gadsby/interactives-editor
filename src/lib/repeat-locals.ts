import { pickedCopies, tryEvaluate, type Artboard, type Project } from 'interactives-player';
import { locate } from '../store/doc';
import { previewScope } from './data';

/**
 * `item` and `index` for a layer that sits in a repeater's template (the repeater's first child, at any depth), so its
 * formula fields know them and show what the first copy gets. Nested repeaters are worked out from the outside in, each
 * with the item of the one around it. Null when the layer is not in a repeater.
 */
export function repeatLocals(project: Project, ab: Artboard, id: string): { locals: string[]; values: Record<string, unknown> } | null {
  const loc = locate(ab, id);
  if (!loc) return null;
  const chain = [...loc.ancestors, loc.node];
  const repeaters = loc.ancestors.filter((a, i) => !!a.repeat?.items?.trim() && a.children[0] === chain[i + 1]);
  if (!repeaters.length) return null;
  let vars: Record<string, unknown>;
  try {
    vars = previewScope(project, ab);
  } catch {
    vars = {};
  }
  let extra: Record<string, unknown> = {};
  let selecting = false;
  for (const r of repeaters) {
    const items = tryEvaluate(r.repeat!.items, { vars, extra }, []);
    const list = Array.isArray(items) ? items : items && typeof items === 'object' ? Object.values(items) : [];
    // A repeater with a selection gives its copies isSelected (and item.selected on records): the first copy's, from the variable's starting value
    const sel = r.repeat!.select;
    const byName = sel ? project.variables.find((v) => v.id === sel.variable)?.name : undefined;
    const picks = sel && byName ? pickedCopies(sel, () => vars[byName]) : null;
    const first = list[0] && typeof list[0] === 'object' && !Array.isArray(list[0]) && picks && !('selected' in (list[0] as object)) ? { ...(list[0] as object), selected: picks.has(0) } : list[0];
    extra = { ...extra, item: first, index: 0, ...(picks ? { isSelected: picks.has(0) } : {}) };
    if (picks) selecting = true;
  }
  return { locals: selecting ? ['item', 'index', 'isSelected'] : ['item', 'index'], values: list0(extra) };
}

//An empty list leaves item undefined, which the checker reads as "depends on what happens when it runs"
const list0 = (extra: Record<string, unknown>) => ({ ...(extra.item === undefined ? {} : { item: extra.item }), index: 0, ...('isSelected' in extra ? { isSelected: extra.isSelected } : {}) });
