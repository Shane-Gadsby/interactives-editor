import { tryEvaluate, type Artboard, type Project } from 'interactives-player';
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
  for (const r of repeaters) {
    const items = tryEvaluate(r.repeat!.items, { vars, extra }, []);
    const list = Array.isArray(items) ? items : items && typeof items === 'object' ? Object.values(items) : [];
    extra = { ...extra, item: list[0], index: 0 };
  }
  return { locals: ['item', 'index'], values: list0(extra) };
}

//An empty list leaves item undefined, which the checker reads as "depends on what happens when it runs"
const list0 = (extra: Record<string, unknown>) => (extra.item === undefined ? { index: 0 } : { item: extra.item, index: 0 });
