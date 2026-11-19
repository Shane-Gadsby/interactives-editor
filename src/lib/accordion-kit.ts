//Add accordion: a frame with three sections, each a header and a panel, and the number variable that holds what's open.
//The frame carries `disclosure`, so the clicking and the showing are the frame's own job: no interaction nodes at all.
//Pure functions over a project draft (see store.update).
import { createNode, defaultAutoLayout, uid, type Artboard, type FrameNode, type Project, type Variable } from 'interactives-player';
import { lookFor } from './themes';
import { CONTROL_H, RADIUS, SPACE, TYPE, pad } from './design-scale';

const solid = (color: string) => ({ type: 'solid' as const, color });

/** A variable name nothing in the project is using. */
function freeName(d: Project, base: string): string {
  const used = new Set(d.variables.map((v) => v.name));
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) if (!used.has(`${base}${i}`)) return `${base}${i}`;
}

/**
 * Add an accordion (or a tab strip) to this page. Gives back the frame's id, or null when there's no such page.
 */
export function addAccordion(d: Project, abId: string, kind: 'accordion' | 'tabs' = 'accordion', opts: { at?: { x: number; y: number } } = {}): string | null {
  const ab = d.artboards.find((a) => a.id === abId);
  if (!ab) return null;
  const l = lookFor(d.themes);
  const width = Math.min(560, Math.max(240, ab.width - 80));
  const at = opts.at ?? { x: Math.round((ab.width - width) / 2), y: 40 };

  const v: Variable = { id: uid('v'), name: freeName(d, kind === 'tabs' ? 'openTab' : 'openSection'), label: kind === 'tabs' ? 'Tab showing' : 'Section open', type: 'number', initial: 0 };
  d.variables.push(v);

  const frame = kind === 'tabs' ? tabStrip(l, width, v.id, v.name) : accordionFrame(l, width, v.id);
  frame.x = at.x;
  frame.y = at.y;
  ab.children.push(frame);
  return frame.id;
}

/** The look a header takes while its own section is the open one: a state, so nothing is bound and nothing is wired. */
const openState = (variable: string, index: number, props: Record<string, unknown>) => ({ id: uid('st'), name: 'Open', when: 'expr' as const, expr: `${variable} == ${index}`, props });

/** How long a section takes to fold open or shut, and a tab's panel to swap: quick enough not to be waited for. */
const FOLD = { duration: 220, ease: 'easeOut' as const };

/** A header is a little taller than a plain button: it is a row you read as well as something you press. */
const HEADER_H = CONTROL_H + SPACE.s;

/**
 * Three sections stacked, each a header with its panel under it. One card with a border, a hairline between sections,
 * headings that read from the left like the text under them and a chevron that turns over. A section folds open and shut
 * rather than blinking: its panel fades while the section, which clips, grows or closes over it, and the sections below
 * glide to make room.
 */
function accordionFrame(l: Record<string, string>, width: number, variable: string): FrameNode {
  const section = (i: number): FrameNode =>
    createNode('frame', {
      name: `Section ${i + 1}`,
      width,
      height: 96,
      fill: solid(l.background),
      clip: true,
      layout: { ...defaultAutoLayout('column'), gap: 0, padding: pad(0), align: 'stretch', hugHeight: true, animate: { ...FOLD, enter: 'fade', exit: 'fade', hold: false } },
      children: [
        createNode('button', {
          name: `Heading ${i + 1}`,
          label: `Section ${i + 1}`,
          width,
          height: HEADER_H,
          fill: solid(l.background),
          color: l.text,
          fontSize: TYPE.body,
          fontWeight: 600,
          align: 'left',
          paddingX: SPACE.l,
          cornerRadius: 0,
        }),
        createNode('text', {
          name: `Panel ${i + 1}`,
          text: 'What this section is about.',
          width: width - SPACE.l * 2,
          height: 22,
          fontSize: TYPE.body,
          lineHeight: 1.5,
          color: l.text,
          autoSize: 'height',
          //lined up with the heading's own words, close under them, with room below before the next section's line
          layoutItem: { margin: { top: 0, right: SPACE.l, bottom: SPACE.l + SPACE.xs, left: SPACE.l } },
        }),
      ],
    }) as FrameNode;
  return createNode('frame', {
    name: 'Accordion',
    width,
    height: 300,
    //the gap between sections shows this through, which is the hairline between them
    fill: solid(l.border),
    stroke: { paint: solid(l.border), width: 1, align: 'inside' },
    cornerRadius: RADIUS.card,
    clip: true,
    layout: { ...defaultAutoLayout('column'), gap: 1, padding: pad(0), align: 'stretch', hugHeight: true, animate: { ...FOLD } },
    disclosure: { open: 'one', variable, toggle: true },
    children: [section(0), section(1), section(2)],
  }) as FrameNode;
}

/**
 * A row of tabs over the panel they show, drawn the way tabs are on most of the web: the tabs sit on a hairline that runs
 * the full width, each one its own label with space round it, and the one showing has a heavier label and a line under
 * it in the accent colour. The panel is plain words on the page with room round them, not a box. Changing tab fades the
 * new panel in, and the space under the tabs eases to fit it.
 */
