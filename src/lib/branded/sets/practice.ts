/** The speaking and practice set of branded starters (see ../kit.ts for the contract every starter keeps). */
import type { BrandedStarter } from '../kit';
import { difficultConversation } from './practice/difficult-conversation';
import { timedTalk } from './practice/timed-talk';
import { keepTheBeat } from './practice/keep-the-beat';
import { shadowTheModel } from './practice/shadow-the-model';

export const STARTERS: BrandedStarter[] = [difficultConversation, timedTalk, keepTheBeat, shadowTheModel];
