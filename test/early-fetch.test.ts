import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentSessionId, fetchOrEarly, takeEarly } from '../src/lib/early-fetch';

type W = { __ixEarly?: { id: string; at: number; req: Record<string, Promise<Response> | undefined> } };
const put = (id: string, req: Record<string, Promise<Response>>, at = Date.now()) => ((window as unknown as W).__ixEarly = { id, at, req });
const ok = (body: string) => Promise.resolve(new Response(body));

beforeEach(() => {
  sessionStorage.clear();
  history.replaceState(null, '', '/');
});
afterEach(() => {
  delete (window as unknown as W).__ixEarly;
  vi.unstubAllGlobals();
});

describe('the requests index.html starts before the bundle', () => {
  it('hands over a response once, for the session it was made for', async () => {
    sessionStorage.setItem('sessionID', 'abc');
    put('abc', { 'http://x/api/prefs': ok('mine') });
    const p = takeEarly('http://x/api/prefs');
    expect(p).not.toBeNull();
    expect(await (await p!).text()).toBe('mine');
    expect(takeEarly('http://x/api/prefs')).toBeNull();
  });

  it('knows the session the way the fetch header does: the url first, then the tab', () => {
    expect(currentSessionId()).toBeNull();
    sessionStorage.setItem('sessionID', 'tab');
    expect(currentSessionId()).toBe('tab');
    history.replaceState(null, '', '/?sessionID=url');
    expect(currentSessionId()).toBe('url');
  });

  it('never gives someone else the response: a different, changed or missing session is asked for again', () => {
    sessionStorage.setItem('sessionID', 'abc');
    put('someone-else', { 'http://x/api/prefs': ok('theirs') });
    expect(takeEarly('http://x/api/prefs')).toBeNull();
    sessionStorage.clear();
    put('abc', { 'http://x/api/prefs': ok('stale session') });
    expect(takeEarly('http://x/api/prefs')).toBeNull();
  });

  it('lets a response that waited too long go, and answers null with nothing started at all', () => {
    sessionStorage.setItem('sessionID', 'abc');
    put('abc', { 'http://x/api/projects/p1': ok('old') }, Date.now() - 61_000);
    expect(takeEarly('http://x/api/projects/p1')).toBeNull();
    delete (window as unknown as W).__ixEarly;
    expect(takeEarly('http://x/api/prefs')).toBeNull();
  });

  it('uses the early response in place of a request, and the ordinary request when the early one failed', async () => {
    sessionStorage.setItem('sessionID', 'abc');
    const fetchSpy = vi.fn(async () => new Response('fresh'));
    vi.stubGlobal('fetch', fetchSpy);
    put('abc', { 'http://x/api/prefs': ok('early') });
    expect(await (await fetchOrEarly('http://x/api/prefs')).text()).toBe('early');
    expect(fetchSpy).not.toHaveBeenCalled();
    const failed = Promise.reject(new TypeError('network'));
    failed.catch(() => undefined);
    put('abc', { 'http://x/api/prefs': failed });
    expect(await (await fetchOrEarly('http://x/api/prefs')).text()).toBe('fresh');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(await (await fetchOrEarly('http://x/api/prefs')).text()).toBe('fresh');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
