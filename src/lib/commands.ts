//The command palette's list (Ctrl/Cmd+K): every "do this" the editor has, in plain words, with its shortcut where it has one. The
//menus, tool bar and key handler stay as they are; each command here calls the same function they do. Built fresh each time the
//palette opens, from the open project and selection, so "Go to page" lists the pages and a command that cannot run now says why.
import { QUESTION_KINDS, createNode, walk, type NodeType, type SceneNode } from 'interactives-player';
import { store } from '../store/store';
import { prefs, setPrefs } from './prefs';
import { SNAP_ITEMS, toggleSnap } from './snapping';
import { TOOL_HELP } from '../help/context';
import { TOOL_KEYS } from './tool-keys';
import { ANIM_PRESETS, animOptions } from './animate-presets';
import { RECIPES } from './recipes';
import { ALL_PANELS, setDock, showPanel, type PanelId } from './dock';
import { BUILT_IN, applyWorkspace, savedWorkspaces } from './workspaces';
import { lookDefaults } from './themes';
import { fontStack } from './font-catalog';
import { addQuestion } from './question-kit';
import { addPageNavigation } from './page-nav';
import { setShowRoutes, showRoutes } from './page-routes-pref';
import { openBehaviours } from '../components/BehaviourDialog';
import { requestAppAction } from './app-actions';
import { openShareForReview } from './comments';
import { importGiftFile } from './gift-import';
import { openPasteQuestions } from '../components/PasteQuestionsModal';
import { deleteSelectionCommand } from './artboard-commands';
import { tidyArtboardsCommand } from './tidy-command';
import { openHelpSearch } from '../help/Help';
import type { BottomTab } from '../store/store';

export type CommandGroup = 'Add' | 'Selection' | 'Pages' | 'Layers' | 'Animate' | 'Behaviours' | 'View' | 'Tools' | 'Panels' | 'Workspaces' | 'Questions' | 'Project';

export interface Command {
  id: string;
  title: string;
  group: CommandGroup;
  /** More words that find it ("box square" for Add rectangle). */
  words?: string;
  /** Its shortcut, as shown (not parsed). */
  hint?: string;
  /** A switch: whether it is on now (the palette says On or Off). */
  on?: boolean;
  /** Why it cannot run right now, when it cannot. */
  disabled?: string;
  run: () => void;
}

//Anything that wants to add commands (behaviour recipes, a later feature) registers a provider; the palette asks each when it opens
const providers = new Set<() => Command[]>();
export function registerCommandProvider(fn: () => Command[]): () => void {
  providers.add(fn);
  return () => void providers.delete(fn);
}

const NEW_LAYERS: { type: NodeType; label: string; words: string }[] = [
  { type: 'rect', label: 'Rectangle', words: 'box square shape' },
  { type: 'ellipse', label: 'Ellipse', words: 'circle oval shape' },
  { type: 'polygon', label: 'Polygon', words: 'shape triangle' },
  { type: 'star', label: 'Star', words: 'shape' },
  { type: 'text', label: 'Text', words: 'words heading title paragraph label' },
  { type: 'frame', label: 'Frame', words: 'container group layout card' },
  { type: 'button', label: 'Button', words: 'click press' },
  { type: 'input', label: 'Input field', words: 'text box type answer form' },
  { type: 'link', label: 'Link', words: 'url hyperlink' },
  { type: 'embed', label: 'Embed', words: 'html iframe website' },
  { type: 'video', label: 'Video', words: 'movie clip' },
  { type: 'draw', label: 'Script layer', words: 'code generative' },
  { type: 'shader', label: 'Shader layer', words: 'gpu effect backdrop' },
  { type: 'progress', label: 'Progress bar', words: 'score meter' },
  { type: 'chart', label: 'Chart', words: 'graph bar pie line data' },
];

