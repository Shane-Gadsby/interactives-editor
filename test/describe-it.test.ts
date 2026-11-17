//"Describe it": plain sentences read into a recipe, a trigger and answers for the behaviour dialog, matched against the open project.
import { describe, expect, it } from 'vitest';
import { createArtboard, createNode, createProject, type Artboard, type Project } from 'interactives-player';
import { describeIt, looksLikeSentence, type Described } from '../src/lib/describe-it';
import { RECIPE_BY_ID, THIS_LAYER, buildBehaviour, incomplete, triggerIncomplete } from '../src/lib/recipes';

function fixture() {
  const p = createProject('T');
  const home = p.artboards[0];
  home.name = 'Welcome';
  const start = createNode('button', { name: 'Start button', x: 10, y: 10, width: 100, height: 40 } as never);
  const hint = createNode('rect', { name: 'Hint', x: 10, y: 100, width: 100, height: 40, visible: false });
  const a = createNode('rect', { name: 'Panel A', x: 10, y: 150, width: 100, height: 40 });
  const b = createNode('rect', { name: 'Panel B', x: 10, y: 200, width: 100, height: 40 });
  const c = createNode('rect', { name: 'Panel C', x: 10, y: 250, width: 100, height: 40 });
  const words = createNode('text', { name: 'Words', x: 10, y: 300, width: 100, height: 40 });
  const film = createNode('video', { name: 'Intro film', x: 200, y: 10, width: 320, height: 180 } as never);
  const bin = createNode('rect', { name: 'Bin', x: 400, y: 300, width: 80, height: 80 });
  (bin as unknown as { dropZone: unknown }).dropZone = { accepts: [] };
  home.children.push(start, hint, a, b, c, words, film, bin);
  const results = createArtboard({ name: 'Results' });
  const quiz = createArtboard({ name: 'Quiz' });
  const third = createArtboard({ name: 'Summary page' });
  p.artboards.push(results, quiz, third);
  p.settings.startArtboardId = home.id;
  home.timelines.push({ id: 'tl1', name: 'Intro', duration: 500, tracks: [], loop: false } as unknown as Artboard['timelines'][number]);
  p.assets.push(
    { id: 'snd1', name: 'Click sound', mime: 'audio/mpeg', size: 1, src: 'data:audio/mpeg;base64,AA==' } as unknown as Project['assets'][number],
    { id: 'snd2', name: 'Applause', mime: 'audio/mpeg', size: 1, src: 'data:audio/mpeg;base64,AA==' } as unknown as Project['assets'][number],
  );
  p.variables.push(
    { id: 'vs', name: 'score', type: 'number', initial: 0 },
    { id: 'vl', name: 'lives', type: 'number', initial: 3 },
    { id: 'vo', name: 'soundOn', type: 'boolean', initial: true },
    { id: 'vm', name: 'message', type: 'string', initial: '' },
    { id: 'vd', name: 'mode', type: 'enum', initial: 'easy', options: ['easy', 'hard'] },
  );
  return { p, home, start, hint, a, b, c, words, film, bin, results, quiz, third };
}
type Fx = ReturnType<typeof fixture>;

const read = (f: Fx, sentence: string, layer: string = f.start.id): Described | null => describeIt(sentence, f.p, f.home, layer);
const must = (f: Fx, sentence: string, layer?: string): Described => {
  const d = read(f, sentence, layer);
  expect(d, sentence).not.toBeNull();
  return d!;
};

