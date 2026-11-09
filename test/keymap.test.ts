import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNode, createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { setPrefs } from '../src/lib/prefs';
import {
  COMMANDS,
  CONTEXT_ORDER,
  allConflicts,
  bindingsOf,
  commandById,
  commandFor,
  conflictsFor,
  eventCombo,
  forceMac,
  formatCombo,
  heldCombo,
  holdActive,
  holdSize,
  isCharacterKey,
  isValidCombo,
  keyHint,
  keyHints,
  matches,
  normalCombo,
  registerCommand,
  runnerOf,
  withBinding,
  withKey,
  withoutBinding,
} from '../src/lib/keymap';
import { guideStep } from '../src/lib/guides';
import { areaFor, contextsFor, setLastKeyArea } from '../src/lib/key-area';
import { handleEditorKey, installEditorKeys } from '../src/lib/editor-keys';
import { installTimelineKeys, keyNear, stepFrame } from '../src/lib/timeline-keys';

const ev = (key: string, init: Partial<KeyboardEventInit> = {}, code = '') => new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true, ...init });
const reset = () => setPrefs({ keymap: undefined, keymapPreset: 'default', singleKeys: true });

beforeEach(() => {
  reset();
  forceMac(false);
});
afterEach(() => {
  reset();
  forceMac(null);
  setLastKeyArea('other');
});

describe('combos', () => {
  it('names an event the way the registry spells it', () => {
    expect(eventCombo(ev('v', {}, 'KeyV'))).toBe('V');
    expect(eventCombo(ev('Z', { ctrlKey: true, shiftKey: true }, 'KeyZ'))).toBe('Mod+Shift+Z');
    expect(eventCombo(ev('g', { metaKey: true }, 'KeyG'))).toBe('Mod+G');
    expect(eventCombo(ev('Delete'))).toBe('Delete');
    expect(eventCombo(ev(' ', {}, 'Space'))).toBe('Space');
    expect(eventCombo(ev('ArrowLeft', { shiftKey: true }))).toBe('Shift+ArrowLeft');
    expect(eventCombo(ev('!', { shiftKey: true }, 'Digit1'))).toBe('Shift+1');
    expect(eventCombo(ev('<', { shiftKey: true }, 'Comma'))).toBe('Shift+,');
    expect(eventCombo(ev("'", { ctrlKey: true }, 'Quote'))).toBe("Mod+'");
    expect(eventCombo(ev(']', { ctrlKey: true }, 'BracketRight'))).toBe('Mod+]');
    expect(eventCombo(ev('?', { shiftKey: true }, 'Slash'))).toBe('Shift+/');
    expect(eventCombo(ev('?', { shiftKey: true }, 'Minus'))).toBe('Shift+/');
    expect(eventCombo(ev('/', {}, 'Slash'))).toBe('/');
    //Option makes a different character on a Mac: the physical key is what counts
    expect(eventCombo(ev('å', { altKey: true }, 'KeyA'))).toBe('Alt+A');
    expect(eventCombo(ev('Shift', { shiftKey: true }))).toBe('');
    expect(eventCombo(ev('Control', { ctrlKey: true }))).toBe('');
  });

  it('writes the parts in one order', () => {
    expect(normalCombo('Shift+Mod+g')).toBe('Mod+Shift+G');
    expect(normalCombo('Ctrl+Alt+Delete')).toBe('Mod+Alt+Delete');
  });

  it('shows Ctrl and words, or Cmd symbols on a Mac', () => {
    expect(formatCombo('Mod+Shift+G')).toBe('Ctrl + Shift + G');
    expect(formatCombo('Delete')).toBe('Del');
    expect(formatCombo('Shift+/')).toBe('?');
    expect(formatCombo('Alt+ArrowUp')).toBe('Alt + ↑');
    forceMac(true);
    expect(formatCombo('Mod+Shift+G')).toBe('⇧⌘G');
    expect(formatCombo('Alt+ArrowUp')).toBe('⌥↑');
    expect(formatCombo('V')).toBe('V');
  });

  it('knows a character key from the rest', () => {
    for (const k of ['V', 'Shift+A', '/', ',', 'Space', '1']) expect(isCharacterKey(k)).toBe(true);
    for (const k of ['Mod+D', 'Alt+ArrowUp', 'Delete', 'F2', 'ArrowLeft', 'Shift+ArrowLeft', 'Enter', 'Escape', 'Mod+/']) expect(isCharacterKey(k)).toBe(false);
  });
});

