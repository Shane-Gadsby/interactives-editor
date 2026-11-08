import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type TextNode, type TextRun } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { TextToolbar, type ToolbarCommands } from '../src/canvas/TextToolbar';
import { Inspector } from '../src/panels/Inspector';
import { loadCatalog } from '../src/lib/font-catalog';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
beforeAll(async () => {
  await loadCatalog();
});
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

/** A text layer being edited with a selection, and the toolbar over it. */
function mount(text: string, runs: TextRun[] | undefined, sel: { start: number; end: number }, box = { left: 100, top: 100, width: 200, height: 40 }) {
  const p = createProject('T');
  const t = createNode('text', { name: 'T', text, ...(runs ? { runs } : {}) } as never) as TextNode;
  p.artboards[0].children.push(t);
  const s = new EditorStore(p);
  setCurrentStore(s);
  s.select([t.id]);
  s.set({ editingTextId: t.id, textSelection: { id: t.id, ...sel } });
  const editor = createRef<HTMLDivElement>();
  const commands = { current: null as ToolbarCommands | null };
  const node = () => s.artboard()!.children.find((n) => n.id === t.id) as TextNode;
  const render = () =>
    act(() =>
      root.render(
        <>
          <div ref={editor} tabIndex={0} className="text-editor" />
          <TextToolbar node={node()} editor={editor} commands={commands} box={box} bounds={{ width: 800, height: 600 }} />
        </>,
      ),
    );
  render();
  return { s, t, node, editor, commands, render };
}
const btn = (label: string) => host.querySelector<HTMLButtonElement>(`.text-toolbar button[aria-label="${label}"]`)!;
const click = (el: HTMLElement) => act(() => el.click());
const setValue = (el: HTMLInputElement | HTMLSelectElement, v: string, ev: 'input' | 'change') => {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v);
  act(() => void el.dispatchEvent(new Event(ev, { bubbles: true })));
};

describe('the toolbar shows the selection', () => {
  it('has the controls and is a labelled toolbar', () => {
    mount('Hello world', undefined, { start: 0, end: 5 });
    const tb = host.querySelector('.text-toolbar')!;
    expect(tb.getAttribute('role')).toBe('toolbar');
    expect(tb.getAttribute('aria-label')).toBe('Text formatting');
    for (const l of ['Bold', 'Italic', 'Underline', 'Strikethrough', 'Link', 'Clear formatting']) expect(btn(l), l).toBeTruthy();
    expect(host.querySelector('[aria-label="Font size"]')).toBeTruthy();
    expect(host.querySelector('[aria-label="Font"]')).toBeTruthy();
    expect(host.querySelector('.tt-swatch')).toBeTruthy();
  });

  it('aria-pressed is true, false or mixed from the selected characters', () => {
    mount('Hello big world', [{ text: 'Hello ', fontWeight: 700 }, { text: 'big', fontWeight: 700 }, { text: ' world' }], { start: 0, end: 9 });
    expect(btn('Bold').getAttribute('aria-pressed')).toBe('true');
    expect(btn('Italic').getAttribute('aria-pressed')).toBe('false');
    const m = mount('Hello big world', [{ text: 'Hello ', fontWeight: 700 }, { text: 'big world' }], { start: 0, end: 15 });
    expect(btn('Bold').getAttribute('aria-pressed')).toBe('mixed');
    expect(btn('Bold').className).toContain('mixed');
    // moving the selection moves the buttons
    act(() => m.s.set({ textSelection: { id: m.t.id, start: 6, end: 15 } }));
    expect(btn('Bold').getAttribute('aria-pressed')).toBe('false');
  });

  it('shows the size and font, or leaves them as mixed', () => {
    mount('Hello world', [{ text: 'Hello ', fontSize: 50 }, { text: 'world', fontSize: 50, fontFamily: 'Georgia, serif' }], { start: 0, end: 5 });
    expect(host.querySelector<HTMLInputElement>('.tt-size')!.value).toBe('50');
    mount('Hello world', [{ text: 'Hello ', fontSize: 50 }, { text: 'world', fontFamily: 'Georgia, serif' }], { start: 0, end: 11 });
    const size = host.querySelector<HTMLInputElement>('.tt-size')!;
    expect(size.value).toBe('');
    expect(size.placeholder).toBe('mixed');
    expect(host.querySelector<HTMLInputElement>('.tt-font input')!.placeholder).toBe('Mixed');
    expect(host.querySelector('.tt-swatch')!.getAttribute('aria-label')).toMatch(/Text colour/);
  });

  it('with a caret in a word it works, between words it is switched off', () => {
    mount('Hello  world', undefined, { start: 3, end: 3 });
    expect(btn('Bold').disabled).toBe(false);
    mount('Hello  world', undefined, { start: 6, end: 6 });
    expect(btn('Bold').disabled).toBe(true);
    expect(host.querySelector<HTMLInputElement>('.tt-size')!.disabled).toBe(true);
  });

  it('clear formatting is only on when there is styling to clear', () => {
    mount('Hello world', [{ text: 'Hello', italic: true }, { text: ' world' }], { start: 6, end: 11 });
    expect(btn('Clear formatting').disabled).toBe(true);
    mount('Hello world', [{ text: 'Hello', italic: true }, { text: ' world' }], { start: 0, end: 11 });
    expect(btn('Clear formatting').disabled).toBe(false);
  });
});

