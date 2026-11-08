//The Checklist tab shows each item short and keeps its how and why in a fold; an old checklist with no detail looks as it did.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { cleanChecklist } from '../shared/template.mjs';

vi.mock('../src/lib/db', async (orig) => ({ ...(await orig<typeof import('../src/lib/db')>()), getTemplate: async () => ({ version: 1 }) }));

import { ChecklistPanel } from '../src/panels/ChecklistPanel';
import { BRANDED_STARTERS, COLOURWAYS, projectFromBrandedStarter } from '../src/lib/branded';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const withChecklist = (checklist: { id: string; text: string; detail?: string }[]): Project => {
  const p = createProject('T');
  p.template = { builtin: 'x', name: 'X', version: 1, checklist } as Project['template'];
  return p;
};
const mount = async (p: Project) => {
  setCurrentStore(new EditorStore(p));
  await act(async () => root.render(<ChecklistPanel />));
};

describe('checklist items with detail', () => {
  it('shows the short item, with the detail in a closed fold under it', async () => {
    await mount(withChecklist([{ id: 'a', text: 'Write your prompt', detail: 'The prompt variable in the Variables tab holds it.' }, { id: 'b', text: 'Change the title' }]));
    const rows = [...host.querySelectorAll('ol.checklist li')];
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('.checklist-text')!.textContent).toBe('Write your prompt');
    const fold = rows[0].querySelector('details.checklist-detail') as HTMLDetailsElement;
    expect(fold.open).toBe(false);
    expect(fold.querySelector('summary')!.textContent).toBe('Why and how');
    expect(fold.querySelector('p')!.textContent).toContain('prompt variable');
    //an item with no detail (every checklist from before the fold) has no fold
    expect(rows[1].querySelector('details')).toBeNull();
    expect(rows[1].querySelector('.checklist-text')!.textContent).toBe('Change the title');
  });

  it('opens the fold from its summary, and the checkbox is still labelled by the short item', async () => {
    await mount(withChecklist([{ id: 'a', text: 'Write your prompt', detail: 'More words.' }]));
    const fold = host.querySelector('details') as HTMLDetailsElement;
    await act(async () => void (fold.querySelector('summary') as HTMLElement).click());
    expect(fold.open).toBe(true);
    expect(host.querySelector('input[type=checkbox]')!.getAttribute('aria-label')).toBe('Done: Write your prompt');
  });

  it('starts every starter with a short item and its detail, built into the project', () => {
    const s = BRANDED_STARTERS.find((x) => x.key === 'assessment/spelling-test')!;
    const list = projectFromBrandedStarter(s, COLOURWAYS[0]).template!.checklist;
    expect(list.every((i) => i.text.length <= 90)).toBe(true);
    expect(list.some((i) => i.detail && i.detail.length > 150)).toBe(true);
  });

  it('keeps the detail when a checklist is saved as a template, and tidies it like the text', () => {
    const out = cleanChecklist([{ id: 'a', text: 'Write it', detail: '  The  how\n and why. ' }, { id: 'b', text: 'No detail' }, { id: 'c', text: 'Empty', detail: '   ' }], () => 'x');
    expect(out[0]).toMatchObject({ text: 'Write it', detail: 'The how and why.' });
    expect('detail' in out[1]).toBe(false);
    expect('detail' in out[2]).toBe(false);
  });
});
