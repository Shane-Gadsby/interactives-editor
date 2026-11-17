import { produce } from 'immer';
import { tokenByName, type Artboard, type Project, type SceneNode } from 'interactives-player';
import { store } from '../../store/store';
import { ensureThemes } from '../themes';
import { addColourwayTheme } from './colourway';
import { BRAND_TOKEN_NAMES, CHROME_TAG, contentFrameBoxes, masterFor, type BrandedCtx, type ColourKey } from './kit';
import { COLOURWAYS, colourwayById, type Colourway } from './looks';
import { lookBlocked } from './unisq-look-check';

export { lookBlocked };

/**
 * "Apply the UniSQ look": what a branded starter pack builds in, for a project that did not start from one. The colourway is added
 * as a theme (with the brand colours) and made the one the project opens in, a Content master is made with the branded frame (the
 * accent bar and the logo, as the starters have them) and each page without a master is set to use it. The author's own layers are
 * not moved or recoloured, and the brand lock (the one a starter pack's project is held to) is not switched on. One undo step.
 */

export interface LookResult {
  way: Colourway;
  /** The colourway was not a theme of this project until now. */
  themeAdded: boolean;
  /** The project did not open in this colourway until now. */
  madeDefault: boolean;
  /** Names of the masters made (one for each page size). */
  masters: string[];
  /** Pages set to use a master. */
  pages: number;
  /** Pages that already had a master of their own, left as they were. */
  keptMasters: number;
  /** Pages with a layer of the author's where the logo or the accent bar goes. */
  crowded: string[];
  changed: boolean;
}

const camel = (s: string): string => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const isOurMaster = (a: Artboard): boolean => !!a.isMaster && /^Content master/.test(a.name) && a.children.some((n) => (n as { tags?: string[] }).tags?.includes(CHROME_TAG));

/** Make the project open in a UniSQ colourway and give its pages the branded frame. Mutates; changes nothing when there is nothing to do. */
export function applyUniSQLook(draft: Project, way: Colourway): LookResult {
  const result: LookResult = { way, themeAdded: false, madeDefault: false, masters: [], pages: 0, keptMasters: 0, crowded: [], changed: false };
  const themes = ensureThemes(draft);
  result.themeAdded = addColourwayTheme(draft, way);
  const themeId = `theme-${way.id}`;
  if (themes.default !== themeId) {
    themes.default = themeId;
    result.madeDefault = true;
  }

  //every token as the reference a layer would hold, the way a starter's own build has them
  const L = {} as Record<ColourKey, string>;
  for (const tk of themes.tokens) {
    const m = /^color\/(.*)$/.exec(tk.name);
    if (m) L[camel(m[1]) as ColourKey] = `token:${tk.id}`;
  }
  for (const [key, name] of Object.entries(BRAND_TOKEN_NAMES)) {
    const tk = tokenByName(themes, name);
    if (tk) L[key as ColourKey] = `token:${tk.id}`;
  }
  const ctx: BrandedCtx = { project: draft, colourway: way, L, masters: new Map() };
  //a master made by an earlier go is used again, not made twice
  for (const a of draft.artboards) if (isOurMaster(a)) ctx.masters.set(`content|${a.width}x${a.height}`, a);
  const before = new Set(draft.artboards.map((a) => a.id));

  for (const page of draft.artboards) {
    if (page.isMaster || page.library || !before.has(page.id)) continue;
    if (page.master) {
      result.keptMasters++;
      continue;
    }
    const master = masterFor(ctx, 'content', page.width, page.height);
    page.master = master.id;
    result.pages++;
    const boxes = contentFrameBoxes(page.width, page.height);
    //(pages in the same coordinates as the master: top level layers, where they sit unrotated)
    if ((page.children as SceneNode[]).some((n) => n.visible !== false && (overlaps(n, boxes.accent) || overlaps(n, boxes.logo)))) result.crowded.push(page.name);
  }

  //new masters sit off to the right of the pages on the canvas, in a row, so they cover nothing
  const made = draft.artboards.filter((a) => !before.has(a.id));
  let right = draft.artboards.filter((a) => before.has(a.id)).reduce((m, a) => Math.max(m, a.canvasX + a.width), 0);
  const top = draft.artboards.filter((a) => before.has(a.id)).reduce((m, a) => Math.min(m, a.canvasY), Infinity);
  for (const m of made) {
    m.canvasX = right + 100;
    m.canvasY = Number.isFinite(top) ? top : 0;
    right = m.canvasX + m.width;
    result.masters.push(m.name);
  }
  result.changed = result.themeAdded || result.madeDefault || result.masters.length > 0 || result.pages > 0;
  return result;
}

/** What the look did, in plain words, for the message after it. */
export function lookMessage(r: LookResult): string {
  if (!r.changed) return `This project already has the UniSQ look in ${r.way.name}. Nothing to change.`;
  const did: string[] = [];
  if (r.themeAdded) did.push(`added the ${r.way.name} theme and the brand colours`);
  if (r.madeDefault) did.push(`made ${r.way.name} the theme it opens in`);
  if (r.masters.length) did.push(`made ${r.masters.length === 1 ? r.masters[0] : `${r.masters.length} page masters (${r.masters.join(', ')})`} with the logo and accent bar`);
  if (r.pages) did.push(`set ${r.pages === 1 ? '1 page' : `${r.pages} pages`} to use ${r.masters.length > 1 ? 'them' : 'it'}`);
  let text = `Applied the UniSQ look in ${r.way.name}: ${did.join(', ')}. Your own layers were not moved or recoloured.`;
  if (r.keptMasters) text += ` ${r.keptMasters === 1 ? '1 page' : `${r.keptMasters} pages`} already had a master and kept it.`;
  if (r.crowded.length) text += ` ${r.crowded.length === 1 ? 'A layer on' : 'Layers on'} ${r.crowded.slice(0, 3).join(', ')}${r.crowded.length > 3 ? ' and more' : ''} sit${r.crowded.length === 1 ? 's' : ''} where the logo or accent bar goes: look at the bottom left and under the title.`;
  return text;
}

/** The command and the buttons run this: one undo step, with a message that says what happened and offers Undo. */
export function applyUniSQLookCommand(wayId: string = COLOURWAYS[0].id): LookResult | null {
  const s = store();
  const way = COLOURWAYS.find((w) => w.id === wayId) ?? colourwayById(wayId);
  if (!way) return null;
  const project = s.get().project;
  const why = lookBlocked(project);
  if (why) {
    s.toast(why, 'error');
    return null;
  }
  //nothing to change leaves the project as it is (and the undo history alone)
  const probe: { r?: LookResult } = {};
  produce(project, (d) => void (probe.r = applyUniSQLook(d as Project, way)));
  if (!probe.r?.changed) {
    s.toast(lookMessage({ ...probe.r!, changed: false }));
    return probe.r ?? null;
  }
  const mark = s.historyMark();
  let result: LookResult | null = null;
  s.update((d) => void (result = applyUniSQLook(d as Project, way)));
  //the canvas shows the default theme unless one was picked in its own switch, which would hide the change
  s.set({ canvasTheme: null });
  s.toastUndo(lookMessage(result!), mark);
  return result;
}

