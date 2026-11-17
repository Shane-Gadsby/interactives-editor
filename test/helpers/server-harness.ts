//Runs the real index.js (untouched) in this process, with the suite libs it needs swapped for stand-ins and mongo
//swapped for FakeDb. `app.listen` is captured instead of binding port 3048, then the app is served on a random port
//so tests can talk to it with fetch. Nothing here needs a database, a session manager or haproxy.
import http from 'node:http';
import { EventEmitter } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { FakeDb } from './fake-mongo';

//tests may fake the global timers (to run the server's 30 second room timer), the helpers keep the real one
const realSetTimeout = globalThis.setTimeout;

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const req = createRequire(import.meta.url);

export interface User {
  username: string;
  fullName?: string;
  /** What a room shows for the person when it goes by first names. */
  firstName?: string;
  power?: boolean;
  /** The course the session is launched from (activity.courseLabel). */
  course?: string;
}

export interface Reply {
  status: number;
  headers: Headers;
  text: string;
  json: any;
  bytes: Buffer;
}

export interface Harness {
  base: string;
  db: FakeDb;
  storage: string;
  /** Run the request as this user (no user: no session). */
  as(user: User | null): Harness['call'];
  call(method: string, url: string, opts?: { user?: User | null; json?: unknown; body?: string | Buffer; type?: string; headers?: Record<string, string> }): Promise<Reply>;
  /** Open an SSE stream; events come back parsed. */
  stream(url: string, opts?: { user?: User | null }): Promise<Stream>;
  close(): Promise<void>;
}

export interface Stream {
  events: { event: string; data: any; id?: string }[];
  waitFor(pred: (e: { event: string; data: any }) => boolean, ms?: number): Promise<{ event: string; data: any }>;
  close(): void;
}

export const sessionHeader = (u: User | null | undefined) => (u ? JSON.stringify({ user: { username: u.username, fullName: u.fullName ?? u.username, ...(u.firstName ? { firstName: u.firstName } : {}), userID: 1 }, access: { power: !!u.power }, activity: u.course ? { courseLabel: u.course, courseCode: u.course.split('_')[0], lmsURL: 'https://lms.example' } : {} }) : undefined);

