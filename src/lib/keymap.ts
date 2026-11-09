//The command registry and the keymap: every keyboard action in the editor with an id, a plain name, the part of the editor it
//applies to and its default keys. What a key does is looked up here, so the key sheet, the tooltips, the command palette and
//the Preferences page all read the one list, and each person's own keys (prefs.keymap: overrides only, never in the project)
//show up everywhere. Keys are stored platform neutral: "Mod" is Ctrl, or Cmd on a Mac.
import { prefs } from './prefs';

/** Where a command applies. A key in a more specific place wins over the same key in `canvas`, which wins over `everywhere`. */
export type Context = 'everywhere' | 'canvas' | 'layers' | 'timeline' | 'graph' | 'inspector';

export interface CommandDef {
  id: string;
  /** Plain words, as the key sheet and the tooltips show it. */
  name: string;
  group: string;
  context: Context;
  /** The default keys, as combos ("Mod+Shift+G", "Delete", "Shift+,"). Empty: no key until someone gives it one. */
  keys: string[];
  /** The browser or the page owns this key (copy, paste, save, Escape): shown on the sheet, but not rebindable. */
  fixed?: boolean;
  /** Changes the document, so after a click in the graph it belongs to the graph rather than the canvas selection (lib/key-area.ts). */
  edits?: boolean;
  /** Extra words the key sheet's search matches. */
  words?: string;
}

export const GROUPS = ['Tools', 'Edit', 'Arrange', 'View', 'Timeline', 'Properties', 'Interactions graph', 'Panels and help', 'Project'] as const;

const C = (id: string, name: string, group: (typeof GROUPS)[number], context: Context, keys: string[], more: Partial<CommandDef> = {}): CommandDef => ({ id, name, group, context, keys, ...more });

const TOOL_NAMES: [string, string, string[]][] = [
  ['select', 'Select tool', ['V']],
  ['hand', 'Hand tool (pan)', ['H']],
  ['artboard', 'Page tool', ['A']],
  ['frame', 'Frame tool', ['F']],
  ['rect', 'Rectangle tool', ['R']],
  ['ellipse', 'Ellipse tool', ['O']],
  ['polygon', 'Polygon tool', []],
  ['star', 'Star tool', []],
  ['line', 'Line tool', ['L']],
  ['pen', 'Pen tool', ['P']],
  ['pencil', 'Pencil tool (freehand)', ['N']],
  ['bend', 'Bend tool', ['W']],
  ['text', 'Text tool', ['T']],
  ['image', 'Image tool', []],
  ['button', 'Button tool', ['B']],
  ['input', 'Input field tool', []],
  ['link', 'Link tool', []],
  ['embed', 'Embed tool', []],
  ['video', 'Video tool', []],
  ['draw', 'Script layer tool', []],
  ['shader', 'Shader layer tool', []],
  ['progress', 'Progress bar tool', []],
  ['chart', 'Chart tool', []],
  ['connector', 'Connector tool', ['K']],
  ['bone', 'Bone tool', ['J']],
  ['comment', 'Comment tool', ['C']],
  ['note', 'Note tool', ['S']],
];

const arrows = (): CommandDef[] =>
  (['Left', 'Right', 'Up', 'Down'] as const).flatMap((d) => [
    C(`nudge-${d.toLowerCase()}`, `Nudge ${d.toLowerCase()}`, 'Arrange', 'canvas', [`Arrow${d}`], { edits: true, words: 'move arrow' }),
    C(`nudge-${d.toLowerCase()}-10`, `Nudge ${d.toLowerCase()} by 10`, 'Arrange', 'canvas', [`Shift+Arrow${d}`], { edits: true, words: 'move arrow big' }),
    C(`nudge-${d.toLowerCase()}-free`, `Nudge ${d.toLowerCase()} off the grid`, 'Arrange', 'canvas', [`Mod+Arrow${d}`], { edits: true, words: 'move arrow pixel' }),
  ]);

