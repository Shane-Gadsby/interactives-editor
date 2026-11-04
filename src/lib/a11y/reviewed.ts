/**
 * Which findings a person has looked at and accepted ("it's decoration", "the caption track is there"). Kept in this browser,
 * per project: it is a note for the report, not part of the project, so it never travels with the file or to collaborators.
 */
import type { ReviewedMap } from './report';

const key = (projectId: string) => `ix-a11y-reviewed:${projectId}`;

export function loadReviewed(projectId: string): ReviewedMap {
  try {
    const v = JSON.parse(localStorage.getItem(key(projectId)) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** Toggle a finding's reviewed mark; returns the new map. */
export function toggleReviewed(projectId: string, findingId: string, now = new Date()): ReviewedMap {
  const map: Record<string, string> = { ...loadReviewed(projectId) };
  if (map[findingId]) delete map[findingId];
  else map[findingId] = now.toISOString();
  try {
    localStorage.setItem(key(projectId), JSON.stringify(map));
  } catch {
    /* storage unavailable: the mark lasts until the panel closes */
  }
  return map;
}
