import { describe, expect, it } from 'vitest';
import { createNode, createProject, type Project, type SceneNode, type TextRun } from 'interactives-player';
import { EditorStore } from '../src/store/store';
import { importRive } from '../src/lib/rive-import';
import { RIVE_CLASSES } from '../src/lib/rive-defs';
import { toggleRunStyle, nodePropsToRunStyle, runStyleAtRange } from '../src/lib/rich-text';
import { exportLottie } from '../src/lib/lottie-export';
import { diff, apply } from '../shared/ops.mjs';

function setup(text = 'Hello world', runs?: TextRun[]) {
  const p: Project = createProject('T');
  const t = createNode('text', { name: 'T', text, ...(runs ? { runs } : {}) });
  p.artboards[0].children.push(t);
  const s = new EditorStore(p);
  s.select([t.id]);
  return { s, t };
}
const node = (s: EditorStore, id: string) => s.artboard()!.children.find((n) => n.id === id) as ReturnType<typeof createNode<'text'>>;

describe('store: styling part of a text layer', () => {
  it('styles the selection, keeps text in sync and undoes as one step', () => {
    const { s, t } = setup();
    s.styleTextRange(t.id, 6, 11, { fontWeight: 700 });
    const n = node(s, t.id);
    expect(n.text).toBe('Hello world');
    expect(n.runs).toEqual([{ text: 'Hello ' }, { text: 'world', fontWeight: 700 }]);
    s.styleTextRange(t.id, 6, 11, { fontWeight: undefined });
    expect(node(s, t.id).runs).toBeUndefined(); // merged back to plain text
    s.undo();
    expect(node(s, t.id).runs).toHaveLength(2);
    s.undo();
    expect(node(s, t.id).runs).toBeUndefined();
  });

  it('inspector style changes go to the selection while editing text', () => {
    const { s, t } = setup();
    s.set({ editingTextId: t.id, textSelection: { id: t.id, start: 0, end: 5 } });
    s.setProps([t.id], { color: '#ff0000', fontStyle: 'italic', x: 40 });
    const n = node(s, t.id);
    expect(n.color).not.toBe('#ff0000'); // the layer's own colour is untouched
    expect(n.x).toBe(40);
    expect(n.runs).toEqual([{ text: 'Hello', color: '#ff0000', italic: true }, { text: ' world' }]);
  });

  it('everything selected in a plain layer still changes the layer itself', () => {
    const { s, t } = setup();
    s.set({ editingTextId: t.id, textSelection: { id: t.id, start: 0, end: 11 } });
    s.setProps([t.id], { color: '#00ff00' });
    expect(node(s, t.id).color).toBe('#00ff00');
    expect(node(s, t.id).runs).toBeUndefined();
  });

  it('with no selection the inspector styles the whole layer as before', () => {
    const { s, t } = setup();
    s.set({ editingTextId: t.id, textSelection: { id: t.id, start: 2, end: 2 } });
    s.setProps([t.id], { color: '#00ff00' });
    expect(node(s, t.id).color).toBe('#00ff00');
    expect(node(s, t.id).runs).toBeUndefined();
  });

  it('typing into the text field keeps the styling around the edit', () => {
    const { s, t } = setup('Hello world', [{ text: 'Hello ' }, { text: 'world', fontWeight: 700 }]);
    s.setProps([t.id], { text: 'Hello big world' });
    const n = node(s, t.id);
    expect(n.text).toBe('Hello big world');
    expect(n.runs).toEqual([{ text: 'Hello big ' }, { text: 'world', fontWeight: 700 }]);
  });

  it('replaces the content from the editor with runs and plain text', () => {
    const { s, t } = setup();
    s.setTextRuns(t.id, [{ text: 'a', color: '#f00' }, { text: 'b', color: '#f00' }]);
    expect(node(s, t.id).runs).toEqual([{ text: 'ab', color: '#f00' }]);
    expect(node(s, t.id).text).toBe('ab');
    s.setTextRuns(t.id, [{ text: 'x' }, { text: 'y' }]);
    expect(node(s, t.id).runs).toBeUndefined();
    expect(node(s, t.id).text).toBe('xy');
  });

  it('runs travel through live-editing ops', () => {
    const { s, t } = setup();
    const before = s.get().project;
    s.styleTextRange(t.id, 0, 5, { underline: true });
    const ops = diff(before, s.get().project);
    const copy = JSON.parse(JSON.stringify(before));
    apply(copy, ops);
    expect(copy.artboards[0].children[0].runs).toEqual([{ text: 'Hello', underline: true }, { text: ' world' }]);
    // and back to plain text removes them
    const mid = s.get().project;
    s.styleTextRange(t.id, 0, 5, { underline: undefined });
    apply(copy, diff(mid, s.get().project));
    expect('runs' in copy.artboards[0].children[0]).toBe(false);
  });
});

