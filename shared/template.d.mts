export const MAX_CHECKLIST: number;
export const MAX_TEXT: number;
export const MAX_DESCRIPTION: number;
export function cleanLine(value: unknown, max?: number): string;
export function cleanDescription(value: unknown): string;
export function cleanChecklist(list: unknown, makeId: () => string): { id: string; text: string; artboardId?: string; nodeId?: string }[];
export function mayUseTemplate(tpl: { owner?: { username?: string | null } | null; shared?: { everyone?: boolean } } | null, me: { username?: string | null } | null, enforcing: boolean): boolean;
export function accessFilter(me: { username?: string | null } | null, enforcing: boolean): Record<string, unknown>;
export function cleanProject<T>(project: T): T;
export function contentHash(project: unknown): string;
export function artboardProps(ab: Record<string, unknown>): Record<string, unknown>;
export function nodeProps(node: Record<string, unknown>): Record<string, unknown>;
/** Every part "Update from template" looks after, as [key, value]: a: artboard, n: layer (no children), t: timeline, g: graph node, e: graph edge, v: variable. */
export function partsOf(project: unknown): Generator<[string, any]>;
export function baselineOf(project: unknown): Record<string, string>;
export function partHash(value: unknown): string;
export function planSave(existing: { version: number; hash: string; history?: unknown[] } | null, hash: string, ctx: { note?: unknown; by?: string | null; now: Date }): { unchanged: boolean; version: number; hash: string; history?: unknown[] };
export function brandKitsOf(project: unknown): { id: string; name: string }[];