describe('the buttons', () => {
  it('each toggle styles the selection and a second press undoes it', () => {
    const { node, render } = mount('Hello world', undefined, { start: 0, end: 5 });
    click(btn('Bold'));
    expect(node().runs).toEqual([{ text: 'Hello', fontWeight: 700 }, { text: ' world' }]);
    //(the canvas hands the toolbar the changed layer)
    render();
    expect(btn('Bold').getAttribute('aria-pressed')).toBe('true');
    click(btn('Italic'));
    render();
    click(btn('Underline'));
    render();
    click(btn('Strikethrough'));
    render();
    expect(node().runs![0]).toEqual({ text: 'Hello', fontWeight: 700, italic: true, underline: true, strike: true });
    click(btn('Bold'));
    expect(node().runs![0].fontWeight).toBeUndefined();
    expect(node().runs![0].italic).toBe(true);
  });

  it('pressing one with the mouse does not take the focus off the text', () => {
    mount('Hello world', undefined, { start: 0, end: 5 });
    const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    btn('Bold').dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    // but a text box in the toolbar still takes it
    const inp = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    host.querySelector('.tt-size')!.dispatchEvent(inp);
    expect(inp.defaultPrevented).toBe(false);
  });

  it('a command from the keyboard leaves the focus on the button that did it', () => {
    const { editor, node } = mount('Hello world', undefined, { start: 0, end: 5 });
    act(() => btn('Bold').focus());
    click(btn('Bold'));
    expect(node().runs![0].fontWeight).toBe(700);
    expect(document.activeElement).toBe(btn('Bold'));
    expect(document.activeElement).not.toBe(editor.current);
  });

  it('size applies on change, not on every keystroke, and ignores nonsense', () => {
    const { node } = mount('Hello world', undefined, { start: 0, end: 5 });
    const size = host.querySelector<HTMLInputElement>('.tt-size')!;
    setValue(size, '4', 'input');
    expect(node().runs).toBeUndefined();
    setValue(size, '48', 'input');
    act(() => void size.dispatchEvent(new Event('change', { bubbles: true })));
    expect(node().runs).toEqual([{ text: 'Hello', fontSize: 48 }, { text: ' world' }]);
    setValue(size, '-3', 'input');
    act(() => void size.dispatchEvent(new Event('change', { bubbles: true })));
    expect(node().runs![0].fontSize).toBe(48);
  });

  it('font and colour go to the selection', () => {
    const { node, s: store } = mount('Hello world', undefined, { start: 6, end: 11 });
    const font = host.querySelector<HTMLInputElement>('.tt-font input')!;
    act(() => font.focus());
    setValue(font, 'Georgia', 'input');
    act(() => [...host.querySelectorAll<HTMLElement>('.tt-font [role=option]')].find((o) => o.querySelector('.font-opt-name')!.textContent === 'Georgia')!.click());
    expect(node().runs![1].fontFamily).toMatch(/^Georgia/);
    expect(node().runs![0]).toEqual({ text: 'Hello ' });
    // a Google font the project doesn't have is added to it
    act(() => font.focus());
    setValue(font, 'Lobster', 'input');
    act(() => [...host.querySelectorAll<HTMLElement>('.tt-font [role=option]')].find((o) => o.querySelector('.font-opt-name')!.textContent === 'Lobster')!.click());
    expect(node().runs![1].fontFamily).toMatch(/Lobster/);
    expect(store.get().project.fonts.some((f) => f.family === 'Lobster')).toBe(true);
    setValue(host.querySelector<HTMLInputElement>('.tt-swatch input')!, '#ff0000', 'input');
    expect(node().runs![1].color).toBe('#ff0000');
    expect(node().color).not.toBe('#ff0000');
  });

  it('clear formatting takes everything off the selection', () => {
    const { node } = mount('Hello world', [{ text: 'Hello', fontWeight: 700, color: '#f00' }, { text: ' world' }], { start: 0, end: 11 });
    click(btn('Clear formatting'));
    expect(node().runs).toBeUndefined();
  });
});

