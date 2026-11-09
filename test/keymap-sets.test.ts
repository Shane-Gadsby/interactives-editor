import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prefs, setPrefs } from '../src/lib/prefs';
import { bindingsOf, isValidCombo } from '../src/lib/keymap';
import {
  EXPORT_FORMAT,
  MAX_SETS,
  activeLabel,
  activeSet,
  addImported,
  currentAsFile,
  customSets,
  deleteSet,
  duplicateSet,
  exportText,
  renameSet,
  resetKeymap,
  reviewImport,
  saveCurrentAs,
  setKeymap,
  shareCode,
  shareLink,
  uniqueName,
  useBuiltIn,
  useSaved,
} from '../src/lib/keymap-sets';

const reset = () => setPrefs({ keymap: undefined, keymapPreset: 'default', keymapSets: undefined, keymapActive: undefined, singleKeys: true });
beforeEach(reset);
afterEach(reset);

describe('keyboard sets: saving, switching, and keeping them in step', () => {
  it('starts on the built-in Default, and a changed key shows as changes on top of it', () => {
    expect(activeSet()).toMatchObject({ kind: 'built-in', id: 'default', modified: false });
    setKeymap({ 'tool.rect': ['M'] });
    const a = activeSet();
    expect(a).toMatchObject({ kind: 'built-in', modified: true });
    expect(activeLabel(a)).toBe('Default (changed)');
  });

  it('Save current as keeps the changes under a name and carries on with that set', () => {
    setKeymap({ 'tool.rect': ['M'] });
    const s = saveCurrentAs('Mine')!;
    expect(s.name).toBe('Mine');
    expect(s.keys).toEqual({ 'tool.rect': ['M'] });
    expect(activeSet()).toMatchObject({ kind: 'saved', name: 'Mine' });
    expect(prefs().keymapActive).toBe(s.id);
    expect(bindingsOf('tool.rect')).toEqual(['M']);
  });

  it('switching applies at once, and every set keeps its own keys', () => {
    setKeymap({ 'tool.rect': ['M'] });
    const a = saveCurrentAs('Rect on M')!;
    useBuiltIn('illustration');
    expect(activeSet()).toMatchObject({ kind: 'built-in', id: 'illustration', modified: false });
    expect(bindingsOf('tool.rect')).toEqual(['M']);
    expect(bindingsOf('tool.ellipse')).toEqual(['L']);
    setKeymap({ 'tool.pen': ['Q'] });
    const b = saveCurrentAs('Pen on Q')!;
    expect(b.base).toBe('illustration');
    useSaved(a.id);
    expect(bindingsOf('tool.pen')).toEqual(['P']);
    expect(bindingsOf('tool.ellipse')).toEqual(['O']);
    expect(bindingsOf('tool.rect')).toEqual(['M']);
    useSaved(b.id);
    expect(bindingsOf('tool.pen')).toEqual(['Q']);
    expect(bindingsOf('tool.ellipse')).toEqual(['L']);
    useBuiltIn('default');
    expect(bindingsOf('tool.pen')).toEqual(['P']);
    expect(customSets()).toHaveLength(2);
  });

  it('a key changed while a saved set is active is written through to it', () => {
    const s = saveCurrentAs('Mine')!;
    setKeymap({ 'tool.line': ['Shift+L'] });
    expect(customSets()[0].keys).toEqual({ 'tool.line': ['Shift+L'] });
    useBuiltIn('default');
    expect(bindingsOf('tool.line')).toEqual(['L']);
    useSaved(s.id);
    expect(bindingsOf('tool.line')).toEqual(['Shift+L']);
    expect(activeSet()).toMatchObject({ kind: 'saved', name: 'Mine' });
  });

  it('names are kept different from each other and from the built-in ones', () => {
    expect(uniqueName('Default', ['Default'])).toBe('Default 2');
    expect(uniqueName('  mine  ', [])).toBe('mine');
    expect(uniqueName('', [])).toBe('My keys');
    const a = saveCurrentAs('Mine')!;
    const b = saveCurrentAs('mine')!;
    expect(b.name).toBe('mine 2');
    renameSet(b.id, 'Mine');
    expect(customSets().find((s) => s.id === b.id)!.name).toBe('Mine 2');
    renameSet(a.id, 'Illustration style');
    expect(customSets().find((s) => s.id === a.id)!.name).toBe('Illustration style 2');
  });

  it('Duplicate makes a copy to change without touching the first', () => {
    setKeymap({ 'tool.rect': ['M'] });
    const a = saveCurrentAs('Mine')!;
    const d = duplicateSet(a.id)!;
    expect(d.name).toBe('Mine copy');
    expect(activeSet()).toMatchObject({ kind: 'saved', name: 'Mine copy' });
    setKeymap({ 'tool.rect': ['Shift+M'] });
    expect(customSets().find((s) => s.id === a.id)!.keys).toEqual({ 'tool.rect': ['M'] });
    expect(customSets().find((s) => s.id === d.id)!.keys).toEqual({ 'tool.rect': ['Shift+M'] });
  });

  it('Delete takes the set away, and goes back to Default when it was the one in use', () => {
    setKeymap({ 'tool.rect': ['M'] });
    const a = saveCurrentAs('Mine')!;
    const b = saveCurrentAs('Other')!;
    deleteSet(a.id);
    expect(customSets().map((s) => s.name)).toEqual(['Other']);
    expect(activeSet()).toMatchObject({ kind: 'saved', name: 'Other' });
    deleteSet(b.id);
    expect(activeSet()).toMatchObject({ kind: 'built-in', id: 'default', modified: false });
    expect(bindingsOf('tool.rect')).toEqual(['R']);
  });

  it('refuses a set past the limit, and ignores a stored set that is not one', () => {
    for (let i = 0; i < MAX_SETS; i++) expect(saveCurrentAs(`Set ${i}`)).not.toBeNull();
    expect(saveCurrentAs('One too many')).toBeNull();
    expect(customSets()).toHaveLength(MAX_SETS);
    setPrefs({ keymapSets: [{ id: 'x', name: 'ok', base: 'default', keys: {} }, { id: 'x', name: 'dup', base: 'default', keys: {} }, { id: 'y', name: 'bad', base: 'other' as never, keys: {} }, null as never] });
    expect(customSets().map((s) => s.name)).toEqual(['ok']);
  });

  it('a saved set that is gone reads as the built-in one with changes', () => {
    setPrefs({ keymapActive: 'missing', keymap: { 'tool.rect': ['M'] } });
    expect(activeSet()).toMatchObject({ kind: 'built-in', modified: true });
  });

  it('Reset all of the keys goes to the built-in Default and keeps the saved sets', () => {
    setKeymap({ 'tool.rect': ['M'] });
    saveCurrentAs('Mine');
    resetKeymap();
    expect(activeSet()).toMatchObject({ kind: 'built-in', id: 'default', modified: false });
    expect(customSets()).toHaveLength(1);
    expect(bindingsOf('tool.rect')).toEqual(['R']);
  });
});

