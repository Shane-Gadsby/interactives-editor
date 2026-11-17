//The word games tutorial's finished projects, side by side in one: the Word search starter and the Crossword starter (Gold), each
//with its word list changed to the water cycle, which is all the tutorial's steps change. In the tutorial they are two projects;
//here the crossword's pages follow the word search's, its "words" is called "clues" so the two lists don't clash, and the word
//search's last page has a button on to the crossword.
//The branded starters draw their logo from an SVG, which needs a DOMParser: in node (the build script) one comes from jsdom.
import { createRequire } from 'node:module';
import { layoutCrossword, makeWordSearch, uid, type Project, type SceneNode } from 'interactives-player';
import { projectFromBrandedStarter } from '../../src/lib/branded/project';
import { applyTidy } from '../../src/lib/artboard-tidy';
import { renameVariable } from '../../src/lib/rename-variable';
import { wordSearch } from '../../src/lib/branded/sets/games/wordsearch';
import { crossword } from '../../src/lib/branded/sets/games/crossword';
import type { TutorialExample } from './kit';
import { varByName, whenClicked } from './_story-helpers';

export const WORDS = ['EVAPORATE', 'CONDENSE', 'CLOUD', 'RAINFALL', 'RIVER', 'OCEAN', 'VAPOUR', 'RUNOFF'];

export const CLUES = [
  { answer: 'EVAPORATE', clue: 'What water does when the sun turns it into a gas' },
  { answer: 'CONDENSE', clue: 'What vapour does as it cools into droplets' },
  { answer: 'CLOUD', clue: 'Tiny droplets of water floating in the sky' },
  { answer: 'RAIN', clue: 'Water falling from the clouds' },
  { answer: 'RIVER', clue: 'Carries water downhill to the sea' },
  { answer: 'OCEAN', clue: 'Holds most of the water on Earth' },
  { answer: 'VAPOUR', clue: 'Water as a gas' },
  { answer: 'SNOW', clue: 'Frozen flakes that fall in winter' },
  { answer: 'RUNOFF', clue: 'Water flowing over the ground into streams' },
  { answer: 'STREAM', clue: 'A small river' },
];

function withDom<T>(fn: () => T): T {
  const g = globalThis as Record<string, unknown>;
  if (typeof g.DOMParser !== 'undefined') return fn();
  const { JSDOM } = createRequire(import.meta.url)('jsdom') as { JSDOM: new (html: string) => { window: Record<string, unknown> } };
  const w = new JSDOM('').window;
  const put = ['DOMParser', 'document', 'Node', 'Element', 'XMLSerializer'];
  for (const k of put) g[k] = w[k];
  try {
    return fn();
  } finally {
    for (const k of put) delete g[k];
  }
}

/** Use template, then the one change the tutorial makes: the word list in the Variables tab (and the fallback the formula starts from). */
function starter(which: 'search' | 'cross'): Project {
  const p = withDom(() => projectFromBrandedStarter(which === 'search' ? wordSearch : crossword));
  //what Use template leaves for the author: the checklist and the starter's own notes, which the example's notes replace
  delete p.template;
  delete p.contentForm;
  for (const ab of p.artboards) {
    delete ab.notes;
    delete ab.logic.notes;
  }
  if (which === 'search') {
    varByName(p, 'words').initial = JSON.stringify(WORDS);
    varByName(p, 'rows').initial = JSON.stringify(makeWordSearch(WORDS, 12, 7));
  } else {
    varByName(p, 'words').initial = JSON.stringify(CLUES);
    varByName(p, 'entries').initial = JSON.stringify(layoutCrossword(CLUES, 10));
  }
  return p;
}

function build(): Project {
  const p = starter('search');
  const c = starter('cross');
  //the same tokens under other ids (each project makes its own): the crossword's layers are pointed at the word search's
  p.name = 'Water cycle word games';
  renameVariable(c, varByName(c, 'words').id, 'clues');
  p.variables.push(...c.variables);

  //the crossword's pages, drawing the word search's masters of the same name
  const masters = new Map(p.artboards.filter((a) => a.isMaster).map((a) => [a.name, a.id]));
  const theirs = new Map(c.artboards.filter((a) => a.isMaster).map((a) => [a.id, a.name]));
  const ids = new Map((c.themes?.tokens ?? []).map((t) => [t.id, p.themes?.tokens.find((x) => x.name === t.name)?.id]));
  let json = JSON.stringify(c.artboards.filter((a) => !a.isMaster));
  for (const [from, to] of ids) {
    if (!to) throw new Error(`the word search has no token called ${from}`);
    json = json.split(from).join(to);
  }
  const pages = JSON.parse(json) as Project['artboards'];
  for (const ab of pages) if (ab.master) ab.master = masters.get(theirs.get(ab.master)!)!;
  const lastPage = p.artboards.findIndex((a) => a.isMaster);
  p.artboards.splice(lastPage, 0, ...pages);

  //On to the crossword from the word search's last page, beside Play again
  const finished = p.artboards.find((a) => a.name === 'Finished')!;
  const replay = finished.children.find((n) => n.name === 'Play again')!;
  replay.x -= 110;
  const on = structuredClone(replay) as SceneNode & { label: string };
  Object.assign(on, { id: uid('n'), name: 'Try the crossword', label: 'Try the crossword', x: replay.x + 220, width: 200 });
  finished.children.push(on);
  whenClicked(p, finished, on, 'page-pick', pages[0].id);
  applyTidy(p, { x: 0, y: 0 });
  return p;
}

export const example: TutorialExample = {
  key: 'tut-wordgames',
  topic: 'tutorial-wordgames',
  title: 'Word search and crossword',
  description: 'The Word search and Crossword starters with their word lists changed to the water cycle: both grids are made from the lists, so changing the words changes the puzzles. The Word games tutorial\'s projects, side by side.',
  tags: ['game', 'puzzle', 'word search', 'crossword', 'variables'],
  build,
  notes: [
    { text: '**Two lists make two puzzles.** `words` (the word search) and `clues` (the crossword, called `words` in its starter) are the only things changed. Change a word in the Variables tab and its grid changes.', page: 2 },
    { text: '**The grids are formulas.** `rows` is `wordSearch(words, 12)` and `entries` is `crossword(clues, 10)`, both kept up to date. The repeaters draw one square per letter.', colour: 'sky', page: 2 },
  ],
  graphNotes: [
    { page: 1, at: 0, text: '**Choosing a word only sets start and end.** Dragging, clicking a first and last letter and the arrow keys all end up there, then a try message checks the live `hit`.' },
    { page: 4, at: 0, text: '**Typing fills cells.** Each square remembers what was typed (`t`) beside its answer letter (`ch`), so Check compares the two and the live `done` notices the last right letter.' },
  ],
};
