import type { Project } from 'interactives-player';

/** Why the UniSQ look cannot be applied to this project, or null when it can (light, so the command list can ask without loading the kit). */
export function lookBlocked(p: Project): string | null {
  if (p.brandLook) return 'This project already has the UniSQ look from a starter pack. Change its colourway in the Project settings.';
  if (!p.artboards.some((a) => !a.isMaster && !a.library)) return 'Add a page first.';
  return null;
}
