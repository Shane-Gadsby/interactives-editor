// @vitest-environment node
//The bin's sweep: a project in the bin longer than 30 days is purged (revisions, records, comments, its files) at the
//next sweep, every 6 hours. Its own file, because the sweep's interval is set up as the server starts, and the clock
//has to be fake by then.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, type Harness } from './helpers/server-harness';

const DAY = 24 * 60 * 60 * 1000;
let h: Harness;
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  h = await startServer();
});
afterAll(async () => {
  vi.useRealTimers();
  await h.close();
});

describe('the bin sweep', () => {
  it('purges what has been in the bin over 30 days and leaves the rest', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const row = (id: string, days: number) => ({ _id: id, name: id, owner: { username: 'ann' }, doc: '{}', rev: 1, binned: { at: new Date(Date.now() - days * DAY), by: null } });
    h.db['projects-bin'].docs.push(row('prold00001', 31), row('prnew00001', 29));
    h.db.revisions.docs.push({ _id: 'r1', project: 'prold00001', created: new Date() }, { _id: 'r2', project: 'prnew00001', created: new Date() });
    h.db['interactives-user-data'].docs.push({ _id: 'u1', project: 'prold00001' });
    h.db.comments.docs.push({ _id: 'c1', project: 'prold00001' });
    fs.mkdirSync(path.join(h.storage, '_bin', 'prold00001', 'files'), { recursive: true });

    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
    await vi.waitFor(() => expect(h.db['projects-bin'].docs.map((d) => d._id)).toEqual(['prnew00001']));
    expect(h.db.revisions.docs.map((d) => d._id)).toEqual(['r2']);
    expect(h.db['interactives-user-data'].docs).toHaveLength(0);
    expect(h.db.comments.docs).toHaveLength(0);
    expect(fs.existsSync(path.join(h.storage, '_bin', 'prold00001'))).toBe(false);
  });
});
