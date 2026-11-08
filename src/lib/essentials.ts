import { walk, type NodeType, type Project } from 'interactives-player';
import { hideSome, type DockLayout, type PanelId } from './dock';

/**
 * The Essentials workspace: what a first project needs, with the rest put away until it is wanted. It is a layout like the
 * others (lib/workspaces.ts) that also carries a list of hidden panels and tool groups (lib/dock.ts), so switching to Standard
 * (or "Show all panels") brings everything back. Nothing is removed: every panel is still in its group, and anything the
 * project already uses shows its tab whatever the list says.
 */

/** Tabs and panels that stay: layers, assets and properties, the timeline, interactions, variables, and the checklist of a template. */
export const ESSENTIAL_PANELS: PanelId[] = ['layers', 'assets', 'inspector', 'timeline', 'logic', 'variables', 'checklist', 'content'];

/** Put away in Essentials. */
export const HIDDEN_PANELS: PanelId[] = ['icons', 'libraries', 'comments', 'scripts', 'data', 'a11y', 'insights', 'interface', 'themes', 'usage', 'credits'];

/** Tool rail groups put away in Essentials (Shapes, Media with Text, and Web stay). */
export const HIDDEN_TOOL_GROUPS = ['draw', 'data', 'rig'];

/** The layer types each put-away tool group makes, so a project that has some shows the group. */
const GROUP_NODES: Record<string, NodeType[]> = {
  draw: ['path', 'connector'],
  data: ['progress', 'chart'],
  rig: ['bone'],
};

/** The Essentials arrangement on top of a layout (the standard one). */
export const essentialsLayout = (l: DockLayout): DockLayout => hideSome(l, HIDDEN_PANELS, HIDDEN_TOOL_GROUPS);

/** The panels a project already uses something from, so their tabs show even in Essentials. `reviewed` is whether it has review comments. */
export function panelsInUse(project: Project, reviewed = false): Set<PanelId> {
  const out = new Set<PanelId>();
  if (project.scripts?.length) out.add('scripts');
  if (project.dataSources?.length) out.add('data');
  const pi = project.settings?.publicInterface;
  if (pi && (pi.variables.length || pi.messages.length)) out.add('interface');
  if (project.attributions?.length) out.add('credits');
  if (project.libraries?.length) out.add('libraries');
  // the three themes every project starts with are not a reason; one more is somebody working with them
  if ((project.themes?.list.length ?? 0) > 3) out.add('themes');
  if (reviewed) out.add('comments');
  return out;
}

/** The put-away tool groups a project already makes layers with, as one string (so a component can select it and only re-render when it changes). */
export function toolGroupsInUse(project: Project): string {
  const want = new Set<string>();
  const types = new Set<NodeType>();
  for (const ab of project.artboards) walk(ab.children, (n) => void types.add(n.type));
  for (const [g, kinds] of Object.entries(GROUP_NODES)) if (kinds.some((k) => types.has(k))) want.add(g);
  return [...want].sort().join(',');
}

/** Is this panel on show: not put away, or put away but wanted. */
export const panelOn = (l: DockLayout, p: PanelId, inUse: Set<PanelId>): boolean => !l.hidden?.includes(p) || inUse.has(p);
