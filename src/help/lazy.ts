import { lazyModule } from '../lib/lazy-module';
import type { HelpTopic } from './topics';

// The help is a few chunks of its own, loaded when it is first wanted or when the editor warms them up once it has drawn its first screen
export const helpViews = lazyModule(() => import('./HelpViews'));
export const helpTopics = lazyModule(() => import('./topics'));
export const tutorialCatalog = lazyModule(() => import('./tutorial-catalog'));
export const helpSearch = lazyModule(() => import('./search'));

/** One topic's title and summary (a "?" link's tooltip), once the topics are in: undefined until then. Never starts the download itself. */
export function useTopic(id: string): HelpTopic | undefined {
  return helpTopics.use(false)?.getTopic(id);
}

export const warmHelp = (): Promise<unknown> => Promise.all([helpViews.ensure(), helpTopics.ensure(), helpSearch.ensure()]).catch(() => null);
