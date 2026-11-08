//The editor's side of the Spelling test voice: what it says, writing the made audio into the document, practice mode, and the panel
//with a stand-in for the server.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { produce } from 'immer';
import { isServerMarked, serverMarkingProblem, type Asset, type FrameNode, type Project } from 'interactives-player';
import { STARTERS } from '../src/lib/branded/sets/assessment';
import { COLOURWAYS } from '../src/lib/branded/looks';
import { partsOf, questionFrames } from '../src/lib/question-kit';
import { EditorStore, setCurrentStore, useEditor } from '../src/store/store';
import { addPlayButton, applyAudio, isWord, partsFor, setPractice, setVoice, soundNodes, speakText, syncPractice, targetNode, wordOf, wordsIn } from '../src/lib/voice';
import { VoiceSection } from '../src/panels/VoiceSection';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const starter = STARTERS.find((s) => s.key === 'assessment/spelling-test')!;
const build = () => starter.build(COLOURWAYS[0]).project;
const asset = (n: number): Asset => ({ id: `as${n}`, name: `Spoken word q${n}.wav`, mime: 'audio/wav', size: 100 });

describe('what the voice says', () => {
  const p = build();
  const frames = p.artboards.flatMap((ab) => questionFrames(ab));

  it('is the first accepted spelling, then the sentence, then the word again', () => {
    const q = frames[0].question!;
    expect(wordOf(q)).toBe('colour');
    expect(isWord(q)).toBe(true);
    //the starter says each word twice
    expect(partsFor(q)).toEqual(['colour', 'colour']);
    expect(partsFor({ ...q, voice: { sentence: 'The colour of the sky is blue.', twice: true } })).toEqual(['colour', 'The colour of the sky is blue.', 'colour']);
  });

  it('says Say it like in place of the spelling, and nothing when no word is typed', () => {
    const q = frames[0].question!;
    expect(partsFor({ ...q, voice: { say: 'cull er' } })).toEqual(['cull er']);
    const empty = { ...q, blanks: [{ ...q.blanks[0], answers: ['', '  '] }] };
    expect(wordOf(empty)).toBe('');
    expect(partsFor(empty)).toEqual([]);
    expect(isWord(empty)).toBe(false);
  });

  it('finds every word of the project, in page order', () => {
    expect(wordsIn(p).map((w) => wordOf(w.frame.question!))).toEqual(['colour', 'organise', 'neighbour', 'centre', 'necessary', 'separate']);
  });
});

describe('the starter', () => {
  it('has each word\'s Play sound node remembered on its question, ready for the voice', () => {
    const p = build();
    for (const ab of p.artboards) {
      for (const f of questionFrames(ab)) {
        const q = f.question!;
        expect(q.voice).toMatchObject({ voice: 'bf_emma', speed: 0.9, twice: true });
        const node = targetNode(ab, q)!;
        expect(node.kind).toBe('action.sound');
        expect(node.id).toBe(q.voice!.node);
        expect(node.params.asset).toBe('');
      }
    }
  });
});