describe('the pages', () => {
  it('reads "make this go to the results page" as Go to a page, Results', () => {
    const f = fixture();
    const d = must(f, 'make this go to the results page');
    expect(d.recipe).toBe('page-pick');
    expect(d.trigger).toBe('click');
    expect(d.answers.page).toBe(f.results.id);
    expect(d.missing).toEqual([]);
    expect(d.sentence).toMatch(/^When clicked: /);
  });

  it.each([
    ['go to the next page', 'page-next'],
    ['next page', 'page-next'],
    ['continue', 'page-next'],
    ['go back', 'page-previous'],
    ['go to the previous page', 'page-previous'],
    ['move to the next slide', 'page-next'],
  ])('%s is %s', (words, recipe) => {
    expect(must(fixture(), words).recipe).toBe(recipe);
  });

  it('finds a page by number, by a short name, and by the start and end', () => {
    const f = fixture();
    expect(must(f, 'go to page 3').answers.page).toBe(f.quiz.id);
    expect(must(f, 'jump to the summary').answers.page).toBe(f.third.id);
    expect(must(f, 'go to the last page').answers.page).toBe(f.third.id);
    expect(must(f, 'show the quiz page').answers.page).toBe(f.quiz.id);
    const back = must(f, 'go back to the start', f.start.id);
    expect(back.recipe).toBe('page-pick');
    //the start page is this one: there is nothing else to go to, so the choice is left for the person
    expect(back.missing.length).toBe(1);
  });

  it('forgives a plural and a small typo in a name', () => {
    const f = fixture();
    expect(must(f, 'go to the resutls page').answers.page).toBe(f.results.id);
    expect(must(f, 'go to the quizzes page').answers.page).toBe(f.quiz.id);
  });

  it('says what it could not find and leaves the choice for the person', () => {
    const f = fixture();
    const d = must(f, 'go to the finale page');
    expect(d.recipe).toBe('page-pick');
    expect(d.missing).toEqual(['a page called “finale page”']);
    expect(incomplete(RECIPE_BY_ID[d.recipe], d.answers, f.p, f.home)).toBeNull();
  });

  it('takes a transition from the sentence', () => {
    const f = fixture();
    expect(must(f, 'go to the next page with a zoom transition').answers.transition).toBe('zoom');
    expect(must(f, 'go to the results page with a fade').answers.transition).toBe('fade');
  });
});

describe('layers', () => {
  it('shows, hides and toggles a named layer', () => {
    const f = fixture();
    expect(must(f, 'show the hint')).toMatchObject({ recipe: 'show', answers: { layer: f.hint.id } });
    expect(must(f, 'hide the hint')).toMatchObject({ recipe: 'hide', answers: { layer: f.hint.id } });
    expect(must(f, 'toggle the hint')).toMatchObject({ recipe: 'toggle', answers: { layer: f.hint.id } });
    expect(must(f, 'show or hide the hint')).toMatchObject({ recipe: 'toggle', answers: { layer: f.hint.id } });
    expect(must(f, 'make the hint appear')).toMatchObject({ recipe: 'show', answers: { layer: f.hint.id } });
    expect(must(f, 'get rid of the hint')).toMatchObject({ recipe: 'hide' });
    expect(must(f, 'hide this')).toMatchObject({ recipe: 'hide', answers: { layer: THIS_LAYER } });
  });

  it('reads "when clicked show the hint" with the trigger first and no comma', () => {
    const f = fixture();
    const d = must(f, 'when clicked show the hint');
    expect(d).toMatchObject({ trigger: 'click', recipe: 'show', answers: { layer: f.hint.id }, layerId: f.start.id });
  });

  it('shows only one of a set: this one, and the others of its kind', () => {
    const f = fixture();
    const d = must(f, 'show only panel b', f.start.id);
    expect(d.recipe).toBe('only-one');
    expect(d.answers.layer).toBe(f.b.id);
    //the other layers of its kind first (a rectangle: the other panels, the hint and the bin)
    expect(d.answers.set?.split('|').sort()).toEqual([f.a.id, f.c.id, f.hint.id, f.bin.id].sort());
    const here = must(f, 'show only this one', f.a.id);
    expect(here.answers.layer).toBe(THIS_LAYER);
    expect(here.answers.set?.split('|')).not.toContain(f.a.id);
    expect(here.answers.set?.split('|')).toContain(f.b.id);
  });

  it('shows another layer and hides the rest by saying so', () => {
    const f = fixture();
    expect(must(f, 'show panel a and hide the others').recipe).toBe('only-one');
  });

  it('opens a page when the thing shown is a page', () => {
    const f = fixture();
    expect(must(f, 'show the results page')).toMatchObject({ recipe: 'page-pick', answers: { page: f.results.id } });
  });

  it('changes the colour, the text, the opacity and the size', () => {
    const f = fixture();
    expect(must(f, 'make this red')).toMatchObject({ recipe: 'look', answers: { what: 'colour', colour: '#e53935', layer: THIS_LAYER } });
    expect(must(f, 'turn the hint blue')).toMatchObject({ recipe: 'look', answers: { what: 'colour', layer: f.hint.id } });
    expect(must(f, 'change the colour to #ff8800')).toMatchObject({ recipe: 'look', answers: { what: 'colour', colour: '#ff8800' } });
    expect(must(f, 'change the text to "Well done"')).toMatchObject({ recipe: 'look', answers: { what: 'text', words: 'Well done' } });
    expect(must(f, 'change the text of words to Hello there')).toMatchObject({ recipe: 'look', answers: { what: 'text', words: 'Hello there', layer: f.words.id } });
    expect(must(f, 'make this say Go')).toMatchObject({ recipe: 'look', answers: { what: 'text', words: 'Go' } });
    expect(must(f, 'fade this to 50%')).toMatchObject({ recipe: 'look', answers: { what: 'opacity', percent: '50' } });
    expect(must(f, 'fade out the hint')).toMatchObject({ recipe: 'look', answers: { what: 'opacity', percent: '0', layer: f.hint.id } });
    expect(must(f, 'make this 200 wide')).toMatchObject({ recipe: 'look', answers: { what: 'size', width: '200' } });
    expect(must(f, 'set the height to 80')).toMatchObject({ recipe: 'look', answers: { what: 'size', height: '80' } });
  });

  it('moves the view', () => {
    const f = fixture();
    expect(must(f, 'zoom to the hint')).toMatchObject({ recipe: 'view-layer', answers: { layer: f.hint.id } });
    expect(must(f, 'show the whole page again').recipe).toBe('view-page');
  });
});

