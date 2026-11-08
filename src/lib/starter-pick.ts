import type { Project } from 'interactives-player';
import { COLOURWAYS, brandedStarterByKey, projectFromBrandedStarter, type BrandedStarter, type Colourway } from './branded';
import { standaloneHtml } from './export';
import { projectFromStarter, starterByKey, type Starter } from './template-starters';

/** A built-in starter, as the picker holds it: one of the plain ones, or a branded one in a colourway. */
export type StarterPick = { kind: 'builtin'; s: Starter } | { kind: 'branded'; s: BrandedStarter; way: Colourway };

/** The pick for a starter's key (keys with a slash are branded: `assessment/multi-page-quiz`), in a colourway when it is branded. Null for a key that is not a starter. */
export function pickForKey(key: string, way: Colourway = COLOURWAYS[0]): StarterPick | null {
  if (key.includes('/')) {
    const s = brandedStarterByKey(key);
    return s ? { kind: 'branded', s, way } : null;
  }
  const s = starterByKey(key);
  return s ? { kind: 'builtin', s } : null;
}

/** The project a pick makes, built in memory. Nothing is saved, so this is for looking: Play builds this and runs it. */
export function starterProject(pick: StarterPick, name?: string): Project {
  return pick.kind === 'branded' ? projectFromBrandedStarter(pick.s, pick.way, name) : projectFromStarter(pick.s, name);
}

/**
 * The single-file page for a starter, the same build a share link or an example's Play uses, from a project that exists only here.
 * A starter's own files (its placeholder sounds) ride in the project as data addresses, which is all this reads; it asks the server
 * for nothing, because there is no project there to ask about.
 */
export async function starterPlayHtml(pick: StarterPick): Promise<string> {
  const project = starterProject(pick);
  return standaloneHtml(project, {
    bytesFor: async (a) => {
      if (!a.src?.startsWith('data:')) return null;
      return new Uint8Array(await (await fetch(a.src)).arrayBuffer());
    },
  });
}
