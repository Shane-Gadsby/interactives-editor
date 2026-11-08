import { migrateInputVariables } from 'interactives-player';
/**
 * Every branded starter, in the order the Templates tab shows them: by set, then as each set file lists them.
 */
import type { TemplateChecklistItem, Project } from 'interactives-player';
import { STARTERS as assessment } from './sets/assessment';
import { STARTERS as explore } from './sets/explore';
import { STARTERS as drag } from './sets/drag';
import { STARTERS as story } from './sets/story';
import { STARTERS as games } from './sets/games';
import { STARTERS as writing } from './sets/writing';
import { STARTERS as practice } from './sets/practice';
import { STARTERS as media } from './sets/media';
import type { BrandedStarter, StarterSet } from './kit';
import { COLOURWAYS, type Colourway } from './looks';
import { applyTidy } from '../artboard-tidy';
import { finishGraphs } from './graph-kit';
import { settleLayout } from './layout-check';
import { finishControls } from './finish';

export { COLOURWAYS, HIGH_CONTRAST, colourwayById, type Colourway } from './looks';
export { SET_NAMES, type BrandedStarter, type StarterSet } from './kit';

export const BRANDED_STARTERS: BrandedStarter[] = [...assessment, ...explore, ...drag, ...story, ...games, ...writing, ...practice, ...media];
export const SETS: StarterSet[] = ['assessment', 'explore', 'drag', 'story', 'games', 'writing', 'practice', 'media'];

export const brandedStarterByKey = (key: string): BrandedStarter | undefined => BRANDED_STARTERS.find((s) => s.key === key);

/** A branded starter in a colourway, as a new project carrying its checklist (the template record says which starter). */
export function projectFromBrandedStarter(s: BrandedStarter, colourway: Colourway = COLOURWAYS[0], name?: string): Project {
  const { project, checklist } = s.build(colourway);
  project.name = name || s.name;
  //graphs laid out the way the Interactions tab's Tidy up does it, whatever order the starter built them in
  //an input's old Variable setting becomes a two-way binding now, not on the next load
  migrateInputVariables(project);
  finishGraphs(project);
  //the same edges and gradient-page buttons on every starter
  finishControls(project);
  //auto layout frames laid out in the document, as the editor does after an edit
  settleLayout(project);
  //every page was made at the same canvas spot: lay them out in order, in a grid, before anyone sees them
  applyTidy(project, { x: 0, y: 0 });
  project.template = { builtin: `branded:${s.key}`, name: s.name, version: 1, checklist: checklist as TemplateChecklistItem[] };
  return project;
}

/**
 * The files a starter carries inside its project (placeholder sounds, as `data:` addresses). Takes them out of the project's
 * asset records, which then hold no bytes (the editor keeps those with the project, not in the document), and returns each
 * as a Blob by asset id for the caller to upload once the project exists.
 */
export function takeInlineAssets(project: Project): Map<string, Blob> {
  const files = new Map<string, Blob>();
  for (const a of project.assets) {
    const m = a.src && /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(a.src);
    if (!m) continue;
    const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    files.set(a.id, new Blob([bytes], { type: m[1] || a.mime }));
    delete a.src;
  }
  return files;
}
