/// <reference types="vite/client" />
//(for import.meta.glob: the MCP server's typecheck leaves the vite client types out, and its bundle is made by vite too)
import type { HelpTopic } from '../topics';

/**
 * The Build it tutorials: one topic per kind of thing people make (a quiz question, flip cards, a branching story...), each in its
 * own file here exporting `tutorial`. Each one has a finished project on the Templates tab under Examples, Build it
 * (scripts/tutorial-examples/<slug>.ts makes it), and its first lines say so for people who only want to look.
 */
export interface BuildTutorial {
  /** Where it sits in the list: beginner ones first. */
  order: number;
  level: 'beginner' | 'intermediate' | 'advanced';
  /** About how long it takes, in minutes. */
  minutes: number;
  /** The example key, `tut-<slug>`. */
  example: string;
  topic: HelpTopic;
}

const mods = import.meta.glob<{ tutorial: BuildTutorial }>('./*.ts', { eager: true });

export const BUILD_TUTORIALS: BuildTutorial[] = Object.entries(mods)
  .filter(([file]) => !/\/index\.ts$/.test(file))
  .map(([, m]) => m.tutorial)
  .filter(Boolean)
  .sort((a, b) => a.order - b.order || a.topic.title.localeCompare(b.topic.title));

const LEVELS: BuildTutorial['level'][] = ['beginner', 'intermediate', 'advanced'];
const levelName = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

/** The list page: every Build it tutorial by level, with how long it takes. */
export const BUILD_IT_OVERVIEW: HelpTopic = {
  id: 'build-it',
  title: 'Build it: tutorials by kind of activity',
  group: 'Build it',
  summary: 'Step-by-step tutorials for the things people make most: questions, cards, sliders, stories, games, journals and more, each with its finished project to open.',
  keywords: 'tutorial tutorials build how to make walkthrough step by step example finished project quiz question cards story game journal',
  body: () => {
    const lines = [
      `Each tutorial builds one kind of activity from a blank project, one step at a time. Do [Tutorial 1](tutorial-first-animation) and [Tutorial 2](tutorial-first-interaction) first if you haven't used the editor before.`,
      '',
      `**Just want to look?** Every tutorial's finished project is on the projects page: open **Templates**, and under **Examples** find **Build it**. **Play** runs it, and **Make my copy** gives you your own copy to pull apart.`,
    ];
    for (const level of LEVELS) {
      const list = BUILD_TUTORIALS.filter((t) => t.level === level);
      if (!list.length) continue;
      lines.push('', `## ${levelName[level]}`, '');
      for (const t of list) lines.push(`- [${t.topic.title}](${t.topic.id}), about ${t.minutes} minutes. ${t.topic.summary}`);
    }
    return lines.join('\n');
  },
};

export const BUILD_TOPICS: HelpTopic[] = [BUILD_IT_OVERVIEW, ...BUILD_TUTORIALS.map((t) => t.topic)];
