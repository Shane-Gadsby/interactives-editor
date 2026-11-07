/** The listen, watch and capture set of branded starters (see ../kit.ts for the contract every starter keeps). */
import type { BrandedStarter } from '../kit';
import { observeAndTag } from './media/observe-and-tag';

export const STARTERS: BrandedStarter[] = [observeAndTag];
