import { CATALOG, walk, type NodeDef, type Project } from 'interactives-player';

/**
 * Features that are still in the code but out of sight. One line each brings one back: agent-docs/PARKED.md says what
 * else goes with it (help rows, CHANGELOG lines).
 *
 * `frameling`: the ways of making a Frameling animation layer and the words that advertise it. A project that already
 * has one still opens, plays, and can select, change and delete it; the player is untouched.
 */
export const parked = { frameling: true };

/** The help topic an animation layer's Inspector links to, or none while it is parked. */
export const framelingHelp = (): string | undefined => (parked.frameling ? undefined : 'frameling-animations');
export const framelingBlurbHelp = (): [string, string] | undefined => (parked.frameling ? undefined : ['frameling-animations', 'control-it']);

/** What a dropped or picked .flplay is told while Frameling is parked. */
export const FRAMELING_PARKED_MESSAGE = "Frameling animations aren't available at the moment, so this file wasn't added.";

const FRAMELING_NODES = new Set(['event.animationEnd', 'event.animationMarker', 'action.animationPlay', 'action.animationStop', 'action.animationFrame']);
/** Timeline and binding properties that only an animation layer has. */
export const FRAMELING_PROPS = new Set(['frame', 'speed', 'playing', 'clipName']);

const seen = new WeakMap<Project, boolean>();
/** Does this project already have an animation layer? Its nodes stay on offer if so. */
export function hasAnimationLayer(project: Project | null | undefined): boolean {
  if (!project) return false;
  let has = seen.get(project);
  if (has === undefined) {
    has = false;
    for (const ab of project.artboards)
      walk(ab.children, (n) => {
        if (n.type === 'animation') has = true;
      });
    seen.set(project, has);
  }
  return has;
}

/** Is this node kind kept out of the palette, menus and reference for this project? */
export const nodeKindParked = (kind: string, project?: Project | null): boolean => parked.frameling && FRAMELING_NODES.has(kind) && !hasAnimationLayer(project);

/** The interaction nodes on offer: all of them, less the ones that belong to something parked that this project doesn't use. */
let withoutFrameling: NodeDef[] | null = null;
export const offeredNodes = (project?: Project | null): NodeDef[] => {
  if (!parked.frameling || hasAnimationLayer(project)) return CATALOG;
  return (withoutFrameling ??= CATALOG.filter((d) => !FRAMELING_NODES.has(d.kind)));
};
