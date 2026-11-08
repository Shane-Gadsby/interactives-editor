/** The explore set of branded starters (see ../kit.ts for the contract every starter keeps). */
import type { BrandedStarter } from '../kit';
import { chart } from './explore/chart';
import { wordCloud } from './explore/word-cloud';
import { datedTimeline } from './explore/dated-timeline';
import { collage } from './explore/collage';
import { informationWall } from './explore/wall';
import { imageSequence } from './explore/sequence';
import { accordion } from './explore/accordion';
import { beforeAndAfter } from './explore/compare';
import { flipAndDialogCards } from './explore/cards';
import { imageHotspots } from './explore/hotspots';
import { imageSlider } from './explore/slider';

export const STARTERS: BrandedStarter[] = [imageHotspots, accordion, flipAndDialogCards, imageSlider, beforeAndAfter, imageSequence, informationWall, collage, chart, wordCloud, datedTimeline];
