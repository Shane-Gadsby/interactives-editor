import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createArtboard, createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { LeftPanel } from '../src/panels/LeftPanel';
import { Inspector } from '../src/panels/Inspector';
import { Canvas } from '../src/canvas/Canvas';
import { DialogHost } from '../src/components/dialogs';
import { TOPICS as HELP_TOPICS } from '../src/help/topics';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  disconnect() {}
  unobserve() {}
};

let root: Root | null = null;
let host: HTMLElement | null = null;
let s: EditorStore;
const ids: Record<string, string> = {};

function mount(ui: JSX.Element) {
  const p = createProject('T');
  p.artboards[0].name = 'Home';
  for (const [i, n] of ['Intro', 'Quiz 1', 'Quiz 2', 'Results'].entries()) p.artboards.push(createArtboard({ name: n, width: 800, height: 600, canvasX: 1000 * (i + 1), canvasY: 0 }));
  for (const a of p.artboards) ids[a.name] = a.id;
  s = new EditorStore(p);
  setCurrentStore(s);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <>
        {ui}
        <DialogHost />
      </>,
    ),
  );
}
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => void setTimeout(fn, 0));
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = host = null;
  vi.unstubAllGlobals();
});

const names = (list: string[]) => list.map((i) => s.get().project.artboards.find((a) => a.id === i)?.name);
const row = (name: string) => [...host!.querySelectorAll<HTMLElement>('.artboard-row')].find((r) => r.querySelector('.layer-name')?.textContent === name)!;
const click = (el: Element, mods: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean } = {}) => act(() => void el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...mods })));
const rightClick = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 })));
const menuLabels = () => [...document.querySelectorAll('.ctx-menu [role="menuitem"], .ctx-menu .ctx-heading')].map((x) => (x.querySelector('.ctx-label') ?? x).textContent);
const menuItem = (label: string) => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((b) => b.textContent?.startsWith(label))!;
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 5))));

describe('the Layers panel with several artboards', () => {
  it('Ctrl/Cmd+click adds and removes, Shift+click takes the rows between, the chosen rows are marked', () => {
    mount(<LeftPanel />);
    click(row('Intro'));
    click(row('Quiz 2'), { ctrlKey: true });
    expect(names(s.pickedArtboards())).toEqual(['Intro', 'Quiz 2']);
    expect(row('Intro').classList.contains('selected')).toBe(true);
    expect(row('Quiz 1').classList.contains('selected')).toBe(false);
    click(row('Results'), { metaKey: true });
    click(row('Intro'), { ctrlKey: true });
    expect(names(s.pickedArtboards())).toEqual(['Quiz 2', 'Results']);
    click(row('Home'));
    click(row('Quiz 1'), { shiftKey: true });
    expect(names(s.pickedArtboards())).toEqual(['Home', 'Intro', 'Quiz 1']);
    //a plain click is just that one again
    click(row('Results'));
    expect(names(s.pickedArtboards())).toEqual(['Results']);
    expect(host!.querySelectorAll('.artboard-row.selected')).toHaveLength(1);
  });

  it('right-click on a chosen row offers the group, tidy, duplicate and delete items for all of them', () => {
    mount(<LeftPanel />);
    click(row('Intro'));
    click(row('Quiz 1'), { ctrlKey: true });
    rightClick(row('Quiz 1'));
    const labels = menuLabels();
    expect(labels).toContain('2 pages');
    expect(labels.some((l) => l?.startsWith('Group pages'))).toBe(true);
    expect(labels).toContain('Tidy up');
    expect(labels).toContain('Duplicate');
    expect(labels.some((l) => l?.startsWith('Delete pages'))).toBe(true);
    //it didn't change the selection
    expect(names(s.pickedArtboards())).toEqual(['Intro', 'Quiz 1']);
  });

  it('right-click on a row that is not chosen picks it first', () => {
    mount(<LeftPanel />);
    click(row('Intro'));
    click(row('Quiz 1'), { ctrlKey: true });
    rightClick(row('Results'));
    expect(names(s.pickedArtboards())).toEqual(['Results']);
  });

  it('Group artboards asks for a name, lists the artboards under a group row, and folds it', async () => {
    mount(<LeftPanel />);
    click(row('Quiz 1'));
    click(row('Quiz 2'), { ctrlKey: true });
    rightClick(row('Quiz 2'));
    act(() => menuItem('Group pages').click());
    await settle();
    const input = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
    expect(input.value).toBe('Group');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
      setter.call(input, 'Quiz section');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((b) => b.textContent === 'Group')!.click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(s.get().project.artboardGroups?.map((g) => g.name)).toEqual(['Quiz section']);
    const rows = [...host!.querySelectorAll('.artboard-row')].map((r) => r.querySelector('.layer-name')?.textContent);
    expect(rows).toEqual(['Home', 'Intro', 'Quiz section', 'Quiz 1', 'Quiz 2', 'Results']);
    expect(row('Quiz 1').classList.contains('in-group')).toBe(true);
    expect(row('Quiz section').classList.contains('selected')).toBe(true);
    //folding hides the artboards, not the group row
    click(row('Quiz section').querySelector('.twisty')!);
    expect([...host!.querySelectorAll('.artboard-row')].map((r) => r.querySelector('.layer-name')?.textContent)).toEqual(['Home', 'Intro', 'Quiz section', 'Results']);
    //a click on the group row picks all its artboards
    click(row('Home'));
    click(row('Quiz section'));
    expect(names(s.pickedArtboards())).toEqual(['Quiz 1', 'Quiz 2']);
  });

  it('the group row menu has Select all in group, Rename group, Ungroup, Tidy up, Duplicate and Delete', () => {
    mount(<LeftPanel />);
    let gid = '';
    act(() => void (gid = s.groupArtboards([ids['Quiz 1'], ids['Quiz 2']], 'Quiz')!));
    rightClick(row('Quiz'));
    const labels = menuLabels();
    for (const l of ['Select all in group', 'Rename group…', 'Ungroup', 'Tidy up', 'Duplicate']) expect(labels).toContain(l);
    act(() => menuItem('Ungroup').click());
    expect(s.get().project.artboardGroups).toBeUndefined();
    expect(gid).toBeTruthy();
    expect(host!.querySelector('.group-row')).toBeNull();
  });

  it('the artboard menu of a grouped artboard has Ungroup and Select all in group', () => {
    mount(<LeftPanel />);
    act(() => void s.groupArtboards([ids['Quiz 1'], ids['Quiz 2']], 'Quiz'));
    click(row('Quiz 1'));
    rightClick(row('Quiz 1'));
    const labels = menuLabels();
    expect(labels).toContain('Ungroup');
    expect(labels).toContain('Select all in group');
    expect(labels).toContain('Rename group…');
    act(() => menuItem('Select all in group').click());
    expect(names(s.pickedArtboards())).toEqual(['Quiz 1', 'Quiz 2']);
  });
});

