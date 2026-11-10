//The Looks row on the Question section: Right, Wrong, Missed and Picked, each opening to Fill, Border and Text, changing the layers.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject, type FrameNode, type Project } from 'interactives-player';
import { addQuestion, partsOf, questionFrames } from '../src/lib/question-kit';
import { EditorStore, setCurrentStore, useEditor } from '../src/store/store';
import { QuestionSection } from '../src/panels/QuestionSection';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
});

async function mountQuestion(kind: 'single' | 'hotspot' = 'single') {
  const s = new EditorStore(createProject('t'));
  setCurrentStore(s);
  const abId = s.get().project.artboards[0].id;
  s.update((d) => void addQuestion(d as Project, abId, kind));
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const frame = () => questionFrames(s.get().project.artboards[0])[0];
  const Harness = () => {
    const project = useEditor((st) => st.project);
    return <QuestionSection frame={frame() as FrameNode} ab={project.artboards[0]} project={project} />;
  };
  await act(async () => root!.render(<Harness />));
  return { s, host, frame };
}

describe('the Looks row', () => {
  it('lists Right, Wrong, Missed and Picked for a choice question, each with a sample', async () => {
    const { host } = await mountQuestion();
    const names = [...host.querySelectorAll('.q-look > summary strong')].map((e) => e.textContent);
    expect(names).toEqual(['Right', 'Wrong', 'Missed', 'Picked']);
    expect(host.querySelectorAll('.q-look-sample').length).toBe(4);
  });

  it('a hotspot question has no Looks row (its areas have their own colours)', async () => {
    const { host } = await mountQuestion('hotspot');
    expect(host.querySelector('.q-looks')).toBeNull();
  });

  it('changing the Right fill writes the question and moves the option layer', async () => {
    const { host, frame } = await mountQuestion();
    const right = host.querySelector('.q-look')!;
    const hex = right.querySelector<HTMLInputElement>('input.color-text')!;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(hex, '#102030');
      hex.dispatchEvent(new Event('input', { bubbles: true }));
      hex.focus();
      hex.blur();
    });
    expect(frame().question!.looks!.right!.fill).toBe('#102030');
    const map = (partsOf(frame()).option[0].converters!['fill.color'][0] as { map: Record<string, string> }).map;
    expect(map.correct).toBe('#102030');
    //and Back to the starter looks is offered, and puts it back
    const back = [...host.querySelectorAll<HTMLButtonElement>('.q-looks .link-btn')].find((b) => /starter looks/.test(b.textContent ?? ''))!;
    await act(async () => void back.click());
    expect(frame().question!.looks).toBeUndefined();
    const again = (partsOf(frame()).option[0].converters!['fill.color'][0] as { map: Record<string, string> }).map;
    expect(again.correct).not.toBe('#102030');
  });
});
