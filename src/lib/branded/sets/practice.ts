/** The speaking and practice set of branded starters (see ../kit.ts for the contract every starter keeps). */
import type { BrandedStarter } from '../kit';
import { difficultConversation } from './practice/difficult-conversation';
import { timedTalk } from './practice/timed-talk';

export const STARTERS: BrandedStarter[] = [difficultConversation, timedTalk];
