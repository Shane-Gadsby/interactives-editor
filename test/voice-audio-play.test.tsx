//Voice for the word: the Play button for the word's current audio, and a recording that is listened to before it is kept.
//Audio, MediaRecorder and getUserMedia are fakes (jsdom has none of them).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { produce } from 'immer';
import type { Asset, Project } from 'interactives-player';
import { STARTERS } from '../src/lib/branded/sets/assessment';
import { COLOURWAYS } from '../src/lib/branded/looks';
import { EditorStore, setCurrentStore, useEditor } from '../src/store/store';
import { applyAudio, setOwnAudio, targetNode, wordsIn } from '../src/lib/voice';
import { assetUrls } from '../src/lib/assets';
import { playAudio, playingKey, stopAudio } from '../src/lib/audio-player';
import { VoiceSection } from '../src/panels/VoiceSection';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const stored: File[] = [];
vi.mock('../src/lib/assets', async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    storeFile: async (_p: string, file: File): Promise<Asset> => {
      stored.push(file);
      return { id: `recorded${stored.length}`, name: file.name, mime: file.type, size: file.size };
    },
  };
});

class FakeAudio {
  static all: FakeAudio[] = [];
  paused = true;
  private on: Record<string, (() => void)[]> = {};
  constructor(public src: string) {
    FakeAudio.all.push(this);
  }
  addEventListener(t: string, f: () => void) {
    (this.on[t] ??= []).push(f);
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  end() {
    this.paused = true;
    this.on.ended?.forEach((f) => f());
  }
}

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

const starter = STARTERS.find((s) => s.key === 'assessment/spelling-test')!;
const build = () => starter.build(COLOURWAYS[0]).project;
const made = (n: number): Asset => ({ id: `made${n}`, name: `Spoken word q${n}.wav`, mime: 'audio/wav', size: 100 });
const word = (p: Project, i: number) => wordsIn(p)[i];
const nodeAsset = (p: Project, i = 0) => {
  const w = word(p, i);
  return targetNode(w.ab, w.frame.question!)!.params.asset;
};

describe('the shared audio player', () => {
  beforeEach(() => {
    FakeAudio.all = [];
    vi.stubGlobal('Audio', FakeAudio);
  });
  afterEach(() => {
    stopAudio();
    vi.unstubAllGlobals();
  });

  it('plays one sound at a time and says which', async () => {
    await playAudio('a|word', 'blob:a');
    expect(playingKey()).toBe('a|word');
    await playAudio('b|word', 'blob:b');
    expect(playingKey()).toBe('b|word');
    expect(FakeAudio.all[0].paused).toBe(true);
    expect(FakeAudio.all[1].paused).toBe(false);
    //stopping one owner leaves another's sound alone
    stopAudio('a');
    expect(playingKey()).toBe('b|word');
    stopAudio('b');
    expect(playingKey()).toBeNull();
  });

  it('lets go of a temporary url when the sound ends or is stopped', async () => {
    const done = vi.fn();
    await playAudio('a|take', 'blob:a', done);
    FakeAudio.all[0].end();
    expect(done).toHaveBeenCalledTimes(1);
    expect(playingKey()).toBeNull();
    const again = vi.fn();
    await playAudio('a|take', 'blob:a', again);
    stopAudio();
    expect(again).toHaveBeenCalledTimes(1);
  });
});

describe('the Voice for the word panel: Play and recording', () => {
  let root: Root;
  let host: HTMLElement;
  let s: EditorStore;
  let revoked: string[];
  let clock: number;
  let index = 0;
  let urlN = 0;

  async function mount(project: Project, i = 0) {
    index = i;
    s = new EditorStore(project);
    setCurrentStore(s);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await show();
  }
  const Harness = () => {
    const p = useEditor((st) => st.project);
    const w = word(p, index);
    return <VoiceSection frame={w.frame} ab={w.ab} project={p} />;
  };
  const show = async () => {
    await act(async () => root.render(<Harness />));
    await act(async () => {});
  };
  const goTo = async (i: number) => {
    index = i;
    await show();
  };
  const select = (label: string) => [...host.querySelectorAll('label')].find((l) => l.textContent?.startsWith(label))!.querySelector('select')!;
  const choose = async (el: HTMLSelectElement, value: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, value);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  const button = (text: string | RegExp) => [...host.querySelectorAll('button')].find((b) => (typeof text === 'string' ? b.textContent === text : text.test(b.textContent ?? '')));
  const click = async (b: HTMLButtonElement | undefined) => act(async () => void b!.click());
  const withMade = (n = 1) =>
    produce(build(), (d) => {
      const w = word(d, 0);
      applyAudio(d, w.ab.id, w.frame.id, made(n), targetNode(w.ab, w.frame.question!)!.id);
    });
  const status = () => [...host.querySelectorAll('[role="status"]')].map((e) => e.textContent).join(' | ');

  beforeEach(() => {
    stored.length = 0;
    revoked = [];
    clock = 1000;
    urlN = 0;
    FakeAudio.all = [];
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
    URL.createObjectURL = () => `blob:take${++urlN}`;
    URL.revokeObjectURL = (u: string) => void revoked.push(u);
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ state: 'ready', voices: [{ id: 'bf_emma', name: 'Emma', gender: 'Woman', accent: 'British' }], defaultVoice: 'bf_emma', model: { name: 'Kokoro', licence: 'Apache-2.0', megabytes: 126 } })));
    assetUrls.register('made1', new Blob([new Uint8Array(4)]));
    assetUrls.register('made2', new Blob([new Uint8Array(4)]));
    urlN = 0;
  });
  afterEach(() => {
    stopAudio();
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  //--- Play

  it('has a Play button that is off, with the reason, until the word has audio', async () => {
    await mount(build());
    const play = button('Play') as HTMLButtonElement;
    expect(play.disabled).toBe(true);
    expect(play.title).toMatch(/No audio yet: make it with a voice first/);
    await choose(select('Word audio'), 'own');
    expect((button('Play') as HTMLButtonElement).title).toMatch(/choose or record a sound first/);
  });

  it('plays the made audio, reads Stop while it plays, and goes back to Play when it ends', async () => {
    await mount(withMade());
    const play = button('Play') as HTMLButtonElement;
    expect(play.disabled).toBe(false);
    await click(play);
    expect(FakeAudio.all).toHaveLength(1);
    expect(FakeAudio.all[0].src).toMatch(/^blob:/);
    expect(button('Stop')).toBeTruthy();
    expect(status()).toMatch(/Playing\.\.\./);
    await click(button('Stop'));
    expect(FakeAudio.all[0].paused).toBe(true);
    expect(button('Play')).toBeTruthy();
    expect(status()).not.toMatch(/Playing/);
    await click(button('Play'));
    await act(async () => FakeAudio.all[1].end());
    expect(button('Play')).toBeTruthy();
  });

  it('plays what the Play sound node holds: the own audio under My own audio', async () => {
    const p = produce(withMade(), (d) => {
      const w = word(d, 0);
      d.assets.push({ id: 'made2', name: 'take 2.mp3', mime: 'audio/mpeg', size: 4 });
      setOwnAudio(d, w.ab.id, w.frame.id, { id: 'made2', name: 'take 2.mp3', mime: 'audio/mpeg', size: 4 }, targetNode(w.ab, w.frame.question!)!.id);
    });
    await mount(p);
    expect((button('Play') as HTMLButtonElement).disabled).toBe(false);
    await click(button('Play'));
    expect(FakeAudio.all[0].src).toBe(assetUrls.resolve('made2'));
  });

  it('stops when the word changes, when the audio changes and when the section goes', async () => {
    await mount(withMade());
    await click(button('Play'));
    expect(playingKey()).toMatch(/\|word$/);
    await goTo(1);
    expect(playingKey()).toBeNull();
    expect(button('Play')).toBeTruthy();
    //a new audio for the same word
    await goTo(0);
    await click(button('Play'));
    expect(playingKey()).not.toBeNull();
    await act(async () => void s.update((d) => void applyAudio(d as Project, word(d as Project, 0).ab.id, word(d as Project, 0).frame.id, made(2), targetNode(word(d as Project, 0).ab, word(d as Project, 0).frame.question!)!.id)));
    expect(playingKey()).toBeNull();
    //leaving the section
    await click(button('Play'));
    expect(playingKey()).not.toBeNull();
    await act(async () => root.render(<div />));
    expect(playingKey()).toBeNull();
  });

  it('playing the word stops a preview or a take, and the other way round', async () => {
    await mount(withMade());
    await playAudio('somewhere-else|word', 'blob:other');
    await click(button('Play'));
    expect(FakeAudio.all[0].paused).toBe(true);
    expect(FakeAudio.all[1].paused).toBe(false);
  });

  //--- Recording

  const startOwn = async () => {
    await mount(build());
    await choose(select('Word audio'), 'own');
  };
  const takeOne = async (seconds = 2.4) => {
    await click(button('Record it now'));
    expect(host.textContent).toMatch(/Recording\.\.\./);
    clock += seconds * 1000;
    await click(button('Stop recording'));
    await act(async () => {});
  };

  it('holds a recording after Stop: nothing uploaded, nothing in the project or the undo history', async () => {
    await startOwn();
    const before = s.get().project;
    await takeOne();
    expect(stored).toHaveLength(0);
    expect(s.get().project).toBe(before);
    expect(status()).toMatch(/Recorded, 2\.4 s\. Listen, use it or discard it\./);
    for (const name of ['Listen', 'Use this recording', 'Discard', 'Record again']) expect(button(name)).toBeTruthy();
    expect(host.textContent).not.toMatch(/Record it now/);
  });

  it('listens to the take through the shared player, and Listen reads Stop while it plays', async () => {
    await startOwn();
    await takeOne();
    await click(button('Listen'));
    expect(FakeAudio.all.at(-1)!.src).toBe('blob:take1');
    expect(button('Stop')).toBeTruthy();
    await click(button('Stop'));
    expect(button('Listen')).toBeTruthy();
    //still nothing sent anywhere
    expect(stored).toHaveLength(0);
  });

  it('Discard throws the take away: nothing uploaded, no asset, no undo step', async () => {
    await startOwn();
    const before = s.get().project;
    await takeOne();
    await click(button('Listen'));
    await click(button('Discard'));
    expect(stored).toHaveLength(0);
    expect(s.get().project).toBe(before);
    expect(revoked).toContain('blob:take1');
    expect(playingKey()).toBeNull();
    expect(button('Use this recording')).toBeUndefined();
    expect(button('Record it now')).toBeTruthy();
    expect(status()).toMatch(/thrown away/);
  });

  it('Use this recording uploads it once, puts it in the Play sound node, and is one undo step', async () => {
    await startOwn();
    const before = s.get().project;
    await takeOne();
    await click(button('Use this recording'));
    await act(async () => {});
    expect(stored).toHaveLength(1);
    //never named after the word
    expect(stored[0].name).toMatch(/^Recorded word .*\.webm$/);
    expect(stored[0].name.toLowerCase()).not.toContain('colour');
    const p = s.get().project;
    expect(nodeAsset(p)).toBe('recorded1');
    expect(p.assets.find((a) => a.id === 'recorded1')).toBeTruthy();
    expect(word(p, 0).frame.question!.voice).toMatchObject({ own: true, ownAsset: 'recorded1' });
    expect(button('Use this recording')).toBeUndefined();
    expect(button('Record it now')).toBeTruthy();
    //the Play button now has the recording
    expect((button('Play') as HTMLButtonElement).disabled).toBe(false);
    s.undo();
    const undone = s.get().project;
    expect(undone.assets.find((a) => a.id === 'recorded1')).toBeUndefined();
    expect(nodeAsset(undone)).toBe('');
    //the one step took the whole of it back, to where Use was pressed
    expect(undone).toEqual(before);
  });

  it('Record again throws the old take away and starts over', async () => {
    await startOwn();
    await takeOne();
    await click(button('Record again'));
    expect(revoked).toContain('blob:take1');
    expect(host.textContent).toMatch(/Recording\.\.\./);
    expect(button('Use this recording')).toBeUndefined();
    await click(button('Stop recording'));
    await act(async () => {});
    expect(host.textContent).toMatch(/Recorded, /);
    expect(stored).toHaveLength(0);
  });

  it('leaving the word with a take pending discards it and says so when it was long enough', async () => {
    await startOwn();
    await takeOne(5);
    await goTo(1);
    expect(stored).toHaveLength(0);
    expect(revoked).toContain('blob:take1');
    expect(button('Use this recording')).toBeUndefined();
    expect(s.get().toast?.text).toMatch(/5\.0 s was not used, so it was thrown away/);
  });

  it('says nothing about a take shorter than two seconds that is left behind', async () => {
    await startOwn();
    await takeOne(0.8);
    await goTo(1);
    expect(s.get().toast).toBeNull();
    expect(stored).toHaveLength(0);
  });

  it('switching to Made with a voice drops a take that was not kept', async () => {
    await startOwn();
    await takeOne();
    await choose(select('Word audio'), 'voice');
    await choose(select('Word audio'), 'own');
    expect(button('Use this recording')).toBeUndefined();
    expect(stored).toHaveLength(0);
  });
});

describe('the words that go with it', () => {
  it('the starter checklist and the help topic both mention Play and the keep-or-discard step', async () => {
    const text = starter.build(COLOURWAYS[0]).checklist.map((c) => `${c.text} ${c.detail ?? ''}`).join('\n');
    expect(text).toMatch(/Play button under Word audio/);
    expect(text).toMatch(/Use this recording or Discard/);
    const { TOPICS } = await import('../src/help/topics');
    const spelling = JSON.stringify(TOPICS);
    expect(spelling).toMatch(/\*\*Play\*\* \(under \*\*Word audio\*\*/);
    expect(spelling).toMatch(/\*\*Use this recording\*\*/);
  });
});
