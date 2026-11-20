import { indentOf, newLineId, type Story, type StoryChapter } from 'interactives-player';

/**
 * A chapter as a map of nodes and arrows, worked out from its lines every time (nothing is stored twice). Each node stands
 * for a run of lines in the chapter, so editing, joining or deleting a node edits those lines and the script follows.
 *
 *   lines   a scene (with its # title) or a run of lines between choices, ending where it jumps, ends or comes to a choice
 *   menu    a group of ? choices, one way out each
 *   if      if / else if / else, one way out each (and "otherwise" when there's no else)
 *   end     an ending (-> end Name), one node per name
 *   next    the chapter runs on into the next one, or jumps to another chapter
 */

export type MapNodeKind = 'lines' | 'menu' | 'if' | 'end' | 'next';

export interface MapPort {
  /** The line the way out starts at (the ? line, the if line). */
  line: string;
  label: string;
  /** Lines from..to (inclusive) of its body, indented under it. */
  from: number;
  to: number;
  /** Where its body jumps, if it does (`-> X` as the last thing in it). */
  jump?: string;
}

export interface MapNode {
  /** The first line's id, so a node keeps its id (and its place on the map) while it's edited. */
  id: string;
  kind: MapNodeKind;
  title: string;
  /** Lines from..to (inclusive) in the chapter. Absent for end and next, which are made up. */
  from?: number;
  to?: number;
  /** A few of its lines, for reading on the map. */
  preview: string[];
  /** How many lines say something in it. */
  lines: number;
  ports: MapPort[];
  /** Nothing leads here from the start of the chapter. */
  unreached?: boolean;
  /** Where its own run jumps, for a lines node that ends in `-> X`. */
  jump?: string;
}

export interface MapEdge {
  id: string;
  from: string;
  /** Which way out, for a menu or an if (its port's line id); absent for a lines node. */
  port?: string;
  to: string;
  label?: string;
}

const isBlank = (t: string) => !t.trim() || t.trim().startsWith('//');
const body = (t: string) => t.trim();

/** Where `-> X` (or `-> end X`) goes, as a node id: a scene, an ending or another chapter. */
function target(jump: string, scenes: Map<string, string>, chapters: Set<string>): string {
  const end = /^end(?:\s+(.*))?$/i.exec(jump.trim());
  if (end) return `end:${(end[1] ?? '').trim().toLowerCase()}`;
  const key = jump.trim().toLowerCase();
  if (scenes.has(key)) return scenes.get(key)!;
  return chapters.has(key) ? `next:${key}` : `missing:${key}`;
}

