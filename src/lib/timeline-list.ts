import { walk, type Artboard, type Project, type SceneNode, type Timeline } from 'interactives-player';
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
