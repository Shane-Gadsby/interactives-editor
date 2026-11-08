import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { PasteQuestionsModal, QUESTION_TEMPLATES } from '../src/components/PasteQuestionsModal';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SAMPLE = '1. Which planet is closest to the Sun?\na) Venus\nb) Mercury *\nc) Earth\n\n2. The sky is blue.\nAnswer: True\n\nOne lonely line';

function mount() {
  const store = new EditorStore(createProject('Paste'));
  setCurrentStore(store);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  let closed = 0;
  act(() => root.render(<PasteQuestionsModal onClose={() => closed++} />));
  const type = (value: string) => {
    const ta = host.querySelector('textarea')!;
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      set.call(ta, value);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  return { store, host, root, type, closed: () => closed };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Paste questions dialog', () => {
  it('previews what it understood and what it did not, then adds nothing until Add is pressed', () => {
    const { store, host, type } = mount();
    const add = () => [...host.querySelectorAll('button')].find((b) => /^Add/.test(b.textContent ?? ''))!;
    expect(add().disabled).toBe(true);
    type(SAMPLE);
    expect(host.querySelector('.paste-count')!.textContent).toMatch(/2 questions understood, 1 not understood/);
    const items = [...host.querySelectorAll('.paste-list > li')];
    expect(items.map((li) => li.querySelector('.paste-kind')!.textContent)).toEqual(['Multiple choice', 'True/False']);
    expect(items[0].querySelector('li.right')!.textContent).toContain('Mercury');
    expect(host.querySelector('.paste-skipped')!.textContent).toMatch(/One lonely line/);
    expect(store.get().project.artboards.length).toBe(1);
    expect(add().textContent).toBe('Add 2 questions');
  });

  it('adds each question as a kit question on its own artboard and closes', () => {
    const { store, host, type, closed } = mount();
    type(SAMPLE);
    act(() => [...host.querySelectorAll('button')].find((b) => /^Add 2/.test(b.textContent ?? ''))!.click());
    const abs = store.get().project.artboards;
    //the empty first artboard takes the first question, the second gets an artboard of its own
    expect(abs).toHaveLength(2);
    expect(abs.every((a) => a.children.some((c) => 'question' in c && !!c.question))).toBe(true);
    expect(closed()).toBe(1);
  });

  it('links every template for download and a way to open a file', () => {
    const { host } = mount();
    const links = [...host.querySelectorAll<HTMLAnchorElement>('.paste-templates a[download]')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(QUESTION_TEMPLATES.map((t) => t.file));
    expect(host.querySelector<HTMLInputElement>('input[type="file"]')!.accept).toContain('.xlsx');
    expect(host.textContent).toMatch(/Open a file/);
  });
});
