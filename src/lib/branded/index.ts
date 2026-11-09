/**
 * Every branded starter, in the order the Templates tab shows them: by set, then as each set file lists them.
 */
import { STARTERS as assessment } from './sets/assessment';
import { STARTERS as explore } from './sets/explore';
import { STARTERS as drag } from './sets/drag';
import { STARTERS as story } from './sets/story';
import { STARTERS as games } from './sets/games';
import { STARTERS as writing } from './sets/writing';
import { STARTERS as practice } from './sets/practice';
import { STARTERS as media } from './sets/media';
import type { BrandedStarter } from './kit';
import { FORMS } from './sets/forms';

export { COLOURWAYS, HIGH_CONTRAST, colourwayById, type Colourway } from './looks';
export { SET_NAMES, type BrandedStarter, type StarterSet } from './kit';

export const BRANDED_STARTERS: BrandedStarter[] = [...assessment, ...explore, ...drag, ...story, ...games, ...writing, ...practice, ...media].map((s) => (FORMS[s.key] ? { ...s, form: FORMS[s.key] } : s));
export { SETS, projectFromBrandedStarter, takeInlineAssets } from './project';

export const brandedStarterByKey = (key: string): BrandedStarter | undefined => BRANDED_STARTERS.find((s) => s.key === key);
