/**
 * Every branded starter, in the order the Templates tab shows them: by set, then as each set file lists them.
 */
import type { TemplateChecklistItem, Project } from 'interactives-player';
import { STARTERS as assessment } from './sets/assessment';
import { STARTERS as explore } from './sets/explore';
import { STARTERS as drag } from './sets/drag';
import { STARTERS as story } from './sets/story';
import type { BrandedStarter, StarterSet } from './kit';
import { COLOURWAYS, type Colourway } from './looks';

export { COLOURWAYS, HIGH_CONTRAST, colourwayById, type Colourway } from './looks';
export { SET_NAMES, type BrandedStarter, type StarterSet } from './kit';

export const BRANDED_STARTERS: BrandedStarter[] = [...assessment, ...explore, ...drag, ...story];
export const SETS: StarterSet[] = ['assessment', 'explore', 'drag', 'story'];

export const brandedStarterByKey = (key: string): BrandedStarter | undefined => BRANDED_STARTERS.find((s) => s.key === key);

/** A branded starter in a colourway, as a new project carrying its checklist (the template record says which starter). */
export function projectFromBrandedStarter(s: BrandedStarter, colourway: Colourway = COLOURWAYS[0], name?: string): Project {
  const { project, checklist } = s.build(colourway);
  project.name = name || s.name;
  project.template = { builtin: `branded:${s.key}`, name: s.name, version: 1, checklist: checklist as TemplateChecklistItem[] };
  return project;
}
