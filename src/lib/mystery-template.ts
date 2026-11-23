import { uid, type Artboard, type Project, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { visualNovel } from './story-template';
import { addPuzzlePage } from './puzzle-page';
import { addPage, mapPage, roomPage } from './room-page';
import { linesOf } from './story';

/**
 * The Puzzle mystery starter: the Visual novel one (title, stage, saves, settings, history, extras and the puzzle index)
 * with a case to solve. A clubroom to search (five places, two hidden hint coins, a key to show someone), a map with two
 * places, and three puzzles of different kinds: pick one, put in order, tick every right one. All of it runs from the script.
 */

const SCRIPT = `# The clubroom

// The case: the writing club's trophy has gone from its cabinet overnight.
Millie: It's gone. The trophy. The cabinet was locked all night.
Olive: Then someone had a key. Let's look around before anyone tidies up.
[call Clubroom]
? Show Olive the brass key [if has("Brass key")]
    Olive: The cabinet key! So it never left the room.
    set clues += 1
? Say you found nothing
    Olive: Then we'll have to think instead.

Millie: First, an argument from this morning. Settle it for us.
[call Puzzle 1]
if story.result == "solved"
    Millie: Ha. I knew it was me.
[place The quad]
[place The library]
Olive: The quad has the noticeboard. The library has the other cabinet. Where first?
[call Map]

# The quad

Olive: Last night's timetable is pinned up here. If we put it in order...
[call Puzzle 2]
if story.result == "solved"
    set clues += 1
    Olive: So the caretaker swept up after the lights went out. Odd.
else
    Olive: It's a muddle. Let's try the library.
-> The library

# The library

Millie: The library cabinet has a code lock, and the librarian left a riddle on it.
[call Puzzle 3]
if story.result == "solved"
    Millie: It's open, and the trophy is behind the dictionaries!
    if clues >= 2
        Olive: Moved here for safe keeping, by someone with the brass key. The caretaker.
        -> end Case closed
    Olive: But who put it there?
    -> end Found, not solved
Millie: We'll crack it tomorrow.
-> end Still missing
`;

const find = (ab: Artboard, name: string): SceneNode | undefined => {
  let hit: SceneNode | undefined;
  const look = (list: SceneNode[]) => {
    for (const n of list) {
      if (!hit && n.name === name) hit = n;
      if ('children' in n && Array.isArray(n.children)) look(n.children as SceneNode[]);
    }
  };
  look(ab.children);
  return hit;
};

export function puzzleMystery(): { project: Project; checklist: TemplateChecklistItem[] } {
  const { project } = visualNovel();
  project.settings.title = 'Puzzle mystery';
  const title = project.artboards.find((a) => a.name === 'Title')!;
  const heading = find(title, 'Title');
  if (heading && heading.type === 'text') heading.text = 'The missing trophy';
  const sub = find(title, 'Subtitle');
  if (sub && sub.type === 'text') sub.text = 'A puzzle mystery';
  project.variables.push({ id: uid('v'), name: 'clues', type: 'number', initial: 0 });

  //Puzzle 1 comes with the Visual novel starter (pick one); two more of other kinds
  const p1 = project.artboards.find((a) => a.puzzle)!;
  p1.puzzle!.title = 'Who brought the biscuits?';
  const p2 = addPuzzlePage(project, {
    kind: 'ordering',
    name: 'Puzzle 2',
    title: 'Last night, in order',
    value: 30,
    hints: ['The meeting ended before anyone locked up.', 'You can only sweep a room once the meeting has left it.'],
    bigHint: 'The lights go out last of all.',
    question: {
      prompt: 'Put last night in the order it happened. Use the arrows, or drag.',
      options: [
        { id: 'o1', text: 'The club meeting ends' },
        { id: 'o2', text: 'Millie locks the cabinet' },
        { id: 'o3', text: 'The caretaker sweeps the clubroom' },
        { id: 'o4', text: 'The lights go out' },
      ],
      shuffle: true,
    },
  });
  const p3 = addPuzzlePage(project, {
    kind: 'multiple',
    name: 'Puzzle 3',
    title: 'The librarian’s lock',
    value: 40,
    hints: ['36 is 4 times 9.', '36 is also 3 times 12.'],
    bigHint: 'Only one of them leaves something over.',
    question: {
      prompt: 'The riddle on the lock: “Press every number that goes into 36 exactly.” Which buttons do you press?',
      options: [
        { id: 'o1', text: '4', correct: true },
        { id: 'o2', text: '5' },
        { id: 'o3', text: '9', correct: true },
        { id: 'o4', text: '12', correct: true },
      ],
      shuffle: false,
    },
  });
  const room = roomPage('Clubroom');
  addPage(project, room);
  const map = mapPage('Map');
  addPage(project, map);
  project.artboards.forEach((a, i) => (a.canvasX = i * (1280 + 160)));

  project.story!.chapters = [{ id: uid('ch'), name: 'The case', lines: linesOf(SCRIPT) }];
  const page = (id: string) => project.artboards.find((a) => a.id === id);
  const item = (text: string, node?: SceneNode, artboard?: Artboard): TemplateChecklistItem => ({ id: uid('ck'), text, ...(node ? { nodeId: node.id } : {}), ...(artboard ? { artboardId: artboard.id } : {}), done: false });
  return {
    project,
    checklist: [
      item('Give your mystery a title on the title screen', heading, title),
      item('Rewrite the case in the Story tab: the sample shows a room, three puzzles and a map'),
      item('Put a background picture in the Clubroom and lay its places over the things in it (each has Look at)', undefined, room),
      item('Change the hidden coins and the key: their words, and what they give, under Look at', find(room, 'Desk'), room),
      item('Write your own puzzles: the question on each page, and its title, value and hints under Puzzle', undefined, p1),
      item('Check the second and third puzzles too', undefined, page(p2)),
      item('Open places on the Map from the script with [place ...], each with a # scene of the same name', undefined, map),
      item('Preview it from the title and play to an ending, using only the keyboard once', undefined, page(p3)),
    ],
  };
}
