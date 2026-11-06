/** The story set of branded starters (see ../kit.ts for the contract every starter keeps). */
import type { BrandedStarter } from '../kit';
import { branching } from './story/branching';
import { memory } from './story/memory';
import { presentation } from './story/presentation';
import { videoQuestions } from './story/video';

export const STARTERS: BrandedStarter[] = [branching, presentation, memory, videoQuestions];
