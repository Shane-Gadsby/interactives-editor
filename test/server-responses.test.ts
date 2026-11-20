// @vitest-environment node
//Send a response: the server files what a learner's page sends under the person (by name only when the shared page says so),
//the time and the course, and gives the project's owner a table to download, a row per response or per item of a list in it
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startServer, type Harness, type User } from './helpers/server-harness';
// @ts-expect-error plain ESM shared with index.js
import { cleanValues, csvOf, declaredNamed, tableOf } from '../shared/collected.mjs';

const ann: User = { username: 'ann', fullName: 'Ann A' };
const sam: User = { username: 'sam', fullName: 'Sam S', course: 'MAT1000_2026_S1' };
const bob: User = { username: 'bob' };
const project = (id: string) => ({ format: 'interactives', id, name: `Sort ${id}`, settings: {}, artboards: [{ id: 'ab1', name: 'Main', width: 800, height: 600, children: [] }] });

let h: Harness;
beforeAll(async () => {
  h = await startServer();
});
afterAll(async () => {
  await h.close();
});
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  process.env.SUITE_SESSION_ENFORCE = '';
  for (const c of [h.db.projects, h.db.responses]) c.docs = [];
});

const share = async (id: string, page: string) => {
  await h.call('PUT', `/api/projects/${id}`, { user: ann, json: { project: project(id), rev: 0 } });
  return (await h.call('PUT', `/api/projects/${id}/share`, { user: ann, body: page, type: 'text/plain' })).json.share.token as string;
};
const send = (t: string, user: User | null, body: unknown) => h.call('POST', `/learn/${t}/responses`, { user, json: body });
const sort = [{ card: 'apple', group: 'Fruit' }, { card: 'leek', group: 'Veg' }];

describe('what a learner may send', () => {
  it('keeps plain values of a sane size and nothing else', () => {
    expect(cleanValues({ a: 1, b: [1, 'x'], c: { d: true }, __proto__: { x: 1 } })).toEqual({ a: 1, b: [1, 'x'], c: { d: true } });
    expect(cleanValues({ big: 'x'.repeat(30000) })).toEqual({ big: 'x'.repeat(2000) });
    expect(cleanValues(Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, 'x'.repeat(2000)])))).toBeNull();
    expect(cleanValues(undefined)).toBeNull();
    expect(declaredNamed('<script id="ix-project">{"settings":{"responses":{"named":true}}}</script>')).toBe(true);
    expect(declaredNamed('<script id="ix-project">{"settings":{}}</script>')).toBe(false);
  });
});

describe('responses on the server', () => {
  it('files them under a code that is the same for the person, without a name, unless the page says names', async () => {
    const t = await share('prresp0001', '<html>{"settings":{}}</html>');
    expect((await send(t, sam, { set: 'card-sort', values: { placements: sort } })).json).toEqual({ available: true, ok: true });
    await send(t, sam, { set: 'card-sort', values: { placements: sort } });
    const rows = h.db.responses.docs;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ set: 'card-sort', course: 'MAT1000_2026_S1' });
    expect(rows[0].username).toBeUndefined();
    expect(rows[0].person).toBe(rows[1].person);
    //nobody known: nothing kept
    expect((await send(t, null, { values: { a: 1 } })).json).toEqual({ available: false });
    expect(rows).toHaveLength(2);
    const named = await share('prresp0002', '<html>{"settings":{"responses":{"named":true}}}</html>');
    await send(named, sam, { values: { mood: 'good' } });
    expect(h.db.responses.docs.find((r) => r.values.mood)).toMatchObject({ username: 'sam', name: 'Sam S' });
  });

  it('shows the owner a table and downloads, a row per item of a list for a card sort, and only the owner may clear them', async () => {
    const t = await share('prresp0003', '<html>{"settings":{}}</html>');
    await send(t, sam, { set: 'card-sort', values: { round: 1, placements: sort } });
    const list = await h.call('GET', '/api/projects/prresp0003/responses', { user: ann });
    expect(list.json).toMatchObject({ sets: ['card-sort'], count: 1, named: false });
    const csv = await h.call('GET', '/api/projects/prresp0003/responses.csv?per=item', { user: ann });
    const lines = csv.text.replace(/^﻿/, '').split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('placements.card');
    expect(lines[1]).toContain('apple');
    expect((await h.call('GET', '/api/projects/prresp0003/responses.json', { user: ann })).json[0].values.placements).toHaveLength(2);
    process.env.SUITE_SESSION_ENFORCE = '1';
    const other = await h.call('GET', '/api/projects/prresp0003/responses', { user: bob });
    process.env.SUITE_SESSION_ENFORCE = '';
    expect(other.status, JSON.stringify(other.json).slice(0, 200)).toBe(403);
    expect((await h.call('DELETE', '/api/projects/prresp0003/responses', { user: ann })).json).toEqual({ ok: true, deleted: 1 });
  });

  it('writes a cell a spreadsheet would run as a formula as text', () => {
    expect(csvOf(tableOf([{ set: 's', at: new Date(0), person: 'x', values: { a: '=1+1' } }]))).toContain("'=1+1");
  });
});

describe('who is looking', () => {
  it('says whether they own or help make the project, and only the groups it asks about', async () => {
    const t = await share('prwho00001', '<html>{"settings":{"askGroups":["power-user","tutors"]}}</html>');
    const who = (user: User | null) => h.call('GET', `/learn/${t}/who`, { user });
    expect((await who(ann)).json).toMatchObject({ isOwner: true, isCollaborator: false });
    expect((await who(sam)).json).toEqual({ isOwner: false, isCollaborator: false, isPower: false, groups: [] });
    expect((await who({ ...sam, access: ['published', 'tutors', 'secret-club'] } as User)).json.groups).toEqual(['tutors']);
    //an admin showing the course as a student is nobody special
    expect((await who({ ...ann, access: ['published', 'tutors', 'presentation-mode'] } as User)).json).toMatchObject({ isOwner: false, groups: [] });
    expect((await who(null)).json.isOwner).toBe(false);
  });
});

describe('Save setup on the server', () => {
  it('keeps the values for everyone, written only by those who may edit the app', async () => {
    const t = await share('prsetup001', '<html>{"settings":{}}</html>');
    const save = (user: User, values: unknown, setup = '') => h.call('POST', `/learn/${t}/saved-setup`, { user, json: { setup, values } });
    //someone who neither owns it, helps make it, nor is staff
    expect((await save(sam, { tiles: ['x'] })).json).toEqual({ available: true, ok: false, problem: 'not-allowed' });
    expect((await save(ann, { tiles: ['x', 'y'] })).json).toEqual({ available: true, ok: true });
    expect((await save(ann, { tiles: ['z'] }, 'st2')).json.ok).toBe(true);
    expect((await h.call('GET', `/learn/${t}/saved-setup`, { user: sam })).json.values).toEqual({ tiles: ['x', 'y'] });
    expect((await h.call('GET', `/learn/${t}/saved-setup?setup=st2`, { user: sam })).json.values).toEqual({ tiles: ['z'] });
  });
});
