import { warmPlayerSource } from './player-source';
import { warmHelp } from '../help/lazy';
import { logicGraph } from '../components/Dock';
import { codeMirror } from '../components/CodeEditor';

type Connection = { saveData?: boolean; effectiveType?: string };

/** Someone on Data Saver or a 2G link keeps their bytes: the chunks come when they are asked for, not before. */
const frugal = (): boolean => {
  const c = (navigator as unknown as { connection?: Connection }).connection;
  return !!c && (!!c.saveData || /(^|-)2g$/.test(c.effectiveType ?? ''));
};

const idle = (fn: () => void) => ('requestIdleCallback' in window ? void window.requestIdleCallback(fn, { timeout: 4000 }) : void setTimeout(fn, 1500));

/** What the editor warms up once its first screen is drawn, one at a time while the browser is idle: Preview/Share/Export's player, then help, the interaction graph and the code boxes. */
export const WARM_STEPS: (() => Promise<unknown>)[] = [warmPlayerSource, warmHelp, () => logicGraph.ensure().catch(() => null), () => codeMirror.ensure().catch(() => null)];

let started = false;
/** For tests: forget that the warm-up has run. */
export const resetWarm = (): void => void (started = false);

/** Called once a project is on screen: starts the warm-up (once), a second after the editor is drawn so it never competes with opening. */
export function warmLater(steps?: (() => Promise<unknown>)[]): void {
  //tests draw the editor too, and shouldn't go fetching chunks behind their backs (one that passes its own steps is testing this)
  if (started || frugal() || (!steps && import.meta.env.MODE === 'test')) return;
  started = true;
  const list = steps ?? WARM_STEPS;
  let i = 0;
  const next = () => {
    const step = list[i++];
    if (!step) return;
    void step().finally(() => idle(next));
  };
  setTimeout(() => idle(next), 1000);
}
