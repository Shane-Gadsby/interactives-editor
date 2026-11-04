import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { InterfacePanel } from '../src/panels/InterfacePanel';
import { acceptRename, addMessage, addUsed, addVariable, removeMessage, removeMissing, removeVariable, setMessageEntry, setRestrict, setVariableEntry, suggestions } from '../src/lib/public-interface';
import { TOPICS, topicBody } from '../src/help/topics';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function quiz(): Project {
  const p = createProject('Quiz');
  p.variables.push(
    { id: 'vs', name: 'score', type: 'number', initial: 0 },
    { id: 'vl', name: 'level', type: 'enum', initial: 'easy', options: ['easy', 'hard'] },
    { id: 'vx', name: 'scratch', type: 'string', initial: '' },
  );
  p.artboards[0].logic.nodes.push(
    { id: 'n1', kind: 'event.message', x: 0, y: 0, params: { name: 'addToCart' } },
    { id: 'n2', kind: 'action.emit', x: 0, y: 0, params: { name: 'finished', payload: 'score' } },
    { id: 'n3', kind: 'action.setVariable', x: 0, y: 0, params: { variable: 'vs' } },
  );
  return p;
}

describe('editing the public interface', () => {
  it('adds a variable with a suggested direction, once, and removes the interface when it is empty again', () => {
    const p = quiz();
    expect(addVariable(p, 'vs')).toBe(true);
    expect(addVariable(p, 'vs')).toBe(false);
    expect(addVariable(p, 'vl')).toBe(true);
    expect(p.settings.publicInterface!.variables).toEqual([
      { variable: 'vs', name: 'score', direction: 'output' },
      { variable: 'vl', name: 'level', direction: 'input' },
    ]);
    expect(addVariable(p, 'nope')).toBe(false);
    removeVariable(p, 'vs');
    removeVariable(p, 'vl');
    expect(p.settings.publicInterface).toBeUndefined();
  });

  it('keeps the old name when a variable is renamed until the rename is accepted', () => {
    const p = quiz();
    addVariable(p, 'vs', 'both');
    p.variables[0].name = 'points';
    expect(p.settings.publicInterface!.variables[0].name).toBe('score');
    acceptRename(p, 'vs');
    expect(p.settings.publicInterface!.variables[0].name).toBe('points');
  });

  it('edits descriptions (empty clears) and directions', () => {
    const p = quiz();
    addVariable(p, 'vs');
    setVariableEntry(p, 'vs', { description: 'Marks', direction: 'both' });
    expect(p.settings.publicInterface!.variables[0]).toMatchObject({ description: 'Marks', direction: 'both' });
    setVariableEntry(p, 'vs', { description: '  ' });
    expect(p.settings.publicInterface!.variables[0].description).toBeUndefined();
  });

  it('adds, renames and removes messages without duplicates', () => {
    const p = quiz();
    expect(addMessage(p, ' go ', 'send')).toBe(true);
    expect(addMessage(p, 'go', 'send')).toBe(false);
    expect(addMessage(p, 'go', 'receive')).toBe(true);
    expect(addMessage(p, '  ', 'send')).toBe(false);
    setMessageEntry(p, 'go', 'send', { name: 'went', description: 'It went', payload: { type: 'object', fields: [{ name: 'a', type: 'number' }] } });
    expect(p.settings.publicInterface!.messages[0]).toEqual({ name: 'went', direction: 'send', description: 'It went', payload: { type: 'object', fields: [{ name: 'a', type: 'number' }] } });
    setMessageEntry(p, 'went', 'send', { name: 'go' });
    expect(p.settings.publicInterface!.messages.map((m) => m.name)).toEqual(['go', 'go']);
    setMessageEntry(p, 'go', 'send', { payload: null });
    expect(p.settings.publicInterface!.messages[0].payload).toBeUndefined();
    removeMessage(p, 'go', 'send');
    removeMessage(p, 'go', 'receive');
    expect(p.settings.publicInterface).toBeUndefined();
  });

  it('the restrict switch alone keeps the interface in the document', () => {
    const p = quiz();
    setRestrict(p, true);
    expect(p.settings.publicInterface).toEqual({ variables: [], messages: [], restrictInputs: true });
    setRestrict(p, false);
    expect(p.settings.publicInterface).toBeUndefined();
  });

  it('removes entries for variables that are gone', () => {
    const p = quiz();
    addVariable(p, 'vs');
    addVariable(p, 'vl');
    p.variables = p.variables.filter((v) => v.id !== 'vl');
    expect(removeMissing(p)).toBe(1);
    expect(p.settings.publicInterface!.variables.map((v) => v.variable)).toEqual(['vs']);
  });

  it('suggestions and add-from-use take messages in use and the variables flows work with', () => {
    const p = quiz();
    const found = suggestions(p);
    expect(found.messages.map((m) => `${m.direction}:${m.name}`).sort()).toEqual(['receive:addToCart', 'send:finished']);
    expect(found.variables.find((v) => v.variable.id === 'vs')!.used).toBe(true);
    expect(found.variables.find((v) => v.variable.id === 'vx')!.used).toBe(false);
    expect(addUsed(p)).toEqual({ messages: 2, variables: 1 });
    expect(addUsed(p)).toEqual({ messages: 0, variables: 0 });
    expect(suggestions(p).variables.map((v) => v.variable.id)).toEqual(['vl', 'vx']);
  });
});

