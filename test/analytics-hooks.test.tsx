//Where the editor's use is noticed: the store (tools, panel tabs, layers added, properties changed, undo, live, save
//failures), the error boundary, the server client, the importers and the exports. Rows are checked as they would leave: no
//names, no values, no file names.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject } from 'interactives-player';
import { EditorStore } from '../src/store/store';
import { observeStore } from '../src/lib/usage';
import { flush, resetAnalytics, setSink, type Row } from '../src/lib/analytics';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { download } from '../src/lib/export';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let rows: Row[] = [];
beforeEach(() => {
  rows = [];
  resetAnalytics();
  setSink((app, feature, featureID, meta) => void rows.push({ app, feature, featureID, meta }));
});
afterEach(() => {
  setSink(null);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const ev = (r: Row) => r.meta.ev as Record<string, unknown>;
const find = (feature: string, id: string, thing?: string) => rows.filter((r) => r.feature === feature && r.featureID === id && (thing === undefined || ev(r)?.thing === thing));

function setup() {
  const p = createProject('Secret project name');
  const a = createNode('rect', { name: 'Secret layer name', x: 10, y: 10, width: 100, height: 50 });
  p.artboards[0].children.push(a);
  return { s: new EditorStore(p), a };
}

describe('store usage', () => {
  it('notes layers added by kind, and not their names', () => {
    const { s } = setup();
    s.addNodes([createNode('text', { name: 'My private heading', text: 'Dear Sam' }), createNode('ellipse', { name: 'Blob' })]);
    flush();
    expect(find('node', 'add', 'text')).toHaveLength(1);
    expect(find('node', 'add', 'ellipse')).toHaveLength(1);
    const sent = JSON.stringify(rows);
    expect(sent).not.toMatch(/private|Sam|Blob|Secret/);
  });

  it('notes a property change by name and layer type once per drag, never the value', () => {
    const { s, a } = setup();
    for (let i = 0; i < 30; i++) s.setProps([a.id], { x: i, y: i }, `move:${a.id}`);
    s.setProps([a.id], { 'shadow.blur': 4 });
    s.setProps([a.id], { text: 'typed words' } as never);
    flush();
    const x = find('inspector', 'change', 'x');
    expect(x).toHaveLength(1);
    expect(ev(x[0]).n).toBe(1);
    expect(ev(x[0]).detail).toEqual({ node: 'rect' });
    expect(find('inspector', 'change', 'shadow')).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toMatch(/typed words|Secret/);
  });

  it('counts edits, undo and redo', () => {
    const { s, a } = setup();
    s.setProps([a.id], { opacity: 0.5 });
    s.undo();
    s.redo();
    s.undo();
    s.undo(); // nothing left: not an undo
    flush();
    expect(ev(find('history', 'undo')[0]).n).toBe(2);
    expect(ev(find('history', 'redo')[0]).n).toBe(1);
    expect(find('doc', 'edit')).toHaveLength(1);
  });

  it('notes the whole-document actions', () => {
    const { s, a } = setup();
    s.select([a.id]);
    s.duplicateSelection();
    s.align('left');
    s.deleteSelection();
    s.addArtboard();
    flush();
    expect(find('doc', 'duplicate')).toHaveLength(1);
    expect(find('doc', 'align', 'left')).toHaveLength(1);
    expect(ev(find('doc', 'delete')[0]).sum).toBeTruthy();
    expect(find('doc', 'artboard-add')).toHaveLength(1);
  });
});

describe('observeStore', () => {
  it('notes tool and tab changes with the time spent in the one left', () => {
    vi.useFakeTimers();
    const { s } = setup();
    const stop = observeStore(s);
    vi.advanceTimersByTime(4000);
    s.set({ tool: 'pen' });
    vi.advanceTimersByTime(6000);
    s.set({ bottomTab: 'logic' });
    vi.advanceTimersByTime(1000);
    s.set({ bottomTab: null });
    stop();
    flush();
    expect(find('tool', 'use', 'pen')).toHaveLength(1);
    expect(ev(find('tool', 'time', 'select')[0]).ms).toBe(4000);
    expect(ev(find('tool', 'time', 'pen')[0]).ms).toBe(7000);
    expect(ev(find('panel', 'time', 'logic')[0]).ms).toBe(1000);
    expect(find('panel', 'open', 'logic')).toHaveLength(1);
    expect(find('panel', 'close', 'logic')).toHaveLength(1);
  });

  it('notes live editing coming and going, preview playing and recording', () => {
    const { s } = setup();
    observeStore(s);
    s.set({ live: { status: 'live' } });
    s.set({ live: { status: 'reconnecting' } });
    s.set({ live: null });
    s.set({ previewPlaying: true });
    s.set({ recording: true });
    flush();
    expect(find('live', 'status').map((r) => ev(r).thing).sort()).toEqual(['live', 'off', 'reconnecting']);
    expect(find('preview', 'play')).toHaveLength(1);
    expect(find('feature', 'timeline-recording')).toHaveLength(1);
  });

  it('reports a save that failed as a fault, scrubbed', () => {
    const { s } = setup();
    observeStore(s);
    s.set({ saveState: 'error', saveError: 'Server error 500 for "Secret project name"' });
    const e = rows.find((r) => r.meta.err)!;
    expect(e.featureID).toBe('save');
    expect((e.meta.err as { msg: string }).msg).toBe('Server error 500 for "?"');
  });
});

describe('error boundary', () => {
  let root: Root;
  let host: HTMLElement;
  function Bomb(): never {
    throw new TypeError('options.split is not a function for "Secret"');
  }
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('reports which part failed, the first component names, and a fingerprint', () => {
    act(() =>
      root.render(
        <ErrorBoundary name="inspector" message="This panel couldn't be shown.">
          <Bomb />
        </ErrorBoundary>,
      ),
    );
    const e = rows.find((r) => r.meta.err)!;
    expect(e.featureID).toBe('boundary');
    const err = e.meta.err as { where: string; msg: string; fp: string; detail: { in: string } };
    expect(err.where).toBe('inspector');
    expect(err.msg).toBe('options.split is not a function for "?"');
    expect(err.fp).toMatch(/^[0-9a-f]{8}$/);
    expect(err.detail.in).toContain('Bomb');
  });

  it('names the part from its message when it has no name', () => {
    act(() =>
      root.render(
        <ErrorBoundary message="Something on this artboard couldn't be drawn.">
          <Bomb />
        </ErrorBoundary>,
      ),
    );
    expect((rows.find((r) => r.meta.err)!.meta.err as { where: string }).where).toBe('something-on-this-artboard-couldn-t-be-d');
  });
});

describe('exports', () => {
  it('a download says the kind of file and its size, never its name', () => {
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined });
    download(new Blob(['x'.repeat(4096)]), 'My secret project.html');
    flush();
    const r = find('export', 'download', 'html');
    expect(r).toHaveLength(1);
    expect(ev(r[0]).sum).toEqual({ kb: 4 });
    expect(JSON.stringify(rows)).not.toMatch(/secret/i);
    vi.unstubAllGlobals();
  });
});
