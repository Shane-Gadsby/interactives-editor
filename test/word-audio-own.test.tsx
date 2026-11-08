//Word audio: the author's own sound instead of the made voice, on the same Play sound node, and the guard options that go with the box.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { produce } from 'immer';
import { normaliseQuestion, type Asset, type FrameNode, type Project } from 'interactives-player';
import { STARTERS } from '../src/lib/branded/sets/assessment';
import { COLOURWAYS } from '../src/lib/branded/looks';
import { questionFrames, setQuestionSettings } from '../src/lib/question-kit';
import { EditorStore, setCurrentStore, useEditor } from '../src/store/store';
import { applyAudio, ownAudioNameProblem, setAudioSource, setOwnAudio, targetNode, usesOwnAudio, voiceWordsIn, wordsIn } from '../src/lib/voice';
import { VoiceSection } from '../src/panels/VoiceSection';
import { GuardSection, guardWith } from '../src/panels/GuardSection';
import { QuestionSection } from '../src/panels/QuestionSection';
import { newQuestion } from 'interactives-player';
import { createProject, createNode } from 'interactives-player';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const starter = STARTERS.find((s) => s.key === 'assessment/spelling-test')!;
const build = () => starter.build(COLOURWAYS[0]).project;
const made = (n: number): Asset => ({ id: `made${n}`, name: `Spoken word q${n}.wav`, mime: 'audio/wav', size: 100 });
const mine = (n: number, name = `take ${n}.mp3`): Asset => ({ id: `mine${n}`, name, mime: 'audio/mpeg', size: 100 });
const first = (p: Project) => {
  const ab = p.artboards.find((a) => questionFrames(a).length)!;
  return { ab, frame: questionFrames(ab)[0] };
};
const nodeAsset = (p: Project) => {
  const { ab, frame } = first(p);
  return targetNode(ab, frame.question!)!.params.asset;
};

describe('choosing where the word audio comes from', () => {
  const withMade = () => {
    const p0 = build();
    const { ab, frame } = first(p0);
    const node = targetNode(ab, frame.question!)!;
    return { ab, frame, node, p: produce(p0, (d) => void applyAudio(d, ab.id, frame.id, made(1), node.id)) };
  };

  it('puts the own file in the same Play sound node and leaves the made audio in Assets', () => {
    const { p, ab, frame, node } = withMade();
    const own = produce(p, (d) => void setOwnAudio(d, ab.id, frame.id, mine(1), node.id));
    const q = first(own).frame.question!;
    expect(q.voice).toMatchObject({ own: true, ownAsset: 'mine1', asset: 'made1', node: node.id });
    expect(usesOwnAudio(q)).toBe(true);
    expect(nodeAsset(own)).toBe('mine1');
    expect(own.assets.map((a) => a.id).sort()).toEqual(['made1', 'mine1']);
  });

  it('switches back and forth without losing either file, and the node follows', () => {
    const { p, ab, frame, node } = withMade();
    const own = produce(p, (d) => void setOwnAudio(d, ab.id, frame.id, mine(1), node.id));
    const voice = produce(own, (d) => void setAudioSource(d, ab.id, frame.id, false));
    expect(nodeAsset(voice)).toBe('made1');
    expect(first(voice).frame.question!.voice).toMatchObject({ ownAsset: 'mine1', asset: 'made1' });
    expect(first(voice).frame.question!.voice!.own).toBeUndefined();
    expect(voice.assets.map((a) => a.id).sort()).toEqual(['made1', 'mine1']);
    const again = produce(voice, (d) => void setAudioSource(d, ab.id, frame.id, true));
    expect(nodeAsset(again)).toBe('mine1');
    expect(again.assets).toHaveLength(2);
  });

  it('going to own audio with none chosen yet leaves the node empty and the made audio in Assets', () => {
    const { p, ab, frame } = withMade();
    const own = produce(p, (d) => void setAudioSource(d, ab.id, frame.id, true));
    expect(nodeAsset(own)).toBe('');
    expect(own.assets.map((a) => a.id)).toEqual(['made1']);
    expect(first(own).frame.question!.voice).toMatchObject({ own: true, asset: 'made1' });
  });

  it('does not let made audio take over a word on its own audio, and keeps made audio that was replaced from being lost', () => {
    const { p, ab, frame, node } = withMade();
    const own = produce(p, (d) => void setOwnAudio(d, ab.id, frame.id, mine(1), node.id));
    const tried = produce(own, (d) => void applyAudio(d, ab.id, frame.id, made(2), node.id));
    expect(nodeAsset(tried)).toBe('mine1');
    expect(first(tried).frame.question!.voice!.asset).toBe('made1');
    //making it again while on the voice replaces the made file but never the own one
    const voice = produce(own, (d) => void setAudioSource(d, ab.id, frame.id, false));
    const remade = produce(voice, (d) => void applyAudio(d, ab.id, frame.id, made(2), node.id));
    expect(remade.assets.map((a) => a.id).sort()).toEqual(['made2', 'mine1']);
    expect(nodeAsset(remade)).toBe('made2');
  });

  it('leaves out own-audio words when making all of them', () => {
    const { p, ab, frame, node } = withMade();
    const own = produce(p, (d) => void setOwnAudio(d, ab.id, frame.id, mine(1), node.id));
    expect(wordsIn(own)).toHaveLength(6);
    expect(voiceWordsIn(own)).toHaveLength(5);
    expect(voiceWordsIn(own).some((w) => w.frame.id === frame.id)).toBe(false);
  });

  it('keeps the own flag and file through a save and load, and stays out of practice mode', () => {
    const { p, ab, frame, node } = withMade();
    const own = produce(p, (d) => void setOwnAudio(d, ab.id, frame.id, mine(1), node.id));
    const q = normaliseQuestion(JSON.parse(JSON.stringify(first(own).frame.question)))!;
    expect(q.voice).toMatchObject({ own: true, ownAsset: 'mine1' });
    expect(usesOwnAudio({ ...q, voice: { ...q.voice!, device: true } })).toBe(false);
  });

  it('warns when the file name has the word in it, and only then', () => {
    const q = first(build()).frame.question!;
    expect(ownAudioNameProblem(q, 'Colour_take2.mp3')).toMatch(/has the word in it/);
    expect(ownAudioNameProblem(q, 'my-colour.wav')).not.toBeNull();
    expect(ownAudioNameProblem(q, 'take 2.mp3')).toBeNull();
    expect(ownAudioNameProblem(q, 'audio-1.mp3')).toBeNull();
  });
});

