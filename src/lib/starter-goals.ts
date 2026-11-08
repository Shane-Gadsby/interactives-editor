/**
 * What each built-in starter is for, in an author's words. The starters carry their own tags ("question kit", "variables",
 * "repeater"), which are the tool's words, so the picker filters by goal instead and shows the plain version of the tags. This
 * file only maps keys to goals: the starters themselves (src/lib/branded/sets/**, template-starters.ts) are not touched, so a
 * new starter without an entry here still shows up, under the goal of its set (or under every goal's "everything else").
 */
export type Goal = 'quiz' | 'explain' | 'practise' | 'story' | 'media';

export interface GoalInfo {
  id: Goal;
  /** The chip on the Templates tab. */
  chip: string;
  /** What the first-run screen says, as the thing the author wants to make. */
  want: string;
  /** One line under it. */
  about: string;
}

export const GOALS: GoalInfo[] = [
  { id: 'quiz', chip: 'Quiz', want: 'Test what learners know', about: 'Questions with feedback and a score, from multiple choice to matching and hotspots.' },
  { id: 'explain', chip: 'Explain', want: 'Explain something step by step', about: 'Walk through an idea in stages, or let people open up the parts they want.' },
  { id: 'practise', chip: 'Practise', want: 'Practise a skill', about: 'Cards, games, rehearsals and writing to do something with, not just read.' },
  { id: 'story', chip: 'Story', want: 'Tell a story or show a picture with clickable spots', about: 'Scenes and choices, or a picture that reveals more where you click.' },
  { id: 'media', chip: 'Media', want: 'Work with sound, video or the camera', about: 'Listen, watch, record or capture, with the accessibility parts already there.' },
];

export const goalInfo = (g: Goal): GoalInfo => GOALS.find((x) => x.id === g)!;

/** The goal each branded set belongs to unless a starter says otherwise below. */
const SET_GOAL: Record<string, Goal> = {
  assessment: 'quiz',
  explore: 'explain',
  drag: 'quiz',
  story: 'story',
  games: 'practise',
  writing: 'practise',
  practice: 'practise',
  media: 'media',
};

/** Starters that are for more than their set's goal (or a different one), by key. The list replaces the set's goal. */
const OWN: Record<string, Goal[]> = {
  quiz: ['quiz'],
  'step-explainer': ['explain'],
  'flip-cards': ['explain', 'practise'],
  sorting: ['quiz', 'practise'],
  'branching-story': ['story'],
  'timeline-intro': ['explain', 'story'],
  'assessment/find-the-hotspot': ['quiz', 'story'],
  'assessment/find-multiple-hotspots': ['quiz', 'story'],
  'assessment/essay': ['quiz', 'practise'],
  'assessment/spelling-test': ['quiz', 'practise'],
  'assessment/audio-first-quiz': ['quiz', 'media'],
  'explore/image-hotspots': ['story', 'explain'],
  'explore/image-slider': ['story', 'explain'],
  'explore/image-sequence': ['explain', 'story'],
  'explore/before-and-after': ['explain', 'story'],
  'explore/collage': ['story'],
  'explore/flip-and-dialog-cards': ['explain', 'practise'],
  'explore/dated-timeline': ['explain', 'story'],
  'drag/interactive-timeline': ['explain'],
  'drag/label-the-diagram': ['quiz', 'explain'],
  'drag/put-in-order': ['quiz', 'practise'],
  'drag/sort-into-groups': ['quiz', 'practise'],
  'story/memory-game': ['practise'],
  'story/video-questions': ['story', 'media', 'quiz'],
  'games/arithmetic-quiz': ['practise', 'quiz'],
  'games/guess-the-answer': ['practise', 'quiz'],
  'writing/questionnaire': ['practise', 'quiz'],
  'media/observe-and-tag': ['media', 'practise'],
  'media/listening-lab': ['media', 'practise'],
  'practice/shadow-the-model': ['practise', 'media'],
  'practice/sign-practice': ['practise', 'media'],
};

/** The keys that have an entry of their own, for the test that checks they all still exist. */
export const GOAL_KEYS = Object.keys(OWN);

/** What a starter is for: its own entry, else its set's goal (`assessment/quiz` is in `assessment`), else nothing. */
export function goalsOf(key: string): Goal[] {
  if (OWN[key]) return OWN[key];
  const set = key.includes('/') ? key.split('/')[0] : '';
  return SET_GOAL[set] ? [SET_GOAL[set]] : [];
}

/**
 * The first-run suggestion for each goal: the starter to offer first, then two others to pick from. A key with a slash is a
 * branded starter (made in the first colourway), without one it is one of the plain built-in ones.
 */
export const FIRST_RUN: Record<Goal, string[]> = {
  quiz: ['assessment/multi-page-quiz', 'assessment/true-or-false', 'quiz'],
  explain: ['step-explainer', 'explore/accordion', 'drag/interactive-timeline'],
  practise: ['explore/flip-and-dialog-cards', 'games/word-search', 'drag/put-in-order'],
  story: ['explore/image-hotspots', 'story/branching-scenario', 'story/interactive-book'],
  media: ['media/listening-lab', 'media/described-video', 'story/video-questions'],
};

/** Tags that are the tool's own words. Hidden on the cards (search still sees them). */
const JARGON = new Set([
  'variables',
  'variable',
  'list variable',
  'question kit',
  'repeater',
  'tries',
  'server marked',
  'user data',
  'auto layout',
  'artboards',
  'multi-page',
  'connectors',
  'true statement',
  'number keys',
  'counter',
  'saved',
  'report download',
  'retakes',
  'grade',
  'data',
  'results',
  'text input',
  'click',
  'find',
  'tags',
  'layout',
  'export',
  'navigation',
  'progress',
  'choices',
  'keywords',
  'word count',
  'rapid fire',
  'image choice',
  'multiple response',
  'multiple choice',
  'fill in the gaps',
  'fill in the blanks',
  'mark the words',
  'list',
]);

/** A few plain renames. */
const RENAME: Record<string, string> = {
  assessment: 'quiz',
  hotspots: 'clickable spots',
  hotspot: 'clickable spots',
  scenarios: 'scenario',
  picture: 'pictures',
  sound: 'audio',
  voice: 'audio',
  microphone: 'recording',
  camera: 'recording',
};

/** At most `max` tags in an author's words: the tool's own words dropped, a few renamed, repeats merged. Never empty (the first goal stands in). */
export function plainTags(tags: string[], key: string, max = 4): string[] {
  const out: string[] = [];
  for (const t of tags) {
    const lower = t.trim().toLowerCase();
    if (!lower || JARGON.has(lower)) continue;
    const name = RENAME[lower] ?? lower;
    if (!out.includes(name)) out.push(name);
  }
  // keyboard friendly is on a lot of them, so it goes last and doesn't crowd the rest out
  out.sort((a, b) => Number(a === 'keyboard friendly') - Number(b === 'keyboard friendly'));
  const kept = out.slice(0, max);
  if (!kept.length) {
    const g = goalsOf(key)[0];
    if (g) kept.push(goalInfo(g).chip.toLowerCase());
  }
  return kept;
}

/**
 * Does a starter match what was typed? Every word has to be found somewhere in its name, description, tags (all of them, the
 * tool's words too, so "question kit" still finds quizzes) or goal names. Empty text matches everything.
 */
export function starterMatches(query: string, s: { key: string; name: string; description: string; tags: string[] }): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [s.name, s.description, ...s.tags, ...goalsOf(s.key).flatMap((g) => [goalInfo(g).chip, goalInfo(g).want])].join(' ').toLowerCase();
  return words.every((w) => hay.includes(w));
}
