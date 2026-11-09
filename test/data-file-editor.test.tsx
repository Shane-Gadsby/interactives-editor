//The Data tab's file editor: raw text, table and tree, saving as a new version of the uploaded file, undo, shared files and URL sources.
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

const SCRIPT = JSON.stringify(
  {
    title: 'Academic integrity',
    opening: [{ speaker: 'Tutor', line: 'Welcome' }, { speaker: 'You', line: 'Hi' }],
    dilemmas: [
      { id: 'd1', question: 'Share your answers?', choices: [{ label: 'Yes', score: 0 }, { label: 'No', score: 2 }] },
      { id: 'd2', question: 'Cite the source?', choices: [{ label: 'Always', score: 2 }] },
    ],
  },
  null,
  2,
);
const CSV = 'name,score\nAda,3\nBo,4\n';

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
//JSON opens as a form; the tests of the tree and table go to them first, and the form's own tests ask for it
async function mount(p: Project, view: 'gui' | 'form' = 'gui') {
  s = new EditorStore(p);
  setCurrentStore(s);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<DataPanel />));
  await settle();
  if (view === 'gui') {
    const go = button('Tree') ?? button('Table');
    if (go && go.getAttribute('aria-pressed') === 'false') await click(go);
    await settle();
  }
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

describe('a JSON file as a tree', () => {
  it('opens as a tree with lists of flat objects as tables', async () => {
    await mount(project([{ name: 'script.json', mime: 'application/json', text: SCRIPT, kind: 'json' }]));
    expect(button('Tree')?.getAttribute('aria-pressed')).toBe('true');
    const tree = host.querySelector('[role="tree"]')!;
    expect(tree.getAttribute('aria-label')).toBe('script');
    // opening is a list of flat objects, so it opens as a table
    expect(host.querySelector('table[aria-label="opening as a table"]')).toBeTruthy();
    // dilemmas are not flat (they hold choices), so they are items; their choices open as a table one level down
    expect(host.querySelectorAll('[role="treeitem"]').length).toBeGreaterThan(4);
    expect(host.textContent).toContain('2 items');
  });

  it('writes an edited value back as a new version of the file, keeping the layout', async () => {
    await mount(project([{ name: 'script.json', mime: 'application/json', text: SCRIPT, kind: 'json' }]));
    const before = source().assetId;
    const title = host.querySelector<HTMLInputElement>('input[aria-label="title value"]')!;
    await type(title, 'Integrity');
    await blurAway();
    expect(source().assetId).not.toBe(before);
    const text = savedText()!;
    expect(JSON.parse(text).title).toBe('Integrity');
    expect(text).toBe(JSON.stringify({ ...JSON.parse(SCRIPT), title: 'Integrity' }, null, 2));
    expect(host.querySelector('.data-file-status')?.textContent).toBe('Saved');
  });

  it('Undo brings the old file back, and the view follows', async () => {
    await mount(project([{ name: 'script.json', mime: 'application/json', text: SCRIPT, kind: 'json' }]));
    const before = source().assetId;
    await type(host.querySelector<HTMLInputElement>('input[aria-label="title value"]')!, 'Changed');
    await blurAway();
    expect(host.querySelector<HTMLInputElement>('input[aria-label="title value"]')!.value).toBe('Changed');
    await act(async () => s.undo());
    await settle();
    expect(source().assetId).toBe(before);
    expect(host.querySelector<HTMLInputElement>('input[aria-label="title value"]')!.value).toBe('Academic integrity');
    // the old bytes are still on the server, so redo works too
    await act(async () => s.redo());
    await settle();
    expect(host.querySelector<HTMLInputElement>('input[aria-label="title value"]')!.value).toBe('Changed');
  });

  it('adds a key and an item, changes a type, and deletes a row from the toolbar', async () => {
    await mount(project([{ name: 'script.json', mime: 'application/json', text: '{"a": 1, "list": ["x"]}', kind: 'json' }]));
    const row = (name: string) => Array.from(host.querySelectorAll<HTMLElement>('[role="treeitem"]')).find((r) => r.getAttribute('aria-label')?.startsWith(name))!;
    // the root row holds the cursor: add a key inside it
    await click(button('Inside'));
    await blurAway();
    expect(Object.keys(JSON.parse(savedText()!))).toEqual(['a', 'list', 'newKey']);
    // a: number to text
    await act(async () => row('a,').focus());
    const hold = host.querySelector<HTMLSelectElement>('.data-grid-bar select')!;
    await act(async () => {
      hold.value = 'text';
      hold.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await blurAway();
    expect(JSON.parse(savedText()!).a).toBe('1');
    // delete newKey
    await act(async () => row('newKey,').focus());
    await click(button('Delete'));
    await blurAway();
    expect(Object.keys(JSON.parse(savedText()!))).toEqual(['a', 'list']);
  });

  it('moves with the arrow keys, opens with Right and closes with Left', async () => {
    await mount(project([{ name: 'script.json', mime: 'application/json', text: '{"a": {"b": {"c": 1}}, "z": 2}', kind: 'json' }]));
    const items = () => Array.from(host.querySelectorAll<HTMLElement>('[role="treeitem"]'));
    const key = (el: HTMLElement, k: string) => act(async () => void el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })));
    const root0 = items()[0];
    await act(async () => root0.focus());
    await key(root0, 'ArrowDown');
    const a = items()[1];
    expect(document.activeElement).toBe(a);
    expect(a.getAttribute('aria-expanded')).toBe('true');
    await key(a, 'ArrowDown');
    const b = document.activeElement as HTMLElement;
    expect(b.getAttribute('aria-label')).toMatch(/^b,/);
    // b is at depth 2, closed by default
    expect(b.getAttribute('aria-expanded')).toBe('false');
    await key(b, 'ArrowRight');
    expect(b.getAttribute('aria-expanded')).toBe('true');
    await key(b, 'ArrowRight');
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toMatch(/^c,/);
    await key(document.activeElement as HTMLElement, 'ArrowLeft');
    expect(document.activeElement).toBe(b);
    await key(b, 'ArrowLeft');
    expect(b.getAttribute('aria-expanded')).toBe('false');
    await key(b, 'ArrowLeft');
    expect(document.activeElement).toBe(a);
  });

  it('an inner table edits the list in place', async () => {
    await mount(project([{ name: 'script.json', mime: 'application/json', text: SCRIPT, kind: 'json' }]));
    const cell = host.querySelector<HTMLInputElement>('table[aria-label="opening as a table"] input[aria-label="line, row 1"]')!;
    await type(cell, 'Hello again');
    await blurAway();
    expect(JSON.parse(savedText()!).opening[1]).toEqual({ speaker: 'You', line: 'Hello again' });
  });
});

