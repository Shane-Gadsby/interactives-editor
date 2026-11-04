import { gatherMessages, suggestDirection, type PayloadShape, type Project, type PublicDirection, type PublicInterface, type PublicMessage, type Variable } from 'interactives-player';

//Edits to the project's public interface, written to work on an immer draft (store().update) or a plain project.

/** The interface as the draft holds it, made if there is none yet. */
function ensure(p: Project): PublicInterface {
  const s = p.settings;
  s.publicInterface ??= { variables: [], messages: [] };
  return s.publicInterface;
}

/** Drop the interface from the document when it holds nothing at all, so a project that never used it carries nothing. */
export function tidy(p: Project): void {
  const pi = p.settings.publicInterface;
  if (pi && !pi.variables.length && !pi.messages.length && !pi.restrictInputs) delete p.settings.publicInterface;
}

export function addVariable(p: Project, variableId: string, direction?: PublicDirection): boolean {
  const v = p.variables.find((x) => x.id === variableId);
  if (!v) return false;
  const pi = ensure(p);
  if (pi.variables.some((x) => x.variable === v.id)) return false;
  pi.variables.push({ variable: v.id, name: v.name, direction: direction ?? suggestDirection(p, v) });
  return true;
}

export function removeVariable(p: Project, variableId: string): void {
  const pi = p.settings.publicInterface;
  if (!pi) return;
  pi.variables = pi.variables.filter((x) => x.variable !== variableId);
  tidy(p);
}

export function setVariableEntry(p: Project, variableId: string, patch: { direction?: PublicDirection; description?: string }): void {
  const e = p.settings.publicInterface?.variables.find((x) => x.variable === variableId);
  if (!e) return;
  if (patch.direction) e.direction = patch.direction;
  if (patch.description !== undefined) {
    if (patch.description.trim()) e.description = patch.description;
    else delete e.description;
  }
}

/** Accept a rename: the list now tells hosts the variable's current name. */
export function acceptRename(p: Project, variableId: string): void {
  const e = p.settings.publicInterface?.variables.find((x) => x.variable === variableId);
  const v = p.variables.find((x) => x.id === variableId);
  if (e && v) e.name = v.name;
}

/** Take out the entries pointing at variables that are gone. */
export function removeMissing(p: Project): number {
  const pi = p.settings.publicInterface;
  if (!pi) return 0;
  const keep = pi.variables.filter((e) => p.variables.some((v) => v.id === e.variable));
  const gone = pi.variables.length - keep.length;
  pi.variables = keep;
  tidy(p);
  return gone;
}

export function addMessage(p: Project, name: string, direction: PublicMessage['direction']): boolean {
  const n = name.trim();
  if (!n) return false;
  const pi = ensure(p);
  if (pi.messages.some((m) => m.name === n && m.direction === direction)) return false;
  pi.messages.push({ name: n, direction });
  return true;
}

export function removeMessage(p: Project, name: string, direction: PublicMessage['direction']): void {
  const pi = p.settings.publicInterface;
  if (!pi) return;
  pi.messages = pi.messages.filter((m) => !(m.name === name && m.direction === direction));
  tidy(p);
}

export function setMessageEntry(p: Project, name: string, direction: PublicMessage['direction'], patch: { name?: string; description?: string; payload?: PayloadShape | null }): void {
  const pi = p.settings.publicInterface;
  const m = pi?.messages.find((x) => x.name === name && x.direction === direction);
  if (!pi || !m) return;
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (n && !pi.messages.some((x) => x !== m && x.name === n && x.direction === direction)) m.name = n;
  }
  if (patch.description !== undefined) {
    if (patch.description.trim()) m.description = patch.description;
    else delete m.description;
  }
  if (patch.payload !== undefined) {
    if (patch.payload) m.payload = patch.payload;
    else delete m.payload;
  }
}

export function setRestrict(p: Project, on: boolean): void {
  if (on) ensure(p).restrictInputs = true;
  else if (p.settings.publicInterface) {
    delete p.settings.publicInterface.restrictInputs;
    tidy(p);
  }
}

/** Variables the project's own flows and controls work with: set by a Set variable node, watched by On variable change, or bound to an input layer. */
function boundaryVariableIds(p: Project): Set<string> {
  const ids = new Set<string>();
  const walk = (children: unknown) => {
    for (const c of Array.isArray(children) ? children : []) {
      if (!c || typeof c !== 'object') continue;
      const n = c as { variableId?: unknown; children?: unknown };
      if (typeof n.variableId === 'string') ids.add(n.variableId);
      walk(n.children);
    }
  };
  for (const ab of p.artboards) {
    for (const n of ab.logic.nodes) if ((n.kind === 'action.setVariable' || n.kind === 'event.variable') && typeof n.params.variable === 'string') ids.add(n.params.variable);
    walk(ab.children);
  }
  return ids;
}

/** What "Add from what the project uses" would add: messages sent and heard that are not listed, and variables not listed. */
export function suggestions(p: Project): { messages: { name: string; direction: PublicMessage['direction']; where: string[] }[]; variables: { variable: Variable; direction: PublicDirection; used: boolean }[] } {
  const pi = p.settings.publicInterface;
  const used = gatherMessages(p);
  const messages: { name: string; direction: PublicMessage['direction']; where: string[] }[] = [];
  for (const m of used.received) if (!pi?.messages.some((x) => x.name === m.name && x.direction === 'receive')) messages.push({ name: m.name, direction: 'receive', where: m.where });
  for (const m of used.sent) if (!pi?.messages.some((x) => x.name === m.name && x.direction === 'send')) messages.push({ name: m.name, direction: 'send', where: m.where });
  const bound = boundaryVariableIds(p);
  const variables = p.variables.filter((v) => !pi?.variables.some((x) => x.variable === v.id)).map((v) => ({ variable: v, direction: suggestDirection(p, v), used: bound.has(v.id) }));
  return { messages, variables };
}

/** Add every message found in use and the variables the project's flows and controls work with. The rest of the variables are chosen one at a time, since most are the project's own business. */
export function addUsed(p: Project): { messages: number; variables: number } {
  const found = suggestions(p);
  let messages = 0;
  let variables = 0;
  for (const m of found.messages) if (addMessage(p, m.name, m.direction)) messages++;
  for (const v of found.variables) if (v.used && addVariable(p, v.variable.id, v.direction)) variables++;
  return { messages, variables };
}
