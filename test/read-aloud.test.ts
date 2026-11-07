//Read aloud in the editor: the project setting, the standard Listen button layer, and the Say it like field's data.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, createProject, sanitizeProject, walk, type FrameNode, type Project } from 'interactives-player';
import { EditorStore } from '../src/store/store';
import { addListenButton } from '../src/lib/listen-button';
import { patchReadAloud } from '../src/panels/ReadAloudSection';
import { getTopic, topicBody } from '../src/help/topics';

describe('the project setting', () => {
  it('keeps only what differs from the defaults, and clears itself when nothing is left', () => {
    const p = createProject('R');
    expect(patchReadAloud(p, { offer: true })).toEqual({ offer: true });
    p.settings.readAloud = { offer: true, lang: 'fr-CA', at: 'top' };
    expect(patchReadAloud(p, { at: 'bottom' })).toEqual({ offer: true, lang: 'fr-CA' });
    expect(patchReadAloud(p, { lang: undefined })).toEqual({ offer: true, at: 'top' });
    p.settings.readAloud = { offer: true };
    expect(patchReadAloud(p, { offer: false })).toBeUndefined();
  });
  it('survives sanitising and a save', () => {
    const p = createProject('R');
    p.settings.readAloud = { offer: true, lang: 'en-AU', at: 'top' };
    expect(sanitizeProject(JSON.parse(JSON.stringify(p))).settings.readAloud).toEqual({ offer: true, lang: 'en-AU', at: 'top' });
  });
});

describe('the Listen button layer', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  const make = () => {
    const s = new EditorStore(createProject('L'));
    const abId = s.get().project.artboards[0].id;
    let id = '';
    s.update((d) => void (id = addListenButton(d as Project, abId)!));
    return { s, abId, id, p: () => s.get().project };
  };

  it('adds a frame with a button and a no-voice line, and the graph that reads or stops', () => {
    const { p, id } = make();
    const ab = p().artboards[0];
    const frame = ab.children.find((c) => c.id === id) as FrameNode;
    expect(frame.name).toBe('Listen button');
    const [button, note] = frame.children;
    expect(button.type).toBe('button');
    expect(button.bindings).toMatchObject({ visible: 'voiceAvailable' });
    expect(note.bindings).toMatchObject({ visible: '!voiceAvailable' });
    const kinds = ab.logic.nodes.map((n) => n.kind);
    expect(kinds).toEqual(['event.pointer', 'logic.if', 'action.speak', 'action.speak']);
    expect(ab.logic.nodes[0].params.target).toBe(button.id);
    expect(ab.logic.nodes[2].params.op).toBe('stop');
    expect(ab.logic.nodes[3].params.op).toBe('page');
    expect(ab.logic.edges.map((e) => e.fromPort)).toEqual(['out', 'true', 'false']);
  });

  it('a second one gets its own names, and every layer name stays unique', () => {
    const { s, abId, p } = make();
    s.update((d) => void addListenButton(d as Project, abId));
    const names: string[] = [];
    walk(p().artboards[0].children, (n) => void names.push(n.name));
    expect(new Set(names).size).toBe(names.length);
  });

  it('plays: with a voice the button shows and reads the artboard, with none it is hidden and the line shows', async () => {
    const said: string[] = [];
    const voices = [{ name: 'L', lang: 'en-GB', localService: true }];
    vi.stubGlobal('SpeechSynthesisUtterance', class { voice: unknown = null; lang = ''; rate = 1; volume = 1; onend: (() => void) | null = null; onerror: (() => void) | null = null; constructor(public text: string) {} });
    vi.stubGlobal('speechSynthesis', {
      getVoices: () => voices,
      speak: (u: { text: string }) => void said.push(u.text),
      cancel: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    const { s, p } = make();
    s.update((d) => {
      const ab = (d as Project).artboards[0];
      ab.children.unshift({ ...(ab.children[0] as object), id: 'hello', name: 'Hello', type: 'text', text: 'Welcome to the activity', width: 300, height: 30, x: 0, y: 0 } as never);
    });
    const player = new Player(document.getElementById('stage')!, JSON.parse(JSON.stringify(p())), { loadData: false });
    player.step(16);
    const ab = p().artboards[0];
    const frame = ab.children.find((c) => c.name === 'Listen button') as FrameNode;
    const el = (id: string) => document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`)!;
    expect(el(frame.children[0].id).style.display).not.toBe('none');
    el(frame.children[0].id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(said[0]).toMatch(/^Welcome to the activity\./);
    expect(said[0]).not.toMatch(/Listen/);
    player.destroy();
    voices.length = 0;
    const quiet = new Player(document.getElementById('stage')!, JSON.parse(JSON.stringify(p())), { loadData: false });
    quiet.step(16);
    expect(el(frame.children[0].id).style.display).toBe('none');
    expect(el(frame.children[1].id).style.display).not.toBe('none');
    quiet.destroy();
  });
});

describe('help', () => {
  it('has a Read it to me topic that names the setting, the node and the field', () => {
    const t = getTopic('read-aloud')!;
    expect(t).toBeTruthy();
    const body = topicBody(t);
    for (const word of ['Offer read-aloud', 'Say it like', 'Read aloud', 'voiceAvailable', 'ix.speech']) expect(body).toContain(word);
    expect(body).not.toContain('—');
  });
});