describe('the default keymap', () => {
  it('has unique ids, valid combos and nothing bound twice in the same place', () => {
    const ids = COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of COMMANDS) for (const k of c.keys) expect(normalCombo(k)).toBe(k);
    expect(allConflicts()).toEqual([]);
  });

  it('keeps today\'s keys', () => {
    const tools = { V: 'select', H: 'hand', A: 'artboard', F: 'frame', R: 'rect', O: 'ellipse', L: 'line', P: 'pen', N: 'pencil', K: 'connector', W: 'bend', T: 'text', B: 'button', J: 'bone', C: 'comment', S: 'note' };
    for (const [k, t] of Object.entries(tools)) expect(commandFor(ev(k.toLowerCase(), {}, `Key${k}`), CONTEXT_ORDER.canvas)?.id).toBe(`tool.${t}`);
    const has = (id: string, combo: string) => expect(bindingsOf(id)).toContain(combo);
    has('duplicate', 'Mod+D');
    has('group', 'Mod+G');
    has('ungroup', 'Mod+Shift+G');
    has('delete', 'Delete');
    has('delete', 'Backspace');
    has('forward', ']');
    has('front', 'Mod+]');
    has('zoom-fit', 'Mod+0');
    has('zoom-fit', 'Shift+1');
    has('zoom-selection', 'Shift+2');
    has('zoom-100', 'Mod+1');
    has('toggle-bones', 'Shift+J');
    has('toggle-grid', 'Shift+G');
    has('toggle-rulers', 'Shift+R');
    has('snap-grid', "Mod+'");
    has('redo', 'Mod+Y');
    has('palette', 'Mod+K');
    has('help-search', 'F1');
    has('save', 'Mod+S');
  });

  it('has the beta asks: property keys, playback, frame steps, the sheet and F2', () => {
    for (const [id, k] of [['prop-position', 'P'], ['prop-scale', 'S'], ['prop-rotation', 'R'], ['prop-opacity', 'T'], ['prop-anchor', 'A']]) expect(bindingsOf(id)).toEqual([k]);
    expect(bindingsOf('timeline-play')).toEqual(['Space', 'K']);
    expect(bindingsOf('frame-back')).toEqual([',']);
    expect(bindingsOf('frame-forward')).toEqual(['.']);
    expect(bindingsOf('key-prev')).toEqual(['Shift+,']);
    expect(bindingsOf('shortcuts')).toContain('Shift+/');
    expect(bindingsOf('rename')).toEqual(['F2']);
    expect(bindingsOf('insert-component')).toEqual(['I']);
    expect(bindingsOf('timeline-list')).toEqual(['Shift+L']);
    expect(bindingsOf('nudge-left-10')).toEqual(['Shift+ArrowLeft']);
  });
});

