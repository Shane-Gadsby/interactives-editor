import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { ExprField, ExprLocals } from '../src/components/ExprField';

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

  describe('Insert value', () => {
    const button = () => host.querySelector<HTMLButtonElement>('.insert-value')!;
    const open = () => {
      act(() => void button().dispatchEvent(new Event('pointerdown', { bubbles: true })));
      act(() => void button().click());
    };
    const rows = () => [...document.querySelectorAll<HTMLElement>('.search-pop-list [role=option]')];
    const search = () => document.querySelector<HTMLInputElement>('.search-pop-input')!;
    const typeSearch = (text: string) =>
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search(), text);
        search().dispatchEvent(new Event('input', { bubbles: true }));
      });
    const searchKey = (k: string) => act(() => void search().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })));

    it('is only on a field with {braces} in it', () => {
      mount();
      expect(button()).toBeNull();
      act(() => root.unmount());
      host.remove();
      mount({ template: true });
      expect(button().textContent).toContain('Insert value');
      expect(button().getAttribute('aria-label')).toBe('Insert value into Expr');
      expect(button().getAttribute('aria-haspopup')).toBe('listbox');
    });

    it('opens a searchable list of the project\'s values with what each is now, under group headings', () => {
      mount({ template: true });
      open();
      expect(document.activeElement).toBe(search());
      expect(document.querySelector('.search-pop-list .group')!.textContent).toBe('Your variables');
      const score = rows().find((r) => r.textContent!.startsWith('score') && !r.textContent!.startsWith('scoreboard'))!;
      expect(score.textContent).toContain('number · 7');
      typeSearch('board');
      expect(rows().map((r) => r.textContent)).toEqual(['scoreboardtext · “hi”']);
    });

    it('Enter puts {name} at the caret, keeps the text around it and gives the field its focus back', () => {
      mount({ template: true, start: 'Score:  points' });
      const f = field();
      act(() => {
        f.focus();
        f.setSelectionRange(7, 7);
      });
      open();
      typeSearch('scoreb');
      searchKey('Enter');
      expect(field().value).toBe('Score: {scoreboard} points');
      expect(committed.at(-1)).toBe('Score: {scoreboard} points');
      expect(document.activeElement).toBe(field());
      expect(field().selectionStart).toBe('Score: {scoreboard}'.length);
      expect(document.querySelector('.search-pop')).toBeNull();
    });

    it('a click on a row works, and Escape closes the list back on the button', () => {
      mount({ template: true, multiline: true, start: 'You scored ' });
      act(() => {
        field().focus();
        field().setSelectionRange(11, 11);
      });
      open();
      act(() => void rows().find((r) => /^score(?!b)/.test(r.textContent!))!.click());
      expect(field().value).toBe('You scored {score}');
      open();
      searchKey('Escape');
      expect(document.querySelector('.search-pop')).toBeNull();
      expect(document.activeElement).toBe(button());
    });

    it('in a repeater it lists the item\'s fields first and inserts the one picked', () => {
      const p = createProject('T');
      setCurrentStore(new EditorStore(p));
      committed = [];
      host = document.createElement('div');
      document.body.appendChild(host);
      root = createRoot(host);
      act(() =>
        root.render(
          <ExprLocals.Provider value={{ locals: ['item', 'index'], values: { item: { name: 'Ann', age: 31 }, index: 0 } }}>
            <Harness template start="Name: " />
          </ExprLocals.Provider>,
        ),
      );
      open();
      expect(document.querySelector('.search-pop-list .group')!.textContent).toBe('This item of the repeat');
      expect(rows().slice(0, 3).map((r) => r.textContent)).toEqual(['nametext · “Ann”', 'agenumber · 31', 'Its number (from 1)number · 1']);
      typeSearch('age');
      searchKey('Enter');
      expect(field().value).toBe('Name: {item.age}');
    });

    it('with text selected, it replaces the selection', () => {
      mount({ template: true, start: 'Hello NAME!' });
      act(() => {
        field().focus();
        field().setSelectionRange(6, 10);
      });
      open();
      typeSearch('first');
      searchKey('Enter');
      expect(field().value).toBe('Hello {context.firstName}!');
    });
  });
});