describe('putting the made audio in the document', () => {
  const first = (p: Project) => {
    const ab = p.artboards.find((a) => questionFrames(a).length)!;
    return { ab, frame: questionFrames(ab)[0] };
  };

  it('stores the asset, points the Play sound node at it and remembers it on the question', () => {
    const p0 = build();
    const { ab, frame } = first(p0);
    const node = targetNode(ab, frame.question!)!;
    const p = produce(p0, (d) => void applyAudio(d, ab.id, frame.id, asset(1), node.id));
    const f = questionFrames(p.artboards.find((a) => a.id === ab.id)!)[0];
    expect(p.assets.map((a) => a.id)).toEqual(['as1']);
    expect(p.artboards.find((a) => a.id === ab.id)!.logic.nodes.find((n) => n.id === node.id)!.params.asset).toBe('as1');
    expect(f.question!.voice).toMatchObject({ asset: 'as1', node: node.id, voice: 'bf_emma' });
    //the word is not in the name of what was stored
    expect(JSON.stringify(p.assets)).not.toContain('colour');
  });

  it('makes it again: the new audio replaces the old, and the old record goes', () => {
    const p0 = build();
    const { ab, frame } = first(p0);
    const node = targetNode(ab, frame.question!)!;
    const once = produce(p0, (d) => void applyAudio(d, ab.id, frame.id, asset(1), node.id));
    const twice = produce(once, (d) => void applyAudio(d, ab.id, frame.id, asset(2), node.id));
    expect(twice.assets.map((a) => a.id)).toEqual(['as2']);
    expect(JSON.stringify(twice)).not.toContain('"as1"');
  });

  it('leaves the old audio alone when something else in the project still plays it (a duplicated page)', () => {
    const p0 = build();
    const { ab, frame } = first(p0);
    const node = targetNode(ab, frame.question!)!;
    const once = produce(p0, (d) => {
      applyAudio(d, ab.id, frame.id, asset(1), node.id);
      const other = d.artboards.find((a) => a.id !== ab.id && a.logic.nodes.some((n) => n.kind === 'action.sound'))!;
      other.logic.nodes.find((n) => n.kind === 'action.sound')!.params.asset = 'as1';
    });
    const again = produce(once, (d) => void applyAudio(d, ab.id, frame.id, asset(2), node.id));
    expect(again.assets.map((a) => a.id).sort()).toEqual(['as1', 'as2']);
  });

  it('adds a Play the word button and its Play sound node to a page that has none', () => {
    const p0 = build();
    const { ab, frame } = first(p0);
    const bare = produce(p0, (d) => {
      const a = d.artboards.find((x) => x.id === ab.id)!;
      a.logic.nodes = a.logic.nodes.filter((n) => n.kind !== 'action.sound');
      const f = questionFrames(a)[0];
      f.question = { ...f.question!, voice: { voice: 'bf_emma' } };
    });
    const bareAb = bare.artboards.find((a) => a.id === ab.id)!;
    expect(soundNodes(bareAb)).toHaveLength(0);
    const p = produce(bare, (d) => void addPlayButton(d, ab.id, frame.id));
    const a = p.artboards.find((x) => x.id === ab.id)!;
    const nodes = soundNodes(a);
    expect(nodes).toHaveLength(1);
    expect(targetNode(a, questionFrames(a)[0].question!)!.id).toBe(nodes[0].id);
    const click = a.logic.nodes.find((n) => n.kind === 'event.pointer' && a.logic.edges.some((e) => e.from === n.id && e.to === nodes[0].id))!;
    //the button leads the card's button row, not above the card
    const row = partsOf(questionFrames(a)[0]).buttons[0] as FrameNode;
    expect(row.children.some((c) => c.id === click.params.target && c.type === 'button')).toBe(true);
    expect(row.children[row.children.length - 1].questionPart).toBe('check');
    expect(a.children.some((c) => c.id === click.params.target)).toBe(false);
  });

  it('does not guess between two Play sound nodes', () => {
    const p0 = build();
    const { ab, frame } = first(p0);
    const two = produce(p0, (d) => {
      const a = d.artboards.find((x) => x.id === ab.id)!;
      a.logic.nodes.push({ id: 'extra', kind: 'action.sound', x: 0, y: 0, params: { asset: '' } });
      const f = questionFrames(a)[0];
      f.question = { ...f.question!, voice: { voice: 'bf_emma' } };
    });
    expect(targetNode(two.artboards.find((x) => x.id === ab.id)!, questionFrames(two.artboards.find((x) => x.id === ab.id)!)[0].question!)).toBeNull();
    const chosen = produce(two, (d) => void setVoice(d, ab.id, frame.id, { node: 'extra' }));
    expect(targetNode(chosen.artboards.find((x) => x.id === ab.id)!, questionFrames(chosen.artboards.find((x) => x.id === ab.id)!)[0].question!)!.id).toBe('extra');
  });
});

