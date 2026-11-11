import type { ReactNode } from 'react';
import { DEFAULT_FONT, PREF_DEFAULTS, setPrefs, type Prefs } from '../lib/prefs';
import { SNAP_DISTANCE_RANGE, SNAP_ITEMS } from '../lib/snapping';
import { FontField } from './FontPicker';
import { SelectField, CheckField, NumberField } from './ui';
import { cleanGrid, GRID_PRESETS, GRID_SIZE_RANGE, GRID_SUBDIV_RANGE } from '../lib/grid';
import { restartTips, stripShown } from '../lib/onboarding';
import { confirmDialog } from './dialogs';
import { announce } from '../lib/announce';
import { resetTutorialProgress } from '../lib/tutorial-actions';
import { CODE_THEMES, type CodeTheme } from '../lib/code-theme-prefs';
import { HIDE_PREF, LANE_KINDS, LANE_NAME } from '../lib/timeline-view';
import { PAGES, type PageId } from '../lib/prefs-window';
import { KeymapList } from './KeymapPrefs';
import { KeymapSetBar } from './KeymapSets';
import { WorkspacePrefs } from './WorkspacePrefs';
import { WorkspaceOrder } from './WorkspaceOrder';
import { DesignerAllowance } from './DesignerAllowance';

/**
 * Every setting in the Preferences window, in one list: which page and section it is on, what it is called, what it does, which
 * preferences it owns (Reset puts those back), and how it is drawn. The page, the search and the Reset buttons all read this, so
 * a setting that is here is findable and resettable, and test/prefs-window.test.ts checks every preference the server keeps is
 * either here or on its short list of ones that have no setting.
 */

export interface PageInfo {
  id: PageId;
  label: string;
  about: string;
  /** Only in the editor: there is nothing to arrange on the projects page. */
  editorOnly?: boolean;
}

export const PAGE_INFO: Record<PageId, PageInfo> = {
  general: { id: 'general', label: 'General', about: 'The look of the editor, tooltips, the Getting started strip and notices' },
  canvas: { id: 'canvas', label: 'Canvas and guides', about: 'The mouse wheel, rulers, the grid, snapping, notes and layers outside a clipped page' },
  timeline: { id: 'timeline', label: 'Timeline', about: 'The list of timelines, folding empty lanes and which lanes show' },
  interactions: { id: 'interactions', label: 'Interactions', about: 'How interactions are worded and what happens when you add one' },
  text: { id: 'text', label: 'Text and fonts', about: 'The font new text starts in' },
  accessibility: { id: 'accessibility', label: 'Accessibility', about: 'Checks and aids while you build, and what a screen reader would hear' },
  keys: { id: 'keys', label: 'Keyboard shortcuts', about: 'Every shortcut, your own keys, and sets of keys you can save, swap, share and import' },
  workspace: { id: 'workspace', label: 'Workspace', about: 'Where the panels sit, saved layouts, and the order of sections and tools', editorOnly: true },
};

export interface SettingDef {
  id: string;
  page: PageId;
  section: string;
  label: string;
  tip: string;
  /** Extra words search matches (the other ways people say it). */
  words?: string;
  /** The preferences this one owns, which the page's Reset puts back. */
  keys: (keyof Prefs)[];
  render: (p: Prefs) => ReactNode;
}

type CheckOpts = { words?: string; disabled?: (p: Prefs) => boolean; get?: (p: Prefs) => boolean; set?: (v: boolean) => void; keys?: (keyof Prefs)[] };
const check = (id: string, page: PageId, section: string, label: string, tip: string, key: keyof Prefs, o: CheckOpts = {}): SettingDef => ({
  id,
  page,
  section,
  label,
  tip,
  words: o.words,
  keys: o.keys ?? [key],
  render: (p) => <CheckField label={label} title={tip} value={o.get ? o.get(p) : !!p[key]} disabled={o.disabled?.(p)} onChange={o.set ?? ((v) => setPrefs({ [key]: v } as Partial<Prefs>))} />,
});

