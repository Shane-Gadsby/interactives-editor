import { describe, expect, it } from 'vitest';
import { createNode, createProject, nodeRuns, type TextNode, type TextRun } from 'interactives-player';
import { EditorStore } from '../src/store/store';
import { actionPatch, linkPatch, linkRangeAt, shortcutAction, targetRange, toolbarState, unlinkPatch, wordAt } from '../src/lib/text-toolbar';

function setup(text = 'Hello big world', runs?: TextRun[], over: Partial<TextNode> = {}) {
  const p = createProject('T');
  const t = createNode('text', { name: 'T', text, ...(runs ? { runs } : {}), ...over } as never) as TextNode;
  p.artboards[0].children.push(t);
  const s = new EditorStore(p);
  s.select([t.id]);
  const node = () => s.artboard()!.children.find((n) => n.id === t.id) as TextNode;
  // what a toolbar button does for a selection
  const run = (a: 'bold' | 'italic' | 'underline' | 'strike' | 'clear', start: number, end: number) => {
    const r = targetRange(node(), { start, end }, a)!;
    s.styleTextRange(t.id, r.start, r.end, actionPatch(node(), r, a));
  };
  return { s, t, node, run };
}
const key = (k: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>> = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });

describe('toolbar state from the selection', () => {
  it('a plain layer shows the layer itself, nothing on', () => {
    const { node } = setup();
    const st = toolbarState(node(), { start: 0, end: 5 });
    expect(st.range).toEqual({ start: 0, end: 5 });
    expect([st.bold, st.italic, st.underline, st.strike]).toEqual(['off', 'off', 'off', 'off']);
    expect(st.color).toBe(node().color);
    expect(st.fontSize).toBe(node().fontSize);
    expect(st.fontFamily).toBe(node().fontFamily);
    expect(st.link).toBeNull();
    expect(st.styled).toBe(false);
  });

  it('shows on, off and mixed for a range over styled runs', () => {
    const { node } = setup('Hello big world', [{ text: 'Hello ', fontWeight: 700 }, { text: 'big', fontWeight: 700, italic: true }, { text: ' world' }]);
    expect(toolbarState(node(), { start: 0, end: 9 }).bold).toBe('on');
    expect(toolbarState(node(), { start: 0, end: 9 }).italic).toBe('mixed');
    expect(toolbarState(node(), { start: 0, end: 15 }).bold).toBe('mixed');
    expect(toolbarState(node(), { start: 9, end: 15 }).bold).toBe('off');
    expect(toolbarState(node(), { start: 0, end: 15 }).styled).toBe(true);
  });

  it('reads colour, size and font as one value or mixed', () => {
    const { node } = setup('Hello big world', [{ text: 'Hello ', color: '#ff0000', fontSize: 40 }, { text: 'big world', color: '#ff0000', fontFamily: 'Georgia, serif' }]);
    const a = toolbarState(node(), { start: 0, end: 15 });
    expect(a.color).toBe('#ff0000');
    expect(a.fontSize).toBe('mixed');
    expect(a.fontFamily).toBe('mixed');
    const b = toolbarState(node(), { start: 0, end: 5 });
    expect(b.fontSize).toBe(40);
    expect(b.fontFamily).toBe(node().fontFamily);
  });

  it('a layer that is bold itself reads as on, and its bold runs as off when they say 400', () => {
    const { node } = setup('ab cd', [{ text: 'ab ', }, { text: 'cd', fontWeight: 400 }], { fontWeight: 700 });
    expect(toolbarState(node(), { start: 0, end: 2 }).bold).toBe('on');
    expect(toolbarState(node(), { start: 3, end: 5 }).bold).toBe('off');
    expect(toolbarState(node(), { start: 0, end: 5 }).bold).toBe('mixed');
  });

  it('with only a caret the buttons work on the word under it', () => {
    const { node } = setup('Hello big world');
    const st = toolbarState(node(), { start: 8, end: 8 });
    expect(st.caret).toBe(true);
    expect(st.range).toEqual({ start: 6, end: 9 });
    // a caret at the edge of a word still belongs to it, a caret between spaces does not
    expect(wordAt('ab  cd', 2)).toEqual({ start: 0, end: 2 });
    expect(wordAt('ab  cd', 3)).toBeNull();
    expect(toolbarState(setup('ab  cd').node(), { start: 3, end: 3 }).range).toBeNull();
    expect(toolbarState(setup('').node(), { start: 0, end: 0 }).range).toBeNull();
  });

  it('a backwards selection is the same range', () => {
    const { node } = setup();
    expect(targetRange(node(), { start: 9, end: 6 })).toEqual({ start: 6, end: 9 });
  });
});

