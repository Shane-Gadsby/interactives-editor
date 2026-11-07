//The editor's side of the sensor contract: the Project section that declares them and shows the consent screen as learners see it,
//the names the canvas can read, and what the Preview does.
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { patchSensors, SensorsSection } from '../src/panels/SensorsSection';
import { previewScope } from '../src/lib/data';
import { standaloneHtml } from '../src/lib/export';
import { getTopic, topicBody } from '../src/help/topics';
import { evaluate } from 'interactives-player';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let s: EditorStore;

function mount(p: Project) {
  s = new EditorStore(p);
  setCurrentStore(s);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<SensorsSection project={s.get().project as Project} />));
}
afterEach(() => {
  if (root) act(() => root.unmount());
  host?.remove();
});
const rerender = () => act(() => root.render(<SensorsSection project={s.get().project as Project} />));
const click = (el: Element) => act(() => (el as HTMLElement).click());
const box = (label: string) => [...host.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].find((i) => i.closest('label')?.textContent?.includes(label))!;
const open = () => click(host.querySelector('.section-title')!);

describe('declaring sensors in the Project section', () => {
  it('drops a key when it goes back to nothing, so the document stays small', () => {
    const p = createProject('x');
    p.settings.sensors = { microphone: true, purpose: 'say it' };
    expect(patchSensors(p, { purpose: '' })).toEqual({ microphone: true });
    expect(patchSensors(p, { microphone: false, purpose: '' })).toBeUndefined();
    expect(patchSensors(p, { maxSeconds: 30 })).toEqual({ microphone: true, purpose: 'say it', maxSeconds: 30 });
    expect(patchSensors(p, { maxSeconds: 0 })).toEqual({ microphone: true, purpose: 'say it' });
  });

  it('starts closed with nothing declared, and ticking a box declares it and shows the consent screen made from it', () => {
    mount(createProject('x'));
    expect(host.textContent).not.toContain('What learners are asked');
    open();
    expect(box('Microphone')).toBeTruthy();
    click(box('Microphone'));
    rerender();
    expect((s.get().project as Project).settings.sensors).toEqual({ microphone: true });
    expect(host.textContent).toContain('This activity uses your microphone.');
    expect(host.textContent).toContain('This activity wants to use your microphone');
    expect(host.textContent).toContain('Do not use my microphone or camera');
    click(box('Camera'));
    rerender();
    expect(host.textContent).toContain('This activity uses your microphone and camera.');
    expect(host.textContent).toContain('Longest recording');
  });

  it('opens by itself for a project that already declares, and unticking everything removes the setting', () => {
    const p = createProject('x');
    p.settings.sensors = { photos: true };
    mount(p);
    expect(host.textContent).toContain('This activity uses a photo you choose or take.');
    expect(host.textContent).not.toContain('Longest recording');
    click(box('Photos'));
    expect((s.get().project as Project).settings.sensors).toBeUndefined();
  });

  it('shows the reason for no equal way in the consent screen', () => {
    const p = createProject('x');
    p.settings.sensors = { microphone: true, noAlternative: 'This part assesses speaking' };
    mount(p);
    expect(host.textContent).toContain('There is no other way to do this part. This part assesses speaking.');
  });
});

describe('the canvas and the preview', () => {
  it('reads microphone, camera and photos as ready for what is declared, and recordings that exist', () => {
    const p = createProject('x');
    p.settings.sensors = { microphone: true };
    p.artboards[0].logic.nodes.push({ id: 'n', kind: 'action.recordStart', x: 0, y: 0, params: { slot: 'answer' } });
    const scope = previewScope(p);
    expect(evaluate('[microphone, camera, photos, micLevel, recording, recordings.answer.state]', { vars: scope } as never)).toEqual(['ready', 'unavailable', 'unavailable', 0, false, 'empty']);
    p.variables.push({ id: 'vm', name: 'microphone', type: 'string', initial: 'mine' });
    expect(previewScope(p).microphone).toBe('mine');
  });

  it('gets the pretend microphone only when the project declares something', async () => {
    const p = createProject('x');
    // The player's own source is in the page too (and it carries the page builder's text), so only the page's start-up call is read
    const call = async (o: { debug?: boolean }) => {
      const html = await standaloneHtml(p as never, o);
      return html.slice(html.lastIndexOf('new Interactives.Player('));
    };
    const option = "media: Interactives.fakeMediaHost('works', document)";
    expect(await call({ debug: true })).not.toContain(option);
    p.settings.sensors = { microphone: true };
    expect(await call({ debug: true })).toContain(option);
    expect(await call({})).not.toContain(option);
  });
});

describe('the help', () => {
  it('has a topic that says what the page needs, in the house style', () => {
    const t = getTopic('sensors')!;
    const body = topicBody(t);
    expect(body).toContain('allow="microphone; camera"');
    expect(body).toContain('Do not use my microphone or camera');
    expect(body).toContain('No equal way to finish');
    expect(body).not.toContain('—');
    expect(topicBody(getTopic('export')!)).toContain('allow="microphone; camera"');
  });
});
