import { useCallback, useEffect, useRef } from 'react';
import { answerKey, applyCoursePlan, cleanAnswer, cleanCollection, cleanSharedSettings, courseChanged, planCourseAdd, isBlockedAnswer, tallyAnswers, type Project, type SharedValue, type SharedWho } from 'interactives-player';
/**
 * Preview's pretend learner record. The previewed project runs in a sandboxed frame with no storage of its own, so its Save user
 * data and remembered progress used to last one run: the player asked the page around it, nobody answered, and the browser
 * fallback was memory only. The editor answers instead, the way the learner page does in StudyDesk, and keeps it in this
 * browser per project, so closing and reopening Preview (or reloading the editor) behaves like a learner coming back.
 */

const PREFIX = 'ix-preview-learner:';
//Course collections are not a project's: every project with the same collection name shares it, as it would in a course
const COURSE_PREFIX = 'ix-preview-course:';

interface Ask {
  source?: string;
  op?: string;
  rid?: string;
  project?: string;
  variables?: unknown;
  names?: unknown;
  data?: unknown;
  /** Shared responses: the data source's id, who sees it, and the answers. */
  sharedSource?: unknown;
  who?: unknown;
  answers?: unknown;
  /** Course collections: the collection's name and what to add. */
  collection?: unknown;
  stamps?: unknown;
  counts?: unknown;
}

export interface PreviewReply {
  ok: boolean;
  available: boolean;
  data?: unknown;
}

const key = (project: string, what: string) => `${PREFIX}${project}:${what}`;

