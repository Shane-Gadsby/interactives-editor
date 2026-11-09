/**
 * The Credits button every starter carries on its first page: a small, quiet text button in a corner that opens the list of
 * credits (the Open credits action, the same thing the automatic Credits button does), and the automatic button stays off for the
 * project so there are not two. Added to a built starter as one of the last passes, so each starter's own layout decides where it
 * goes: the corner is the first of bottom right, top right, bottom left and top left that nothing on the page, or in its master,
 * is in. On the white branded pages the bottom right is the footer line, level with the logo, and the footer text makes room.
 */
import { createNode, isContainer, tokenByName, uid, type Artboard, type LogicNode, type Project, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { SIDE_MARGIN, footerMidY } from './branded/kit';
import { graphNote } from './branded/graph-kit';

export const CREDITS_BUTTON_NAME = 'Credits button';
const W = 68;
const H = 28;
//the quiet corner gutter on a page that is not one of the branded ones
const GUTTER = 16;
//a button keeps this much room inside its own box either side of the label, so the words (not the box) line up with the margin
const PAD = 12;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Anyish = SceneNode & { text?: string; fontSize?: number; decorative?: boolean; visible?: boolean };

/** What a layer takes up on the page, as a box (text is estimated from its size; rotation is ignored). */
function boxOf(n: Anyish, ox: number, oy: number): Box {
  const w = n.width;
  let h = n.height;
  if (n.type === 'text') {
    const size = n.fontSize ?? 16;
    const lines = Math.max(1, Math.ceil(((n.text ?? '').length * size * 0.55) / Math.max(1, w)));
    h = Math.max(h || 0, lines * size * 1.35);
  }
  return { x: ox + n.x, y: oy + n.y, w, h };
}

/** Every layer worth keeping clear of: leaves and filled panels, not full-page backgrounds, and not text with nothing in it. */
function collect(list: SceneNode[], page: Artboard, ox: number, oy: number, out: Box[]): void {
  for (const raw of list) {
    const n = raw as Anyish;
    if (n.decorative && n.width * n.height > page.width * page.height * 0.5) continue;
    const box = boxOf(n, ox, oy);
    if (n.type === 'text' && !(n.text ?? '').trim()) continue;
    if (isContainer(n)) {
      const painted = !!(n as { fill?: unknown }).fill || !!(n as { stroke?: unknown }).stroke;
      if (painted && box.w * box.h < page.width * page.height * 0.5) out.push(box);
      collect(n.children, page, box.x, box.y, out);
    } else if (box.w * box.h < page.width * page.height * 0.5 || n.type === 'text' || n.type === 'button') out.push(box);
  }
}

const hits = (a: Box, b: Box, pad = 0) => a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;

/** The first corner of the page with nothing in it, as the button's top left corner. The branded pages' footer line comes first on them. */
function pickCorner(project: Project, page: Artboard, branded: boolean): { x: number; y: number; right: boolean } {
  const boxes: Box[] = [];
  collect(page.children, page, 0, 0, boxes);
  //the master's layers (the logo, the accent bar) count too, with a little room round them
  const master = page.master ? project.artboards.find((a) => a.id === page.master) : undefined;
  const fromMaster: Box[] = [];
  if (master) collect(master.children, master, 0, 0, fromMaster);
  const edge = branded ? SIDE_MARGIN : GUTTER;
  const mid = branded ? footerMidY(page.height) : page.height - GUTTER - H / 2;
  const spots = [
    { x: page.width - edge - W, y: mid - H / 2, right: true },
    { x: page.width - edge - W, y: GUTTER, right: true },
    { x: edge, y: mid - H / 2, right: false },
    { x: edge, y: GUTTER, right: false },
  ];
  const clear = (s: { x: number; y: number }) => {
    //(the label sits PAD inside the box, so the box is checked as the words plus their room)
    const b = { x: s.x, y: s.y, w: W, h: H };
    //the footer text of a branded page makes room (see below), so it is not in the way
    return !boxes.some((o) => hits(b, o) && !isFooter(page, o)) && !fromMaster.some((o) => hits(b, o, 8));
  };
  return spots.find(clear) ?? spots[0];
}

//the branded content pages' footer line: its box is known, and it can be made shorter
const footerOf = (page: Artboard) => page.children.find((n) => n.name === 'Footer text' && n.type === 'text') as (Anyish & { width: number }) | undefined;
function isFooter(page: Artboard, box: Box): boolean {
  const f = footerOf(page);
  return !!f && box.x === f.x && box.y === f.y && box.w === f.width;
}

/** Whether the project is one of the branded starters (they carry the brand look and its tokens). */
const isBranded = (project: Project) => !!project.brandLook;

/**
 * Puts the Credits button on the start page of a built starter (and on each narrower or wider version of it, when the start page is a
 * responsive set), with the graph that opens the list. Returns the checklist item for it (the starter's own checklist gets it at the
 * end), or null when the project has no page to put it on.
 */
export function addCreditsButton(project: Project): TemplateChecklistItem | null {
  const start = (project.artboards.find((a) => a.id === project.settings.startArtboardId && !a.isMaster) ?? project.artboards.find((a) => !a.isMaster)) as Artboard | undefined;
  const t = project.themes;
  if (!start || !t) return null;
  const ref = (name: string) => {
    const tk = tokenByName(t, name);
    return tk ? `token:${tk.id}` : undefined;
  };
  const branded = isBranded(project);
  const font = project.fonts.find((f) => f.family === 'Open Sans') ? 'Open Sans' : undefined;
  const deep = ref('brand/deep');
  let first: SceneNode | undefined;
  for (const page of [start, ...project.artboards.filter((a) => a.variantOf === start.id && !a.isMaster)] as Artboard[]) {
    //words in the page's own quiet colour: muted on a white page, the on-colour of a gradient or the deep purple page
    const bg = page.background;
    const colour =
      (bg?.type === 'linear' || bg?.type === 'radial' ? ref('brand/on-gradient') : bg?.type === 'solid' && deep && bg.color === deep ? ref('brand/on-deep') : undefined) ?? ref('color/muted') ?? ref('color/text');
    if (!colour) continue;
    const spot = pickCorner(project, page, branded);
    //the footer text stops short of the button when the button is level with it
    const footer = footerOf(page);
    if (footer && spot.x + W > footer.x && spot.y < footer.y + 24 && spot.y + H > footer.y) footer.width = Math.max(40, spot.x + PAD - 12 - footer.x);
    const button = createNode('button', {
      name: CREDITS_BUTTON_NAME,
      label: 'Credits',
      x: spot.right ? spot.x + PAD : spot.x - PAD,
      y: spot.y,
      width: W,
      height: H,
      cornerRadius: 6,
      fill: null,
      stroke: null,
      color: colour,
      fontSize: 12,
      fontWeight: 600,
      align: spot.right ? 'right' : 'left',
      textDecoration: 'underline',
      ...(font ? { fontFamily: font } : {}),
    } as Partial<SceneNode>);
    page.children.push(button);
    first ??= button;
    //graph: click, then Open credits, below whatever the page already has
    const y = page.logic.nodes.reduce((m, n) => Math.max(m, n.y + 140), 0);
    const on: LogicNode = { id: uid('ln'), kind: 'event.pointer', x: 0, y, params: { target: button.id, type: 'click' } };
    const open: LogicNode = { id: uid('ln'), kind: 'action.credits', x: 260, y, params: {} };
    page.logic.nodes.push(on, open);
    page.logic.edges.push({ id: uid('le'), from: on.id, fromPort: 'out', to: open.id, toPort: 'in' });
    graphNote(page, { anchor: on, colour: 'sky', text: '**Open credits** shows the list from Project > Credits. [ ] Fill the list in, or delete this button and its two nodes.' });
  }
  if (!first) return null;
  return {
    id: uid('ck'),
    text: 'Check the credits list covers every picture, sound and source',
    detail:
      'The small Credits button in the corner of the first page opens the project\'s list of credits for learners. Fill the list in under Project > Credits (it can also fill itself in from the pictures and sounds you add). If you have nothing to credit, delete the button: with an empty list learners are told that no credits have been added yet. The automatic Credits button is off for this project because the page has its own.',
    nodeId: first.id,
    artboardId: start.id,
    done: false,
  };
}
