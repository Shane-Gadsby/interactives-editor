//The Activity Designer's free answers: "how do I..." questions go to the editor's help (no Cogniti message), and one behaviour on the
//selected layer goes through Describe it. Both are conservative: when unsure it is a build request and goes to the AI
import { describe, expect, it, vi } from 'vitest';
import { createArtboard, createNode, createProject, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { describeLocally, helpAnswers, isHowQuestion, localAnswer } from '../src/lib/designer-local';
import { searchHelp } from '../src/help/search';

describe('is it a question for the help?', () => {
  it('takes "how do I" and "what is" questions about the editor', () => {
    for (const q of ['How do I add a button?', 'how can I make a layer spin', 'What is a repeater?', 'where do I change the page size', 'Why does my text jump around?', 'hi, how do I undo?', 'Is it possible to link to another page?', 'Can I drag a picture in from my computer?']) expect(isHowQuestion(q), q).toBe(true);
  });

  it('leaves requests to make or change things to the AI, even when they are worded as questions', () => {
    for (const q of ['Add a page called Results with a heading', 'Make a multiple choice question about clouds', 'Can you add a results page for me?', 'Could you make the heading bigger', 'How do I make this page look better? I want you to fix it', 'What is a good activity for teaching the water cycle?', 'Check my project for problems and fix them', 'How about a quiz at the end', 'Tell me what to put on my page', 'ok']) expect(isHowQuestion(q), q).toBe(false);
  });

  it('finds the topics that answer it, one per topic, best first, and nothing when the help has no answer', () => {
    const a = helpAnswers('How do I add a multiple choice question?', searchHelp);
    expect(a.length).toBeGreaterThan(0);
    expect(a.length).toBeLessThanOrEqual(3);
    expect(new Set(a.map((x) => x.id)).size).toBe(a.length);
    expect(a.every((x) => x.title && x.snippet)).toBe(true);
    expect(helpAnswers('How do I zzzqqq xxyyzz?', searchHelp)).toEqual([]);
  });

  it('loads the help the first time it is asked, and a question the help cannot answer is not answered for free', async () => {
    const hit = await localAnswer('How do I add a multiple choice question?');
    expect(hit).toMatchObject({ kind: 'help' });
    expect((hit as { topics: unknown[] }).topics.length).toBeGreaterThan(0);
    expect(await localAnswer('How do I zzzqqq xxyyzz?')).toBeNull();
  });
});

const fixture = () => {
  const p: Project = createProject('T');
  const home = p.artboards[0];
  home.name = 'Page 1';
  const btn = createNode('button', { name: 'Start', label: 'Start', x: 10, y: 10 });
  const hint = createNode('text', { name: 'Hint', text: 'Think of rain.', x: 10, y: 100 });
  home.children.push(btn, hint);
  p.artboards.push(createArtboard({ name: 'Results' }));
  return { p, home, btn, hint };
};

describe('one behaviour with no AI', () => {
  const write = (p: Project) => (abId: string, b: any) => {
    const ab = p.artboards.find((a) => a.id === abId)!;
    ab.logic.nodes.push(...b.nodes);
    ab.logic.edges.push(...b.edges);
    p.variables.push(...b.variables);
  };

  it('does "when clicked go to the next page and say moving on" on the selected layer', () => {
    const f = fixture();
    const r = describeLocally('when clicked go to the next page and say moving on', f.p, f.home, f.btn.id, write(f.p));
    expect(r).not.toBeNull();
    expect(r!.sentence).toMatch(/next page/i);
    expect(f.home.logic.nodes.map((n) => n.kind)).toEqual(expect.arrayContaining(['event.pointer', 'action.artboard', 'action.announce']));
  });

  it('does a counter and a show/hide, in the project\'s own words', () => {
    const f = fixture();
    expect(describeLocally('when clicked show Hint', f.p, f.home, f.btn.id, write(f.p))).not.toBeNull();
    expect(f.home.logic.nodes.some((n) => n.kind === 'action.visibility')).toBe(true);
  });

  it('leaves it to the AI when nothing is selected, it is not led by a trigger, it names something that is not there, or it is about making things', () => {
    const f = fixture();
    const go = (t: string, sel = f.btn.id) => describeLocally(t, f.p, f.home, sel, write(f.p));
    expect(go('when clicked go to the next page', '')).toBeNull();
    expect(go('go to the next page')).toBeNull();
    expect(go('when clicked go to the page called Nowhere')).toBeNull();
    expect(go('when clicked make everything glitter')).toBeNull();
    expect(go('when clicked add a new page with a quiz')).toBeNull();
    expect(go('create a button that goes to the next page when clicked')).toBeNull();
    expect(go('when clicked')).toBeNull();
    expect(f.home.logic.nodes).toEqual([]);
  });

  it('writes it through the store as one undo step, on the selected layer of the open page', async () => {
    vi.useRealTimers();
    const f = fixture();
    const st = new EditorStore(f.p);
    setCurrentStore(st);
    st.select([f.btn.id]);
    const r = await localAnswer('when clicked go to the next page');
    expect(r).toMatchObject({ kind: 'behaviour' });
    expect(st.get().project.artboards[0].logic.nodes.some((n) => n.kind === 'action.artboard')).toBe(true);
    st.undo();
    expect(st.get().project.artboards[0].logic.nodes).toEqual([]);
    //two layers selected: not for here
    st.select([f.btn.id, f.hint.id]);
    expect(await localAnswer('when clicked go to the next page')).toBeNull();
  });
});
