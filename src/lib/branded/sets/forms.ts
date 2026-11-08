/** Every branded starter's Fill in form, by starter key (see ../form-kit.ts). Each set keeps its own in its folder. */
import type { FormMaker } from '../form-kit';
import { FORMS as assessment } from './assessment/forms';
import { FORMS as explore } from './explore/forms';
import { FORMS as drag } from './drag/forms';
import { FORMS as story } from './story/forms';
import { FORMS as games } from './games/forms';
import { FORMS as writing } from './writing/forms';
import { FORMS as practice } from './practice/forms';
import { FORMS as media } from './media/forms';

export const FORMS: Record<string, FormMaker> = { ...assessment, ...explore, ...drag, ...story, ...games, ...writing, ...practice, ...media };
