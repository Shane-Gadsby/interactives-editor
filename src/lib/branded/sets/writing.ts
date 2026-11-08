/** The writing set of branded starters (see ../kit.ts for the contract every starter keeps). */
import type { BrandedStarter } from '../kit';
import { journal } from './writing/journal';
import { questionnaire } from './writing/survey';
import { workbook } from './writing/workbook';

export const STARTERS: BrandedStarter[] = [questionnaire, workbook, journal];
