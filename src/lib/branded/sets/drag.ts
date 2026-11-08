/** The drag set of branded starters (see ../kit.ts for the contract every starter keeps). */
import type { BrandedStarter } from '../kit';
import { DRAG_WORDS_LAYOUT_STATES, dragTheWords } from './drag/drag-words';
import { IMAGE_PAIR_LAYOUT_STATES, imagePairing } from './drag/image-pair';
import { LABEL_LAYOUT_STATES, labelTheDiagram } from './drag/label';
import { ORDER_LAYOUT_STATES, putInOrder } from './drag/order';
import { SORT_LAYOUT_STATES, sortIntoGroups } from './drag/sort';
import { interactiveTimeline } from './drag/timeline';

export const STARTERS: BrandedStarter[] = [
  {
    key: 'drag/label-the-diagram',
    set: 'drag',
    name: 'Label the diagram',
    description: 'A picture with six numbered spots, six labels and a wrong one to drag onto them, made with the matching question. Check answer marks each spot and says what belongs there, with tries, part marks and Try again. Works with the keyboard.',
    tags: ['drag and drop', 'labelling', 'assessment'],
    build: labelTheDiagram,
    layoutStates: LABEL_LAYOUT_STATES,
  },
  {
    key: 'drag/sort-into-groups',
    set: 'drag',
    name: 'Sort into groups',
    description: 'Eight cards to drag into three labelled groups, made with the categorise question. Each drop says right or wrong without using a try, wrong drops are counted, Check answer marks the lot and a results page finishes it.',
    tags: ['drag and drop', 'sorting', 'assessment'],
    build: sortIntoGroups,
    layoutStates: SORT_LAYOUT_STATES,
  },
  {
    key: 'drag/put-in-order',
    set: 'drag',
    name: 'Put in order',
    description: 'Six steps of a process to arrange in the right order with up and down buttons, with hints, feedback, a score and a results page.',
    tags: ['ordering', 'question kit', 'assessment'],
    build: putInOrder,
    layoutStates: ORDER_LAYOUT_STATES,
  },
  {
    key: 'drag/interactive-timeline',
    set: 'drag',
    name: 'Interactive timeline',
    description: 'Seven events on a horizontal line, written once in a list. An intro draws the line, then a click or Tab onto an event opens its details, and Previous and Next (or the arrow keys) walk along.',
    tags: ['timeline', 'explore', 'animation'],
    build: interactiveTimeline,
  },
  {
    key: 'drag/drag-the-words',
    set: 'drag',
    name: 'Drag the words',
    description: 'A short passage with six gaps and eight word chips (two of them wrong on purpose) to drag into place, made with the fill in the blanks question answered by dragging. Check answer marks every gap and shows the right word beside a wrong one. Works with the keyboard and by tapping.',
    tags: ['drag and drop', 'fill in the gaps', 'assessment'],
    build: dragTheWords,
    layoutStates: DRAG_WORDS_LAYOUT_STATES,
  },
  {
    key: 'drag/image-pairing',
    set: 'drag',
    name: 'Image pairing',
    description: 'Six pictures and a wrong one to drag, each onto its partner card, made with the matching question. Check answer marks every pair and names the right picture beside a wrong card, with tries, part marks and Try again.',
    tags: ['drag and drop', 'matching', 'pictures'],
    build: imagePairing,
    layoutStates: IMAGE_PAIR_LAYOUT_STATES,
  },
];
