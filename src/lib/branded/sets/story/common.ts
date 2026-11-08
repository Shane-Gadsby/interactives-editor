//Small helpers the story set shares. The graph builders, variables and one line actions live in ../../graph-kit.ts now.
import { uid, type Artboard, type Project } from 'interactives-player';
export * from '../../graph-kit';

/** Put pages in a named artboard group (a chapter): Next, Previous and `pageNumber`/`pageCount` count the pages of the group on their own. */
export function groupPages(project: Project, name: string, pages: Artboard[]): void {
  const id = uid('ag');
  (project.artboardGroups ??= []).push({ id, name });
  for (const p of pages) p.group = id;
}
