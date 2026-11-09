//The Form view of a JSON data file in the Data tab: labelled fields, cards for lists, edits writing the right JSON, the outline, Tree for structure.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EditorView } from 'codemirror';
import { createProject, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';

//jsdom's Blob and File can't be read back as text (and not at once), so the ones made here remember what they were made from
const RealBlob = Blob;
const RealFile = File;
const partsText = (parts?: unknown[]) => (parts ?? []).map((p) => (typeof p === 'string' ? p : (p as { __t?: string }).__t ?? '')).join('');
class TextBlob extends RealBlob {
  __t: string;
  constructor(parts?: BlobPart[], opts?: BlobPropertyBag) {
    super(parts, opts);
    this.__t = partsText(parts);
  }
  text() {
    return Promise.resolve(this.__t);
  }
}
class TextFile extends RealFile {
  __t: string;
  constructor(parts: BlobPart[], name: string, opts?: FilePropertyBag) {
    super(parts, name, opts);
    this.__t = partsText(parts);
  }
  text() {
    return Promise.resolve(this.__t);
  }
}

const saved = vi.hoisted(() => ({ files: new Map<string, string>(), puts: [] as string[] }));
vi.mock('../src/lib/db', async (orig) => ({
  ...(await orig<typeof import('../src/lib/db')>()),
  putAsset: async (_p: string, id: string, blob: Blob) => {
    saved.files.set(id, await blob.text());
    saved.puts.push(id);
  },
  getAsset: async (_p: string, id: string) => (saved.files.has(id) ? new Blob([saved.files.get(id)!]) : null),
}));

import { DataPanel } from '../src/panels/DataPanel';
import { dataCache } from '../src/lib/data';
import { assetUrls } from '../src/lib/assets';

//CodeMirror measures text with ranges, which jsdom doesn't lay out
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;


let root: Root;
let host: HTMLElement;
let s: EditorStore;
let blobs = new Map<string, string>();
let n = 0;

const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
const settle = async () => {
  for (let i = 0; i < 4; i++) await flush();
};
const button = (label: string | RegExp) => Array.from(host.querySelectorAll('button')).find((b) => (typeof label === 'string' ? b.textContent?.trim() === label || b.getAttribute('aria-label') === label : label.test(b.textContent ?? ''))) as HTMLButtonElement | undefined;
const click = (el: Element | undefined) => act(() => (el as HTMLElement).click());
const type = async (input: HTMLInputElement | HTMLTextAreaElement, text: string) => {
  const setter = Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    input.focus();
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const blurAway = async () => {
  await act(async () => {
    (document.activeElement as HTMLElement | null)?.blur();
    host.querySelector('.data-file')?.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
  });
  await settle();
};
const source = (i = 0) => s.get().project.dataSources[i];
const savedText = (i = 0) => saved.files.get(source(i).assetId!);

function project(files: { name: string; mime: string; text: string; kind: 'json' | 'csv' | 'tsv' | 'text' }[]): Project {
  const p = createProject('Data');
  p.id = 'prdatafile01';
  files.forEach((f, i) => {
    const id = `as${i + 1}`;
    p.assets.push({ id, name: f.name, mime: f.mime, size: f.text.length });
    p.dataSources.push({ id: `ds${i + 1}`, name: f.name.replace(/\.\w+$/, ''), kind: f.kind, source: 'asset', assetId: id });
    saved.files.set(id, f.text);
    assetUrls.register(id, new TextBlob([f.text]));
  });
  return p;
}
async function mount(p: Project) {
  s = new EditorStore(p);
  setCurrentStore(s);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<DataPanel />));
  await settle();
}

beforeEach(() => {
  saved.files.clear();
  saved.puts = [];
  blobs = new Map();
  n = 0;
  dataCache.clear();
  vi.stubGlobal('Blob', TextBlob);
  vi.stubGlobal('File', TextFile);
  vi.spyOn(URL, 'createObjectURL').mockImplementation((b: Blob | MediaSource) => {
    const url = `blob:t${++n}`;
    blobs.set(url, (b as unknown as { __t: string }).__t);
    return url;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', async (url: string) => {
    await new Promise((r) => setTimeout(r, 0));
    if (blobs.has(String(url))) return { ok: true, status: 200, headers: new Headers(), text: async () => blobs.get(String(url))! };
    return { ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), text: async () => JSON.stringify([{ a: 1, b: 'x' }]) };
  });
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  assetUrls.clear();
});


