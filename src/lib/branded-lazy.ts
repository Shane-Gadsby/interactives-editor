import { lazyModule } from './lazy-module';

/** The branded starters (about 700 kB of set files) come in when the Templates page, the first-run picks or the help's list of them is first wanted. */
export const brandedStarters = lazyModule(() => import('./branded'));

/** Apply the UniSQ look: the kit it builds with (the logo artwork and its importer) comes in when the command is first run. */
export const unisqLook = lazyModule(() => import('./branded/unisq-look'));