describe('the checklist and labels of the starter', () => {
  it('say how to use either kind of audio', () => {
    const text = starter.build(COLOURWAYS[0]).checklist.map((c) => c.text).join('\n');
    expect(text).toMatch(/Word audio/);
    expect(text).toMatch(/Made with a voice/);
    expect(text).toMatch(/My own audio/);
    expect(text).toMatch(/words set to My own audio are skipped/);
  });
});

//--- The panels

vi.mock('../src/lib/assets', async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return { ...real, storeFile: async (_p: string, file: File): Promise<Asset> => ({ id: 'recorded1', name: file.name, mime: file.type, size: file.size }) };
});

describe('the Word audio choice on the question', () => {
  let root: Root;
  let host: HTMLElement;
  let s: EditorStore;
  const frameNow = () => questionFrames(s.get().project.artboards.find((a) => questionFrames(a).length)!)[0];
  const abNow = () => s.get().project.artboards.find((a) => questionFrames(a).length)!;

  async function mount(project: Project) {
    s = new EditorStore(project);
    setCurrentStore(s);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const Harness = () => {
      const p = useEditor((st) => st.project);
      return (
        <>
          <VoiceSection frame={frameNow() as FrameNode} ab={abNow()} project={p} />
          <GuardSection frame={frameNow() as FrameNode} ab={abNow()} />
        </>
      );
    };
    await act(async () => root.render(<Harness />));
    await act(async () => {});
  }
  const select = (label: string) => [...host.querySelectorAll('label')].find((l) => l.textContent?.startsWith(label))!.querySelector('select')!;
  const choose = async (el: HTMLSelectElement, value: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, value);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  const button = (text: string | RegExp) => [...host.querySelectorAll('button')].find((b) => (typeof text === 'string' ? b.textContent === text : text.test(b.textContent ?? '')));

  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ state: 'ready', voices: [{ id: 'bf_emma', name: 'Emma', gender: 'Woman', accent: 'British' }], defaultVoice: 'bf_emma', model: { name: 'Kokoro', licence: 'Apache-2.0', megabytes: 126 } })));
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it('shows the voice controls on Made with a voice, and a sound picker instead on My own audio', async () => {
    await mount(build());
    expect(select('Word audio').value).toBe('voice');
    expect(host.textContent).toMatch(/Make the audio with a voice/);
    expect(host.textContent).not.toMatch(/Record it now/);
    await choose(select('Word audio'), 'own');
    expect(select('Word audio').value).toBe('own');
    expect(host.textContent).not.toMatch(/Make the audio with a voice/);
    expect(host.textContent).not.toMatch(/Say it like/);
    expect(host.textContent).toMatch(/Record it now/);
    expect(select('Sound')).toBeTruthy();
    await choose(select('Word audio'), 'voice');
    expect(host.textContent).toMatch(/Make the audio with a voice/);
  });

  it('puts a chosen sound in the Play sound node and warns about a file named after the word', async () => {
    const p = produce(build(), (d) => void d.assets.push(mine(1, 'colour.mp3'), mine(2, 'take 2.mp3')));
    await mount(p);
    await choose(select('Word audio'), 'own');
    await choose(select('Sound'), 'mine2');
    expect(nodeAsset(s.get().project)).toBe('mine2');
    expect(host.textContent).not.toMatch(/has the word in it/);
    await choose(select('Sound'), 'mine1');
    expect(nodeAsset(s.get().project)).toBe('mine1');
    expect(host.textContent).toMatch(/has the word in it/);
    //both stay
    expect(s.get().project.assets.map((a) => a.id).sort()).toEqual(['mine1', 'mine2']);
  });

  it('records with the microphone and uses the take', async () => {
    const stopped = vi.fn();
    const track = { stop: stopped };
    class FakeRecorder {
      state = 'inactive';
      mimeType = 'audio/webm;codecs=opus';
      private on: Record<string, ((e: unknown) => void)[]> = {};
      addEventListener(t: string, f: (e: unknown) => void) {
        (this.on[t] ??= []).push(f);
      }
      start() {
        this.state = 'recording';
      }
      stop() {
        this.state = 'inactive';
        this.on.dataavailable?.forEach((f) => f({ data: new Blob([new Uint8Array(10)], { type: 'audio/webm' }) }));
        this.on.stop?.forEach((f) => f({}));
      }
    }
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [track] }) } });
    await mount(build());
    await choose(select('Word audio'), 'own');
    await act(async () => void button('Record it now')!.click());
    expect(host.textContent).toMatch(/Recording/);
    await act(async () => void button('Stop recording')!.click());
    await act(async () => {});
    expect(stopped).toHaveBeenCalled();
    expect(nodeAsset(s.get().project)).toBe('recorded1');
    expect(s.get().project.assets.find((a) => a.id === 'recorded1')!.name).toMatch(/^Recorded word .*\.webm$/);
    vi.unstubAllGlobals();
  });

  it('says why recording is not possible when the microphone is refused', async () => {
    vi.stubGlobal('MediaRecorder', class {});
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => Promise.reject(new Error('no')) } });
    await mount(build());
    await choose(select('Word audio'), 'own');
    await act(async () => void button('Record it now')!.click());
    expect(host.textContent).toMatch(/microphone is not available/);
    vi.unstubAllGlobals();
  });
});