describe('the same key in different places', () => {
  it('P is the Pen tool on the canvas and Position in the Timeline', () => {
    const p = ev('p', {}, 'KeyP');
    expect(commandFor(p, contextsFor('canvas'))?.id).toBe('tool.pen');
    expect(commandFor(p, contextsFor('layers'))?.id).toBe('tool.pen');
    expect(commandFor(p, contextsFor('timeline'))?.id).toBe('prop-position');
    for (const [k, id] of [['s', 'prop-scale'], ['r', 'prop-rotation'], ['t', 'prop-opacity'], ['a', 'prop-anchor']]) expect(commandFor(ev(k, {}, `Key${k.toUpperCase()}`), contextsFor('timeline'))?.id).toBe(id);
    expect(commandFor(ev('s', {}, 'KeyS'), contextsFor('canvas'))?.id).toBe('tool.note');
  });

  it('Space pans on the canvas and plays in the Timeline', () => {
    const sp = ev(' ', {}, 'Space');
    expect(commandFor(sp, contextsFor('canvas'))?.id).toBe('hand-hold');
    expect(commandFor(sp, contextsFor('timeline'))?.id).toBe('timeline-play');
  });

  it('Delete is the graph\'s in the graph and the canvas\'s elsewhere', () => {
    const d = ev('Delete');
    expect(commandFor(d, CONTEXT_ORDER.graph)?.id).toBe('graph-delete');
    expect(commandFor(d, contextsFor('canvas'))?.id).toBe('delete');
    //The window handler never hands the graph's own commands to the canvas
    expect(commandFor(d, contextsFor('graph', true))?.id).toBe('delete');
  });

  it('keys that apply everywhere work from every place', () => {
    for (const a of ['canvas', 'layers', 'timeline', 'inspector', 'graph'] as const) {
      expect(commandFor(ev('z', { ctrlKey: true }, 'KeyZ'), contextsFor(a, false))?.id).toBe('undo');
      expect(commandFor(ev('k', { metaKey: true }, 'KeyK'), contextsFor(a, false))?.id).toBe('palette');
    }
  });

  it('follows where the focus is, else where the last press was', () => {
    const host = document.createElement('div');
    host.innerHTML = '<div class="timeline"><button id="t"></button></div><div class="inspector"><input id="i"></div>';
    document.body.appendChild(host);
    setLastKeyArea('canvas');
    const e = new KeyboardEvent('keydown', { key: 'p', bubbles: true });
    host.querySelector('#t')!.dispatchEvent(e);
    expect(areaFor(e)).toBe('timeline');
    const e2 = new KeyboardEvent('keydown', { key: 'p' });
    expect(areaFor(e2)).toBe('canvas');
    host.remove();
  });
});

describe('the one-key switch (WCAG 2.1.4)', () => {
  it('turns off letters, digits and Space, and nothing with a modifier or a named key', () => {
    setPrefs({ singleKeys: false });
    expect(commandFor(ev('p', {}, 'KeyP'), contextsFor('canvas'))).toBeNull();
    expect(commandFor(ev(' ', {}, 'Space'), contextsFor('timeline'))).toBeNull();
    expect(commandFor(ev('?', { shiftKey: true }, 'Slash'), contextsFor('canvas'))).toBeNull();
    expect(commandFor(ev('d', { ctrlKey: true }, 'KeyD'), contextsFor('canvas'))?.id).toBe('duplicate');
    expect(commandFor(ev('Delete'), contextsFor('canvas'))?.id).toBe('delete');
    expect(commandFor(ev('ArrowLeft'), contextsFor('canvas'))?.id).toBe('nudge-left');
    expect(commandFor(ev('F2'), contextsFor('canvas'))?.id).toBe('rename');
    expect(matches(ev('p', {}, 'KeyP'), 'tool.pen')).toBe(false);
    expect(matches(ev('d', { ctrlKey: true }, 'KeyD'), 'duplicate')).toBe(true);
    //and the hints stop advertising keys that are off
    expect(keyHint('tool.pen')).toBe('');
    expect(keyHint('duplicate')).toBe('Ctrl + D');
  });
});