describe('sound, music, animation and video', () => {
  it('plays a sound, by name or the first', () => {
    const f = fixture();
    expect(must(f, 'play a sound when this is clicked')).toMatchObject({ recipe: 'sound', trigger: 'click', answers: { sound: 'snd1' } });
    expect(must(f, 'play the applause sound')).toMatchObject({ recipe: 'sound', answers: { sound: 'snd2' } });
    expect(must(f, 'play applause')).toMatchObject({ recipe: 'sound', answers: { sound: 'snd2' } });
    expect(must(f, 'play the fanfare sound').missing).toEqual(['a sound called “fanfare”']);
  });

  it('starts and stops music, and mutes', () => {
    const f = fixture();
    f.p.variables = [];
    expect(must(f, 'play some music').recipe).toBe('soundtrack');
    expect(must(f, 'stop the music').recipe).toBe('soundtrack-stop');
    expect(must(f, 'mute the sound').recipe).toBe('sound-toggle');
    expect(must(f, 'turn the sound off').recipe).toBe('sound-toggle');
  });

  it('plays an animation', () => {
    const f = fixture();
    expect(must(f, 'play the intro animation')).toMatchObject({ recipe: 'animation', answers: { timeline: 'tl1' } });
    expect(must(f, 'play intro')).toMatchObject({ recipe: 'animation', answers: { timeline: 'tl1' } });
    expect(must(f, 'play the zoom animation').missing).toEqual(['an animation called “zoom”']);
  });

  it('plays, pauses and jumps a video', () => {
    const f = fixture();
    expect(must(f, 'pause the video')).toMatchObject({ recipe: 'video-toggle' });
    expect(must(f, 'play the intro film')).toMatchObject({ recipe: 'video-toggle', answers: { video: f.film.id } });
    expect(must(f, 'jump the video to 1:30')).toMatchObject({ recipe: 'video-seek', answers: { seconds: '90' } });
  });
});

