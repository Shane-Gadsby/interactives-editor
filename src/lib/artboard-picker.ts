/**
 * The artboard picker at the top of the Interactions panel. It has no state of its own: the open artboard is the store's
 * `activeArtboardId`, the same thing the canvas, the Layers panel and Go to artboard in the editor set, so the picker follows them
 * and they follow it. Picking is view state, never a change to the document, so nothing is sent to the other people editing.
 */
import { isMasterArtboard, type Artboard, type Project } from 'interactives-player';
import { artboardEntries } from './artboard-groups';
import { rankEntries } from './prop-search';
import { store } from '../store/store';

export interface PickerRow {
  id: string;
  name: string;
  /** How many nodes its graph has. */
  nodes: number;
  /** "Word 3 · 12 nodes", the line the picker shows. */
  label: string;
  /** What the node count says on its own ("12 nodes", "no nodes yet"). */
  count: string;
  master: boolean;
  /** The group's name, when it is in one. */
  group?: string;
}

export interface PickerSection {
  /** Null for the artboards that are in no group, when nothing else needs telling apart. */
  heading: string | null;
  rows: PickerRow[];
}

export const nodeCount = (n: number): string => (n === 0 ? 'no nodes yet' : `${n} node${n === 1 ? '' : 's'}`);

function row(p: Project, ab: Artboard, group?: string): PickerRow {
  const nodes = ab.logic.nodes.length;
  const count = nodeCount(nodes);
  return { id: ab.id, name: ab.name, nodes, count, label: `${ab.name} · ${count}`, master: isMasterArtboard(p.artboards, ab), group };
}

/**
 * Every artboard in the order the Layers panel lists them, grouped by artboard group, with the page masters apart at the end (a
 * master's graph never runs by itself, only the pages that use it are shown).
 */
export function pickerSections(p: Project): PickerSection[] {
  const loose: PickerRow[] = [];
  const groups: PickerSection[] = [];
  const masters: PickerRow[] = [];
  const add = (ab: Artboard, into: PickerRow[], group?: string) => (isMasterArtboard(p.artboards, ab) ? masters : into).push(row(p, ab, group));
  for (const e of artboardEntries(p)) {
    if (e.kind === 'board') add(e.ab, loose);
    else {
      const rows: PickerRow[] = [];
      for (const ab of e.boards) add(ab, rows, e.group.name);
      if (rows.length) groups.push({ heading: e.group.name, rows });
    }
  }
  const out: PickerSection[] = [];
  if (loose.length) out.push({ heading: groups.length || masters.length ? 'Artboards' : null, rows: loose });
  out.push(...groups);
  if (masters.length) out.push({ heading: 'Page masters', rows: masters });
  return out;
}

/** Every row, in the order the picker lists them: what stepping with Alt+Up and Alt+Down walks through. */
export const pickerRows = (p: Project): PickerRow[] => pickerSections(p).flatMap((s) => s.rows);

/** The artboard before or after the open one in the picker's order (it stops at the ends), or null when there is nowhere to go. */
export function stepTarget(p: Project, activeId: string, dir: 1 | -1): string | null {
  const rows = pickerRows(p);
  const at = rows.findIndex((r) => r.id === activeId);
  const next = rows[at < 0 ? (dir === 1 ? 0 : rows.length - 1) : at + dir];
  return next && next.id !== activeId ? next.id : null;
}

/** The sections cut down to what matches a typed search (the properties panel's scorer over the artboard's name and its group). */
export function filterSections(sections: PickerSection[], query: string): PickerSection[] {
  if (!query.trim()) return sections;
  const all = sections.flatMap((s) => s.rows);
  const found = rankEntries(query, all, (r) => ({ key: r.id, label: r.name, section: r.group ?? (r.master ? 'page master' : ''), plain: true }));
  return sections.map((s) => ({ ...s, rows: found.filter((r) => s.rows.includes(r)) })).filter((s) => s.rows.length);
}

/**
 * Open an artboard's graph: it becomes the active, selected artboard (what clicking it in the Layers panel does) and the canvas
 * comes to it, panning to centre it, and zooming out only when it does not fit at the zoom the person has.
 */
export function showArtboard(id: string): void {
  const s = store();
  const st = s.get();
  const ab = st.project.artboards.find((a) => a.id === id);
  if (!ab) return;
  s.set({ activeArtboardId: id, artboardSelected: true, selection: [], activeTimelineId: id === st.activeArtboardId ? st.activeTimelineId : null });
  const el = document.querySelector('.canvas');
  if (!el || ab.canvasHidden) return;
  const W = el.clientWidth;
  const H = el.clientHeight;
  if (!W || !H) return;
  const zoom = Math.min(st.zoom, Math.max(0.05, Math.min((W - 80) / ab.width, (H - 80) / ab.height)));
  const left = st.panX + ab.canvasX * zoom;
  const top = st.panY + ab.canvasY * zoom;
  // Already mostly in view at this zoom: leave the canvas where it is
  const seenW = Math.min(left + ab.width * zoom, W) - Math.max(left, 0);
  const seenH = Math.min(top + ab.height * zoom, H) - Math.max(top, 0);
  if (zoom === st.zoom && seenW > ab.width * zoom * 0.6 && seenH > ab.height * zoom * 0.6) return;
  s.set({ zoom, panX: W / 2 - (ab.canvasX + ab.width / 2) * zoom, panY: H / 2 - (ab.canvasY + ab.height / 2) * zoom });
}
