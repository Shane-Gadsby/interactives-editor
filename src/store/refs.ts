/**
 * Layer ids that other parts of a document hold: what a group lists for its draw order, the child a solo shows, the layer a
 * constraint follows, the bones a skin binds, and the keys of timelines on those properties. When a layer is replaced by
 * others (a group wraps it, an ungrouped group is released into its children) or leaves its parent, these have to follow, or
 * they are left naming a layer that is no longer there. (Deleting a layer cleans up its tracks; these are the same idea for the
 * references that group, ungroup and move can leave behind.) Pure helpers over a document draft.
 */
import { walk, type Artboard, type ContainerNode, type PathSkin, type SceneNode } from 'interactives-player';

/** A layer id and the ids that stand in for it where it was listed: none when it is just gone from there. */
export type Standins = ReadonlyMap<string, readonly string[]>;

/** `ids` with each replaced by its stand-ins, in place, and nothing listed twice. */
function swap(ids: readonly string[], standins: Standins): string[] {
  const out: string[] = [];
  for (const id of ids) for (const s of standins.get(id) ?? [id]) if (!out.includes(s)) out.push(s);
  return out;
}

/**
 * What a parent holds about its children, after some of them were replaced (`standins`): its draw order lists the stand-ins in
 * the same place (a group that wraps two layers takes the first one's place; an ungrouped group becomes its children, in order),
 * its solo shows the first stand-in (or nothing when there is none), and its `drawOrder` and `solo.active` keys on timelines
 * the same.
 */
export function retargetChildRefs(ab: Artboard, parent: ContainerNode | null, standins: Standins): void {
  if (!parent || !standins.size) return;
  if (Array.isArray(parent.drawOrder)) {
    const next = swap(parent.drawOrder, standins);
    if (next.length !== parent.drawOrder.length || next.some((id, i) => id !== parent.drawOrder![i])) parent.drawOrder = next;
  }
  const active = parent.solo?.active;
  if (active && standins.has(active)) parent.solo!.active = standins.get(active)![0] ?? null;
  for (const tl of ab.timelines) {
    for (const tr of tl.tracks) {
      if (tr.nodeId !== parent.id) continue;
      for (const k of tr.keys) {
        if (tr.prop === 'drawOrder' && Array.isArray(k.value)) k.value = swap(k.value as string[], standins) as typeof k.value;
        else if (tr.prop === 'solo.active' && typeof k.value === 'string' && standins.has(k.value)) k.value = (standins.get(k.value)![0] ?? '') as typeof k.value;
      }
    }
  }
}

/** The bones of a skin without the ones that are `gone`; weights that pulled on a removed bone leave the point where it is. */
function dropSkinBones(skin: PathSkin, gone: ReadonlySet<string>): void {
  if (!skin.bones.some((b) => gone.has(b.bone))) return;
  const next = new Map<number, number>();
  const kept: typeof skin.bones = [];
  skin.bones.forEach((b, i) => {
    if (gone.has(b.bone)) return;
    next.set(i, kept.length);
    kept.push(b);
  });
  skin.bones = kept;
  for (const sub of skin.weights ?? [])
    for (const v of sub ?? [])
      for (const list of [v?.w, v?.in, v?.out]) for (const inf of list ?? []) inf.b = inf.b < 0 ? -1 : (next.get(inf.b) ?? -1);
}

/**
 * Everything in the artboard that pointed at layers that no longer exist: constraints that followed one (the constraints after
 * it move up a place, and the timeline tracks on `constraints.<n>.…` go with them) and skin bones that were one.
 */
export function dropRefsToRemoved(ab: Artboard, gone: ReadonlySet<string>): void {
  if (!gone.size) return;
  walk(ab.children as SceneNode[], (n) => {
    const list = n.constraints;
    if (list?.some((c) => gone.has(c.target))) {
      const kept: number[] = [];
      list.forEach((c, i) => {
        if (!gone.has(c.target)) kept.push(i);
      });
      n.constraints = kept.map((i) => list[i]);
      for (const tl of ab.timelines) {
        tl.tracks = tl.tracks.filter((tr) => {
          const m = tr.nodeId === n.id ? /^constraints\.(\d+)(\..*)?$/.exec(tr.prop) : null;
          if (!m) return true;
          const at = kept.indexOf(Number(m[1]));
          if (at < 0) return false;
          tr.prop = `constraints.${at}${m[2] ?? ''}`;
          return true;
        });
      }
    }
    const skin = n.type === 'path' ? n.skin : n.type === 'image' ? n.mesh?.skin : null;
    if (skin) dropSkinBones(skin, gone);
  });
}
