//The no-code interactions layer in the editor: the condition picker, the behaviour chooser, a layer's interactions as sentences,
//the sentences view of a graph, and the line under a formula field.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createArtboard, createNode, createProject, defaultParams, type LogicEdge, type LogicNode, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { ConditionField } from '../src/components/ConditionField';
import { ExprField } from '../src/components/ExprField';
import { BehaviourHost, closeBehaviours, openBehaviours } from '../src/components/BehaviourDialog';
import { Inspector } from '../src/panels/Inspector';
import { setPrefs } from '../src/lib/prefs';
import { FlowSentences } from '../src/panels/FlowSentences';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  disconnect() {}
  unobserve() {}
};

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  closeBehaviours();
  act(() => root.unmount());
  host.remove();
  setCurrentStore(null);
  vi.useRealTimers();
});

function scene() {
  const p: Project = createProject('T');
  const ab = p.artboards[0];
  const btn = createNode('rect', { name: 'Next button' });
  const hint = createNode('text', { name: 'Hint text' });
  ab.children.push(btn, hint);
  p.artboards.push(createArtboard({ name: 'Quiz' }));
  p.variables.push({ id: 'vs', name: 'score', type: 'number', initial: 7 }, { id: 'vd', name: 'done', type: 'boolean', initial: false }, { id: 'vn', name: 'who', type: 'string', initial: 'Sam' });
  const s = new EditorStore(p);
  setCurrentStore(s);
  return { s, p, ab, btn, hint };
}

