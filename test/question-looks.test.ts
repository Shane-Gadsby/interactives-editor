//The question kit's Looks: an item's fill, border and text for Right, Wrong, Missed and Picked live on the question, and the
//layers carry them as a lookup on the item's state (no ternary per layer). Changing a look moves the layers that still carry it.
import { describe, expect, it } from 'vitest';
import { createProject, prepareNodes, walk, type Project, type SceneNode, type FrameNode, type Converter } from 'interactives-player';
import { lookFor } from '../src/lib/themes';
import { EditorStore } from '../src/store/store';
import { addQuestion, applyLooks, defaultLooks, effectiveLooks, partsOf, questionFrames, setQuestionSettings } from '../src/lib/question-kit';

function make(kind: Parameters<typeof addQuestion>[2] = 'single') {
  const s = new EditorStore(createProject('Looks'));
  const abId = s.get().project.artboards[0].id;
  let id = '';
  s.update((d) => void (id = addQuestion(d as Project, abId, kind)!));
  const p = () => s.get().project;
  const frame = () => questionFrames(p().artboards[0]).find((f) => f.id === id)!;
  const set = (patch: Parameters<typeof setQuestionSettings>[3]) => s.update((d) => setQuestionSettings(d as Project, abId, id, patch));
  return { s, p, frame, set, abId, id };
}

const row = (state: string, selected = false, i = 0) => ({ id: `o${i}`, text: `Option ${i}`, number: i + 1, selected, state });
const map = (n: SceneNode, prop: string) => (n.converters?.[prop]?.[0] as Extract<Converter, { type: 'map' }>).map;

describe('question looks', () => {
  it('a new question keeps the starter looks and its option layer carries them as a lookup, not a ternary', () => {
    const { frame } = make();
    const q = frame().question!;
    expect(q.looks).toEqual(defaultLooks(lookFor(undefined)));
    const option = partsOf(frame()).option[0];
    expect(option.bindings!['fill.color']).toBe('item.state || (item.selected ? "picked" : "")');
    expect(JSON.stringify(option.bindings)).not.toContain('?  "');
    const fill = map(option, 'fill.color');
    expect(Object.keys(fill)).toEqual(['correct', 'wrong', 'missed', 'picked']);
    expect(fill.correct).toBe(q.looks!.right!.fill);
    expect(fill.picked).toBe(q.looks!.picked!.fill);
    expect((option.converters!['fill.color'][0] as { fallback?: string }).fallback).toBeDefined();
    //the text colour of the label follows too
    expect(map(partsOf(frame()).optionLabel[0], 'color').wrong).toBe(q.looks!.wrong!.text);
  });

  it('plays: each state gets its look, a picked one before it is checked, and nothing else changes', () => {
    const { frame, p } = make();
    const f = frame();
    const out = prepareNodes([f], {
      vars: { q1_items: [row('correct', true, 0), row('wrong', true, 1), row('missed', false, 2), row('', true, 3), row('', false, 4)], q1_prompt: 'x' },
    }) as unknown as FrameNode[];
    const copies: SceneNode[] = [];
    walk(out[0].children, (n) => void (n.questionPart === 'option' && copies.push(n)));
    const L = effectiveLooks(f.question);
    const fills = copies.map((c) => (c as { fill?: { color?: string } }).fill?.color);
    const base = (partsOf(f).option[0].converters!['fill.color'][0] as { fallback: string }).fallback;
    expect(fills).toEqual([L.right.fill, L.wrong.fill, L.missed.fill, L.picked.fill, base]);
    expect(p().artboards[0].children.length).toBe(1);
  });

  it('changing a look moves the layers that still carry the old colour and leaves a colour set by hand', () => {
    const { frame, set, s } = make();
    const before = frame().question!.looks!.right!.fill!;
    set({ looks: { ...frame().question!.looks, right: { ...frame().question!.looks!.right, fill: '#112233', text: '#ffffff' } } });
    const option = partsOf(frame()).option[0];
    expect(map(option, 'fill.color').correct).toBe('#112233');
    expect(map(option, 'fill.color').correct).not.toBe(before);
    expect(map(partsOf(frame()).optionLabel[0], 'color').correct).toBe('#ffffff');
    expect(map(option, 'stroke.paint.color').correct).toBe(frame().question!.looks!.right!.line);
    //a colour edited on the layer is kept when the look changes after that
    s.update((d) => {
      const q = (d.artboards[0].children[0] as FrameNode);
      const opt = partsOf(q)['option'][0];
      (opt.converters!['stroke.paint.color'][0] as { map: Record<string, string> }).map.wrong = '#abcdef';
    });
    set({ looks: { ...frame().question!.looks, wrong: { ...frame().question!.looks!.wrong, line: '#999999', fill: '#eeeeee' } } });
    expect(map(partsOf(frame()).option[0], 'stroke.paint.color').wrong).toBe('#abcdef');
    expect(map(partsOf(frame()).option[0], 'fill.color').wrong).toBe('#eeeeee');
  });

  it('a question made before looks keeps working: layers with formulas are not touched', () => {
    const { frame, set, s } = make();
    s.update((d) => {
      const f = d.artboards[0].children[0] as FrameNode;
      delete f.question!.looks;
      const opt = partsOf(f)['option'][0];
      opt.bindings!['fill.color'] = 'item.state == "correct" ? "#2f6f17" : "#ffffff"';
      delete opt.converters!['fill.color'];
    });
    set({ points: 2 });
    expect(partsOf(frame()).option[0].bindings!['fill.color']).toBe('item.state == "correct" ? "#2f6f17" : "#ffffff"');
    set({ looks: { right: { fill: '#112233' } } });
    expect(partsOf(frame()).option[0].bindings!['fill.color']).toBe('item.state == "correct" ? "#2f6f17" : "#ffffff"');
    expect(partsOf(frame()).option[0].converters!['fill.color']).toBeUndefined();
    //the other layers of the question still take it
    expect(map(partsOf(frame()).option[0], 'stroke.paint.color').correct).toBeDefined();
  });

  it('applyLooks reports how many entries it moved', () => {
    const { frame, s, abId, id } = make();
    const a = effectiveLooks(frame().question);
    const b = effectiveLooks({ looks: { missed: { line: '#101010' } } });
    let first = -1;
    let second = -1;
    s.update((d) => {
      const f = questionFrames(d.artboards.find((x) => x.id === abId)!).find((x) => x.id === id)!;
      first = applyLooks(f, a, b);
      second = applyLooks(f, a, b);
    });
    expect(first).toBe(1);
    expect(second).toBe(0);
  });

  it('matching, sorting, blanks and ordering use the looks too', () => {
    for (const kind of ['matching', 'categorise', 'blank', 'ordering'] as const) {
      const { frame } = make(kind);
      const kinds = new Set<string>();
      walk(frame().children, (n) => {
        for (const [prop, list] of Object.entries(n.converters ?? {})) if (list[0].type === 'map' && n.bindings?.[prop]?.includes('.state')) kinds.add(prop);
      });
      expect(kinds.size, kind).toBeGreaterThan(0);
      let ternaries = 0;
      walk(frame().children, (n) => {
        for (const [prop, e] of Object.entries(n.bindings ?? {})) if ((prop === 'fill.color' || prop === 'stroke.paint.color') && e.includes('state == "correct" ?')) ternaries++;
      });
      expect(ternaries, kind).toBe(0);
    }
  });
});
