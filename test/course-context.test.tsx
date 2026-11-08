//The built-in context in the editor: the Data panel's entry with sample values and the per-course table, the canvas scope
//using them, and what reaches Preview and what a real export leaves out.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject, normalizeProject, template, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { DataPanel } from '../src/panels/DataPanel';
import { previewScope } from '../src/lib/data';
import { standaloneHtml } from '../src/lib/export';
import { getTopic, topicBody } from '../src/help/topics';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let s: EditorStore;

function project(): Project {
  const p = createProject('Per course');
  p.id = 'pcctx001';
  p.variables.push({ id: 'vdue', name: 'dueDate', type: 'string', initial: 'TBA' }, { id: 'vweeks', name: 'weeks', type: 'number', initial: 12 });
  return p;
}

function mount(p = project()) {
  s = new EditorStore(p);
  setCurrentStore(s);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<DataPanel />));
}
afterEach(() => {
  if (root) act(() => root.unmount());
  host?.remove();
  vi.unstubAllGlobals();
});

const type = (el: HTMLInputElement, value: string) => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // commit on blur reads the text after it has rendered
  act(() => void el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
};
const click = (el: Element) => act(() => (el as HTMLElement).click());

describe('the canvas scope', () => {
  it('has context with sample values, and project data or a variable of the same name wins', () => {
    const p = project();
    expect((previewScope(p).context as Record<string, unknown>).firstName).toBeTruthy();
    expect((previewScope(p).context as Record<string, unknown>).signedIn).toBe(true);
    p.sampleContext = { firstName: 'Sam', courseLabel: 'MAT1000_26S2_ONC' };
    expect(previewScope(p).context).toMatchObject({ firstName: 'Sam', courseCode: 'MAT1000', term: 'S2' });
    p.variables.push({ id: 'vc', name: 'context', type: 'string', initial: 'mine' });
    expect(previewScope(p).context).toBe('mine');
  });

  it('starts variables from the sample course\'s rows', () => {
    const p = project();
    p.sampleContext = { courseLabel: 'MAT1000_26S1_ONC' };
    p.courseValues = [
      { id: 'a', match: 'MAT1000_*', values: { vdue: '1 May' } },
      { id: 'b', match: 'ENG*', values: { vdue: 'never' } },
    ];
    expect(previewScope(p)).toMatchObject({ dueDate: '1 May', weeks: 12 });
    p.sampleContext = { courseLabel: 'PHY1000_26S1' };
    expect(previewScope(p)).toMatchObject({ dueDate: 'TBA' });
  });

  it('shows the greeting a learner would see in a text slot', () => {
    const p = project();
    p.sampleContext = { firstName: 'Sam' };
    expect(template('Hi {context.firstName}, {context.courseCode}', { vars: previewScope(p) })).toBe('Hi Sam, MAT1000');
  });
});

describe('the Data panel entry', () => {
  it('lists context as built in, first, and opens on it when there are no sources', () => {
    mount();
    const items = [...host.querySelectorAll('.list-item')].map((e) => e.textContent);
    expect(items[0]).toContain('context');
    expect(items[0]).toContain('built in');
    expect(host.textContent).toContain('context.courseLabel');
    expect(host.textContent).toContain('Per-course values');
  });

  it('keeps sample values in the project, blank ones included', () => {
    mount();
    const first = [...host.querySelectorAll<HTMLInputElement>('.context-table input[type=text], .context-table input:not([type])')].find((i) => i.value === 'Alex')!;
    type(first, 'Sam');
    expect(s.get().project.sampleContext?.firstName).toBe('Sam');
    type([...host.querySelectorAll<HTMLInputElement>('.context-table input')].find((i) => i.value === 'Sam')!, '');
    expect(s.get().project.sampleContext?.firstName).toBe('');
  });

  it('adds a course row, picks a variable for it, edits the value, and says whether the sample course matches', () => {
    mount();
    click([...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Add a course'))!);
    expect(s.get().project.courseValues).toHaveLength(1);
    type(host.querySelector<HTMLInputElement>('.course-row-head input')!, 'MAT1000_*');
    expect(s.get().project.courseValues![0].match).toBe('MAT1000_*');
    expect(host.querySelector('.course-row-head .badge')!.textContent).toContain('matches the sample course');
    const pick = host.querySelector<HTMLSelectElement>('.course-row select')!;
    act(() => {
      pick.value = 'vdue';
      pick.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(s.get().project.courseValues![0].values).toEqual({ vdue: 'TBA' });
    type(host.querySelector<HTMLInputElement>('.course-row .var-table input')!, '1 May');
    expect(s.get().project.courseValues![0].values.vdue).toBe('1 May');
    click(host.querySelector<HTMLElement>('.course-row .var-table button')!);
    expect(s.get().project.courseValues![0].values).toEqual({});
    click(host.querySelector<HTMLElement>('.course-row-head button')!);
    expect(s.get().project.courseValues).toBeUndefined();
  });

  it('survives a save and load, and a project from before has neither field', () => {
    const p = project();
    p.courseValues = [{ id: 'a', match: 'X*', values: { vdue: 'd' } }];
    p.sampleContext = { firstName: 'Sam' };
    const again = normalizeProject(JSON.parse(JSON.stringify(p)));
    expect(again.courseValues).toEqual(p.courseValues);
    expect(again.sampleContext).toEqual({ firstName: 'Sam' });
    expect('courseValues' in normalizeProject(project())).toBe(false);
  });
});

describe('Preview and exports', () => {
  it('preview plays as the sample learner; a real export asks the page, and neither carries the sample values in the project', async () => {
    const p = project();
    p.sampleContext = { firstName: 'Sam', courseLabel: 'MAT1000_26S1_ONC' };
    const preview = await standaloneHtml(p, { debug: true, context: { firstName: 'Sam', courseLabel: 'MAT1000_26S1_ONC' } });
    expect(preview).toContain('context: {"firstName":"Sam","courseLabel":"MAT1000_26S1_ONC"}');
    const real = await standaloneHtml(p, {});
    expect(real).not.toContain('context: {');
    expect(real).toContain('autoProgressStore()');
    const carried = (html: string) => JSON.parse(/<script type="application\/json" id="ix-project">([\s\S]*?)<\/script>/.exec(html)![1]) as Record<string, unknown>;
    expect(carried(real)).not.toHaveProperty('sampleContext');
    expect(carried(preview)).not.toHaveProperty('sampleContext');
  });
});

describe('help', () => {
  it('explains context, per-course values and the privacy line, and the other topics point to it', () => {
    const topic = topicBody(getTopic('course-context')!);
    expect(topic).toContain('context.firstName');
    expect(topic).toContain('Per-course values');
    expect(topic).toMatch(/Never a username, email/);
    expect(topic).toMatch(/Nothing from `context` is sent to analytics/);
    for (const id of ['data-sources', 'variables', 'results']) expect(topicBody(getTopic(id)!), id).toContain('(course-context)');
  });
});