/** Every command, in the order the sheet lists them. Modules that own a feature add theirs with `registerCommand`. */
export const COMMANDS: CommandDef[] = [
  ...TOOL_NAMES.map(([t, name, keys]) => C(`tool.${t}`, name, 'Tools', 'canvas', keys, { words: 'draw pick' })),
  C('hand-hold', 'Hold to pan', 'Tools', 'canvas', ['Space'], { words: 'hand drag move canvas' }),

  C('select-all', 'Select all on this page', 'Edit', 'canvas', ['Mod+A']),
  C('duplicate', 'Duplicate', 'Edit', 'canvas', ['Mod+D'], { edits: true, words: 'copy' }),
  C('delete', 'Delete', 'Edit', 'canvas', ['Delete', 'Backspace'], { edits: true, words: 'remove' }),
  C('copy', 'Copy', 'Edit', 'canvas', ['Mod+C'], { fixed: true }),
  C('cut', 'Cut', 'Edit', 'canvas', ['Mod+X'], { fixed: true, edits: true }),
  C('paste', 'Paste', 'Edit', 'canvas', ['Mod+V'], { fixed: true }),
  C('enter', 'Edit the selected layer', 'Edit', 'canvas', ['Enter'], { edits: true, words: 'open group text points crop' }),
  C('escape', 'Let go (deselect, finish, back to Select)', 'Edit', 'canvas', ['Escape'], { fixed: true }),
  C('insert-component', 'Insert a component here\u2026', 'Edit', 'canvas', ['I'], { edits: true, words: 'instance page embed place put' }),
  C('rename', 'Rename the selected layer', 'Edit', 'canvas', ['F2']),
  C('undo', 'Undo', 'Edit', 'everywhere', ['Mod+Z']),
  C('redo', 'Redo', 'Edit', 'everywhere', ['Mod+Shift+Z', 'Mod+Y']),

  C('group', 'Group', 'Arrange', 'canvas', ['Mod+G'], { edits: true, words: 'together' }),
  C('ungroup', 'Ungroup', 'Arrange', 'canvas', ['Mod+Shift+G'], { edits: true }),
  C('forward', 'Bring forward', 'Arrange', 'canvas', [']'], { edits: true, words: 'order' }),
  C('backward', 'Send backward', 'Arrange', 'canvas', ['['], { edits: true, words: 'order' }),
  C('front', 'Bring to front', 'Arrange', 'canvas', ['Mod+]'], { edits: true, words: 'order top' }),
  C('back', 'Send to back', 'Arrange', 'canvas', ['Mod+['], { edits: true, words: 'order bottom' }),
  ...arrows(),
  C('layer-up', 'Move the layer up in the Layers list', 'Arrange', 'canvas', ['Alt+ArrowUp'], { edits: true }),
  C('layer-down', 'Move the layer down in the Layers list', 'Arrange', 'canvas', ['Alt+ArrowDown'], { edits: true }),
  C('layer-out', 'Move the layer out of its group', 'Arrange', 'canvas', ['Alt+ArrowLeft'], { edits: true }),
  C('layer-in', 'Move the layer into the group above it', 'Arrange', 'canvas', ['Alt+ArrowRight'], { edits: true }),

  C('zoom-fit', 'Zoom to fit everything', 'View', 'canvas', ['Mod+0', 'Shift+1'], { words: 'all' }),
  C('zoom-100', 'Zoom to 100%', 'View', 'canvas', ['Mod+1'], { words: 'actual size' }),
  C('zoom-selection', 'Zoom to the selection', 'View', 'canvas', ['Shift+2']),
  C('toggle-grid', 'Show or hide the grid', 'View', 'canvas', ['Shift+G']),
  C('toggle-rulers', 'Show or hide the rulers', 'View', 'canvas', ['Shift+R'], { words: 'guides' }),
  C('toggle-bones', 'Show or hide the bones', 'View', 'canvas', ['Shift+J'], { words: 'rig' }),
  C('snap-grid', 'Snap to the grid on or off', 'View', 'canvas', ["Mod+'"]),

  C('timeline-play', 'Play or pause', 'Timeline', 'timeline', ['Space', 'K'], { words: 'preview run' }),
  C('timeline-forward', 'Play', 'Timeline', 'timeline', ['L']),
  C('timeline-start', 'Go to the start', 'Timeline', 'timeline', ['J', 'Home'], { words: 'rewind' }),
  C('timeline-end', 'Go to the end', 'Timeline', 'timeline', ['End']),
  C('frame-back', 'Step back a frame', 'Timeline', 'timeline', [','], { words: 'nudge playhead' }),
  C('frame-forward', 'Step forward a frame', 'Timeline', 'timeline', ['.'], { words: 'nudge playhead' }),
  C('timeline-list', 'Show or hide the list of timelines', 'Timeline', 'timeline', ['Shift+L'], { words: 'states side panel' }),
  C('key-prev', 'Jump to the previous key', 'Timeline', 'timeline', ['Shift+,'], { words: 'keyframe' }),
  C('key-next', 'Jump to the next key', 'Timeline', 'timeline', ['Shift+.'], { words: 'keyframe' }),

  C('prop-position', 'Go to Position', 'Properties', 'timeline', ['P'], { words: 'x y move jump inspector' }),
  C('prop-scale', 'Go to Scale', 'Properties', 'timeline', ['S'], { words: 'size jump inspector' }),
  C('prop-rotation', 'Go to Rotation', 'Properties', 'timeline', ['R'], { words: 'turn angle jump inspector' }),
  C('prop-opacity', 'Go to Opacity', 'Properties', 'timeline', ['T'], { words: 'transparency fade jump inspector' }),
  C('prop-anchor', 'Go to Anchor point', 'Properties', 'timeline', ['A'], { words: 'origin pivot jump inspector' }),
  C('inspector-search', 'Search the properties', 'Properties', 'inspector', ['/', 'Mod+F'], { words: 'find' }),

  C('graph-delete', 'Delete the picked nodes, groups and notes', 'Interactions graph', 'graph', ['Delete', 'Backspace'], { edits: true }),
  C('graph-select-all', 'Select everything in the graph', 'Interactions graph', 'graph', ['Mod+A']),
  C('graph-group', 'Group the picked nodes', 'Interactions graph', 'graph', ['Mod+G'], { edits: true }),
  C('graph-duplicate', 'Duplicate the picked nodes', 'Interactions graph', 'graph', ['Mod+D'], { edits: true }),
  C('graph-copy', 'Copy the picked nodes', 'Interactions graph', 'graph', ['Mod+C'], { fixed: true }),
  C('graph-cut', 'Cut the picked nodes', 'Interactions graph', 'graph', ['Mod+X'], { fixed: true, edits: true }),
  C('graph-edit-note', 'Edit the picked note', 'Interactions graph', 'graph', ['Enter', 'F2'], { edits: true }),
  C('graph-search', 'Search the node palette', 'Interactions graph', 'graph', ['/', 'Mod+F'], { words: 'find add' }),
  C('graph-next-page', 'The next page’s graph', 'Interactions graph', 'graph', ['Alt+ArrowDown', 'Mod+]']),
  C('graph-prev-page', 'The previous page’s graph', 'Interactions graph', 'graph', ['Alt+ArrowUp', 'Mod+[']),

  C('palette', 'Command palette', 'Panels and help', 'everywhere', ['Mod+K'], { words: 'search commands' }),
  C('shortcuts', 'Keyboard shortcuts', 'Panels and help', 'everywhere', ['Shift+/', 'Mod+/'], { words: 'keys sheet' }),
  C('help-search', 'Search the help', 'Panels and help', 'everywhere', ['F1']),
  C('help-context', 'Help for what is highlighted', 'Panels and help', 'everywhere', ['Shift+F1']),

  C('save', 'Save now', 'Project', 'everywhere', ['Mod+S'], { fixed: true }),
];

