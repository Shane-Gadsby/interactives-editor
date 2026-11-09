import { prefs, setPrefs } from './prefs';

/**
 * Putting the editor's sections and tools in the order a person likes. The order is a list of stable keys per place (a panel
 * kind for sections, the tool rail or one of its groups for tools), kept in the person's preferences so it follows them between
 * machines and never goes into the project.
 *
 * Only the keys the person has moved are in the list. Whatever isn't in it (a section added in a later version, or one that
 * only shows for some layers) stays in its own default place, and the listed ones take their turns in the places the listed ones
 * hold. So a new section appears where the editor puts it, not at the bottom.
 */

/** The order the person set for the keys on screen, which sit in `keys` in their default order. */
export function arrange(keys: string[], saved?: readonly string[]): string[] {
  if (!saved?.length) return keys;
  const rank = new Map<string, number>();
  saved.forEach((k, i) => rank.has(k) || rank.set(k, i));
  const known = keys.filter((k) => rank.has(k)).sort((a, b) => rank.get(a)! - rank.get(b)!);
  let at = 0;
  return keys.map((k) => (rank.has(k) ? known[at++] : k));
}

/** `order` with the key at `from` taken out and put at `to` (a place in the list without it). */
export function moved(order: string[], from: number, to: number): string[] {
  const next = [...order];
  const [k] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, k);
  return next;
}

/** The saved list once the keys on screen are in `shown`: they go where the first of them was, and keys that aren't on screen stay put. */
export function mergeOrder(saved: readonly string[] | undefined, shown: string[]): string[] {
  const on = new Set(shown);
  const rest = (saved ?? []).filter((k) => !on.has(k));
  const first = (saved ?? []).findIndex((k) => on.has(k));
  const at = first < 0 ? rest.length : (saved ?? []).slice(0, first).filter((k) => !on.has(k)).length;
  return [...rest.slice(0, at), ...shown, ...rest.slice(at)].slice(0, 80);
}

export type OrderKind = 'sectionOrder' | 'toolOrder';

export function getOrder(kind: OrderKind, scope: string): string[] | undefined {
  const v = prefs()[kind]?.[scope];
  return Array.isArray(v) ? v : undefined;
}

/** Save the order for one place. An empty list forgets it, so the default comes back. */
export function setOrder(kind: OrderKind, scope: string, list: string[] | undefined): void {
  const all = { ...(prefs()[kind] ?? {}) };
  if (list?.length) all[scope] = list.slice(0, 80);
  else delete all[scope];
  setPrefs({ [kind]: all });
}

/** Back to the default order for one place. */
export const resetOrder = (kind: OrderKind, scope: string): void => setOrder(kind, scope, undefined);

/** Back to the default tool rail: its groups and the tools inside them. */
export const resetToolOrder = (): void => setPrefs({ toolOrder: {} });

/** Back to the default order everywhere: every panel's sections and the tool rail. */
export function resetAllOrders(): void {
  setPrefs({ sectionOrder: {}, toolOrder: {} });
}

/** Has the person moved anything? (For the Reset button in Preferences.) */
export const hasCustomOrder = (): boolean => Object.keys(prefs().sectionOrder ?? {}).length + Object.keys(prefs().toolOrder ?? {}).length > 0;
