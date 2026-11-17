//A second tab open on a project while another restores a version: the tab starts again from the server's copy, and a copy that
//was asked for earlier (an earlier reset, say the save that comes before a restore) can't land after the newer one
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNode, createProject, type Project } from 'interactives-player';
import { EditorStore } from '../src/store/store';
import { LiveSession, liveSession, setLiveSession } from '../src/lib/live';

//What the server has right now, and the requests for it that have not been answered yet (each one holds the copy the server had
//when it was asked, and the test answers them in whatever order it likes)
let server: Project;
const loads: { copy: Project; answer: () => void }[] = [];
vi.mock('../src/lib/db', () => ({
  loadProjectRecord: vi.fn(
    () =>
      new Promise<Project | null>((resolve) => {
        const copy = JSON.parse(JSON.stringify(server)) as Project;
        loads.push({ copy, answer: () => resolve(copy) });
      }),
  ),
}));

const sources: FakeES[] = [];
class FakeES {
  listeners: Record<string, ((e: { data: string }) => void)[]> = {};
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    sources.push(this);
  }
  addEventListener(n: string, f: (e: { data: string }) => void) {
    (this.listeners[n] ??= []).push(f);
  }
  close() {}
  emit(n: string, data: unknown) {
    for (const f of this.listeners[n] ?? []) f({ data: JSON.stringify(data) });
  }
}
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

async function open(withNote: boolean) {
  sources.length = 0;
  loads.length = 0;
  vi.stubGlobal('EventSource', FakeES);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ user: null, power: false }) }) as Response));
  const p = createProject('T');
  p.artboards[0].children.push(createNode('rect', { id: 'a', name: 'A' }));
  if (withNote) p.notes = [{ id: 'n1', x: 10, y: 10, width: 200, height: 100, text: 'Remember this', colour: 'yellow' } as never];
  const s = new EditorStore(p);
  setLiveSession(new LiveSession('proj1', s, 0));
  await tick(20);
  const es = sources[0];
  es.emit('hello', { seq: 0, rev: 1, clientId: 'x', color: '#f00', peers: [] });
  return { s, es };
}
const restored = (): Project => {
  const p = createProject('T');
  p.artboards[0].children.push(createNode('rect', { id: 'a', name: 'A' }));
  return p;
};

afterEach(() => {
  liveSession()?.close();
  setLiveSession(null);
  vi.unstubAllGlobals();
});

/** Answer what is waiting, newest request first, until nothing is. */
async function answerNewestFirst() {
  for (let i = 0; i < 10 && loads.length; i++) {
    loads.pop()!.answer();
    await tick();
  }
}

describe('a live tab after a version is restored elsewhere', () => {
  it('drops a note the restored version does not have', async () => {
    const { s, es } = await open(true);
    expect(s.get().project.notes).toHaveLength(1);
    server = restored();
    es.emit('reset', { rev: 5 });
    await tick();
    await answerNewestFirst();
    expect(s.get().project.notes ?? []).toHaveLength(0);
  });

  it('keeps the newest copy when two resets come close together and the newer answer arrives first', async () => {
    const { s, es } = await open(true);
    //the save that comes before the restore: the server has the old project with the note
    server = JSON.parse(JSON.stringify(s.get().project));
    es.emit('reset', { rev: 4 });
    await tick();
    //then the restore: the server has the older version now
    server = restored();
    es.emit('reset', { rev: 5 });
    await tick();
    await answerNewestFirst();
    expect(s.get().project.notes ?? []).toHaveLength(0);
  });
});
