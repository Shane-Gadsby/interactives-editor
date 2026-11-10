//Shared bits for the Design and advanced tutorials' examples (responsive, accessible, brand): layers made the way the canvas
//tools make them, and a responsive variant made the way Add narrow variant makes one. No `example` here, so the kit skips it.
import { cloneWithNewIds, createNode, relayoutTree, uid, type Artboard, type NodeType, type Project, type SceneNode, type Timeline } from 'interactives-player';
import { writeClickFlow } from '../../src/lib/click-flow';
import { lookDefaults } from '../../src/lib/themes';
import { variantPlan } from '../../src/lib/variants-edit';

/** A layer as the tool draws it in this project: the type's defaults, on the project's starter tokens. */
export function drawn<T extends NodeType>(p: Project, type: T, partial: Partial<Extract<SceneNode, { type: T }>> = {}): Extract<SceneNode, { type: T }> {
  return createNode(type, { ...lookDefaults(p, type), ...partial } as Partial<Extract<SceneNode, { type: T }>>);
}

/** A token reference by the token's name (`color/surface`), the way the colour picker's Tokens tab sets it. */
export function token(p: Project, name: string): string {
  const t = p.themes?.tokens.find((x) => x.name === name);
  if (!t) throw new Error(`no token called ${name}`);
  return `token:${t.id}`;
}

/** Add narrow variant (or Add wide variant): a copy of the artboard with fresh ids, sized and given breakpoints as the store does. */
export function addVariant(p: Project, src: Artboard, side: 'narrower' | 'wider' = 'narrower'): Artboard {
  const plan = variantPlan([src], side);
  const idMap = new Map<string, string>();
  const copy: Artboard = {
    ...structuredClone(src),
    id: uid('ab'),
    name: `${src.name} ${side === 'narrower' ? 'narrow' : 'wide'}`,
    children: src.children.map((c) => cloneWithNewIds(structuredClone(c), idMap)),
    width: plan.width,
    height: plan.height,
    minWidth: plan.minWidth,
    variantOf: src.id,
    canvasX: src.canvasX + src.width + 100,
    canvasY: src.canvasY,
  };
  for (const tl of copy.timelines) for (const tr of tl.tracks) tr.nodeId = idMap.get(tr.nodeId) ?? tr.nodeId;
  if (plan.edgeMinWidth !== undefined) src.minWidth = plan.edgeMinWidth;
  p.artboards.push(copy);
  return copy;
}

/** Lay out every artboard's auto-layout frames, as the editor does after each change. */
export function relayout(p: Project): void {
  for (const ab of p.artboards) relayoutTree(ab.children);
}

/** A layer anywhere on an artboard, by name. */
export function byName(ab: Artboard, name: string): SceneNode {
  let hit: SceneNode | undefined;
  const look = (list: SceneNode[]) => {
    for (const n of list) {
      if (hit) return;
      if (n.name === name) hit = n;
      else if ('children' in n) look(n.children);
    }
  };
  look(ab.children);
  if (!hit) throw new Error(`no layer called ${name} on ${ab.name}`);
  return hit;
}

/**
 * "+ When clicked…" then **Show a layer**: the same two nodes the Interactions section writes (src/lib/recipes.ts, which this
 * can't import: it pulls in the browser's asset store), and the layer shown starts hidden, as that recipe makes it.
 */
export function whenClickedShow(ab: Artboard, layerId: string, show: SceneNode): void {
  writeClickFlow(ab, layerId, [{ kind: 'action.visibility', params: { target: show.id, op: 'show' } }]);
  show.visible = false;
}

/** + New timeline, as the Timeline tab makes it, with the given tracks (each a layer, a property and its keys as [ms, value]). */
export function timeline(ab: Artboard, name: string, settings: Partial<Timeline>, tracks: { nodeId: string; prop: string; keys: [number, number | string][] }[]): Timeline {
  const tl: Timeline = {
    id: uid('tl'),
    name,
    duration: 1000,
    loop: 'once',
    autoplay: false,
    speed: 1,
    ...settings,
    tracks: tracks.map((t) => ({ id: uid('tr'), nodeId: t.nodeId, prop: t.prop, keys: t.keys.map(([at, value]) => ({ id: uid('k'), t: at, value, ease: 'linear' as const })) })),
  };
  ab.timelines.push(tl);
  return tl;
}

/** A small picture kept in the project (an SVG drawn here), so an example has a real image layer without shipping a photo. */
export function svgAsset(p: Project, name: string, svg: string): string {
  const id = uid('as');
  p.assets.push({ id, name, mime: 'image/svg+xml', size: svg.length, src: `data:image/svg+xml;base64,${btoa(svg)}` });
  return id;
}
