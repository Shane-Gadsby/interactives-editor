import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createArtboard, createNode, createProject, type Project } from 'interactives-player';
import { buildSnapshot } from '../shared/library.mjs';
import { detachArtboard, lockViolation } from '../src/lib/libraries';
import { EditorStore, setCurrentStore } from '../src/store/store';

const LIB = 'prkit0002';

function library(): Project {
  const lib = createProject('Kit');
  lib.id = LIB;
  lib.settings.library = true;
  const card = lib.artboards[0];
  card.name = 'Card';
  card.publish = true;
  const icon = createArtboard({ name: 'Icon', width: 24, height: 24 });
  icon.children.push(createNode('ellipse', { name: 'Dot', width: 24, height: 24 }));
  card.children.push(createNode('rect', { name: 'Bg', width: 200, height: 60 }), createNode('instance', { name: 'Icon', artboardId: icon.id, width: 24, height: 24 }));
  lib.artboards.push(icon);
  return lib;
}

const snapshot = { ...buildSnapshot(library()), version: 1 };
vi.mock('../src/lib/db', async (orig) => ({
  ...(await orig<typeof import('../src/lib/db')>()),
  getLibrary: async () => ({ library: { id: LIB, name: 'Kit', version: 1 }, snapshot }),
}));

import { useComponent } from '../src/lib/library-actions';

const info = { id: LIB, name: 'Kit', version: 1 } as never;
let s: EditorStore;
beforeEach(() => {
  s = new EditorStore(createProject('Consumer'));
  setCurrentStore(s);
});
const artboards = () => s.get().project.artboards;
const homeId = () => artboards()[0].id;
const cardId = () => snapshot.components[0].id;

describe('placing a library component', () => {
  it('puts one instance on the artboard and keeps the copies it needs off the canvas', async () => {
    await useComponent(info, cardId(), { artboardId: homeId(), at: { x: 10, y: 20 } });
    const [home, ...copies] = artboards();
    expect(home.children.filter((n) => n.type === 'instance')).toHaveLength(1);
    // the component's copy and the Icon it uses inside are both there, both library copies, both hidden from the canvas
    expect(copies).toHaveLength(2);
    expect(copies.every((a) => a.library && a.canvasHidden)).toBe(true);
    expect(home.canvasHidden).toBeUndefined();
  });

  it('placing it again adds an instance and no further copies', async () => {
    await useComponent(info, cardId(), { artboardId: homeId() });
    await useComponent(info, cardId(), { artboardId: homeId() });
    expect(artboards()).toHaveLength(3);
    expect(artboards()[0].children.filter((n) => n.type === 'instance')).toHaveLength(2);
  });

  it('Add artboard shows the copy on the canvas, even when a drop had hidden it', async () => {
    await useComponent(info, cardId(), { artboardId: homeId() });
    await useComponent(info, cardId());
    const card = artboards().find((a) => a.library && !a.library.internal)!;
    expect(card.canvasHidden).toBeUndefined();
    // a fresh project: Add artboard on its own adds the copy visible
    s = new EditorStore(createProject('Other'));
    setCurrentStore(s);
    await useComponent(info, cardId());
    expect(artboards().filter((a) => a.library && !a.library.internal).every((a) => !a.canvasHidden)).toBe(true);
  });

  it('showing or hiding a copy is allowed on a read-only library artboard, and detaching shows it', async () => {
    await useComponent(info, cardId(), { artboardId: homeId() });
    const before = s.get().project;
    const copy = before.artboards[1];
    const toggled = { ...before, artboards: before.artboards.map((a) => (a.id === copy.id ? { ...a, canvasHidden: false } : a)) };
    expect(lockViolation(before, toggled as Project)).toBeNull();
    s.update((d) => void detachArtboard(d as Project, copy.id), { library: true });
    const detached = s.get().project.artboards.find((a) => a.id === copy.id)!;
    expect(detached.library).toBeUndefined();
    expect(detached.canvasHidden).toBeUndefined();
  });
});
