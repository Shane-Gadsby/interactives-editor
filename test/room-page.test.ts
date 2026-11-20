//A room to look around and a map, built by + New room and + New map, played from a script with nothing else wired:
//five places, two hidden coins, a key to show someone, and a place the story opens on the map.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, createProject, walk, type Project, type SceneNode } from 'interactives-player';
import { addPage, mapPage, roomPage } from '../src/lib/room-page';
import { storyStage, HIDE_VAR } from '../src/lib/story';

describe('a room and a map from the script', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:1280px;height:720px"></div>';
    vi.stubGlobal('requestAnimationFrame', (fn: () => void) => setTimeout(fn, 0) as unknown as number);
    vi.stubGlobal('cancelAnimationFrame', (h: number) => clearTimeout(h));
  });
  afterEach(() => vi.unstubAllGlobals());
  const flush = () => new Promise((r) => setTimeout(r, 15));

  it('has five places, two coins and a key, and plays through with no wiring of its own', async () => {
    const p = createProject('Room') as Project;
    p.variables.push({ id: 'hide', name: HIDE_VAR, type: 'boolean', initial: false });
    const stage = storyStage('hide');
    p.artboards = [stage];
    const roomId = addPage(p, roomPage());
    addPage(p, mapPage());
    const room = p.artboards.find((a) => a.id === roomId)!;
    const looks: SceneNode[] = [];
    walk(room.children, (n) => void (n.examine && looks.push(n)));
    expect(looks.filter((n) => n.examine!.text && !n.examine!.coins).length).toBe(5);
    expect(looks.filter((n) => n.examine!.coins).length).toBe(2);
    expect(looks.filter((n) => n.examine!.item).length).toBe(1);
    p.story = {
      stage: stage.id,
      settings: { coins: 0 },
      chapters: [{ id: 'c', name: 'One', lines: ['[call Room]', '? Show the brass key [if has("Brass key")]', '    Olive: The shed key!', '? Say nothing', '[place Library]', '[call Map]', 'Never here.', '# Library', 'Books everywhere.'].map((text, i) => ({ id: 'l' + i, text })) }],
    };
    const pl = new Player(document.getElementById('stage')!, JSON.parse(JSON.stringify(p)), { loadData: false });
    await flush();
    expect(pl.artboard.id).toBe(roomId);
    const click = async (id: string) => {
      document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    };
    for (const n of looks) {
      await click(n.id);
      //go on through its words until the box is put away
      for (let i = 0; i < 4; i++) await click(room.children[0].id);
    }
    expect(pl.pocket.coins).toBe(2);
    expect(pl.pocket.items).toEqual(['Brass key']);
    const leave = room.children.find((c) => c.name === 'Leave')!;
    await click(leave.id);
    expect(pl.artboard.id).toBe(stage.id);
    expect(pl.story!.choices.map((c) => c.text)).toEqual(['Show the brass key', 'Say nothing']);
    pl.story!.pick(1);
    await flush();
    expect(pl.story!.text).toBe('The shed key!');
    pl.story!.goOn();
    pl.story!.goOn();
    await flush();
    expect(pl.artboard.name).toBe('Map');
    const place = [...document.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent === 'Library')!;
    place.click();
    await flush();
    await flush();
    expect(pl.artboard.id).toBe(stage.id);
    expect(pl.story!.text).toBe('Books everywhere.');
    pl.destroy();
  });
});