export const PANEL_NAMES: Record<PanelId, { label: string; words: string }> = {
  layers: { label: 'Layers', words: 'pages artboards list' },
  assets: { label: 'Assets', words: 'files pictures images sounds media' },
  libraries: { label: 'Libraries', words: 'components styles share' },
  comments: { label: 'Comments', words: 'review feedback notes' },
  inspector: { label: 'Properties', words: 'inspector settings' },
  timeline: { label: 'Timeline', words: 'animation keyframes' },
  logic: { label: 'Interactions', words: 'graph events logic nodes' },
  scripts: { label: 'Scripts', words: 'javascript code' },
  variables: { label: 'Variables', words: 'values state' },
  data: { label: 'Data', words: 'json csv sources' },
  a11y: { label: 'Accessibility', words: 'checker contrast alt text' },
  insights: { label: 'Insights', words: 'analytics learners results' },
  interface: { label: 'Public interface', words: 'embed api' },
  checklist: { label: 'Checklist', words: 'template things to change' },
  themes: { label: 'Themes', words: 'colours tokens' },
  usage: { label: 'Usage', words: 'unused broken references' },
  credits: { label: 'Attributions', words: 'credits sources' },
};

const BOTTOM_TABS: PanelId[] = ['timeline', 'logic', 'scripts', 'variables', 'data', 'usage', 'a11y', 'insights', 'interface', 'checklist', 'themes', 'credits'];

/** Put the view on a page: it becomes the open one and the canvas pans and zooms to it. */
export function goToPage(id: string): void {
  const s = store();
  const ab = s.get().project.artboards.find((a) => a.id === id);
  if (!ab) return;
  s.set({ activeArtboardId: ab.id, selection: [], artboardSelected: true, activeTimelineId: null });
  const el = document.querySelector('.canvas') as HTMLElement | null;
  if (!el) return;
  const zoom = Math.min(8, Math.max(0.05, Math.min((el.clientWidth - 120) / Math.max(1, ab.width), (el.clientHeight - 120) / Math.max(1, ab.height))));
  s.set({ zoom, panX: el.clientWidth / 2 - (ab.canvasX + ab.width / 2) * zoom, panY: el.clientHeight / 2 - (ab.canvasY + ab.height / 2) * zoom });
}

/** A new layer in the middle of the open page, selected (text opens for typing). */
export function addLayerHere(type: NodeType): string | null {
  const s = store();
  const ab = s.artboard();
  if (!ab) return null;
  const proto = createNode(type);
  const font = prefs().defaultFont.trim();
  const fontDefaults = font && (type === 'text' || type === 'button' || type === 'input' || type === 'link') ? { fontFamily: fontStack(font) } : {};
  const node = createNode(type, {
    x: Math.round((ab.width - (type === 'text' ? 0 : proto.width)) / 2),
    y: Math.round((ab.height - (type === 'text' ? 0 : proto.height)) / 2),
    ...fontDefaults,
    ...lookDefaults(s.get().project, type),
  } as never);
  s.addNodes([node], { artboardId: ab.id });
  if (node.type === 'text') s.set({ editingTextId: node.id });
  return node.id;
}

const key = (k: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k === '!' ? 'Digit1' : k === '@' ? 'Digit2' : '', shiftKey: k === '!' || k === '@', bubbles: true, cancelable: true }));

