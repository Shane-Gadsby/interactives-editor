//The Activity Designer's blueprint turned into editor content: pages, a question from the question kit, buttons wired by
//Describe it, the look of the page that is already there, and the things it cannot do said plainly
import { describe, expect, it } from 'vitest';
import { createArtboard, createNode, createProject, walk, type FrameNode, type Project, type SceneNode } from 'interactives-player';
import { compileBlueprint, type Blueprint } from '../src/lib/designer-blueprint';
import { newProjectWithThemes } from '../src/lib/themes';
import { liveProblems } from 'interactives-player';

const fixture = (): Project => {
  const p = newProjectWithThemes('Water cycle');
  const home = p.artboards[0];
  home.name = 'Page 1';
  home.width = 1024;
  home.height = 640;
  home.children.push(createNode('text', { name: 'Page title', text: 'Water cycle', x: 48, y: 40, width: 800, height: 46, fontFamily: 'Open Sans' }));
  return p;
};

const all = (p: Project, name: string): SceneNode[] => {
  const out: SceneNode[] = [];
  for (const ab of p.artboards) walk(ab.children, (n) => void (n.name === name && out.push(n)));
  return out;
};
const page = (p: Project, name: string) => p.artboards.find((a) => a.name === name)!;
const layers = (p: Project, name: string) => {
  const out: SceneNode[] = [];
  walk(page(p, name).children, (n) => void out.push(n));
  return out;
};

const QUIZ: Blueprint = {
  pages: [
    {
      name: 'Quiz',
      title: 'Check your understanding',
      elements: [
        { type: 'text', text: 'Pick the best answer.' },
        { type: 'question', kind: 'multiple-choice', prompt: 'Which process turns water vapour into clouds?', options: [{ text: 'Condensation', correct: true, feedback: 'Right, the vapour cools into droplets.' }, { text: 'Evaporation', feedback: 'That is the reverse.' }, { text: 'Precipitation' }], hints: ['Think of a cold glass on a hot day.'], feedbackCorrect: 'Well done!' },
        { type: 'button', label: 'Back to the start', does: 'go to the page called Page 1' },
      ],
    },
    { name: 'Page 1', elements: [{ type: 'button', name: 'Start quiz', label: 'Start the quiz', does: 'go to the page called Quiz' }] },
  ],
};

describe('a page with a question, linked from page 1', () => {
  it('adds the page and the question with the editor\'s own builders, and wires the buttons both ways', () => {
    const r = compileBlueprint(fixture(), QUIZ);
    expect(r.problems).toEqual([]);
    const quiz = page(r.project, 'Quiz');
    expect(quiz).toBeTruthy();
    //it goes in the page list, not the master list, and the page that was open is untouched where it stood
    expect(r.project.artboards.map((a) => a.name)).toEqual(['Page 1', 'Quiz']);
    const q = layers(r.project, 'Quiz').find((n) => n.type === 'frame' && (n as FrameNode).question) as FrameNode;
    expect(q.question!.kind).toBe('single');
    expect(q.question!.options.map((o) => o.text)).toEqual(['Condensation', 'Evaporation', 'Precipitation']);
    expect(q.question!.options[0]).toMatchObject({ correct: true, feedback: 'Right, the vapour cools into droplets.' });
    expect(q.question!.hints).toEqual(['Think of a cold glass on a hot day.']);
    //Add question wired its own nodes (check, hint...), ordinary graph nodes
    expect(quiz.logic.nodes.some((n) => n.kind === 'action.questionCheck')).toBe(true);
    //a button on each page, and an artboard action that points at the other
    const start = all(r.project, 'Start quiz')[0];
    expect(start.type).toBe('button');
    const toQuiz = page(r.project, 'Page 1').logic.nodes.filter((n) => n.kind === 'action.artboard');
    expect(toQuiz).toHaveLength(1);
    expect(JSON.stringify(toQuiz[0].params)).toContain(quiz.id);
    const back = quiz.logic.nodes.filter((n) => n.kind === 'action.artboard');
    expect(JSON.stringify(back[0].params)).toContain(page(r.project, 'Page 1').id);
    //no broken references anywhere
    expect(liveProblems(r.project)).toEqual([]);
    expect(r.touched.length).toBeGreaterThan(0);
    expect(r.artboardId).toBe(quiz.id);
  });

  it('leaves the original project alone (it works on a copy)', () => {
    const p = fixture();
    const before = JSON.stringify(p);
    compileBlueprint(p, QUIZ);
    expect(JSON.stringify(p)).toBe(before);
  });

  it('puts the heading and the content in one column that hugs what is in it, inside the page', () => {
    const r = compileBlueprint(fixture(), QUIZ);
    const quiz = page(r.project, 'Quiz');
    const stack = quiz.children.find((n) => n.name === 'Content') as FrameNode;
    expect(stack.type).toBe('frame');
    expect(stack.layout?.direction).toBe('column');
    expect(stack.layout?.hugHeight).toBe(true);
    expect(stack.children.map((n) => n.type)).toContain('text');
    expect(stack.y + stack.height).toBeLessThan(quiz.height + 1);
  });
});

