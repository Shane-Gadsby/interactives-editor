/**
 * Tidy up an interaction graph: a layered layout (the kind flow charts use). Pure, so it's testable without a canvas.
 *
 * 1. Each separate chain of connected nodes is laid out on its own, and the chains are stacked top to bottom.
 * 2. Columns: a node goes one column right of the furthest node that leads into it (events, with nothing coming in,
 *    are column 0). A connection that loops back to an earlier node doesn't count, so loops don't stretch the layout.
 * 3. Order within a column: a few passes, each putting a node at the average position of what connects to it (from the
 *    left, then from the right). That's what keeps connections from crossing. A node's outputs keep their port order.
 * 4. Positions: columns as wide as their widest node plus a gap, nodes stacked with a gap, each column centred on the
 *    nodes it connects to where there's room.
 * 5. Groups: a group is resized to fit the nodes that were in it, with room for its title.
 */

export interface TidyNode {
  id: string;
  width: number;
  height: number;
  /** Where it is now (used to keep the graph where it was, and the order of nodes nothing connects). */
  x: number;
  y: number;
}
export interface TidyEdge {
  from: string;
  to: string;
  /** Output port order on the source node (0 for the first). */
  port?: number;
}
export interface TidyGroup {
  id: string;
  /** The nodes in it. */
  members: string[];
}

export const TIDY = { colGap: 90, rowGap: 28, chainGap: 70, groupPad: 24, groupTitle: 40 };