describe('numbers and switches', () => {
  it('adds, takes away, sets and counts', () => {
    const f = fixture();
    expect(must(f, 'add 1 to score')).toMatchObject({ recipe: 'counter', answers: { counter: 'vs', numhow: 'add', amount: '1' } });
    expect(must(f, 'add 5 points to the score')).toMatchObject({ answers: { counter: 'vs', amount: '5' } });
    expect(must(f, 'add three points')).toMatchObject({ answers: { counter: 'vs', amount: '3' } });
    expect(must(f, 'take 2 off lives')).toMatchObject({ answers: { counter: 'vl', numhow: 'subtract', amount: '2' } });
    expect(must(f, 'lose 1 life')).toMatchObject({ answers: { counter: 'vl', numhow: 'subtract', amount: '1' } });
    expect(must(f, 'increase the score by 10')).toMatchObject({ answers: { counter: 'vs', numhow: 'add', amount: '10' } });
    expect(must(f, 'decrease lives')).toMatchObject({ answers: { counter: 'vl', numhow: 'subtract', amount: '1' } });
    expect(must(f, 'set score to 0')).toMatchObject({ answers: { counter: 'vs', numhow: 'set', amount: '0' } });
    expect(must(f, 'count the clicks')).toMatchObject({ answers: { counter: 'new:clicks', numhow: 'add' } });
  });

  it('makes a new number when there is none by that name', () => {
    const f = fixture();
    f.p.variables = [];
    expect(must(f, 'add 1 to bonus').answers.counter).toBe('new:bonus');
    expect(must(f, 'add 4 points').answers.counter).toBe('new:score');
  });

  it('sets a text, a choice and a switch', () => {
    const f = fixture();
    expect(must(f, 'set message to "Well done"')).toMatchObject({ recipe: 'text-set', answers: { textvar: 'vm', textvalue: 'Well done' } });
    expect(must(f, 'set the mode to hard')).toMatchObject({ recipe: 'text-set', answers: { textvar: 'vd', textvalue: 'hard' } });
    expect(must(f, 'turn sound on')).toMatchObject({ recipe: 'switch', answers: { how: 'on' } });
    expect(must(f, 'switch sound on')).toMatchObject({ recipe: 'switch', answers: { switch: 'vo', how: 'on' } });
    expect(must(f, 'toggle the soundOn switch')).toMatchObject({ recipe: 'switch', answers: { switch: 'vo', how: 'flip' } });
    expect(must(f, 'turn dark mode on')).toMatchObject({ recipe: 'switch', answers: { switch: 'new:darkMode', how: 'on' } });
  });

  it('resets values and starts over', () => {
    const f = fixture();
    expect(must(f, 'reset the score')).toMatchObject({ recipe: 'reset', answers: { vars: 'vs' } });
    expect(must(f, 'reset score and lives').answers.vars?.split('|').sort()).toEqual(['vl', 'vs']);
    expect(must(f, 'start over').recipe).toBe('start-over');
  });

  it('goes round a set of items', () => {
    const f = fixture();
    expect(must(f, 'go to the next picture').recipe).toBe('item-next');
    expect(must(f, 'previous card').recipe).toBe('item-previous');
  });
});