describe('rich-text helpers', () => {
  it('maps inspector props to run styles', () => {
    expect(nodePropsToRunStyle({ fontWeight: 700, fontStyle: 'normal', textDecoration: 'line-through', x: 1 })).toEqual({
      style: { fontWeight: 700, italic: false, underline: false, strike: true },
      rest: { x: 1 },
    });
    expect(nodePropsToRunStyle({ x: 1 }).style).toEqual({});
  });
  it('toggles on unless the whole range already has it', () => {
    const runs: TextRun[] = [{ text: 'ab', fontWeight: 700 }, { text: 'cd' }];
    const base = { ...createNode('text'), fontWeight: 400, fontStyle: 'normal' as const, textDecoration: 'none' as const };
    expect(toggleRunStyle(runs, 0, 4, 'bold', base)).toEqual({ fontWeight: 700 });
    expect(toggleRunStyle(runs, 0, 2, 'bold', base)).toEqual({ fontWeight: undefined });
    expect(toggleRunStyle(runs, 0, 4, 'italic', base)).toEqual({ italic: true });
    expect(runStyleAtRange(runs, 0, 4, base).fontWeight).toBe(undefined);
  });
});

describe('exports with runs', () => {
  it('Lottie export writes the plain text', () => {
    const p = createProject('T');
    p.artboards[0].children.push(createNode('text', { text: 'Hello world', runs: [{ text: 'Hello ' }, { text: 'world', fontWeight: 700 }] }));
    const out = exportLottie(p, p.artboards[0], { bytesFor: () => null });
    expect(JSON.stringify(out.json)).toContain('Hello world');
    expect(out.warnings.join(' ')).toMatch(/runs/);
  });
});

// A tiny .riv writer: enough to make a text with two runs in different styles.
function riv(objs: { type: string; props?: Record<string, number | string> }[]): Uint8Array {
  const out: number[] = [];
  const vu = (n: number) => {
    do {
      let b = n & 0x7f;
      n = Math.floor(n / 128);
      if (n) b |= 0x80;
      out.push(b);
    } while (n);
  };
  out.push(...'RIVE'.split('').map((c) => c.charCodeAt(0)));
  vu(7); vu(0); vu(0); vu(0);
  for (const o of objs) {
    const [key, , fields] = RIVE_CLASSES[o.type] ? RIVE_CLASSES[o.type] : [0, '', {}];
    vu(key);
    // property tables are inherited; search up the class chain
    const find = (cls: string, name: string): [number, string] | null => {
      const c = RIVE_CLASSES[cls];
      if (!c) return null;
      if (c[2][name]) return [c[2][name][0], c[2][name][1]];
      return find(c[1], name);
    };
    void fields;
    for (const [name, v] of Object.entries(o.props ?? {})) {
      const f = find(o.type, name)!;
      vu(f[0]);
      if (f[1] === 'f') { const b = new DataView(new ArrayBuffer(4)); b.setFloat32(0, Number(v), true); out.push(...new Uint8Array(b.buffer)); }
      else if (f[1] === 'c') { const b = new DataView(new ArrayBuffer(4)); b.setUint32(0, Number(v), true); out.push(...new Uint8Array(b.buffer)); }
      else if (f[1] === 's') { const bytes = new TextEncoder().encode(String(v)); vu(bytes.length); out.push(...bytes); }
      else vu(Number(v));
    }
    vu(0);
  }
  return new Uint8Array(out);
}