describe('a CSV file as a table', () => {
  it('edits a cell and writes CSV with the file\'s own layout', async () => {
    await mount(project([{ name: 'people.csv', mime: 'text/csv', text: CSV, kind: 'csv' }]));
    expect(button('Table')?.getAttribute('aria-pressed')).toBe('true');
    const grid = host.querySelector('table[role="grid"]')!;
    expect(grid.querySelectorAll('tbody tr')).toHaveLength(2);
    await type(host.querySelector<HTMLInputElement>('input[aria-label="score, row 1"]')!, '9');
    await blurAway();
    expect(savedText()).toBe('name,score\nAda,3\nBo,9\n');
  });

  it('adds and deletes rows and columns, and moves a row', async () => {
    await mount(project([{ name: 'people.csv', mime: 'text/csv', text: CSV, kind: 'csv' }]));
    const group = (name: string) => host.querySelector(`.data-grid-group[aria-label="${name}"]`)!;
    const inGroup = (name: string, label: string) => Array.from(group(name).querySelectorAll('button')).find((b) => b.textContent === label || b.getAttribute('aria-label') === label);
    await act(async () => host.querySelector<HTMLInputElement>('input[aria-label="name, row 0"]')!.focus());
    await click(inGroup('Row', 'Add'));
    await blurAway();
    expect(savedText()).toBe('name,score\nAda,3\n,\nBo,4\n');
    await act(async () => host.querySelector<HTMLInputElement>('input[aria-label="name, row 1"]')!.focus());
    await click(inGroup('Row', 'Delete'));
    await blurAway();
    expect(savedText()).toBe('name,score\nAda,3\nBo,4\n');
    await act(async () => host.querySelector<HTMLInputElement>('input[aria-label="name, row 1"]')!.focus());
    await click(inGroup('Row', 'Move row up'));
    await blurAway();
    expect(savedText()).toBe('name,score\nBo,4\nAda,3\n');
    await act(async () => host.querySelector<HTMLInputElement>('input[aria-label="score, row 0"]')!.focus());
    await click(inGroup('Column', 'Add'));
    await blurAway();
    expect(savedText()).toBe('name,score,column3\nBo,4,\nAda,3,\n');
    await click(inGroup('Column', 'Move column left'));
    await blurAway();
    await click(inGroup('Column', 'Delete'));
    await blurAway();
    expect(savedText()!.split('\n')[0]).toMatch(/^name,/);
  });

  it('renames a column from its header, and refuses a duplicate name in JSON', async () => {
    await mount(project([{ name: 'people.csv', mime: 'text/csv', text: CSV, kind: 'csv' }]));
    await type(host.querySelector<HTMLInputElement>('input[aria-label="Column 2 name"]')!, 'points');
    await blurAway();
    expect(savedText()).toBe('name,points\nAda,3\nBo,4\n');
  });

  it('JSON list of flat objects is a table that keeps numbers numbers', async () => {
    await mount(project([{ name: 'rows.json', mime: 'application/json', text: '[{"n":1,"ok":true,"t":"a"},{"n":2,"ok":false,"t":"b"}]', kind: 'json' }]));
    expect(button('Table')?.getAttribute('aria-pressed')).toBe('true');
    await type(host.querySelector<HTMLInputElement>('input[aria-label="n, row 0"]')!, '10');
    await blurAway();
    expect(JSON.parse(savedText()!)[0]).toEqual({ n: 10, ok: true, t: 'a' });
    await type(host.querySelector<HTMLInputElement>('input[aria-label="t, row 1"]')!, '7');
    await blurAway();
    expect(JSON.parse(savedText()!)[1].t).toBe('7');
    // a duplicate column name is refused and said so
    await type(host.querySelector<HTMLInputElement>('input[aria-label="Column 2 name"]')!, 'n');
    await blurAway();
    expect(host.textContent).toContain('Another column is already called');
    expect(JSON.parse(savedText()!)[0].ok).toBe(true);
  });

  it('moves between cells with the arrow keys and Enter', async () => {
    await mount(project([{ name: 'people.csv', mime: 'text/csv', text: CSV, kind: 'csv' }]));
    const cell = (a: string) => host.querySelector<HTMLInputElement>(`input[aria-label="${a}"]`)!;
    const key = (el: HTMLElement, k: string) => act(async () => void el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })));
    await act(async () => cell('name, row 0').focus());
    await key(cell('name, row 0'), 'ArrowDown');
    expect(document.activeElement).toBe(cell('name, row 1'));
    await key(document.activeElement as HTMLElement, 'ArrowRight');
    expect(document.activeElement).toBe(cell('score, row 1'));
    await key(document.activeElement as HTMLElement, 'ArrowUp');
    expect(document.activeElement).toBe(cell('score, row 0'));
    await key(document.activeElement as HTMLElement, 'Enter');
    expect(document.activeElement).toBe(cell('score, row 1'));
    // one cell is a tab stop, the rest are reached with the arrows
    expect(host.querySelectorAll('table[role="grid"] input:not([tabindex="-1"])')).toHaveLength(1);
  });

  it('pages a long file', async () => {
    const rows = Array.from({ length: 250 }, (_, i) => `r${i},${i}`).join('\n');
    await mount(project([{ name: 'big.csv', mime: 'text/csv', text: `a,b\n${rows}\n`, kind: 'csv' }]));
    expect(host.querySelectorAll('tbody tr')).toHaveLength(100);
    expect(host.textContent).toContain('Rows 0–99 of 250');
    await click(button(/Next 100/));
    expect(host.querySelector<HTMLInputElement>('input[aria-label="a, row 100"]')).toBeTruthy();
  });
});

