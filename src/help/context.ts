import { CATALOG_BY_KIND, type NodeType } from 'interactives-player';
import type { Tool } from '../store/store';
import { slug } from './markdown';

/**
 * What the Help button opens: one table from "what is highlighted" to a help topic and anchor. test/help-context.test.ts
 * checks that every layer type, tool and graph node kind has an entry and that every topic and anchor named here exists, so
 * a new feature can't fall through to general help without a test saying so.
 */

export interface HelpTarget {
  /** A topic id, with an optional `#anchor`. */
  to: string;
  /** What the button's tooltip and the drawer's banner call it: "Chart layer". */
  label: string;
}

/** The help for each kind of layer. Typed on NodeType, so a new layer type is a compile error until it has an entry here. */
export const LAYER_HELP: Record<NodeType, HelpTarget> = {
  rect: { to: 'shapes#shape-settings', label: 'Rectangle layer' },
  ellipse: { to: 'shapes#shape-settings', label: 'Ellipse layer' },
  polygon: { to: 'shapes#shape-settings', label: 'Polygon layer' },
  star: { to: 'shapes#shape-settings', label: 'Star layer' },
  path: { to: 'shapes#editing-points', label: 'Path layer' },
  text: { to: 'text', label: 'Text layer' },
  image: { to: 'images-media#image-settings', label: 'Image layer' },
  video: { to: 'images-media#video', label: 'Video layer' },
  group: { to: 'groups-frames', label: 'Group' },
  frame: { to: 'groups-frames', label: 'Frame' },
  button: { to: 'web-elements', label: 'Button layer' },
  input: { to: 'web-elements', label: 'Input layer' },
  link: { to: 'links-cursors#link', label: 'Link layer' },
  embed: { to: 'web-elements', label: 'Embed layer' },
  instance: { to: 'instances', label: 'Instance' },
  draw: { to: 'script-layers', label: 'Script layer' },
  progress: { to: 'progress-bars', label: 'Progress bar layer' },
  chart: { to: 'charts', label: 'Chart layer' },
  connector: { to: 'connectors', label: 'Connector layer' },
  shader: { to: 'shader-layers', label: 'Shader layer' },
  bone: { to: 'bones', label: 'Bone' },
};

/** The help for each tool on the rail. Select and Hand are the resting state, so they only count when nothing else does. */
export const TOOL_HELP: Record<Tool, HelpTarget> = {
  select: { to: 'interface#tool-bar-left-edge-unless-you-move-it', label: 'Select tool' },
  hand: { to: 'canvas', label: 'Hand tool' },
  artboard: { to: 'artboards', label: 'Artboard tool' },
  frame: { to: 'groups-frames', label: 'Frame tool' },
  rect: { to: 'shapes', label: 'Rectangle tool' },
  ellipse: { to: 'shapes', label: 'Ellipse tool' },
  polygon: { to: 'shapes', label: 'Polygon tool' },
  star: { to: 'shapes', label: 'Star tool' },
  line: { to: 'shapes', label: 'Line tool' },
  pen: { to: 'shapes#pen-p', label: 'Pen tool' },
  pencil: { to: 'shapes', label: 'Pencil tool' },
  bend: { to: 'shape-morphing', label: 'Bend tool' },
  text: { to: 'text', label: 'Text tool' },
  image: { to: 'images-media', label: 'Image tool' },
  button: { to: 'web-elements', label: 'Button tool' },
  input: { to: 'web-elements', label: 'Input tool' },
  link: { to: 'links-cursors#link', label: 'Link tool' },
  embed: { to: 'web-elements', label: 'Embed tool' },
  video: { to: 'images-media#video', label: 'Video tool' },
  draw: { to: 'script-layers', label: 'Script layer tool' },
  shader: { to: 'shader-layers', label: 'Shader layer tool' },
  progress: { to: 'progress-bars', label: 'Progress bar tool' },
  chart: { to: 'charts', label: 'Chart tool' },
  connector: { to: 'connectors', label: 'Connector tool' },
  bone: { to: 'bones', label: 'Bone tool' },
  comment: { to: 'comments', label: 'Comment tool' },
  note: { to: 'notes', label: 'Note tool' },
};