describe('practice mode', () => {
  const setup = () => {
    const p = build();
    const ab = p.artboards.find((a) => questionFrames(a).length)!;
    return { p, ab, frame: questionFrames(ab)[0] };
  };

  it('has the learner\'s device read the word, takes the question off the server and says why', () => {
    const { p, ab, frame } = setup();
    expect(frame.question!.serverMarked).toBe(true);
    const on = produce(p, (d) => void setPractice(d, ab.id, frame.id, true));
    const a = on.artboards.find((x) => x.id === ab.id)!;
    const q = questionFrames(a)[0].question!;
    expect(q.serverMarked).toBeUndefined();
    expect(q.voice).toMatchObject({ device: true });
    expect(isServerMarked(q)).toBe(false);
    expect(serverMarkingProblem(q)).toMatch(/own device/);
    const node = a.logic.nodes.find((n) => n.id === q.voice!.node)!;
    expect(node.kind).toBe('action.speak');
    expect(node.params).toMatchObject({ op: 'text', text: '"colour"' });
  });

  it('follows the word when it is edited, and goes back to playing the audio when turned off', () => {
    const { p, ab, frame } = setup();
    const on = produce(p, (d) => void setPractice(d, ab.id, frame.id, true));
    const edited = produce(on, (d) => {
      const f = questionFrames(d.artboards.find((x) => x.id === ab.id)!)[0];
      f.question!.blanks[0].answers = ['color'];
      syncPractice(d, ab.id, frame.id);
    });
    const q = questionFrames(edited.artboards.find((x) => x.id === ab.id)!)[0].question!;
    expect(edited.artboards.find((x) => x.id === ab.id)!.logic.nodes.find((n) => n.id === q.voice!.node)!.params.text).toBe(speakText(q));
    expect(speakText(q)).toBe('"color"');
    const off = produce(edited, (d) => void setPractice(d, ab.id, frame.id, false));
    const a = off.artboards.find((x) => x.id === ab.id)!;
    const q2 = questionFrames(a)[0].question!;
    expect(q2.voice?.device).toBeUndefined();
    expect(a.logic.nodes.find((n) => n.id === q2.voice!.node)!.kind).toBe('action.sound');
    //turning it off does not quietly put the server marking back
    expect(q2.serverMarked).toBeUndefined();
  });
});

//--- The panel, with a stand-in server

vi.mock('../src/lib/assets', async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  let n = 0;
  return { ...real, storeFile: async (_p: string, file: File): Promise<Asset> => ({ id: `made${++n}`, name: file.name, mime: file.type, size: file.size }) };
});