describe('the raw text', () => {
  const cm = () => EditorView.findFromDOM(host.querySelector<HTMLElement>('.cm-editor')!)!;
  const setRaw = async (text: string) => {
    await act(async () => cm().dispatch({ changes: { from: 0, to: cm().state.doc.length, insert: text } }));
    await settle();
  };

  it('shows the file as text, marks a parse error with its line and column, and does not save it', async () => {
    await mount(project([{ name: 'script.json', mime: 'application/json', text: '{\n  "a": 1\n}', kind: 'json' }]));
    await click(button('Raw text'));
    expect(cm().state.doc.toString()).toBe('{\n  "a": 1\n}');
    const before = source().assetId;
    await setRaw('{\n  "a": 1,\n}');
    const list = host.querySelector('.data-file-problems')!;
    expect(list.textContent).toContain('Line 3, column 1');
    expect(host.querySelector('.data-file-status')?.textContent).toMatch(/Not saved/);
    // the table and tree can't open until it parses
    expect(button('Tree')?.disabled).toBe(true);
    await blurAway();
    expect(source().assetId).toBe(before);
    // fixed: it saves
    await setRaw('{\n  "a": 2\n}');
    await blurAway();
    expect(source().assetId).not.toBe(before);
    expect(savedText()).toBe('{\n  "a": 2\n}');
    expect(button('Tree')?.disabled).toBe(false);
  });

  it('raw edits show in the table, and table edits show in the raw text', async () => {
    await mount(project([{ name: 'people.csv', mime: 'text/csv', text: CSV, kind: 'csv' }]));
    await click(button('Raw text'));
    await setRaw('name,score\nCy,5\n');
    await click(button('Table'));
    expect(host.querySelector<HTMLInputElement>('input[aria-label="name, row 0"]')!.value).toBe('Cy');
    await type(host.querySelector<HTMLInputElement>('input[aria-label="score, row 0"]')!, '6');
    await blurAway();
    await click(button('Raw text'));
    expect(cm().state.doc.toString()).toBe('name,score\nCy,6\n');
  });

  it('warns about a CSV row of the wrong width, and still saves it', async () => {
    await mount(project([{ name: 'people.csv', mime: 'text/csv', text: CSV, kind: 'csv' }]));
    await click(button('Raw text'));
    await setRaw('name,score\nAda\n');
    expect(host.querySelector('.data-file-problems')?.textContent).toMatch(/Row 2 has 1 cell but the header has 2/);
    await blurAway();
    expect(savedText()).toBe('name,score\nAda\n');
  });

  it('plain text has only the raw view', async () => {
    await mount(project([{ name: 'notes.txt', mime: 'text/plain', text: 'hello', kind: 'text' }]));
    expect(button('Table')?.disabled).toBe(true);
    expect(cm().state.doc.toString()).toBe('hello');
    await setRaw('hello world');
    await blurAway();
    expect(savedText()).toBe('hello world');
  });

  it('Tidy up lays JSON out again', async () => {
    await mount(project([{ name: 'rows.json', mime: 'application/json', text: '{"a":[1,2],"b":{"c":3}}', kind: 'json' }]));
    await click(button('Tidy up'));
    await blurAway();
    expect(savedText()).toBe('{\n  "a": [\n    1,\n    2\n  ],\n  "b": {\n    "c": 3\n  }\n}\n');
  });
});