describe('triggers', () => {
  it.each([
    ['when I hover over this show the hint', 'pointerenter', 'show'],
    ['show the hint when hovered', 'pointerenter', 'show'],
    ['when the page opens play a sound', 'start', 'sound'],
    ['as soon as the page is shown play the intro animation', 'start', 'animation'],
    ['when this is clicked show the hint', 'click', 'show'],
    ['when the learner clicks this, add 1 to score', 'click', 'counter'],
    ['show the hint on click', 'click', 'show'],
  ])('%s', (words, trigger, recipe) => {
    const d = must(fixture(), words);
    expect(d.trigger).toBe(trigger);
    expect(d.recipe).toBe(recipe);
  });

  it.each([
    ['every time this is clicked add 1 to the score', 'counter'],
    ['each click adds 1 to score', 'counter'],
    ['click to reveal the hint', 'show'],
    ['on click go to the next page', 'page-next'],
    ['when hovered fade the hint to 20%', 'look'],
    ['tell the learner well done when clicked', 'announce'],
  ])('%s', (words, recipe) => {
    expect(must(fixture(), words).recipe).toBe(recipe);
  });

  it('leaves out a "when" it does not know, and says so', () => {
    const d = must(fixture(), 'go to the results page when the quiz is done');
    expect(d.recipe).toBe('page-pick');
    expect(d.missing).toEqual([]);
    expect(d.ignored).toEqual(['when the quiz is done']);
  });

  it('reads a delay', () => {
    const f = fixture();
    expect(must(f, 'after 5 seconds go to the next page')).toMatchObject({ trigger: 'timer', when: { delay: '5' }, recipe: 'page-next' });
    expect(must(f, 'go to the results page after two seconds')).toMatchObject({ trigger: 'timer', when: { delay: '2' }, recipe: 'page-pick' });
    expect(must(f, 'after 1 minute show the hint').when.delay).toBe('60');
  });

  it('reads a key', () => {
    const f = fixture();
    expect(must(f, 'when I press space go to the next page')).toMatchObject({ trigger: 'key', when: { key: 'Space' }, recipe: 'page-next' });
    expect(must(f, 'when the right arrow key is pressed show the hint').when.key).toBe('ArrowRight');
    expect(must(f, 'when i press a add 1 to score').when.key).toBe('a');
  });

  it('reads a value reaching something', () => {
    const f = fixture();
    expect(must(f, 'when score reaches 10 go to the results page')).toMatchObject({ trigger: 'value', when: { watch: 'vs', reachop: 'atleast', reachto: '10' }, recipe: 'page-pick' });
    expect(must(f, 'when lives is 0 go to the results page').when).toMatchObject({ watch: 'vl', reachop: 'is', reachto: '0' });
    expect(must(f, 'when sound is off show the hint').when).toMatchObject({ watch: 'vo', reachop: 'false' });
  });

  it('reads a drop and a video time', () => {
    const f = fixture();
    expect(must(f, 'when this is dropped on the bin add 1 to score')).toMatchObject({ trigger: 'drop', when: { zone: f.bin.id }, recipe: 'counter' });
    expect(must(f, 'when the video reaches 10 seconds show the hint')).toMatchObject({ trigger: 'video', when: { cuetime: '10' } });
  });

  it('takes the layer from the sentence when it names one', () => {
    const f = fixture();
    expect(must(f, 'when the start button is clicked show the hint', f.words.id).layerId).toBe(f.start.id);
    expect(must(f, 'when the nonesuch is clicked show the hint').missing).toEqual(['a layer called “nonesuch”']);
  });
});

describe('more than one thing, only if, otherwise', () => {
  it('reads then also steps', () => {
    const f = fixture();
    const d = must(f, 'play a sound and add 1 to score');
    expect(d.recipe).toBe('sound');
    expect(d.then.map((s) => s.recipe)).toEqual(['counter']);
    const e = must(f, 'show the hint, then play the applause sound, then go to the next page');
    expect([e.recipe, ...e.then.map((s) => s.recipe)]).toEqual(['show', 'sound', 'page-next']);
  });

  it('does not split a name or a quotation on "and" or a comma', () => {
    const f = fixture();
    f.hint.name = 'Questions and answers';
    expect(must(f, 'show questions and answers').answers.layer).toBe(f.hint.id);
    expect(must(f, 'say "Correct, well done and thank you"').answers.words).toBe('Correct, well done and thank you');
  });

  it('reads only if, in both orders', () => {
    const f = fixture();
    const a = must(f, 'show the hint only if score is at least 3');
    expect(a.only).toBe('score >= 3');
    expect(a.recipe).toBe('show');
    const b = must(f, 'if lives is 0 go to the results page');
    expect(b.only).toBe('lives == 0');
    expect(b.recipe).toBe('page-pick');
    expect(must(f, 'show the hint if sound is on').only).toBe('soundOn');
    expect(must(f, 'show the hint if score > 5 and lives >= 1').only).toBe('score > 5 && lives >= 1');
  });

  it('reads otherwise', () => {
    const f = fixture();
    const d = must(f, 'if score is at least 3 go to the results page, otherwise play a sound');
    expect(d.only).toBe('score >= 3');
    expect(d.recipe).toBe('page-pick');
    expect(d.otherwise?.recipe).toBe('sound');
    const e = must(f, 'go to the next page only if score is at least 3 else show the hint');
    expect(e.otherwise?.recipe).toBe('show');
  });

  it('keeps going when a condition cannot be read, and says so', () => {
    const f = fixture();
    const d = must(f, 'show the hint if it is a sunny day');
    expect(d.only).toBe('');
    expect(d.ignored.join(' ')).toMatch(/sunny day/);
  });

  it('keeps the parts it did not understand', () => {
    const f = fixture();
    const d = must(f, 'show the hint and sing a song to the moon');
    expect(d.recipe).toBe('show');
    expect(d.ignored).toEqual(['sing a song to the moon']);
  });
});

