import { useCallback, useEffect, useRef } from 'react';
/**
 * Preview's pretend learner record. The previewed project runs in a sandboxed frame with no storage of its own, so its Save user
 * data and remembered progress used to last one run: the player asked the page around it, nobody answered, and the browser
 * fallback was memory only. The editor answers instead, the way the learner page does in StudyDesk, and keeps it in this
 * browser per project, so closing and reopening Preview (or reloading the editor) behaves like a learner coming back.
 */

const PREFIX = 'ix-preview-learner:';

interface Ask {
  source?: string;
  op?: string;
  rid?: string;
  project?: string;
  variables?: unknown;
  names?: unknown;
  data?: unknown;
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

/** The answer to one of the player's progress messages, or null when it is not one Preview answers (no reply is sent). */
export function answerPreviewProgress(m: Ask): PreviewReply | null {
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
    default:
      return null;
  }
}

/** What Preview has kept for this project (for the Forget button's title), and forgetting it. */
export function previewLearnerHas(project: string): boolean {
  return read(key(project, 'user')) !== undefined || read(key(project, 'progress')) !== undefined;
}

export function forgetPreviewLearner(project: string): void {
  try {
    localStorage.removeItem(key(project, 'user'));
    localStorage.removeItem(key(project, 'progress'));
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
