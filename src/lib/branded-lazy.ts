import { lazyModule } from './lazy-module';

/** The branded starters (about 700 kB of set files) come in when the Templates page, the first-run picks or the help's list of them is first wanted. */
export const brandedStarters = lazyModule(() => import('./branded'));
