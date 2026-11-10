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

  it('words with a space are offered an identifier and kept as the label, saved on leaving the box', () => {
    mount();
    commit();
    type('Quiz score');
    expect(host.querySelector<HTMLInputElement>('.var-ident input')!.value).toBe('quizScore');
    expect(warning()).toBe('');
    blur();
    const v = s.get().project.variables[0];
    expect([v.name, v.label]).toEqual(['quizScore', 'Quiz score']);
    expect(input().value).toBe('Quiz score');
    expect(host.querySelector('.var-ident input')!.getAttribute('aria-label')).toContain('Quiz score');
  });

  it('typing a plain identifier is the name, with no label and no second box', () => {
    mount();
    commit();
    type('Quiz score');
    blur();
    commit();
    type('my_score');
    expect(host.querySelector('.var-ident')).toBeNull();
    blur();
    const v = s.get().project.variables[0];
    expect([v.name, v.label]).toEqual(['my_score', undefined]);
  });

  it('the offered identifier is made free of the others, and can be changed', () => {
    mount();
    act(() =>
      s.update((d) => {
        d.variables.push({ id: 'v2', name: 'quizScore', type: 'number', initial: 0 });
      }),
    );
    commit();
    type('Quiz score');
    expect(host.querySelector<HTMLInputElement>('.var-ident input')!.value).toBe('quizScore2');
    const box = host.querySelector<HTMLInputElement>('.var-ident input')!;
    act(() => void box.focus());
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(box, 'points');
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => void box.blur());
    const v = s.get().project.variables[0];
    expect([v.name, v.label]).toEqual(['points', 'Quiz score']);
  });

  it('an identifier that is not valid stays a draft with the warning, and the project keeps the last good name', () => {
    mount();
    commit();
    type('Quiz score');
    const box = host.querySelector<HTMLInputElement>('.var-ident input')!;
    act(() => void box.focus());
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(box, '9 bad');
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(warning()).toContain('letters, digits');
    expect(warning()).toContain('Not saved yet');
    act(() => void box.blur());
    //leaving the words saved what was offered; the bad identifier is not saved over it
    expect(s.get().project.variables[0].name).toBe('quizScore');
    expect(s.get().project.variables[0].label).toBe('Quiz score');
  });

  it('words with nothing to build a name from are not saved until a name is typed, and typing the saved name back clears the warning', () => {
    mount();
    commit();
    type('???');
    blur();
    expect(warning()).toContain('Add a letter');
    expect(s.get().project.variables[0].name).toBe('score');
    commit();
    type('score');
    blur();
    expect(warning()).toBe('');
    expect(s.get().project.variables[0].name).toBe('score');
  });

  it('an undo or an outside edit replaces the draft', () => {
    mount();
    commit();
    type('???');
    blur();
    act(() =>
      s.update((d) => {
        d.variables[0].name = 'other';
      }),
    );
    expect(input().value).toBe('other');
    expect(warning()).toBe('');
  });

  it('a variable with a label shows the label, the name small under it, and renaming keeps what used the old name working', () => {
    mount();
    act(() =>
      s.update((d) => {
        d.variables[0].name = 'quizScore';
        d.variables[0].label = 'Quiz score';
      }),
    );
    expect(input().value).toBe('Quiz score');
    expect(host.querySelector<HTMLInputElement>('.var-ident input')!.value).toBe('quizScore');
    act(() =>
      s.update((d) => {
        d.artboards[0].children.push({ id: 't', type: 'text', name: 'T', text: 'Score: {quizScore}' } as never);
      }),
    );
    const box = host.querySelector<HTMLInputElement>('.var-ident input')!;
    act(() => void box.focus());
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(box, 'points');
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => void box.blur());
    return Promise.resolve().then(() => {
      const v = s.get().project.variables[0];
      expect([v.name, v.label]).toEqual(['points', 'Quiz score']);
    });
  });
});
