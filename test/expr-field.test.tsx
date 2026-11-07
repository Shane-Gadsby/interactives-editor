import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { ExprField } from '../src/components/ExprField';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let committed: string[] = [];

function Harness({ template, commitOnBlur, multiline, start = '' }: { template?: boolean; commitOnBlur?: boolean; multiline?: boolean; start?: string }) {
  const [v, setV] = useState(start);
  return (
    <ExprField
      label="Expr"
      value={v}
      template={template}
      commitOnBlur={commitOnBlur}
      multiline={multiline}
      onChange={(x) => {
        committed.push(x);
        setV(x);
      }}
    />
  );
}

function mount(props: React.ComponentProps<typeof Harness> = {}) {
  const p = createProject('T');
  p.variables.push({ id: 'v1', name: 'score', type: 'number', initial: 7 }, { id: 'v2', name: 'scoreboard', type: 'string', initial: 'hi' });
  setCurrentStore(new EditorStore(p));
  committed = [];
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<Harness {...props} />));
}
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  setCurrentStore(null);
});

const field = () => host.querySelector<HTMLInputElement | HTMLTextAreaElement>('input,textarea')!;
const options = () => [...document.querySelectorAll<HTMLElement>('.expr-pop [role=option]')];
const names = () => options().map((o) => o.querySelector('.expr-name')!.textContent);
const selected = () => document.querySelector('.expr-pop [aria-selected=true] .expr-name')?.textContent;
const type = (text: string, caret = text.length) =>
  act(() => {
    const el = field();
    el.focus();
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, text);
    el.setSelectionRange(caret, caret);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
const key = (k: string) => {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  act(() => void field().dispatchEvent(ev));
  return ev;
};

describe('ExprField', () => {
  it('opens a list while typing a name, as a combobox with listbox options', () => {
    mount();
    expect(field().getAttribute('role')).toBe('combobox');
    expect(field().getAttribute('aria-expanded')).toBe('false');
    type('sc');
    expect(names().slice(0, 2)).toEqual(['score', 'scoreboard']);
    expect(field().getAttribute('aria-expanded')).toBe('true');
    const list = document.querySelector('.expr-pop [role=listbox]')!;
    expect(field().getAttribute('aria-controls')).toBe(list.id);
    expect(field().getAttribute('aria-activedescendant')).toBe(options()[0].id);
    expect(options()[0].getAttribute('aria-selected')).toBe('true');
    expect(options()[0].textContent).toContain('number');
    expect(options()[0].textContent).toContain('7');
    expect(host.querySelector('[role=status]')!.textContent).toContain('score');
  });

  it('arrows move the choice, wrapping round', () => {
    mount();
    type('sc');
    key('ArrowDown');
    expect(selected()).toBe('scoreboard');
    expect(field().getAttribute('aria-activedescendant')).toBe(options()[1].id);
    key('ArrowUp');
    expect(selected()).toBe('score');
    key('ArrowUp');
    expect(selected()).toBe(names()[names().length - 1]);
  });

  it('Enter takes the choice and does not finish the field', () => {
    mount();
    type('1 + sc');
    key('ArrowDown');
    const ev = key('Enter');
    expect(ev.defaultPrevented).toBe(true);
    expect(field().value).toBe('1 + scoreboard');
    expect(document.activeElement).toBe(field());
    expect(options()).toHaveLength(0);
    expect(field().selectionStart).toBe(14);
  });

  it('Tab takes the choice too', () => {
    mount();
    type('sc');
    const ev = key('Tab');
    expect(ev.defaultPrevented).toBe(true);
    expect(field().value).toBe('score');
  });

  it('Escape closes the list and keeps the text', () => {
    mount();
    type('sc');
    const ev = key('Escape');
    expect(ev.defaultPrevented).toBe(true);
    expect(options()).toHaveLength(0);
    expect(field().value).toBe('sc');
    expect(field().getAttribute('aria-expanded')).toBe('false');
  });

  it('with the list closed Enter is not taken (it finishes the field) and Tab moves on', () => {
    mount();
    type('1 + 2');
    expect(options()).toHaveLength(0);
    const blur = vi.spyOn(field(), 'blur');
    const enter = key('Enter');
    expect(enter.defaultPrevented).toBe(false);
    expect(blur).toHaveBeenCalled();
    expect(key('Tab').defaultPrevented).toBe(false);
    expect(key('ArrowDown').defaultPrevented).toBe(false);
  });

  it('a click on a row takes it', () => {
    mount();
    type('sc');
    act(() => options()[1].click());
    expect(field().value).toBe('scoreboard');
  });

  it('suggests members after a dot', () => {
    mount();
    type('context.fi');
    expect(names()[0]).toBe('firstName');
    key('Enter');
    expect(field().value).toBe('context.firstName');
  });

  it('commit on blur keeps the chosen text local until blur', () => {
    mount({ commitOnBlur: true });
    type('sc');
    key('Enter');
    expect(field().value).toBe('score');
    expect(committed).toEqual([]);
    act(() => field().blur());
    expect(committed).toEqual(['score']);
  });

  it('in a template only suggests inside the braces, in a multiline field too', () => {
    mount({ template: true, multiline: true });
    type('Hello sc');
    expect(options()).toHaveLength(0);
    // Enter in a textarea with the list closed is left alone (a new line)
    expect(key('Enter').defaultPrevented).toBe(false);
    type('Hello {sc');
    expect(names()[0]).toBe('score');
    key('Enter');
    expect(field().value).toBe('Hello {score');
    type('Hello {score} sc');
    expect(options()).toHaveLength(0);
  });

  it('closes when the field loses focus', () => {
    mount();
    type('sc');
    expect(options().length).toBeGreaterThan(0);
    act(() => field().blur());
    expect(options()).toHaveLength(0);
  });

  it('the chosen row is gold with dark text, from the tokens', () => {
    const css = readFileSync(resolve(__dirname, '../src/styles.css'), 'utf8');
    const rule = /\.expr-pop li\.on \{([^}]*)\}/.exec(css)![1];
    expect(rule).toContain('background: var(--primary-bg)');
    expect(rule).toContain('color: var(--primary-fg)');
    expect(rule).not.toContain('accent');
  });
});
