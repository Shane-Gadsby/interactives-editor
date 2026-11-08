// @vitest-environment node
//Sticky notes against the real index.js and the in-memory mongo: they save with the project and come back for its owner, but a share
//page is stripped of them on the way in (even one from an old editor tab that still carried them), and so is the project a
//review link hands out. The stored project keeps them.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startServer, type Harness, type User } from './helpers/server-harness';

const ann: User = { username: 'ann', fullName: 'Ann A' };
const SECRET = 'NOTE-TEXT-must-not-ship-77';

const project = (id: string) => ({
  format: 'interactives',
  id,
  name: `Project ${id}`,
  settings: {},
  variables: [],
  notes: [{ id: 'cn', x: -200, y: 0, w: 200, h: 100, text: `${SECRET} canvas` }],
  artboards: [{ id: 'ab1', name: 'Main', width: 800, height: 600, background: { type: 'solid', color: '#123456' }, children: [], logic: { nodes: [], edges: [] }, notes: [{ id: 'an', x: 5, y: 5, w: 200, h: 100, text: `${SECRET} artboard` }] }],
});
const pageOf = (p: unknown) => `<!doctype html><html><head><title>x</title></head><body><script type="application/json" id="ix-project">${JSON.stringify(p).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')}</script><script>/*player*/</script></body></html>`;
const projectIn = (html: string) => JSON.parse(html.split('id="ix-project">')[1].split('</script>')[0]);

let h: Harness;
beforeAll(async () => {
  h = await startServer();
});
afterAll(async () => {
  await h.close();
});
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'trace').mockImplementation(() => {});
  process.env.SUITE_SESSION_ENFORCE = '';
  for (const c of [h.db.projects, h.db.revisions, h.db.prefs]) c.docs = [];
});

describe('notes on the server', () => {
  it('are saved with the project and come back to the editor', async () => {
    await h.call('PUT', '/api/projects/prnote0001', { user: ann, json: { project: project('prnote0001'), rev: 0 } });
    const back = (await h.call('GET', '/api/projects/prnote0001', { user: ann })).json.project;
    expect(back.artboards[0].notes[0].text).toContain(SECRET);
    expect(back.notes[0].text).toContain(SECRET);
  });

  it('are taken out of a share page, even one that arrives with them', async () => {
    const p = project('prnote0002');
    await h.call('PUT', '/api/projects/prnote0002', { user: ann, json: { project: p, rev: 0 } });
    const r = await h.call('PUT', '/api/projects/prnote0002/share', { user: ann, body: pageOf(p), type: 'text/html' });
    expect(r.status).toBe(200);
    const served = (await h.call('GET', `/s/${r.json.share.token}`)).text;
    expect(served).not.toContain(SECRET);
    const shipped = projectIn(served);
    expect(shipped.notes).toBeUndefined();
    expect(shipped.artboards[0].notes).toBeUndefined();
    expect(shipped.artboards[0].name).toBe('Main');
    //the project itself still has them
    expect((await h.call('GET', '/api/projects/prnote0002', { user: ann })).json.project.notes[0].text).toContain(SECRET);
  });

  it('refuses a share page that mentions notes in a project it cannot read, rather than keeping it', async () => {
    await h.call('PUT', '/api/projects/prnote0003', { user: ann, json: { project: project('prnote0003'), rev: 0 } });
    const bad = '<html><body><script type="application/json" id="ix-project">{"notes": [oops</script></body></html>';
    const r = await h.call('PUT', '/api/projects/prnote0003/share', { user: ann, body: bad, type: 'text/html' });
    expect(r.status).toBe(400);
    expect((h.db.projects.docs[0] as { share?: unknown }).share).toBeUndefined();
  });

  it('leave a page without any exactly as it was', async () => {
    const p = { ...project('prnote0004'), notes: undefined } as Record<string, unknown>;
    (p.artboards as { notes?: unknown }[])[0].notes = undefined;
    await h.call('PUT', '/api/projects/prnote0004', { user: ann, json: { project: p, rev: 0 } });
    const html = pageOf(p);
    const r = await h.call('PUT', '/api/projects/prnote0004/share', { user: ann, body: html, type: 'text/html' });
    expect((await h.call('GET', `/s/${r.json.share.token}`)).text).toBe(html);
  });

  it('are not in the project a review link hands to reviewers', async () => {
    await h.call('PUT', '/api/projects/prnote0005', { user: ann, json: { project: project('prnote0005'), rev: 0 } });
    const link = await h.call('PUT', '/api/projects/prnote0005/review', { user: ann, json: { guests: true } });
    const seen = await h.call('GET', `/review/${link.json.review.token}`, { user: null });
    expect(seen.status).toBe(200);
    expect(JSON.stringify(seen.json)).not.toContain(SECRET);
    expect(seen.json.project.artboards[0].name).toBe('Main');
  });
});
