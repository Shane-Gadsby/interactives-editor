/**
 * Before something that cuts learners off (deleting a project, turning its share link off): what the server knows
 * about who is using it, as a paragraph for the confirm dialog. Empty when nothing is live, so the dialog stays short.
 */
import { projectInUse, type InUse } from './db';

const DAY = 24 * 60 * 60 * 1000;

export function sinceText(iso: string | null, now = Date.now()): string {
  if (!iso) return '';
  const days = Math.floor((now - new Date(iso).getTime()) / DAY);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 60 ? `${days} days ago` : `on ${new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/** The warning, or '' when the link is off and no learner has records. `what` says what is about to happen to the link. */
export function inUseText(u: InUse, what: 'delete' | 'unshare', now = Date.now()): string {
  const lines: string[] = [];
  if (u.share) lines.push(what === 'delete' ? 'Its share link (the Link for StudyDesk too) is on, and stops working.' : 'Anyone using this link, the Link for StudyDesk included, gets a "turned off" page.');
  if (u.review && what === 'delete') lines.push('Its review link is on, and stops working.');
  if (u.learners) {
    const courses = u.courses.map((c) => `${c.course}: ${c.learners} learner${c.learners === 1 ? '' : 's'}${c.last ? `, last active ${sinceText(c.last, now)}` : ''}`);
    if (u.moreCourses) courses.push(`and ${u.moreCourses} more course${u.moreCourses === 1 ? '' : 's'}`);
    lines.push(`${u.learners} learner${u.learners === 1 ? ' has' : 's have'} results or progress in it${u.last ? `, the latest ${sinceText(u.last, now)}` : ''}:\n${courses.map((c) => `• ${c}`).join('\n')}`);
  }
  if (!lines.length) return '';
  const recent = u.last && now - new Date(u.last).getTime() < 30 * DAY;
  return `${recent ? 'This project is in use right now. ' : ''}${lines.join('\n')}`;
}

/** The paragraph for a dialog, or '' if the server can't say (a warning that fails must not block the action). */
export async function inUseWarning(id: string, what: 'delete' | 'unshare'): Promise<string> {
  try {
    return inUseText(await projectInUse(id), what);
  } catch {
    return '';
  }
}