const WHEEL_TIP = 'What scrolling the mouse wheel over the canvas does. Ctrl/Cmd+wheel and trackpad pinch always zoom.';
const THEME_TIP = "Colours of the editor. Auto follows your system's light or dark setting";
const CODE_TIP = 'Colours of the code boxes: Scripts, the raw text of a data file, and the HTML and code fields. Follow the editor goes light or dark with the Theme above; Light or Dark stays that way whatever the editor does';
const FONT_TIP = 'Font for new text, buttons, inputs and links, included in every new project. Search any Google font, or type a name';
const GRID_SIZE_TIP = "The width and height of one grid cell in pixels, measured from the artboard's top left corner. An artboard can have its own (right-click the artboard)";

export const SETTINGS: SettingDef[] = [
  // ---- General
  {
    id: 'theme',
    page: 'general',
    section: 'Appearance',
    label: 'Theme',
    tip: THEME_TIP,
    words: 'dark light colours colors mode night',
    keys: ['theme'],
    render: (p) => (
      <SelectField<'dark' | 'light' | 'auto'>
        label="Theme"
        title={THEME_TIP}
        value={p.theme}
        options={[
          { value: 'dark', label: 'Dark' },
          { value: 'light', label: 'Light' },
          { value: 'auto', label: 'Auto (follow the system)' },
        ]}
        onChange={(v) => setPrefs({ theme: v })}
      />
    ),
  },
  {
    id: 'codeTheme',
    page: 'general',
    section: 'Appearance',
    label: 'Code editor colours',
    tip: CODE_TIP,
    words: 'script scripts code theme syntax dark light',
    keys: ['codeTheme'],
    render: (p) => <SelectField<CodeTheme> label="Code editor colours" title={CODE_TIP} value={p.codeTheme} options={CODE_THEMES.map((c) => ({ value: c.value, label: c.label }))} onChange={(v) => setPrefs({ codeTheme: v })} />,
  },
  check('tooltips', 'general', 'Help and hints', 'Show tooltips', 'Explanations when you hover buttons and field names', 'tooltips', { words: 'hover hints help' }),
  {
    id: 'gettingStarted',
    page: 'general',
    section: 'Help and hints',
    label: 'Getting started strip',
    tip: 'The five jobs along the top of the editor (add a shape, move it, make it do something when clicked, preview, share) that tick themselves as you do them. It puts itself away for good once all five are done',
    words: 'first steps tips onboarding checklist',
    keys: ['gettingStarted'],
    render: (p) => (
      <CheckField
        label="Getting started strip"
        title="The five jobs along the top of the editor (add a shape, move it, make it do something when clicked, preview, share) that tick themselves as you do them. It puts itself away for good once all five are done"
        value={stripShown(p)}
        onChange={(v) => (v ? restartTips() : setPrefs({ gettingStarted: false }))}
      />
    ),
  },
  check('altDragHintAlways', 'general', 'Help and hints', 'Always show the Alt-drag hint', 'Dragging a layer, a page or a row in Layers says that holding Alt (Option on a Mac) drags a copy. It shows for your first three drags; tick this to see it on every drag', 'altDragHintAlways', { words: 'copy duplicate drag option' }),
  check('commentNotices', 'general', 'Notifications', 'Comment notices', 'Tell me (a bell on the projects page, a message while a project is open) when a review comment is handed to me, mentions me, or gets a reply in a conversation I am in', 'commentNotices', { words: 'review comments bell mentions alerts' }),

  // ---- Activity Designer
  {
    id: 'designerAllowance',
    page: 'general',
    section: 'Activity Designer',
    label: 'Use my own Cogniti allowance',
    tip: "Everyone's Activity Designer requests share one Cogniti allowance, which can run out. Paste a personal Cogniti API token (Cogniti, your name, User data, API tokens) and your requests use your own allowance instead. The token is checked once, kept encrypted on the server and never shown again",
    words: 'cogniti ai token api key limit allowance hourly designer assistant requests personal',
    keys: [],
    render: () => <DesignerAllowance />,
  },
  check('tutorialBadges', 'general', 'Tutorials', 'Tutorial badges and cheers', 'Tick boxes on each step of a tutorial, a short cheer when you tick one, a badge when you finish a whole tutorial or a set of them, and your progress on the Tutorials button on the projects page. Off hides all of it; your progress is kept and comes back if you turn it on again', 'tutorialBadges', { words: 'tutorials badges fanfare confetti celebrate rewards progress gamify steps tick' }),
  check('tutorialSound', 'general', 'Tutorials', 'Soft chime with the cheers', 'A short, quiet chime with the tutorial cheers. Off by default: nothing in the editor makes a sound unless you ask', 'tutorialSound', { words: 'sound audio noise beep tutorials', disabled: (p) => p.tutorialBadges === false }),
  {
    id: 'tutorialReset',
    page: 'general',
    section: 'Tutorials',
    label: 'Reset tutorial progress',
    tip: 'Every tutorial goes back to not started: the steps you ticked, the finished marks and all the badges are cleared',
    words: 'tutorials badges progress clear start again forget restart',
    keys: [],
    render: (p) => <TutorialReset count={Object.keys(p.tutorialProgress ?? {}).length} />,
  },

  // ---- Canvas and guides
  {
    id: 'wheel',
    page: 'canvas',
    section: 'Moving around',
    label: 'Mouse wheel',
    tip: WHEEL_TIP,
    words: 'scroll zoom pan trackpad pinch',
    keys: ['wheel'],
    render: (p) => (
      <SelectField<'zoom' | 'ctrl'>
        label="Mouse wheel"
        title={WHEEL_TIP}
        value={p.wheel}
        options={[
          { value: 'zoom', label: 'Zoom (Shift+wheel pans)' },
          { value: 'ctrl', label: 'Pan (Ctrl+wheel zooms)' },
        ]}
        onChange={(v) => setPrefs({ wheel: v })}
      />
    ),
  },
  check('rulers', 'canvas', 'Rulers and grid', 'Show rulers', 'Rulers along the canvas edges; drag from them to make guides (Shift+R)', 'rulers', { words: 'guides' }),
  check('attachGuides', 'canvas', 'Rulers and grid', 'Attach new guides to the page they’re dropped on', 'Off (the default): a guide dragged out of a ruler is universal, fixed on the canvas, and stays put when you move pages. On: it attaches to the page under the pointer and moves with that page. Hold Alt while dragging to get the other kind for that one guide', 'attachGuides', { words: 'guides universal page canvas ruler' }),
  check('showGrid', 'canvas', 'Rulers and grid', 'Show grid', 'Draws the grid on the artboards. Only the canvas shows it: Preview and exports never do (Shift+G)', 'showGrid'),
  {
    id: 'gridSize',
    page: 'canvas',
    section: 'Rulers and grid',
    label: 'Grid size',
    tip: GRID_SIZE_TIP,
    words: 'cell pixels presets',
    keys: ['gridSize'],
    render: (p) => (
      <>
        <NumberField label="Grid size" title={GRID_SIZE_TIP} value={p.gridSize} min={GRID_SIZE_RANGE.min} max={GRID_SIZE_RANGE.max} suffix="px" onChange={(v) => setPrefs({ gridSize: cleanGrid({ size: v }).size })} />
        <div className="chip-row" role="group" aria-label="Grid size presets">
          {GRID_PRESETS.map((n) => (
            <button key={n} type="button" className={`chip${p.gridSize === n ? ' on' : ''}`} aria-pressed={p.gridSize === n} onClick={() => setPrefs({ gridSize: n })}>
              {n}
            </button>
          ))}
        </div>
      </>
    ),
  },
  {
    id: 'gridSubdivisions',
    page: 'canvas',
    section: 'Rulers and grid',
    label: 'Stronger line every',
    tip: 'Every this many cells the grid line is drawn stronger. 1 draws them all the same. Shift+arrow nudges by this many cells',
    words: 'grid subdivisions major lines',
    keys: ['gridSubdivisions'],
    render: (p) => (
      <NumberField
        label="Stronger line every"
        title="Every this many cells the grid line is drawn stronger. 1 draws them all the same. Shift+arrow nudges by this many cells"
        value={p.gridSubdivisions}
        min={GRID_SUBDIV_RANGE.min}
        max={GRID_SUBDIV_RANGE.max}
        suffix="cells"
        onChange={(v) => setPrefs({ gridSubdivisions: cleanGrid({ subdivisions: v }).subdivisions })}
      />
    ),
  },
  check('snapOn', 'canvas', 'Snapping', 'Snapping', 'Every snap target on or off together; the ticks below are kept while it is off. Hold Ctrl while dragging to skip snapping for that drag (the Snap button on the tool bar has the same choices)', 'snapOn', { words: 'snap magnet align' }),
  ...SNAP_ITEMS.map((i) => check(`snap-${i.kind}`, 'canvas', 'Snapping', `Snap to ${i.label.toLowerCase()}`, i.tip, i.pref, { disabled: (p) => !p.snapOn })),
  check('snapLayersAll', 'canvas', 'Snapping', 'Layers: all, not just siblings', 'Layers snap to every layer on the artboard, not only the ones beside the layer you drag', 'snapLayersAll', { disabled: (p) => !p.snapOn || !p.snapLayers, words: 'snap layers siblings reach' }),
  {
    id: 'snapDistance',
    page: 'canvas',
    section: 'Snapping',
    label: 'Snap distance',
    tip: 'How close (screen pixels) an edge has to come to a target to snap to it',
    words: 'snap pixels close threshold',
    keys: ['snapDistance'],
    render: (p) => (
      <NumberField
        label="Snap distance"
        title="How close (screen pixels) an edge has to come to a target to snap to it"
        value={p.snapDistance}
        min={SNAP_DISTANCE_RANGE.min}
        max={SNAP_DISTANCE_RANGE.max}
        suffix="px"
        onChange={(v) => setPrefs({ snapDistance: Math.min(SNAP_DISTANCE_RANGE.max, Math.max(SNAP_DISTANCE_RANGE.min, Math.round(v))) })}
      />
    ),
  },
  check('ghostOutside', 'canvas', 'Pages and notes', 'Show layers outside clipped artboards', 'Draws the parts of layers that hang outside an artboard that clips faintly beside it, so you can still see and pick them. Preview and exports still clip', 'ghostOutside', { words: 'pages clip overflow ghost' }),
  check('showNotes', 'canvas', 'Pages and notes', 'Show notes on the canvas', 'The sticky notes authors leave on the canvas, including the explanations a template comes with. Players, Preview and exports never show them, whatever this says', 'showNotes', { words: 'sticky template explanations' }),

  // ---- Timeline
  check('timelineList', 'timeline', 'Layout', 'Show the list of timelines', "The column beside the Timeline: this artboard's timelines, their length and what plays each", 'timelineList'),
  check('timelineFoldEmpty', 'timeline', 'Layout', 'Fold Sound and captions when empty', 'A timeline with no sound, captions or descriptions shows them as one row. Open it with the arrow on that row', 'timelineFoldEmpty', { words: 'audio lanes collapse' }),
  ...LANE_KINDS.map((k) =>
    check(`lane-${k}`, 'timeline', 'Lanes', `Show the ${LANE_NAME[k]} lane`, `${LANE_NAME[k]} rows under the ruler. Hiding it also hides its Add controls; turn it back on here`, HIDE_PREF[k], {
      get: (p) => !p[HIDE_PREF[k]],
      set: (v) => setPrefs({ [HIDE_PREF[k]]: !v } as Partial<Prefs>),
      words: 'audio captions descriptions hide',
    }),
  ),

  // ---- Interactions
  check(
    'technicalWording',
    'interactions',
    'Wording',
    'Technical wording',
    'Show the interaction nodes by the names they have in the file (On pointer, Set variable, Control timeline) instead of plain wording (When clicked or hovered, Change a value or counter, Play or stop an animation). Search and help find either name whichever is on screen',
    'technicalWording',
    { words: 'plain words nodes names advanced graph' },
  ),
  check(
    'showNewInteractions',
    'interactions',
    'When you add one',
    'Show new interactions in the graph',
    'When you add something with + When clicked… (or hovered, or an empty event), open the Interactions graph, frame what was added and move focus to it, so you can see what was made. Switch it off if you build only from the Inspector and want the view left alone',
    'showNewInteractions',
    { words: 'reveal open graph focus' },
  ),

  // ---- Text and fonts
  {
    id: 'defaultFont',
    page: 'text',
    section: 'Fonts',
    label: 'Default font',
    tip: FONT_TIP,
    words: 'typeface google font new text open sans',
    keys: ['defaultFont'],
    render: (p) => (
      <FontField label="Default font" title={FONT_TIP} value={p.defaultFont} system={false} placeholder="Open Sans" typedLabel={(name) => `Use “${name}” (not in the list)`} onPick={(o) => setPrefs({ defaultFont: o.family.trim() || DEFAULT_FONT })} />
    ),
  },

  // ---- Accessibility
  check('accessibility', 'accessibility', 'While you build', 'Accessibility features', 'Layer roles, tab stops that Enter and Space click, the focus ring and screen reader announcements while you Preview. Switch it off to see whether a problem comes from it', 'accessibility', { words: 'a11y aria roles focus ring' }),
  check('screenReader', 'accessibility', 'While you build', 'Screen reader strip', 'A strip under Preview showing what a screen reader would be told by Announce nodes and ix.announce, as it is spoken. Off by default; it needs Accessibility features on', 'screenReader', { words: 'announce speech preview' }),
  check('askPictureDescription', 'accessibility', 'While you build', 'Ask what a picture shows', 'When you add a picture or video, a small box on its settings asks what it shows, so it gets a text alternative for screen readers. You can skip it or mark the picture decorative, and it never stops you carrying on. Switch it off if you add a lot of pictures at once', 'askPictureDescription', { words: 'alt text description images video' }),

  // ---- Keyboard shortcuts
  {
    id: 'keymap-sets',
    page: 'keys',
    section: 'Sets of keys',
    label: 'Keyboard sets',
    tip: 'Keep several sets of keys under names of your own, switch between them, share them and import ones other people made',
    words: 'keymap profile preset save rename duplicate delete export import share code link illustration default',
    keys: ['keymap', 'keymapPreset', 'keymapActive'],
    render: () => <KeymapSetBar />,
  },
  check(
    'singleKeys',
    'keys',
    'Options',
    'One-key shortcuts (V, H, P...)',
    'Turn off the shortcuts that are a single letter, number or Space. Ones with Ctrl, Alt or Cmd, and keys like Delete and the arrows, still work, and the tool bar does the same jobs',
    'singleKeys',
    { get: (p) => p.singleKeys !== false, words: 'character key shortcuts speech input wcag accidental' },
  ),
  {
    id: 'shortcut-list',
    page: 'keys',
    section: 'Every shortcut',
    label: 'All the shortcuts',
    tip: 'Every command in the editor with its keys. Search them, find what a key does, and give any of them keys of your own',
    words: 'rebind remap customise keys find a key set key',
    keys: [],
    render: () => <KeymapList />,
  },

  // ---- Workspace
  {
    id: 'workspace-layouts',
    page: 'workspace',
    section: 'Panel layouts',
    label: 'Workspace layouts',
    tip: "The panels' arrangement: where each one is docked or floating, the panel widths and the height of the bottom area. Switch between built-in layouts, or save your own under a name",
    words: 'panels dock float arrangement save layout essentials animate big canvas review standard',
    keys: [],
    render: () => <WorkspacePrefs />,
  },
  {
    id: 'workspace-order',
    page: 'workspace',
    section: 'Order of sections and tools',
    label: 'Reset section and tool order',
    tip: 'Put the Properties panel sections and the tool bar groups and tools back in the order the editor gives them, after you have dragged them about',
    words: 'reorder sections tools rail properties drag default',
    keys: ['sectionOrder', 'toolOrder'],
    render: () => <WorkspaceOrder />,
  },
];

