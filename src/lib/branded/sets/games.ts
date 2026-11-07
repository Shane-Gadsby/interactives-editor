/** The games set of branded starters (see ../kit.ts for the contract every starter keeps). */
import type { BrandedStarter } from '../kit';
import { arithmeticQuiz } from './games/arithmetic';
import { guessTheAnswer } from './games/guess';
import { personalityQuiz } from './games/personality';
import { gameMap } from './games/map';
import { crossword } from './games/crossword';
import { wordSearch } from './games/wordsearch';

export const STARTERS: BrandedStarter[] = [crossword, wordSearch, arithmeticQuiz, guessTheAnswer, personalityQuiz, gameMap];
