/**
 * Live collaboration is a project setting (Project settings > Live collaboration), off unless someone turns it on.
 * Off: the editor never opens the live room (no cursors, no stream of other people's changes, nothing sent but the
 * normal autosave of the whole project with its revision check). On: the room, as it always was.
 *
 * The setting lives in the document (`settings.liveSync`), so everyone who opens the project agrees, and flipping it in
 * the project settings reaches an open live room like any other change. This file is the part that follows the flip while
 * the editor is open: going live means saving the whole project first (so the room starts from what is on screen) and
 * then joining; going quiet means letting what is queued reach the server, then leaving the room.
 */
import type { Project } from 'interactives-player';
import type { EditorStore } from '../store/store';
import { track } from './analytics';
import { currentRevOf, knownRevOf, liveSeqOf, loadProjectRecord } from './db';
import { LiveSession, liveSession, setLiveSession } from './live';

export const liveSyncOn = (p: Project): boolean => !!p.settings.liveSync;

/** The one way the setting is changed from the UI: an ordinary undoable change of the project. */
export function setLiveSync(s: EditorStore, on: boolean): void {
  if (liveSyncOn(s.get().project) === on) return;
  s.update((d) => {
    d.settings.liveSync = on;
  });
  track('live', 'setting', { thing: on ? 'on' : 'off' });
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Joins the room if the project's setting says so. For when a project opens. */
export function openLiveIfOn(s: EditorStore, seq: number): void {
  if (liveSyncOn(s.get().project)) setLiveSession(new LiveSession(s.get().project.id, s, seq));
}

/**
 * Follow the setting while the editor is open. `save` is the editor's whole-project save and says whether it worked;
 * `changed` hears whether changes now travel as live ops. Returns what to call to stop watching.
 */
export function watchLiveSync(s: EditorStore, save: () => Promise<boolean>, changed: (live: boolean) => void): () => void {
  const id = s.get().project.id;
  let stopped = false;
  let handled = liveSyncOn(s.get().project);
  let switching = false;

  const goLive = async (): Promise<boolean> => {
    // The room starts from the server's copy, so what is on screen goes there first. Anything changed while that was
    // happening is saved again before joining, or it would be in neither place
    for (let i = 0; i < 5 && !stopped; i++) {
      const rev = s.revision;
      if (!(await save())) return false;
      await loadProjectRecord(id).catch(() => null);
      if (stopped) return false;
      if (s.revision !== rev) continue;
      if (!liveSyncOn(s.get().project) || liveSession()) return true;
      setLiveSession(new LiveSession(id, s, liveSeqOf(id)));
      changed(true);
      return true;
    }
    return false;
  };

  const goQuiet = async (): Promise<void> => {
    const ses = liveSession();
    if (!ses) return;
    // What is queued or on its way reaches the server first (a few seconds at most)
    for (let i = 0; i < 50 && ses.busy && !stopped; i++) await sleep(100);
    const left = ses.busy;
    ses.close();
    if (liveSession() === ses) setLiveSession(null);
    s.set({ live: null, peers: {} });
    changed(false);
    // From here changes are saved the plain way, against the revision the room left behind
    await loadProjectRecord(id).catch(() => null);
    if (left) await save();
  };

  const settle = async () => {
    if (switching) return;
    switching = true;
    try {
      while (!stopped && liveSyncOn(s.get().project) !== handled) {
        handled = liveSyncOn(s.get().project);
        if (handled) await goLive();
        else await goQuiet();
      }
    } finally {
      switching = false;
    }
  };

  const unsub = s.subscribe(() => {
    if (liveSyncOn(s.get().project) !== handled) void settle();
  });
  return () => {
    stopped = true;
    unsub();
  };
}

/**
 * With live collaboration off, nothing tells a tab that the project moved on (an AI assistant edited it, or the same
 * person changed it in another tab). So when the tab comes back into view it asks the server for the revision, a few
 * bytes, and says so if it is newer than the one this tab has. Never more than once every `every` ms, never while a save
 * is on its way, and never when there are unsaved changes (saving them says it, with the choice of what to keep).
 */
export function watchStale(s: EditorStore, onStale: () => void, every = 15000): () => void {
  const id = s.get().project.id;
  let last = 0;
  let asking = false;
  const check = async () => {
    if (liveSession() || asking || document.visibilityState === 'hidden') return;
    if (Date.now() - last < every || s.get().saveState !== 'saved') return;
    asking = true;
    last = Date.now();
    try {
      const now = await currentRevOf(id);
      const known = knownRevOf(id);
      if (now !== null && known !== undefined && now > known && s.get().saveState === 'saved' && knownRevOf(id) === known) onStale();
    } finally {
      asking = false;
    }
  };
  const onVisible = () => void check();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
  };
}