describe('Rive import of text with several runs', () => {
  it('imports each run with only its differences from the first style', async () => {
    // artboard-local indices: 0 Artboard, 1 Text, 2 TextStylePaint A, 3 Fill, 4 SolidColor, 5 TextStylePaint B, 6 Fill, 7 SolidColor, 8 run, 9 run
    const bytes = riv([
      { type: 'Backboard' },
      { type: 'Artboard', props: { name: 'Main', width: 300, height: 100 } },
      { type: 'Text', props: { name: 'Title', parentId: 0, width: 280, height: 40 } },
      { type: 'TextStylePaint', props: { parentId: 1, fontSize: 20 } },
      { type: 'Fill', props: { parentId: 2 } },
      { type: 'SolidColor', props: { parentId: 3, colorValue: 0xff000000 } },
      { type: 'TextStylePaint', props: { parentId: 1, fontSize: 32, letterSpacing: 2 } },
      { type: 'Fill', props: { parentId: 5 } },
      { type: 'SolidColor', props: { parentId: 6, colorValue: 0xffff0000 } },
      { type: 'TextValueRun', props: { parentId: 1, styleId: 2, text: 'Hello ' } },
      { type: 'TextValueRun', props: { parentId: 1, styleId: 5, text: 'world' } },
    ]);
    const res = await importRive(bytes, 'runs.riv');
    const find = (l: SceneNode[]): SceneNode | undefined => {
      for (const n of l) {
        if (n.type === 'text') return n;
        const f = 'children' in n ? find(n.children) : undefined;
        if (f) return f;
      }
    };
    const t = find(res.artboards[0].children) as ReturnType<typeof createNode<'text'>>;
    expect(t.text).toBe('Hello world');
    expect(t.fontSize).toBe(20);
    expect(t.runs).toEqual([{ text: 'Hello ' }, { text: 'world', fontSize: 32, letterSpacing: 2, color: '#ff0000' }]);
    expect(res.warnings.join(' ')).not.toMatch(/several styled runs/);
  });
});

describe('rich text editor DOM', () => {
  it('paints runs as spans and reads edits back with the right styles', async () => {
    const { paintRuns, readRuns, selectionOffsets, setSelectionOffsets } = await import('../src/lib/rich-text-dom');
    const base = createNode('text');
    const runs: TextRun[] = [{ text: 'Hello ' }, { text: 'world', fontWeight: 700 }, { text: '!', color: '#f00' }];
    const el = document.createElement('div');
    document.body.appendChild(el);
    paintRuns(el, runs, base, 2);
    expect(el.textContent).toBe('Hello world!');
    expect((el.children[1] as HTMLElement).style.fontWeight).toBe('700');
    expect(readRuns(el, runs)).toEqual(runs);
    // typing inside a span, deleting a span, text landing outside any span
    (el.children[1].firstChild as Text).data = 'world wide';
    el.removeChild(el.children[2]);
    el.appendChild(document.createTextNode('?'));
    expect(readRuns(el, runs)).toEqual([{ text: 'Hello ' }, { text: 'world wide', fontWeight: 700 }, { text: '?', fontWeight: 700 }]);
    // selection offsets round trip
    paintRuns(el, runs, base, 1);
    setSelectionOffsets(el, 3, 8);
    expect(selectionOffsets(el)).toEqual({ start: 3, end: 8 });
  });
});