describe('each style on a sub-range', () => {
  it('bold, italic, underline and strikethrough each cover just the range, and undo as one step', () => {
    const { node, run, s } = setup();
    run('bold', 6, 9);
    expect(node().runs).toEqual([{ text: 'Hello ' }, { text: 'big', fontWeight: 700 }, { text: ' world' }]);
    run('italic', 0, 5);
    run('underline', 10, 15);
    run('strike', 6, 9);
    expect(node().runs).toEqual([{ text: 'Hello', italic: true }, { text: ' ' }, { text: 'big', fontWeight: 700, strike: true }, { text: ' ' }, { text: 'world', underline: true }]);
    expect(node().text).toBe('Hello big world');
    s.undo();
    expect(nodeRuns(node()).some((r) => r.strike)).toBe(false);
  });

  it('pressing a lit button again switches it off; a mixed one switches on first', () => {
    const { node, run } = setup('Hello big world', [{ text: 'Hello ', fontWeight: 700 }, { text: 'big world' }]);
    run('bold', 0, 15);
    expect(node().runs).toEqual([{ text: 'Hello big world', fontWeight: 700 }]);
    run('bold', 0, 15);
    expect(node().runs).toBeUndefined();
  });

  it('on a layer that is bold itself, switching bold off states 400', () => {
    const { node, run } = setup('Hello big', undefined, { fontWeight: 700 });
    run('bold', 0, 5);
    expect(node().runs).toEqual([{ text: 'Hello', fontWeight: 400 }, { text: ' big' }]);
  });

  it('colour, size and font go to the range as run styles', () => {
    const { node, s } = setup();
    s.styleTextRange(node().id, 0, 5, { color: '#ff0000' });
    s.styleTextRange(node().id, 6, 9, { fontSize: 64 });
    s.styleTextRange(node().id, 10, 15, { fontFamily: 'Georgia, serif' });
    expect(node().runs).toEqual([{ text: 'Hello', color: '#ff0000' }, { text: ' ' }, { text: 'big', fontSize: 64 }, { text: ' ' }, { text: 'world', fontFamily: 'Georgia, serif' }]);
  });

  it('a caret styles its word', () => {
    const { node, s } = setup();
    const r = targetRange(node(), { start: 7, end: 7 }, 'bold')!;
    s.styleTextRange(node().id, r.start, r.end, actionPatch(node(), r, 'bold'));
    expect(node().runs).toEqual([{ text: 'Hello ' }, { text: 'big', fontWeight: 700 }, { text: ' world' }]);
  });
});