describe('the inspector with several artboards', () => {
  it('shows what applies to all of them instead of one artboard\'s settings', () => {
    mount(<Inspector />);
    expect(host!.textContent).toContain('Background');
    act(() => s.pickArtboards([ids['Intro'], ids['Quiz 1'], ids['Quiz 2']]));
    expect(host!.textContent).toContain('3 pages');
    expect(host!.textContent).not.toContain('Background');
    const titles = [...host!.querySelectorAll('[title]')].map((e) => e.getAttribute('title'));
    expect(titles).toContain('Align left edges');
    expect(titles).toContain('Distribute horizontally (3 or more)');
    act(() => (host!.querySelector('[title="Align left edges"]') as HTMLElement).click());
    expect(new Set(names([ids['Intro'], ids['Quiz 1'], ids['Quiz 2']]).map((n) => s.get().project.artboards.find((a) => a.name === n)!.canvasX)).size).toBe(1);
  });
});

describe('the canvas names of artboards', () => {
  const label = (name: string) => [...host!.querySelectorAll<SVGTextElement>('text.ab-label')].find((t) => t.textContent!.startsWith(name))!;
  const press = (el: Element, mods: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean } = {}, button = 0) => {
    act(() => void el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button, ...mods })));
    act(() => void el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true, button, ...mods })));
  };

  it('Ctrl/Cmd+click adds an artboard to the selection and takes it out; Shift+click adds', () => {
    mount(<Canvas />);
    press(label('Intro'));
    expect(names(s.pickedArtboards())).toEqual(['Intro']);
    press(label('Quiz 1'), { ctrlKey: true });
    press(label('Quiz 2'), { shiftKey: true });
    press(label('Results'), { metaKey: true });
    expect(names(s.pickedArtboards())).toEqual(['Intro', 'Quiz 1', 'Quiz 2', 'Results']);
    press(label('Quiz 1'), { ctrlKey: true });
    expect(names(s.pickedArtboards())).toEqual(['Intro', 'Quiz 2', 'Results']);
    //the chosen names get the gold chip, the outlines are the usual blue ones
    expect(host!.querySelectorAll('.ab-label.picked')).toHaveLength(3);
    expect(host!.querySelectorAll('rect.sel-outline').length).toBe(3);
  });

  it('a click on one of several chosen names picks just that one, a drag keeps them all', () => {
    mount(<Canvas />);
    act(() => void s.pickArtboards([ids['Intro'], ids['Quiz 1'], ids['Quiz 2']]));
    press(label('Quiz 1'));
    expect(names(s.pickedArtboards())).toEqual(['Quiz 1']);
    act(() => void s.pickArtboards([ids['Intro'], ids['Quiz 1'], ids['Quiz 2']]));
    act(() => void label('Quiz 1').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 100, clientY: 100 })));
    act(() => void host!.querySelector('.canvas')!.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, cancelable: true, clientX: 160, clientY: 130 })));
    act(() => void host!.querySelector('.canvas')!.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: 160, clientY: 130 })));
    expect(names(s.pickedArtboards())).toEqual(['Intro', 'Quiz 1', 'Quiz 2']);
  });

  it('dragging a name moves every chosen artboard together, in one undo step', () => {
    mount(<Canvas />);
    act(() => void s.pickArtboards([ids['Intro'], ids['Quiz 1']]));
    const before = s.get().project.artboards.map((a) => [a.canvasX, a.canvasY]);
    act(() => void label('Intro').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 100, clientY: 100 })));
    const zoom = s.get().zoom;
    act(() => void host!.querySelector('.canvas')!.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, cancelable: true, clientX: 100 + 50 * zoom, clientY: 100 + 20 * zoom })));
    act(() => void host!.querySelector('.canvas')!.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, cancelable: true, clientX: 100 + 100 * zoom, clientY: 100 + 40 * zoom })));
    act(() => void host!.querySelector('.canvas')!.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: 100 + 100 * zoom, clientY: 100 + 40 * zoom })));
    const after = s.get().project.artboards.map((a) => [a.canvasX, a.canvasY]);
    const moved = after.map((p, i) => [p[0] - before[i][0], p[1] - before[i][1]]);
    expect(moved[0]).toEqual([0, 0]);
    expect(moved[1]).toEqual([100, 40]);
    expect(moved[2]).toEqual([100, 40]);
    expect(moved[3]).toEqual([0, 0]);
    s.undo();
    expect(s.get().project.artboards.map((a) => [a.canvasX, a.canvasY])).toEqual(before);
  });

  it('draws a frame and a name for a group, and a click on the name picks its artboards', () => {
    mount(<Canvas />);
    s.groupArtboards([ids['Quiz 1'], ids['Quiz 2']], 'Quiz section');
    act(() => void s.pickArtboards([ids['Home']]));
    expect(host!.querySelectorAll('rect.ab-group-frame')).toHaveLength(1);
    expect(host!.querySelector('text.ab-group-title')?.textContent).toContain('Quiz section');
    press(host!.querySelector('rect.ab-group-chip')!);
    expect(names(s.pickedArtboards())).toEqual(['Quiz 1', 'Quiz 2']);
  });

  it('right-click on a name gives the artboard menu for the chosen artboards', () => {
    mount(<Canvas />);
    press(label('Intro'));
    press(label('Quiz 1'), { ctrlKey: true });
    rightClick(label('Quiz 1'));
    const labels = menuLabels();
    expect(labels).toContain('2 pages');
    expect(labels.some((l) => l?.startsWith('Group pages'))).toBe(true);
    expect(labels).toContain('Tidy up');
  });

  it('Delete asks before it deletes several artboards', async () => {
    mount(
      <>
        <Canvas />
      </>,
    );
    const { deleteSelectionCommand } = await import('../src/lib/artboard-commands');
    s.pickArtboards([ids['Intro'], ids['Quiz 1']]);
    act(() => deleteSelectionCommand());
    await settle();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Delete 2 pages?');
    expect(s.get().project.artboards).toHaveLength(5);
    await act(async () => {
      [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((b) => b.textContent === 'Delete 2 pages')!.click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(s.get().project.artboards.map((a) => a.name)).toEqual(['Home', 'Quiz 2', 'Results']);
    s.undo();
    expect(s.get().project.artboards).toHaveLength(5);
  });
});

describe('help', () => {
  it('the Artboards and Layers panel topics explain selecting and grouping artboards', () => {
    const text = (id: string) => JSON.stringify(HELP_TOPICS.find((t) => t.id === id));
    for (const id of ['artboards', 'layers-panel']) {
      expect(text(id)).toMatch(/Ctrl/);
      expect(text(id).toLowerCase()).toContain('group');
    }
  });
});