const set = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) =>
  act(() => {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
const click = (el: Element | null | undefined) => {
  if (!el) throw new Error('nothing to click');
  act(() => void (el as HTMLElement).click());
};
const byText = (text: string, within: ParentNode = document) => [...within.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent?.trim() === text);
const q = (sel: string, within: ParentNode = document) => within.querySelector<HTMLElement>(sel);
const qa = (sel: string, within: ParentNode = document) => [...within.querySelectorAll<HTMLElement>(sel)];

describe('ConditionField', () => {
  function Harness({ start }: { start: string }) {
    const [v, setV] = useState(start);
    return (
      <>
        <ConditionField label="Only if" value={v} onChange={setV} />
        <output data-testid="out">{v}</output>
      </>
    );
  }
  const out = () => q('[data-testid=out]')!.textContent;
  const mount = (start: string) => {
    scene();
    act(() => root.render(<Harness start={start} />));
  };

  it('shows a plain comparison as pickers, with the formula one click away', () => {
    mount('score >= 5');
    expect(q('.cond-op')).toBeTruthy();
    expect((q('.cond-op') as HTMLSelectElement).value).toBe('atleast');
    expect((q('input.cond-val') as HTMLInputElement).value).toBe('5');
    expect(q('.cond-row')!.textContent).toContain('score');
    expect(byText('Edit as formula')).toBeTruthy();
    // it does not change anything just by showing it
    expect(out()).toBe('score >= 5');
  });

  it('writes the formula as the pickers change: picker to formula to picker', () => {
    mount('score >= 5');
    set(q('.cond-op') as HTMLSelectElement, 'less');
    expect(out()).toBe('score < 5');
    set(q('input.cond-val') as HTMLInputElement, '12');
    expect(out()).toBe('score < 12');
    click(byText('+ and'));
    // the new row starts on a value that is not used yet, in a way that suits it
    expect(qa('.cond-row')).toHaveLength(2);
    expect(out()).toBe('score < 12 && done');
    set(q('.cond-join') as HTMLSelectElement, 'or');
    expect(out()).toBe('score < 12 || done');
    // the very text it wrote opens as the same rows again
    act(() => root.unmount());
    root = createRoot(host);
    act(() => root.render(<Harness start="score < 12 || done" />));
    expect(qa('.cond-row')).toHaveLength(2);
    expect((qa('.cond-op')[0] as HTMLSelectElement).value).toBe('less');
    expect((qa('.cond-op')[1] as HTMLSelectElement).value).toBe('true');
    expect((q('.cond-join') as HTMLSelectElement).value).toBe('or');
  });

  it('adds and removes rows, and no row means no condition', () => {
    mount('');
    expect(q('.cond-none')).toBeTruthy();
    click(byText('+ Add a condition'));
    expect(out()).toBe('score >= 1');
    click(q('button[aria-label="Remove condition 1"]'));
    expect(out()).toBe('');
    expect(q('.cond-none')).toBeTruthy();
  });

  it('changing the value to one of another kind starts the row again in a way that suits it', () => {
    mount('score >= 5');
    click(q('.cond-row button[aria-haspopup], .cond-row .search-picker button, .cond-row button'));
    const options = qa('[role=option]');
    const done = options.find((o) => o.textContent?.includes('done'));
    expect(done).toBeTruthy();
    click(done);
    expect(out()).toBe('done');
    expect((q('.cond-op') as HTMLSelectElement).value).toBe('true');
    expect(q('input.cond-val')).toBeNull();
  });

  it('compares with text, on/off or another value', () => {
    mount('who == "Sam"');
    expect((q('input.cond-val') as HTMLInputElement).value).toBe('Sam');
    set(q('input.cond-val') as HTMLInputElement, 'Alex');
    expect(out()).toBe('who == "Alex"');
    set(q('.cond-kind') as HTMLSelectElement, 'name');
    // an empty other value is not written until one is chosen
    expect(out()).toBe('who == "Alex"');
    expect(q('.cond')!.textContent).toContain('Fill in each row');
  });

  it('opens a formula it cannot show in full as a formula, untouched, and says why', () => {
    mount('score + 1 > 5 && (done || who == "x")');
    expect(q('.cond-op')).toBeNull();
    expect(q('input.mono, textarea.mono')).toBeTruthy();
    expect(q('.cond-text .hint')!.textContent).toContain('more than the pickers can show');
    expect(out()).toBe('score + 1 > 5 && (done || who == "x")');
  });

  it('Edit as formula shows the text it writes, and Use the pickers comes back', () => {
    mount('score >= 5 && !done');
    click(byText('Edit as formula'));
    expect((q('input.mono') as HTMLInputElement).value).toBe('score >= 5 && !done');
    expect(q('.cond-op')).toBeNull();
    click(byText('Use the pickers'));
    expect(qa('.cond-row')).toHaveLength(2);
    expect((qa('.cond-op')[1] as HTMLSelectElement).value).toBe('false');
  });

  it('is labelled for the keyboard and a screen reader', () => {
    mount('score >= 5');
    expect(q('.cond')!.getAttribute('role')).toBe('group');
    expect(q('.cond')!.getAttribute('aria-label')).toBe('Only if');
    for (const el of qa('.cond-row select, .cond-row input, .cond-row button')) expect(el.getAttribute('aria-label') || el.textContent?.trim() || el.getAttribute('title'), el.outerHTML.slice(0, 80)).toBeTruthy();
  });
});

describe('BehaviourDialog', () => {
  const open = (trigger: 'click' | 'pointerenter' = 'click') => {
    const sc = scene();
    act(() => root.render(<BehaviourHost />));
    act(() => openBehaviours({ abId: sc.ab.id, layerId: sc.btn.id, trigger }));
    return sc;
  };
  const radios = () => qa('[role=radio]', q('.behaviour-dialog')!);
  const choose = (label: string) => click(radios().find((r) => r.querySelector('.recipe-name')?.textContent === label));

  it('closes when another project opens, so Add never writes to the wrong one', () => {
    open();
    expect(q('.behaviour-dialog')).toBeTruthy();
    act(() => setCurrentStore(null));
    expect(q('.behaviour-dialog')).toBeNull();
  });

  it('lists what can happen in plain words, grouped, with the first one ready', () => {
    open();
    expect(q('#behaviour-title')!.textContent).toBe('When “Next button” is clicked…');
    expect(radios().map((r) => r.querySelector('.recipe-name')!.textContent)).toEqual(['Go to the next page', 'Go to the previous page', 'Go to a page…', 'Show a layer', 'Hide a layer', 'Show or hide a layer', 'Show only one of a set…', 'Change a layer’s look…', 'Move the view to a layer…', 'Show the whole page again', 'Play an animation', 'Play a sound', 'Play music that carries on across pages', 'Stop the music', 'Turn the sound off or on', 'Play or pause a video', 'Jump a video to a time…', 'Change a number…', 'Go to the next item…', 'Go to the previous item…', 'Set a text or choice…', 'Switch something on or off', 'Count what has been done…', 'Put values back to the start…', 'Say something to screen readers', 'Open a link', 'Run a script', 'Send a message to a room…', 'Start over']);
    expect(radios()[0].getAttribute('aria-checked')).toBe('true');
    expect(q('.behaviour-preview')!.textContent).toBe('It will do this: When clicked: go to the next page.');
    expect(q('[role=dialog]')!.getAttribute('aria-modal')).toBe('true');
  });

  it('When all of these are done asks for the layers (the one it was opened from ticked), how they are done and a name, and writes the lot', () => {
    const sc = open();
    const when = qa('.behaviour-dialog select').find((x) => [...(x as HTMLSelectElement).options].some((o) => o.value === 'all')) as HTMLSelectElement;
    set(when, 'all');
    expect(q('#behaviour-title')!.textContent).toBe('When all of these are done…');
    const boxes = () => qa('.behaviour-dialog .check-list input[type=checkbox]') as HTMLInputElement[];
    const ticked = () => boxes().filter((b) => b.checked).map((b) => b.closest('label')!.textContent);
    expect(ticked()).toEqual(['Next button']);
    click(boxes().find((b) => b.closest('label')!.textContent === 'Hint text'));
    expect(ticked()).toEqual(['Next button', 'Hint text']);
    expect(q('.behaviour-preview')!.textContent).toContain('When all of these are done: Next button, Hint text');
    //answered: no layer here is a question, so the ticked ones go and it says so
    const how = qa('.behaviour-dialog select').find((x) => [...(x as HTMLSelectElement).options].some((o) => o.value === 'answered')) as HTMLSelectElement;
    set(how, 'answered');
    expect(ticked()).toEqual([]);
    expect(q('.behaviour-dialog .check-list')!.textContent).toContain('No layer on this page has a question yet');
    set(how, 'click');
    click(boxes()[0]);
    click(byText('Add'));
    const logic = sc.s.get().project.artboards[0].logic;
    expect(logic.nodes.filter((n) => n.kind === 'event.pointer')).toHaveLength(1);
    expect(logic.nodes.find((n) => n.kind === 'event.variable')!.params.onlyIf).toBe('includesAll(explored, ["Next button"])');
    expect(sc.s.get().project.variables.map((v) => v.name)).toEqual(expect.arrayContaining(['explored', 'exploredCount', 'exploredTotal']));
  });

  it('Count what has been done is in the list, has no trigger to choose, and writes only the counting', () => {
    const sc = open();
    choose('Count what has been done…');
    expect(q('#behaviour-title')!.textContent).toBe('Count what has been done…');
    expect(qa('.behaviour-dialog select').some((x) => [...(x as HTMLSelectElement).options].some((o) => o.value === 'all'))).toBe(false);
    expect(byText('+ then also…')).toBeUndefined();
    expect(q('.behaviour-preview')!.textContent).toContain('count each of 1 layers once it is clicked');
    click(byText('Add'));
    const logic = sc.s.get().project.artboards[0].logic;
    expect(logic.nodes.map((n) => n.kind)).toEqual(['event.pointer', 'action.setVariable']);
  });

  it('Go to the next page also asks the speed: Medium, Slow, Fast or Custom, hidden for Instant, written as the number', () => {
    const sc = open();
    const speed = () => qa('.behaviour-dialog select').find((x) => [...(x as HTMLSelectElement).options].some((o) => o.value === 'custom')) as HTMLSelectElement | undefined;
    const how = qa('.behaviour-dialog select').find((x) => [...(x as HTMLSelectElement).options].some((o) => o.value === 'iris')) as HTMLSelectElement;
    expect(speed()!.value).toBe('medium');
    expect([...speed()!.options].map((o) => o.textContent)).toEqual(['Fast', 'Medium', 'Slow', 'Custom']);
    set(how, 'iris');
    set(speed()!, 'slow');
    expect(q('.behaviour-preview')!.textContent).toBe('It will do this: When clicked: go to the next page (iris, slow).');
    set(speed()!, 'custom');
    const ms = qa('.behaviour-dialog input').find((i) => (i as HTMLInputElement).value === '600') as HTMLInputElement;
    expect(ms).toBeTruthy();
    set(ms, '1200');
    expect(q('.behaviour-preview')!.textContent).toBe('It will do this: When clicked: go to the next page (iris, 1.2 s).');
    set(how, 'none');
    expect(speed()).toBeUndefined();
    set(how, 'wipeUp');
    expect(speed()!.value).toBe('custom');
    click(byText('Add'));
    expect(sc.s.get().project.artboards[0].logic.nodes.find((n) => n.kind === 'action.artboard')?.params).toMatchObject({ to: 'next', transition: 'wipeUp', duration: 1200 });
  });

  it('Go to the next page asks how the page changes, and the sentence and node follow it', () => {
    const sc = open();
    const how = qa('.behaviour-dialog select').find((x) => [...(x as HTMLSelectElement).options].some((o) => o.value === 'iris')) as HTMLSelectElement;
    expect(how.value).toBe('fade');
    expect([...how.options].map((o) => o.value)).toEqual(expect.arrayContaining(['wipeLeft', 'iris', 'zoom', 'pushDown']));
    set(how, 'iris');
    expect(q('.behaviour-preview')!.textContent).toBe('It will do this: When clicked: go to the next page (iris).');
    click(byText('Add'));
    expect(sc.s.get().project.artboards[0].logic.nodes.find((n) => n.kind === 'action.artboard')?.params).toMatchObject({ to: 'next', transition: 'iris' });
  });

  it('Add writes the nodes as one undo step, opens the graph on them and picks them', () => {
    const sc = open();
    choose('Show a layer');
    set(q('.behaviour-dialog select') as HTMLSelectElement, sc.hint.id);
    expect(q('.behaviour-preview')!.textContent).toBe('It will do this: When clicked: show Hint text.');
    click(byText('Add'));
    const st = sc.s.get();
    const ab = st.project.artboards[0];
    expect(ab.logic.nodes.map((n) => n.kind)).toEqual(['event.pointer', 'action.visibility']);
    expect(ab.children.find((n) => n.id === sc.hint.id)!.visible).toBe(false);
    expect(st.logicSelection).toBe(ab.logic.nodes[0].id);
    expect(st.logicPicked).toEqual(ab.logic.nodes.map((n) => n.id));
    expect(st.bottomTab).toBe('logic');
    expect(st.toast?.text).toBe('Added When clicked: show Hint text');
    expect(q('.behaviour-dialog')).toBeNull();
    sc.s.undo();
    expect(sc.s.get().project.artboards[0].logic.nodes).toHaveLength(0);
    expect(sc.s.get().project.artboards[0].children.find((n) => n.id === sc.hint.id)!.visible).not.toBe(false);
  });

  it('with "Show new interactions in the graph" off, Add only picks the nodes and the person stays where they are', () => {
    setPrefs({ showNewInteractions: false });
    try {
      const sc = open();
      sc.s.set({ bottomTab: 'timeline' });
      click(byText('Add'));
      const st = sc.s.get();
      const ab = st.project.artboards[0];
      expect(st.bottomTab).toBe('timeline');
      expect(st.logicSelection).toBe(ab.logic.nodes[1].id);
      expect(st.logicPicked).toEqual(ab.logic.nodes.map((n) => n.id));
      expect(st.toast?.text).toMatch(/^Added When clicked: /);
    } finally {
      setPrefs({ showNewInteractions: true });
    }
  });

  it('a counter can be a new one named in plain words', () => {
    const sc = open('pointerenter');
    expect(q('#behaviour-title')!.textContent).toBe('When “Next button” is hovered over…');
    choose('Change a number…');
    const select = q('.behaviour-dialog select') as HTMLSelectElement;
    expect(select.value).toBe('vs');
    set(select, '__new__');
    set(q('.behaviour-dialog input:not([type])') as HTMLInputElement, 'Number of hovers');
    expect(q('.behaviour-preview')!.textContent).toBe('It will do this: When hovered over: add 1 to Number of hovers.');
    click(byText('Add'));
    expect(sc.s.get().project.variables.map((v) => v.name)).toEqual(['score', 'done', 'who', 'numberOfHovers']);
  });

  it('says what is missing, and keeps Add off until it is there', () => {
    open();
    choose('Open a link');
    expect(q('.behaviour-preview')!.textContent).toBe('Choose web address.');
    expect((byText('Add') as HTMLButtonElement).disabled).toBe(true);
    set(q('.behaviour-dialog input:not([type])') as HTMLInputElement, 'https://example.com');
    expect((byText('Add') as HTMLButtonElement).disabled).toBe(false);
  });

  it('a recipe that cannot work yet says why, and cannot be chosen', () => {
    open();
    const anim = radios().find((r) => r.querySelector('.recipe-name')?.textContent === 'Play an animation')!;
    expect(anim.getAttribute('aria-disabled')).toBe('true');
    expect(anim.textContent).toContain('no timelines');
    expect(anim.getAttribute('title')).toContain('no timelines');
    click(anim);
    expect(radios()[0].getAttribute('aria-checked')).toBe('true');
  });

  it('works from the keyboard: arrows move through the list, Enter adds, Escape closes', () => {
    const sc = open();
    const key = (k: string, target: Element = document.activeElement ?? document.body) => act(() => void target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(radios()[0]);
    key('ArrowDown');
    expect(radios()[1].getAttribute('aria-checked')).toBe('true');
    key('Enter', radios()[1]);
    const ab = sc.s.get().project.artboards[0];
    expect(ab.logic.nodes[1].params.to).toBe('previous');
    expect(q('.behaviour-dialog')).toBeNull();
    act(() => openBehaviours({ abId: ab.id, layerId: sc.btn.id, trigger: 'click' }));
    expect(q('.behaviour-dialog')).toBeTruthy();
    key('Escape', radios()[0]);
    expect(q('.behaviour-dialog')).toBeNull();
    expect(sc.s.get().project.artboards[0].logic.nodes).toHaveLength(2);
  });
});

describe('BehaviourDialog: more steps, other triggers, Only if and Otherwise', () => {
  const open = () => {
    const sc = scene();
    act(() => root.render(<BehaviourHost />));
    act(() => openBehaviours({ abId: sc.ab.id, layerId: sc.btn.id, trigger: 'click' }));
    return sc;
  };
  const radios = () => qa('[role=radio]', q('.behaviour-dialog')!);
  const choose = (label: string) => click(radios().find((r) => r.querySelector('.recipe-name')?.textContent === label));
  const dlg = () => q('.behaviour-dialog')!;
  const selects = () => qa('select', dlg()) as HTMLSelectElement[];
  const selectWith = (value: string) => selects().find((x) => [...x.options].some((o) => o.value === value))!;
  const preview = () => q('.behaviour-preview')!.textContent;

  it('starts on clicked, with every other trigger one choice away', () => {
    open();
    const when = selectWith('timer');
    expect(when.value).toBe('click');
    expect([...when.options].map((o) => o.textContent)).toEqual(['“Next button” is clicked', '“Next button” is hovered over', 'the page is shown', 'some seconds have passed', 'a value reaches something', 'all of these are done', '“Next button” is dropped on something', 'a key is pressed', 'a video reaches a time (not yet)']);
    expect([...when.options].find((o) => o.value === 'video')!.disabled).toBe(true);
    expect(preview()).toBe('It will do this: When clicked: go to the next page.');
  });

  it('after some seconds asks how many, changes the heading, and writes a timer', () => {
    const sc = open();
    set(selectWith('timer'), 'timer');
    expect(q('#behaviour-title')!.textContent).toBe('When some seconds have passed…');
    const secs = qa('input', dlg()).find((i) => (i as HTMLInputElement).value === '5') as HTMLInputElement;
    set(secs, '3');
    expect(preview()).toBe('It will do this: After 3 s: go to the next page.');
    set(secs, '0');
    expect(preview()).toBe('Say how many seconds, as a number.');
    expect((byText('Add') as HTMLButtonElement).disabled).toBe(true);
    set(secs, '3');
    click(byText('Add'));
    expect(sc.s.get().project.artboards[0].logic.nodes[0]).toMatchObject({ kind: 'event.timer', params: { ms: '3000', repeat: false } });
  });

  it('a value reaches something: asks which value, how, and what', () => {
    const sc = open();
    set(selectWith('value'), 'value');
    const watch = selectWith('vs');
    expect(watch.value).toBe('vs');
    expect([...selectWith('atleast').options].map((o) => o.textContent)).toEqual(['is at least', 'is at most', 'is more than', 'is less than', 'is']);
    set(qa('input', dlg()).find((i) => (i as HTMLInputElement).value === '1') as HTMLInputElement, '9');
    expect(preview()).toBe('It will do this: When score changes, only if score is at least 9: go to the next page.');
    //a yes/no value is asked if it is on, with nothing to type
    set(watch, 'vd');
    expect([...selectWith('true').options].map((o) => o.textContent)).toEqual(['is on (true)', 'is off (false)']);
    expect(preview()).toBe('It will do this: When done changes, only if done is on: go to the next page.');
    click(byText('Add'));
    expect(sc.s.get().project.artboards[0].logic.nodes[0].params).toMatchObject({ variable: 'vd', onlyIf: 'done' });
  });

  it('+ then also adds a row with its own questions, and both steps are written', () => {
    const sc = open();
    choose('Change a number…');
    click(byText('+ then also…'));
    const row = q('.behaviour-step')!;
    expect(row.getAttribute('aria-label')).toBe('Then');
    //the second step starts as a number change too, and can be any recipe
    const kind = qa('select', row)[0] as HTMLSelectElement;
    expect(kind.value).toBe('counter');
    set(kind, 'announce');
    set(qa('input', row)[0] as HTMLInputElement, 'Counted');
    expect(preview()).toBe('It will do this: When clicked: add 1 to score, then tell screen readers “Counted”.');
    click(byText('Add'));
    const ab = sc.s.get().project.artboards[0];
    expect(ab.logic.nodes.map((n) => n.kind)).toEqual(['event.pointer', 'action.setVariable', 'action.announce']);
    expect(ab.logic.edges).toHaveLength(2);
  });

  it('a step can be taken out again, and a step with something missing keeps Add off', () => {
    open();
    click(byText('+ then also…'));
    click(byText('+ then also…'));
    expect(qa('.behaviour-step')).toHaveLength(2);
    set(qa('select', q('.behaviour-step')!)[0] as HTMLSelectElement, 'announce');
    expect(preview()).toBe('Write what to say.');
    expect((byText('Add') as HTMLButtonElement).disabled).toBe(true);
    click(qa('button', q('.behaviour-step')!).find((b) => b.textContent === 'Remove')!);
    expect(qa('.behaviour-step')).toHaveLength(1);
    expect((byText('Add') as HTMLButtonElement).disabled).toBe(false);
  });

  it('+ only if uses the condition picker and writes an Only if on the event', () => {
    const sc = open();
    click(byText('+ only if…'));
    expect(q('.behaviour-only .cond')!.getAttribute('aria-label')).toBe('Only if');
    expect((q('.cond-op', dlg()) as HTMLSelectElement).value).toBe('atleast');
    set(q('input.cond-val', dlg()) as HTMLInputElement, '3');
    expect(preview()).toBe('It will do this: When clicked, only if score is at least 3: go to the next page.');
    click(byText('Add'));
    expect(sc.s.get().project.artboards[0].logic.nodes[0].params.onlyIf).toBe('score >= 3');
  });

  it('+ otherwise makes a Check a condition with both ways, and Remove Only if takes both out', () => {
    const sc = open();
    choose('Say something to screen readers');
    const mainWords = () => qa('input', dlg()).find((i) => !i.closest('.behaviour-step') && !i.closest('.behaviour-only') && (i as HTMLInputElement).type !== 'checkbox') as HTMLInputElement;
    set(mainWords(), 'Yes');
    click(byText('+ only if…'));
    expect(byText('+ only if…')).toBeUndefined();
    click(byText('+ otherwise…'));
    expect(q('.behaviour-step')!.getAttribute('aria-label')).toBe('Otherwise');
    expect(byText('+ otherwise…')).toBeUndefined();
    //the Otherwise starts as a number change; make it a message
    set(qa('select', q('.behaviour-step')!)[0] as HTMLSelectElement, 'announce');
    expect(preview()).toBe('Write what to say.');
    set(qa('input', q('.behaviour-step')!)[0] as HTMLInputElement, 'No');
    expect(preview()).toBe('It will do this: When clicked: check whether score is at least 1 (if so: tell screen readers “Yes”; if not: tell screen readers “No”).');
    click(byText('Add'));
    const ab = sc.s.get().project.artboards[0];
    expect(ab.logic.nodes.map((n) => n.kind)).toEqual(['event.pointer', 'logic.if', 'action.announce', 'action.announce']);
    expect(ab.logic.edges.map((e) => e.fromPort)).toEqual(['out', 'true', 'false']);
  });

  it('Remove Only if takes the Otherwise out with it', () => {
    open();
    click(byText('+ only if…'));
    click(byText('+ otherwise…'));
    click(byText('Remove Only if'));
    expect(q('.behaviour-step')).toBeNull();
    expect(q('.behaviour-only')).toBeNull();
    expect(byText('+ only if…')).toBeTruthy();
    expect(byText('+ otherwise…')).toBeUndefined();
    expect(preview()).toBe('It will do this: When clicked: go to the next page.');
  });

  it('Change a number asks which number, what to do and how much', () => {
    const sc = open();
    choose('Change a number…');
    expect(selects()[0].value).toBe('vs');
    set(selectWith('subtract'), 'subtract');
    set(qa('input', dlg()).find((i) => (i as HTMLInputElement).value === '1') as HTMLInputElement, '5');
    expect(preview()).toBe('It will do this: When clicked: take 5 off score.');
    click(byText('Add'));
    expect(sc.s.get().project.artboards[0].logic.nodes[1].params).toMatchObject({ variable: 'vs', op: 'add', value: '-5' });
  });

  it('Go to the next item asks how many, where it starts and what happens after the last', () => {
    const sc = open();
    choose('Go to the next item…');
    expect(preview()).toBe('It will do this: When clicked: go to the next score (1 to 3, going round at the ends).');
    set(selectWith('stop'), 'stop');
    set(selectWith('0'), '0');
    expect(preview()).toBe('It will do this: When clicked: go to the next score (0 to 2, stopping at the ends).');
    click(byText('Add'));
    expect(sc.s.get().project.artboards[0].logic.nodes[1].params).toMatchObject({ op: 'next', first: '0', last: '2', ends: 'stop' });
  });

  it('Show only one of a set: tick the layers, Enter on a tick box does not add', () => {
    const sc = open();
    choose('Show only one of a set…');
    expect(preview()).toBe('Tick the layers to hide.');
    const boxes = qa('input[type=checkbox]', dlg()) as HTMLInputElement[];
    expect(boxes).toHaveLength(1);
    click(boxes[0]);
    act(() => void boxes[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
    expect(q('.behaviour-dialog')).toBeTruthy();
    expect(preview()).toBe('It will do this: When clicked: show Hint text.');
    click(byText('Add'));
    expect(sc.s.get().project.artboards[0].logic.nodes.map((n) => n.kind)).toEqual(['event.pointer', 'action.visibility']);
  });

  it('Change a layer’s look: colour, text, opacity and size each ask for their own widget', () => {
    const sc = open();
    choose('Change a layer’s look…');
    expect(qa('.color-field', dlg())).toHaveLength(1);
    set(selectWith('opacity'), 'opacity');
    expect(qa('.color-field', dlg())).toHaveLength(0);
    set(qa('input', dlg()).find((i) => (i as HTMLInputElement).value === '50') as HTMLInputElement, '40');
    expect(preview()).toBe('It will do this: When clicked: set Next button’s opacity to 0.4.');
    set(selectWith('size'), 'size');
    expect(preview()).toBe('Give a width or a height.');
    set(qa('input', dlg()).find((i) => (i as HTMLInputElement).placeholder === 'leave as it is') as HTMLInputElement, '240');
    click(byText('Add'));
    expect(sc.s.get().project.artboards[0].logic.nodes[1]).toMatchObject({ kind: 'action.setProperty', params: { prop: 'width', value: '240' } });
  });

  it('dropped on something says so when the layer cannot be dragged yet, and writes the drop event', () => {
    const sc = open();
    set(selectWith('drop'), 'drop');
    expect(dlg().textContent).toContain('can’t be dragged yet');
    expect(selects().find((x) => [...x.options].some((o) => o.textContent === 'Any drop zone'))!.value).toBe('');
    expect(preview()).toBe('It will do this: When this layer is dropped where it belongs: go to the next page.');
    click(byText('Add'));
    expect(sc.s.get().project.artboards[0].logic.nodes[0]).toMatchObject({ kind: 'event.drop', params: { layer: sc.btn.id, target: '' } });
  });

  it('a key is asked for in plain words', () => {
    const sc = open();
    set(selectWith('key'), 'key');
    expect([...selectWith('ArrowLeft').options].map((o) => o.textContent)).toContain('Left arrow');
    set(selectWith('ArrowLeft'), 'ArrowLeft');
    expect(preview()).toBe('It will do this: When ArrowLeft is pressed: go to the next page.');
    set(selectWith('__other__'), '__other__');
    expect(preview()).toBe('Choose which key.');
    set(qa('input', dlg()).find((i) => (i as HTMLInputElement).placeholder === 'a, 5, F2...') as HTMLInputElement, 'q');
    click(byText('Add'));
    expect(sc.s.get().project.artboards[0].logic.nodes[0].params).toMatchObject({ key: 'q', type: 'keydown' });
  });
});

describe('Inspector: what a layer does, in sentences', () => {
  function withFlow() {
    const sc = scene();
    const ev: LogicNode = { id: 'e1', kind: 'event.pointer', x: 0, y: 0, params: { ...defaultParams('event.pointer'), target: sc.btn.id, type: 'click' } };
    const a: LogicNode = { id: 'a1', kind: 'action.visibility', x: 0, y: 10, params: { target: sc.hint.id, op: 'show' } };
    const w: LogicNode = { id: 'w1', kind: 'action.delay', x: 0, y: 20, params: { ms: '2000' } };
    const edges: LogicEdge[] = [
      { id: 'x1', from: 'e1', fromPort: 'out', to: 'a1', toPort: 'in' },
      { id: 'x2', from: 'a1', fromPort: 'out', to: 'w1', toPort: 'in' },
    ];
    sc.s.update((d) => {
      d.artboards[0].logic.nodes.push(ev, a, w);
      d.artboards[0].logic.edges.push(...edges);
    });
    sc.s.select([sc.btn.id]);
    act(() => root.render(<Inspector />));
    return sc;
  }
  const sentences = () => qa('.flow-sentence').map((e) => e.textContent);

  it('says what the layer does instead of "pointer click"', () => {
    withFlow();
    expect(sentences()).toEqual(['When clicked: show Hint text, then wait 2 s.']);
    expect(q('.interaction-chip')).toBeNull();
  });

  it('says so when an event has nothing joined to it', () => {
    const sc = scene();
    sc.s.update((d) => void d.artboards[0].logic.nodes.push({ id: 'e1', kind: 'event.pointer', x: 0, y: 0, params: { ...defaultParams('event.pointer'), target: sc.btn.id } }));
    sc.s.select([sc.btn.id]);
    act(() => root.render(<Inspector />));
    expect(sentences()).toEqual(['When clicked: nothing happens yet, no step is joined to it.']);
    expect(q('.flow-item')!.classList.contains('empty')).toBe(true);
  });

  it('Turn off puts a false in front of Only if, Turn on takes it away', () => {
    const sc = withFlow();
    click(byText('Turn off'));
    expect(sc.s.get().project.artboards[0].logic.nodes[0].params.onlyIf).toBe('false');
    expect(q('.flow-item')!.classList.contains('off')).toBe(true);
    expect(sentences()[0]).toContain('(turned off)');
    click(byText('Turn on'));
    expect(sc.s.get().project.artboards[0].logic.nodes[0].params.onlyIf).toBeUndefined();
    sc.s.undo();
    expect(sc.s.get().project.artboards[0].logic.nodes[0].params.onlyIf).toBe('false');
  });

  it('Remove takes the event and the steps only it reaches, in one undo step', () => {
    const sc = withFlow();
    click(byText('Remove'));
    expect(sc.s.get().project.artboards[0].logic.nodes).toHaveLength(0);
    expect(sc.s.get().project.artboards[0].logic.edges).toHaveLength(0);
    expect(q('.flow-list')).toBeNull();
    sc.s.undo();
    expect(sc.s.get().project.artboards[0].logic.nodes).toHaveLength(3);
  });

  it('Show in graph picks the event in the graph view', () => {
    const sc = withFlow();
    sc.s.set({ logicView: 'sentences' });
    click(byText('Show in graph'));
    const st = sc.s.get();
    expect(st.logicView).toBe('graph');
    expect(st.logicSelection).toBe('e1');
    expect(st.bottomTab).toBe('logic');
  });

  it('+ When clicked… opens the chooser for this layer, and the empty events are still there', () => {
    const sc = withFlow();
    act(() => root.render(<><Inspector /><BehaviourHost /></>));
    click(byText('+ When clicked…'));
    expect(q('#behaviour-title')!.textContent).toBe('When “Next button” is clicked…');
    closeBehaviours();
    click(byText('+ On hover (empty)'));
    const ev = sc.s.get().project.artboards[0].logic.nodes.at(-1)!;
    expect(ev).toMatchObject({ kind: 'event.pointer', params: { target: sc.btn.id, type: 'pointerenter' } });
  });
});

describe('Read as sentences', () => {
  it('shows every flow on the page, the ways a check splits, and the steps nothing starts', () => {
    const sc = scene();
    const nodes: LogicNode[] = [
      { id: 'e1', kind: 'event.pointer', x: 0, y: 0, params: { ...defaultParams('event.pointer'), target: sc.btn.id } },
      { id: 'i1', kind: 'logic.if', x: 0, y: 10, params: { condition: 'score >= 5' } },
      { id: 'a1', kind: 'action.visibility', x: 0, y: 20, params: { target: sc.hint.id, op: 'show' } },
      { id: 'a2', kind: 'action.artboard', x: 0, y: 30, params: { to: 'next' } },
      { id: 'e2', kind: 'event.start', x: 0, y: 100, params: {} },
      { id: 'l1', kind: 'action.delay', x: 0, y: 200, params: { ms: '500' } },
    ];
    const edge = (id: string, from: string, to: string, port = 'out'): LogicEdge => ({ id, from, fromPort: port, to, toPort: 'in' });
    sc.s.update((d) => {
      d.artboards[0].logic.nodes.push(...nodes);
      d.artboards[0].logic.edges.push(edge('1', 'e1', 'i1'), edge('2', 'i1', 'a1', 'true'), edge('3', 'i1', 'a2', 'false'));
    });
    const st = sc.s.get();
    act(() => root.render(<FlowSentences ab={st.project.artboards[0]} project={st.project} picked={null} />));
    const text = q('.flow-sentences')!.textContent!;
    expect(text).toContain('2 things can start something on this page');
    expect(text).toContain('When Next button is clicked');
    expect(text).toContain('check whether score is at least 5');
    expect(text).toContain('if so:');
    expect(text).toContain('show Hint text');
    expect(text).toContain('if not:');
    expect(text).toContain('go to the next page');
    expect(text).toContain('When this page is shown');
    expect(text).toContain('Not joined to anything, so these never run');
    expect(text).toContain('wait 0.5 s');
    // a line picks the node for the settings column; Show in graph goes back to the graph
    click(qa('button.flow-text').find((b) => b.textContent?.includes('check whether score is at least 5')));
    expect(sc.s.get().logicSelection).toBe('i1');
    click(qa('button').find((b) => b.getAttribute('aria-label')?.startsWith('Show in the graph: When Next button')));
    expect(sc.s.get()).toMatchObject({ logicView: 'graph', logicSelection: 'e1' });
  });

  it('says so for a page with no interactions', () => {
    const sc = scene();
    const st = sc.s.get();
    act(() => root.render(<FlowSentences ab={st.project.artboards[0]} project={st.project} picked={null} />));
    expect(q('.flow-sentences')!.textContent).toContain('Nothing is set up to happen on this page yet');
  });
});

describe('the line under a formula field', () => {
  function Harness({ start }: { start: string }) {
    const [v, setV] = useState(start);
    return <ExprField label="Expr" value={v} onChange={setV} />;
  }
  const settle = () => act(() => void vi.advanceTimersByTime(400));

  it('shows what a formula works out to, then what is wrong with a typo, with a one-click fix', () => {
    vi.useFakeTimers();
    scene();
    act(() => root.render(<Harness start="score + 5" />));
    settle();
    expect(q('.expr-status.ok')!.textContent).toContain('currently 12');
    set(q('input')! as HTMLInputElement, 'scoer > 5');
    settle();
    const err = q('.expr-status.err')!;
    expect(err.getAttribute('role')).toBe('alert');
    expect(err.textContent).toContain('There is no value called scoer. Did you mean score?');
    click(byText('Use score'));
    settle();
    expect((q('input') as HTMLInputElement).value).toBe('score > 5');
    expect(q('.expr-status.ok')!.textContent).toContain('currently true');
  });

  it('says nothing for an empty field, and a bracket problem in words', () => {
    vi.useFakeTimers();
    scene();
    act(() => root.render(<Harness start="" />));
    settle();
    expect(q('.expr-status')).toBeNull();
    set(q('input')! as HTMLInputElement, '(score + 1');
    settle();
    expect(q('.expr-status.err')!.textContent).toContain('A bracket is not closed');
  });

  it('reads a text layer\'s {…} slots', () => {
    vi.useFakeTimers();
    scene();
    act(() => root.render(<ExprField label="Text" template value="Score: {score} of {total}" onChange={() => undefined} />));
    settle();
    expect(q('.expr-status.err')!.textContent).toContain('In {total}: There is no value called total');
  });
});