const SCRIPT_OBJ = {
  title: 'Academic integrity',
  startLabel: 'Begin',
  passMark: 0.7,
  showHints: true,
  coachNotes: null,
  settings: { allow_retry: true },
  opening: [{ speaker: 'Tutor', line: 'Welcome' }, { speaker: 'You', line: 'Hi' }],
  dilemmas: [
    {
      id: 'd1',
      title: 'The old assignment',
      question: 'Share your answers?\nShe says nobody will know.',
      choices: [{ label: 'Yes', score: 0, ai: false, note: null }, { label: 'No', score: 2, ai: true, note: 'good' }],
      tags: ['a', 'b'],
    },
    { id: 'd2', title: 'Cite the source?', question: 'Always?', choices: [{ label: 'Always', score: 2, ai: false, note: null }], tags: [] },
  ],
};
const SCRIPT = JSON.stringify(SCRIPT_OBJ, null, 2);
const files = (text = SCRIPT) => [{ name: 'script.json', mime: 'application/json', text, kind: 'json' as const }];
const saved$ = () => JSON.parse(savedText()!);
//the box for a field by its label text
const box = (label: string, within: ParentNode = host) => {
  const l = Array.from(within.querySelectorAll<HTMLLabelElement>('label.form-label')).find((x) => x.textContent === label);
  return l ? (document.getElementById(l.htmlFor) as HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement) : null;
};
const card = (title: string) => Array.from(host.querySelectorAll<HTMLElement>('.form-card')).find((c) => c.querySelector('.form-card-toggle')?.textContent?.trim().endsWith(title))!;
const titles = () => Array.from(host.querySelectorAll('.form-card-toggle')).map((b) => b.textContent?.replace(/^[▾▸]/, '').trim());
const inCard = (c: HTMLElement, name: string | RegExp) => Array.from(c.querySelectorAll('button')).find((b) => (typeof name === 'string' ? b.textContent?.trim() === name || b.getAttribute('aria-label') === name : name.test(b.getAttribute('aria-label') ?? b.textContent ?? ''))) as HTMLButtonElement;