const runners = new Map<string, (e?: KeyboardEvent) => boolean | void>();

/** Add a command from the module that owns it (its keys then show in the sheet, the tooltips and the Preferences page). */
export function registerCommand(def: CommandDef, run?: (e?: KeyboardEvent) => boolean | void): void {
  const at = COMMANDS.findIndex((c) => c.id === def.id);
  if (at >= 0) COMMANDS[at] = def;
  else COMMANDS.push(def);
  if (run) runners.set(def.id, run);
}

/** What a command does. A runner that returns false didn't take the key, so it carries on to the browser. */
export function setRunner(id: string, run: (e?: KeyboardEvent) => boolean | void): void {
  runners.set(id, run);
}
export const runnerOf = (id: string) => runners.get(id);
/** Run a command by id (the command palette, menus). Returns false when nothing is wired to it. */
export function runCommand(id: string): boolean {
  const r = runners.get(id);
  if (!r) return false;
  r();
  return true;
}

export const commandById = (id: string): CommandDef | undefined => COMMANDS.find((c) => c.id === id);

// ---------------------------------------------------------------- combos

export type Mac = boolean;
let macOverride: boolean | null = null;
/** For tests. */
export const forceMac = (v: boolean | null): void => void (macOverride = v);
export const isMac = (): boolean => (macOverride !== null ? macOverride : typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || ''));

