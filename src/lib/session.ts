/**
 * The person using the editor, as the toolbox suite's session knows them: si-manager's utilities.js
 * (loaded by the page) exposes fetchActivity, which reads the cached session or asks si-manager for it, and stores
 * the session id that utilities.js then sends with every same-origin fetch.
 */
export interface SessionUser {
  name: string;
  username: string | null;
  initials: string | null;
}

type FetchActivity = (cb: (err: unknown, data: { user?: Record<string, unknown> } | null) => void) => void;

type DirectSignIn = (tool: string, options?: { title?: string; prompt?: boolean }) => Promise<unknown>;

let pending: Promise<SessionUser | null> | null = null;

/**
 * Opened straight in a tab rather than inside StudyDesk: no session id in the url or in this tab's sessionStorage,
 * and not framed. There's no LTI launch to hand that a session, so it signs in through StaffDesk first
 * (directSignIn in si-manager's utilities.js), which leaves the session where fetchActivity looks for one.
 */
function isDirectLoad(): boolean {
  try {
    return window.top === window && !new URLSearchParams(location.search).get('sessionID') && !sessionId();
  } catch {
    return false;
  }
}

function signInDirectly(): Promise<unknown> {
  const directSignIn = (window as unknown as { directSignIn?: DirectSignIn }).directSignIn;
  if (typeof directSignIn !== 'function' || !isDirectLoad()) return Promise.resolve(null);
  return directSignIn('interactives', { title: 'Interactives' }).catch(() => null);
}

export function sessionUser(): Promise<SessionUser | null> {
  pending ??= signInDirectly().then(() => new Promise<SessionUser | null>((resolve) => {
    const fetchActivity = (window as unknown as { fetchActivity?: FetchActivity }).fetchActivity;
    if (typeof fetchActivity !== 'function') return resolve(null);
    // fetchActivity waits for a session id to appear; don't hold the editor up if there never is one
    const timer = setTimeout(() => resolve(null), 4000);
    try {
      fetchActivity((err, data) => {
        clearTimeout(timer);
        const u = data?.user;
        if (err || !u) return resolve(null);
        const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
        const name = str(u.fullName) ?? ([str(u.firstName), str(u.lastName)].filter(Boolean).join(' ') || str(u.username) || 'Guest');
        resolve({ name, username: str(u.username), initials: str(u.initials) });
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  }));
  return pending;
}

/** The session id utilities.js keeps for this tab, if there is one. */
export function sessionId(): string | null {
  try {
    const id = sessionStorage.getItem('sessionID');
    return id && id !== 'null' ? id : null;
  } catch {
    return null;
  }
}