describe('each person\'s own keys', () => {
  it('replace the default for that command only, and show in the hints', () => {
    setPrefs({ keymap: { 'tool.pen': ['Shift+P'] } });
    expect(bindingsOf('tool.pen')).toEqual(['Shift+P']);
    expect(commandFor(ev('p', {}, 'KeyP'), contextsFor('canvas'))).toBeNull();
    expect(commandFor(ev('P', { shiftKey: true }, 'KeyP'), contextsFor('canvas'))?.id).toBe('tool.pen');
    expect(keyHint('tool.pen')).toBe('Shift + P');
    expect(withKey('Pen', 'tool.pen')).toBe('Pen (Shift + P)');
    expect(keyHints('delete')).toBe('Del or Backspace');
    //the rest are untouched
    expect(bindingsOf('tool.rect')).toEqual(['R']);
  });

  it('can take every key off a command', () => {
    setPrefs({ keymap: { 'tool.pen': [] } });
    expect(bindingsOf('tool.pen')).toEqual([]);
    expect(withKey('Pen', 'tool.pen')).toBe('Pen');
  });

  it('a new default still reaches someone who changed something else', () => {
    setPrefs({ keymap: { 'tool.pen': ['Shift+P'] } });
    expect(bindingsOf('group')).toEqual(['Mod+G']);
    registerCommand({ id: 'test.new', name: 'A new one', group: 'Edit', context: 'canvas', keys: ['Mod+Alt+9'] });
    expect(bindingsOf('test.new')).toEqual(['Mod+Alt+9']);
    COMMANDS.splice(COMMANDS.findIndex((c) => c.id === 'test.new'), 1);
  });

  it('a binding equal to the default is not kept as an override', () => {
    expect(withBinding({ 'tool.pen': ['Shift+P'] }, 'tool.pen', ['P'])).toEqual({});
    expect(withBinding({}, 'tool.pen', ['Shift+P', 'X'])).toEqual({ 'tool.pen': ['Shift+P', 'X'] });
    expect(withoutBinding({ a: ['A'], b: ['B'] }, 'a')).toEqual({ b: ['B'] });
  });

  it('are stored as overrides only, in the preferences and not the project', () => {
    setPrefs({ keymap: withBinding(undefined, 'tool.pen', ['Shift+P']) });
    const stored = JSON.parse(localStorage.getItem(`ix-prefs:${'guest'}`) ?? '{}');
    expect(stored.keymap).toEqual({ 'tool.pen': ['Shift+P'] });
    const s = new EditorStore(createProject('K'));
    expect(JSON.stringify(s.get().project)).not.toContain('Shift+P');
  });

  it('the Illustration preset moves the shape tools and the person\'s own keys win over it', () => {
    setPrefs({ keymapPreset: 'illustration' });
    expect(bindingsOf('tool.rect')).toEqual(['M']);
    expect(bindingsOf('tool.ellipse')).toEqual(['L']);
    //L is the Line tool by default; the preset moved Line off it, so there is no clash
    expect(allConflicts()).toEqual([]);
    setPrefs({ keymap: { 'tool.rect': ['X'] } });
    expect(bindingsOf('tool.rect')).toEqual(['X']);
    setPrefs({ keymap: undefined, keymapPreset: 'default' });
    expect(bindingsOf('tool.rect')).toEqual(['R']);
  });
});

describe('clashes', () => {
  it('finds a command that already has the key in a place it would fire', () => {
    expect(conflictsFor('tool.rect', 'P').map((c) => c.id)).toEqual(['tool.pen']);
    //P in the Timeline and P on the canvas are different places
    expect(conflictsFor('prop-position', 'P').map((c) => c.id)).toEqual([]);
    //but a key for "everywhere" clashes with everything
    expect(conflictsFor('palette', 'Mod+D').map((c) => c.id)).toEqual(expect.arrayContaining(['duplicate', 'graph-duplicate']));
    expect(conflictsFor('tool.rect', 'R')).toEqual([]);
  });

  it('reports a key used twice in the same place', () => {
    setPrefs({ keymap: { 'tool.rect': ['P'] } });
    const bad = allConflicts();
    expect(bad).toHaveLength(1);
    expect(bad[0].combo).toBe('P');
    expect(bad[0].commands.map((c) => c.id).sort()).toEqual(['tool.pen', 'tool.rect']);
    //the one earlier in the list works
    expect(commandFor(ev('p', {}, 'KeyP'), contextsFor('canvas'))?.id).toBe('tool.rect');
  });
});