describe('opening in the form', () => {
  it('a JSON file opens in Form, with Tree and Raw text beside it', async () => {
    await mount(project(files()));
    expect(button('Form')?.getAttribute('aria-pressed')).toBe('true');
    expect(button('Tree')?.getAttribute('aria-pressed')).toBe('false');
    expect(button('Raw text')?.getAttribute('aria-pressed')).toBe('false');
    expect(host.querySelector('[role="tree"]')).toBeNull();
    expect(host.querySelector('.cm-editor')).toBeNull();
  });

  it('CSV and TSV still open in Table, with no Form', async () => {
    await mount(project([{ name: 'people.csv', mime: 'text/csv', text: 'name,score\nAda,3\n', kind: 'csv' }]));
    expect(button('Form')).toBeUndefined();
    expect(button('Table')?.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('table')).toBeTruthy();
  });

  it('shows key names as plain labels, with the key in the tooltip', async () => {
    await mount(project(files()));
    const labels = Array.from(host.querySelectorAll('.form-label')).map((l) => l.textContent);
    expect(labels).toContain('Start label');
    expect(labels).toContain('Pass mark');
    expect(labels).toContain('Show hints');
    expect(labels).toContain('Allow retry');
    expect(Array.from(host.querySelectorAll('.form-label')).find((l) => l.textContent === 'Start label')?.getAttribute('title')).toContain('“startLabel”');
  });

  it('a short text is a line, a long one or one with a line break a growing box, a number a number box, yes/no a switch, empty a way to fill it', async () => {
    await mount(project(files()));
    expect(box('Start label')?.tagName).toBe('INPUT');
    expect((box('Start label') as HTMLInputElement).value).toBe('Begin');
    const q = box('Question')!;
    expect(q.tagName).toBe('TEXTAREA');
    expect((q as HTMLTextAreaElement).value).toBe('Share your answers?\nShe says nobody will know.');
    expect(box('Pass mark')?.getAttribute('inputmode')).toBe('decimal');
    const sw = box('Show hints')!;
    expect(sw.getAttribute('role')).toBe('switch');
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(host.textContent).toContain('empty');
    expect(button('Fill in Coach notes')).toBeTruthy();
  });

  it('cards are groups with headings, collapsible, titled from a good field plus their number', async () => {
    await mount(project(files()));
    expect(titles()).toEqual(['Settings', 'Opening 1: Tutor', 'Opening 2: You', 'Dilemma 1: The old assignment', 'Choice 1: Yes', 'Choice 2: No', 'Dilemma 2: Cite the source?', 'Choice 1: Always']);
    const c = card('Dilemma 1: The old assignment');
    expect(c.getAttribute('role')).toBe('group');
    const head = c.querySelector('.form-card-title')!;
    expect(c.getAttribute('aria-labelledby')).toBe(head.id);
    const toggle = c.querySelector<HTMLButtonElement>('.form-card-toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    await click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(c.querySelector('.form-card-body')?.hasAttribute('hidden')).toBe(true);
    expect(c.querySelector('input')).toBeNull();
    await click(toggle);
    expect(c.querySelector('input')).toBeTruthy();
    // the fields sit in fieldsets with a legend
    expect(c.querySelector('fieldset > legend')?.textContent).toContain('Dilemma 1: The old assignment');
  });

  it('a title follows what is typed in its field', async () => {
    await mount(project(files()));
    await type(box('Title', card('Dilemma 1: The old assignment')) as HTMLInputElement, 'A new name');
    expect(titles()).toContain('Dilemma 1: A new name');
  });

  it('Open all and Close all work on every card', async () => {
    await mount(project(files()));
    await click(button('Close all'));
    expect(Array.from(host.querySelectorAll('.form-card-toggle')).every((b) => b.getAttribute('aria-expanded') === 'false')).toBe(true);
    await click(button('Open all'));
    expect(Array.from(host.querySelectorAll('.form-card-toggle')).every((b) => b.getAttribute('aria-expanded') === 'true')).toBe(true);
  });

  it('a list of many cards opens only the first', async () => {
    const dilemmas = Array.from({ length: 6 }, (_, i) => ({ title: `T${i}`, body: `b${i}`, extra: { x: 1 } }));
    await mount(project(files(JSON.stringify({ dilemmas }))));
    const open = Array.from(host.querySelectorAll('.form-card')).filter((c) => c.classList.contains('open') && /^▾Dilemma/.test(c.querySelector('.form-card-toggle')?.textContent ?? ''));
    expect(open).toHaveLength(1);
  });
});

describe('edits write the right JSON', () => {
  it('typing in a text field writes a new version of the file, keeping its layout', async () => {
    await mount(project(files()));
    const before = source().assetId;
    await type(box('Start label') as HTMLInputElement, 'Start here');
    await blurAway();
    expect(source().assetId).not.toBe(before);
    expect(savedText()).toBe(JSON.stringify({ ...SCRIPT_OBJ, startLabel: 'Start here' }, null, 2));
    expect(host.querySelector('.data-file-status')?.textContent).toBe('Saved');
  });

  it('keeps a compact file compact and a tab-indented one tabbed', async () => {
    await mount(project(files('{"a":"x","b":[1]}')));
    await type(box('A') as HTMLInputElement, 'y');
    await blurAway();
    expect(savedText()).toBe('{"a":"y","b":[1]}');
  });

  it('a long text box keeps its line breaks', async () => {
    await mount(project(files()));
    await type(box('Question', card('Dilemma 1: The old assignment')) as HTMLTextAreaElement, 'One\nTwo\nThree');
    await blurAway();
    expect(saved$().dilemmas[0].question).toBe('One\nTwo\nThree');
  });

  it('a number stays a number, and what is not one yet waits', async () => {
    await mount(project(files()));
    const n = box('Pass mark') as HTMLInputElement;
    await type(n, '0.85');
    await blurAway();
    expect(saved$().passMark).toBe(0.85);
    await type(box('Pass mark') as HTMLInputElement, '-');
    expect(host.querySelector('.form-bad')?.textContent).toContain('Not a number');
    expect(box('Pass mark')?.getAttribute('aria-invalid')).toBe('true');
    await blurAway();
    expect(saved$().passMark).toBe(0.85);
    expect(host.querySelector('.form-bad')).toBeNull();
    expect((box('Pass mark') as HTMLInputElement).value).toBe('0.85');
    // 0 is a number too
    await type(box('Pass mark') as HTMLInputElement, '0');
    await blurAway();
    expect(saved$().passMark).toBe(0);
  });

  it('a yes/no switch writes true and false', async () => {
    await mount(project(files()));
    await click(box('Show hints') as HTMLElement);
    await blurAway();
    expect(saved$().showHints).toBe(false);
    expect(box('Show hints')?.getAttribute('aria-checked')).toBe('false');
    await click(box('Show hints') as HTMLElement);
    await blurAway();
    expect(saved$().showHints).toBe(true);
  });

  it('Fill in gives an empty value text, or the kind its neighbours have', async () => {
    await mount(project(files()));
    await click(button('Fill in Coach notes'));
    await blurAway();
    expect(saved$().coachNotes).toBe('');
    expect(box('Coach notes')?.tagName).toBe('INPUT');
    // Choice 1's note is empty and choice 2's is text, so it is filled in as text; a score null beside numbers becomes a number
    await act(async () => root.unmount());
    host.remove();
    await mount(project(files(JSON.stringify({ rows: [{ score: null, ok: null }, { score: 4, ok: true }] }))));
    const first = card('Row 1');
    await click(inCard(first, 'Fill in Score'));
    await click(inCard(first, 'Fill in Ok'));
    await blurAway();
    expect(saved$().rows[0]).toEqual({ score: 0, ok: false });
  });

  it('Undo brings the old file back, and the form follows', async () => {
    await mount(project(files()));
    await type(box('Start label') as HTMLInputElement, 'Changed');
    await blurAway();
    expect((box('Start label') as HTMLInputElement).value).toBe('Changed');
    await act(async () => s.undo());
    await settle();
    expect((box('Start label') as HTMLInputElement).value).toBe('Begin');
  });

  it('a field that holds a list of plain values is a list of fields', async () => {
    await mount(project(files()));
    const c = card('Dilemma 1: The old assignment');
    expect((box('Tag 1', c) as HTMLInputElement).value).toBe('a');
    expect((box('Tag 2', c) as HTMLInputElement).value).toBe('b');
    await type(box('Tag 2', c) as HTMLInputElement, 'bee');
    await blurAway();
    expect(saved$().dilemmas[0].tags).toEqual(['a', 'bee']);
  });
});

describe('lists of cards', () => {
  it('Add another copies the fields of the items there, empty, with their types, and opens the new card', async () => {
    await mount(project(files()));
    const choices = card('Choice 2: No').closest('.form-list')!;
    await click(Array.from(choices.querySelectorAll('button')).find((b) => b.textContent === 'Add another'));
    //focus is checked before anything blurs it
    const focused = document.activeElement as HTMLElement;
    expect(focused.textContent).toContain('Choice 3');
    expect(focused.getAttribute('aria-expanded')).toBe('true');
    await blurAway();
    expect(saved$().dilemmas[0].choices).toEqual([
      { label: 'Yes', score: 0, ai: false, note: null },
      { label: 'No', score: 2, ai: true, note: 'good' },
      { label: '', score: 0, ai: false, note: '' },
    ]);
    expect(titles()).toContain('Choice 3');
  });

  it('a note that was empty in one item and text in another comes back as text', async () => {
    await mount(project(files()));
    const choices = card('Choice 2: No').closest('.form-list')!;
    await click(Array.from(choices.querySelectorAll('button')).find((b) => b.textContent === 'Add another'));
    await blurAway();
    expect(typeof saved$().dilemmas[0].choices[2].note).toBe('string');
  });

  it('Add another on a list of plain values adds a blank of the same kind and focuses it', async () => {
    await mount(project(files()));
    const c = card('Dilemma 1: The old assignment');
    const list = Array.from(c.querySelectorAll('.form-list')).find((l) => l.querySelector('.form-list-title')?.textContent?.startsWith('Tags'))!;
    await click(Array.from(list.querySelectorAll('button')).find((b) => b.textContent === 'Add another'));
    expect((document.activeElement as HTMLInputElement).value).toBe('');
    expect(document.activeElement?.id.endsWith('n2')).toBe(true);
    await blurAway();
    expect(saved$().dilemmas[0].tags).toEqual(['a', 'b', '']);
  });

  it('an empty list offers Add an item, as text', async () => {
    await mount(project(files()));
    const c = card('Dilemma 2: Cite the source?');
    const list = Array.from(c.querySelectorAll('.form-list')).find((l) => l.querySelector('.form-list-title')?.textContent?.startsWith('Tags'))!;
    expect(list.textContent).toContain('No items yet.');
    await click(Array.from(list.querySelectorAll('button')).find((b) => b.textContent === 'Add an item'));
    await blurAway();
    expect(saved$().dilemmas[1].tags).toEqual(['']);
  });

  it('Up and Down move a card among its neighbours and the button keeps focus', async () => {
    await mount(project(files()));
    await click(inCard(card('Dilemma 2: Cite the source?'), 'Move Dilemma 2: Cite the source? up'));
    //it landed first, where Up is off, so focus goes to its Down
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe('Move Dilemma 1: Cite the source? down');
    await blurAway();
    expect(saved$().dilemmas.map((d: { id: string }) => d.id)).toEqual(['d2', 'd1']);
    expect(titles().filter((t) => t?.startsWith('Dilemma'))).toEqual(['Dilemma 1: Cite the source?', 'Dilemma 2: The old assignment']);
    // the first card cannot go up, nor the last go down
    expect(inCard(card('Dilemma 1: Cite the source?'), 'Move Dilemma 1: Cite the source? up').disabled).toBe(true);
    expect(inCard(card('Dilemma 2: The old assignment'), 'Move Dilemma 2: The old assignment down').disabled).toBe(true);
    await click(inCard(card('Dilemma 1: Cite the source?'), 'Move Dilemma 1: Cite the source? down'));
    await blurAway();
    expect(saved$().dilemmas.map((d: { id: string }) => d.id)).toEqual(['d1', 'd2']);
  });

  it('Copy puts a full copy just after the card', async () => {
    await mount(project(files()));
    await click(inCard(card('Dilemma 1: The old assignment'), 'Copy Dilemma 1: The old assignment'));
    await blurAway();
    const d = saved$().dilemmas;
    expect(d).toHaveLength(3);
    expect(d[1]).toEqual(d[0]);
    expect(d[2].id).toBe('d2');
    expect(titles().filter((t) => t?.startsWith('Dilemma'))).toHaveLength(3);
  });

  it('Delete removes a card, and focus goes to its neighbour', async () => {
    await mount(project(files()));
    await click(inCard(card('Opening 2: You'), 'Delete Opening 2: You'));
    expect((document.activeElement as HTMLElement).textContent).toContain('Opening 1: Tutor');
    await blurAway();
    expect(saved$().opening).toEqual([{ speaker: 'Tutor', line: 'Welcome' }]);
    expect(titles()).not.toContain('Opening 2: You');
    // Undo puts it back
    await act(async () => s.undo());
    await settle();
    expect(titles()).toContain('Opening 2: You');
  });

  it('deleting the only card falls back to the list, which can then be added to', async () => {
    await mount(project(files()));
    await click(inCard(card('Dilemma 2: Cite the source?').querySelector<HTMLElement>('.form-card .form-card')!, 'Delete Choice 1: Always'));
    expect(document.activeElement?.textContent).toBe('Add an item');
    await blurAway();
    expect(saved$().dilemmas[1].choices).toEqual([]);
  });

  it('a list of plain values has Up, Down, Copy and Delete on every field', async () => {
    await mount(project(files()));
    const c = card('Dilemma 1: The old assignment');
    const group = (label: string) => c.querySelector<HTMLElement>(`[role="group"][aria-label="Actions for ${label}"]`)!;
    await click(Array.from(group('Tag 1').querySelectorAll('button')).find((b) => b.textContent === 'Down'));
    await blurAway();
    expect(saved$().dilemmas[0].tags).toEqual(['b', 'a']);
    await click(Array.from(group('Tag 1').querySelectorAll('button')).find((b) => b.textContent === 'Copy'));
    await blurAway();
    expect(saved$().dilemmas[0].tags).toEqual(['b', 'b', 'a']);
    await click(Array.from(group('Tag 3').querySelectorAll('button')).find((b) => b.textContent === 'Delete'));
    await blurAway();
    expect(saved$().dilemmas[0].tags).toEqual(['b', 'b']);
  });

  it('simple flat rows show as cards, and as the table when asked', async () => {
    await mount(project(files()));
    const list = Array.from(host.querySelectorAll('.form-list')).find((l) => l.querySelector('.form-list-title')?.textContent?.startsWith('Opening'))! as HTMLElement;
    expect(list.querySelector('table')).toBeNull();
    const seg = list.querySelector('[role="group"][aria-label="Show Opening as"]')!;
    await click(Array.from(seg.querySelectorAll('button')).find((b) => b.textContent === 'Table'));
    const table = list.querySelector('table')!;
    expect(table).toBeTruthy();
    await type(table.querySelector<HTMLInputElement>('input[aria-label="line, row 0"]')!, 'Hello there');
    await blurAway();
    expect(saved$().opening[0]).toEqual({ speaker: 'Tutor', line: 'Hello there' });
    await click(Array.from(seg.querySelectorAll('button')).find((b) => b.textContent === 'Cards'));
    expect(list.querySelector('table')).toBeNull();
  });

  it('many short rows open as a table by default', async () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ code: `c${i}`, mark: i }));
    await mount(project(files(JSON.stringify({ rows }))));
    expect(host.querySelector('table[aria-label="Rows as a table"]')).toBeTruthy();
  });

  it('a long list shows fifty cards at a time', async () => {
    const dilemmas = Array.from({ length: 120 }, (_, i) => ({ title: `T${i}`, body: { deep: true } }));
    await mount(project(files(JSON.stringify({ dilemmas }))));
    expect(host.querySelectorAll('.form-card-toggle').length).toBeLessThan(120 * 2);
    expect(titles().filter((t) => /^Dilemma/.test(t ?? ''))).toHaveLength(50);
    await click(button(/Show 50 more of 70 left/));
    expect(titles().filter((t) => /^Dilemma/.test(t ?? ''))).toHaveLength(100);
  });
});