describe('the look of what is already there', () => {
  it('copies the master, background and title layer of the page that is open', () => {
    const p = fixture();
    const master = createArtboard({ name: 'Content master', isMaster: true, width: 1024, height: 640 });
    p.artboards.push(master);
    p.artboards[0].master = master.id;
    p.artboards[0].background = { type: 'solid', color: '#fafafa' };
    const r = compileBlueprint(p, { pages: [{ name: 'Results', title: 'Well done!', elements: [{ type: 'text', text: 'You finished.' }] }] }, { artboardId: p.artboards[0].id });
    const res = page(r.project, 'Results');
    expect(res.master).toBe(master.id);
    expect(res.background).toEqual({ type: 'solid', color: '#fafafa' });
    const title = res.children.find((n) => n.name === 'Page title') as unknown as { text: string; fontFamily: string; id: string };
    expect(title.text).toBe('Well done!');
    expect(title.fontFamily).toBe('Open Sans');
    //a new id, not the neighbour's
    expect(title.id).not.toBe(p.artboards[0].children[0].id);
    //pages go ahead of the masters
    expect(r.project.artboards.map((a) => a.name)).toEqual(['Page 1', 'Results', 'Content master']);
  });

  it('matches the button that is already on the page', () => {
    const p = fixture();
    p.artboards[0].children.push(createNode('button', { name: 'Existing', label: 'Hi', cornerRadius: 23, height: 46, fontWeight: 600 }));
    const r = compileBlueprint(p, { pages: [{ name: 'Page 1', elements: [{ type: 'button', label: 'More' }] }] });
    const b = all(r.project, 'More button')[0] as unknown as { cornerRadius: number; fontWeight: number };
    expect(b.cornerRadius).toBe(23);
    expect(b.fontWeight).toBe(600);
  });

  it('adds to an existing page below what is there, not on top of it', () => {
    const p = fixture();
    p.artboards[0].children.push(createNode('rect', { name: 'Block', x: 48, y: 120, width: 300, height: 200 }));
    const r = compileBlueprint(p, { pages: [{ name: 'page 1', elements: [{ type: 'text', text: 'More words.' }] }] });
    const added = page(r.project, 'Page 1').children.find((n) => n.name === 'Added content')!;
    expect(added.y).toBeGreaterThanOrEqual(320);
  });
});

