export interface Plan {
	stamps: string[];
	counts: Record<string, number>;
	problem: string;
}
export const LIMITS: Record<string, number>;
export function cleanCollection(raw: unknown): string;
export function cleanStamp(raw: unknown): string;
export function cleanCounterName(raw: unknown): string;
export function cleanCount(raw: unknown): number | null;
export function uniqueStamps(list: unknown): string[];
export function cleanCounts(raw: unknown): Record<string, number>;
export function planAdd(have: unknown, add: unknown): Plan;
export function changed(plan: Plan): number;
export function applyPlan(have: unknown, plan: Plan): { stamps: string[]; counts: Record<string, number> };
export function updateFor(plan: Plan, now: Date): Record<string, unknown>;
export function valueOf(row: unknown, extra?: Record<string, unknown>): Record<string, unknown>;
