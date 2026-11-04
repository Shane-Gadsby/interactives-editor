import { defaultParams, uid, type Artboard, type LogicNode, type Project, type Timeline, type TimelineMarker } from 'interactives-player';

//Timeline markers, the editor's side: unique names, renaming without orphaning the events that name them, and the
//one-click "when the playhead reaches this" that wires an On timeline marker event to a Set variable action.

/** "Marker 3": the first free number, so deleting a marker never makes the next one share a name. */
export function nextMarkerName(markers: { name: string }[] | undefined): string {
  const taken = new Set((markers ?? []).map((m) => m.name));
  let n = (markers?.length ?? 0) + 1;
  while (taken.has(`Marker ${n}`)) n++;
  return `Marker ${n}`;
}

/** The On timeline marker events that fire for this marker: its name, on its timeline (events with no name fire for every marker). */
export function markerEvents(ab: Pick<Artboard, 'logic'>, tl: Pick<Timeline, 'id'>, marker: Pick<TimelineMarker, 'name'>, includeAny = false): LogicNode[] {
  return ab.logic.nodes.filter((n) => n.kind === 'event.timelineMarker' && n.params.timeline === tl.id && (n.params.marker === marker.name || (includeAny && !n.params.marker)));
}

/**
 * Rename a marker. The events name it, not point at it, so any event on this timeline that used the old name follows the rename
 * (otherwise the interaction made from the marker would quietly stop firing). A name another marker on the timeline has is left
 * alone, since then the events would be answering for both.
 */
export function renameMarker(project: Project, abId: string, tlId: string, markerId: string, name: string): void {
  const ab = project.artboards.find((a) => a.id === abId);
  const tl = ab?.timelines.find((t) => t.id === tlId);
  const m = tl?.markers?.find((x) => x.id === markerId);
  if (!ab || !tl || !m || !name || name === m.name) return;
  const shared = (tl.markers ?? []).some((x) => x.id !== m.id && x.name === m.name);
  if (!shared) for (const n of markerEvents(ab, tl, m)) n.params.marker = name;
  m.name = name;
}

/**
 * "+ When the playhead reaches this…": an On timeline marker event for the marker with a Set variable action wired after it,
 * the variable preselected when the project has one. Returns the action's id (the graph opens on it) and the event's.
 */
export function addMarkerInteraction(project: Project, abId: string, tlId: string, markerId: string): { eventId: string; actionId: string } | null {
  const ab = project.artboards.find((a) => a.id === abId);
  const tl = ab?.timelines.find((t) => t.id === tlId);
  const m = tl?.markers?.find((x) => x.id === markerId);
  if (!ab || !tl || !m) return null;
  const maxY = ab.logic.nodes.reduce((best, l) => Math.max(best, l.y), -60);
  const y = maxY + 120;
  const event: LogicNode = { id: uid('lg'), kind: 'event.timelineMarker', x: 40, y, params: { ...defaultParams('event.timelineMarker'), timeline: tl.id, marker: m.name } };
  const action: LogicNode = { id: uid('lg'), kind: 'action.setVariable', x: 340, y, params: { ...defaultParams('action.setVariable'), ...(project.variables[0] ? { variable: project.variables[0].id } : {}) } };
  ab.logic.nodes.push(event, action);
  ab.logic.edges.push({ id: uid('e'), from: event.id, fromPort: 'out', to: action.id, toPort: 'in' });
  return { eventId: event.id, actionId: action.id };
}

/** Move a marker by `by` ms, kept inside the timeline, and keep the list in time order. */
export function nudgeMarker(tl: Timeline, markerId: string, by: number): void {
  const m = tl.markers?.find((x) => x.id === markerId);
  if (!m) return;
  m.time = Math.max(0, Math.min(tl.duration, Math.round(m.time + by)));
}