describe('files used by more than one source', () => {
  it('says so, and gives a source its own copy', async () => {
    const p = project([{ name: 'shared.json', mime: 'application/json', text: '{"a": 1}', kind: 'json' }]);
    p.dataSources.push({ id: 'ds2', name: 'second', kind: 'json', source: 'asset', assetId: 'as1' });
    await mount(p);
    expect(host.querySelector('.data-file-banner')?.textContent).toMatch(/also read by second/);
    await click(button(/own copy/));
    await settle();
    expect(source(0).assetId).not.toBe('as1');
    expect(source(1).assetId).toBe('as1');
    expect(savedText(0)).toBe('{"a": 1}');
    expect(host.querySelector('.data-file-banner')).toBeNull();
    // editing now leaves the other source on the first file
    await type(host.querySelector<HTMLInputElement>('input[aria-label="a value"]')!, '5');
    await blurAway();
    expect(JSON.parse(savedText(0)!).a).toBe(5);
    expect(source(1).assetId).toBe('as1');
  });

  it('an edit to a shared file moves every source that reads it', async () => {
    const p = project([{ name: 'shared.json', mime: 'application/json', text: '{"a": 1}', kind: 'json' }]);
    p.dataSources.push({ id: 'ds2', name: 'second', kind: 'json', source: 'asset', assetId: 'as1' });
    await mount(p);
    await type(host.querySelector<HTMLInputElement>('input[aria-label="a value"]')!, '5');
    await blurAway();
    expect(source(0).assetId).toBe(source(1).assetId);
    expect(source(0).assetId).not.toBe('as1');
    expect(s.get().project.assets.filter((a) => a.name === 'shared.json')).toHaveLength(1);
  });
});

