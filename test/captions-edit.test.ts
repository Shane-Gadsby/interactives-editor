import { describe, expect, it } from 'vitest';
import { cuesToVtt, createNode, createProject, parseCaptions, type CaptionTrack, type Project, type Timeline } from 'interactives-player';
import { addAudioTrack, addCue, captionFileName, ensureCaptionTrack, ensureCaptionVariable, importCaptionFile, mergeWithNext, narrationSpan, pasteTimingMode, pasteTranscript, shiftCues, splitCue, uncaptioned } from '../src/lib/captions-edit';
import { barsFor, peaksOf, peaksOfChannels } from '../src/lib/waveform';
import { checkAccessibility } from '../src/lib/a11y/checks';
import { analyzeUsage, unusedAssetIds } from '../src/lib/dependencies';
import { applyFix } from '../src/lib/a11y/fixes';

const tl = (over: Partial<Timeline> = {}): Timeline => ({ id: 't1', name: 'Talk', duration: 10000, loop: 'once', autoplay: false, speed: 1, tracks: [], ...over });
const asset = { id: 'as1', name: 'Voice over.mp3' };

describe('adding sound', () => {
  it('places it at the offset, names it from the file and grows the timeline to hold it', () => {
    const t = tl();
    const a = addAudioTrack(t, asset, 14000, 1500);
    expect(a).toMatchObject({ name: 'Voice over', assetId: 'as1', offset: 1500, duration: 14000, volume: 1, role: 'narration' });
    expect(t.duration).toBe(15500);
    expect(t.audio).toHaveLength(1);
  });
  it('leaves the length alone when the browser cannot tell how long the file is', () => {
    const t = tl();
    const a = addAudioTrack(t, asset, 0, 0, 'music');
    expect(a.duration).toBeUndefined();
    expect(t.duration).toBe(10000);
    expect(a.role).toBe('music');
  });
  it('finds where the narration is, ignoring music and muted tracks when it can', () => {
    const t = tl();
    addAudioTrack(t, { id: 'm', name: 'bed.mp3' }, 20000, 0, 'music');
    expect(narrationSpan(t)).toEqual({ start: 0, end: 20000 });
    addAudioTrack(t, asset, 6000, 2000);
    expect(narrationSpan(t)).toEqual({ start: 2000, end: 8000 });
    expect(narrationSpan(tl())).toBeNull();
  });
});

describe('caption tracks and cues', () => {
  it('makes a track once and finds it again by language', () => {
    const t = tl();
    const a = ensureCaptionTrack(t);
    expect(ensureCaptionTrack(t)).toBe(a);
    const fr = ensureCaptionTrack(t, 'fr');
    expect(fr.lang).toBe('fr');
    expect(ensureCaptionTrack(t, 'FR')).toBe(fr);
    expect(t.captions).toHaveLength(2);
  });
  it('keeps new cues in time order', () => {
    const track = ensureCaptionTrack(tl());
    addCue(track, 5000);
    addCue(track, 1000);
    addCue(track, 3000, 500, 'x');
    expect(track.cues.map((c) => c.start)).toEqual([1000, 3000, 5000]);
    expect(track.cues[1].end).toBe(3500);
  });
  it('splits a cue where the playhead is, sharing the words by time', () => {
    const track = ensureCaptionTrack(tl());
    const c = addCue(track, 0, 4000, 'one two three four five six seven eight');
    const second = splitCue(track, c.id, 2000)!;
    expect(track.cues.map((x) => x.text)).toEqual(['one two three four', 'five six seven eight']);
    expect(track.cues[0].end).toBe(2000);
    expect(track.cues[1]).toMatchObject({ id: second, start: 2000, end: 4000 });
    expect(splitCue(track, c.id, 0)).toBeNull();
    expect(splitCue(track, c.id, 99999)).toBeNull();
  });
  it('merges a cue with the one after it', () => {
    const track = ensureCaptionTrack(tl());
    const a = addCue(track, 0, 1000, 'Hello');
    addCue(track, 1000, 2000, 'there');
    expect(mergeWithNext(track, a.id)).toBe(a.id);
    expect(track.cues).toHaveLength(1);
    expect(track.cues[0]).toMatchObject({ text: 'Hello there', start: 0, end: 3000 });
    expect(mergeWithNext(track, a.id)).toBeNull();
  });
  it('shifts every cue, never before zero', () => {
    const track = ensureCaptionTrack(tl());
    addCue(track, 500, 1000);
    addCue(track, 3000, 1000);
    shiftCues(track, 700);
    expect(track.cues.map((c) => c.start)).toEqual([1200, 3700]);
    shiftCues(track, -5000);
    expect(track.cues.map((c) => c.start)).toEqual([0, 2500]);
  });
});

