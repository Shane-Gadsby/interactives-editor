//Code editor colours: Follow the editor / Light / Dark, for every CodeMirror editor, switched live without a rebuild.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EditorView } from 'codemirror';
import { CodeEditor } from '../src/components/CodeEditor';
import { DataRawEditor } from '../src/panels/DataRawEditor';
import { CodeThemeSwitch } from '../src/components/CodeThemeSwitch';
import { codeIsDark, editorIsDark, LIGHT } from '../src/lib/code-theme';
import { prefs, prefsUser, setPrefs } from '../src/lib/prefs';

//CodeMirror measures text with ranges, which jsdom doesn't lay out
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe('light code palette', () => {
  const text = ['text', 'muted', 'keyword', 'string', 'number', 'atom', 'comment', 'fn', 'type', 'property', 'variable', 'operator', 'punctuation', 'tag', 'attribute', 'regexp', 'link', 'invalid'] as const;
  for (const bg of ['page', 'gutter', 'activeLine', 'selection'] as const) {
    it(`every text colour is at least 4.5:1 on the ${bg}`, () => {
      for (const k of text) expect(ratio(LIGHT[k], LIGHT[bg]), `${k} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe('which colours code gets', () => {
  it('follow takes the editor theme, and Auto takes the system scheme', () => {
    expect(codeIsDark({ theme: 'dark', codeTheme: 'follow' }, true)).toBe(true);
    expect(codeIsDark({ theme: 'light', codeTheme: 'follow' }, false)).toBe(false);
    expect(codeIsDark({ theme: 'auto', codeTheme: 'follow' }, true)).toBe(false);
    expect(codeIsDark({ theme: 'auto', codeTheme: 'follow' }, false)).toBe(true);
    expect(editorIsDark({ theme: 'auto' }, true)).toBe(false);
  });
  it('light and dark ignore the editor', () => {
    expect(codeIsDark({ theme: 'dark', codeTheme: 'light' }, false)).toBe(false);
    expect(codeIsDark({ theme: 'light', codeTheme: 'dark' }, true)).toBe(true);
  });
});

describe('the preference', () => {
  beforeEach(() => setPrefs({ theme: 'dark', codeTheme: 'follow' }));
  it('is Follow the editor by default and is kept for the person, not the project', () => {
    expect(prefs().codeTheme).toBe('follow');
    setPrefs({ codeTheme: 'light' });
    expect(JSON.parse(localStorage.getItem(`ix-prefs:${prefsUser()}`) ?? '{}').codeTheme).toBe('light');
  });
});

let host: HTMLDivElement;
let root: Root;
const mount = (ui: React.ReactNode) => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(ui));
};
const dark = (sel: string) => EditorView.findFromDOM(host.querySelector(sel) as HTMLElement)!.state.facet(EditorView.darkTheme);
const viewOf = (sel: string) => EditorView.findFromDOM(host.querySelector(sel) as HTMLElement)!;

afterEach(() => {
  if (root) act(() => root.unmount());
  host?.remove();
  root = undefined as unknown as Root;
  vi.unstubAllGlobals();
});

const both = (
  <>
    <CodeEditor value="let a = 1" onChange={() => undefined} />
    <DataRawEditor value={'{"a":1}'} kind="json" problems={[]} onChange={() => undefined} label="data" />
  </>
);

describe('both code editors', () => {
  beforeEach(() => setPrefs({ theme: 'dark', codeTheme: 'follow' }));
  it('start in the colours the preference gives', () => {
    mount(both);
    expect(dark('.code-editor .cm-editor')).toBe(true);
    expect(dark('.data-raw-editor .cm-editor')).toBe(true);
  });
  it('Follow switches with the editor theme, without being rebuilt', () => {
    mount(both);
    const a = viewOf('.code-editor .cm-editor');
    const b = viewOf('.data-raw-editor .cm-editor');
    act(() => setPrefs({ theme: 'light' }));
    expect(dark('.code-editor .cm-editor')).toBe(false);
    expect(dark('.data-raw-editor .cm-editor')).toBe(false);
    expect(viewOf('.code-editor .cm-editor')).toBe(a);
    expect(viewOf('.data-raw-editor .cm-editor')).toBe(b);
    act(() => setPrefs({ theme: 'dark' }));
    expect(dark('.code-editor .cm-editor')).toBe(true);
    expect(dark('.data-raw-editor .cm-editor')).toBe(true);
  });
  it('Light and Dark hold whatever the editor does', () => {
    mount(both);
    act(() => setPrefs({ codeTheme: 'light' }));
    expect(dark('.code-editor .cm-editor')).toBe(false);
    expect(dark('.data-raw-editor .cm-editor')).toBe(false);
    act(() => setPrefs({ theme: 'light', codeTheme: 'dark' }));
    expect(dark('.code-editor .cm-editor')).toBe(true);
    act(() => setPrefs({ theme: 'dark' }));
    expect(dark('.data-raw-editor .cm-editor')).toBe(true);
  });
  it('Follow on Auto follows the system, live', () => {
    let light = false;
    const listeners = new Set<() => void>();
    vi.stubGlobal('matchMedia', (q: string) => ({
      get matches() {
        return q.includes('light') && light;
      },
      addEventListener: (_: string, f: () => void) => q.includes('light') && listeners.add(f),
      removeEventListener: (_: string, f: () => void) => listeners.delete(f),
      addListener: () => undefined,
      removeListener: () => undefined,
    }));
    setPrefs({ theme: 'auto', codeTheme: 'follow' });
    mount(both);
    expect(dark('.code-editor .cm-editor')).toBe(true);
    act(() => {
      light = true;
      listeners.forEach((f) => f());
    });
    expect(dark('.code-editor .cm-editor')).toBe(false);
    expect(dark('.data-raw-editor .cm-editor')).toBe(false);
  });
  it('keep their text when the colours change', () => {
    mount(both);
    act(() => setPrefs({ codeTheme: 'light' }));
    expect(viewOf('.code-editor .cm-editor').state.doc.toString()).toBe('let a = 1');
  });
});

describe('the switch', () => {
  beforeEach(() => setPrefs({ theme: 'dark', codeTheme: 'follow' }));
  it('shows the choice, is labelled, and changes the preference and the open editors', () => {
    mount(
      <>
        <CodeThemeSwitch />
        {both}
      </>,
    );
    const btn = (n: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === n) as HTMLButtonElement;
    expect(host.querySelector('[role=group]')?.getAttribute('aria-label')).toBe('Code editor colours');
    expect(btn('Follow').getAttribute('aria-pressed')).toBe('true');
    expect(btn('Follow').className).toContain('on');
    for (const n of ['Follow', 'Light', 'Dark']) expect(btn(n).title).not.toBe('');
    act(() => btn('Light').click());
    expect(prefs().codeTheme).toBe('light');
    expect(btn('Light').getAttribute('aria-pressed')).toBe('true');
    expect(btn('Follow').getAttribute('aria-pressed')).toBe('false');
    expect(dark('.code-editor .cm-editor')).toBe(false);
    act(() => btn('Dark').click());
    expect(dark('.data-raw-editor .cm-editor')).toBe(true);
  });
});