export function tidyGraph(
  nodes: TidyNode[],
  edges: TidyEdge[],
  groups: TidyGroup[] = [],
): { positions: Map<string, { x: number; y: number }>; groups: Map<string, { x: number; y: number; width: number; height: number }> } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const valid = edges.filter((e) => byId.has(e.from) && byId.has(e.to) && e.from !== e.to);
  const outs = new Map<string, TidyEdge[]>();
  const ins = new Map<string, TidyEdge[]>();
  for (const n of nodes) {
    outs.set(n.id, []);
    ins.set(n.id, []);
  }
  for (const e of valid) {
    outs.get(e.from)!.push(e);
    ins.get(e.to)!.push(e);
  }
  for (const list of outs.values()) list.sort((a, b) => (a.port ?? 0) - (b.port ?? 0));

  // 1. chains (weakly connected), in the order they sit now, top to bottom
  const chainOf = new Map<string, number>();
  const chains: string[][] = [];
  for (const n of [...nodes].sort((a, b) => a.y - b.y || a.x - b.x)) {
    if (chainOf.has(n.id)) continue;
    const list: string[] = [];
    const stack = [n.id];
    chainOf.set(n.id, chains.length);
    while (stack.length) {
      const id = stack.pop()!;
      list.push(id);
      for (const e of [...outs.get(id)!, ...ins.get(id)!]) {
        const other = e.from === id ? e.to : e.from;
        if (!chainOf.has(other)) {
          chainOf.set(other, chains.length);
          stack.push(other);
        }
      }
    }
    chains.push(list);
  }

  // which group each node is in (its first), so a column leaves room for a group's title and padding around its nodes
  const groupOf = new Map<string, string>();
  for (const g of groups) for (const id of g.members) if (!groupOf.has(id)) groupOf.set(id, g.id);
  const positions = new Map<string, { x: number; y: number }>();
  const left = nodes.length ? Math.min(...nodes.map((n) => n.x)) : 0;
  let top = nodes.length ? Math.min(...nodes.map((n) => n.y)) : 0;

  for (const chain of chains) {
    const members = new Set(chain);
    // 2. back edges, from a depth-first walk starting at the nodes nothing leads into (events), then the rest
    const back = new Set<TidyEdge>();
    const state = new Map<string, 1 | 2>();
    const starts = [...chain.filter((id) => !ins.get(id)!.length), ...chain];
    const visit = (id: string) => {
      state.set(id, 1);
      for (const e of outs.get(id)!) {
        if (!members.has(e.to)) continue;
        const st = state.get(e.to);
        if (st === 1) back.add(e);
        else if (!st) visit(e.to);
      }
      state.set(id, 2);
    };
    for (const id of starts) if (!state.has(id)) visit(id);
    const fwdIn = (id: string) => ins.get(id)!.filter((e) => !back.has(e));
    const fwdOut = (id: string) => outs.get(id)!.filter((e) => !back.has(e));
    // longest path from the sources
    const col = new Map<string, number>();
    const colOf = (id: string, seen = new Set<string>()): number => {
      if (col.has(id)) return col.get(id)!;
      if (seen.has(id)) return 0;
      seen.add(id);
      const c = fwdIn(id).reduce((m, e) => Math.max(m, colOf(e.from, seen) + 1), 0);
      col.set(id, c);
      return c;
    };
    for (const id of chain) colOf(id);
    const columns: string[][] = [];
    for (const id of chain) (columns[col.get(id)!] ??= []).push(id);
    for (const c of columns) c?.sort((a, b) => byId.get(a)!.y - byId.get(b)!.y);

    // 3. order: barycentre sweeps
    const rank = new Map<string, number>();
    const reRank = () => columns.forEach((c) => c?.forEach((id, i) => rank.set(id, i)));
    reRank();
    const portRank = (e: TidyEdge) => rank.get(e.from)! + (e.port ?? 0) * 0.01;
    for (let pass = 0; pass < 6; pass++) {
      for (let c = 1; c < columns.length; c++) {
        const list = columns[c];
        if (!list) continue;
        const key = new Map(list.map((id) => {
          const from = fwdIn(id);
          return [id, from.length ? from.reduce((s, e) => s + portRank(e), 0) / from.length : rank.get(id)!];
        }));
        list.sort((a, b) => key.get(a)! - key.get(b)!);
        list.forEach((id, i) => rank.set(id, i));
      }
      for (let c = columns.length - 2; c >= 0; c--) {
        const list = columns[c];
        if (!list) continue;
        const key = new Map(list.map((id) => {
          const to = fwdOut(id);
          return [id, to.length ? to.reduce((s, e) => s + rank.get(e.to)!, 0) / to.length : rank.get(id)!];
        }));
        list.sort((a, b) => key.get(a)! - key.get(b)!);
        list.forEach((id, i) => rank.set(id, i));
      }
    }

    // 4. coordinates: x by column, y stacked, then nudged toward what feeds each node without overlapping
    let x = left;
    const yOf = new Map<string, number>();
    let bottom = top;
    columns.forEach((list) => {
      if (!list) return;
      const w = Math.max(...list.map((id) => byId.get(id)!.width));
      let y = top;
      let prevGroup: string | undefined;
      // a column's nodes in the same group sit together (at their average place), so its frame covers only them
      const mean = new Map<string, number>();
      for (const id of list) {
        const g = groupOf.get(id);
        if (!g || mean.has(g)) continue;
        const inG = list.filter((x) => groupOf.get(x) === g);
        mean.set(g, inG.reduce((sum, x) => sum + rank.get(x)!, 0) / inG.length);
      }
      const key = (id: string) => {
        const g = groupOf.get(id);
        return g ? mean.get(g)! + rank.get(id)! * 1e-3 : rank.get(id)!;
      };
      list.sort((a, b) => key(a) - key(b));
      for (const id of list) {
        const g = groupOf.get(id);
        if (g !== prevGroup) {
          if (prevGroup) y += TIDY.groupPad;
          if (g) y += TIDY.groupTitle;
          prevGroup = g;
        }
        // wants to sit level with the average of its inputs
        const from = fwdIn(id).filter((e) => yOf.has(e.from));
        const want = from.length ? from.reduce((s, e) => s + yOf.get(e.from)! + byId.get(e.from)!.height / 2, 0) / from.length - byId.get(id)!.height / 2 : y;
        const at = Math.max(y, Math.round(want));
        yOf.set(id, at);
        positions.set(id, { x: Math.round(x), y: at });
        y = at + byId.get(id)!.height + TIDY.rowGap;
      }
      bottom = Math.max(bottom, y - TIDY.rowGap);
      x += w + TIDY.colGap;
    });
    top = bottom + TIDY.chainGap;
  }

  // 5. groups fit their members
  const out = new Map<string, { x: number; y: number; width: number; height: number }>();
  for (const g of groups) {
    const pts = g.members.filter((id) => positions.has(id));
    if (!pts.length) continue;
    const x0 = Math.min(...pts.map((id) => positions.get(id)!.x));
    const y0 = Math.min(...pts.map((id) => positions.get(id)!.y));
    const x1 = Math.max(...pts.map((id) => positions.get(id)!.x + byId.get(id)!.width));
    const y1 = Math.max(...pts.map((id) => positions.get(id)!.y + byId.get(id)!.height));
    out.set(g.id, { x: x0 - TIDY.groupPad, y: y0 - TIDY.groupTitle, width: x1 - x0 + TIDY.groupPad * 2, height: y1 - y0 + TIDY.groupTitle + TIDY.groupPad });
  }
  return { positions, groups: out };
}

/** How many pairs of connections cross, with nodes at these positions (for the tests, and to check a tidy helped). */
export function crossings(nodes: TidyNode[], edges: TidyEdge[], at: Map<string, { x: number; y: number }>): number {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seg = (e: TidyEdge) => {
    const a = byId.get(e.from)!;
    const b = byId.get(e.to)!;
    const pa = at.get(a.id) ?? a;
    const pb = at.get(b.id) ?? b;
    return [pa.x + a.width, pa.y + a.height / 2, pb.x, pb.y + b.height / 2] as const;
  };
  const cross = (p: readonly number[], q: readonly number[]) => {
    const d = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const d1 = d(q[0], q[1], q[2], q[3], p[0], p[1]);
    const d2 = d(q[0], q[1], q[2], q[3], p[2], p[3]);
    const d3 = d(p[0], p[1], p[2], p[3], q[0], q[1]);
    const d4 = d(p[0], p[1], p[2], p[3], q[2], q[3]);
    return d1 * d2 < 0 && d3 * d4 < 0;
  };
  const list = edges.filter((e) => byId.has(e.from) && byId.has(e.to)).map(seg);
  let n = 0;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (cross(list[i], list[j])) n++;
  return n;
}
