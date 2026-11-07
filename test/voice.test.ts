// @vitest-environment node
//The Spelling test's synthesised voice: the server side (voice.js) with a stand-in speech engine, the real download and unpack with a
//small archive, and that a project whose words were spoken by the voice still gives a learner a page with no word, no respelling and no
//sentence in it. One test runs the real engine when INTERACTIVES_VOICE_DIR and INTERACTIVES_VOICE_ENGINE point at a model and sherpa-onnx-node.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import { startServer, type Harness, type User } from './helpers/server-harness';
import { newQuestion, type Question } from 'interactives-player';
// @ts-expect-error plain CommonJS
import makeVoice from '../voice.js';

const req = createRequire(import.meta.url);
const express = req('express');
const voiceLib = makeVoice as ((o: Record<string, unknown>) => { router: unknown; status: () => any; startInstall: () => any; installing: () => Promise<void> | null }) & Record<string, any>;
const { cleanRequest, unknownWords, trimSilence, joinParts, encodeWav, MODEL, VOICES } = voiceLib;

const tmp = (what: string) => fs.mkdtempSync(path.join(os.tmpdir(), `ix-voice-${what}-`));
const LEXICON = ['colour k ʌ l ə', 'the ð ə', 'of ʌ v', 'sky s k aɪ', 'is ɪ z', 'blue b l uː', "don't d oʊ n t", 'well w ɛ l', 'known n oʊ n', 'cull k ʌ l', 'er ɜː', 'necessary n ɛ s'].join('\n');

/** A model folder with the files the voice looks for (empty but for the word list) */
const modelDir = () => {
  const dir = tmp('model');
  for (const f of MODEL.files) fs.writeFileSync(path.join(dir, f), f === 'lexicon-gb-en.txt' ? LEXICON : 'x');
  return dir;
};

/** A stand-in engine: a tone per word, as long as the word, recording what it was asked for */
const calls: { text: string; sid: number; speed: number }[] = [];
const fakeEngine = {
  OfflineTts: {
    createAsync: async () => ({
      sampleRate: 24000,
      generateAsync: async (a: { text: string; sid: number; speed: number }) => {
        calls.push({ text: a.text, sid: a.sid, speed: a.speed });
        const n = 12000 + a.text.length * 1200;
        const samples = new Float32Array(n);
        //quiet lead and tail, a tone in the middle
        for (let i = 4800; i < n - 4800; i++) samples[i] = 0.3 * Math.sin(i / 20);
        return { samples, sampleRate: 24000 };
      },
    }),
  },
};

let server: { close: (cb?: () => void) => void; address: () => unknown };
let base = '';
let voice: ReturnType<typeof voiceLib>;

const post = (url: string, body: unknown) => fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

