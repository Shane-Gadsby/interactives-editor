import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DialogHost, alertDialog, dismissAllDialogs, confirmDialog, promptDialog } from '../src/components/dialogs';
import { variableNameFrom } from '../src/lib/quick-add';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<DialogHost />));
});
afterEach(() => {
  dismissAllDialogs();
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = '';
});

const key = (k: string, target: Element | Window = window, init: KeyboardEventInit = {}) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
  });
const btn = (label: string) => Array.from(document.querySelectorAll('button')).find((b) => b.textContent === label)!;
const click = (el: Element) => act(() => (el as HTMLElement).click());
// Open a dialog and let React render it
async function open(_p: Promise<unknown>) {
  await act(async () => {});
}

describe('dialog service', () => {
  it('confirm resolves true on the confirm button and false on cancel', async () => {
    const a = confirmDialog({ title: 'Delete', message: 'Sure?', confirmLabel: 'Delete it' });
    await open(a);
    expect(document.querySelector('.dialog')).toBeTruthy();
    click(btn('Delete it'));
    expect(await a).toBe(true);
    expect(document.querySelector('.dialog')).toBeNull();

    const b = confirmDialog({ title: 'Delete' });
    await open(b);
    click(btn('Cancel'));
    expect(await b).toBe(false);
  });

  it('Enter confirms, Escape cancels, and the confirm button has focus', async () => {
    const a = confirmDialog({ title: 'x' });
    await open(a);
    expect(document.activeElement).toBe(btn('Confirm'));
    key('Enter', document.body);
    expect(await a).toBe(true);

    const b = confirmDialog({ title: 'x' });
    await open(b);
    key('Escape');
    expect(await b).toBe(false);
  });

  it('danger confirm gets the red button class', async () => {
    const a = confirmDialog({ title: 'x', confirmLabel: 'Remove', danger: true });
    await open(a);
    expect(btn('Remove').className).toContain('danger-fill');
    click(btn('Cancel'));
    await a;
  });

  it('backdrop click cancels', async () => {
    const a = confirmDialog({ title: 'x' });
    await open(a);
    act(() => {
      const bd = document.querySelector('.dialog-backdrop')!;
      bd.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(await a).toBe(false);
  });

  it('prompt returns the typed text, selects the initial value, and null on Escape', async () => {
    const a = promptDialog({ title: 'Name', label: 'Name', initial: 'abc' });
    await open(a);
    const input = document.querySelector('input')!;
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(3);
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(input, 'hello');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    key('Enter', input);
    expect(await a).toBe('hello');

    const b = promptDialog({ title: 'Name' });
    await open(b);
    key('Escape');
    expect(await b).toBeNull();
  });

  it('prompt validation blocks the answer and shows the message', async () => {
    const a = promptDialog({ title: 'Name', initial: '', validate: (v) => (v.trim() ? null : 'Type a name') });
    await open(a);
    const input = document.querySelector('input')!;
    key('Enter', input);
    expect(document.querySelector('.dialog-error')?.textContent).toBe('Type a name');
    expect(document.querySelector('.dialog')).toBeTruthy();
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(input, 'ok');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    click(btn('OK'));
    expect(await a).toBe('ok');
  });

  it('alert resolves on OK, Enter or Escape', async () => {
    const a = alertDialog({ title: 'Heads up', message: 'Done' });
    await open(a);
    expect(Array.from(document.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['OK']);
    key('Escape');
    await a;
    const b = alertDialog({ title: 'Again' });
    await open(b);
    key('Enter', document.body);
    await b;
    expect(document.querySelector('.dialog')).toBeNull();
  });

  it('queues dialogs one at a time', async () => {
    const a = confirmDialog({ title: 'first' });
    const b = confirmDialog({ title: 'second' });
    await open(a);
    expect(document.querySelector('.dialog strong')?.textContent).toBe('first');
    click(btn('Confirm'));
    await a;
    await act(async () => {});
    expect(document.querySelector('.dialog strong')?.textContent).toBe('second');
    key('Escape');
    expect(await b).toBe(false);
  });

  it('traps Tab inside and restores focus afterwards', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const a = confirmDialog({ title: 'x' });
    await open(a);
    const cancel = btn('Cancel');
    const ok = btn('Confirm');
    ok.focus();
    key('Tab', ok); // last -> wraps to first
    expect(document.activeElement).toBe(cancel);
    key('Tab', cancel, { shiftKey: true }); // first -> wraps to last
    expect(document.activeElement).toBe(ok);
    key('Escape');
    await a;
    expect(document.activeElement).toBe(opener);
  });

  it('keeps editor shortcuts from seeing keys while open', async () => {
    let seen = 0;
    const l = () => seen++;
    document.addEventListener('keydown', l);
    const a = confirmDialog({ title: 'x' });
    await open(a);
    key('Delete', document.activeElement!);
    expect(seen).toBe(0);
    key('Escape');
    await a;
    document.removeEventListener('keydown', l);
  });
});

describe('variableNameFrom', () => {
  it('cleans odd characters and avoids taken names', () => {
    expect(variableNameFrom('my score!', [])).toBe('my_score_');
    expect(variableNameFrom('9lives', [])).toBe('_9lives');
    expect(variableNameFrom('   ', [], 'value')).toBe('value');
    expect(variableNameFrom('score', ['score'])).not.toBe('score');
  });
});