describe('shortcuts', () => {
  it('maps Ctrl and Cmd B, I, U, K, Shift+X and backslash', () => {
    for (const mod of ['ctrlKey', 'metaKey'] as const) {
      expect(shortcutAction(key('b', { [mod]: true }))).toBe('bold');
      expect(shortcutAction(key('B', { [mod]: true }))).toBe('bold');
      expect(shortcutAction(key('i', { [mod]: true }))).toBe('italic');
      expect(shortcutAction(key('u', { [mod]: true }))).toBe('underline');
      expect(shortcutAction(key('k', { [mod]: true }))).toBe('link');
      expect(shortcutAction(key('X', { [mod]: true, shiftKey: true }))).toBe('strike');
      expect(shortcutAction(key('\\', { [mod]: true }))).toBe('clear');
    }
  });
  it('ignores plain keys, Alt combinations and other Shift combinations', () => {
    expect(shortcutAction(key('b'))).toBeNull();
    expect(shortcutAction(key('b', { ctrlKey: true, altKey: true }))).toBeNull();
    expect(shortcutAction(key('b', { ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(shortcutAction(key('z', { ctrlKey: true }))).toBeNull();
  });
});

describe('links', () => {
  it('adds a link to the range and shows it as the state', () => {
    const { node, s } = setup();
    const r = linkPatch('example.com/page', true);
    expect('patch' in r && r.patch).toEqual({ link: { url: 'https://example.com/page', target: '_blank' } });
    s.styleTextRange(node().id, 6, 9, (r as { patch: never }).patch);
    expect(node().runs).toEqual([{ text: 'Hello ' }, { text: 'big', link: { url: 'https://example.com/page', target: '_blank' } }, { text: ' world' }]);
    expect(toolbarState(node(), { start: 6, end: 9 }).link).toEqual({ url: 'https://example.com/page', target: '_blank' });
    expect(toolbarState(node(), { start: 0, end: 9 }).link).toBe('mixed');
    expect(toolbarState(node(), { start: 0, end: 5 }).link).toBeNull();
  });

  it('keeps full addresses, mailto, tel and relative links as typed, and the same tab option', () => {
    expect(linkPatch(' https://a.org/x ', false)).toEqual({ patch: { link: { url: 'https://a.org/x', target: '_self' } } });
    expect(linkPatch('mailto:me@a.org', true)).toEqual({ patch: { link: { url: 'mailto:me@a.org', target: '_blank' } } });
    expect(linkPatch('tel:+61400000000', true)).toHaveProperty('patch');
    expect(linkPatch('#section', true)).toHaveProperty('patch');
    expect(linkPatch('/about', true)).toHaveProperty('patch');
  });

  it('refuses an empty address and scripts', () => {
    expect(linkPatch('  ', true)).toHaveProperty('error');
    expect(linkPatch('javascript:alert(1)', true)).toHaveProperty('error');
    expect(linkPatch('java\tscript:alert(1)', true)).toHaveProperty('error');
    expect(linkPatch('data:text/html,hi', true)).toHaveProperty('error');
  });

  it('removing takes the link off the range and merges the runs back', () => {
    const { node, s } = setup('Hello big world', [{ text: 'Hello ' }, { text: 'big', link: { url: 'https://a.org', target: '_blank' } }, { text: ' world' }]);
    s.styleTextRange(node().id, 6, 9, unlinkPatch());
    expect(node().runs).toBeUndefined();
    expect(node().text).toBe('Hello big world');
  });

  it('a caret inside a link edits the whole link, not just a word', () => {
    const l = { url: 'https://a.org', target: '_blank' as const };
    const { node } = setup('Go to big old site now', [{ text: 'Go to ' }, { text: 'big old site', link: l }, { text: ' now' }]);
    expect(linkRangeAt(nodeRuns(node()), 10)).toEqual({ start: 6, end: 18 });
    expect(linkRangeAt(nodeRuns(node()), 18)).toEqual({ start: 6, end: 18 });
    expect(linkRangeAt(nodeRuns(node()), 6)).toEqual({ start: 6, end: 18 });
    expect(linkRangeAt(nodeRuns(node()), 3)).toBeNull();
    expect(targetRange(node(), { start: 10, end: 10 }, 'link')).toEqual({ start: 6, end: 18 });
    // other commands keep to the word
    expect(targetRange(node(), { start: 10, end: 10 }, 'bold')).toEqual({ start: 10, end: 13 });
  });

  it('two different neighbouring links are not one', () => {
    const a = { url: 'https://a.org', target: '_blank' as const };
    const b = { url: 'https://b.org', target: '_blank' as const };
    const { node } = setup('onetwo', [{ text: 'one', link: a }, { text: 'two', link: b }]);
    expect(linkRangeAt(nodeRuns(node()), 1)).toEqual({ start: 0, end: 3 });
    expect(linkRangeAt(nodeRuns(node()), 5)).toEqual({ start: 3, end: 6 });
  });
});

describe('clear formatting', () => {
  it('removes every run style, links included, from the range only', () => {
    const { node, run } = setup('Hello big world', [
      { text: 'Hello ', fontWeight: 700, color: '#f00' },
      { text: 'big', italic: true, underline: true, strike: true, fontSize: 50, fontFamily: 'Georgia, serif', letterSpacing: 2, link: { url: 'https://a.org', target: '_blank' } },
      { text: ' world', color: '#0f0' },
    ]);
    expect(toolbarState(node(), { start: 6, end: 9 }).styled).toBe(true);
    run('clear', 6, 9);
    expect(node().runs).toEqual([{ text: 'Hello ', fontWeight: 700, color: '#f00' }, { text: 'big' }, { text: ' world', color: '#0f0' }]);
    expect(toolbarState(node(), { start: 6, end: 9 }).styled).toBe(false);
    run('clear', 0, 15);
    expect(node().runs).toBeUndefined();
  });
});