describe('words, links and scripts', () => {
  it('says something to a screen reader', () => {
    const f = fixture();
    expect(must(f, 'say "Correct"').answers.words).toBe('Correct');
    expect(must(f, 'tell screen readers well done').answers.words).toBe('well done');
  });

  it('opens a link', () => {
    const f = fixture();
    expect(must(f, 'open https://example.com/help').answers.link).toBe('https://example.com/help');
    expect(must(f, 'open example.com').answers.link).toBe('https://example.com');
  });

  it('runs a script it knows', () => {
    const f = fixture();
    f.p.scripts.push({ id: 's1', name: 'shuffle', code: '', runOnStart: false });
    expect(must(f, 'run the shuffle script')).toMatchObject({ recipe: 'script', answers: { script: 's1' } });
  });
});

describe('what it will not claim', () => {
  it.each(['hello', 'what a lovely day it is', 'tell me a story about a dragon', 'when clicked', 'blah blah blah blah'])('%s is not a behaviour', (words) => {
    expect(read(fixture(), words)).toBeNull();
  });

  it('three words or more is a sentence', () => {
    expect(looksLikeSentence('go to page')).toBe(true);
    expect(looksLikeSentence('grid')).toBe(false);
    expect(looksLikeSentence('add a button')).toBe(true);
  });

  it('leaves an empty sentence alone', () => {
    expect(read(fixture(), '   ')).toBeNull();
  });
});

//Whatever it reads has to be something the dialog can add: complete answers that build into ordinary nodes
const PHRASES = [
  'make this go to the results page',
  'when clicked show the hint',
  'play a sound when this is clicked',
  'add 1 to score',
  'show only this one',
  'after 5 seconds go to the next page',
  'hide the hint',
  'toggle the hint',
  'make this red',
  'change the text to "Hello"',
  'fade this to 50%',
  'play some music',
  'stop the music',
  'mute the sound',
  'play the intro animation',
  'pause the video',
  'jump the video to 30 seconds',
  'take 2 off lives',
  'set score to 10',
  'set message to hi',
  'turn sound on',
  'reset score and lives',
  'start over',
  'say "Correct"',
  'open https://example.com',
  'when score reaches 10 go to the results page',
  'when I press space show the hint',
  'when the page opens play a sound',
  'when I hover over this show the hint',
  'when this is dropped on the bin add 1 to score',
  'when the video reaches 10 seconds show the hint',
  'show the hint only if score is at least 3',
  'if score is at least 3 go to the results page, otherwise play a sound',
  'play a sound and add 1 to score',
  'go to the next picture',
];

describe('every phrasing builds', () => {
  it.each(PHRASES)('%s', (words) => {
    const f = fixture();
    const d = must(f, words);
    const ctx = { project: f.p, ab: f.home, layerId: d.layerId };
    expect(d.layerId).toBe(f.start.id);
    expect(incomplete(RECIPE_BY_ID[d.recipe], d.answers, f.p, f.home), 'recipe').toBeNull();
    expect(triggerIncomplete(d.trigger, d.when, f.p, f.home), 'trigger').toBeNull();
    for (const s of d.then) expect(incomplete(RECIPE_BY_ID[s.recipe], s.answers, f.p, f.home), s.recipe).toBeNull();
    if (d.otherwise) expect(incomplete(RECIPE_BY_ID[d.otherwise.recipe], d.otherwise.answers, f.p, f.home)).toBeNull();
    const b = buildBehaviour(ctx, d.recipe, d.trigger, d.answers, undefined, { when: d.when, then: d.then, only: d.only, otherwise: d.otherwise });
    expect(b.nodes.length).toBeGreaterThanOrEqual(2);
    expect(d.sentence).toBe(b.sentence);
  });
});