async function serve(opts: Record<string, unknown>) {
  const app = express();
  voice = voiceLib({ express, storageDir: tmp('storage'), ...opts });
  app.use('/api/voice', voice.router as never);
  await new Promise<void>((r) => (server = app.listen(0, '127.0.0.1', r)));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/voice`;
}
afterEach(async () => {
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  calls.length = 0;
});

describe('the words and the audio', () => {
  it('knows which words the voice cannot say, and lets hyphens and curly apostrophes through', () => {
    const known = new Set(['colour', 'the', "don't", 'well', 'known']);
    expect(unknownWords('The colour', known)).toEqual([]);
    expect(unknownWords('Don\u2019t', known)).toEqual([]);
    expect(unknownWords('well-known', known)).toEqual([]);
    expect(unknownWords('The xyzzy colour', known)).toEqual(['xyzzy']);
  });

  it('turns a request into a clean one, and refuses anything else', () => {
    expect(cleanRequest({ parts: [' colour '] })).toMatchObject({ parts: ['colour'], speed: 0.9, pause: 0.9, voice: { id: 'bf_emma' } });
    expect(cleanRequest({ text: 'colour', voice: 'bm_george', speed: 9 })).toMatchObject({ speed: 1.5, voice: { id: 'bm_george', sid: 26 } });
    for (const bad of [null, [], {}, { parts: [] }, { parts: [''] }, { parts: [1] }, { parts: ['a', 'b', 'c', 'd', 'e'] }, { parts: ['x'.repeat(301)] }, { parts: ['a'], voice: 'af_heart' }, { parts: ['a'], speed: 'fast' }]) expect(cleanRequest(bad), JSON.stringify(bad)).toBeNull();
  });

  it('offers British voices only, by the ids in the model\'s own table', () => {
    expect(VOICES.map((v: any) => v.id).sort()).toEqual(['bf_alice', 'bf_emma', 'bf_isabella', 'bf_lily', 'bm_daniel', 'bm_fable', 'bm_george', 'bm_lewis']);
    expect(VOICES.every((v: any) => v.accent === 'British')).toBe(true);
  });

  it('trims the silence to a short lead and tail, joins parts with a pause, and evens the level', () => {
    const rate = 1000;
    const s = new Float32Array(3000);
    for (let i = 1000; i < 2000; i++) s[i] = 0.2;
    const t = trimSilence(s, rate, 0.1, 0.2);
    expect(t.length).toBe(1000 + 100 + 200);
    const joined = joinParts([t, t], rate, 0.5);
    expect(joined.length).toBe(t.length * 2 + 500);
    const peak = joined.reduce((m: number, v: number) => Math.max(m, Math.abs(v)), 0);
    expect(peak).toBeGreaterThan(0.75);
    expect(peak).toBeLessThanOrEqual(0.81);
    expect(joined[0]).toBe(0);
    expect(joined[joined.length - 1]).toBe(0);
  });

  it('writes a wav that is only the format and the sound, with no tag a word could be in', () => {
    const wav = encodeWav(new Float32Array([0, 0.5, -0.5, 1]), 24000) as Buffer;
    expect(wav.length).toBe(44 + 8);
    expect(wav.toString('latin1', 0, 4)).toBe('RIFF');
    expect(wav.toString('latin1', 8, 16)).toBe('WAVEfmt ');
    expect(wav.toString('latin1', 36, 40)).toBe('data');
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.readInt16LE(46)).toBe(16384);
    expect(wav.toString('latin1')).not.toMatch(/LIST|INFO|ID3/);
  });
});

describe('the voice service', () => {
  it('says plainly when the speech engine is not installed', async () => {
    await serve({
      dir: modelDir(),
      load: () => {
        throw new Error("Cannot find module 'sherpa-onnx-node'");
      },
    });
    const s = await (await fetch(base)).json();
    expect(s.state).toBe('unsupported');
    expect(s.error).toMatch(/npm install/);
    const r = await post('/speak', { parts: ['colour'] });
    expect(r.status).toBe(503);
    expect((await r.json()).code).toBe('unsupported');
    //and it does not start a download it could not use
    expect((await (await post('/install', {})).json()).state).toBe('unsupported');
  });

  it('is missing until the model is there, and a box that has it set by hand never downloads', async () => {
    const empty = tmp('empty');
    const fetchSpy = vi.fn();
    await serve({ dir: empty, load: () => fakeEngine, fetch: fetchSpy });
    expect((await (await fetch(base)).json()).state).toBe('missing');
    const r = await post('/speak', { parts: ['colour'] });
    expect(r.status).toBe(503);
    expect((await r.json()).code).toBe('missing');
    process.env.INTERACTIVES_VOICE_DIR = empty;
    try {
      await new Promise<void>((r2) => server.close(() => r2()));
      await serve({ load: () => fakeEngine, fetch: fetchSpy });
      const after = await (await post('/install', {})).json();
      expect(after.state).toBe('failed');
      expect(after.error).toMatch(/by hand/);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      delete process.env.INTERACTIVES_VOICE_DIR;
    }
  });

  it('speaks the parts in order with the chosen voice and speed, and answers with a plain wav', async () => {
    await serve({ dir: modelDir(), load: () => fakeEngine });
    expect((await (await fetch(base)).json()).state).toBe('ready');
    const r = await post('/speak', { parts: ['Colour', 'The colour of the sky is blue.', 'colour'], voice: 'bm_george', speed: 0.8 });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('audio/wav');
    expect(r.headers.get('cache-control')).toBe('no-store');
    const wav = Buffer.from(await r.arrayBuffer());
    expect(wav.toString('latin1', 0, 4)).toBe('RIFF');
    expect(wav.length).toBeGreaterThan(44 + 24000);
    expect(calls.map((c) => c.text)).toEqual(['Colour', 'The colour of the sky is blue.', 'colour']);
    expect(calls.every((c) => c.sid === 26 && c.speed === 0.8)).toBe(true);
    //none of the words are inside the audio file
    expect(wav.toString('latin1')).not.toMatch(/colour|sky/i);
  });

  it('gives the engine a plain apostrophe', async () => {
    await serve({ dir: modelDir(), load: () => fakeEngine });
    expect((await post('/speak', { parts: ['Don\u2019t'] })).status).toBe(200);
    expect(calls[0].text).toBe("Don't");
  });

  it('refuses a word the voice does not know, with what to do about it, before it makes any sound', async () => {
    await serve({ dir: modelDir(), load: () => fakeEngine });
    const r = await post('/speak', { parts: ['colour', 'xyzzyqt'] });
    expect(r.status).toBe(422);
    const body = await r.json();
    expect(body).toMatchObject({ code: 'unknown-word', word: 'xyzzyqt' });
    expect(body.error).toMatch(/Say it like/);
    expect(calls).toEqual([]);
    //a respelling in plain words is fine
    expect((await post('/speak', { parts: ['cull er'] })).status).toBe(200);
  });

  it('refuses what is not a request', async () => {
    await serve({ dir: modelDir(), load: () => fakeEngine });
    expect((await post('/speak', { parts: [] })).status).toBe(400);
    expect((await post('/speak', { parts: ['colour'], voice: 'nobody' })).status).toBe(400);
  });

  it('downloads the model once, checks it, unpacks only the files it uses and then is ready', async () => {
    const src = tmp('src');
    const top = path.join(src, MODEL.id);
    fs.mkdirSync(path.join(top, 'espeak-ng-data'), { recursive: true });
    for (const f of [...MODEL.files, 'voices-extra.bin']) fs.writeFileSync(path.join(top, f), f === 'lexicon-gb-en.txt' ? LEXICON : `file ${f}`);
    fs.writeFileSync(path.join(top, 'espeak-ng-data', 'big'), 'not needed');
    const archive = path.join(tmp('archive'), 'm.tar.bz2');
    execFileSync('tar', ['-cjf', archive, '-C', src, MODEL.id]);
    const bytes = fs.readFileSync(archive);
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    const storageDir = tmp('storage');
    let asked = 0;
    const getFetch = async (url: string) => {
      asked++;
      expect(url).toBe(MODEL.url);
      return new Response(bytes, { status: 200, headers: { 'content-length': String(bytes.length) } });
    };
    await serve({ storageDir, load: () => fakeEngine, fetch: getFetch, sha256, dir: undefined });
    //the service lays its folder under storage/_voice
    expect((await (await fetch(base)).json()).state).toBe('missing');
    const started = await (await post('/install', {})).json();
    expect(started.state).toBe('installing');
    //asking again while it runs does not start another
    await post('/install', {});
    await voice.installing();
    expect((await (await fetch(base)).json()).state).toBe('ready');
    expect(asked).toBe(1);
    const dir = path.join(storageDir, '_voice', MODEL.id);
    expect(fs.readdirSync(dir).sort()).toEqual([...MODEL.files].sort());
    expect(fs.readdirSync(path.dirname(dir))).toEqual([MODEL.id]);
    expect((await post('/speak', { parts: ['colour'] })).status).toBe(200);
  });

  it('throws away a download that is not the file it should be, and says so', async () => {
    const bytes = Buffer.from('not the model');
    const storageDir = tmp('storage');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await serve({ storageDir, load: () => fakeEngine, fetch: async () => new Response(bytes, { status: 200 }) });
    await post('/install', {});
    await voice.installing();
    const s = await (await fetch(base)).json();
    expect(s.state).toBe('failed');
    expect(s.error).toMatch(/did not match/);
    expect(fs.existsSync(path.join(storageDir, '_voice', MODEL.id))).toBe(false);
    expect(fs.readdirSync(path.join(storageDir, '_voice'))).toEqual([]);
    vi.restoreAllMocks();
  });

  it('reports a download the host refused', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await serve({ storageDir: tmp('storage'), load: () => fakeEngine, fetch: async () => new Response('no', { status: 404 }) });
    await post('/install', {});
    await voice.installing();
    const s = await (await fetch(base)).json();
    expect(s.state).toBe('failed');
    expect(s.error).toMatch(/404/);
    vi.restoreAllMocks();
  });
});

//--- Through the real server: a project whose words the voice spoke

const ann: User = { username: 'ann', fullName: 'Ann A' };
const b64 = (s: string) => Buffer.from(s).toString('base64');
const WORDS = ['colour', 'organise'];
const pageOf = (project: unknown) => `<!doctype html><html><head><title>x</title></head><body><script type="application/json" id="ix-project">${JSON.stringify(project).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')}</script><script>player()</script></body></html>`;
const projectIn = (html: string) => JSON.parse(html.split('id="ix-project">')[1].split('</script>')[0]);

describe('a spelling test the voice made', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startServer();
  });
  afterAll(async () => {
    await h.close();
  });

  const word = (w: string, n: number): Question => ({
    ...newQuestion('blank', `w${n}`),
    serverMarked: true,
    attempts: 1,
    prompt: 'Spell the word you hear.',
    blanks: [{ id: 'b1', label: 'Word', answers: [w], spelling: true }],
    voice: { voice: 'bf_emma', speed: 0.9, say: n === 1 ? 'cull er' : '', sentence: n === 1 ? `The ${w} of the sky is blue.` : '', twice: true, node: `n${n}`, asset: `as${n}` },
  });
  //Audio as the voice makes it: a plain wav from encodeWav, named after its question (not its word)
  const wavAsset = (n: number) => {
    const wav = encodeWav(new Float32Array(2400).fill(0.2), 24000) as Buffer;
    return { id: `as${n}`, name: `Spoken word w${n}.wav`, mime: 'audio/wav', size: wav.length, src: `data:audio/wav;base64,${wav.toString('base64')}` };
  };
  const project = (id: string) => ({
    format: 'interactives',
    id,
    name: `Voice ${id}`,
    settings: {},
    assets: WORDS.map((_, i) => wavAsset(i + 1)),
    variables: [],
    artboards: [
      {
        id: 'ab1',
        name: 'Main',
        width: 800,
        height: 600,
        background: { type: 'solid', color: '#123456' },
        logic: { nodes: WORDS.map((_, i) => ({ id: `n${i + 1}`, kind: 'action.sound', x: 0, y: 0, params: { asset: `as${i + 1}`, volume: 1 } })), edges: [] },
        children: WORDS.map((w, i) => ({ id: `f${i + 1}`, type: 'frame', name: `Word ${i + 1}`, x: 0, y: 0, width: 100, height: 100, children: [], question: word(w, i + 1) })),
      },
    ],
  });

  it('serves the sound and none of the word, how it was said or the sentence', async () => {
    const id = 'prvoice001';
    const p = project(id);
    expect((await h.call('PUT', `/api/projects/${id}`, { user: ann, json: { project: p, rev: 0 } })).status).toBe(200);
    const r = await h.call('PUT', `/api/projects/${id}/share`, { user: ann, body: pageOf(p), type: 'text/html' });
    expect(r.json.marking.questions).toBe(2);
    const page = (await h.call('GET', `/s/${r.json.share.token}`)).text;
    for (const secret of [...WORDS, 'cull er', 'sky', 'bf_emma', 'Spoken word']) expect(page.toLowerCase(), secret).not.toContain(secret.toLowerCase());
    const served = projectIn(page);
    expect(served.artboards[0].children[0].question.voice).toBeUndefined();
    expect(served.artboards[0].children[0].question.blanks[0].answers).toEqual([]);
    //the sound is there, renamed, and still a wav the Play sound node points at
    expect(served.assets.map((a: any) => a.name)).toEqual(['audio-1.wav', 'audio-2.wav']);
    expect(served.assets[0].src.startsWith('data:audio/wav;base64,')).toBe(true);
    expect(served.artboards[0].logic.nodes[0].params.asset).toBe('as1');
    //and the server still has the key, voice settings and all, for the owner
    const key = (h.db.projects.docs.find((d: any) => d._id === id) as any).marking.questions;
    expect(JSON.stringify(key)).toContain('colour');
  });

  it('a practice word (the device voice) stays in the page and the server does not mark it', async () => {
    const id = 'prvoice002';
    const p = project(id);
    (p.artboards[0].children[0] as any).question = { ...word('colour', 1), serverMarked: undefined, voice: { device: true, node: 'n1' } };
    (p.artboards[0].logic.nodes[0] as any) = { id: 'n1', kind: 'action.speak', x: 0, y: 0, params: { op: 'text', text: '"colour"' } };
    expect((await h.call('PUT', `/api/projects/${id}`, { user: ann, json: { project: p, rev: 0 } })).status).toBe(200);
    const r = await h.call('PUT', `/api/projects/${id}/share`, { user: ann, body: pageOf(p), type: 'text/html' });
    expect(r.json.marking.questions).toBe(1);
    const served = projectIn((await h.call('GET', `/s/${r.json.share.token}`)).text);
    expect(served.artboards[0].children[0].question.answersOnServer).toBeUndefined();
    expect(served.artboards[0].children[0].question.blanks[0].answers).toEqual(['colour']);
  });

  it('is under /api: a staff session wanted, and not offered to a learner link', async () => {
    const s = await h.call('GET', '/api/voice', { user: ann });
    expect(s.status).toBe(200);
    expect(['unsupported', 'missing', 'ready']).toContain(s.json.state);
    expect(s.json.voices.length).toBe(8);
    expect(s.headers.get('cache-control')).toMatch(/no-store|no-cache/);
    const learner = await h.call('GET', '/learn/anything/voice', { user: null });
    expect(learner.status).not.toBe(200);
    b64('');
  });
});

//--- The real engine, when there is one to hand

const realDir = process.env.INTERACTIVES_VOICE_DIR;
const realEngine = process.env.INTERACTIVES_VOICE_ENGINE;
describe.skipIf(!realDir || !realEngine)('the real speech engine', () => {
  it('makes real speech: a word, a sentence and the word again, in a wav of a sensible length', async () => {
    delete process.env.INTERACTIVES_VOICE_DIR;
    await serve({ dir: realDir, load: () => req(realEngine!) });
    const r = await post('/speak', { parts: ['colour', 'The colour of the sky is blue.', 'colour'], voice: 'bf_emma', speed: 0.9 });
    expect(r.status).toBe(200);
    const wav = Buffer.from(await r.arrayBuffer());
    const seconds = (wav.length - 44) / 2 / wav.readUInt32LE(24);
    expect(seconds).toBeGreaterThan(3);
    expect(seconds).toBeLessThan(12);
    const unknown = await post('/speak', { parts: ['xyzzyqt'] });
    expect(unknown.status).toBe(422);
    process.env.INTERACTIVES_VOICE_DIR = realDir;
  }, 60000);
});
