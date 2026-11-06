/**
 * Switching the colourway of a branded project: which of its themes opens by default, and the optional swatch switcher
 * that lets a learner change it (buttons using the interaction graph's Set theme action). The editor's Inspector (Project
 * section) drives both; they are plain document changes, so each is one undo step.
 */
import { createNode, tokenByName, uid, walk, type Artboard, type LogicEdge, type LogicNode, type Project, type SceneNode, type ThemeDef } from 'interactives-player';
import { chrome } from './kit';
import { COLOURWAYS, type Colourway } from './looks';

export const SWITCHER_NAME = 'Colourway switcher';
const SWITCHER_NOTE = 'Colourway switcher';
const SIZE = 28;
const GAP = 8;

/** The project's colourway themes, in the picker's order (High contrast is the viewer's choice, not offered). */
export function colourwayThemes(p: Project): { theme: ThemeDef; way: Colourway }[] {
  const list = p.themes?.list ?? [];
  const out: { theme: ThemeDef; way: Colourway }[] = [];
  for (const way of COLOURWAYS) {
    const theme = list.find((t) => t.id === `theme-${way.id}`);
    if (theme) out.push({ theme, way });
  }
  return out;
}

/** Makes `themeId` the theme the project opens in (and the one the brand look names). False when the project has no such colourway. */
export function setColourway(draft: Project, themeId: string): boolean {
  const way = colourwayThemes(draft).find((c) => c.theme.id === themeId)?.way;
  if (!way || !draft.themes) return false;
  draft.themes.default = themeId;
  if (draft.brandLook) draft.brandLook = { ...draft.brandLook, id: way.id, name: way.name };
  return true;
}

const switcherOn = (n: SceneNode) => n.name === SWITCHER_NAME && n.type === 'group';

/** The page a project's switcher is on, or undefined when it has none. */
export function switcherBoard(p: Project): Artboard | undefined {
  return p.artboards.find((ab) => {
    let found = false;
    walk(ab.children, (n) => void (found ||= switcherOn(n)));
    return found;
  });
}

export const hasLearnerSwitcher = (p: Project): boolean => !!switcherBoard(p);

/** Takes the switcher and its interaction nodes out of a project. */
export function removeLearnerSwitcher(draft: Project): void {
  for (const ab of draft.artboards) {
    const buttons = new Set<string>();
    ab.children = ab.children.filter((n) => {
      if (!switcherOn(n)) return true;
      walk([n], (x) => void buttons.add(x.id));
      return false;
    });
    if (!buttons.size) continue;
    const gone = new Set(ab.logic.nodes.filter((n) => n.note === SWITCHER_NOTE).map((n) => n.id));
    ab.logic.nodes = ab.logic.nodes.filter((n) => !gone.has(n.id));
    ab.logic.edges = ab.logic.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to));
  }
}

/**
 * A row of small round swatch buttons in the top right of the start page, one per colourway, each running Set theme. Chrome,
 * so it stays put. The swatches are the colourways' own identity colours (plain colours, whatever theme is showing); the ring
 * and focus use the page's tokens. Replaces one that is already there.
 */
export function addLearnerSwitcher(draft: Project): boolean {
  const ways = colourwayThemes(draft);
  const start = draft.artboards.find((a) => a.id === draft.settings.startArtboardId) ?? draft.artboards[0];
  if (!start || !ways.length) return false;
  removeLearnerSwitcher(draft);
  const ring = tokenByName(draft.themes, 'color/border');
  const ringRef = ring ? `token:${ring.id}` : '#b4aea7';
  const total = ways.length * SIZE + (ways.length - 1) * GAP;
  const left = start.width - 48 - total;
  const top = 16;
  const buttons = ways.map(({ way }, i) =>
    createNode('button', {
      name: `Colourway: ${way.name}`,
      label: '',
      x: i * (SIZE + GAP),
      y: 0,
      width: SIZE,
      height: SIZE,
      cornerRadius: SIZE / 2,
      fill: { type: 'linear', angle: 135, stops: [{ offset: 0, color: way.brand.gradientStart }, { offset: 1, color: way.brand.gradientEnd }] },
      stroke: { paint: { type: 'solid', color: ringRef }, width: 2 },
      ariaLabel: `Switch to the ${way.name} colourway`,
    } as never),
  );
  const group = chrome(createNode('group', { name: SWITCHER_NAME, x: left, y: top, width: total, height: SIZE, children: buttons, role: 'region', ariaLabel: 'Colourway' } as never));
  start.children.push(group);
  const nodes: LogicNode[] = [];
  const edges: LogicEdge[] = [];
  buttons.forEach((b, i) => {
    const name = ways[i].theme.name;
    const on: LogicNode = { id: uid('ln'), kind: 'event.pointer', x: 0, y: i * 110, params: { target: b.id, type: 'click' }, note: SWITCHER_NOTE };
    const set: LogicNode = { id: uid('ln'), kind: 'action.setTheme', x: 280, y: i * 110, params: { theme: JSON.stringify(name) }, note: SWITCHER_NOTE };
    nodes.push(on, set);
    edges.push({ id: uid('le'), from: on.id, fromPort: 'out', to: set.id, toPort: 'in' });
  });
  start.logic.nodes.push(...nodes);
  start.logic.edges.push(...edges);
  return true;
}
