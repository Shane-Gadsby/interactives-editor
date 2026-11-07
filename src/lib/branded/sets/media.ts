/** The listen, watch and capture set of branded starters (see ../kit.ts for the contract every starter keeps). */
import type { BrandedStarter } from '../kit';
import { observeAndTag } from './media/observe-and-tag';
import { listeningLab } from './media/listening-lab';
import { liteLesson } from './media/lite-lesson';
import { describedVideo } from './media/described-video';

export const STARTERS: BrandedStarter[] = [observeAndTag, listeningLab, describedVideo, liteLesson];