function tabStrip(l: Record<string, string>, width: number, variable: string, name: string): FrameNode {
  const tabW = Math.min(128, Math.floor((width - SPACE.xs * 2) / 3));
  const tab = (i: number) =>
    createNode('button', {
      name: `Tab ${i + 1}`,
      label: `Tab ${i + 1}`,
      width: tabW,
      height: CONTROL_H,
      fill: null,
      color: l.text,
      fontSize: TYPE.body,
      fontWeight: 400,
      cornerRadius: 0,
      states: [openState(name, i, { fontWeight: 600, shadow: { x: 0, y: -3, blur: 0, spread: 0, color: l.button, inset: true } })],
    });
  //Each panel is a box with room round its words, so there is somewhere to put a picture or a button beside them, and so
  //the line a keyboard user sees round the panel in focus goes round that room rather than hugging the letters
  const panel = (i: number) =>
    createNode('frame', {
      name: `Panel ${i + 1}`,
      width,
      height: 62,
      fill: null,
      clip: false,
      layout: { ...defaultAutoLayout('column'), gap: SPACE.m, padding: pad(SPACE.l + SPACE.xs, SPACE.l), align: 'start', hugHeight: true },
      children: [createNode('text', { name: `Words ${i + 1}`, text: `What tab ${i + 1} is about.`, width: width - SPACE.l * 2, height: 22, fontSize: TYPE.body, lineHeight: 1.5, color: l.text, autoSize: 'height' })],
    }) as FrameNode;
  const panels = createNode('frame', {
    name: 'Panels',
    width,
    height: 120,
    fill: null,
    clip: true,
    layout: { ...defaultAutoLayout('column'), gap: 0, padding: pad(0), align: 'stretch', hugHeight: true, animate: { ...FOLD, enter: 'fade' } },
    children: [panel(0), panel(1), panel(2)],
  }) as FrameNode;
  //The tabs sit in a list of their own, which is what lets a screen reader say "tab list, 3 tabs" and the arrow keys move
  //along it; the panels sit under it. The list draws the hairline they stand on, and the chosen tab's line lies over it
  const list = createNode('frame', {
    name: 'Tab list',
    width,
    height: CONTROL_H,
    fill: null,
    shadow: { x: 0, y: -1, blur: 0, spread: 0, color: l.border, inset: true },
    clip: false,
    layout: { ...defaultAutoLayout('row'), gap: SPACE.xs, padding: pad(0), align: 'start', hugHeight: true },
    children: [tab(0), tab(1), tab(2)],
  }) as FrameNode;
  return createNode('frame', {
    name: 'Tabs',
    width,
    height: 164,
    fill: null,
    clip: false,
    layout: { ...defaultAutoLayout('column'), gap: 0, padding: pad(0), align: 'stretch', hugHeight: true, animate: { ...FOLD } },
    disclosure: { open: 'one', variable, panels: panels.id, tabs: list.id },
    children: [list, panels],
  }) as FrameNode;
}

/** Add a section to an accordion, copying the shape of the last one. */
export function addSection(d: Project, abId: string, frameId: string): void {
  const ab: Artboard | undefined = d.artboards.find((a) => a.id === abId);
  const frame = ab && find(ab.children, frameId);
  if (!frame || !('children' in frame) || !frame.disclosure) return;
  const kids = frame.children as FrameNode[];
  //The panels container isn't a section, so tabs copy a tab (into the tab list, or beside the panels in tabs made before
  //there was one) and add a panel beside the others
  if (frame.disclosure.panels) {
    const panels = kids.find((c) => c.id === frame.disclosure!.panels);
    const list = frame.disclosure.tabs ? kids.find((c) => c.id === frame.disclosure!.tabs) : undefined;
    const home = (list?.children as FrameNode[] | undefined) ?? kids;
    const tabs = home.filter((c) => c.id !== frame.disclosure!.panels);
    const last = tabs[tabs.length - 1];
    if (!last || !panels) return;
    const n = tabs.length + 1;
    const copy = JSON.parse(JSON.stringify(last)) as FrameNode;
    reid(copy);
    copy.name = `Tab ${n}`;
    (copy as unknown as { label: string }).label = `Tab ${n}`;
    renumber(copy, n - 1);
    if (list) home.push(copy);
    else home.splice(home.indexOf(panels), 0, copy);
    const lastPanel = (panels.children as FrameNode[])[panels.children.length - 1];
    if (lastPanel) {
      const p = JSON.parse(JSON.stringify(lastPanel)) as FrameNode;
      reid(p);
      p.name = `Panel ${n}`;
      panels.children.push(p);
    }
    return;
  }
  const last = kids[kids.length - 1];
  if (!last) return;
  const copy = JSON.parse(JSON.stringify(last)) as FrameNode;
  reid(copy);
  const n = kids.length + 1;
  copy.name = `Section ${n}`;
  if ('children' in copy && copy.children[0]) {
    copy.children[0].name = `Heading ${n}`;
    (copy.children[0] as unknown as { label?: string }).label = `Section ${n}`;
    renumber(copy.children[0] as FrameNode, n - 1);
  }
  kids.push(copy);
}

/** A copied header is the next one along, so its Open state asks about its own place rather than the one it was copied from. */
function renumber(header: { states?: { id: string; expr?: string }[] }, index: number): void {
  for (const st of header.states ?? []) {
    st.id = uid('st');
    if (st.expr) st.expr = st.expr.replace(/== \d+$/, `== ${index}`);
  }
}

/** Fresh ids through a copied subtree, so nothing shares one. */
function reid(n: { id: string; children?: { id: string }[] }): void {
  n.id = uid('n');
  for (const c of (n.children ?? []) as { id: string; children?: { id: string }[] }[]) reid(c);
}

function find(list: FrameNode['children'], id: string): FrameNode | null {
  for (const n of list) {
    if (n.id === id) return n as FrameNode;
    if ('children' in n && Array.isArray(n.children)) {
      const hit = find(n.children as FrameNode['children'], id);
      if (hit) return hit;
    }
  }
  return null;
}