describe('pasting a transcript', () => {
  const text = 'Welcome to the course. Today we look at light. It bends in glass. Questions?';
  const opts = { by: 'sentence' as const, append: false };
  it('spreads it across the narration, in proportion to the words', () => {
    const t = tl();
    addAudioTrack(t, asset, 8000, 1000);
    const track = ensureCaptionTrack(t);
    const r = pasteTranscript(t, track, text, { ...opts, timing: 'narration' });
    expect(r).toEqual({ made: 4, stamped: false });
    expect(track.cues[0].start).toBe(1000);
    expect(track.cues[3].end).toBe(9000);
    for (let i = 1; i < 4; i++) expect(track.cues[i].start).toBe(track.cues[i - 1].end);
  });
  it('can use the whole timeline, markers, or reading speed', () => {
    const t = tl({ markers: [{ id: 'a', time: 0, name: 'a' }, { id: 'b', time: 2000, name: 'b' }, { id: 'c', time: 5000, name: 'c' }, { id: 'd', time: 8000, name: 'd' }] });
    const track = ensureCaptionTrack(t);
    pasteTranscript(t, track, text, { ...opts, timing: 'timeline' });
    expect([track.cues[0].start, track.cues[3].end]).toEqual([0, 10000]);
    pasteTranscript(t, track, text, { ...opts, timing: 'markers' });
    expect(track.cues.map((c) => c.start)).toEqual([0, 2000, 5000, 8000]);
    pasteTranscript(t, track, text, { ...opts, timing: 'rate' });
    expect(track.cues[0].start).toBe(0);
    expect(track.cues[3].end).toBeGreaterThan(5000);
  });
  it('says why it cannot time to narration or markers that are not there', () => {
    const t = tl();
    const track = ensureCaptionTrack(t);
    expect(pasteTranscript(t, track, text, { ...opts, timing: 'narration' })).toMatchObject({ error: expect.stringMatching(/no sound/) });
    expect(pasteTranscript(t, track, text, { ...opts, timing: 'markers' })).toMatchObject({ error: expect.stringMatching(/no markers/) });
    expect(pasteTranscript(t, track, '   ', { ...opts, timing: 'timeline' })).toMatchObject({ error: expect.stringMatching(/Paste/) });
    expect(track.cues).toEqual([]);
    expect(pasteTimingMode(t, 'timeline')).toEqual({ mode: { mode: 'even', start: 0, end: 10000 } });
  });
  it('keeps the times a transcript brings, needing no timing choice', () => {
    const t = tl();
    const track = ensureCaptionTrack(t);
    const r = pasteTranscript(t, track, '[0:01] Hello there.\n[0:04] Second part here.', { ...opts, timing: 'narration' });
    expect(r).toEqual({ made: 2, stamped: true });
    expect(track.cues.map((c) => c.start)).toEqual([1000, 4000]);
  });
  it('replaces by default and adds after the last when asked', () => {
    const t = tl();
    const track = ensureCaptionTrack(t);
    pasteTranscript(t, track, 'One. Two.', { ...opts, timing: 'timeline' });
    expect(track.cues).toHaveLength(2);
    pasteTranscript(t, track, 'Three. Four. Five.', { ...opts, timing: 'rate' });
    expect(track.cues).toHaveLength(3);
    const before = Math.max(...track.cues.map((c) => c.end));
    pasteTranscript(t, track, 'Six.', { ...opts, timing: 'rate', append: true });
    expect(track.cues).toHaveLength(4);
    expect(track.cues[3].start).toBeGreaterThanOrEqual(before);
  });
});