export async function startServer(): Promise<Harness> {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'ix-storage-'));
  process.env.INTERACTIVES_STORAGE = storage;
  // The background compressing of dist would burn seconds of cpu in every test file that starts a server
  process.env.INTERACTIVES_PRECOMPRESS ??= '0';
  const db = new FakeDb();
  const realExpress = req('express');
  let captured: any = null;
  let listened: () => void = () => {};
  // app.listen's return value: the server code hangs its 'upgrade' listener (rooms, a WebSocket) on it, and the real server below hands its upgrades on
  const fakeServer = new EventEmitter();
  const listening = new Promise<void>((r) => (listened = r));

  const wrapped: any = function (...args: unknown[]) {
    const app = realExpress(...args);
    app.listen = (_port: number, cb?: (err?: Error) => void) => {
      captured = app;
      cb?.();
      listened();
      return fakeServer;
    };
    return app;
  };
  Object.assign(wrapped, realExpress);

  const stubs: Record<string, unknown> = {
    '../suite-libs/crash-guard': {},
    '../suite-libs/mongo-connect': () => ({ connect: async () => {}, db: () => ({ collection: (n: string) => (db as any)[n] }) }),
    '../suite-libs/version-reporting': () => {},
    //x-test-tool stands in for a direct sign in token, which only answers for the tool it was issued for
    '../suite-libs/session-check': (options: { tool?: string } = {}) => (rq: any, _rs: any, next: () => void) => {
      const h = rq.get('x-test-session');
      const only = rq.get('x-test-tool');
      // a WebSocket hello carries the session in the body of its first message, where the stand-in request puts it in x-session-id
      const sid = rq.get('x-session-id');
      const raw = h || (typeof sid === 'string' && sid.startsWith('{') ? sid : undefined);
      rq.sessionData = raw && !(only && options.tool && options.tool !== only) ? JSON.parse(raw) : null;
      next();
    },
    '../suite-libs/cache-headers': {
      stampGate: (_rq: unknown, _rs: unknown, next: () => void) => next(),
      api: (_rq: unknown, rs: any, next: () => void) => {
        rs.setHeader('Cache-Control', 'no-store');
        next();
      },
      document: (_rq: unknown, _rs: unknown, next: () => void) => next(),
      staticOptions: {},
      watchEpoch: () => {},
      stampedDocument: () => () => '<!doctype html><title>stub</title>',
    },
    '../toolbox/public/sys/js/powerUser.js': { canUse: (access: any) => !!access?.power },
    express: wrapped,
  };

  const M = Module as any;
  const realLoad = M._load;
  M._load = function (request: string, parent: unknown, isMain: boolean) {
    if (request in stubs) return stubs[request];
    return realLoad.call(this, request, parent, isMain);
  };
  try {
    const indexPath = path.join(root, 'index.js');
    delete req.cache[indexPath];
    req(indexPath);
    await listening;
  } finally {
    M._load = realLoad;
  }

  const server = http.createServer(captured);
  server.on('upgrade', (...args) => fakeServer.emit('upgrade', ...args));
  // fetch reuses kept-alive sockets, and with Node's 5 s idle timeout a busy full run (the Windows box) reused one just as the
  // server closed it: ECONNRESET. Close() still ends them all
  server.keepAliveTimeout = 120_000;
  server.headersTimeout = 125_000;
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/interactives`;
  const open = new Set<AbortController>();

  const call: Harness['call'] = async (method, url, opts = {}) => {
    const headers: Record<string, string> = { ...opts.headers };
    const s = sessionHeader(opts.user);
    if (s) headers['x-test-session'] = s;
    let body: string | Buffer | undefined = opts.body;
    if (opts.json !== undefined) {
      body = JSON.stringify(opts.json);
      headers['content-type'] = 'application/json';
    } else if (opts.type) headers['content-type'] = opts.type;
    const res = await fetch(base + url, { method, headers, body: body as BodyInit | undefined });
    const bytes = Buffer.from(await res.arrayBuffer());
    const text = bytes.toString('utf8');
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { status: res.status, headers: res.headers, text, json, bytes };
  };

  const stream: Harness['stream'] = async (url, opts = {}) => {
    const ctl = new AbortController();
    open.add(ctl);
    const headers: Record<string, string> = {};
    const s = sessionHeader(opts.user);
    if (s) headers['x-test-session'] = s;
    const res = await fetch(base + url, { headers, signal: ctl.signal });
    const out: Stream = {
      events: [],
      close: () => ctl.abort(),
      waitFor: (pred, ms = 2000) =>
        new Promise((resolve, reject) => {
          const t0 = Date.now();
          const tick = () => {
            const hit = out.events.find(pred);
            if (hit) return resolve(hit);
            if (Date.now() - t0 > ms) return reject(new Error(`no matching event; saw ${out.events.map((e) => e.event).join(',')}`));
            realSetTimeout(tick, 5);
          };
          tick();
        }),
    };
    if (!res.ok || !res.body) {
      ctl.abort();
      throw Object.assign(new Error(`stream ${res.status}`), { status: res.status });
    }
    (async () => {
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i: number;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const chunk = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const ev = /^event: (.*)$/m.exec(chunk)?.[1];
            const data = /^data: (.*)$/m.exec(chunk)?.[1];
            const id = /^id: (.*)$/m.exec(chunk)?.[1];
            if (ev && data) out.events.push({ event: ev, data: JSON.parse(data), id });
          }
        }
      } catch {
        /* aborted */
      }
    })();
    return out;
  };

  return {
    base,
    db,
    storage,
    as: (user) => (m, u, o) => call(m, u, { ...o, user }),
    call,
    stream,
    close: async () => {
      for (const c of open) c.abort();
      server.closeAllConnections?.();
      await new Promise<void>((r) => server.close(() => r()));
      fs.rmSync(storage, { recursive: true, force: true });
    },
  };
}