describe('the window handler runs the command for the key', () => {
  function setup() {
    const p = createProject('K');
    const a = createNode('rect', { name: 'Ball' });
    const b = createNode('rect', { name: 'Box' });
    p.artboards[0].children.push(a, b);
    const s = new EditorStore(p);
    setCurrentStore(s);
    installEditorKeys(() => undefined);
    installTimelineKeys();
    return { s, a, b };
  }
  const press = (init: KeyboardEventInit & { key: string }, code = '') => {
    const e = ev(init.key, init, code);
    document.body.dispatchEvent(e);
    handleEditorKey(e);
    return e;
  };

  it('switches the tool on a key, from the person\'s own key when they moved it', () => {
    const { s } = setup();
    press({ key: 'r' }, 'KeyR');
    expect(s.get().tool).toBe('rect');
    setPrefs({ keymap: { 'tool.ellipse': ['E'] } });
    press({ key: 'e' }, 'KeyE');
    expect(s.get().tool).toBe('ellipse');
    press({ key: 'o' }, 'KeyO');
    expect(s.get().tool).toBe('ellipse');
  });

  it('is quiet with one-key shortcuts off, and in a text field', () => {
    const { s } = setup();
    setPrefs({ singleKeys: false });
    press({ key: 'r' }, 'KeyR');
    expect(s.get().tool).toBe('select');
    setPrefs({ singleKeys: true });
    const input = document.createElement('input');
    document.body.appendChild(input);
    const e = ev('r', {}, 'KeyR');
    input.dispatchEvent(e);
    handleEditorKey(e);
    expect(s.get().tool).toBe('select');
    input.remove();
  });

  it('Delete, duplicate and nudge act on the selection', () => {
    const { s, a, b } = setup();
    s.select([a.id]);
    press({ key: 'ArrowRight', shiftKey: true });
    expect(s.artboard()!.children.find((n) => n.id === a.id)!.x).toBe(a.x + 10);
    press({ key: 'd', ctrlKey: true }, 'KeyD');
    expect(s.artboard()!.children).toHaveLength(3);
    s.select([b.id]);
    press({ key: 'Delete' });
    expect(s.artboard()!.children.map((n) => n.id)).not.toContain(b.id);
  });

  it('the Timeline\'s own keys only work with the Timeline the last place pressed', () => {
    const { s, a } = setup();
    const ab = s.artboard()!;
    s.select([a.id]);
    s.set({ activeTimelineId: ab.timelines[0]?.id ?? null });
    if (!ab.timelines.length) s.addTimeline?.();
    setLastKeyArea('canvas');
    press({ key: 'p' }, 'KeyP');
    expect(s.get().tool).toBe('pen');
    s.set({ tool: 'select' });
    expect(areaFor(ev('p'))).toBe('canvas');
    setLastKeyArea('timeline');
    press({ key: 'r' }, 'KeyR');
    expect(s.get().tool).toBe('select');
  });
});

describe('the Timeline helpers', () => {
  it('steps a frame on the timeline\'s own frame grid', () => {
    const tl = { fps: 10, duration: 1000 };
    expect(stepFrame(tl, 0, 1)).toBe(100);
    expect(stepFrame(tl, 100, 1)).toBe(200);
    expect(stepFrame(tl, 200, -1)).toBe(100);
    //between frames, back lands on the frame the head is in
    expect(stepFrame(tl, 250, -1)).toBe(200);
    expect(stepFrame(tl, 0, -1)).toBe(0);
    expect(stepFrame(tl, 1000, 1)).toBe(1000);
    expect(stepFrame({ duration: 1000 }, 0, 1)).toBeCloseTo(33.33, 1);
  });

  it('finds the next and previous key of the selected layers', () => {
    const tracks = [
      { nodeId: 'a', keys: [{ t: 0 }, { t: 400 }, { t: 900 }] },
      { nodeId: 'b', keys: [{ t: 200 }, { t: 600 }] },
    ];
    expect(keyNear(tracks, ['a'], 0, 1)).toBe(400);
    expect(keyNear(tracks, ['a'], 400, 1)).toBe(900);
    expect(keyNear(tracks, ['a'], 900, 1)).toBeNull();
    expect(keyNear(tracks, [], 0, 1)).toBe(200);
    expect(keyNear(tracks, ['a', 'b'], 600, -1)).toBe(400);
    expect(keyNear(tracks, ['a'], 0, -1)).toBeNull();
  });
});

describe('every command that can run has something to run', () => {
  it('has a runner for each one the window handler owns', () => {
    installEditorKeys(() => undefined);
    installTimelineKeys();
    //the graph, the pan hold, the inspector search, help and the palette have their own listeners
    const own = /^(graph-|hand-hold|inspector-search|palette|shortcuts|help-|save|paste|escape$)/;
    //(a hold-while binding is modifiers kept down, read by whatever is dragging: it has no key press to run)
    for (const c of COMMANDS) if (!c.hold && (!own.test(c.id) || c.id === 'escape')) expect(runnerOf(c.id), c.id).toBeTypeOf('function');
  });
});

