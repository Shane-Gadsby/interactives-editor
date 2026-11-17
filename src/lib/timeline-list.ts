import { animatableProp, walk, type Artboard, type Project, type SceneNode, type Timeline } from 'interactives-player';
import type { UsageReport } from './dependencies';

/** What the Timeline's side list shows for one timeline. Pure, so the rules are tested without a screen. */
export interface TimelineRow {
  id: string;
  name: string;
  duration: number;
  loop: Timeline['loop'];
  /** Layers with at least one track on it, in layer order. */
  layers: { id: string; name: string }[];
  keyCount: number;
  /** Things that start it (an interaction, a joystick, a blend, its own autoplay), said as "Name (what it does)". */
  playedBy: string[];
  /** Nothing plays it. */
  idle: boolean;
  /** Properties it animates that another timeline on the page animates too: if both play at once, the one further down the list wins. */
  clashes: TimelineClash[];
}

/** One other timeline that animates the same properties of the same layers, said as "Box X". */
export interface TimelineClash {
  /** The other timeline. */
  other: string;
  /** The layer and property, readable ("Box X", "Title Opacity"). */
  props: string[];
}

/** For each timeline, the other timelines that animate the same property of the same layer. Pure. */
export function timelineClashes(ab: Artboard): Map<string, TimelineClash[]> {
  const nodes = new Map<string, SceneNode>();
  walk(ab.children, (n: SceneNode) => void nodes.set(n.id, n));
  const out = new Map<string, TimelineClash[]>();
  for (const t of ab.timelines) {
    const mine = new Set(t.tracks.filter((tr) => tr.keys.length && !tr.dip).map((tr) => `${tr.nodeId}\u0000${tr.prop}`));
    const list: TimelineClash[] = [];
    for (const o of ab.timelines) {
      if (o === t) continue;
      const props: string[] = [];
      for (const tr of o.tracks) {
        if (!tr.keys.length || tr.dip || !mine.has(`${tr.nodeId}\u0000${tr.prop}`)) continue;
        const node = nodes.get(tr.nodeId);
        const name = `${node?.name ?? 'A layer'} ${animatableProp(tr.prop, node)?.label ?? tr.prop}`;
        if (!props.includes(name)) props.push(name);
      }
      if (props.length) list.push({ other: o.name, props });
    }
    out.set(t.id, list);
  }
  return out;
}

export const LOOP_LABEL: Record<Timeline['loop'], string> = { once: 'Play once', loop: 'Loop', pingpong: 'Ping-pong' };

/** 1200 -> "1.2 s", 800 -> "800 ms". */
export function lengthLabel(ms: number): string {
  return ms >= 1000 ? `${+(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`;
}

export function timelineRows(ab: Artboard, usage?: UsageReport): TimelineRow[] {
  const names = new Map<string, string>();
  const order: string[] = [];
  walk(ab.children, (n: SceneNode) => {
    names.set(n.id, n.name);
    order.push(n.id);
  });
  const used = new Map((usage?.timelines ?? []).map((u) => [u.id, u]));
  const clashes = timelineClashes(ab);
  return ab.timelines.map((t) => {
    const ids = new Set(t.tracks.map((tr) => tr.nodeId));
    const layers = order.filter((id) => ids.has(id)).map((id) => ({ id, name: names.get(id) ?? id }));
    const u = used.get(t.id);
    return {
      id: t.id,
      name: t.name,
      duration: t.duration,
      loop: t.loop,
      layers,
      keyCount: t.tracks.reduce((n, tr) => n + tr.keys.length, 0),
      playedBy: (u?.usedBy ?? []).map((x) => (x.how === 'autoplays' ? 'itself (autoplay)' : x.by.name === x.how ? x.by.name : `${x.by.name} (${x.how})`)),
      // with no report to go on we don't claim anything is idle
      idle: !!u && u.usedBy.length === 0,
      clashes: clashes.get(t.id) ?? [],
    };
  });
}

/** The ways a component is usually in (a button at rest, with the pointer over it, being pressed), and the words a timeline for each is usually named with. */
export const COMMON_STATES: { label: string; words: string[] }[] = [
  { label: 'Idle', words: ['idle', 'rest', 'resting', 'default', 'normal'] },
  { label: 'Hover', words: ['hover', 'over', 'enter'] },
  { label: 'Pressed', words: ['pressed', 'press', 'click', 'clicked', 'down', 'active'] },
];

/** An artboard that other artboards place as a layer (a component). */
export function isComponent(project: Project, ab: Artboard): boolean {
  for (const other of project.artboards) {
    if (other.id === ab.id) continue;
    let found = false;
    walk(other.children, (n: SceneNode) => {
      if (n.type === 'instance' && n.artboardId === ab.id) found = true;
    });
    if (found) return true;
  }
  return false;
}

const wordsOf = (name: string) => name.toLowerCase().split(/[^a-z]+/).filter(Boolean);

/** The common states a component has no timeline for yet, or null when the artboard is not a component. */
export function missingStates(project: Project, ab: Artboard): string[] | null {
  if (!isComponent(project, ab)) return null;
  const have = new Set(ab.timelines.flatMap((t) => wordsOf(t.name)));
  return COMMON_STATES.filter((s) => !s.words.some((w) => have.has(w))).map((s) => s.label);
}
