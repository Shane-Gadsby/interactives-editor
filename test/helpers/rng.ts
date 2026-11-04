//A small seeded random number generator (mulberry32), so property tests are random but reproducible: a failure
//prints its seed and the same seed always replays the same run.
export interface Rng {
  (): number;
  int(n: number): number;
  pick<T>(list: readonly T[]): T;
  chance(p: number): boolean;
}

export function rng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  next.int = (n: number) => Math.floor(next() * n);
  next.pick = <T>(list: readonly T[]) => list[Math.floor(next() * list.length)];
  next.chance = (p: number) => next() < p;
  return next;
}

/** Seeds to run, from SEEDS (a number, default 60) so a slow machine or a hunt for a rare failure can change it. */
export const seeds = (fallback = 60): number[] => Array.from({ length: Number(process.env.SEEDS ?? fallback) }, (_, i) => i + 1);