describe('a URL source', () => {
  it('is read only, and Make a copy to edit turns it into an uploaded file', async () => {
    const p = createProject('Url');
    p.id = 'prdatafile02';
    p.dataSources.push({ id: 'dsu', name: 'feed', kind: 'json', source: 'url', url: 'https://example.com/feed.json', refresh: 0 });
    await mount(p);
    expect(host.textContent).toContain('comes from a URL');
    expect(host.querySelector('.data-file-status')?.textContent).toBe('Read only');
    expect(host.querySelector('table input')?.hasAttribute('readonly')).toBe(true);
    expect(button('Tidy up')).toBeUndefined();
    await click(button('Make a copy to edit'));
    await settle();
    const ds = source();
    expect(ds.source).toBe('asset');
    expect(ds.url).toBeUndefined();
    const asset = s.get().project.assets.find((a) => a.id === ds.assetId)!;
    expect(asset.name).toBe('feed.json');
    expect(JSON.parse(saved.files.get(asset.id)!)).toEqual([{ a: 1, b: 'x' }]);
    expect(host.querySelector('.data-file-status')?.textContent).toBe('Saved');
    // one undo goes back to the URL
    await act(async () => s.undo());
    await settle();
    expect(source().source).toBe('url');
  });
});

describe('when it saves', () => {
  const cm = () => EditorView.findFromDOM(host.querySelector<HTMLElement>('.cm-editor')!)!;
  const setRaw = async (text: string) => {
    await act(async () => cm().dispatch({ changes: { from: 0, to: cm().state.doc.length, insert: text } }));
    await settle();
  };

  it('a moment after the last keystroke, as one new file however much was typed', async () => {
    await mount(project([{ name: 'notes.txt', mime: 'text/plain', text: 'hello', kind: 'text' }]));
    await setRaw('hello w');
    await setRaw('hello wo');
    await setRaw('hello wor');
    expect(saved.puts).toEqual([]);
    await act(async () => void (await new Promise((r) => setTimeout(r, 900))));
    await settle();
    expect(saved.puts).toHaveLength(1);
    expect(savedText()).toBe('hello wor');
  });

  it('switching to another source saves what was waiting', async () => {
    await mount(project([{ name: 'a.txt', mime: 'text/plain', text: 'one', kind: 'text' }, { name: 'b.txt', mime: 'text/plain', text: 'two', kind: 'text' }]));
    await setRaw('one more');
    await click(Array.from(host.querySelectorAll('.script-list .list-item')).find((b) => b.querySelector('.mono')?.textContent === 'b')!);
    await settle();
    expect(savedText(0)).toBe('one more');
    expect(cm().state.doc.toString()).toBe('two');
  });

  it('keeps a draft with an error for when the source is opened again, without saving it', async () => {
    await mount(project([{ name: 'a.json', mime: 'application/json', text: '{"a":1}', kind: 'json' }, { name: 'b.txt', mime: 'text/plain', text: 'two', kind: 'text' }]));
    await click(button('Raw text'));
    await setRaw('{"a":');
    const first = source(0).assetId;
    const items = () => Array.from(host.querySelectorAll('.script-list .list-item'));
    await click(items().find((b) => b.querySelector('.mono')?.textContent === 'b')!);
    await settle();
    expect(source(0).assetId).toBe(first);
    await click(items().find((b) => b.querySelector('.mono')?.textContent === 'a')!);
    await settle();
    expect(cm().state.doc.toString()).toBe('{"a":');
    expect(host.querySelector('.data-file-problems')?.textContent).toMatch(/ends too early/);
  });
});