describe('importing and exporting', () => {
  it('round-trips a track through WebVTT', () => {
    const t = tl();
    const track = ensureCaptionTrack(t);
    addCue(track, 1000, 2000, 'First');
    addCue(track, 4000, 1500, 'Second\nline');
    const back: CaptionTrack = ensureCaptionTrack(tl(), 'en');
    const r = importCaptionFile(back, cuesToVtt(track.cues), false);
    expect(r.made).toBe(2);
    expect(back.cues.map((c) => [c.start, c.end, c.text])).toEqual(track.cues.map((c) => [c.start, c.end, c.text]));
  });
  it('replaces or adds, and leaves the track alone when the file has no captions', () => {
    const t = tl();
    const track = ensureCaptionTrack(t);
    addCue(track, 0, 1000, 'keep me');
    const bad = importCaptionFile(track, 'just some words', false);
    expect(bad.made).toBe(0);
    expect(bad.warnings.length).toBeGreaterThan(0);
    expect(track.cues).toHaveLength(1);
    importCaptionFile(track, '1\n00:00:05,000 --> 00:00:06,000\nnew', true);
    expect(track.cues.map((c) => c.text)).toEqual(['keep me', 'new']);
    importCaptionFile(track, '1\n00:00:05,000 --> 00:00:06,000\nonly', false);
    expect(track.cues.map((c) => c.text)).toEqual(['only']);
    expect(parseCaptions(cuesToVtt(track.cues)).cues).toHaveLength(1);
  });
  it('names the file from the project, timeline and language', () => {
    expect(captionFileName({ name: 'My Lesson!' }, { name: 'Intro talk' }, { lang: 'fr' }, 'srt')).toBe('My-Lesson-Intro-talk-fr.srt');
    expect(captionFileName({ name: '' }, { name: 'T' }, {}, 'vtt')).toBe('project-T.vtt');
  });
});

describe('the caption text variable', () => {
  it('is made once with a free name and remembered in the settings', () => {
    const p = createProject('P');
    p.variables.push({ id: 'x', name: 'captionText', type: 'string', initial: '' });
    const v = ensureCaptionVariable(p);
    expect(v.name).not.toBe('captionText');
    expect(p.settings.captions?.textVar).toBe(v.id);
    expect(ensureCaptionVariable(p)).toEqual(v);
    expect(p.variables).toHaveLength(2);
  });
});

describe('waveforms', () => {
  it('takes the loudest sample of each slice, scaled to the loudest in the file', () => {
    const data = new Float32Array([0, 0.1, -0.2, 0.05, 0.5, -0.4, 0, 0]);
    const p = Array.from(peaksOf(data, 4));
    [0.2, 0.4, 1, 0].forEach((v, i) => expect(p[i]).toBeCloseTo(v, 5));
  });
  it('is flat for silence, and copes with a file shorter than the slice count', () => {
    expect(Array.from(peaksOf(new Float32Array(100), 10))).toEqual(new Array(10).fill(0));
    expect(peaksOf(new Float32Array([0.5, 1]), 100)).toHaveLength(2);
    expect(peaksOf(new Float32Array(0), 10).length).toBe(1);
  });
  it('takes the loudest of the channels', () => {
    const p = peaksOfChannels([new Float32Array([1, 0]), new Float32Array([0, 0.5])], 2);
    //scaled together, so a quiet channel stays quieter than a loud one
    expect(Array.from(p)).toEqual([1, 0.5]);
  });
  it('turns peaks into the bars for a stretch of the clip, silent outside the file', () => {
    const w = { peaks: new Float32Array([0, 1, 0, 0.5]), duration: 4000 };
    expect(Array.from(barsFor(w, 0, 4000, 4))).toEqual([0, 1, 0, 0.5]);
    expect(Array.from(barsFor(w, 1000, 3000, 2))).toEqual([1, 0]);
    expect(Array.from(barsFor(w, 3000, 6000, 3))).toEqual([0.5, 0, 0]);
    expect(Array.from(barsFor(w, -2000, 0, 2))).toEqual([0, 0]);
    expect(barsFor(w, 5, 5, 3)).toEqual(new Float32Array(3));
  });
});

