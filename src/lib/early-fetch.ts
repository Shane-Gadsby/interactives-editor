import { sessionId } from './session';

/**
 * index.html starts the first two requests itself, before any of the bundle has arrived (the person's preferences and, when
 * the address is a project, the project), and leaves the responses in `window.__ixEarly`. The app takes each one once, in
 * place of asking again. It only does so for the same session the request went out with, so a request made for someone else
 * (or for nobody) is never used, and a failed or stale one is just asked for again the ordinary way.
 */
interface Early {
  id: string;
  at: number;
  req: Record<string, Promise<Response> | undefined>;
}

const MAX_AGE = 60_000;

/** Which session a request made now would carry: the same rule installSessionHeader uses. */
export const currentSessionId = (): string | null => new URLSearchParams(location.search).get('sessionID') || sessionId();

/** The response index.html already asked for, for this url (once), or null when there isn't a usable one. */
export function takeEarly(url: string, now: number = Date.now()): Promise<Response> | null {
  const early = (globalThis as unknown as { __ixEarly?: Early }).__ixEarly;
  const p = early?.req[url];
  if (!early || !p) return null;
  delete early.req[url];
  if (now - early.at > MAX_AGE || early.id !== currentSessionId()) return null;
  return p;
}

/** `fetch`, except that a response index.html got a head start on is used when there is one (and the plain request when it failed). */
export function fetchOrEarly(url: string, init?: RequestInit): Promise<Response> {
  const early = takeEarly(url);
  return early ? early.catch(() => fetch(url, init)) : fetch(url, init);
}
