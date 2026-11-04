import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { VariablesPanel } from '../src/panels/ScriptsVariables';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let s: EditorStore;

function mount() {
  const p = createProject('T');
  p.variables.push({ id: 'v1', name: 'score', type: 'number', initial: 0 });
  s = new EditorStore(p);
  setCurrentStore(s);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<VariablesPanel />));
}
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const input = () => host.querySelector<HTMLInputElement>('.var-table td input')!;
const type = (text: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(), text);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
const commit = () => act(() => void input().focus());
const blur = () => act(() => void input().blur());
const warning = () => host.querySelector('.var-table .error')?.textContent ?? '';

describe('variable names', () => {
  it('an empty name stays a draft with the warning, and the document keeps the last valid name', () => {
    mount();
    commit();
    type('');
    expect(warning()).toContain('needs a name');
    blur();
    expect(input().value).toBe('');
    expect(s.get().project.variables[0].name).toBe('score');
    expect(warning()).toContain('Not saved yet');
  });

  it('an invalid name is not saved, a valid one is, and the warning goes', () => {
    mount();
    commit();
    type('my score');
    blur();
    expect(input().value).toBe('my score');
    expect(s.get().project.variables[0].name).toBe('score');
    expect(warning()).toContain('Use letters, digits');
    commit();
    type('my_score');
    expect(warning()).toBe('');
    blur();
    expect(s.get().project.variables[0].name).toBe('my_score');
  });

  it('typing the saved name back clears the warning', () => {
    mount();
    commit();
    type('9lives');
    blur();
    expect(warning()).not.toBe('');
    commit();
    type('score');
    blur();
    expect(warning()).toBe('');
    expect(s.get().project.variables[0].name).toBe('score');
  });

  it('an undo or an outside edit replaces the draft', () => {
    mount();
    commit();
    type('bad name');
    blur();
    act(() =>
      s.update((d) => {
        d.variables[0].name = 'other';
      }),
    );
    expect(input().value).toBe('other');
    expect(warning()).toBe('');
  });
});
