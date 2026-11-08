//The Spelling test starter: what it is made of, that its words are only in the answer key the server takes out, and that it plays
//through in the page (where it marks for itself, as Preview does) and shows the result.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, hostProgressStore, newQuestion, stepMarking, stripProject, type Artboard, type FrameNode, type MarkingKey, type MarkRequest, type Project, type ProgressStore, type StateMap } from 'interactives-player';
import { STARTERS } from '../src/lib/branded/sets/assessment';
import { COLOURWAYS } from '../src/lib/branded/looks';
import { byName } from '../src/lib/branded/kit';
import { makeIndependent, partsOf, questionFrames } from '../src/lib/question-kit';

const starter = STARTERS.find((s) => s.key === 'assessment/spelling-test')!;
const WORDS = ['colour', 'organise', 'neighbour', 'centre', 'necessary', 'separate'];
const flush = () => new Promise((r) => setTimeout(r, 8));
const quizScore = (p: Player) => (p as unknown as { quizNow(): { score: number } }).quizNow().score;

describe('the spelling test starter', () => {
  const { project } = starter.build(COLOURWAYS[0]);
  const frames = project.artboards.flatMap((ab) => questionFrames(ab));

  it('is in the assessment set with a description for the help', () => {
    expect(starter.name).toBe('Spelling test');
    expect(starter.description).toMatch(/server marks/);
    expect(starter.description).not.toMatch(/—/);
  });

  it('is six spelling blanks, marked on the server, one try each, with the retake rule on every one', () => {
    expect(project.artboards.filter((a) => !a.isMaster)).toHaveLength(8);
    expect(frames).toHaveLength(6);
    frames.forEach((f, i) => {
      expect(f.question).toMatchObject({ kind: 'blank', attempts: 1, partial: false, serverMarked: true, retake: { limit: 2, keep: 'best' }, prefix: `q${i + 1}` });
      expect(f.question!.blanks[0]).toMatchObject({ spelling: true, usSpelling: true, answers: [WORDS[i]] });
    });
  });

  it('has the word only in the answer key: the served page, with the answers taken out, says none of them', () => {
    const served = JSON.parse(JSON.stringify(project)) as Project;
    //a share carries no author notes, which are the one place a word like colour (the note colour) could turn up
    for (const ab of served.artboards) delete ab.notes;
    const key = stripProject(served, (f, r) => `${f}-${r}`);
    expect(Object.keys(key.questions)).toHaveLength(6);
    expect(key.skipped).toEqual([]);
    const page = JSON.stringify(served).toLowerCase();
    for (const w of WORDS) expect(page, w).not.toContain(w);
    //and the question is marked remotely by the page
    for (const f of questionFrames(served.artboards[1])) expect(f.question).toMatchObject({ answersOnServer: true, retake: { limit: 2 } });
  });

  it('gives each word box no browser help, and a Play the word button with a Play sound node waiting for the recording', () => {
    for (const ab of project.artboards.slice(1, 7)) {
      const input = partsOf(questionFrames(ab)[0]).blankInput[0];
      expect(input).toMatchObject({ type: 'input', noAssist: true });
      const play = byName(ab, 'Play word button')!;
      const click = ab.logic.nodes.find((n) => n.kind === 'event.pointer' && n.params.target === play.id)!;
      const sound = ab.logic.nodes.find((n) => n.kind === 'action.sound')!;
      expect(ab.logic.edges.some((e) => e.from === click.id && e.to === sound.id)).toBe(true);
      expect(sound.params.asset).toBe('');
    }
  });

  it('has a Retake that asks the server for the next round and starts over, and keeps what a word was when you come back to it', () => {
    for (const f of frames) expect(f.question).toMatchObject({ keep: true });
    const result = project.artboards[7];
    const retake = byName(result, 'Retake button')!;
    const click = result.logic.nodes.find((n) => n.kind === 'event.pointer' && n.params.target === retake.id)!;
    const reset = result.logic.nodes.find((n) => n.kind === 'action.questionReset')!;
    expect(reset.params).toMatchObject({ question: frames[0].id, retake: true });
    expect(result.logic.edges.some((e) => e.from === click.id && e.to === reset.id)).toBe(true);
    expect(result.logic.nodes.some((n) => n.kind === 'action.startOver')).toBe(true);
    expect(retake.bindings!.visible).toBe('q1_retakesLeft != 0');
  });

  it('says Submit answer, and Try again and Hint are each one project setting, off to begin with', () => {
    expect(project.variables.find((v) => v.name === 'allowTryAgain')).toMatchObject({ type: 'boolean', initial: false });
    expect(project.variables.find((v) => v.name === 'offerHint')).toMatchObject({ type: 'boolean', initial: false });
    frames.forEach((f, i) => {
      const parts = partsOf(f);
      expect(parts.check[0]).toMatchObject({ label: 'Submit answer' });
      expect(parts.reset[0].bindings!.visible).toBe(`allowTryAgain && q${i + 1}_locked && !q${i + 1}_correct`);
      expect(parts.hint[0].bindings!.visible).toBe(`offerHint && q${i + 1}_hintsLeft > 0 && !q${i + 1}_locked`);
      expect(f.question!.hints).toHaveLength(1);
      expect(f.question!.hints[0].toLowerCase()).not.toContain(WORDS[i]);
    });
  });

  it('puts the hint in a small pill at the top right of the card, opposite the prompt, on every word', () => {
    for (const f of frames) {
      const parts = partsOf(f);
      const row = parts.promptRow[0] as FrameNode;
      expect(row.children.map((c) => c.questionPart)).toEqual(['prompt', 'hint']);
      expect(f.children[0]).toBe(row);
      expect(parts.hint[0]).toMatchObject({ type: 'button', height: 32, cornerRadius: 16, width: 84 });
      expect(parts.hint[0].height).toBeLessThan(parts.check[0].height);
      //the pill is not in the row of full size buttons
      expect((parts.buttons[0] as FrameNode).children.some((c) => c.questionPart === 'hint')).toBe(false);
    }
  });

  it('keeps the options when the word page is copied (the copy is a new question that shares the layers\' wording)', () => {
    const copy = JSON.parse(JSON.stringify(project)) as Project;
    const ab = copy.artboards[1];
    const f = questionFrames(ab)[0];
    makeIndependent(copy, ab.id, f.id);
    expect(partsOf(f).hint[0].bindings!.visible).toMatch(/^offerHint && /);
    expect(partsOf(f).reset[0].bindings!.visible).toMatch(/^allowTryAgain && /);
    expect(partsOf(f).promptRow).toHaveLength(1);
  });

  it('has its Play the word button disabled and reading Playing... while a sound goes', () => {
    for (const ab of project.artboards.slice(1, 7)) {
      const play = byName(ab, 'Play word button')!;
      expect(play.bindings).toMatchObject({ disabled: 'soundPlaying()', label: 'soundPlaying() ? "Playing…" : "Play the word"' });
      expect(play.bindings!.ariaLabel).toMatch(/Playing word/);
    }
  });

  it('reports the total and the pass mark, and the pass mark matches the page\'s own', () => {
    const r = project.settings.reporting!;
    //the score is the total of the questions, so there is no total variable and no top score to keep in step
    expect(r).toMatchObject({ scoreFrom: 'questions', passMark: 80, completion: 'artboard', completionArtboard: project.artboards[7].id });
    expect(project.variables.map((v) => v.name)).not.toEqual(expect.arrayContaining(['total', 'outOf', 'passPercent']));
  });

  it('has the retake variables the result page reads', () => {
    for (const name of ['q1_round', 'q1_retakesLeft', 'q1_kept', 'q1_keptMax']) expect(project.variables.some((v) => v.name === name), name).toBe(true);
    expect(project.variables.find((v) => v.name === 'q1_retakesLeft')!.initial).toBe(2);
  });

  it('keeps the checklist honest about the audio, the retakes and the share', () => {
    const b = starter.build(COLOURWAYS[2]);
    const all = b.checklist.map((c) => c.text).join('\n');
    expect(all).toMatch(/mp3 or wav/);
    expect(all).toMatch(/Retakes/);
    expect(all).toMatch(/transcript/);
    expect(b.checklist.filter((c) => /^Word \d/.test(c.text))).toHaveLength(6);
  });
});

