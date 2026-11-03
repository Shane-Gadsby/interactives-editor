export type PathStep = string | { i: string };
export type Op =
  | { t: 'set'; p: PathStep[]; v: unknown }
  | { t: 'ins'; p: PathStep[]; v: { id: string }; after: string | null }
  | { t: 'del'; p: PathStep[]; id: string };
export function isIdArray(a: unknown): boolean;
export function diff(a: unknown, b: unknown, path?: PathStep[], out?: Op[]): Op[];
export function apply(doc: unknown, ops: Op[]): number;
export function opKey(op: Op): string;
