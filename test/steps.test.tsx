import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, Player, stepList, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore, useEditor } from '../src/store/store';
import { StepsSection, MarkerStepFields, patchSteps, setMarker } from '../src/panels/StepsSection';
import { addScrollColumn, addStepBar, addStepsExample, enableSteps, stepBarBox } from '../src/lib/steps';
import { previewScope } from '../src/lib/data';
import { TOPICS, topicBody } from '../src/help/topics';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;
let s: EditorStore;

function mount(extra: (p: Project) => void = () => undefined, ui: () => React.ReactElement = () => <Harness />) {
  const p = createProject('Explainer');
  extra(p);
  s = new EditorStore(p);
  setCurrentStore(s);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(ui()));
}
function Harness() {
  const project = useEditor((st) => st.project);
  const ab = project.artboards[0];
  return <StepsSection ab={ab} project={project} />;
}
const ab = () => s.get().project.artboards[0];
const field = (label: string) => Array.from(host!.querySelectorAll('label')).find((l) => (l.querySelector('.field-label') ?? l).textContent?.trim() === label) as HTMLElement | undefined;
const button = (text: string) => Array.from(host!.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;
const withPlain = (p: Project) => void Object.assign(p.artboards[0], plain().artboards[0]);
const openSection = () => act(() => (host!.querySelector('.section-title') as HTMLElement).click());
const click = (el: Element | undefined) => act(() => (el as HTMLElement).click());
const pick = (label: string, value: string) => {
  const sel = field(label)!.querySelector('select')!;
  act(() => {
    sel.value = value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

beforeEach(() => {
  document.body.innerHTML = '';
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = host = undefined;
  vi.unstubAllGlobals();
});

/** A project with a one-layer timeline and two markers, steps off. */
function plain(): Project {
  const p = createProject('Plain');
  const a = p.artboards[0];
  a.children.push(createNode('rect', { id: 'box', name: 'Box', width: 40, height: 40 }));
  a.timelines.push({ id: 'tl', name: 'Story', duration: 2000, loop: 'once', autoplay: true, speed: 1, tracks: [{ id: 't', nodeId: 'box', prop: 'x', keys: [{ id: 'k1', t: 0, value: 0, ease: 'linear' }, { id: 'k2', t: 2000, value: 100, ease: 'linear' }] }], markers: [{ id: 'm2', time: 1000, name: 'Middle' }, { id: 'm3', time: 2000, name: 'End' }] });
  return p;
}

describe('turning Steps on', () => {
  it('points the settings at the timeline, adds a marker at the start, stops autoplay and makes the four variables', () => {
    const p = plain();
    const a = p.artboards[0];
    expect(enableSteps(p, a)).toBe('tl');
    expect(a.steps).toMatchObject({ timeline: 'tl' });
    const names = ['stepVar', 'countVar', 'titleVar', 'captionVar'].map((k) => p.variables.find((v) => v.id === (a.steps as unknown as Record<string, string>)[k])?.name);
    expect(names).toEqual(['step', 'stepCount', 'stepTitle', 'stepCaption']);
    expect(a.timelines[0].markers!.map((m) => [m.time, m.name])).toEqual([[0, 'Start'], [1000, 'Middle'], [2000, 'End']]);
    expect(a.timelines[0].autoplay).toBe(false);
    expect(stepList(a.timelines[0]).length).toBe(3);
  });

  it('keeps the variables it already made, names new ones apart from the project\'s own, and does not add a second start marker', () => {
    const p = plain();
    p.variables.push({ id: 'mine', name: 'step', type: 'number', initial: 5 });
    const a = p.artboards[0];
    enableSteps(p, a);
    expect(p.variables.map((v) => v.name)).toEqual(['step', 'step2', 'stepCount', 'stepTitle', 'stepCaption']);
    const before = p.variables.length;
    enableSteps(p, a, 'tl');
    expect(p.variables.length).toBe(before);
    expect(a.timelines[0].markers!.length).toBe(3);
  });

  it('makes a timeline when the artboard has none', () => {
    const p = createProject('Empty');
    const a = p.artboards[0];
    enableSteps(p, a);
    expect(a.timelines.length).toBe(1);
    expect(a.steps!.timeline).toBe(a.timelines[0].id);
    expect(a.timelines[0].markers!.length).toBe(1);
  });
});

describe('the step bar', () => {
  it('is a card of ordinary layers, with the graph that makes it work, and the step settings remember where it is', () => {
    const p = plain();
    const a = p.artboards[0];
    const id = addStepBar(p, a);
    const bar = a.children.find((n) => n.id === id)!;
    expect(a.steps!.bar).toBe(id);
    expect(bar.type).toBe('frame');
    const names = (bar as unknown as { children: { name: string }[] }).children.map((c) => c.name);
    expect(names).toEqual(['Step counter', 'Step title', 'Step caption', 'Back button', 'Step dots', 'Next button']);
    expect(a.logic.nodes.filter((n) => n.kind === 'action.steps').map((n) => n.params.op)).toEqual(['back', 'next', 'goto']);
    expect(a.logic.edges.length).toBe(3);
    const box = stepBarBox(a);
    expect(box.y + box.height).toBeLessThanOrEqual(a.height);
    expect(box.x + box.width).toBeLessThanOrEqual(a.width);
  });

  it('works in the player: a dot per marker, Next and Back by click, the counter, and buttons off at the ends', async () => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    const p = plain();
    const a = p.artboards[0];
    addStepBar(p, a);
    p.settings.scriptSandbox = false;
    const player = new Player(document.getElementById('stage')!, p, { loadData: false, progress: false });
    await new Promise((r) => setTimeout(r, 0));
    player.step(16);
    const dots = () => [...document.querySelectorAll<HTMLElement>('[data-ix-id*="~"][aria-label^="Go to step"]')];
    expect(dots().map((d) => d.getAttribute('aria-label'))).toEqual(['Go to step 1: Start', 'Go to step 2: Middle', 'Go to step 3: End']);
    expect(document.body.textContent).toContain('Step 1 of 3');
    const named = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === label)!;
    expect(named('Back').disabled).toBe(true);
    expect(named('Next').disabled).toBe(false);
    named('Next').click();
    player.step(1000);
    player.step(16);
    expect(player.steps.step).toBe(2);
    expect(document.body.textContent).toContain('Step 2 of 3');
    expect(document.body.textContent).toContain('Middle');
    dots()[2].click();
    player.step(16);
    expect(player.steps.step).toBe(3);
    expect(named('Next').disabled).toBe(true);
    named('Back').click();
    expect(player.steps.step).toBe(2);
    //a marker added later is a dot with no change to the bar
    player.destroy();
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    a.timelines[0].markers!.push({ id: 'extra', time: 1500, name: 'Extra' });
    const again = new Player(document.getElementById('stage')!, p, { loadData: false, progress: false });
    await new Promise((r) => setTimeout(r, 0));
    again.step(16);
    expect(dots().length).toBe(4);
    again.destroy();
  });

  it('wires the bar into whatever graph is already there, to its right', () => {
    const p = plain();
    const a = p.artboards[0];
    a.logic.nodes.push({ id: 'old', kind: 'event.start', x: 500, y: 40, params: {} });
    addStepBar(p, a);
    const added = a.logic.nodes.filter((n) => n.id !== 'old');
    expect(Math.min(...added.map((n) => n.x))).toBeGreaterThan(500);
  });

  it('turns Steps on first when they were off, and a second bar is a second card', () => {
    const p = plain();
    const a = p.artboards[0];
    addStepBar(p, a);
    addStepBar(p, a);
    expect(a.children.filter((n) => n.name === 'Step bar').length).toBe(2);
    expect(p.variables.length).toBe(4);
  });
});

describe('the example', () => {
  it('plays: four steps with titles and captions, and a step bar', async () => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    const p = createProject('Example');
    p.settings.scriptSandbox = false;
    addStepsExample(p, p.artboards[0]);
    const player = new Player(document.getElementById('stage')!, p, { loadData: false, progress: false });
    await new Promise((r) => setTimeout(r, 0));
    expect(player.steps.count).toBe(4);
    expect(player.steps.title).toBe('A small red ball');
    player.steps.last();
    expect(player.steps.title).toBe('It turns green');
    expect(player.getVariable('stepCaption')).toBe('Arriving changes its colour. That is the last step.');
    player.destroy();
  });
});

describe('the scroll column', () => {
  it('is a scrolling frame taller than itself, and becomes the scrub frame', () => {
    const p = plain();
    const a = p.artboards[0];
    enableSteps(p, a);
    const id = addScrollColumn(a);
    const col = a.children.find((n) => n.id === id) as unknown as { scroll: string; height: number; children: { height: number }[] };
    expect(col.scroll).toBe('vertical');
    expect(Math.max(...col.children.map((c) => c.height))).toBeGreaterThan(col.height);
    expect(a.steps!.scrub).toBe(id);
  });
});

describe('patchSteps and setMarker', () => {
  it('drop a setting that goes back to its default', () => {
    const cfg = { timeline: 'tl', jump: 'reset' as const, keys: false, scrub: 'col' };
    expect(patchSteps(cfg, { jump: 'pose' })).toEqual({ timeline: 'tl', keys: false, scrub: 'col' });
    expect(patchSteps(cfg, { keys: true, scrub: '' })).toEqual({ timeline: 'tl', jump: 'reset' });
  });

  it('keep a marker\'s step flag only when it is false, and clear empty text', () => {
    mount(withPlain);
    setMarker(ab().id, 'tl', 'm2', { title: 'Middle part', caption: 'Hello', step: false });
    expect(ab().timelines[0].markers!.find((m) => m.id === 'm2')).toMatchObject({ title: 'Middle part', caption: 'Hello', step: false });
    setMarker(ab().id, 'tl', 'm2', { title: '', step: true });
    const m = ab().timelines[0].markers!.find((m) => m.id === 'm2')!;
    expect(m.title).toBeUndefined();
    expect(m.step).toBeUndefined();
    expect(m.caption).toBe('Hello');
  });
});

describe('Steps section', () => {
  it('starts as an invitation, and Turn on Steps turns them on', () => {
    mount(withPlain);
    expect(field('Timeline')).toBeUndefined();
    expect(button('Turn on Steps')).toBeUndefined();
    openSection();
    expect(button('Build an example to try')).toBeDefined();
    click(button('Turn on Steps'));
    expect(ab().steps?.timeline).toBe('tl');
  });

  it('lists the steps with an editable title, and changes the options', () => {
    mount((p) => {
      Object.assign(p.artboards[0], plain().artboards[0]);
      enableSteps(p, p.artboards[0]);
    });
    expect(host!.querySelectorAll('.steps-list li').length).toBe(3);
    const title = host!.querySelectorAll<HTMLInputElement>('.steps-list input')[1];
    act(() => {
      title.focus();
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(title, 'The middle');
      title.dispatchEvent(new Event('input', { bubbles: true }));
      title.blur();
    });
    expect(ab().timelines[0].markers!.find((m) => m.id === 'm2')!.title).toBe('The middle');
    pick('Back and jumps', 'reset');
    expect(ab().steps!.jump).toBe('reset');
    pick('Back and jumps', 'pose');
    expect(ab().steps!.jump).toBeUndefined();
    const keys = field('Arrow keys step')!.querySelector('input')!;
    click(keys);
    expect(ab().steps!.keys).toBe(false);
    click(keys);
    expect(ab().steps!.keys).toBeUndefined();
    const say = field('Announce each step')!.querySelector('input')!;
    click(say);
    expect(ab().steps!.announce).toBe(false);
  });

  it('offers scrolling frames to scrub with, and the bar buttons work', () => {
    mount((p) => {
      Object.assign(p.artboards[0], plain().artboards[0]);
      enableSteps(p, p.artboards[0]);
    });
    click(button('Add a scroll column'));
    const col = ab().children.find((n) => n.name === 'Scroll to step')!;
    expect(ab().steps!.scrub).toBe(col.id);
    expect(field('Scroll to scrub')!.querySelector('select')!.value).toBe(col.id);
    pick('Scroll to scrub', '');
    expect(ab().steps!.scrub).toBeUndefined();
    click(button('Add a step bar'));
    expect(ab().children.some((n) => n.name === 'Step bar')).toBe(true);
    expect(button('Add another step bar')).toBeDefined();
    click(button('Select the bar'));
    expect(s.get().selection).toEqual([ab().steps!.bar]);
  });

  it('turns Steps off from the header and keeps everything else', () => {
    mount((p) => {
      Object.assign(p.artboards[0], plain().artboards[0]);
      enableSteps(p, p.artboards[0]);
    });
    click(host!.querySelector('button[title^="Turn off Steps"]') ?? undefined);
    expect(ab().steps).toBeUndefined();
    expect(ab().timelines[0].markers!.length).toBe(3);
    expect(s.get().project.variables.length).toBe(4);
  });

  it('builds the example from the invitation, as one undo step', () => {
    mount();
    const before = s.get().project.variables.length;
    openSection();
    click(button('Build an example to try'));
    expect(ab().steps).toBeDefined();
    expect(stepList(ab().timelines[0]).length).toBe(4);
    expect(s.get().project.variables.length).toBe(before + 4);
    act(() => s.undo());
    expect(ab().steps).toBeUndefined();
    expect(ab().timelines.length).toBe(0);
  });
});

describe('marker fields', () => {
  it('show the title with the marker name as placeholder, and hide text for a marker that is not a step', () => {
    mount(plain, () => <MarkerStepFields abId={s.get().project.artboards[0].id} tlId="tl" marker={{ id: 'm2', time: 1000, name: 'Middle' }} />);
    expect(host!.querySelector<HTMLInputElement>('input[placeholder="Middle"]')).not.toBeNull();
    expect(field('Caption')).toBeDefined();
    if (root) act(() => root!.unmount());
    host?.remove();
    mount(plain, () => <MarkerStepFields abId={s.get().project.artboards[0].id} tlId="tl" marker={{ id: 'm2', time: 1000, name: 'Middle', step: false }} />);
    expect(field('Caption')).toBeUndefined();
    expect(field('Title')).toBeUndefined();
  });
});

describe('the canvas scope', () => {
  it('shows the first step: the dots list and the step variables', () => {
    const p = plain();
    enableSteps(p, p.artboards[0]);
    const vars = previewScope(p, p.artboards[0]);
    expect(vars.step).toBe(1);
    expect(vars.stepCount).toBe(3);
    expect(vars.stepTitle).toBe('Start');
    expect((vars.steps as unknown[]).length).toBe(3);
    //without an artboard (or without steps) nothing is added
    expect(previewScope(p).steps).toBeUndefined();
    expect(previewScope(plain(), plain().artboards[0]).steps).toBeUndefined();
  });
});

describe('help', () => {
  it('has a Steps topic that names the settings and nodes it describes', () => {
    const t = TOPICS.find((x) => x.id === 'steps')!;
    expect(t).toBeDefined();
    const body = topicBody(t);
    for (const word of ['Back and jumps', 'Go to step', 'When the step changes', 'Scroll to scrub', 'Add a step bar', 'stepCount', 'ix.steps']) expect(body).toContain(word);
  });
});
