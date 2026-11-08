import { beforeEach, describe, expect, it } from 'vitest';
import { createProject, uid } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { track } from '../src/lib/analytics';
import { JOBS, dismissStrip, jobDone, jobFor, jobsDone, markJob, markWelcomed, noteEssentialsApplied, pointerEdges, restartTips, stripShown, wantsEssentials, watchGettingStarted } from '../src/lib/onboarding';
import { defaultLayout, setDock } from '../src/lib/dock';
import { prefs, setPrefs } from '../src/lib/prefs';

beforeEach(() => {
  localStorage.clear();
  setPrefs({ onboarding: {}, gettingStarted: true });
  setDock(defaultLayout());
  // setDock keeps what it is given in this browser, and a person who has never arranged anything has nothing kept
  localStorage.removeItem('ix-dock-v1');
});

describe('the jobs on the Getting started strip', () => {
  it('lists five, each with a tutorial that exists', async () => {
    expect(JOBS.map((j) => j.id)).toEqual(['shape', 'move', 'click', 'preview', 'share']);
    const { getTopic } = await import('../src/help/topics');
    for (const j of JOBS) expect(getTopic(j.tutorial), j.tutorial).toBeTruthy();
  });

  it('is shown until it is put away, switched off in Preferences, or every job is ticked', () => {
    expect(stripShown()).toBe(true);
    setPrefs({ gettingStarted: false });
    expect(stripShown()).toBe(false);
    setPrefs({ gettingStarted: true });
    expect(stripShown()).toBe(true);
    dismissStrip();
    expect(stripShown()).toBe(false);
    restartTips();
    expect(stripShown()).toBe(true);
    for (const j of JOBS) markJob(j.id);
    expect(jobsDone()).toBe(5);
    expect(stripShown()).toBe(false);
  });

  it('turning it back on keeps what was ticked, unless all five were', () => {
    markJob('shape');
    dismissStrip();
    restartTips();
    expect(jobDone('shape')).toBe(true);
    expect(stripShown()).toBe(true);
    for (const j of JOBS) markJob(j.id);
    restartTips();
    expect(jobsDone()).toBe(0);
    expect(stripShown()).toBe(true);
  });

  it('is remembered in the preferences, as short booleans the server keeps', () => {
    markJob('preview');
    expect(prefs().onboarding).toEqual({ 'job-preview': true });
    expect(Object.keys(prefs().onboarding!).every((k) => k.length <= 40)).toBe(true);
  });
});

describe('ticking itself', () => {
  it('reads the editor\'s own events', () => {
    expect(jobFor('node', 'add', 'rect')).toBe('shape');
    expect(jobFor('inspector', 'change', 'x')).toBe('move');
    expect(jobFor('inspector', 'change', 'y')).toBe('move');
    expect(jobFor('inspector', 'change', 'fill')).toBeNull();
    expect(jobFor('preview', 'loaded', 'preview')).toBe('preview');
    expect(jobFor('preview', 'loaded', 'canvas')).toBeNull();
    expect(jobFor('preview', 'open', 'modal')).toBe('preview');
    expect(jobFor('feature', 'share-publish', undefined)).toBe('share');
    expect(jobFor('feature', 'share-stop', undefined)).toBeNull();
  });

  it('ticks add, move, preview and share from the events, and click from a new connection', () => {
    const store = new EditorStore(createProject('T'));
    setCurrentStore(store);
    const stop = watchGettingStarted(store);
    track('node', 'add', { thing: 'rect' });
    expect(jobDone('shape')).toBe(true);
    expect(jobDone('move')).toBe(false);
    track('inspector', 'change', { thing: 'x', detail: { node: 'rect' } });
    expect(jobDone('move')).toBe(true);
    track('preview', 'loaded', { thing: 'preview' });
    expect(jobDone('preview')).toBe(true);
    track('feature', 'share-publish');
    expect(jobDone('share')).toBe(true);
    expect(jobDone('click')).toBe(false);
    store.update((d) => {
      const ab = d.artboards[0];
      const on = { id: uid('ln'), kind: 'event.pointer', x: 0, y: 0, params: {} };
      const act = { id: uid('ln'), kind: 'action.log', x: 200, y: 0, params: {} };
      ab.logic.nodes.push(on, act);
      ab.logic.edges.push({ id: uid('le'), from: on.id, fromPort: 'out', to: act.id, toPort: 'in' });
    });
    expect(jobDone('click')).toBe(true);
    stop();
  });

  it('does not tick click for a connection the project already had, or for one from another kind of event', () => {
    const project = createProject('T');
    const ab = project.artboards[0];
    const on = { id: 'a', kind: 'event.pointer', x: 0, y: 0, params: {} };
    const go = { id: 'b', kind: 'action.log', x: 0, y: 0, params: {} };
    ab.logic.nodes.push(on, go);
    ab.logic.edges.push({ id: 'e1', from: 'a', fromPort: 'out', to: 'b', toPort: 'in' });
    expect(pointerEdges(project)).toBe(1);
    const store = new EditorStore(project);
    const stop = watchGettingStarted(store);
    store.update((d) => void (d.name = 'Renamed'));
    expect(jobDone('click')).toBe(false);
    store.update((d) => {
      const a = d.artboards[0];
      a.logic.nodes.push({ id: 'k', kind: 'event.key', x: 0, y: 0, params: {} });
      a.logic.edges.push({ id: 'e2', from: 'k', fromPort: 'out', to: 'b', toPort: 'in' });
    });
    expect(jobDone('click')).toBe(false);
    stop();
  });

  it('stops listening when the editor closes', () => {
    const store = new EditorStore(createProject('T'));
    watchGettingStarted(store)();
    track('node', 'add', { thing: 'rect' });
    expect(jobDone('shape')).toBe(false);
  });
});

describe('a new person', () => {
  it('is welcomed once and gets Essentials once', () => {
    expect(wantsEssentials()).toBe(false);
    markWelcomed();
    expect(wantsEssentials()).toBe(true);
    noteEssentialsApplied();
    expect(wantsEssentials()).toBe(false);
    markWelcomed();
    expect(wantsEssentials()).toBe(false);
  });

  it('does not get a different layout than the one they arranged in this browser', () => {
    localStorage.setItem('ix-dock-v1', JSON.stringify(defaultLayout()));
    markWelcomed();
    expect(wantsEssentials()).toBe(false);
  });
});