describe('playing the spelling test', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:1024px;height:640px"></div>';
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0) as unknown as number);
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  });
  const made: Player[] = [];
  afterEach(() => {
    for (const p of made.splice(0)) p.destroy?.();
    vi.unstubAllGlobals();
  });
  const { project } = starter.build(COLOURWAYS[0]);
  const page = (n: number): Artboard => project.artboards[n];
  const el = (id: string) => document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`);
  const click = async (id: string) => {
    const e = el(id);
    if (!e) throw new Error(`no layer ${id}`);
    e.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
  };
  const type = async (id: string, value: string) => {
    const input = (el(id)?.matches('input') ? el(id) : el(id)?.querySelector('input')) as HTMLInputElement | null;
    if (!input) throw new Error(`no input ${id}`);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
  };
  const text = () => {
    const walkText = (n: Node): string => {
      if (n.nodeType === 3) return n.textContent ?? '';
      if (n.nodeType !== 1) return '';
      if ((n as HTMLElement).style.display === 'none') return '';
      return [...n.childNodes].map(walkText).join('');
    };
    return walkText(document.getElementById('stage')!);
  };

  async function run(typed: string[]) {
    const player = new Player(document.getElementById('stage')!, JSON.parse(JSON.stringify(project)), { loadData: false });
    made.push(player);
    await flush();
    await click(byName(page(0), 'Start button')!.id);
    for (let n = 1; n <= 6; n++) {
      expect(text()).toContain(`Word ${n} of 6`);
      const frame = questionFrames(page(n))[0];
      //the play button does nothing yet (no recording picked) and does not throw
      await click(byName(page(n), 'Play word button')!.id);
      await type(partsOf(frame).blankInput[0].id, typed[n - 1]);
      await click(partsOf(frame).check[0].id);
      expect(player.getVariable(`q${n}_locked`)).toBe(true);
      await click(byName(page(n), 'Next button')!.id);
    }
    return player;
  }

  it('marks exact spellings, takes the American one, and shows this go on the result page', async () => {
    //color and center are the American forms; neighbour has spaces round it; two have a letter missing
    const player = await run(['Color', 'organise', ' neighbour ', 'center', 'necesary', 'separat']);
    expect(player.getVariable('q1_correct')).toBe(true);
    expect(player.getVariable('q4_correct')).toBe(true);
    expect(player.getVariable('q5_correct')).toBe(false);
    expect(quizScore(player)).toBe(4);
    expect(text()).toContain('4 / 6');
    expect(text()).toContain('Not a pass');
    expect(text()).toContain('Word 5');
    //nothing on record without a server, and the retake button is there
    expect(el(byName(page(7), 'Retake button')!.id)).toBeTruthy();
  });

  it('passes a clean run, and Retake starts over', async () => {
    const player = await run(WORDS);
    expect(quizScore(player)).toBe(6);
    expect(text()).toContain('You passed');
    await click(byName(page(7), 'Retake button')!.id);
    expect(quizScore(player)).toBe(0);
    expect(player.getVariable('q1_locked')).toBe(false);
    expect(text()).toContain('Spelling test');
  });
});

//A stand in for the browser's audio, so a test can say when a word has finished (or that it could not load)
let voices: FakeAudio[] = [];
class FakeAudio {
  volume = 1;
  muted = false;
  loop = false;
  playbackRate = 1;
  duration = 2;
  private on = new Map<string, (() => void)[]>();
  constructor(public src: string) {
    voices.push(this);
  }
  play() {
    return Promise.resolve();
  }
  pause() {}
  addEventListener(type: string, fn: () => void) {
    this.on.set(type, [...(this.on.get(type) ?? []), fn]);
  }
  fire(type: string) {
    for (const fn of this.on.get(type) ?? []) fn();
  }
}

describe('the word button and the options, played', () => {
  beforeEach(() => {
    voices = [];
    document.body.innerHTML = '<div id="stage" style="width:1024px;height:640px"></div>';
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0) as unknown as number);
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
    vi.stubGlobal('Audio', FakeAudio);
  });
  const made: Player[] = [];
  afterEach(() => {
    //the sounds going are the browser's, not this test's: let every one of them end
    for (const v of voices) v.fire('ended');
    for (const p of made.splice(0)) p.destroy?.();
    vi.unstubAllGlobals();
  });
  //a copy with a recording in the Play the word node of every word, and without the writing tool guard (it reads typing the test does not do)
  const built = JSON.parse(JSON.stringify(starter.build(COLOURWAYS[0]).project)) as Project;
  built.assets.push({ id: 'wordsound', name: 'word.wav', mime: 'audio/wav', size: 4, src: 'data:audio/wav;base64,AAAA' });
  for (const ab of built.artboards) for (const n of ab.logic.nodes) if (n.kind === 'action.sound') n.params.asset = 'wordsound';
  for (const ab of built.artboards) for (const f of questionFrames(ab)) delete f.question!.guard;
  const word = (n: number) => built.artboards[n];
  const el = (id: string) => document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`);
  const click = async (id: string) => {
    const e = el(id);
    if (!e) throw new Error(`no layer ${id}`);
    e.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
  };
  const type = async (id: string, value: string) => {
    const input = (el(id)?.matches('input') ? el(id) : el(id)?.querySelector('input')) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
  };
  const open = async () => {
    const project = JSON.parse(JSON.stringify(built)) as Project;
    project.settings.startArtboardId = word(1).id;
    const player = new Player(document.getElementById('stage')!, project, { loadData: false });
    made.push(player);
    await flush();
    return player;
  };
  const isDisabled = (id: string) => !!(el(id)?.matches('button') ? (el(id) as HTMLButtonElement).disabled : el(id)?.querySelector('button')?.disabled);
  const shown = (id: string) => !!el(id) && el(id)!.style.display !== 'none';

  it('disables Play the word while the word is going and turns it back on when it ends', async () => {
    await open();
    const play = byName(word(1), 'Play word button')!;
    expect(isDisabled(play.id)).toBe(false);
    await click(play.id);
    expect(voices).toHaveLength(1);
    expect(isDisabled(play.id)).toBe(true);
    expect(el(play.id)!.textContent).toContain('Playing…');
    //a second press while it goes does not start the word over the top of itself (a browser does not click a disabled button, so neither does this)
    (el(play.id)!.matches('button') ? el(play.id)! : el(play.id)!.querySelector('button')!).click();
    await flush();
    expect(voices).toHaveLength(1);
    voices[0].fire('ended');
    await flush();
    expect(isDisabled(play.id)).toBe(false);
    expect(el(play.id)!.textContent).toContain('Play the word');
    await click(play.id);
    expect(voices).toHaveLength(2);
  });

  it('is not stuck disabled when the sound cannot load', async () => {
    await open();
    const play = byName(word(1), 'Play word button')!;
    await click(play.id);
    expect(isDisabled(play.id)).toBe(true);
    voices[0].fire('error');
    await flush();
    expect(isDisabled(play.id)).toBe(false);
  });

  it('offers no Hint and no Try again until the two settings are on, then each follows its own', async () => {
    const player = await open();
    const frame = questionFrames(word(1))[0];
    const parts = partsOf(frame);
    expect(shown(parts.hint[0].id)).toBe(false);
    await type(parts.blankInput[0].id, 'kolour');
    await click(parts.check[0].id);
    expect(player.getVariable('q1_locked')).toBe(true);
    expect(shown(parts.reset[0].id)).toBe(false);

    player.setVariable('allowTryAgain', true);
    await flush();
    expect(shown(parts.reset[0].id)).toBe(true);
    await click(parts.reset[0].id);
    expect(player.getVariable('q1_locked')).toBe(false);
    expect(shown(parts.reset[0].id)).toBe(false);

    player.setVariable('offerHint', true);
    await flush();
    expect(shown(parts.hint[0].id)).toBe(true);
    await click(parts.hint[0].id);
    expect(player.getVariable('q1_hint')).toBe('Six letters. It starts with C.');
    expect(shown(parts.hint[0].id)).toBe(false);
  });
});

