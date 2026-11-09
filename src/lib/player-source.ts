/** The player (~880 kB) is only fetched when something is exported, shared or previewed: warmPlayerSource starts it early so those don't wait. */
let playerSource: Promise<string> | null = null;
export function loadPlayerSource(): Promise<string> {
  playerSource ??= import('@player-iife?raw').then(
    (m) => m.default,
    (err) => {
      //a dropped connection mid-fetch shouldn't stick: the next export asks again
      playerSource = null;
      throw err;
    },
  );
  return playerSource;
}
export const warmPlayerSource = (): Promise<unknown> => loadPlayerSource().catch(() => null);
