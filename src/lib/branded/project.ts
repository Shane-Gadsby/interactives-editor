import { migrateInputVariables } from 'interactives-player';
import type { TemplateChecklistItem, Project } from 'interactives-player';
import type { BrandedStarter, StarterSet } from './kit';
import { COLOURWAYS, type Colourway } from './looks';
import { applyTidy } from '../artboard-tidy';
import { finishGraphs } from './graph-kit';
import { addCreditsButton } from '../starter-credits';
import { settleLayout } from './layout-check';
import { finishControls } from './finish';
import { resolveForm } from './form-kit';

// Building a project from a starter, with none of the starters themselves imported: the sets are a chunk of their own (index.ts),
// and the editor's first screen shouldn't carry them. Whatever holds a starter already has them.

export const SETS: StarterSet[] = ['assessment', 'explore', 'drag', 'story', 'games', 'writing', 'practice', 'media'];

/** A branded starter in a colourway, as a new project carrying its checklist (the template record says which starter). */
export function projectFromBrandedStarter(s: BrandedStarter, colourway: Colourway = COLOURWAYS[0], name?: string): Project {
  const { project, checklist } = s.build(colourway);
  project.name = name || s.name;
  //graphs laid out the way the Interactions tab's Tidy up does it, whatever order the starter built them in
  //an input's old Variable setting becomes a two-way binding now, not on the next load
  migrateInputVariables(project);
  //the small Credits button on the first page (before the graph tidy, so its two nodes are laid out with the rest)
  const credits = addCreditsButton(project);
  if (credits) checklist.push(credits as TemplateChecklistItem);
  finishGraphs(project);
  //the same edges and gradient-page buttons on every starter
  finishControls(project);
  //auto layout frames laid out in the document, as the editor does after an edit
  settleLayout(project);
  //every page was made at the same canvas spot: lay them out in order, in a grid, before anyone sees them
  applyTidy(project, { x: 0, y: 0 });
  project.template = { builtin: `branded:${s.key}`, name: s.name, version: 1, checklist: checklist as TemplateChecklistItem[] };
  //the plain form for the content, bound to what the build made, and the checklist items that point at its fields
  if (s.form) project.contentForm = resolveForm(project, s.form, project.template.checklist).form;
  return project;
}

/**
 * The files a starter carries inside its project (placeholder sounds, as `data:` addresses). Takes them out of the project's
 * asset records, which then hold no bytes (the editor keeps those with the project, not in the document), and returns each
 * as a Blob by asset id for the caller to upload once the project exists.
 */
export function takeInlineAssets(project: Project): Map<string, Blob> {
  const files = new Map<string, Blob>();
  for (const a of project.assets) {
    const m = a.src && /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(a.src);
    if (!m) continue;
    const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    files.set(a.id, new Blob([bytes], { type: m[1] || a.mime }));
    delete a.src;
  }
  return files;
}