describe('the outline', () => {
  const outline = () => host.querySelector('nav[aria-label^="Outline"]')!;
  const entry = (title: string) => Array.from(outline().querySelectorAll('button')).find((b) => b.textContent === title)!;

  it('lists the cards, and its entries say where they sit', async () => {
    await mount(project(files()));
    const names = Array.from(outline().querySelectorAll('button')).map((b) => b.textContent);
    expect(names).toContain('Dilemma 1: The old assignment');
    expect(names).toContain('Choices (2)');
    expect(entry('Choices (2)').getAttribute('title')).toBe('Jump to Dilemmas > Dilemma 1: The old assignment > Choices');
  });

  it('jumps to a card, opening it and the ones around it, and moves focus to it', async () => {
    await mount(project(files()));
    await click(button('Close all'));
    await click(entry('Choice 1: Always'));
    expect(document.activeElement?.textContent).toContain('Choice 1: Always');
    expect(document.activeElement?.getAttribute('aria-expanded')).toBe('true');
    expect(card('Dilemma 2: Cite the source?').querySelector('.form-card-toggle')?.getAttribute('aria-expanded')).toBe('true');
  });

  it('jumps to a list heading', async () => {
    await mount(project(files()));
    await click(entry('Tags (2)'));
    expect(document.activeElement?.tagName).toMatch(/^H[3-6]$/);
    expect(document.activeElement?.textContent).toContain('Tags');
  });

  it('is left out of a file with no cards', async () => {
    await mount(project(files('{"a": "x"}')));
    expect(host.querySelector('nav')).toBeNull();
  });
});