describe('links', () => {
  it('the link button opens a box, Enter adds the link, and the button then shows it', () => {
    const { node, render } = mount('Hello world', undefined, { start: 6, end: 11 });
    click(btn('Link'));
    const form = host.querySelector('.tt-link')!;
    expect(form).toBeTruthy();
    expect(document.activeElement).toBe(form.querySelector('input[type=text]'));
    setValue(form.querySelector('input[type=text]')!, 'example.com', 'input');
    act(() => void form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(node().runs).toEqual([{ text: 'Hello ' }, { text: 'world', link: { url: 'https://example.com', target: '_blank' } }]);
    expect(host.querySelector('.tt-link')).toBeNull();
    render();
    expect(btn('Link').getAttribute('aria-pressed')).toBe('true');
  });

  it('the new tab box sets the target, and a script address is refused with a message', () => {
    const { node } = mount('Hello world', undefined, { start: 6, end: 11 });
    click(btn('Link'));
    const form = host.querySelector('.tt-link')!;
    click(form.querySelector('input[type=checkbox]')!);
    setValue(form.querySelector('input[type=text]')!, 'javascript:alert(1)', 'input');
    act(() => void form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(host.querySelector('.tt-error')!.textContent).toMatch(/not allowed/);
    expect(node().runs).toBeUndefined();
    setValue(host.querySelector('.tt-link input[type=text]')!, 'https://a.org', 'input');
    act(() => void host.querySelector('.tt-link')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(node().runs![1].link).toEqual({ url: 'https://a.org', target: '_self' });
  });

  it('on a link the box is filled in, and Remove takes it off', () => {
    const { node } = mount('Hello world', [{ text: 'Hello ' }, { text: 'world', link: { url: 'https://a.org', target: '_blank' } }], { start: 8, end: 8 });
    click(btn('Link'));
    expect(host.querySelector<HTMLInputElement>('.tt-link input[type=text]')!.value).toBe('https://a.org');
    click([...host.querySelectorAll<HTMLButtonElement>('.tt-link button')].find((b) => b.textContent === 'Remove')!);
    expect(node().runs).toBeUndefined();
    expect(host.querySelector('.tt-link')).toBeNull();
  });

  it('the shortcut path (Ctrl+K from the text) opens the same box', () => {
    const { commands } = mount('Hello world', undefined, { start: 0, end: 5 });
    act(() => commands.current!.apply('link'));
    expect(host.querySelector('.tt-link')).toBeTruthy();
  });

  it('Escape closes the box and goes back to the text', () => {
    const { editor } = mount('Hello world', undefined, { start: 0, end: 5 });
    click(btn('Link'));
    act(() => void host.querySelector('.tt-link input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(host.querySelector('.tt-link')).toBeNull();
    expect(document.activeElement).toBe(editor.current);
  });
});

describe('keyboard', () => {
  it('shortcuts pressed while the toolbar has the focus work too, and stay inside it', () => {
    const { node } = mount('Hello world', undefined, { start: 0, end: 5 });
    let leaked = false;
    const spy = () => (leaked = true);
    document.addEventListener('keydown', spy);
    act(() => btn('Bold').focus());
    act(() => void btn('Bold').dispatchEvent(new KeyboardEvent('keydown', { key: 'i', ctrlKey: true, bubbles: true, cancelable: true })));
    document.removeEventListener('keydown', spy);
    expect(node().runs![0].italic).toBe(true);
    expect(leaked).toBe(false);
  });

  it('arrows walk along the buttons and Escape returns to the text', () => {
    const { editor } = mount('Hello world', undefined, { start: 0, end: 5 });
    act(() => btn('Bold').focus());
    act(() => void btn('Bold').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(document.activeElement).toBe(btn('Italic'));
    act(() => void btn('Italic').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
    expect(document.activeElement).toBe(btn('Bold'));
    act(() => void btn('Bold').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(document.activeElement).toBe(editor.current);
  });

  it('enter() moves to the first control', () => {
    const { commands } = mount('Hello world', undefined, { start: 0, end: 5 });
    act(() => commands.current!.enter());
    expect(document.activeElement).toBe(btn('Bold'));
  });

  it('every control has a name for a screen reader', () => {
    mount('Hello world', undefined, { start: 0, end: 5 });
    for (const b of host.querySelectorAll('.text-toolbar button')) expect(b.getAttribute('aria-label'), b.outerHTML).toBeTruthy();
  });
});

describe('placement', () => {
  const top = () => parseFloat((host.querySelector('.text-toolbar') as HTMLElement).style.top);
  it('sits above the text box, below it when there is no room, and never off the canvas', () => {
    mount('Hello world', undefined, { start: 0, end: 5 }, { left: 100, top: 100, width: 200, height: 40 });
    expect(top()).toBe(92);
    mount('Hello world', undefined, { start: 0, end: 5 }, { left: 100, top: 3, width: 200, height: 40 });
    expect(top()).toBe(51);
    const left = parseFloat((host.querySelector('.text-toolbar') as HTMLElement).style.left);
    mount('Hello world', undefined, { start: 0, end: 5 }, { left: -500, top: 100, width: 20, height: 40 });
    expect(parseFloat((host.querySelector('.text-toolbar') as HTMLElement).style.left)).toBeGreaterThanOrEqual(4);
    expect(left).toBeGreaterThanOrEqual(4);
  });
});

describe('the inspector', () => {
  it('keeps the text runs list under Advanced, closed until opened, with a line about the toolbar', () => {
    const p = createProject('T');
    const t = createNode('text', { name: 'Hello', text: 'Hi there', runs: [{ text: 'Hi ', fontWeight: 700 }, { text: 'there' }] } as never);
    p.artboards[0].children.push(t);
    const s = new EditorStore(p);
    setCurrentStore(s);
    s.select([t.id]);
    act(() => root.render(<Inspector />));
    expect(host.querySelector('.inspector .runs')).toBeNull();
    const heads = [...host.querySelectorAll<HTMLElement>('.inspector button.section-title')];
    const adv = heads.find((e) => e.textContent?.trim() === 'Advanced')!;
    // not in the Text section any more
    const text = heads.find((e) => e.textContent?.trim() === 'Text')!;
    expect(text.closest('section')!.querySelector('.runs')).toBeNull();
    act(() => adv.click());
    const sec = adv.closest('section')!;
    expect(sec.querySelector('.runs')).toBeTruthy();
    expect(sec.textContent).toMatch(/toolbar that floats over the text/);
    expect(sec.querySelector('.runs button')!.textContent).toBe('Text runs (2)');
  });
});

const key = (el: Element, k: string, extra: KeyboardEventInit = {}) => {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra });
  act(() => void el.dispatchEvent(ev));
  return ev;
};

describe('the focus stays in the control being used', () => {
  it('Enter in the size box applies it and stays there', () => {
    const { node } = mount('Hello world', undefined, { start: 0, end: 5 });
    const size = host.querySelector<HTMLInputElement>('.tt-size')!;
    act(() => size.focus());
    setValue(size, '40', 'input');
    const ev = key(size, 'Enter');
    expect(ev.defaultPrevented).toBe(true);
    expect(node().runs![0].fontSize).toBe(40);
    expect(document.activeElement).toBe(size);
  });

  it('Up and Down step the size and keep the focus (Shift steps by ten), as one undo step', () => {
    const { node, s, render } = mount('Hello world', undefined, { start: 0, end: 5 });
    const size = host.querySelector<HTMLInputElement>('.tt-size')!;
    act(() => size.focus());
    const base = node().fontSize;
    key(size, 'ArrowUp');
    render();
    expect(node().runs![0].fontSize).toBe(base + 1);
    expect(document.activeElement).toBe(size);
    key(size, 'ArrowUp', { shiftKey: true });
    render();
    expect(node().runs![0].fontSize).toBe(base + 11);
    key(size, 'ArrowDown');
    expect(node().runs![0].fontSize).toBe(base + 10);
    expect(document.activeElement).toBe(size);
    s.commit();
    s.undo();
    expect(node().runs).toBeUndefined();
  });

  it('typing a number and pressing Down steps from what was typed', () => {
    const { node } = mount('Hello world', undefined, { start: 0, end: 5 });
    const size = host.querySelector<HTMLInputElement>('.tt-size')!;
    act(() => size.focus());
    setValue(size, '30', 'input');
    key(size, 'ArrowDown');
    expect(node().runs![0].fontSize).toBe(29);
    expect(document.activeElement).toBe(size);
  });

  it('picking a font with the keyboard leaves the focus in the font box', () => {
    const { node } = mount('Hello world', undefined, { start: 6, end: 11 });
    const font = host.querySelector<HTMLInputElement>('.tt-font input')!;
    act(() => font.focus());
    setValue(font, 'Georgia', 'input');
    key(font, 'ArrowDown');
    key(font, 'Enter');
    expect(node().runs![1].fontFamily).toBeTruthy();
    expect(document.activeElement).toBe(font);
  });

  it('a colour change keeps the focus on the colour control', () => {
    const { node } = mount('Hello world', undefined, { start: 0, end: 5 });
    const col = host.querySelector<HTMLInputElement>('.tt-swatch input')!;
    act(() => col.focus());
    setValue(col, '#00ff00', 'input');
    expect(node().runs![0].color).toBe('#00ff00');
    expect(document.activeElement).toBe(col);
  });

  it('the selection is remembered: the next change in another control still lands on it', () => {
    const { node, s: store, render } = mount('Hello world', undefined, { start: 0, end: 5 });
    act(() => btn('Bold').focus());
    click(btn('Bold'));
    render();
    act(() => btn('Italic').focus());
    click(btn('Italic'));
    expect(node().runs![0]).toEqual({ text: 'Hello', fontWeight: 700, italic: true });
    expect(store.get().textSelection).toMatchObject({ start: 0, end: 5 });
  });

  it('Escape from a control goes back to the text with the same selection', () => {
    const { editor, s: store } = mount('Hello world', undefined, { start: 0, end: 5 });
    editor.current!.textContent = 'Hello world';
    const size = host.querySelector<HTMLInputElement>('.tt-size')!;
    act(() => size.focus());
    key(size, 'Escape');
    expect(document.activeElement).toBe(editor.current);
    expect(store.get().textSelection).toMatchObject({ start: 0, end: 5 });
    const r = document.getSelection()!.getRangeAt(0);
    expect(r.toString()).toBe('Hello');
  });

  it('Shift+Tab off the first control goes back to the text', () => {
    const { editor } = mount('Hello world', undefined, { start: 0, end: 5 });
    editor.current!.textContent = 'Hello world';
    act(() => btn('Bold').focus());
    const ev = key(btn('Bold'), 'Tab', { shiftKey: true });
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(editor.current);
  });

  it('a button that switches itself off does not drop the focus on the page', () => {
    const { render } = mount('Hello big world', [{ text: 'Hello ' }, { text: 'big', fontWeight: 700 }, { text: ' world' }], { start: 6, end: 9 });
    act(() => btn('Clear formatting').focus());
    click(btn('Clear formatting'));
    render();
    expect(btn('Clear formatting').disabled).toBe(true);
    expect(document.activeElement).not.toBe(document.body);
    expect(host.querySelector('.text-toolbar')!.contains(document.activeElement)).toBe(true);
  });

  it('the link box returns the focus to the Link button when it was opened from there, and to the text when it was opened from the text', () => {
    const { editor } = mount('Hello world', undefined, { start: 0, end: 5 });
    editor.current!.textContent = 'Hello world';
    act(() => btn('Link').focus());
    click(btn('Link'));
    const input = host.querySelector<HTMLInputElement>('.tt-link input[type=text]')!;
    expect(document.activeElement).toBe(input);
    setValue(input, 'https://example.com', 'input');
    act(() => void host.querySelector('.tt-link')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(host.querySelector('.tt-link')).toBeNull();
    expect(document.activeElement).toBe(btn('Link'));
  });

  it('a link box opened from the text (the shortcut) closes back into the text', () => {
    const { editor, commands } = mount('Hello world', undefined, { start: 0, end: 5 });
    editor.current!.textContent = 'Hello world';
    act(() => editor.current!.focus());
    act(() => commands.current!.apply('link'));
    const input = host.querySelector<HTMLInputElement>('.tt-link input[type=text]')!;
    setValue(input, 'https://example.com', 'input');
    act(() => void host.querySelector('.tt-link')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(editor.current);
  });

  it('the mouse still keeps the focus where it was (in the text) and does not need it moved', () => {
    const { editor, node } = mount('Hello world', undefined, { start: 0, end: 5 });
    act(() => editor.current!.focus());
    const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    btn('Bold').dispatchEvent(ev);
    click(btn('Bold'));
    expect(node().runs![0].fontWeight).toBe(700);
    expect(document.activeElement).toBe(editor.current);
  });
});
