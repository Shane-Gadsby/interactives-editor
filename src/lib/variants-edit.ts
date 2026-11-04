// Responsive artboard sets in the editor: how a set is listed, labelled and given a new member. The runtime side (choosing
// by width, pairing, what carries) is the player's variants.ts; these are the pieces only the editor needs.
import { setBase, setMembers, type Artboard, type Project } from 'interactives-player';

/** Artboards in the order the Layers panel lists them: a set's variants follow their base, narrowest first. */
export function orderedArtboards(artboards: Artboard[]): Artboard[] {
  const out: Artboard[] = [];
  for (const ab of artboards) {
    if (ab.variantOf && artboards.some((a) => a.id === ab.variantOf)) continue;
    out.push(ab);
    for (const m of setMembers(artboards, ab)) if (m !== ab) out.push(m);
  }
  return out;
}

/** The widths a member of a set is shown at: "0 to 599 px", "600 px and up". */
export function rangeLabel(artboards: Artboard[], ab: Artboard): string {
  const members = setMembers(artboards, ab);
  if (members.length < 2) return '';
  const i = members.indexOf(ab);
  const from = ab.minWidth ?? 0;
  const next = members[i + 1];
  if (!next) return `${from}+ px`;
  return `${from}–${(next.minWidth ?? 0) - 1} px`;
}

/** Is this artboard a member of a set with other artboards (the base of one, or a variant). */
export function inResponsiveSet(project: Project, ab: Artboard): boolean {
  return setMembers(project.artboards, ab).length > 1;
}

export type VariantSide = 'narrower' | 'wider';

/**
 * Size and breakpoints for a variant added next to a set: a narrower one goes below the narrowest member (a phone), a
 * wider one above the widest. `moveEdge` is the new breakpoint the member next to it needs when it had none (a base on its own starts at 0).
 */
export function variantPlan(members: Artboard[], side: VariantSide): { width: number; height: number; minWidth: number; edgeMinWidth?: number } {
  if (side === 'narrower') {
    const edge = members[0];
    const width = edge.width >= 600 ? 360 : Math.max(200, Math.round((edge.width * 0.6) / 10) * 10);
    const edgeMin = edge.minWidth ?? 0;
    if (edgeMin > 0) return { width, height: edge.height, minWidth: 0 };
    // The artboard that was the narrowest takes the breakpoint, the new one is shown below it
    const bp = Math.min(600, Math.max(width + 40, Math.round((edge.width * 0.7) / 10) * 10));
    return { width, height: edge.height, minWidth: 0, edgeMinWidth: bp };
  }
  const edge = members[members.length - 1];
  const width = Math.max(1200, Math.round((edge.width * 1.4) / 10) * 10);
  const edgeMin = edge.minWidth ?? 0;
  const bp = Math.max(edgeMin + 100, Math.round(edge.width / 10) * 10);
  return { width, height: edge.height, minWidth: bp };
}

/** The base of the set an artboard is in, by id (itself when it is on its own). */
export function baseOf(project: Project, ab: Artboard): Artboard {
  return setBase(project.artboards, ab);
}

/**
 * The artboards to offer where an interaction or a setting names one: a responsive set once (by its base, which the player
 * turns into the member that fits), not each of its members. A member that is already chosen stays in the list.
 */
export function artboardChoices(project: Project, chosen?: unknown): { value: string; label: string }[] {
  return project.artboards
    .filter((a) => !a.variantOf || a.id === chosen)
    .map((a) => ({ value: a.id, label: project.artboards.some((x) => x.variantOf === a.id) ? `${a.name} (responsive)` : a.name }));
}