describe('playing it with the server marking', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:1024px;height:640px"></div>';
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0) as unknown as number);
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  });
  const made: Player[] = [];
  afterEach(() => {
    for (const p of made.splice(0)) p.destroy?.();
    vi.unstubAllGlobals();
  });
  const { project } = starter.build(COLOURWAYS[0]);
  const el = (id: string) => document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`);
  const click = async (id: string) => {
    const e = el(id);
    if (!e) throw new Error(`no layer ${id}`);
    e.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
  };
  const type = async (id: string, value: string) => {
    const input = (el(id)?.matches('input') ? el(id) : el(id)?.querySelector('input')) as HTMLInputElement | null;
    input!.value = value;
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
  };
  const text = () => {
    const walkText = (n: Node): string => {
      if (n.nodeType === 3) return n.textContent ?? '';
      if (n.nodeType !== 1) return '';
      if ((n as HTMLElement).style.display === 'none') return '';
      return [...n.childNodes].map(walkText).join('');
    };
    return walkText(document.getElementById('stage')!);
  };

  //The page the server would serve (answers out), and a store that marks the way /learn/<token>/check does
  const rig = () => {
    const served = JSON.parse(JSON.stringify(project)) as Project;
    const idFor = (f: string, r: string) => `${f}-${r}`;
    const key: MarkingKey = { salt: 's', passMark: 80, questions: stripProject(served, idFor).questions };
    let states: StateMap = {};
    const requests: MarkRequest[] = [];
    const progress: ProgressStore = {
      ...hostProgressStore({ parent: null }),
      mark: async (req) => {
        requests.push(req);
        const step = stepMarking(key, states, req, idFor);
        if ('error' in step) throw new Error(step.error);
        states = step.states;
        return step.reply;
      },
    };
    const player = new Player(document.getElementById('stage')!, served, { loadData: false, progress });
    made.push(player);
    return { player, requests, served };
  };
  async function go(served: Project, typed: string[]) {
    await click(byName(served.artboards[0], 'Start button')!.id);
    for (let n = 1; n <= 6; n++) {
      const frame = questionFrames(served.artboards[n])[0];
      await type(partsOf(frame).blankInput[0].id, typed[n - 1]);
      await click(partsOf(frame).check[0].id);
      await click(byName(served.artboards[n], 'Next button')!.id);
    }
  }

  it('checks every word on the server, shows what is on record, and Retake starts the next round from the result page', async () => {
    const { player, requests, served } = rig();
    await flush();
    await go(served, ['Color', 'organise', 'neighbour', 'center', 'necesary', 'separat']);
    expect(requests.filter((r) => r.action === 'check')).toHaveLength(6);
    expect(player.getVariable('q1_kept')).toBe(4);
    expect(player.getVariable('q1_keptMax')).toBe(6);
    expect(player.getVariable('q1_retakesLeft')).toBe(2);
    expect(text()).toContain('4 / 6');
    expect(text()).toContain('Go 1 of 3');
    //a wrong word shows nothing of the right spelling while there is another go
    expect(text()).not.toMatch(/necessary|separate/);
    await click(byName(served.artboards[7], 'Retake button')!.id);
    expect(requests.some((r) => r.action === 'reset' && r.retake === true && r.question === questionFrames(served.artboards[1])[0].id)).toBe(true);
    expect(text()).toContain('Spelling test');
    //round 2, all right: the record moves to 6
    await go(served, WORDS);
    expect(player.getVariable('q1_round')).toBe(2);
    expect(player.getVariable('q1_kept')).toBe(6);
    expect(text()).toContain('6 / 6');
    expect(text()).toContain('Go 2 of 3');
    expect(text()).toContain('You passed');
    //round 3 is the last, a worse go keeps the 6, and the Retake button goes
    await click(byName(served.artboards[7], 'Retake button')!.id);
    await go(served, ['x', 'x', 'x', 'x', 'x', 'x']);
    expect(player.getVariable('q1_round')).toBe(3);
    expect(player.getVariable('q1_retakesLeft')).toBe(0);
    expect(player.getVariable('q1_kept')).toBe(6);
    //the score that counts stays the best round
    expect(text()).toContain('6 / 6');
    expect(text()).toContain('Go 3 of 3');
    expect((el(byName(served.artboards[7], 'Retake button')!.id) as HTMLElement).style.display).toBe('none');
  }, 20000);
});

describe('a spelling blank in the question kit', () => {
  it('is an ordinary blank question that normalises with its switches', () => {
    const q = { ...newQuestion('blank', 'q1'), blanks: [{ id: 'b1', label: 'x', answers: ['colour'], spelling: true, usSpelling: true }] };
    expect(JSON.parse(JSON.stringify(q)).blanks[0]).toMatchObject({ spelling: true, usSpelling: true });
  });
});