const CODE_KEYS: Record<string, string> = { Comma: ',', Period: '.', Slash: '/', BracketLeft: '[', BracketRight: ']', Quote: "'", Semicolon: ';', Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`' };
const NAMED: Record<string, string> = { ' ': 'Space', Esc: 'Escape', Del: 'Delete', Spacebar: 'Space', Left: 'ArrowLeft', Right: 'ArrowRight', Up: 'ArrowUp', Down: 'ArrowDown' };
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'OS']);

type KeyLike = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>;

/** The combo an event is, in the registry's spelling: "Mod+Shift+G", "Delete", "Shift+,". Empty for a bare modifier. */
export function eventCombo(e: KeyLike): string {
  if (MODIFIER_KEYS.has(e.key)) return '';
  const mods = [(e.ctrlKey || e.metaKey) && 'Mod', e.altKey && 'Alt', e.shiftKey && 'Shift'].filter(Boolean) as string[];
  let key: string;
  if (e.key === '?') {
    //Shift+/ on most keyboards, and typed as a question mark on the rest
    key = '/';
    if (!mods.includes('Shift')) mods.push('Shift');
  } else if (e.key === '/') {
    key = '/';
    const at = mods.indexOf('Shift');
    if (at >= 0) mods.splice(at, 1);
  } else if (/^[a-z]$/i.test(e.key) && !e.altKey) key = e.key.toUpperCase();
  else if (/^Key[A-Z]$/.test(e.code ?? '')) key = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code ?? '')) key = e.code.slice(5);
  else if (/^Numpad\d$/.test(e.code ?? '')) key = e.code.slice(6);
  else if (CODE_KEYS[e.code ?? '']) key = CODE_KEYS[e.code];
  else key = NAMED[e.key] ?? e.key;
  if (key.length === 1 && /[a-z]/.test(key)) key = key.toUpperCase();
  return [...mods, key].join('+');
}

/** The order the parts are always written in, so "Shift+Mod+G" and "Mod+Shift+G" are one combo. */
export function normalCombo(combo: string): string {
  const parts = combo.split('+');
  let key = parts.pop()!;
  //A trailing "+" key would have split to an empty part; there is no such key in the registry (Equal is "=")
  if (key === '') key = '+';
  const has = (m: string) => parts.includes(m) || (m === 'Mod' && (parts.includes('Ctrl') || parts.includes('Cmd')));
  return [has('Mod') && 'Mod', has('Alt') && 'Alt', has('Shift') && 'Shift', key.length === 1 ? key.toUpperCase() : key].filter(Boolean).join('+');
}

const SYMBOL: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Delete: 'Del', Escape: 'Esc' };

/** How a combo reads on screen: "Ctrl + Shift + G", or "⇧⌘G" on a Mac. */
export function formatCombo(combo: string, mac = isMac()): string {
  const n = normalCombo(combo);
  if (n === 'Shift+/') return '?';
  const parts = n.split('+');
  const key = parts.pop()!;
  const shown = SYMBOL[key] ?? key;
  if (mac) return `${parts.includes('Alt') ? '⌥' : ''}${parts.includes('Shift') ? '⇧' : ''}${parts.includes('Mod') ? '⌘' : ''}${key === 'Delete' ? '⌦' : key === 'Backspace' ? '⌫' : key === 'Enter' ? '↩' : shown}`;
  return [...parts.map((p) => (p === 'Mod' ? 'Ctrl' : p)), shown].join(' + ');
}

/** A character key, used with nothing or only Shift: the kind WCAG 2.1.4 lets people turn off. */
export function isCharacterKey(combo: string): boolean {
  const parts = normalCombo(combo).split('+');
  const key = parts.pop()!;
  if (parts.includes('Mod') || parts.includes('Alt')) return false;
  return key.length === 1 || key === 'Space';
}

// ---------------------------------------------------------------- the person's own keys

export type Preset = 'default' | 'illustration';
export const PRESETS: { id: Preset; label: string; tip: string; keys: Record<string, string[]> }[] = [
  { id: 'default', label: 'Default', tip: 'The editor’s own keys', keys: {} },
  {
    id: 'illustration',
    label: 'Illustration style',
    tip: 'Shape tools on the keys drawing programs usually give them (M for rectangle, L for ellipse, \\ for line), and the Select tool also on A',
    keys: { 'tool.rect': ['M'], 'tool.ellipse': ['L'], 'tool.line': ['\\'], 'tool.artboard': ['Shift+A'], 'tool.frame': ['Shift+F'], 'tool.bend': ['Shift+P'], 'tool.select': ['V', 'A'] },
  },
];

const settings = () => prefs();
export const singleKeysOn = (): boolean => settings().singleKeys !== false;

/** The keys a command has now: the person's own when they set them, else the preset's, else the default. */
export function bindingsOf(id: string): string[] {
  const own = settings().keymap?.[id];
  if (own) return own.map(normalCombo);
  const preset = PRESETS.find((p) => p.id === settings().keymapPreset)?.keys[id];
  if (preset) return preset.map(normalCombo);
  return (commandById(id)?.keys ?? []).map(normalCombo);
}

/** A tool or button's key for a tooltip: the first one set, as it reads on this machine, or '' when it has none. */
export function keyHint(id: string): string {
  const b = bindingsOf(id).filter((k) => singleKeysOn() || !isCharacterKey(k));
  return b.length ? formatCombo(b[0]) : '';
}
/** "Pen (P)": the label with its key, or just the label. */
export function withKey(label: string, id: string): string {
  const k = keyHint(id);
  return k ? `${label} (${k})` : label;
}
/** Every key a command has, as a sentence fragment: "Del or Backspace". */
export function keyHints(id: string): string {
  return bindingsOf(id)
    .filter((k) => singleKeysOn() || !isCharacterKey(k))
    .map((k) => formatCombo(k))
    .join(' or ');
}

// ---------------------------------------------------------------- finding the command for a key

/** Which contexts' commands count for a press in each part of the editor, most specific first. */
export const CONTEXT_ORDER: Record<string, Context[]> = {
  canvas: ['canvas', 'everywhere'],
  other: ['canvas', 'everywhere'],
  layers: ['layers', 'canvas', 'everywhere'],
  timeline: ['timeline', 'canvas', 'everywhere'],
  inspector: ['inspector', 'canvas', 'everywhere'],
  graph: ['graph', 'everywhere'],
};

//While the person is recording a new key, or the shortcuts sheet is open, keys do nothing else (only the sheet's own toggle works)
let suspended = 0;
/** Suspend the shortcuts (true) or let them carry on (false). Counted, so two things holding it don't release each other. */
export function suspendKeys(on: boolean): void {
  suspended = Math.max(0, suspended + (on ? 1 : -1));
}
export const keysSuspended = (): boolean => suspended > 0;

/** The command a key press is, for the contexts given (most specific first), or null. */
export function commandFor(e: KeyLike, contexts: Context[]): CommandDef | null {
  const combo = eventCombo(e);
  if (!combo || suspended) return null;
  if (!singleKeysOn() && isCharacterKey(combo)) return null;
  for (const ctx of contexts) {
    for (const c of COMMANDS) {
      if (c.context !== ctx || !bindingsOf(c.id).includes(combo)) continue;
      return c;
    }
  }
  return null;
}

/** Whether this press is that command, wherever it is pressed (for handlers that own their own listener). */
export const matches = (e: KeyLike, id: string): boolean => {
  const combo = eventCombo(e);
  if (!combo || !bindingsOf(id).includes(combo)) return false;
  if (suspended && id !== 'shortcuts') return false;
  return singleKeysOn() || !isCharacterKey(combo);
};

/** Two contexts that can both be live for the same press, so one key bound in both is a clash. */
const overlap = (a: Context, b: Context): boolean => a === b || a === 'everywhere' || b === 'everywhere';

/** The other commands that already have this combo in a context that can clash with `id`'s. */
export function conflictsFor(id: string, combo: string): CommandDef[] {
  const me = commandById(id);
  if (!me) return [];
  const n = normalCombo(combo);
  return COMMANDS.filter((c) => c.id !== id && overlap(c.context, me.context) && bindingsOf(c.id).includes(n));
}

/** Every pair of commands sharing a key in the same place, for the Preferences page's warning. */
export function allConflicts(): { combo: string; commands: CommandDef[] }[] {
  const seen = new Map<string, CommandDef[]>();
  for (const c of COMMANDS) for (const k of bindingsOf(c.id)) seen.set(k, [...(seen.get(k) ?? []), c]);
  const out: { combo: string; commands: CommandDef[] }[] = [];
  for (const [combo, list] of seen) {
    const bad = list.filter((a) => list.some((b) => b !== a && overlap(a.context, b.context)));
    if (bad.length > 1) out.push({ combo, commands: bad });
  }
  return out;
}

/** The overrides to save after `id` is given `keys` (back to the default when they match it, so new defaults still reach people). */
export function withBinding(current: Record<string, string[]> | undefined, id: string, keys: string[]): Record<string, string[]> {
  const next = { ...(current ?? {}) };
  const norm = keys.map(normalCombo);
  const preset = PRESETS.find((p) => p.id === settings().keymapPreset)?.keys[id] ?? commandById(id)?.keys ?? [];
  if (norm.length === preset.length && norm.every((k, i) => k === normalCombo(preset[i]))) delete next[id];
  else next[id] = norm;
  return next;
}

/** The overrides with `id`'s taken out, so it goes back to the default (or the preset's) keys. */
export function withoutBinding(current: Record<string, string[]> | undefined, id: string): Record<string, string[]> {
  const next = { ...(current ?? {}) };
  delete next[id];
  return next;
}