export const pagesFor = (editor: boolean): PageInfo[] => PAGES.map((id) => PAGE_INFO[id]).filter((p) => editor || !p.editorOnly);

/** The sections of a page in order, each with its settings. */
export function sectionsOf(page: PageId): { name: string; settings: SettingDef[] }[] {
  const out: { name: string; settings: SettingDef[] }[] = [];
  for (const s of SETTINGS.filter((x) => x.page === page)) {
    const at = out.find((o) => o.name === s.section);
    if (at) at.settings.push(s);
    else out.push({ name: s.section, settings: [s] });
  }
  return out;
}

/** Every preference a page owns. */
export const pageKeys = (page: PageId): (keyof Prefs)[] => [...new Set(SETTINGS.filter((s) => s.page === page).flatMap((s) => s.keys))];

/** Whether every preference on the page is already as it starts (Reset this page has nothing to do). */
export function pageIsDefault(page: PageId, p: Prefs): boolean {
  return pageKeys(page).every((k) => {
    const have = p[k];
    const want = (PREF_DEFAULTS as unknown as Record<string, unknown>)[k];
    if (have && typeof have === 'object') return !Object.keys(have).length;
    if (k === 'keymapPreset') return (have ?? 'default') === 'default';
    if (k === 'keymapActive') return !have;
    if (k === 'singleKeys') return have !== false;
    return (have ?? want) === want || (have === undefined && want === undefined);
  });
}

