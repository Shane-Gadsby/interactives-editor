//Add accordion: a frame with three sections, each a header and a panel, and the number variable that holds what's open.
//The frame carries `disclosure`, so the clicking and the showing are the frame's own job: no interaction nodes at all.
//Pure functions over a project draft (see store.update).
import { createNode, defaultAutoLayout, uid, type Artboard, type FrameNode, type Project, type Variable } from 'interactives-player';
import { lookFor } from './themes';

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

  const frame = kind === 'tabs' ? tabStrip(l, width, v.id) : accordionFrame(l, width, v.id);
  frame.x = at.x;
  frame.y = at.y;
  ab.children.push(frame);
  return frame.id;
}

/** Three sections stacked, each a header with its panel under it. */
function accordionFrame(l: Record<string, string>, width: number, variable: string): FrameNode {
  const section = (i: number): FrameNode =>
    createNode('frame', {
      name: `Section ${i + 1}`,
      width,
      height: 96,
      fill: null,
      layout: { ...defaultAutoLayout('column'), gap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, align: 'stretch', hugHeight: true },
      children: [
        createNode('button', { name: `Heading ${i + 1}`, label: `Section ${i + 1}`, width, height: 44, fill: solid(l.surfaceMuted), color: l.text, cornerRadius: 0 }),
        createNode('text', {
          name: `Panel ${i + 1}`,
          text: 'What this section is about.',
          width,
          height: 52,
          fontSize: 15,
          color: l.text,
          autoSize: 'height',
        }),
      ],
    }) as FrameNode;
  return createNode('frame', {
    name: 'Accordion',
    width,
    height: 300,
    fill: solid(l.surface),
    stroke: { paint: solid(l.border), width: 1, align: 'inside' },
    cornerRadius: 8,
    clip: true,
    layout: { ...defaultAutoLayout('column'), gap: 1, padding: { top: 0, right: 0, bottom: 0, left: 0 }, align: 'stretch', hugHeight: true },
    disclosure: { open: 'one', variable, toggle: true },
    children: [section(0), section(1), section(2)],
  }) as FrameNode;
}

/** A row of three tabs, with the panels in a box under them. */
function tabStrip(l: Record<string, string>, width: number, variable: string): FrameNode {
  const tab = (i: number) => createNode('button', { name: `Tab ${i + 1}`, label: `Tab ${i + 1}`, width: Math.round(width / 3), height: 40, fill: solid(l.surfaceMuted), color: l.text, cornerRadius: 0 });
  const panel = (i: number) =>
    createNode('text', { name: `Panel ${i + 1}`, text: `What tab ${i + 1} is about.`, x: 12, y: 12, width: width - 24, height: 60, fontSize: 15, color: l.text, autoSize: 'height' });
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
    height: 160,
    fill: null,
    layout: { ...defaultAutoLayout('column'), gap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, align: 'stretch', hugHeight: true },
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
  }
  kids.push(copy);
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
