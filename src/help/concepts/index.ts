/// <reference types="vite/client" />
//(for import.meta.glob: the MCP server's typecheck leaves the vite client types out, and its bundle is made by vite too)
import type { HelpTopic } from '../topics';

/**
 * Concepts: the ideas people trip over without someone to show them (the canvas doesn't run, a repeater is one layer, x is
 * measured from the parent...). One short topic per idea, each in its own file here exporting `concept`: the idea, where people
 * trip, how to tell what is going on, and links to where it is covered in depth.
 */
export interface Concept {
  /** Where it sits in the list: the ones people meet first, first. */
  order: number;
  area: 'interface' | 'construction';
  topic: HelpTopic;
}

const mods = import.meta.glob<{ concept: Concept }>('./*.ts', { eager: true });

export const CONCEPTS: Concept[] = Object.entries(mods)
  .filter(([file]) => !/\/index\.ts$/.test(file))
  .map(([, m]) => m.concept)
  .filter(Boolean)
  .sort((a, b) => a.order - b.order || a.topic.title.localeCompare(b.topic.title));

/** The list page: every concept, in the order people tend to meet them. */
export const CONCEPTS_OVERVIEW: HelpTopic = {
  id: 'concepts',
  title: 'Concepts: the ideas behind the editor',
  group: 'Concepts',
  summary: 'Short explanations of the ideas that catch people out: what the canvas shows, variables and bindings, repeaters, auto layout, what gets clicked and more.',
  keywords: 'concepts ideas explain why confused does nothing not working understand how it works basics',
  body: () => {
    const lines = [
      `Each of these is a few minutes' read: the idea, the ways people get caught out, and how to tell what is going on. If something "does nothing", start with the first one.`,
      '',
    ];
    for (const c of CONCEPTS) lines.push(`- [${c.topic.title}](${c.topic.id}). ${c.topic.summary}`);
    return lines.join('\n');
  },
};

export const CONCEPT_TOPICS: HelpTopic[] = [CONCEPTS_OVERVIEW, ...CONCEPTS.map((c) => c.topic)];
