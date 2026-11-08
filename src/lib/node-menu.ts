import { CATALOG } from 'interactives-player';
import { nodeAka, nodeLabel, nodeTip } from './plain-words';
import type { MenuItem } from '../components/ContextMenu';
import { CATEGORIES } from './graph-palette';
import { NODE_SYNONYMS } from './node-search';

const CAT_COLOR: Record<string, string> = { event: 'var(--event)', action: 'var(--action)', logic: 'var(--logic)' };
const SINGULAR: Record<string, string> = { event: 'Event', action: 'Action', logic: 'Logic' };

/** The catalog as menu items, a submenu per category, each calling `pick(kind)`. Searching it goes through the same matcher as the palette. */
export function nodeMenuItems(pick: (kind: string) => void, only?: (kind: string) => boolean): MenuItem[] {
  return CATEGORIES.map((c) => ({
    label: SINGULAR[c.id],
    color: CAT_COLOR[c.id],
    items: CATALOG.filter((d) => d.category === c.id && (!only || only(d.kind))).map((d) => ({ label: nodeLabel(d), title: nodeTip(d), find: [...(nodeAka(d) ? [nodeAka(d)!] : []), ...(NODE_SYNONYMS[d.kind] ?? [])], group: d.group, onClick: () => pick(d.kind) })),
  })).filter((g) => g.items.length);
}
