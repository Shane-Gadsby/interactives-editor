/** The drag set of branded starters (see ../kit.ts for the contract every starter keeps). */
import type { BrandedStarter } from '../kit';
import { dragTheWords } from './drag/drag-words';
import { imagePairing } from './drag/image-pair';
import { labelTheDiagram } from './drag/label';
import { putInOrder } from './drag/order';
import { sortIntoGroups } from './drag/sort';
import { interactiveTimeline } from './drag/timeline';

export const STARTERS: BrandedStarter[] = [
  {
    key: 'drag/label-the-diagram',
    set: 'drag',
    name: 'Label the diagram',
    description: 'A picture with six drop spots and six labels to drag onto them. Check marks each label right or wrong, Show answers fills them in and Try again starts over. Works with the keyboard.',
    tags: ['drag and drop', 'labelling', 'assessment'],
    build: labelTheDiagram,
  },
  {
    key: 'drag/sort-into-groups',
    set: 'drag',
    name: 'Sort into groups',
    description: 'Eight cards to drag into three labelled groups. Each drop says right or wrong, a count follows the sorting and a results page finishes it.',
    tags: ['drag and drop', 'sorting', 'assessment'],
    build: sortIntoGroups,
  },
  {
    key: 'drag/put-in-order',
    set: 'drag',
    name: 'Put in order',
    description: 'Six steps of a process to arrange in the right order with up and down buttons, with hints, feedback, a score and a results page.',
    tags: ['ordering', 'question kit', 'assessment'],
    build: putInOrder,
  },
  {
    key: 'drag/interactive-timeline',
    set: 'drag',
    name: 'Interactive timeline',
    description: 'Seven events on a horizontal line. An intro draws the line, then a click or Tab onto an event opens its details, and Previous and Next walk along.',
    tags: ['timeline', 'explore', 'animation'],
    build: interactiveTimeline,
  },
  {
    key: 'drag/drag-the-words',
    set: 'drag',
    name: 'Drag the words',
    description: 'A short passage with six gaps and eight word chips (two of them wrong on purpose) to drag into place. Check marks every gap right or wrong, Show answers fills them in and Try again starts over. Works with the keyboard and by tapping.',
    tags: ['drag and drop', 'fill in the gaps', 'assessment'],
    build: dragTheWords,
  },
  {
    key: 'drag/image-pairing',
    set: 'drag',
    name: 'Image pairing',
    description: 'Six pictures to drag, each onto its partner card. A card only takes its own picture, so every drop says right or wrong straight away, matched pairs turn green, a count follows and Try again starts over.',
    tags: ['drag and drop', 'matching', 'pictures'],
    build: imagePairing,
  },
];
