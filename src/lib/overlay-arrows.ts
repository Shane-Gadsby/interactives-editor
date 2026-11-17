import type { Artboard, Project, SceneNode } from 'interactives-player';
import { overlayTargets } from './dialog-kit';

/**
 * What a line from an overlay to a layer stands for. A tooltip sits beside its **target** and is shown by its **trigger**,
 * which is the same layer unless another was picked (`both`). A modal, a confirmation and a prompt aren't placed by
 * anything, so the only layer that matters to them is the one that opens them.
 */
export type OverlayArrowRole = 'target' | 'trigger' | 'both';

export interface OverlayArrow {
  /** The overlay page the line starts from. */
  overlay: string;
  /** The page the layer is on, and the layer the line ends at. */
  page: string;
  layer: string;
  role: OverlayArrowRole;
  /** The layer's name, for the list a screen reader gets. */
  name: string;
}

function find(list: SceneNode[], id: string): SceneNode | null {
  for (const n of list) {
    if (n.id === id) return n;
    if ('children' in n && Array.isArray(n.children)) {
      const hit = find(n.children as SceneNode[], id);
      if (hit) return hit;
    }
  }
  return null;
}

/** The lines one use of an overlay draws: to its target and its trigger for a tooltip, to what opens it for the rest. */
function arrowsOf(overlay: Artboard, node: SceneNode, artboard: Artboard): OverlayArrow[] {
  const base = { overlay: overlay.id, page: artboard.id };
  const picked = node.overlay?.trigger;
  //A trigger that has gone (deleted since) falls back to the layer itself, the way the player reads it
  const trigger = picked && picked !== node.id ? find(artboard.children, picked) : null;
  if ((overlay.overlay?.kind ?? 'tooltip') !== 'tooltip') {
    const opener = trigger ?? node;
    return [{ ...base, layer: opener.id, role: 'trigger', name: opener.name }];
  }
  if (!trigger) return [{ ...base, layer: node.id, role: 'both', name: node.name }];
  return [
    { ...base, layer: node.id, role: 'target', name: node.name },
    { ...base, layer: trigger.id, role: 'trigger', name: trigger.name },
  ];
}

/**
 * The lines to draw on the canvas for what is selected, so an overlay's links can be seen rather than looked up:
 *
 * - an overlay page that is open shows a line to every layer it belongs to and every layer that shows it;
 * - one selected layer that shows an overlay, or is the trigger of one, shows that overlay's lines for it.
 *
 * Nothing else draws any, so a page full of tooltips stays readable.
 */
export function overlayArrows(project: Project, active: Artboard | undefined, selection: string[]): OverlayArrow[] {
  if (!active) return [];
  if (active.overlay) return overlayTargets(project, active.id).flatMap((u) => arrowsOf(active, u.node, u.artboard));
  if (selection.length !== 1) return [];
  const id = selection[0];
  const out: OverlayArrow[] = [];
  const visit = (list: SceneNode[]) => {
    for (const n of list) {
      const link = n.overlay;
      if (link && (n.id === id || link.trigger === id)) {
        const page = project.artboards.find((a) => a.id === link.overlayId && a.overlay);
        if (page) out.push(...arrowsOf(page, n, active));
      }
      if ('children' in n && Array.isArray(n.children)) visit(n.children as SceneNode[]);
    }
  };
  visit(active.children);
  return out;
}

/** What each kind of line is called, on the canvas and aloud. */
export const OVERLAY_ARROW_WORDS: Record<OverlayArrowRole, string> = {
  target: 'Target',
  trigger: 'Trigger',
  both: 'Target and trigger',
};