describe('the guard options', () => {
  let root: Root;
  let host: HTMLElement;
  let s: EditorStore;
  const frameNow = () => questionFrames(s.get().project.artboards.find((a) => questionFrames(a).length)!)[0];
  const abNow = () => s.get().project.artboards.find((a) => questionFrames(a).length)!;
  const inputNodes = () => {
    const out: Record<string, unknown>[] = [];
    const walk = (n: any) => {
      if (n.type === 'input') out.push(n);
      (n.children ?? []).forEach(walk);
    };
    walk(frameNow());
    return out as { noAssist?: boolean; noPaste?: boolean }[];
  };
  beforeEach(async () => {
    s = new EditorStore(build());
    setCurrentStore(s);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const Harness = () => {
      useEditor((st) => st.project);
      return <GuardSection frame={frameNow() as FrameNode} ab={abNow()} />;
    };
    await act(async () => root.render(<Harness />));
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  const label = (t: string) => [...host.querySelectorAll('label')].find((l) => l.textContent?.includes(t))!;
  const tick = async (t: string) => act(async () => void (label(t).querySelector('input') as HTMLInputElement).click());

  it('says what it cannot do, in the section itself', () => {
    expect(host.textContent).toMatch(/phone or tablet/);
    expect(host.textContent).toMatch(/only a hint/);
    expect(host.textContent).toMatch(/second device cannot be seen/);
  });

  it('starts with the box helped off and paste allowed (as before) until the author turns the guard on', () => {
    expect(frameNow().question!.guard).toBeUndefined();
    expect(inputNodes().every((n) => n.noAssist && !n.noPaste)).toBe(true);
  });

  it('turns paste off in the box, and the box helpers on and off, from the ticks', async () => {
    await tick('Block paste');
    expect(frameNow().question!.guard).toEqual({ mode: 'off' });
    expect(inputNodes().every((n) => n.noPaste === true)).toBe(true);
    await tick('Block paste');
    expect(frameNow().question!.guard).toMatchObject({ paste: false });
    expect(inputNodes().some((n) => n.noPaste)).toBe(false);
    await tick('Switch off browser spell check');
    expect(frameNow().question!.guard).toMatchObject({ spellcheck: false });
    expect(inputNodes().some((n) => n.noAssist)).toBe(false);
  });

  it('sets the mode and an exemption code that is kept scrambled', async () => {
    const mode = [...host.querySelectorAll('label')].find((l) => l.textContent?.startsWith('When a writing tool'))!.querySelector('select')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(mode, 'block');
      mode.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(frameNow().question!.guard!.mode).toBe('block');
    const field = label('Exemption code').querySelector('input') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, 'open-sesame');
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => void [...host.querySelectorAll('button')].find((b) => b.textContent === 'Set code')!.click());
    const g = frameNow().question!.guard!;
    expect(g.exempt).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(s.get().project)).not.toContain('open-sesame');
    await act(async () => void [...host.querySelectorAll('button')].find((b) => b.textContent === 'Remove code')!.click());
    expect(frameNow().question!.guard!.exempt).toBeUndefined();
  });

  it('drops an empty record, so the question goes back to what it always did', () => {
    expect(guardWith({ mode: 'block' }, { mode: undefined })).toBeUndefined();
    expect(guardWith(undefined, { paste: false })).toEqual({ paste: false });
  });

  it('keeps the guard through the question being edited', () => {
    const p = produce(s.get().project, (d) => {
      const ab = d.artboards.find((a) => questionFrames(a).length)!;
      const f = questionFrames(ab)[0];
      setQuestionSettings(d, ab.id, f.id, { guard: { mode: 'block' } });
    });
    expect(first(p).frame.question!.guard!.mode).toBe('block');
  });
});