function read(k: string): unknown {
  try {
    const raw = localStorage.getItem(k);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function write(k: string, value: unknown): boolean {
  try {
    localStorage.setItem(k, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Shared responses in Preview: the class is the data source's sample answers (each counted as a person of their own) plus whatever the
 * person previewing adds, which Preview keeps with the rest of its pretend learner. Only me is just their own. The same limits and
 * blocklist as the server applies.
 */
function previewShared(m: Ask, project: Project | undefined, project0: string): PreviewReply {
  const ds = project?.dataSources.find((d) => d.id === m.sharedSource && d.source === 'shared');
  if (!ds) return { ok: true, available: false };
  const s = cleanSharedSettings(ds.shared);
  const who: SharedWho = m.who === 'me' ? 'me' : 'class';
  const at = key(project0, `shared:${ds.id}:${who}`);
  let mine = ((read(at) as string[] | undefined) ?? []).filter((x) => typeof x === 'string');
  let kept = 0;
  let problem = '';
  if (m.op === 'shared-add') {
    for (const raw of Array.isArray(m.answers) ? m.answers : [m.answers]) {
      const text = cleanAnswer(raw, s.maxLength);
      if (!text) continue;
      if (isBlockedAnswer(text, s.blocked)) problem = 'blocked';
      else if (mine.some((x) => answerKey(x) === answerKey(text))) continue;
      else if (mine.length >= s.perPerson) problem = 'full';
      else (mine.push(text), kept++);
    }
    write(at, mine);
  } else if (m.op === 'shared-withdraw') {
    const gone = (Array.isArray(m.answers) ? m.answers : []).map((a) => answerKey(String(a)));
    mine = gone.length ? mine.filter((x) => !gone.includes(answerKey(x))) : [];
    write(at, mine);
  }
  const others = who === 'class' ? s.sample.map((t) => [t]) : [];
  const answers = tallyAnswers([...others, mine], who === 'class' ? s.minCount : 1, (t) => !isBlockedAnswer(t, s.blocked));
  const value: SharedValue = { ready: true, who, answers, total: answers.reduce((n, a) => n + a.count, 0), people: others.length + (mine.length ? 1 : 0), mine, left: Math.max(0, s.perPerson - mine.length), limit: s.perPerson, problem };
  return { ok: true, available: true, data: m.op === 'shared-add' ? { ...value, kept } : value };
}

/**
 * Course collections in Preview: there is no course here, so a collection is this browser's, shared by every project previewed in it
 * under the same name. The reply says course: false, which is how the project (and the toolbar) can tell it is not the real thing.
 */
function previewCourse(m: Ask): PreviewReply {
  const name = cleanCollection(m.collection);
  if (!name) return { ok: true, available: false };
  const at = `${COURSE_PREFIX}${name}`;
  const have = (read(at) as { stamps?: unknown; counts?: unknown } | undefined) ?? {};
  const base = applyCoursePlan(have, { stamps: [], counts: {}, problem: '' });
  if (m.op !== 'course-add') return { ok: true, available: true, data: { ...base, course: false } };
  const plan = planCourseAdd(base, { stamps: m.stamps, counts: m.counts });
  const next = applyCoursePlan(base, plan);
  if (courseChanged(plan)) write(at, next);
  return { ok: true, available: true, data: { ...next, course: false, changed: courseChanged(plan), problem: plan.problem } };
}

/** Whether a project has anything that uses course collections (the nodes, or a script calling ix.course). */
export function usesCourseCollections(project: Project): boolean {
  for (const ab of project.artboards) {
    if (ab.logic?.nodes?.some((n) => n.kind.startsWith('action.course'))) return true;
  }
  return project.scripts.some((s) => s.code.includes('.course.'));
}

function courseKeys(): string[] {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(COURSE_PREFIX)) out.push(k);
    }
  } catch {
    /* nothing kept */
  }
  return out;
}

/** Whether Preview holds any course collection in this browser. */
export const previewCourseHas = (): boolean => courseKeys().length > 0;

export function forgetPreviewCourse(): void {
  try {
    for (const k of courseKeys()) localStorage.removeItem(k);
  } catch {
    /* nothing kept */
  }
}

/** The answer to one of the player's progress messages, or null when it is not one Preview answers (no reply is sent). */
export function answerPreviewProgress(m: Ask, doc?: Project): PreviewReply | null {
  if (!m || m.source !== 'interactives-progress' || typeof m.op !== 'string') return null;
  const project = typeof m.project === 'string' && m.project ? m.project : 'project';
  switch (m.op) {
    case 'userdata-save': {
      const values = m.variables && typeof m.variables === 'object' && !Array.isArray(m.variables) ? (m.variables as Record<string, unknown>) : {};
      const kept = (read(key(project, 'user')) as Record<string, unknown> | undefined) ?? {};
      return { ok: write(key(project, 'user'), { ...kept, ...values }), available: true };
    }
    case 'userdata-load': {
      const kept = (read(key(project, 'user')) as Record<string, unknown> | undefined) ?? {};
      const names = Array.isArray(m.names) ? m.names.map(String) : [];
      const out: Record<string, unknown> = {};
      for (const n of names) if (Object.prototype.hasOwnProperty.call(kept, n)) out[n] = kept[n];
      return { ok: true, available: true, data: out };
    }
    case 'load':
      return { ok: true, available: true, data: read(key(project, 'progress')) ?? null };
    case 'save':
      return { ok: write(key(project, 'progress'), m.data ?? null), available: true };
    // Course and learner come from the project's sample values, and marking stays in the page: say there's nothing here
    case 'context':
    case 'mark':
      return { ok: true, available: false };
    case 'shared-read':
    case 'shared-add':
    case 'shared-withdraw':
      return previewShared(m, doc, project);
    case 'course-read':
    case 'course-add':
      return previewCourse(m);
    default:
      return null;
  }
}

/** What Preview has kept for this project (for the Forget button's title), and forgetting it. */
export function previewLearnerHas(project: string): boolean {
  return read(key(project, 'user')) !== undefined || read(key(project, 'progress')) !== undefined || sharedKeys(project).length > 0;
}

/** The keys of the answers Preview kept for shared responses in this project. */
function sharedKeys(project: string): string[] {
  const out: string[] = [];
  try {
    const prefix = key(project, 'shared:');
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) out.push(k);
    }
  } catch {
    /* nothing kept */
  }
  return out;
}

export function forgetPreviewLearner(project: string): void {
  try {
    localStorage.removeItem(key(project, 'user'));
    localStorage.removeItem(key(project, 'progress'));
    for (const k of sharedKeys(project)) localStorage.removeItem(k);
  } catch {
    /* nothing kept */
  }
}

/**
 * For the other places a project plays inside the editor (Review, the Templates tab's examples): they keep nothing, and
 * saying so straight away saves the player its wait for an answer before it starts. Put the returned ref on the iframe.
 */
export function useNoProgressHost(): (el: HTMLIFrameElement | null) => void {
  const frame = useRef<HTMLIFrameElement | null>(null);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as Ask | null;
      if (!d || d.source !== 'interactives-progress' || !d.rid || e.source !== frame.current?.contentWindow) return;
      frame.current?.contentWindow?.postMessage({ target: 'interactives', type: 'progress', rid: d.rid, ok: true, available: false }, '*');
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);
  return useCallback((el: HTMLIFrameElement | null) => void (frame.current = el), []);
}