describe('the Public interface panel', () => {
  let root: Root;
  let host: HTMLElement;
  let s: EditorStore;
  const mount = (p: Project = quiz()) => {
    s = new EditorStore(p);
    setCurrentStore(s);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root.render(<InterfacePanel />));
  };
  const btn = (text: string) => Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes(text)) as HTMLButtonElement | undefined;
  const iface = () => s.get().project.settings.publicInterface;
  afterEach(() => {
    if (root) act(() => root.unmount());
    host?.remove();
    vi.restoreAllMocks();
  });

  it('starts empty with an explanation, and Add from what the project uses fills it', () => {
    mount();
    expect(host.querySelector('.pi-empty')).not.toBeNull();
    act(() => btn('Add from what the project uses')!.click());
    expect(iface()!.messages.map((m) => m.name).sort()).toEqual(['addToCart', 'finished']);
    expect(iface()!.variables.map((v) => v.name)).toEqual(['score']);
    expect(host.querySelector('.pi-empty')).toBeNull();
    expect(host.querySelectorAll('.pi-row[data-kind="variable"]').length).toBe(1);
    expect(host.querySelectorAll('.pi-row[data-kind="message"]').length).toBe(2);
    expect(s.get().toast?.text).toMatch(/Added 1 variable and 2 messages/);
  });

  it('changes direction and shows a rename with a button that accepts it', () => {
    const p = quiz();
    addVariable(p, 'vs', 'output');
    p.variables[0].name = 'points';
    mount(p);
    expect(host.querySelector('.pi-summary')!.textContent).toMatch(/1 thing on this list no longer matches/);
    expect(host.querySelector('.pi-issue')!.textContent).toMatch(/"score" was renamed to "points"/);
    act(() => btn('Use the new name')!.click());
    expect(iface()!.variables[0].name).toBe('points');
    expect(host.querySelector('.pi-issue')).toBeNull();
    const sel = host.querySelector('.pi-row[data-kind="variable"] select') as HTMLSelectElement;
    act(() => {
      sel.value = 'both';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(iface()!.variables[0].direction).toBe('both');
  });

  it('flags a deleted variable and removes it', () => {
    const p = quiz();
    addVariable(p, 'vl');
    p.variables = p.variables.filter((v) => v.id !== 'vl');
    mount(p);
    expect(host.querySelector('.pi-issue.error')!.textContent).toMatch(/no such variable/);
    act(() => btn('Remove it')!.click());
    expect(iface()).toBeUndefined();
  });

  it('adds a message by hand and edits its payload fields', () => {
    mount();
    const input = host.querySelector('.pi-toolbar input[placeholder="New message name"]') as HTMLInputElement;
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(input, 'checkout');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => btn('Add message')!.click());
    expect(iface()!.messages).toEqual([{ name: 'checkout', direction: 'receive' }]);
    const payloadSel = host.querySelector('.pi-payload select') as HTMLSelectElement;
    act(() => {
      payloadSel.value = 'object';
      payloadSel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    act(() => btn('Add field')!.click());
    expect(iface()!.messages[0].payload).toEqual({ type: 'object', fields: [{ name: 'field1', type: 'string' }] });
    expect(host.querySelector('.pi-issue')!.textContent).toMatch(/no On message node or ix.on handler listens for it/);
  });

  it('the restrict checkbox turns the option on and off', () => {
    mount();
    const box = Array.from(host.querySelectorAll('label')).find((l) => l.textContent?.includes('Only public inputs'))!.querySelector('input') as HTMLInputElement;
    act(() => box.click());
    expect(iface()!.restrictInputs).toBe(true);
    act(() => box.click());
    expect(iface()).toBeUndefined();
  });

  it('opens the reference page in a frame that cannot reach the editor', () => {
    const p = quiz();
    addVariable(p, 'vl');
    mount(p);
    act(() => btn('Reference page')!.click());
    const frame = document.querySelector('iframe.pi-reference-frame') as HTMLIFrameElement;
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('srcdoc')).toContain('input-level');
    act(() => (document.querySelector('.pi-reference-modal header button[title^="Close"], .pi-reference-modal header button[data-tip^="Close"]') as HTMLElement).click());
    expect(document.querySelector('iframe.pi-reference-frame')).toBeNull();
  });
});

describe('help', () => {
  it('has a topic for the public interface with the worked embed example', () => {
    const t = TOPICS.find((x) => x.id === 'public-interface')!;
    expect(t).toBeTruthy();
    const body = topicBody(t);
    expect(body).toContain('input-level="hard"');
    expect(body).toContain('pause-offscreen');
    expect(body).toContain('Only public inputs can be set from outside');
  });
});
