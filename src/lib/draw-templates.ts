import { drawTemplate, uid, walk, type Project, type Variable } from 'interactives-player';
import { store } from '../store/store';

/**
 * Put a starter script into script layers (one undo step). Variables the starter reads are added when the project
 * doesn't have one of that name yet. Returns the names of the variables it added.
 */
export function applyDrawTemplate(ids: string[], templateId: string): string[] {
  const t = drawTemplate(templateId);
  if (!t) return [];
  const added: string[] = [];
  store().update((d) => {
    for (const v of t.variables ?? []) {
      if (d.variables.some((x) => x.name === v.name)) continue;
      d.variables.push({ id: uid('v'), name: v.name, type: v.type, initial: v.initial } as Variable);
      added.push(v.name);
    }
    const hit = new Set(ids);
    for (const ab of d.artboards) {
      const visit = (list: typeof ab.children): void => {
        for (const n of list) {
          if (hit.has(n.id) && n.type === 'draw') n.code = t.code;
          if (n.type === 'group' || n.type === 'frame') visit(n.children);
        }
      };
      visit(ab.children);
    }
  });
  if (added.length) store().toast(`Added the variable${added.length > 1 ? 's' : ''} ${added.map((n) => `“${n}”`).join(', ')} that this script reads. Change ${added.length > 1 ? 'them' : 'it'} in the Variables tab.`);
  return added;
}

/** Script layers run their draw scripts in the sandbox, so a project with one needs the sandbox bundle in its export. */
export function hasScriptLayers(p: Project): boolean {
  return p.artboards.some((a) => {
    let found = false;
    walk(a.children, (n) => {
      if (n.type === 'draw') found = true;
    });
    return found;
  });
}