describe('questions of every kind', () => {
  const one = (el: Record<string, unknown>) => compileBlueprint(fixture(), { pages: [{ name: 'Q', elements: [{ type: 'question', ...el }] }] });
  const frameOf = (r: ReturnType<typeof one>) => layers(r.project, 'Q').find((n) => n.type === 'frame' && (n as FrameNode).question) as FrameNode;

  it('true or false', () => {
    const r = one({ kind: 'truefalse', prompt: 'The Pacific is the largest ocean.', answer: true });
    expect(r.problems).toEqual([]);
    expect(frameOf(r).question!.options).toEqual([{ id: 'o1', text: 'True', correct: true }, { id: 'o2', text: 'False' }]);
  });

  it('fill in the blanks, put in order, drag to match and sort into groups', () => {
    let r = one({ kind: 'fill-in-the-blanks', prompt: 'Complete.', blanks: [{ label: 'The capital of France is', answers: ['Paris'] }] });
    expect(r.problems).toEqual([]);
    expect(frameOf(r).question!.blanks[0].answers).toEqual(['Paris']);

    r = one({ kind: 'order', prompt: 'Put in order.', items: ['Boil', 'Pour', 'Drink'] });
    expect(frameOf(r).question!.kind).toBe('ordering');
    expect(frameOf(r).question!.options.map((o) => o.text)).toEqual(['Boil', 'Pour', 'Drink']);

    r = one({ kind: 'matching', prompt: 'Match.', pairs: [{ term: 'Australia', match: 'Canberra' }, { term: 'Canada', match: 'Ottawa' }] });
    expect(r.problems).toEqual([]);
    expect(frameOf(r).question!.pairs).toHaveLength(2);

    r = one({ kind: 'categorise', prompt: 'Sort.', groups: ['Renewable', 'Non-renewable'], cards: [{ text: 'Solar', group: 'Renewable' }, { text: 'Coal', group: 'non-renewable' }] });
    expect(r.problems).toEqual([]);
    expect(frameOf(r).question!.cards!.map((c) => c.group)).toEqual(['g1', 'g2']);
  });

  it('says what is wrong when the answers do not add up, and turns a one-answer question with two right answers into tick-all', () => {
    let r = one({ kind: 'single', prompt: 'x', options: ['a', 'b'] });
    expect(r.problems.join(' ')).toMatch(/no option is marked correct/);
    r = one({ kind: 'single', prompt: 'x', options: [{ text: 'a', correct: true }, { text: 'b', correct: true }] });
    expect(r.problems).toEqual([]);
    expect(frameOf(r).question!.kind).toBe('multiple');
    expect(r.warnings.join(' ')).toMatch(/more than one right answer/);
    r = one({ kind: 'matching', prompt: 'x', pairs: [{ term: 'a', match: 'b' }] });
    expect(r.problems.join(' ')).toMatch(/at least two pairs/);
  });
});

describe('what things do', () => {
  it('reads a button\'s sentence with Describe it: counting, showing, saying', () => {
    const r = compileBlueprint(fixture(), {
      variables: [{ name: 'score', type: 'number' }],
      pages: [{ name: 'Page 1', elements: [{ type: 'text', name: 'Hint', text: 'Look at the clouds.' }, { type: 'button', name: 'Add one', label: 'Add one', does: ['when clicked, add 1 to score', 'show Hint', 'say well done'] }] }],
    });
    expect(r.problems).toEqual([]);
    expect(r.project.variables.map((v) => v.name)).toEqual(['score']);
    const kinds = page(r.project, 'Page 1').logic.nodes.map((n) => n.kind);
    expect(kinds).toEqual(expect.arrayContaining(['event.pointer', 'action.setVariable', 'action.visibility', 'action.announce']));
    //the thing it shows starts hidden
    expect((all(r.project, 'Hint')[0] as SceneNode).visible).toBe(false);
  });

  it('attaches a behaviour to a layer that is already there, by name', () => {
    const p = fixture();
    p.artboards[0].children.push(createNode('button', { name: 'Go', label: 'Go' }));
    p.artboards.push(createArtboard({ name: 'Results' }));
    const r = compileBlueprint(p, { behaviours: [{ on: 'go', page: 'Page 1', does: 'when clicked go to the Results page' }] });
    expect(r.problems).toEqual([]);
    expect(page(r.project, 'Page 1').logic.nodes.some((n) => n.kind === 'action.artboard')).toBe(true);
  });

  it('reports a sentence it cannot read, a page that is not there and a layer that is not there', () => {
    const r = compileBlueprint(fixture(), { pages: [{ name: 'Page 1', elements: [{ type: 'button', name: 'B', label: 'B', does: 'go to the page called Nowhere' }, { type: 'button', name: 'C', label: 'C', does: 'make everything glitter' }] }], behaviours: [{ on: 'Ghost', does: 'go to the next page' }] });
    expect(r.problems.some((x) => /Nowhere/.test(x))).toBe(true);
    expect(r.problems.some((x) => /make everything glitter/.test(x))).toBe(true);
    expect(r.problems.some((x) => /no layer called "Ghost"/.test(x))).toBe(true);
    //nothing half written was left in the graph
    expect(page(r.project, 'Page 1').logic.nodes).toEqual([]);
  });
});