describe('what the accessibility check says about narration', () => {
  const project = (build: (t: Timeline, p: Project) => void) => {
    const p = createProject('Talk');
    p.settings.title = 'Talk';
    const t = tl();
    p.artboards[0].timelines.push(t);
    build(t, p);
    return p;
  };
  const found = (p: Project) => checkAccessibility(p).findings.filter((f) => f.check === 'captions');
  it('is an issue when narration has no captions at all', () => {
    const p = project((t) => void addAudioTrack(t, asset, 8000, 0));
    const [f] = found(p);
    expect(f.severity).toBe('issue');
    expect(f.title).toMatch(/Narration has no captions/);
    expect(f.detail).toContain('"Voice over"');
    expect(f.nodeId).toBeNull();
  });
  it('is quiet when the captions cover the narration', () => {
    const p = project((t) => {
      addAudioTrack(t, asset, 8000, 0);
      pasteTranscript(t, ensureCaptionTrack(t), 'One thing. Another thing. A third.', { timing: 'narration', by: 'sentence', append: false });
    });
    expect(found(p)).toEqual([]);
  });
  it('warns when the captions cover little of it', () => {
    const p = project((t) => {
      addAudioTrack(t, asset, 8000, 0);
      addCue(ensureCaptionTrack(t), 0, 1500, 'Only the start');
    });
    const [f] = found(p);
    expect(f.severity).toBe('warning');
    expect(f.detail).toMatch(/19%/);
  });
  it('does not ask for captions on music, effects or a muted track', () => {
    const p = project((t) => {
      addAudioTrack(t, { id: 'm', name: 'bed.mp3' }, 8000, 0, 'music');
      addAudioTrack(t, { id: 'e', name: 'ding.mp3' }, 800, 0, 'effect');
      addAudioTrack(t, asset, 8000, 0).muted = true;
    });
    expect(found(p)).toEqual([]);
    expect(uncaptioned(p.artboards[0].timelines[0])).toEqual([]);
  });
  it('takes the language track that covers the most', () => {
    const p = project((t) => {
      addAudioTrack(t, asset, 8000, 0);
      addCue(ensureCaptionTrack(t, 'fr'), 0, 500, 'Un peu');
      pasteTranscript(t, ensureCaptionTrack(t, 'en'), 'A whole. Set of. Captions here.', { timing: 'narration', by: 'sentence', append: false });
    });
    expect(found(p)).toEqual([]);
  });
  it('accepts captions imported for a video layer, and still asks about one without', () => {
    const p = createProject('V');
    p.settings.title = 'V';
    const v = createNode('video', { src: 'x.mp4', controls: true, ariaLabel: 'Intro' });
    p.artboards[0].children.push(v);
    expect(found(p)).toHaveLength(1);
    (v as unknown as { captions: unknown }).captions = [{ id: 'c', start: 0, end: 1000, text: 'Hi' }];
    expect(found(p)).toEqual([]);
  });
  it('warns about sound that starts itself when the viewer buttons are hidden, and the fix shows them', () => {
    const p = project((t, pr) => {
      t.autoplay = true;
      addAudioTrack(t, asset, 8000, 0, 'music');
      pr.settings.captions = { controls: 'hidden' };
    });
    const f = checkAccessibility(p).findings.find((x) => x.check === 'autoplay-media')!;
    expect(f.severity).toBe('warning');
    expect(applyFix(p, f.fix!)).toBe(true);
    expect(p.settings.captions?.controls).toBe('auto');
    expect(checkAccessibility(p).findings.filter((x) => x.check === 'autoplay-media')).toEqual([]);
  });
  it('is satisfied by a Captions and sound node that can mute', () => {
    const p = project((t, pr) => {
      t.autoplay = true;
      addAudioTrack(t, asset, 8000, 0, 'music');
      pr.settings.captions = { controls: 'hidden' };
      pr.artboards[0].logic.nodes.push({ id: 'n', kind: 'action.captions', x: 0, y: 0, params: { op: 'soundToggle' } });
    });
    expect(checkAccessibility(p).findings.filter((x) => x.check === 'autoplay-media')).toEqual([]);
  });
});

describe('usage', () => {
  it('counts a timeline\'s sound as using its asset, and the caption variable as used', () => {
    const p = createProject('U');
    p.assets.push({ id: 'as1', name: 'voice.mp3', mime: 'audio/mpeg', size: 1 }, { id: 'as2', name: 'unused.mp3', mime: 'audio/mpeg', size: 1 });
    const t = tl();
    p.artboards[0].timelines.push(t);
    addAudioTrack(t, { id: 'as1', name: 'voice.mp3' }, 1000, 0);
    const v = ensureCaptionVariable(p);
    const r = analyzeUsage(p);
    expect(unusedAssetIds(r)).toEqual(['as2']);
    expect(r.variables.find((x) => x.id === v.id)!.unused).toBe(false);
  });
});