describe('keyboard sets: export, share and import', () => {
  const mine = () => {
    useBuiltIn('illustration');
    setKeymap({ 'tool.pen': ['Q'], 'tool.hand': ['H', 'Shift+H'] });
    return saveCurrentAs('Álex’s keys')!;
  };

  it('exports a small file that imports back to the same keys', () => {
    mine();
    const f = currentAsFile();
    expect(f).toMatchObject({ format: EXPORT_FORMAT, version: 1, name: 'Álex’s keys', base: 'illustration', keys: { 'tool.pen': ['Q'], 'tool.hand': ['H', 'Shift+H'] } });
    const r = reviewImport(exportText(f));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.review.name).toBe('Álex’s keys');
    expect(r.review.base).toBe('illustration');
    //H is the Hand tool already, so only the second key is a real change, but the command still carries both
    expect(r.review.keys).toEqual({ 'tool.pen': ['Q'], 'tool.hand': ['H', 'Shift+H'] });
    expect(r.review.unknown).toEqual([]);
    expect(r.review.differs).toBe(0);
  });

  it('a share code and a share link carry the whole set, including names with accents', () => {
    mine();
    const code = shareCode();
    expect(code).toMatch(/^ixk1\.[A-Za-z0-9_-]+$/);
    expect(shareLink()).toContain(`#/keys/${code}`);
    for (const text of [code, shareLink(), `  here you go: ${code} thanks `]) {
      const r = reviewImport(text);
      expect(r.ok && r.review.name).toBe('Álex’s keys');
      expect(r.ok && r.review.keys['tool.pen']).toEqual(['Q']);
    }
  });

  it('importing adds a new set (never over one of theirs), and can switch to it or not', () => {
    mine();
    const r = reviewImport(shareCode());
    if (!r.ok) throw new Error(r.error);
    const before = customSets().length;
    const kept = addImported(r.review, 'Álex’s keys', false)!;
    expect(kept.name).toBe('Álex’s keys 2');
    expect(customSets()).toHaveLength(before + 1);
    expect(activeSet()).toMatchObject({ kind: 'saved', name: 'Álex’s keys' });
    const used = addImported(r.review, 'Other name', true)!;
    expect(activeSet()).toMatchObject({ kind: 'saved', name: 'Other name' });
    expect(bindingsOf('tool.pen')).toEqual(['Q']);
    expect(used.base).toBe('illustration');
  });

  it('leaves out commands this editor does not have, keys that are not keys, and keys the browser owns, and says so', () => {
    const text = JSON.stringify({ format: EXPORT_FORMAT, version: 1, name: 'Odd', base: 'default', keys: { 'tool.pen': ['Q', 'not a key', 'Ctrl+Alt+Nope+X', 7], 'no.such.command': ['Z'], copy: ['Mod+Y'], 'tool.line': 'L', 'tool.text': ['T'] } });
    const r = reviewImport(text);
    if (!r.ok) throw new Error(r.error);
    expect(r.review.keys).toEqual({ 'tool.pen': ['Q'] });
    expect(r.review.unknown).toEqual(['no.such.command']);
    expect(r.review.fixed).toEqual(['copy']);
    expect(r.review.badKeys).toBe(4);
    expect(r.review.entries).toEqual([{ id: 'tool.pen', name: 'Pen tool', keys: ['Q'] }]);
  });

  it('shows the keys that two commands would share before anything is added, and changes nothing', () => {
    const snapshot = JSON.stringify(prefs().keymap ?? {});
    const r = reviewImport(JSON.stringify({ format: EXPORT_FORMAT, version: 1, name: 'Clashy', base: 'default', keys: { 'tool.rect': ['P'], 'tool.ellipse': ['Shift+P'] } }));
    if (!r.ok) throw new Error(r.error);
    expect(r.review.clashes).toHaveLength(1);
    expect(r.review.clashes[0]).toMatchObject({ combo: 'P' });
    expect(r.review.clashes[0].names).toEqual(expect.arrayContaining(['Rectangle tool', 'Pen tool']));
    expect(r.review.differs).toBeGreaterThan(1);
    expect(JSON.stringify(prefs().keymap ?? {})).toBe(snapshot);
    expect(customSets()).toHaveLength(0);
  });

  it('says what is wrong with text that is not a set', () => {
    for (const bad of ['', '   ', 'hello', '{', '{"format":"something-else","keys":{}}', '{"format":"interactives-keymap","version":9,"keys":{}}', '{"name":"x"}', '[1,2]', 'ixk1.@@@', 'ixk1.' + 'A'.repeat(10)]) {
      const r = reviewImport(bad);
      expect(r.ok, bad).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(5);
    }
    expect(reviewImport('x'.repeat(300_000)).ok).toBe(false);
  });

  it('names a set it is given without a name, and drops base keys it already has', () => {
    const r = reviewImport(JSON.stringify({ keys: { 'tool.pen': ['P'] } }));
    if (!r.ok) throw new Error(r.error);
    expect(r.review.name).toBe('Imported keys');
    expect(r.review.keys).toEqual({});
  });
});

describe('combo checks', () => {
  it('accepts what the registry writes and nothing else', () => {
    for (const ok of ['P', 'Mod+Shift+G', 'Delete', 'F2', 'Shift+,', 'Mod+\\', 'Alt+ArrowUp', '1']) expect(isValidCombo(ok), ok).toBe(true);
    for (const bad of ['', 'Mod+', 'Hyper+P', 'a b', '<script>', 'Mod+Shift+Alt+Control+Meta+Super+Q'.repeat(2), 'mod+p+q+', '+']) expect(isValidCombo(bad), bad).toBe(false);
  });
});