/** A field that has a more specific page than its section does, by its `data-prop` key. */
export const PROP_HELP: Record<string, HelpTarget> = {
  trim: { to: 'fill-stroke#trim-path', label: 'Trim path' },
  blend: { to: 'fill-stroke#effects', label: 'Blend' },
  'tab-stop': { to: 'accessibility#tab-order', label: 'Tab stop' },
};

export const TIMELINE_KEY_HELP: HelpTarget = { to: 'timelines#adding-keyframes', label: 'Keyframes' };
export const TIMELINE_HELP: HelpTarget = { to: 'timelines', label: 'Timeline' };
export const GRAPH_GROUP_HELP: HelpTarget = { to: 'interactions#groups', label: 'Interaction group' };
export const ARTBOARD_HELP: HelpTarget = { to: 'artboards', label: 'Artboard' };
export const MASTER_HELP: HelpTarget = { to: 'page-master', label: 'Page master' };
export const MANY_LAYERS_HELP: HelpTarget = { to: 'layers-panel', label: 'Selected layers' };
export const GENERAL_HELP: HelpTarget = { to: 'welcome', label: 'Help' };
/** The Getting started strip, the first-run screen and the Essentials workspace. */
export const GETTING_STARTED_HELP: HelpTarget = { to: 'welcome#your-first-five-minutes', label: 'Getting started' };
/** The search, goal chips and Play on the Templates tab's built-in starters. */
export const STARTER_FINDER_HELP: HelpTarget = { to: 'templates#find-and-try-a-starter', label: 'Finding and trying a starter' };

/** The help for an interaction node kind: its entry in the generated node reference. Null for a kind the catalog doesn't know. */
export function nodeHelp(kind: string): HelpTarget | null {
  const def = CATALOG_BY_KIND[kind];
  return def ? { to: `interaction-nodes#${slug(def.label)}`, label: `${def.label} node` } : null;
}

/** Everything the button can look at, gathered by the editor from the selection, the panels and the focus. */
export interface HelpFocus {
  /** The field last focused in the Properties panel, while that is where the person is working. */
  field?: { prop: string; label: string; sectionHelp?: string; sectionTitle?: string };
  /** The panel last worked in. Null after the canvas or the tool bar. */
  panel: { id: string; help: string; label: string } | null;
  layerTypes: NodeType[];
  /** The selected interaction node's kind, or 'group' for a group of nodes. */
  graphKind?: string;
  keysSelected?: boolean;
  timelineActive?: boolean;
  tool: Tool;
  artboard?: 'artboard' | 'master';
}

/**
 * What the button opens, in this order: the focused field; then the thing selected in the panel being used (a graph node in
 * Interactions, a keyframe in the Timeline); then the active tool when it isn't Select or Hand; then the selected layers; then a
 * selected artboard or master; then the panel itself; then general help. Selection and focus only: hovering doesn't count.
 */
export function resolveHelp(f: HelpFocus): HelpTarget {
  if (f.field) {
    const own = PROP_HELP[f.field.prop];
    if (own) return own;
    if (f.field.sectionHelp) return { to: f.field.sectionHelp, label: f.field.sectionTitle || f.field.label };
  }
  const inPanel = f.panel?.id;
  if (inPanel === 'logic' && f.graphKind) {
    const t = f.graphKind === 'group' ? GRAPH_GROUP_HELP : nodeHelp(f.graphKind);
    if (t) return t;
  }
  if (inPanel === 'timeline' && f.keysSelected) return TIMELINE_KEY_HELP;
  if (!inPanel && f.tool !== 'select' && f.tool !== 'hand') return TOOL_HELP[f.tool];
  if (f.layerTypes.length) {
    const first = f.layerTypes[0];
    return f.layerTypes.every((t) => t === first) ? LAYER_HELP[first] : MANY_LAYERS_HELP;
  }
  if (f.artboard) return f.artboard === 'master' ? MASTER_HELP : ARTBOARD_HELP;
  if (f.panel) return { to: f.panel.help, label: `${f.panel.label} panel` };
  return GENERAL_HELP;
}

export const helpTooltip = (t: HelpTarget): string => (t === GENERAL_HELP ? 'Help (? to open, F1 or Ctrl+K to search)' : `Help: ${t.label} (? to open, F1 or Ctrl+K to search)`);