describe('hold-while bindings (modifiers kept down during a drag)', () => {
  afterEach(() => setPrefs({ keymap: undefined, keymapPreset: 'default' }));
  const down = (o: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>>) => ({ ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...o });

  it('a modifiers-only combo reads in the one order, and shows as Ctrl or the Mac symbols', () => {
    expect(normalCombo('Shift+Ctrl')).toBe('Mod+Shift');
    expect(normalCombo('Alt+Cmd+Shift')).toBe('Mod+Alt+Shift');
    expect(normalCombo('Alt')).toBe('Alt');
    expect(formatCombo('Mod+Shift', false)).toBe('Ctrl + Shift');
    expect(formatCombo('Mod', false)).toBe('Ctrl');
    expect(formatCombo('Mod+Shift', true)).toBe('⇧⌘');
    expect(formatCombo('Alt', true)).toBe('⌥');
    //a key combo is unchanged
    expect(normalCombo('Shift+Mod+g')).toBe('Mod+Shift+G');
  });

  it('what is held, as a combo', () => {
    expect(heldCombo(down({}))).toBe('');
    expect(heldCombo(down({ ctrlKey: true }))).toBe('Mod');
    expect(heldCombo(down({ metaKey: true, shiftKey: true }))).toBe('Mod+Shift');
    expect(heldCombo(down({ altKey: true, ctrlKey: true, shiftKey: true }))).toBe('Mod+Alt+Shift');
  });

  it('the guide commands are holds, in the Guides group, and have no key press to run', () => {
    for (const id of ['guide-round-5', 'guide-round-10', 'guide-other-kind']) {
      const c = commandById(id)!;
      expect(c.group).toBe('Guides');
      expect(c.hold).toBeTruthy();
      expect(runnerOf(id)).toBeUndefined();
    }
    expect(bindingsOf('guide-round-5')).toEqual(['Mod']);
    expect(bindingsOf('guide-round-10')).toEqual(['Mod+Shift']);
    expect(bindingsOf('guide-other-kind')).toEqual(['Alt']);
  });

  it('a binding is "at least these", and the one asking for more is the one that wins', () => {
    expect(holdSize(down({ ctrlKey: true }), 'guide-round-5')).toBe(1);
    expect(holdSize(down({ ctrlKey: true, shiftKey: true }), 'guide-round-5')).toBe(1);
    expect(holdSize(down({ ctrlKey: true, shiftKey: true }), 'guide-round-10')).toBe(2);
    expect(holdSize(down({ shiftKey: true }), 'guide-round-10')).toBe(0);
    expect(holdActive(down({ altKey: true, ctrlKey: true }), 'guide-other-kind')).toBe(true);
    expect(holdActive(down({}), 'guide-other-kind')).toBe(false);
    expect(guideStep(down({}))).toBe(0);
    expect(guideStep(down({ metaKey: true }))).toBe(5);
    expect(guideStep(down({ ctrlKey: true, shiftKey: true }))).toBe(10);
  });

  it('can be rebound, and a hold never turns up as a key press', () => {
    setPrefs({ keymap: { 'guide-round-5': ['Alt+Shift'] } });
    expect(guideStep(down({ ctrlKey: true }))).toBe(0);
    expect(guideStep(down({ altKey: true, shiftKey: true }))).toBe(5);
    //a key event for Control alone is no combo, so it can't match a command
    expect(commandFor({ key: 'Control', code: 'ControlLeft', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }, ['canvas', 'everywhere'])).toBeNull();
  });

  it('the same modifiers on two holds are a clash, and holds never clash with key presses', () => {
    expect(conflictsFor('guide-round-10', 'Mod').map((c) => c.id)).toEqual(['guide-round-5']);
    expect(conflictsFor('guide-round-10', 'Alt').map((c) => c.id)).toEqual(['guide-other-kind']);
    expect(conflictsFor('guide-round-10', 'Mod+Alt')).toEqual([]);
  });

  it('modifiers-only combos are valid for a hold and for nothing else', () => {
    expect(isValidCombo('Mod+Shift', true)).toBe(true);
    expect(isValidCombo('Alt', true)).toBe(true);
    expect(isValidCombo('Mod+Mod', true)).toBe(false);
    expect(isValidCombo('Mod+G', true)).toBe(false);
    expect(isValidCombo('Mod+Shift')).toBe(false);
    expect(isValidCombo('Shift')).toBe(false);
    expect(isValidCombo('Mod+G')).toBe(true);
  });
});