describe('the Voice for the word panel', () => {
  let root: Root;
  let host: HTMLElement;
  let s: EditorStore;
  let state: Record<string, unknown>;
  let speaks: { parts: string[]; voice: string; speed: number }[];
  let installs: number;
  const VOICES = [
    { id: 'bf_emma', name: 'Emma', gender: 'Woman', accent: 'British' },
    { id: 'bm_george', name: 'George', gender: 'Man', accent: 'British' },
  ];
  const status = (st: string, extra: Record<string, unknown> = {}) => ({ state: st, voices: VOICES, defaultVoice: 'bf_emma', model: { name: 'Kokoro', licence: 'Apache-2.0', megabytes: 126 }, ...extra });

  const frameNow = () => questionFrames(s.get().project.artboards.find((a) => questionFrames(a).length)!)[0];
  const abNow = () => s.get().project.artboards.find((a) => questionFrames(a).length)!;

  async function mount() {
    s = new EditorStore(build());
    setCurrentStore(s);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const Harness = () => {
      const project = useEditor((st) => st.project);
      return <VoiceSection frame={frameNow() as FrameNode} ab={abNow()} project={project} />;
    };
    await act(async () => root.render(<Harness />));
    await act(async () => {});
  }
  const button = (text: string | RegExp) => [...host.querySelectorAll('button')].find((b) => (typeof text === 'string' ? b.textContent === text : text.test(b.textContent ?? '')))!;
  const click = async (el: Element) => act(async () => void (el as HTMLElement).click());

  beforeEach(() => {
    state = status('ready');
    speaks = [];
    installs = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
      const url = String(input);
      if (url.endsWith('/api/voice/install')) {
        installs++;
        state = status('installing', { done: 10 * 1048576, total: 126 * 1048576 });
        return new Response(JSON.stringify(state));
      }
      if (url.endsWith('/api/voice/speak')) {
        const body = JSON.parse(init.body);
        speaks.push(body);
        if (body.parts.includes('xyzzy')) return new Response(JSON.stringify({ error: 'The voice does not know how to say "xyzzy".', code: 'unknown-word' }), { status: 422 });
        return new Response(new Blob([new Uint8Array(100)], { type: 'audio/wav' }), { status: 200, headers: { 'content-type': 'audio/wav' } });
      }
      if (url.endsWith('/api/voice')) return new Response(JSON.stringify(state));
      throw new Error(`unexpected ${url}`);
    });
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it('offers to set the voice up when the server has not downloaded it, and shows the download', async () => {
    state = status('missing');
    await mount();
    expect(host.textContent).toMatch(/downloaded to this server once \(about 126 MB/);
    expect(host.textContent).not.toMatch(/Make the audio with a voice/);
    await click(button('Set up the voice'));
    expect(installs).toBe(1);
    expect(host.textContent).toMatch(/Downloading the voice: 10 of 126 MB/);
  });

  it('says why when the server has no speech engine', async () => {
    state = status('unsupported', { error: 'The speech engine (sherpa-onnx-node) is not installed on this server.' });
    await mount();
    expect(host.querySelector('.q-problem')!.textContent).toMatch(/not installed/);
    expect(host.textContent).not.toMatch(/Make the audio/);
  });

  it('makes the audio for a word with the voice and saves it in the Play sound node as an ordinary asset', async () => {
    await mount();
    await click(button('Make the audio with a voice'));
    expect(speaks).toEqual([{ parts: ['colour', 'colour'], voice: 'bf_emma', speed: 0.9 }]);
    const p = s.get().project;
    expect(p.assets).toHaveLength(1);
    expect(p.assets[0]).toMatchObject({ mime: 'audio/wav', name: 'Spoken word q1.wav' });
    const f = frameNow();
    expect(f.question!.voice).toMatchObject({ asset: p.assets[0].id });
    expect(abNow().logic.nodes.find((n) => n.id === f.question!.voice!.node)!.params.asset).toBe(p.assets[0].id);
    expect(host.textContent).toMatch(/Made the audio for 1 word/);
    expect(button('Make the audio again')).toBeTruthy();
  });

  it('makes them all with the voice and speed on show, each word keeping its own Say it like', async () => {
    await mount();
    s.update((d) => {
      const second = questionFrames(d.artboards[2] ?? d.artboards.filter((a) => questionFrames(a).length)[1])[0];
      second.question = { ...second.question!, voice: { ...second.question!.voice, say: 'or gan ize' } };
    });
    await click(button(/Make the audio for all 6 words/));
    expect(speaks).toHaveLength(6);
    expect(speaks[0].parts).toEqual(['colour', 'colour']);
    expect(speaks[1].parts).toEqual(['or gan ize', 'or gan ize']);
    expect(s.get().project.assets).toHaveLength(6);
    expect(host.textContent).toMatch(/Made the audio for 6 words/);
  });

  it('shows the voice\'s reason when it cannot say a word, and saves nothing', async () => {
    await mount();
    s.update((d) => void setVoice(d, abNow().id, frameNow().id, { say: 'xyzzy' }));
    await act(async () => {});
    await click(button('Make the audio with a voice'));
    expect(host.querySelector('[role="alert"]')!.textContent).toMatch(/does not know how to say "xyzzy"/);
    expect(s.get().project.assets).toHaveLength(0);
  });

  it('practice mode warns plainly, turns the server marking off and swaps the panel for the warning', async () => {
    await mount();
    expect(frameNow().question!.serverMarked).toBe(true);
    const box = [...host.querySelectorAll('input[type="checkbox"]')].find((i) => i.closest('label')!.textContent!.startsWith('Practice mode')) as HTMLInputElement;
    await act(async () => void box.click());
    const q = frameNow().question!;
    expect(q.voice!.device).toBe(true);
    expect(q.serverMarked).toBeUndefined();
    const warning = host.querySelector('.q-problem[role="alert"]')!.textContent!;
    expect(warning).toMatch(/word is in the page/);
    expect(warning).toMatch(/not a graded test/);
    expect(warning).toMatch(/sends no grade/);
    expect(host.textContent).not.toMatch(/Make the audio with a voice/);
  });
});
