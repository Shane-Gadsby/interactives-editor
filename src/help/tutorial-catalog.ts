import { BUILD_TUTORIALS } from './build';
import { CONCEPTS } from './concepts';
import { TUTORIALS } from './tutorials';
import { topicBody, type HelpTopic } from './topics';
import { stepsOf, type Step, type TutorialSet } from '../lib/tutorial-progress';

/**
 * Everything the tutorials screens list, read from the help's own registries (nothing is written out a second time): the five
 * Getting started tutorials, the Build it ones and the Concepts. Each is a help topic, so Start opens it in the help, and each
 * names its finished example (the same ones the Templates tab lists under Examples) where it has one.
 */
export type CatalogGroup = 'Getting started' | 'Build it' | 'Concepts';

export interface CatalogItem {
  /** The help topic id. */
  id: string;
  title: string;
  summary: string;
  group: CatalogGroup;
  /** Beginner, Intermediate or Advanced, for Build it. */
  level?: string;
  /** About how long it takes, when the tutorial says. */
  minutes?: number;
  /** The key of the finished example, when there is one. */
  example?: string;
  steps: Step[];
}

//The Getting started tutorials' own examples (the Build it ones carry theirs) and the times their text gives
const START_EXAMPLE: Record<string, string> = { 'tutorial-first-animation': 'first-animation', 'tutorial-first-interaction': 'first-interaction', 'tutorial-state-machine': 'lamp' };
const START_MINUTES: Record<string, number> = { 'tutorial-first-animation': 5, 'tutorial-state-machine': 10 };
const LEVEL_NAME = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

const stepsFor = (t: HelpTopic): Step[] => stepsOf(topicBody(t));

export const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

export const CATALOG: CatalogItem[] = [
  ...TUTORIALS.filter((t) => t.group === 'Getting started').map((t): CatalogItem => ({ id: t.id, title: t.title.replace(/^Tutorial \d+: /, ''), summary: t.summary, group: 'Getting started', minutes: START_MINUTES[t.id], example: START_EXAMPLE[t.id], steps: stepsFor(t) })),
  ...BUILD_TUTORIALS.map((b): CatalogItem => ({ id: b.topic.id, title: b.topic.title, summary: b.topic.summary, group: 'Build it', level: LEVEL_NAME[b.level], minutes: b.minutes, example: b.example, steps: stepsFor(b.topic) })),
  ...CONCEPTS.map((c): CatalogItem => ({ id: c.topic.id, title: c.topic.title, summary: c.topic.summary, group: 'Concepts', steps: [] })),
];

export const catalogItem = (id: string): CatalogItem | undefined => CATALOG.find((c) => c.id === id);

//Which badge set each Build it tutorial belongs to
const THEMES: [string, string, string[]][] = [
  ['questions', 'Questions', ['mcq', 'drag-match', 'blanks', 'sort', 'order', 'label']],
  ['show-and-explain', 'Show and explain', ['reveal', 'flipcards', 'accordion', 'carousel', 'compare', 'presentation', 'diagram']],
  ['games-and-stories', 'Games and stories', ['branching', 'memory', 'personality', 'progress', 'scene', 'wordgames']],
  ['learners-and-data', 'Learners, media and data', ['journal', 'survey-chart', 'whatif', 'data-source', 'context', 'video-chapters', 'microphone', 'sound']],
  ['polish', 'Polish and advanced', ['responsive', 'accessible', 'brand', 'bones', 'rive-drive', 'script']],
];

/** Every badge set: Getting started, a few themes of Build it, all of Build it, and the Concepts read. */
export const TUTORIAL_SETS: TutorialSet[] = [
  { id: 'getting-started', name: 'Getting started', members: CATALOG.filter((c) => c.group === 'Getting started').map((c) => c.id) },
  ...THEMES.map(([id, name, slugs]): TutorialSet => ({ id, name, members: slugs.map((s) => `tutorial-${s}`) })),
  { id: 'build-it', name: 'All of Build it', members: CATALOG.filter((c) => c.group === 'Build it').map((c) => c.id) },
  { id: 'concepts', name: 'Concepts', members: CATALOG.filter((c) => c.group === 'Concepts').map((c) => c.id) },
];