describe('pages, pictures and raw changes', () => {
  it('renames a page and puts a new one after a named page', () => {
    const p = fixture();
    p.artboards.push(createArtboard({ name: 'Last' }));
    const r = compileBlueprint(p, { pages: [{ name: 'Page 1', rename: 'Start' }, { name: 'Middle', after: 'Start' }] });
    expect(r.project.artboards.map((a) => a.name)).toEqual(['Start', 'Middle', 'Last']);
  });

  it('makes a picture placeholder with its alt text, a list and a shape', () => {
    const r = compileBlueprint(fixture(), { pages: [{ name: 'Gallery', elements: [{ type: 'image', alt: 'A river running to the sea' }, { type: 'list', items: ['Evaporation', 'Condensation'] }, { type: 'shape', shape: 'ellipse', w: 80, h: 80 }] }] });
    expect(r.problems).toEqual([]);
    const pic = layers(r.project, 'Gallery').find((n) => (n as { ariaLabel?: string }).ariaLabel === 'A river running to the sea')!;
    expect(pic.type).toBe('rect');
    expect((pic as unknown as { role: string }).role).toBe('image');
    expect(layers(r.project, 'Gallery').some((n) => n.type === 'text' && (n as unknown as { text: string }).text === '• Evaporation\n• Condensation')).toBe(true);
    expect(layers(r.project, 'Gallery').some((n) => n.type === 'ellipse')).toBe(true);
  });

  it('puts a layer with its own x and y on the page instead of in the column', () => {
    const r = compileBlueprint(fixture(), { pages: [{ name: 'Free', elements: [{ type: 'text', text: 'Corner', x: 700, y: 500 }] }] });
    const t = page(r.project, 'Free').children.find((n) => (n as unknown as { text?: string }).text === 'Corner')!;
    expect([t.x, t.y]).toEqual([700, 500]);
  });

  it('runs raw changes last through the edit tool\'s writer, with $refs for layers made above', () => {
    const seen: unknown[] = [];
    const r = compileBlueprint(fixture(), { pages: [{ name: 'Raw', elements: [{ type: 'text', ref: 'words', text: 'x' }] }], raw: [{ op: 'set_props', id: '$words', props: { opacity: 0.5 } }] }, {
      applyRaw: (p, changes) => {
        seen.push(changes);
        return { project: p, created: { extra: 'e1' } };
      },
    });
    expect(JSON.stringify(seen)).toContain(r.created.words);
    expect(r.created.extra).toBe('e1');
  });

  it('turns away types and shapes of thing it does not know', () => {
    const r = compileBlueprint(fixture(), { pages: [{ name: 'X', elements: [{ type: 'hologram' }] }] });
    expect(r.problems.join(' ')).toMatch(/hologram/);
  });

  it('takes out half-made wiring and clips what is huge', () => {
    const r = compileBlueprint(createProject('Empty'), { pages: Array.from({ length: 30 }, (_, i) => ({ name: `P${i}`, elements: [{ type: 'text', text: 'x'.repeat(5000) }] })) });
    expect(r.project.artboards.length).toBe(1 + 12);
    expect((all(r.project, 'Text')[0] as unknown as { text: string }).text.length).toBe(2000);
  });
});
