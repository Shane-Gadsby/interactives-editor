/**
 * What a "Build it" tutorial's finished example is made from. Each tutorial has one module in this folder exporting `example`, a
 * TutorialExample: `build()` makes the project the tutorial's steps end with, using the editor's own helpers (Add question,
 * the starter look, the graph helpers) so it is what the UI would make. `node scripts/build-tutorial-examples.mjs [key ...]`
 * writes it to `examples/<key>/project.json` and its line in `examples/index.json`, and `scripts/examples-upgrade.ts` picks up
 * the notes from here, so a new tutorial touches no shared file.
 */
import type { NoteColour, Project } from 'interactives-player';
import { newProjectWithThemes } from '../../src/lib/themes';

export interface TutorialNote {
  text: string;
  colour?: NoteColour;
  /** The artboard it sits beside (index), the first by default. */
  page?: number;
  w?: number;
}

export interface TutorialGraphNote {
  /** The artboard whose graph it explains (index), the first by default. */
  page?: number;
  /** The node it sits above, by its place in that graph's node list. */
  at: number;
  text: string;
  colour?: NoteColour;
  w?: number;
}

export interface TutorialExample {
  /** The example's folder and key, `tut-<slug>`. */
  key: string;
  /** The help topic that builds it (`tutorial-<slug>`). */
  topic: string;
  title: string;
  /** One or two sentences for the example card: what it is, then "the X tutorial's project". */
  description: string;
  tags: string[];
  build(): Project;
  /** One to three author notes beside the artboard: what to look at and where. Written in the examples' register. */
  notes: TutorialNote[];
  /** For a graph of more than 5 nodes: one or two notes saying what the flow does (the examples test asks for one). */
  graphNotes?: TutorialGraphNote[];
}

/** A blank project as New project makes it (the starter themes, the background on its token), with its one page renamed. */
export function blankProject(name: string, page = 'Home', width = 800, height = 600): Project {
  const p = newProjectWithThemes(name);
  const ab = p.artboards[0];
  ab.name = page;
  ab.width = width;
  ab.height = height;
  return p;
}

/** Every tutorial example, from the modules beside this one. */
export function tutorialExamples(): TutorialExample[] {
  const mods = import.meta.glob<{ example: TutorialExample }>('./*.ts', { eager: true });
  return Object.entries(mods)
    .filter(([file]) => !/\/kit\.ts$/.test(file))
    .map(([, m]) => m.example)
    .filter(Boolean)
    .sort((a, b) => a.key.localeCompare(b.key));
}