export function storyMap(chapter: StoryChapter, story: Story): { nodes: MapNode[]; edges: MapEdge[] } {
  const L = chapter.lines;
  const nodes: MapNode[] = [];
  let cur: MapNode | null = null;
  const close = () => {
    cur = null;
  };
  const say = (t: string) => {
    const b = body(t);
    return b.startsWith('[') || /^set\s/i.test(b) || b.startsWith('#') ? null : b;
  };
  let i = 0;
  // the body of a choice or an if: the lines after `at` that are deeper than depth 0
  const bodyOf = (at: number) => {
    let j = at + 1;
    let last = at;
    while (j < L.length && (isBlank(L[j].text) || indentOf(L[j].text) > 0)) {
      if (!isBlank(L[j].text)) last = j;
      j++;
    }
    let jump: string | undefined;
    for (let k = last; k > at; k--) {
      if (isBlank(L[k].text)) continue;
      const b = body(L[k].text);
      if (b.startsWith('->') && indentOf(L[k].text) === 1) jump = b.slice(2).trim();
      break;
    }
    return { from: at + 1, to: last, next: j, jump };
  };
  while (i < L.length) {
    const t = L[i].text;
    if (isBlank(t) || indentOf(t) > 0) {
      if (cur) (cur as MapNode).to = i;
      i++;
      continue;
    }
    const b = body(t);
    if (b.startsWith('?')) {
      close();
      const menu: MapNode = { id: L[i].id, kind: 'menu', title: 'Choice', from: i, to: i, preview: [], lines: 0, ports: [] };
      while (i < L.length && indentOf(L[i].text) === 0 && body(L[i].text).startsWith('?')) {
        const bo = bodyOf(i);
        // the words, with [once] and [if ...] said after them in plain words
        let label = body(L[i].text).slice(1).trim();
        const flags: string[] = [];
        for (let m = /\s*\[([^\[\]]*)\]\s*$/.exec(label); m; m = /\s*\[([^\[\]]*)\]\s*$/.exec(label)) {
          flags.unshift(m[1].trim());
          label = label.slice(0, m.index).trim();
        }
        if (flags.length) label = `${label} (${flags.join(', ')})`;
        menu.ports.push({ line: L[i].id, label, from: bo.from, to: bo.to, jump: bo.jump });
        menu.to = bo.to;
        menu.lines += L.slice(bo.from, bo.to + 1).filter((l) => !isBlank(l.text) && say(l.text) !== null && !body(l.text).startsWith('->')).length;
        i = bo.next;
        // blank lines between choices stay in the group
        let k = i;
        while (k < L.length && isBlank(L[k].text)) k++;
        if (k < L.length && indentOf(L[k].text) === 0 && body(L[k].text).startsWith('?')) i = k;
      }
      menu.preview = menu.ports.map((p) => p.label);
      nodes.push(menu);
      continue;
    }
    if (/^if\s/i.test(b)) {
      close();
      const node: MapNode = { id: L[i].id, kind: 'if', title: 'If', from: i, to: i, preview: [], lines: 0, ports: [] };
      let first = true;
      while (i < L.length && indentOf(L[i].text) === 0) {
        const bb = body(L[i].text);
        const isIf = first ? /^if\s/i.test(bb) : /^else\s+if\s/i.test(bb);
        const isElse = !first && /^else\s*:?$/i.test(bb);
        if (!isIf && !isElse) break;
        const bo = bodyOf(i);
        node.ports.push({ line: L[i].id, label: isElse ? 'else' : bb.replace(/^(else\s+)?if\s+/i, '').replace(/:$/, ''), from: bo.from, to: bo.to, jump: bo.jump });
        node.to = bo.to;
        i = bo.next;
        first = false;
        if (isElse) break;
      }
      node.preview = node.ports.map((p) => (p.label === 'else' ? 'otherwise' : `if ${p.label}`));
      nodes.push(node);
      continue;
    }
    if (b.startsWith('#') || !cur) {
      close();
      cur = { id: L[i].id, kind: 'lines', title: b.startsWith('#') ? b.replace(/^#+/, '').trim() : nodes.length ? 'Lines' : 'Start', from: i, to: i, preview: [], lines: 0, ports: [] };
      nodes.push(cur);
    }
    const node = cur as MapNode;
    node.to = i;
    if (b.startsWith('->')) {
      node.jump = b.slice(2).trim();
      close();
    } else if (!b.startsWith('#')) {
      const s = say(t);
      if (s !== null) {
        node.lines++;
        if (node.preview.length < 3) node.preview.push(s.length > 70 ? `${s.slice(0, 69)}…` : s);
      }
    }
    i++;
  }

  const scenes = new Map<string, string>();
  for (const n of nodes) if (n.kind === 'lines' && n.from !== undefined && body(L[n.from].text).startsWith('#')) scenes.set(n.title.toLowerCase(), n.id);
  const chapters = new Set(story.chapters.filter((c) => c.id !== chapter.id).map((c) => c.name.trim().toLowerCase()));
  const extra = new Map<string, MapNode>();
  const edges: MapEdge[] = [];
  const at = chapter.id;
  const nextId = (idx: number) => nodes[idx + 1]?.id ?? `next:${at}`;
  const link = (from: string, to: string, port?: string, label?: string) => {
    if (to.startsWith('end:') && !extra.has(to)) {
      const name = to.slice(4);
      extra.set(to, { id: to, kind: 'end', title: name ? `End: ${name}` : 'The end', preview: [], lines: 0, ports: [] });
    }
    if (to.startsWith('next:') && !extra.has(to)) {
      const key = to.slice(5);
      const idx = story.chapters.findIndex((c) => c.id === chapter.id);
      const name = key === at ? story.chapters[idx + 1]?.name : story.chapters.find((c) => c.name.trim().toLowerCase() === key)?.name;
      extra.set(to, { id: to, kind: name || key !== at ? 'next' : 'end', title: name ? `Chapter: ${name}` : key === at ? 'The end' : `Chapter: ${key}`, preview: [], lines: 0, ports: [] });
    }
    if (to.startsWith('missing:') && !extra.has(to)) extra.set(to, { id: to, kind: 'next', title: `Missing: ${to.slice(8)}`, preview: [], lines: 0, ports: [] });
    edges.push({ id: `${from}>${port ?? ''}>${to}`, from, port, to, label });
  };
  nodes.forEach((n, idx) => {
    if (n.kind === 'lines') link(n.id, n.jump ? target(n.jump, scenes, chapters) : nextId(idx));
    else {
      for (const p of n.ports) link(n.id, p.jump ? target(p.jump, scenes, chapters) : nextId(idx), p.line);
      if (n.kind === 'if' && !n.ports.some((p) => p.label === 'else')) link(n.id, nextId(idx), `${n.id}:otherwise`, 'otherwise');
    }
  });
  const all = [...nodes, ...extra.values()];
  // what the start of the chapter leads to; anything else is only reached by a jump from another chapter, if at all
  const seen = new Set<string>(all.length ? [all[0].id] : []);
  for (const id of seen) for (const e of edges) if (e.from === id) seen.add(e.to);
  for (const n of all) if (!seen.has(n.id)) n.unreached = true;
  return { nodes: all, edges };
}

/** Where each node goes when nobody has placed it: columns by how many steps from the start, rows in order. */
export function layoutMap(nodes: MapNode[], edges: MapEdge[], placed: Record<string, { x: number; y: number }> = {}): Map<string, { x: number; y: number }> {
  const depth = new Map<string, number>();
  if (nodes.length) depth.set(nodes[0].id, 0);
  for (let pass = 0; pass < nodes.length; pass++) {
    let moved = false;
    for (const e of edges) {
      const d = depth.get(e.from);
      if (d === undefined) continue;
      // forward only: a jump back up the chapter doesn't push its target further right
      const fromIdx = nodes.findIndex((n) => n.id === e.from);
      const toIdx = nodes.findIndex((n) => n.id === e.to);
      if (toIdx >= 0 && toIdx <= fromIdx) continue;
      if ((depth.get(e.to) ?? -1) < d + 1) {
        depth.set(e.to, d + 1);
        moved = true;
      }
    }
    if (!moved) break;
  }
  const rows = new Map<number, number>();
  const out = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    const d = depth.get(n.id) ?? 0;
    const r = rows.get(d) ?? 0;
    rows.set(d, r + 1);
    out.set(n.id, placed[n.id] ?? { x: d * 320, y: r * 190 });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Edits from the map, as new lines for the chapter (the panel matches them to the old ones, so ids stay)

type Lines = StoryChapter['lines'];
const line = (text: string, taken: Set<string>) => {
  const id = newLineId(taken);
  taken.add(id);
  return { id, text };
};

/** Make `from` (a lines node, or one way out of a menu or an if) go to the scene called `title`, replacing any jump it had. */
export function joinTo(lines: Lines, node: MapNode, port: string | undefined, title: string): Lines {
  const taken = new Set(lines.map((l) => l.id));
  const out = [...lines];
  const jump = /^end(\s|$)/i.test(title) ? `-> ${title}` : `-> ${title}`;
  if (node.kind === 'lines' && node.to !== undefined) {
    // the node's own last line, if it's a jump, is replaced; otherwise the jump goes after it
    let last = node.to;
    while (last > (node.from ?? 0) && isBlank(out[last].text)) last--;
    if (body(out[last].text).startsWith('->')) out[last] = { ...out[last], text: jump };
    else out.splice(last + 1, 0, line(jump, taken));
    return out;
  }
  const p = node.ports.find((x) => x.line === port);
  if (!p) return out;
  if (p.jump !== undefined) {
    for (let k = p.to; k >= p.from; k--) {
      if (body(out[k].text).startsWith('->')) {
        out[k] = { ...out[k], text: `    ${jump}` };
        return out;
      }
    }
  }
  const after = p.to >= p.from ? p.to : lines.findIndex((l) => l.id === p.line);
  out.splice(after + 1, 0, line(`    ${jump}`, taken));
  return out;
}

/** Take a node's lines out of the chapter. */
export function removeNode(lines: Lines, node: MapNode): Lines {
  if (node.from === undefined || node.to === undefined) return lines;
  return [...lines.slice(0, node.from), ...lines.slice(node.to + 1)];
}

/** Put new lines in after a node (a new scene, a new choice), or at the end. */
export function insertAfter(lines: Lines, node: MapNode | null, texts: string[]): Lines {
  const taken = new Set(lines.map((l) => l.id));
  const at = node?.to !== undefined ? node.to + 1 : lines.length;
  return [...lines.slice(0, at), ...texts.map((t) => line(t, taken)), ...lines.slice(at)];
}

/** A scene title nobody has used yet. */
export function newSceneTitle(lines: Lines): string {
  const used = new Set(lines.filter((l) => body(l.text).startsWith('#')).map((l) => body(l.text).replace(/^#+/, '').trim().toLowerCase()));
  for (let n = 1; ; n++) if (!used.has(`new scene${n > 1 ? ` ${n}` : ''}`)) return `New scene${n > 1 ? ` ${n}` : ''}`;
}