describe('ticking Spelling on a blank', () => {
  it('starts the guard on Block with paste refused, once, and not on a question that already has one', async () => {
    const p = createProject('t');
    const ab = p.artboards[0];
    ab.children.push(createNode('frame', { id: 'qf', name: 'Q', question: { ...newQuestion('blank', 'q1'), blanks: [{ id: 'b1', label: 'Word', answers: ['colour'] }] } } as never));
    const s = new EditorStore(p);
    setCurrentStore(s);
    s.update((d) => void setQuestionSettings(d as Project, ab.id, 'qf', {}));
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const frame = () => questionFrames(s.get().project.artboards[0])[0];
    const Harness = () => {
      const project = useEditor((st) => st.project);
      return <QuestionSection frame={frame() as FrameNode} ab={project.artboards[0]} project={project} />;
    };
    await act(async () => root.render(<Harness />));
    const box = () => [...host.querySelectorAll('label')].find((l) => l.textContent?.includes('Spelling: letters must match exactly'))!.querySelector('input') as HTMLInputElement;
    await act(async () => void box().click());
    expect(frame().question!.blanks[0].spelling).toBe(true);
    expect(frame().question!.guard).toEqual({ mode: 'block' });
    await act(async () => void box().click());
    expect(frame().question!.blanks[0].spelling).toBeUndefined();
    expect(frame().question!.guard).toEqual({ mode: 'block' });
    act(() => root.unmount());
    host.remove();
  });
});
