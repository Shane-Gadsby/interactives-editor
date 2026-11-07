import type { LogicNode } from 'interactives-player';
import type { graph } from './shared';

/** The steps that run when an If node holds (its `true` port), one after the other. Returns the last node. */
export function whenTrue(g: ReturnType<typeof graph>, cond: LogicNode, ...steps: [string, Record<string, unknown>][]): LogicNode {
  const [first, ...rest] = steps;
  return g.run(g.then(cond, first[0], first[1], 'true'), ...rest);
}