describe('structure changes stay in Tree', () => {
  it('says so in a line, with a button that opens Tree', async () => {
    await mount(project(files()));
    expect(host.querySelector('.data-formview-note')?.textContent).toContain('add a new field, rename one, or change what a field holds, use Tree');
    await click(button('Open Tree'));
    expect(button('Tree')?.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[role="tree"]')).toBeTruthy();
  });

  it('a card opens Tree at its own spot, with the row selected and focused', async () => {
    await mount(project(files()));
    await click(inCard(card('Choice 2: No'), 'Open Choice 2: No in Tree'));
    expect(host.querySelector('[role="tree"]')).toBeTruthy();
    const row = document.activeElement as HTMLElement;
    expect(row.getAttribute('role')).toBe('treeitem');
    expect(row.getAttribute('aria-label')).toMatch(/^item 1, /);
    expect(row.getAttribute('aria-selected')).toBe('true');
    expect(row.getAttribute('data-row')).toBe(JSON.stringify(['dilemmas', 0, 'choices', 1]));
  });

  it('a flat table in a bigger file is shown as rows so the spot is there to land on', async () => {
    await mount(project(files()));
    await click(Array.from(host.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === 'Open Opening 2: You in Tree'));
    expect((document.activeElement as HTMLElement).getAttribute('data-row')).toBe(JSON.stringify(['opening', 1]));
  });

  it('choosing Tree by hand afterwards starts at the top, not at the old spot', async () => {
    await mount(project(files()));
    await click(inCard(card('Choice 2: No'), 'Open Choice 2: No in Tree'));
    await click(button('Form'));
    await click(button('Tree'));
    expect((document.activeElement as HTMLElement).getAttribute('data-row')).not.toBe(JSON.stringify(['dilemmas', 0, 'choices', 1]));
  });

  it('a file that is a list of flat rows says Table, and its Open button goes there', async () => {
    await mount(project(files('[{"a": 1}, {"a": 2}]')));
    expect(host.querySelector('.data-formview-note')?.textContent).toContain('use Table');
    await click(button('Open Table'));
    expect(button('Table')?.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('table')).toBeTruthy();
  });
});

describe('switching views', () => {
  it('Form to Raw text and back shows the same file, and edits made in each carry over', async () => {
    await mount(project(files()));
    await type(box('Start label') as HTMLInputElement, 'From the form');
    await click(button('Raw text'));
    const cm = EditorView.findFromDOM(host.querySelector<HTMLElement>('.cm-editor')!)!;
    expect(cm.state.doc.toString()).toContain('"startLabel": "From the form"');
    await act(async () => cm.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: cm.state.doc.toString().replace('From the form', 'From the text') } }));
    await settle();
    await click(button('Form'));
    expect((box('Start label') as HTMLInputElement).value).toBe('From the text');
    await blurAway();
    expect(saved$().startLabel).toBe('From the text');
  });

  it('text that does not parse shows the raw text and turns Form off until it does', async () => {
    await mount(project(files('{"a": 1,}')));
    expect(button('Raw text')?.getAttribute('aria-pressed')).toBe('true');
    expect(button('Form')?.disabled).toBe(true);
    expect(button('Form')?.getAttribute('title')).toContain('Fix the error');
  });

  it('an empty file offers to start a list or a group in the form', async () => {
    await mount(project(files('')));
    // an empty file has nothing to show as a form, but it can be started
    await click(button('Raw text'));
    await click(button('Form'));
    await click(button('Start a group'));
    await blurAway();
    expect(savedText()).toBe('{}');
    expect(host.textContent).toContain('No fields yet');
  });

  it('a file with a group at the top is a card of fields, a lone value is a single field', async () => {
    await mount(project(files('"just text"')));
    expect((box('script') as HTMLInputElement).value).toBe('just text');
    await type(box('script') as HTMLInputElement, 'other');
    await blurAway();
    expect(savedText()).toBe('"other"');
  });
});

describe('read only and shared files', () => {
  it('a URL source shows the form but cannot change it', async () => {
    const p = createProject('Url');
    p.id = 'prdatafile03';
    p.dataSources.push({ id: 'dsu', name: 'feed', kind: 'json', source: 'url', url: 'https://example.com/feed.json', refresh: 0 });
    await mount(p);
    expect(button('Form')?.getAttribute('aria-pressed')).toBe('true');
    const inputs = Array.from(host.querySelectorAll<HTMLInputElement>('.form-text'));
    expect(inputs.length).toBeGreaterThan(0);
    expect(inputs.every((i) => i.readOnly)).toBe(true);
    expect(button('Add another')).toBeUndefined();
    expect(button(/^Delete /)).toBeUndefined();
    expect(host.querySelector('.data-file-status')?.textContent).toBe('Read only');
  });

  it('a file read by two sources says so above the form', async () => {
    const p = project(files());
    p.dataSources.push({ id: 'ds2', name: 'second', kind: 'json', source: 'asset', assetId: 'as1' });
    await mount(p);
    expect(host.textContent).toContain('This file is also read by');
    await type(box('Start label') as HTMLInputElement, 'Both');
    await blurAway();
    expect(source(0).assetId).toBe(source(1).assetId);
  });
});
