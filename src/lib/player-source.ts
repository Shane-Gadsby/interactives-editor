/** The player (~880 kB) is only fetched when something is exported, shared or previewed: warmPlayerSource starts it early so those don't wait. */
let playerSource: Promise<string> | null = null;
export function loadPlayerSource(): Promise<string> {
  playerSource ??= import('@player-iife?raw').then(
    (m) => {
      //Under npm run dev a bundle served as a module instead of text has no default: say so, rather than fail later on undefined
      if (typeof m.default !== 'string') throw new Error('The player bundle did not load as text. Run npm run build in interactives-player, then restart npm run dev.');
      return m.default;
    },
    (err) => {
      //a dropped connection mid-fetch shouldn't stick: the next export asks again
      playerSource = null;
      throw err;
    },
  );
  return playerSource;
}
export const warmPlayerSource = (): Promise<unknown> => loadPlayerSource().catch(() => null);