export function buildCommands(): Command[] {
  const s = store();
  const st = s.get();
  const p = st.project;
  const ab = s.artboard();
  const sel = s.selectedNodes();
  const one: SceneNode | null = sel.length === 1 ? sel[0] : null;
  const noPage = ab ? undefined : 'Open a page first';
  const noSel = sel.length ? undefined : 'Select a layer first';
  const noOne = one ? undefined : 'Select one layer first';
  const pr = prefs();
  const out: Command[] = [];
  const add = (c: Command) => void out.push(c);

  //---- Add
  for (const l of NEW_LAYERS) add({ id: `add:${l.type}`, title: `Add ${l.label.toLowerCase()}`, group: 'Add', words: `new insert create ${l.words}`, disabled: noPage, run: () => void addLayerHere(l.type) });
  add({ id: 'add:page', title: 'Add a page', group: 'Pages', words: 'new artboard screen slide', run: () => void s.addArtboard() });

  //---- Questions
  for (const k of QUESTION_KINDS) {
    add({
      id: `question:${k.value}`,
      title: `Add question: ${k.label}`,
      group: 'Questions',
      words: `quiz test ${k.hint ?? ''}`,
      disabled: noPage,
      run: () => {
        let id: string | null = null;
        s.update((d) => void (id = addQuestion(d, ab!.id, k.value)));
        if (id) s.select([id], { artboardId: ab!.id });
      },
    });
  }
  add({ id: 'question:paste', title: 'Paste questions from Word or Excel', group: 'Questions', words: 'import quiz table spreadsheet docx xlsx csv', run: openPasteQuestions });
  add({ id: 'question:gift', title: 'Import questions from a GIFT file', group: 'Questions', words: 'moodle quiz', run: () => void importGiftFile() });

  //---- Pages
  p.artboards.forEach((a) => add({ id: `page:${a.id}`, title: `Go to page: ${a.name}`, group: 'Pages', words: 'open show jump', run: () => goToPage(a.id) }));
  add({ id: 'page:start', title: 'Make this the start page', group: 'Pages', words: 'first page opens', disabled: noPage ?? (p.settings.startArtboardId === ab?.id ? 'It already is' : undefined), run: () => s.update((d) => void (d.settings.startArtboardId = ab!.id)) });
  add({ id: 'page:duplicate', title: 'Duplicate this page', group: 'Pages', words: 'copy artboard', disabled: noPage, run: () => s.duplicateArtboards([ab!.id]) });
  add({ id: 'page:nav', title: 'Add Back and Next buttons to every page', group: 'Pages', words: 'navigation arrows move between pages', disabled: p.artboards.length < 2 ? 'Needs two or more pages' : undefined, run: () => s.update((d) => void addPageNavigation(d, d.artboards.map((a) => a.id), 'back-next')) });
  add({ id: 'page:tidy', title: 'Tidy up the pages on the canvas', group: 'Pages', words: 'arrange grid artboards', disabled: p.artboards.filter((a) => !a.canvasHidden).length < 2 ? 'Needs two or more pages' : undefined, run: () => tidyArtboardsCommand() });
  add({ id: 'page:arrows', title: 'Page arrows on the canvas', group: 'View', words: 'routes links between pages show hide', on: showRoutes(), run: () => setShowRoutes(!showRoutes()) });

  //---- Layers: go to one of the open page's layers
  if (ab) {
    let n = 0;
    walk(ab.children, (l) => {
      if (n++ < 80) add({ id: `layer:${l.id}`, title: `Select layer: ${l.name}`, group: 'Layers', words: `go to find ${l.type}`, run: () => s.select([l.id], { artboardId: ab.id }) });
    });
  }

  //---- Selection
  const selCmd = (id: string, title: string, run: () => void, extra: Partial<Command> = {}) => add({ id: `sel:${id}`, title, group: 'Selection', disabled: noSel, run, ...extra });
  selCmd('all', 'Select all on this page', () => s.select(ab!.children.filter((l) => !l.locked).map((l) => l.id)), { hint: 'Ctrl+A', disabled: noPage });
  selCmd('duplicate', 'Duplicate', () => s.duplicateSelection(), { hint: 'Ctrl+D', words: 'copy' });
  selCmd('delete', 'Delete', () => deleteSelectionCommand(), { hint: 'Del', words: 'remove' });
  selCmd('group', 'Group', () => s.groupSelection(), { hint: 'Ctrl+G', words: 'together' });
  selCmd('ungroup', 'Ungroup', () => s.ungroupSelection(), { hint: 'Ctrl+Shift+G', disabled: one && (one.type === 'group' || one.type === 'frame') ? undefined : 'Select a group or frame first' });
  selCmd('front', 'Bring to front', () => s.reorder(Infinity), { hint: 'Ctrl+]', words: 'order top' });
  selCmd('forward', 'Bring forward', () => s.reorder(1), { hint: ']', words: 'order' });
  selCmd('backward', 'Send backward', () => s.reorder(-1), { hint: '[', words: 'order' });
  selCmd('back', 'Send to back', () => s.reorder(-Infinity), { hint: 'Ctrl+[', words: 'order bottom' });
  const hidden = sel.length > 0 && sel.every((l) => l.visible === false);
  selCmd('hide', hidden ? 'Show the selected layers' : 'Hide the selected layers', () => s.setProps(sel.map((l) => l.id), { visible: hidden }), { words: hidden ? 'visible unhide' : 'invisible' });
  selCmd('lock', 'Lock the selected layers', () => s.setProps(sel.map((l) => l.id), { locked: true }), { words: 'stop moving' });

  //---- Animate
  for (const a of ANIM_PRESETS) {
    add({ id: `animate:${a.id}`, title: `Animate: ${a.label}`, group: 'Animate', words: `animation preset entrance ${a.tip}`, disabled: noSel, run: () => void s.applyAnimation(sel.map((l) => l.id), a.id, animOptions()) });
  }

  //---- Behaviours
  for (const r of RECIPES) {
    add({
      id: `behaviour:${r.id}`,
      title: `When clicked: ${r.label}`,
      group: 'Behaviours',
      words: `interaction recipe behaviour ${r.group} ${r.hint}`,
      disabled: noOne,
      run: () => openBehaviours({ abId: ab!.id, layerId: one!.id, trigger: 'click', recipe: r.id }),
    });
  }

  //---- View and toggles
  add({ id: 'view:fit', title: 'Zoom to fit everything', group: 'View', hint: 'Shift+1', run: () => key('!') });
  add({ id: 'view:selection', title: 'Zoom to the selection', group: 'View', hint: 'Shift+2', run: () => key('@') });
  add({ id: 'view:100', title: 'Zoom to 100%', group: 'View', hint: 'Ctrl+1', words: 'actual size', run: () => window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', ctrlKey: true, bubbles: true, cancelable: true })) });
  add({ id: 'view:grid', title: 'Show the grid', group: 'View', hint: 'Shift+G', on: pr.showGrid, words: 'toggle lines', run: () => setPrefs({ showGrid: !prefs().showGrid }) });
  add({ id: 'view:rulers', title: 'Show rulers', group: 'View', hint: 'Shift+R', on: pr.rulers, words: 'toggle guides', run: () => setPrefs({ rulers: !prefs().rulers }) });
  add({ id: 'view:notes', title: 'Show notes', group: 'View', on: pr.showNotes, words: 'sticky toggle', run: () => setPrefs({ showNotes: !prefs().showNotes }) });
  add({ id: 'view:bones', title: 'Show bones', group: 'View', hint: 'Shift+J', on: st.showBones, words: 'rig toggle', run: () => s.set({ showBones: !store().get().showBones }) });
  add({ id: 'snap:on', title: 'Snapping', group: 'View', on: pr.snapOn, words: 'snap toggle magnet align', run: () => toggleSnap('on') });
  for (const i of SNAP_ITEMS) add({ id: `snap:${i.kind}`, title: `Snap to ${i.label.toLowerCase()}`, group: 'View', hint: i.kind === 'grid' ? "Ctrl+'" : undefined, on: !!pr[i.pref], words: `snapping toggle ${i.tip}`, run: () => toggleSnap(i.kind) });

  //---- Tools
  for (const [k, tool] of Object.entries(TOOL_KEYS)) add({ id: `tool:${tool}`, title: `Tool: ${TOOL_HELP[tool].label.replace(/ tool$/i, '')}`, group: 'Tools', hint: k.toUpperCase(), words: 'draw pick', run: () => s.set({ tool, editingPathId: null }) });

  //---- Panels and workspaces
  for (const id of ALL_PANELS) {
    const n = PANEL_NAMES[id];
    add({
      id: `panel:${id}`,
      title: `Open ${n.label}`,
      group: 'Panels',
      words: `show panel tab ${n.words}`,
      run: () => {
        setDock((l) => showPanel(l, id));
        if (BOTTOM_TABS.includes(id)) s.set({ bottomTab: id as BottomTab });
      },
    });
  }
  for (const w of BUILT_IN) add({ id: `workspace:${w.id}`, title: `Workspace: ${w.name}`, group: 'Workspaces', words: `layout arrangement panels ${w.about}`, run: () => applyWorkspace(w.make()) });
  for (const w of savedWorkspaces()) add({ id: `workspace:${w.id}`, title: `Workspace: ${w.name}`, group: 'Workspaces', words: 'layout arrangement panels saved', run: () => applyWorkspace(w) });

  //---- Project
  add({ id: 'project:preview', title: 'Preview', group: 'Project', words: 'play run test', run: () => requestAppAction('preview') });
  add({ id: 'project:share', title: 'Share', group: 'Project', words: 'link publish studydesk embed learners', run: () => requestAppAction('share') });
  add({ id: 'project:invite', title: 'Invite people to edit', group: 'Project', words: 'collaborate share', run: () => requestAppAction('invite') });
  add({ id: 'project:review', title: 'Share for review', group: 'Project', words: 'comments reviewers feedback link', run: () => openShareForReview() });
  add({ id: 'project:template', title: 'Save as a template', group: 'Project', words: 'starter copy', run: () => requestAppAction('template') });
  add({ id: 'project:history', title: 'Revision history', group: 'Project', words: 'versions restore earlier', run: () => requestAppAction('history') });
  add({ id: 'project:prefs', title: 'Preferences', group: 'Project', words: 'settings options', run: () => requestAppAction('prefs') });
  add({ id: 'project:save', title: 'Save now', group: 'Project', hint: 'Ctrl+S', run: () => void (window as unknown as { __ixForceSave?: () => Promise<void> }).__ixForceSave?.() });
  add({ id: 'project:undo', title: 'Undo', group: 'Project', hint: 'Ctrl+Z', disabled: s.canUndo() ? undefined : 'Nothing to undo', run: () => s.undo() });
  add({ id: 'project:redo', title: 'Redo', group: 'Project', hint: 'Ctrl+Shift+Z', disabled: s.canRedo() ? undefined : 'Nothing to redo', run: () => s.redo() });
  for (const [id, title, words] of [
    ['export-html', 'Export: single HTML file', 'download standalone'],
    ['export-package', 'Export: project package', 'download ixp backup'],
    ['export-json', 'Export: project JSON', 'download document'],
    ['export-png', 'Export: PNG picture of this page', 'download image'],
    ['export-svg', 'Export: SVG picture of this page', 'download image vector'],
    ['export-lottie', 'Export: Lottie animation of this page', 'download json'],
    ['motion', 'Export: video, GIF or frames', 'download mp4 webm animation'],
  ] as const) {
    add({ id: `project:${id}`, title, group: 'Project', words, disabled: id === 'export-html' || id === 'export-package' || id === 'export-json' ? undefined : noPage, run: () => requestAppAction(id) });
  }
  add({ id: 'project:help', title: 'Search the help', group: 'Project', hint: 'F1', words: 'docs how to', run: () => openHelpSearch() });

  for (const fn of providers) {
    try {
      out.push(...fn());
    } catch {
      /* a provider that breaks only loses its own commands */
    }
  }
  return out;
}

//---------------------------------------------------------------------------------------------------------------------
//Finding

/** Rank commands for what was typed: every word has to turn up somewhere, earlier and in the title is better. */
export function searchCommands(list: Command[], query: string, limit = 30): Command[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored: { c: Command; score: number; at: number }[] = [];
  list.forEach((c, at) => {
    const title = c.title.toLowerCase();
    const extra = `${c.group} ${c.words ?? ''}`.toLowerCase();
    let score = 0;
    for (const w of words) {
      const t = title.indexOf(w);
      if (t >= 0) score += (t === 0 ? 12 : title[t - 1] === ' ' || title[t - 1] === ':' ? 8 : 4) + (title === w ? 10 : 0);
      else if (extra.split(/\s+/).some((x) => x.startsWith(w))) score += 3;
      else if (extra.includes(w)) score += 1;
      else return;
    }
    scored.push({ c, score: score - (c.disabled ? 2 : 0), at });
  });
  return scored.sort((a, b) => b.score - a.score || a.at - b.at).slice(0, limit).map((x) => x.c);
}

const RECENT_KEY = 'ix-palette-recent';
export function recentCommandIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]').filter((x: unknown) => typeof x === 'string').slice(0, 6);
  } catch {
    return [];
  }
}
export function noteCommandUsed(id: string): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...recentCommandIds().filter((x) => x !== id)].slice(0, 6)));
  } catch {
    /* storage unavailable: no recents */
  }
}

/** What shows before anything is typed: the ones used lately, then the first few of the usual. */
export function suggestedCommands(list: Command[]): Command[] {
  const byId = new Map(list.map((c) => [c.id, c]));
  const recent = recentCommandIds().map((id) => byId.get(id)).filter((c): c is Command => !!c);
  const usual = ['add:text', 'add:button', 'add:page', 'project:preview', 'project:share', 'view:grid', 'panel:timeline', 'panel:logic'].map((id) => byId.get(id)).filter((c): c is Command => !!c && !recent.includes(c));
  return [...recent, ...usual].slice(0, 10);
}

