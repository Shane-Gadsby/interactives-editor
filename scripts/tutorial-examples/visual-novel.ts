//Your first visual novel's finished project: the Visual novel starter, with Ren in the cast (a happy and a thinking face,
//drawn as simple pictures) and an At the library scene with a choice that changes what Ren says
import { uid, type Project } from 'interactives-player';
import type { TutorialExample, TutorialGraphNote } from './kit';
import { visualNovel } from '../../src/lib/story-template';
import { linesOf } from '../../src/lib/story';

export const SCENE = `# At the library
Ren (happy): You found the quiet floor!
? Ask Ren to study with you
    Ren (thinking): Only if you bring snacks.
? Say you're just passing
    Ren: Suit yourself.`;

/** A plain figure as an SVG picture: a body, a head and a face that's smiling or thinking. */
export function figure(body: string, skin: string, face: 'happy' | 'thinking'): string {
  const mouth = face === 'happy' ? '<path d="M165 245 q35 25 70 0" stroke="#222" stroke-width="8" fill="none"/>' : '<path d="M170 250 h60" stroke="#222" stroke-width="8"/><circle cx="270" cy="150" r="10" fill="#fff" opacity=".8"/><circle cx="292" cy="122" r="14" fill="#fff" opacity=".8"/>';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="900" viewBox="0 0 400 900"><rect x="90" y="330" width="220" height="570" rx="90" fill="${body}"/><circle cx="200" cy="200" r="95" fill="${skin}"/><circle cx="165" cy="190" r="10" fill="#222"/><circle cx="235" cy="190" r="10" fill="#222"/>${mouth}</svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

export function withRen(p: Project): void {
  const happy = { id: uid('a'), name: 'Ren happy', mime: 'image/svg+xml', size: 0, src: figure('#6d28d9', '#e0b48c', 'happy') };
  const thinking = { id: uid('a'), name: 'Ren thinking', mime: 'image/svg+xml', size: 0, src: figure('#6d28d9', '#e0b48c', 'thinking') };
  p.assets.push(happy as never, thinking as never);
  p.story!.cast!.push({ id: uid('cm'), name: 'Ren', colour: '#6d28d9', expressions: [{ name: 'happy', assetId: happy.id }, { name: 'thinking', assetId: thinking.id }] });
  const ch = p.story!.chapters[0];
  ch.lines.push(...linesOf('\n' + SCENE));
}

/** What each of the starter's wired pages does, for the notes over their graphs (pages in the starter's order). */
export const STARTER_GRAPH_NOTES: TutorialGraphNote[] = [
  { page: 0, at: 0, text: '**The title screen\'s buttons.** New game starts the story, Continue loads the newest save, and the others go to their pages (Load sets savesMode first, so the slots page knows to load).' },
  { page: 1, at: 0, text: '**The stage\'s own buttons:** Back, Auto, Skip, Hide, Save, Load, History and Menu. A click anywhere else goes on to the next line without any wiring: the player does that for a story stage.' },
  { page: 3, at: 0, text: '**One flow for every slot.** A click on a copy of the slot list saves or loads that slot, by savesMode.' },
  { page: 4, at: 0, text: '**A Story setting node behind every choice,** each setting one of the reader\'s settings to its value. They stay on the reader\'s device.' },
  { page: 5, at: 0, text: '**The extras unlock as the reader gets to them.** A chapter starts the story from there, a track plays, and Puzzles opens the index.' },
  { page: 7, at: 0, text: '**The puzzle frame\'s buttons:** hints, the memo, Skip, Try again and Continue. The question\'s own Check answer marks the puzzle, so none of this needs touching.' },
];

function build(): Project {
  const { project } = visualNovel();
  project.settings.title = 'The library';
  delete project.template;
  withRen(project);
  return project;
}

export const example: TutorialExample = {
  key: 'tut-visual-novel',
  topic: 'tutorial-visual-novel',
  title: 'Your first visual novel',
  description: 'The Visual novel starter with a new character, Ren, and a scene at the library with a choice: the Your first visual novel tutorial\'s project.',
  tags: ['story', 'visual novel'],
  build,
  notes: [
    { text: '**The story is in the Story tab,** not on the pages. Chapter 1 ends with the *At the library* scene, and Ren is in the cast with two faces.' },
    { text: '**Every page is plain layers** bound to story values, so restyle the dialogue box or the title screen like anything else.', colour: 'sky' },
  ],
  graphNotes: STARTER_GRAPH_NOTES,
};
