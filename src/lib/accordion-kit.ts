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

  const frame = kind === 'tabs' ? tabStrip(l, width, v.id, v.name) : accordionFrame(l, width, v.id, v.name);
  frame.x = at.x;
  frame.y = at.y;
  ab.children.push(frame);
  return frame.id;
}

/** The look a header takes while its own section is the open one: a state, so nothing is bound and nothing is wired. */
const openState = (variable: string, index: number, props: Record<string, unknown>) => ({ id: uid('st'), name: 'Open', when: 'expr' as const, expr: `${variable} == ${index}`, props });

/**
 * Three sections stacked, each a header with its panel under it. One card with a border, a hairline between sections,
 * headings that read from the left like the text under them, and the open one tinted so you can see where you are.
 */
function accordionFrame(l: Record<string, string>, width: number, variable: string, name: string): FrameNode {
  const section = (i: number): FrameNode =>
    createNode('frame', {
      name: `Section ${i + 1}`,
      width,
      height: 96,
      fill: solid(l.surface),
      clip: false,
      layout: { ...defaultAutoLayout('column'), gap: 0, padding: pad(0), align: 'stretch', hugHeight: true },
      children: [
        createNode('button', {
          name: `Heading ${i + 1}`,
          label: `Section ${i + 1}`,
          width,
          height: CONTROL_H,
          fill: solid(l.surface),
          color: l.text,
          fontSize: TYPE.body,
          fontWeight: 600,
          align: 'left',
          cornerRadius: 0,
          states: [openState(name, i, { 'fill.color': l.surfaceMuted })],
        }),
        createNode('text', {
          name: `Panel ${i + 1}`,
          text: 'What this section is about.',
          width: width - SPACE.m * 2,
          height: 22,
          fontSize: TYPE.body,
          lineHeight: 1.45,
          color: l.text,
          autoSize: 'height',
          //room round the words, lined up with the heading's own
          layoutItem: { margin: pad(SPACE.m) },
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
    layout: { ...defaultAutoLayout('column'), gap: 1, padding: pad(0), align: 'stretch', hugHeight: true },
    disclosure: { open: 'one', variable, toggle: true },
    children: [section(0), section(1), section(2)],
  }) as FrameNode;
}

/**
 * A row of three tabs with the panels in a box under them. The tabs sit side by side and the panels wrap to the line
 * below; the tab that is showing takes the button colour, so it reads as the chosen one.
 */
function tabStrip(l: Record<string, string>, width: number, variable: string, name: string): FrameNode {
  const tabW = Math.floor(width / 3);
  const tab = (i: number) =>
    createNode('button', {
      name: `Tab ${i + 1}`,
      label: `Tab ${i + 1}`,
      width: tabW,
      height: CONTROL_H,
      fill: solid(l.surfaceMuted),
      color: l.text,
      fontSize: TYPE.body,
      fontWeight: 600,
      cornerRadius: 0,
      states: [openState(name, i, { 'fill.color': l.button, color: l.onButton })],
    });
  const panel = (i: number) =>
    createNode('text', { name: `Panel ${i + 1}`, text: `What tab ${i + 1} is about.`, x: SPACE.l, y: SPACE.l, width: width - SPACE.l * 2, height: 60, fontSize: TYPE.body, lineHeight: 1.45, color: l.text, autoSize: 'height' });
  const panels = createNode('frame', {
    name: 'Panels',
    width,
    height: 120,
    fill: solid(l.surface),
    children: [panel(0), panel(1), panel(2)],
  }) as FrameNode;
  return createNode('frame', {
    name: 'Tabs',
    width,
    height: 164,
    fill: solid(l.surface),
    stroke: { paint: solid(l.border), width: 1, align: 'inside' },
    cornerRadius: RADIUS.card,
    clip: true,
    //a row that wraps: the tabs share the first line and the panels, as wide as the frame, take the next
    layout: { ...defaultAutoLayout('row'), gap: 0, padding: pad(0), align: 'start', wrap: true, hugHeight: true },
    disclosure: { open: 'one', variable, panels: panels.id },
    children: [tab(0), tab(1), tab(2), panels],
  }) as FrameNode;
}

/** Add a section to an accordion, copying the shape of the last one. */
export function addSection(d: Project, abId: string, frameId: string): void {
  const ab: Artboard | undefined = d.artboards.find((a) => a.id === abId);
  const frame = ab && find(ab.children, frameId);
  if (!frame || !('children' in frame) || !frame.disclosure) return;
  const kids = frame.children as FrameNode[];
  //The panels container isn't a section, so a tab strip copies a tab and adds a panel beside the others
  if (frame.disclosure.panels) {
    const panels = kids.find((c) => c.id === frame.disclosure!.panels);
    const tabs = kids.filter((c) => c.id !== frame.disclosure!.panels);
    const last = tabs[tabs.length - 1];
    if (!last || !panels) return;
    const n = tabs.length + 1;
    const copy = JSON.parse(JSON.stringify(last)) as FrameNode;
    reid(copy);
    copy.name = `Tab ${n}`;
    (copy as unknown as { label: string }).label = `Tab ${n}`;
    renumber(copy, n - 1);
    kids.splice(kids.indexOf(panels), 0, copy);
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
