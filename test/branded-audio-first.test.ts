//The Audio-first quiz starter, played for real with a stand-in voice: it reads the question and its options, takes the keys 1 to 4
//(and taps), speaks Correct or Not quite with the explanation, moves on by hand, repeats, slows, hints and pauses, speaks the score
//and goes through the missed questions again; and with no voice, or with spoken prompts off, it is a plain keyboard quiz.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, type Artboard, type FrameNode, type Project } from 'interactives-player';
import { STARTERS } from '../src/lib/branded/sets/assessment';
import { COLOURWAYS } from '../src/lib/branded/looks';
import { byName } from '../src/lib/branded/kit';
import { partsOf, questionFrames, setQuestionSettings } from '../src/lib/question-kit';
import { projectFromBrandedStarter } from '../src/lib/branded';

const flush = (ms = 8) => new Promise((r) => setTimeout(r, ms));
const starter = STARTERS.find((s) => s.key === 'assessment/audio-first-quiz')!;

class Utter {
  voice: unknown = null;
  lang = '';
  rate = 1;
  volume = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

interface Voice {
  spoken: { text: string; rate: number }[];
  voices: { name: string; lang: string; localService: boolean }[];
  /** Pieces held until the test finishes them (so speech can be paused mid-way); otherwise each ends at once. */
  hold: boolean;
  held: Utter[];
  cancels: number;
}

describe('the Audio-first quiz', () => {
  let v: Voice;
  const made: Player[] = [];
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:1024px;height:640px"></div>';
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0) as unknown as number);
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
    localStorage.clear();
    marked = 0;
    v = { spoken: [], voices: [{ name: 'Local', lang: 'en-GB', localService: true }], hold: false, held: [], cancels: 0 };
    vi.stubGlobal('SpeechSynthesisUtterance', Utter);
    vi.stubGlobal('speechSynthesis', {
      getVoices: () => v.voices,
      speak: (u: Utter) => {
        v.spoken.push({ text: u.text, rate: u.rate });
        if (v.hold) v.held.push(u);
        else setTimeout(() => u.onend?.(), 0);
      },
      cancel: () => {
        v.cancels++;
        v.held.splice(0);
      },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
  });
  afterEach(() => {
    for (const p of made.splice(0)) p.destroy?.();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const build = () => starter.build(COLOURWAYS[0]).project;
  const idOf = (ab: Artboard, name: string) => byName(ab, name)!.id;
  const el = (id: string) => document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`);
  const click = async (id: string) => {
    el(id)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
  };
  const press = async (key: string, code = key) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true }));
    await flush();
  };
  //A reading goes out in sentence-sized pieces, so what was said since the last mark is the pieces joined
  let marked = 0;
  const mark = () => void (marked = v.spoken.length);
  const heard = () => v.spoken.slice(marked).map((s) => s.text).join(' ');

  const start = async (project: Project = build()) => {
    document.getElementById('stage')!.innerHTML = '';
    const player = new Player(document.getElementById('stage')!, JSON.parse(JSON.stringify(project)), { loadData: false });
    made.push(player);
    await flush();
    await click(idOf(project.artboards[0], 'Start button'));
    return { player, project };
  };

  const frame = () => questionFrames(build().artboards[1])[0];
  void frame;
  const pos = (p: Player) => (p.getVariable('q1_setPos') as number) - 1;

  it('does not speak until the learner presses Start, then says where it is and reads the question with its numbered options', async () => {
    const project = build();
    const player = new Player(document.getElementById('stage')!, JSON.parse(JSON.stringify(project)), { loadData: false });
    made.push(player);
    await flush();
    expect(v.spoken).toEqual([]);
    await click(idOf(project.artboards[0], 'Start button'));
    expect(heard()).toMatch(/^Question 1 of 6\./);
    expect(heard()).toMatch(/Which way of studying is usually best/);
    expect(heard()).toContain('2. Testing yourself from memory');
    expect(heard()).toContain('4. Copying your notes out neatly');
    expect(pos(player)).toBe(0);
  });

  it('reads the author\'s "spoken" text instead of the prompt', async () => {
    const { player } = await start();
    for (const k of ['2', 'n', '1']) await press(k);
    mark();
    await press('n');
    expect(pos(player)).toBe(2);
    expect(heard()).toMatch(/^Question 3 of 6\./);
    expect(heard()).toContain('How often should you take a short break when you study for a long time?');
    expect(heard()).not.toContain('How often should you take a short break in a long study session?');
  });

  it('a number key answers: spoken Correct with the explanation, the right answer marked, the score counted', async () => {
    const { player, project } = await start();
    await press('2');
    expect(player.getVariable('q1_answered')).toBe(true);
    expect(player.getVariable('q1_correct')).toBe(true);
    expect(player.getVariable('q1_setScore')).toBe(1);
    expect(heard()).toMatch(/Correct\. Trying to recall an idea from memory/);
    expect(el(partsOf(questionFrames(project.artboards[1])[0]).feedback[0].id)!.style.display).not.toBe('none');
    //a second key press does not change the answer
    await press('3');
    expect((player.getVariable('q1_items') as { selected: boolean }[]).findIndex((i) => i.selected)).toBe(1);
    expect(player.getVariable('q1_setScore')).toBe(1);
  });

  it('a wrong answer says Not quite, the answer and the explanation, and is kept for the review', async () => {
    const { player } = await start();
    await press('1');
    expect(player.getVariable('q1_correct')).toBe(false);
    expect(player.getVariable('q1_setScore')).toBe(0);
    expect(heard()).toMatch(/Not quite\. The answer was 2, Testing yourself from memory\. Trying to recall/);
    expect(player.getVariable('q1_missed')).toEqual([0]);
  });

  it('tapping an answer works the same as its key', async () => {
    const { player, project } = await start();
    await click(`${partsOf(questionFrames(project.artboards[1])[0]).option[0].id}~1`);
    expect(player.getVariable('q1_correct')).toBe(true);
  });

  it('keys beyond the options (a true or false question has two) do nothing', async () => {
    const { player } = await start();
    await press('2');
    await press('n');
    expect(pos(player)).toBe(1);
    await press('4');
    await press('3');
    expect(player.getVariable('q1_answered')).toBe(false);
    await press('1');
    expect(player.getVariable('q1_answered')).toBe(true);
  });

  it('N or Enter moves on only after an answer, speaking the next question; by hand unless a pace is set', async () => {
    const { player } = await start();
    await press('n');
    expect(pos(player)).toBe(0);
    await press('2');
    await flush(30);
    expect(pos(player)).toBe(0);
    mark();
    await press('Enter');
    expect(pos(player)).toBe(1);
    expect(player.getVariable('q1_answered')).toBe(false);
    expect(heard()).toMatch(/^Question 2 of 6\./);
    expect(heard()).toContain('True or false: spreading');
    expect(heard()).toContain('1. True 2. False');
  });

  it('R repeats the question, and the feedback once answered; S slows the voice and remembers it', async () => {
    const { player } = await start();
    mark();
    await press('r');
    expect(heard()).toMatch(/Which way of studying is usually best/);
    expect(heard()).toContain('2. Testing yourself from memory');
    await press('s');
    expect(player.api.speech.rate).toBe(0.75);
    await press('s');
    expect(player.api.speech.rate).toBe(0.75);
    expect(JSON.parse(localStorage.getItem('ix-viewer-captions')!).rate).toBe(0.75);
    await press('1');
    mark();
    await press('r');
    expect(heard()).toMatch(/^Not quite\./);
    expect(v.spoken[v.spoken.length - 1].rate).toBe(0.75);
  });

  it('H shows and speaks the hint once, and not after the answer', async () => {
    const { player, project } = await start();
    mark();
    await press('h');
    expect(player.getVariable('q1_hintsUsed')).toBe(1);
    expect(heard()).toBe('Hint. Think about which one makes your brain work the hardest.');
    mark();
    await press('h');
    expect(heard()).toBe('');
    expect(el(partsOf(questionFrames(project.artboards[1])[0]).hintText[0].id)!.style.display).not.toBe('none');
    await press('2');
    await press('n');
    expect(player.getVariable('q1_hintsUsed')).toBe(0);
    await press('2');
    mark();
    await press('h');
    expect(heard()).toBe('');
    expect(player.getVariable('q1_hintsUsed')).toBe(0);
  });

  it('Space pauses what is being said and carries on', async () => {
    v.hold = true;
    const { player } = await start();
    expect(player.api.speech.speaking).toBe(true);
    await press(' ', 'Space');
    expect(player.api.speech.paused).toBe(true);
    expect(player.api.speech.speaking).toBe(false);
    await press(' ', 'Space');
    expect(player.api.speech.speaking).toBe(true);
  });

  it('turning spoken prompts off stops the voice, stops further speech, and tells a screen reader instead', async () => {
    v.hold = true;
    const { player, project } = await start();
    const announced: string[] = [];
    player.on('announce', (a: { text: string }) => announced.push(a.text));
    await click(idOf(project.artboards[1], 'Spoken prompts button'));
    expect(player.getVariable('spokenOn')).toBe(false);
    expect(player.api.speech.speaking).toBe(false);
    mark();
    await press('2');
    await press('n');
    await press('r');
    expect(heard()).toBe('');
    expect(announced.some((t) => /^Correct\./.test(t))).toBe(true);
    expect(announced.some((t) => /^Question 2 of 6/.test(t))).toBe(true);
    //on again
    await click(idOf(project.artboards[1], 'Spoken prompts button'));
    expect(player.getVariable('spokenOn')).toBe(true);
  });

  it('the score page speaks the score and offers the missed questions again, which are then asked in turn', async () => {
    const { player, project } = await start();
    //the right answers are 2, 1, 2, 2, 2, 1: this gives right, wrong, right, wrong, right, wrong
    mark();
    for (const given of ['2', '2', '2', '1', '2', '2']) {
      await press(given);
      await press('n');
    }
    //the last Next went to the score page
    expect(player.getVariable('q1_setScore')).toBe(3);
    expect(player.getVariable('q1_missed')).toEqual([1, 3, 5]);
    expect(heard()).toMatch(/You got 3 of 6\. A good start\./);
    expect(heard()).toContain('You missed 3 questions. Press M to go through them again.');
    expect(el(idOf(project.artboards[2], 'Missed questions button'))!.style.display).not.toBe('none');
    mark();
    await press('m');
    expect(player.getVariable('q1_setCount')).toBe(3);
    expect(player.getVariable('q1_missed')).toEqual([]);
    expect(player.getVariable('q1_setScore')).toBe(0);
    expect(heard()).toMatch(/^Question 1 of 3\./);
    //the missed ones come in a shuffled order: answer whichever is showing, right
    const rows = player.getVariable('questions') as { correct: number }[];
    const at = () => player.getVariable('q1_bankIndex') as number;
    expect([1, 3, 5]).toContain(at());
    await press(String(rows[at()].correct));
    expect(player.getVariable('q1_setScore')).toBe(1);
    mark();
    await press('n');
    expect(heard()).toMatch(/^Question 2 of 3\./);
  });

  it('with no local voice it is an ordinary keyboard quiz: nothing is spoken, the spoken buttons hide, the feedback is announced', async () => {
    v.voices = [{ name: 'Cloud', lang: 'en-US', localService: false }];
    const project = build();
    const player = new Player(document.getElementById('stage')!, JSON.parse(JSON.stringify(project)), { loadData: false });
    made.push(player);
    const announced: string[] = [];
    player.on('announce', (a: { text: string }) => announced.push(a.text));
    await flush();
    await click(idOf(project.artboards[0], 'Start button'));
    expect(v.spoken).toEqual([]);
    expect(announced[0]).toMatch(/^Question 1 of 6\./);
    for (const name of ['Slower button', 'Pause button', 'Spoken prompts button']) expect(el(idOf(project.artboards[1], name))!.style.display, name).toBe('none');
    expect(el(partsOf(questionFrames(project.artboards[1])[0]).listen[0].id)!.style.display).toBe('none');
    await press('2');
    expect(player.getVariable('q1_correct')).toBe(true);
    expect(announced.some((t) => /^Correct\./.test(t))).toBe(true);
    await press('n');
    expect(pos(player)).toBe(1);
  });

  it('with a pace set, the next question comes after the feedback; a manual move on first is not followed by a second', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const project = build();
    project.variables.find((x) => x.name === 'pace')!.initial = 4;
    document.getElementById('stage')!.innerHTML = '';
    const player = new Player(document.getElementById('stage')!, JSON.parse(JSON.stringify(project)), { loadData: false });
    made.push(player);
    const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);
    await tick(20);
    el(idOf(project.artboards[0], 'Start button'))!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick(20);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', code: '2' }));
    await tick(20);
    expect(pos(player)).toBe(0);
    await tick(3000);
    expect(pos(player)).toBe(0);
    await tick(1500);
    expect(pos(player)).toBe(1);
    //answer, move on by hand, answer again: the first timer must not move the second question on early
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', code: '1' }));
    await tick(20);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', code: 'n' }));
    await tick(20);
    expect(pos(player)).toBe(2);
    await tick(2000);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', code: '2' }));
    await tick(20);
    await tick(2500);
    expect(pos(player)).toBe(2);
    await tick(2000);
    expect(pos(player)).toBe(3);
  });

  it('uses the native pieces: a question bank run, the number keys, Listen, shortcuts and the speak fallback, with no key node for them', () => {
    const project = build();
    const play = project.artboards[1];
    const q = questionFrames(play)[0].question!;
    expect(q).toMatchObject({ kind: 'single', numberKeys: true, listen: true, bank: { end: 'finish' } });
    const keys = play.logic.nodes.filter((n) => n.kind === 'event.key');
    //the number keys are the kit's any-key wire, and Enter is the one other
    expect(keys.map((n) => n.params.key).sort()).toEqual(['', 'Enter']);
    for (const name of ['Slower button', 'Pause button']) expect(byName(play, name)).toHaveProperty('shortcut');
    expect(partsOf(questionFrames(play)[0]).reset[0]).toMatchObject({ shortcut: 'n' });
    const speaks = project.artboards.flatMap((a) => a.logic.nodes).filter((n) => n.kind === 'action.speak' && ['text', 'question'].includes(String(n.params.op)));
    expect(speaks.length).toBeGreaterThan(3);
    for (const n of speaks) expect(n.params).toMatchObject({ fallback: 'announce', only: 'spokenOn' });
    expect(project.variables.map((x) => x.name)).not.toEqual(expect.arrayContaining(['pos', 'order', 'tally', 'hintShown']));
  });
});

describe('the audio-first quiz layout', () => {
  it('puts Repeat (R) in the card beside the prompt, a pill ahead of the Hint, and keeps it there through a sync', () => {
    const p = projectFromBrandedStarter(starter, COLOURWAYS[0]);
    const ab = p.artboards[1];
    const f = questionFrames(ab)[0];
    const parts = partsOf(f);
    const row = parts.promptRow[0] as FrameNode;
    expect(row.children.map((c) => c.questionPart)).toEqual(['prompt', 'listen', 'hint']);
    expect(parts.listen).toHaveLength(1);
    expect(parts.listen[0]).toMatchObject({ label: 'Repeat (R)', height: 32 });
    expect((parts.buttons[0] as FrameNode).children.some((c) => c.questionPart === 'listen')).toBe(false);
    //a settings change runs the sync, which must not make a second Listen in the buttons row
    setQuestionSettings(p, ab.id, f.id, { hintPenalty: 0 });
    expect(partsOf(f).listen).toHaveLength(1);
    setQuestionSettings(p, ab.id, f.id, { listen: false });
    expect(partsOf(f).listen ?? []).toHaveLength(0);
  });
});
