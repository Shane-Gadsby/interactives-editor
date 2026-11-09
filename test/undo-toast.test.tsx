import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createArtboard, createNode, createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { ToastView } from '../src/components/ToastView';
import { tidyTheseCommand } from '../src/lib/artboard-commands';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Home plus three more, scattered so Tidy has something to do. */
function make() {
  const p = createProject('T');
  p.artboards[0].name = 'Home';
  for (const [i, n] of ['Intro', 'Quiz', 'Results'].entries()) p.artboards.push(createArtboard({ name: n, width: 400, height: 300, canvasX: 900 * (i + 1) + (i % 2) * 37, canvasY: 200 * i }));
  const s = new EditorStore(p);
  setCurrentStore(s);
  const id = (name: string) => s.get().project.artboards.find((a) => a.name === name)!.id;
  return { s, id };
}
const names = (s: EditorStore) => s.get().project.artboards.map((a) => a.name);
const positions = (s: EditorStore) => JSON.stringify(s.get().project.artboards.map((a) => [a.canvasX, a.canvasY]));

describe('a message with an Undo button', () => {
  it('still goes away on its own after the Undo button has gone stale', () => {
    vi.useFakeTimers();
    try {
      const { s } = make();
      const mark = s.historyMark();
      s.tidyArtboards();
      s.toastUndo('Tidied.', mark);
      // something else changes the document, which turns the button off (a new toast object)
      s.update((d) => void (d.artboards[0].name = 'Start'));
      expect(s.get().toast?.action?.stale).toBe(true);
      vi.advanceTimersByTime(9100);
      expect(s.get().toast).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a newer message is not cleared by the older one running out', () => {
    vi.useFakeTimers();
    try {
      const { s } = make();
      s.toast('First');
      vi.advanceTimersByTime(2000);
      s.toast('Second');
      vi.advanceTimersByTime(600);
      expect(s.get().toast?.text).toBe('Second');
      vi.advanceTimersByTime(2000);
      expect(s.get().toast).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('Undo takes back exactly the change and offers Redo', () => {
    const { s } = make();
    const before = positions(s);
    const mark = s.historyMark();
    s.tidyArtboards();
    s.toastUndo('Tidied.', mark);
    const after = positions(s);
    expect(after).not.toBe(before);
    expect(s.get().toast?.action).toEqual({ kind: 'undo', steps: 1 });
    expect(s.runToastAction()).toBe(true);
    expect(positions(s)).toBe(before);
    expect(s.get().toast).toMatchObject({ text: 'Undone', action: { kind: 'redo', steps: 1 } });
    expect(s.runToastAction()).toBe(true);
    expect(positions(s)).toBe(after);
    expect(s.get().toast).toMatchObject({ text: 'Redone', action: { kind: 'undo', steps: 1 } });
  });

  it('a command that took several undo steps is undone as a whole, and no more', () => {
    const { s } = make();
    const keep = s.get().project.artboards.length;
    const mark = s.historyMark();
    s.update((d) => void (d.artboards[0].name = 'A'));
    s.update((d) => void (d.artboards[0].name = 'B'));
    s.toastUndo('Two things.', mark);
    expect(s.get().toast?.action?.steps).toBe(2);
    s.runToastAction();
    expect(s.get().project.artboards[0].name).not.toBe('A');
    expect(s.get().project.artboards[0].name).not.toBe('B');
    expect(s.get().project.artboards).toHaveLength(keep);
    expect(s.get().project.artboards[0].name).toBe('Home');
  });

  it('turns itself off once anything else changes, and then does nothing', () => {
    const { s, id } = make();
    const mark = s.historyMark();
    s.tidyArtboards();
    s.toastUndo('Tidied.', mark);
    expect(s.get().toast?.action?.stale).toBeFalsy();
    s.update((d) => void (d.artboards[0].name = 'Renamed since'));
    expect(s.get().toast?.action?.stale).toBe(true);
    const now = positions(s);
    expect(s.runToastAction()).toBe(false);
    expect(positions(s)).toBe(now);
    expect(s.get().project.artboards[0].name).toBe('Renamed since');
    void id;
  });

  it('turns itself off when the person undoes with the keyboard first', () => {
    const { s } = make();
    const mark = s.historyMark();
    s.tidyArtboards();
    s.toastUndo('Tidied.', mark);
    s.undo();
    expect(s.get().toast?.action?.stale).toBe(true);
    expect(s.runToastAction()).toBe(false);
  });

  it('a silent measurement patch does not turn it off', () => {
    const { s } = make();
    const mark = s.historyMark();
    s.tidyArtboards();
    s.toastUndo('Tidied.', mark);
    s.patchSilently((d) => void (d.artboards[0].canvasX += 1));
    expect(s.get().toast?.action?.stale).toBeFalsy();
  });

  it('a command that changed nothing is a plain message', () => {
    const { s } = make();
    const mark = s.historyMark();
    s.toastUndo('Nothing happened.', mark);
    expect(s.get().toast).toMatchObject({ text: 'Nothing happened.' });
    expect(s.get().toast?.action).toBeUndefined();
  });

  it('the Redo message goes stale too when something else changes', () => {
    const { s } = make();
    const mark = s.historyMark();
    s.tidyArtboards();
    s.toastUndo('Tidied.', mark);
    s.runToastAction();
    s.update((d) => void (d.artboards[0].name = 'Else'));
    expect(s.get().toast?.action?.stale).toBe(true);
    expect(s.runToastAction()).toBe(false);
  });

  it('the commands that make big changes carry it', () => {
    const { s, id } = make();
    tidyTheseCommand([id('Intro'), id('Quiz'), id('Results')]);
    expect(s.get().toast?.action?.kind).toBe('undo');
    const before = names(s);
    s.deleteArtboards([id('Quiz')]);
    expect(s.get().toast).toMatchObject({ text: 'Deleted the page.', action: { kind: 'undo' } });
    expect(names(s)).not.toContain('Quiz');
    s.runToastAction();
    expect(names(s)).toEqual(before);
    s.deleteArtboards([id('Intro'), id('Results')]);
    expect(s.get().toast?.text).toBe('Deleted 2 pages.');
  });

  it('refusing to delete the last page says so and offers no Undo', () => {
    const p = createProject('T');
    const s = new EditorStore(p);
    setCurrentStore(s);
    s.deleteArtboards([s.get().project.artboards[0].id]);
    expect(s.get().toast).toMatchObject({ kind: 'error' });
    expect(s.get().toast?.action).toBeUndefined();
  });

  it('moving layers to another page carries one', () => {
    const { s, id } = make();
    const r = createNode('rect', { name: 'box' });
    s.update((d) => void d.artboards[0].children.push(r));
    s.set({ activeArtboardId: s.get().project.artboards[0].id });
    s.moveToArtboard([r.id], id('Quiz'));
    expect(s.get().toast?.action?.kind).toBe('undo');
    expect(s.get().project.artboards.find((a) => a.name === 'Quiz')!.children.some((c) => c.name === 'box')).toBe(true);
    s.runToastAction();
    expect(s.get().project.artboards.find((a) => a.name === 'Quiz')!.children.some((c) => c.name === 'box')).toBe(false);
    expect(s.get().project.artboards[0].children.some((c) => c.name === 'box')).toBe(true);
  });
});

describe('the report after an import', () => {
  it('has an Undo that takes the import back, unless something else changed', () => {
    const { s } = make();
    let mark = s.historyMark();
    s.update((d) => void d.artboards.push(createArtboard({ name: 'Imported' })));
    s.setReportUndo('Imported thing', ['A part was left out'], mark);
    expect(s.get().report?.undo).toBeTruthy();
    expect(s.undoReport()).toBe(true);
    expect(names(s)).not.toContain('Imported');
    expect(s.get().report).toBeNull();
    mark = s.historyMark();
    s.update((d) => void d.artboards.push(createArtboard({ name: 'Imported' })));
    s.setReportUndo('Imported thing', ['x'], mark);
    s.update((d) => void (d.artboards[0].name = 'Other'));
    expect(s.undoReport()).toBe(false);
    expect(names(s)).toContain('Imported');
  });
});

describe('the message itself', () => {
  let root: Root;
  let host: HTMLElement;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('shows a real button that a click and the keyboard both work', () => {
    const { s } = make();
    const before = positions(s);
    const mark = s.historyMark();
    s.tidyArtboards();
    s.toastUndo('Tidied 3 artboards.', mark);
    act(() => root.render(<ToastView toast={s.get().toast!} />));
    const status = host.querySelector('[role="status"]')!;
    expect(status.textContent).toContain('Tidied 3 artboards.');
    const b = host.querySelector<HTMLButtonElement>('button.toast-action')!;
    expect(b.tagName).toBe('BUTTON');
    expect(b.textContent).toBe('Undo');
    expect(b.disabled).toBe(false);
    act(() => b.click());
    expect(positions(s)).toBe(before);
    act(() => root.render(<ToastView toast={s.get().toast!} />));
    expect(host.querySelector('button.toast-action')!.textContent).toBe('Redo');
    expect(host.textContent).toContain('Undone');
  });

  it('the stale button is disabled and says why', () => {
    const { s } = make();
    const mark = s.historyMark();
    s.tidyArtboards();
    s.toastUndo('Tidied.', mark);
    s.update((d) => void (d.artboards[0].name = 'Else'));
    act(() => root.render(<ToastView toast={s.get().toast!} />));
    const b = host.querySelector<HTMLButtonElement>('button.toast-action')!;
    expect(b.disabled).toBe(true);
    expect(b.title).toMatch(/Something else has changed/);
  });

  it('an error is announced as an alert and a plain message has no button', () => {
    act(() => root.render(<ToastView toast={{ text: 'Not saved', kind: 'error' }} />));
    expect(host.querySelector('[role="alert"]')).toBeTruthy();
    expect(host.querySelector('button')).toBeNull();
  });
});