const norm = (s: string) => s.toLowerCase();

/** The settings that match what was typed, best first: a name that starts with it, then a name that has it, then the rest of the words. Every word has to match somewhere. */
export function searchSettings(query: string, editor: boolean): SettingDef[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored: [number, SettingDef][] = [];
  for (const s of SETTINGS) {
    const page = PAGE_INFO[s.page];
    if (page.editorOnly && !editor) continue;
    const name = norm(s.label);
    const rest = norm(`${s.tip} ${s.words ?? ''} ${s.section} ${page.label}`);
    if (!words.every((w) => name.includes(w) || rest.includes(w))) continue;
    const score = words.reduce((n, w) => n + (name.startsWith(w) ? 0 : name.includes(w) ? 1 : 3), 0);
    scored.push([score, s]);
  }
  return scored.sort((a, b) => a[0] - b[0]).map((x) => x[1]);
}

/** The button under the Tutorials switches: a confirm, then every tick, finished mark and badge is gone. */
function TutorialReset({ count }: { count: number }) {
  const go = async () => {
    if (!(await confirmDialog({ title: 'Reset tutorial progress?', message: 'Every tutorial goes back to not started. The steps you ticked, the finished marks and all your badges are cleared. This cannot be undone.', confirmLabel: 'Reset tutorial progress', danger: true }))) return;
    resetTutorialProgress();
    announce('Tutorial progress reset');
  };
  return (
    <div className="field">
      <span>Tutorial progress</span>
      <div className="row">
        <button type="button" className="btn small-btn" disabled={!count} title="Every tutorial goes back to not started: ticked steps, finished marks and all badges are cleared" onClick={() => void go()}>
          Reset tutorial progress
        </button>
        <span className="muted small">{count ? `${count} ${count === 1 ? 'tutorial' : 'tutorials'} started or finished` : 'Nothing started yet'}</span>
      </div>
    </div>
  );
}
