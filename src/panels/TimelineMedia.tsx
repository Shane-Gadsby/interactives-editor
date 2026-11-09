import { extOf, track as usage } from '../lib/analytics';
import { useEffect, useRef, useState } from 'react';
import { clockLabel, cuesToSrt, cuesToVtt, localVoices, parseCaptions, trackSpan, uid, type AudioRole, type AudioTrack, type CaptionCue, type CaptionTrack, type Project, type Timeline as TL } from 'interactives-player';
import { Icons } from '../components/icons';
import { mediaBrief, mediaMarks, mediaSummary, type LaneShow } from '../lib/timeline-view';
import { store } from '../store/store';
import { assetKind, assetUrls } from '../lib/assets';
import { pickFiles } from '../lib/insert';
import { download } from '../lib/export';
import { addAudioTrack, addCue, captionFileName, descriptionClashes, ensureCaptionTrack, findTrack, importCaptionFile, mergeWithNext, orderCues, pasteTranscript, removeTrack, shiftCues, splitCue, trackKind, type PasteTiming } from '../lib/captions-edit';
import { audioDuration, barsFor, loadWaveform, type Waveform } from '../lib/waveform';
import { alertDialog, confirmDialog } from '../components/dialogs';
import { CheckField, NumberField, SelectField, TextField } from '../components/ui';
import { Modal } from '../components/ProjectModals';
import { SectionBlurb } from '../components/SectionBlurb';

/**
 * The sound and caption rows of the timeline panel: a lane per sound with its waveform, volume keys and trim handles, and a
 * lane per caption track with its cues; plus the editor for whatever is selected. The panel owns the selection and the
 * time/pixel maths, so these rows line up with the layers' tracks above them.
 */

type SetTl = (fn: (t: TL) => void, coalesce?: string) => void;

export type MediaSel = { kind: 'audio'; track: string } | { kind: 'cue'; track: string; cue: string } | { kind: 'captions'; track: string } | { kind: 'vkey'; track: string; key: string } | null;

export const AUDIO_ROW = 46;
export const CAPTION_ROW = 30;
export const HEAD_ROW = 24;

/** What the lanes need from the panel. */
export interface MediaCtx {
  tl: TL;
  pxPerMs: number;
  playhead: number;
  sel: MediaSel;
  setSel: (s: MediaSel) => void;
  setTl: SetTl;
  /** Pointer x to timeline ms, clamped to the timeline. */
  timeAt: (clientX: number) => number;
  snap: (t: number, e: { shiftKey: boolean }) => number;
  /** Press on empty lane: move the playhead (the panel's scrub). */
  scrub: (e: React.PointerEvent) => void;
}

const X = (pxPerMs: number, t: number) => 12 + t * pxPerMs;

/** The Sound and captions group: which lanes show (the View menu), and whether the group is open or folded to one row. */
export interface MediaGroupView {
  show: LaneShow;
  open: boolean;
  onToggle: () => void;
}
const GROUP_ID = 'media-group-rows';

// ---------------------------------------------------------------------------
// Waveforms

function useWaveform(assetId: string): Waveform | null {
  const [w, setW] = useState<Waveform | null>(null);
  const [version, setVersion] = useState(assetUrls.version);
  useEffect(() => assetUrls.subscribe(() => setVersion(assetUrls.version)), []);
  useEffect(() => {
    let live = true;
    void loadWaveform(assetId).then((r) => live && setW(r));
    return () => {
      live = false;
    };
  }, [assetId, version]);
  return w;
}

function WaveCanvas({ w, from, to, width, height }: { w: Waveform; from: number; to: number; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const cols = Math.max(1, Math.min(4000, Math.floor(width)));
    c.width = cols;
    c.height = height;
    const g = c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, cols, height);
    g.fillStyle = 'rgba(255,255,255,0.78)';
    const bars = barsFor(w, from, to, cols);
    const mid = height / 2;
    for (let i = 0; i < cols; i++) {
      const h = Math.max(bars[i] > 0 ? 1 : 0, bars[i] * (height - 6));
      if (h > 0) g.fillRect(i, mid - h / 2, 1, h);
    }
  }, [w, from, to, width, height]);
  return <canvas ref={ref} className="wave" style={{ width, height }} aria-hidden="true" />;
}

// ---------------------------------------------------------------------------
// Labels (the left column)

export function MediaLabels({ ctx, view, assetsFor, onAddSound, onCaptionAction, onDescriptionAction }: { ctx: MediaCtx; view: MediaGroupView; assetsFor: { id: string; name: string }[]; onAddSound: (assetId: string) => void; onCaptionAction: (a: string) => void; onDescriptionAction: (a: string) => void }) {
  const { tl, sel, setSel, setTl } = ctx;
  const audio = tl.audio ?? [];
  const caps = tl.captions ?? [];
  const descs = tl.descriptions ?? [];
  const anyShown = view.show.audio || view.show.captions || view.show.descriptions;
  if (!anyShown) return null;
  return (
    <div className="media-labels">
      <div className="track-node media-head media-group-head">
        <button type="button" className="media-fold" aria-expanded={view.open} aria-controls={GROUP_ID} title={`${view.open ? 'Fold the sound and caption rows into one row' : 'Show the sound and caption rows'} (${mediaSummary(tl, view.show)})`} onClick={view.onToggle} onKeyDown={(e) => e.stopPropagation()}>
          {view.open ? <Icons.chevronDown /> : <Icons.chevronRight />}
          <span>Sound and captions</span>
        </button>
        <small className="media-summary">{mediaBrief(tl, view.show)}</small>
      </div>
      {view.open && (
        <div id={GROUP_ID} className="media-group-rows">
        {view.show.audio && (
          <>
            <div className="track-node media-head">
              <span>Sound</span>
              <select
                className="media-add"
                value=""
                title="Put a sound on this timeline. It plays while the timeline plays and follows seeks, pauses and speed"
                aria-label="Add a sound to the timeline"
                onChange={(e) => {
                  if (e.target.value) onAddSound(e.target.value);
                  e.target.value = '';
                }}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <option value="">+ Add sound…</option>
                {assetsFor.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
                <option value="__upload">Upload audio…</option>
              </select>
            </div>
            {audio.map((a) => (
              <div key={a.id} className={`track-label media-label audio-label${sel?.kind === 'audio' && sel.track === a.id ? ' selected' : ''}`} style={{ height: AUDIO_ROW }} onClick={() => setSel({ kind: 'audio', track: a.id })}>
                <span className="media-name" title={`${a.name} (${a.role ?? 'narration'})`}>
                  {a.name}
                  <small>{a.role ?? 'narration'}</small>
                </span>
                <span className="media-btns">
                  <button
                    className={`mini${a.muted ? ' on' : ''}`}
                    style={{ visibility: 'visible' }}
                    title={a.muted ? 'Silent in the player (still in step). Click to unmute' : 'Mute this sound in the player'}
                    aria-pressed={!!a.muted}
                    aria-label={`Mute ${a.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setTl((d) => {
                        const t = d.audio?.find((x) => x.id === a.id);
                        if (t) t.muted = t.muted ? undefined : true;
                      });
                    }}
                  >
                    M
                  </button>
                  <button
                    className="mini"
                    title="Remove this sound from the timeline"
                    aria-label={`Remove ${a.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setTl((d) => {
                        d.audio = d.audio?.filter((x) => x.id !== a.id);
                        if (!d.audio?.length) delete d.audio;
                      });
                      if (sel && 'track' in sel && sel.track === a.id) setSel(null);
                    }}
                  >
                    ×
                  </button>
                </span>
              </div>
            ))}
          </>
        )}
        {view.show.captions && (
          <>
            <div className="track-node media-head">
              <span>Captions</span>
              <select
                className="media-add"
                value=""
                title="Add captions: type them in, paste a transcript, import or export a WebVTT or SRT file"
                aria-label="Captions actions"
                onChange={(e) => {
                  if (e.target.value) onCaptionAction(e.target.value);
                  e.target.value = '';
                }}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <option value="">Captions…</option>
                <option value="cue">New caption at the playhead</option>
                <option value="paste">Paste a transcript…</option>
                <option value="import">Import WebVTT or SRT…</option>
                <option value="vtt" disabled={!caps.some((c) => c.cues.length)}>
                  Export WebVTT
                </option>
                <option value="srt" disabled={!caps.some((c) => c.cues.length)}>
                  Export SRT
                </option>
                <option value="track">Add a language…</option>
              </select>
            </div>
            {caps.map((c) => (
              <div key={c.id} className={`track-label media-label caption-label${sel && 'track' in sel && sel.track === c.id && sel.kind !== 'audio' && sel.kind !== 'vkey' ? ' selected' : ''}`} style={{ height: CAPTION_ROW }} onClick={() => setSel({ kind: 'captions', track: c.id })}>
                <span className="media-name" title={`${c.name}${c.lang ? ` (${c.lang})` : ''}: ${c.cues.length} caption${c.cues.length === 1 ? '' : 's'}`}>
                  {c.name}
                  <small>{c.lang || 'no language'}</small>
                </span>
              </div>
            ))}
          </>
        )}
        {view.show.descriptions && (
          <>
            <div className="track-node media-head">
              <span>Descriptions</span>
              <select
                className="media-add"
                value=""
                title="Say what is on screen for people who cannot see it: short sentences in the gaps, read by the viewer's own voice. Not a recorded described version"
                aria-label="Descriptions actions"
                onChange={(e) => {
                  if (e.target.value) onDescriptionAction(e.target.value);
                  e.target.value = '';
                }}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <option value="">Descriptions…</option>
                <option value="cue">New description at the playhead</option>
                <option value="import">Import WebVTT or SRT…</option>
                <option value="vtt" disabled={!descs.some((c) => c.cues.length)}>
                  Export WebVTT
                </option>
                <option value="srt" disabled={!descs.some((c) => c.cues.length)}>
                  Export SRT
                </option>
                <option value="track">Add a language…</option>
              </select>
            </div>
            {descs.map((c) => (
              <div key={c.id} className={`track-label media-label caption-label description-label${sel && 'track' in sel && sel.track === c.id && sel.kind !== 'audio' && sel.kind !== 'vkey' ? ' selected' : ''}`} style={{ height: CAPTION_ROW }} onClick={() => setSel({ kind: 'captions', track: c.id })}>
                <span className="media-name" title={`${c.name}${c.lang ? ` (${c.lang})` : ''}: ${c.cues.length} description${c.cues.length === 1 ? '' : 's'}`}>
                  {c.name}
                  <small>{c.lang || 'no language'}</small>
                </span>
              </div>
            ))}
          </>
        )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lanes (the right column)

export function MediaLanes({ ctx, view }: { ctx: MediaCtx; view: MediaGroupView }) {
  const { tl, pxPerMs } = ctx;
  if (!view.show.audio && !view.show.captions && !view.show.descriptions) return null;
  return (
    <div className="media-lanes">
      <div className="lane node-lane media-head media-group-head" onPointerDown={ctx.scrub}>
        {!view.open &&
          mediaMarks(tl, view.show).map((m, i) => (
            <span key={i} className={`media-mark ${m.kind}`} aria-hidden="true" style={{ left: X(pxPerMs, m.from), width: Math.max(2, (Math.min(m.to, tl.duration) - m.from) * pxPerMs) }} />
          ))}
      </div>
      {view.open && (
        <div className="media-group-rows">
          {view.show.audio && (
            <>
              <div className="lane node-lane media-head" onPointerDown={ctx.scrub} />
              {(tl.audio ?? []).map((a) => (
                <AudioLane key={a.id} ctx={ctx} track={a} />
              ))}
            </>
          )}
          {view.show.captions && (
            <>
              <div className="lane node-lane media-head" onPointerDown={ctx.scrub} />
              {(tl.captions ?? []).map((c) => (
                <CaptionLane key={c.id} ctx={ctx} track={c} />
              ))}
            </>
          )}
          {view.show.descriptions && (
            <>
              <div className="lane node-lane media-head" onPointerDown={ctx.scrub} />
              {(tl.descriptions ?? []).map((c) => (
                <CaptionLane key={c.id} ctx={ctx} track={c} kind="descriptions" />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AudioLane({ ctx, track }: { ctx: MediaCtx; track: AudioTrack }) {
  const { tl, pxPerMs, sel, setTl } = ctx;
  const w = useWaveform(track.assetId);
  const missing = !assetUrls.resolve(track.assetId);
  const trim = Math.max(0, track.trimStart ?? 0);
  const clipMs = w?.duration ?? track.duration;
  const span = trackSpan(track, w?.duration);
  // A clip of unknown length reaches to the end of the timeline
  const shownSpan = Number.isFinite(span) ? span : Math.max(0, tl.duration - track.offset);
  const left = X(pxPerMs, track.offset);
  const width = Math.max(6, shownSpan * pxPerMs);
  const selected = sel?.kind === 'audio' && sel.track === track.id;
  const keys = track.volumeKeys ?? [];
  const innerH = AUDIO_ROW - 6;
  const yOf = (v: number) => 3 + (1 - Math.max(0, Math.min(1, v))) * (innerH - 6) + 3;

  /** Drag the clip (move), or one of its edges (trim). */
  const drag = (e: React.PointerEvent, mode: 'move' | 'left' | 'right') => {
    e.stopPropagation();
    ctx.setSel({ kind: 'audio', track: track.id });
    const el = e.currentTarget as HTMLElement;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic event */
    }
    const startX = e.clientX;
    const o0 = track.offset;
    const trim0 = trim;
    const len0 = Number.isFinite(span) ? span : undefined;
    const coalesce = `audio-${mode}-${track.id}`;
    const move = (ev: PointerEvent) => {
      const dt = (ev.clientX - startX) / pxPerMs;
      setTl((d) => {
        const t = d.audio?.find((x) => x.id === track.id);
        if (!t) return;
        if (mode === 'move') t.offset = Math.max(0, Math.round(ctx.snap(o0 + dt, ev)));
        else if (mode === 'left') {
          const limit = (clipMs ?? Infinity) - 50;
          const nt = Math.max(0, Math.min(limit, ctx.snap(trim0 + dt, ev)));
          const moved = nt - trim0;
          t.trimStart = nt > 0 ? Math.round(nt) : undefined;
          t.offset = Math.max(0, Math.round(o0 + moved));
          if (len0 !== undefined && t.length !== undefined) t.length = Math.max(50, Math.round(len0 - moved));
        } else {
          const max = clipMs !== undefined ? Math.max(50, clipMs - trim0) : Infinity;
          t.length = Math.round(Math.max(50, Math.min(max, ctx.snap((len0 ?? shownSpan) + dt, ev))));
        }
      }, coalesce);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      store().commit();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  /** Drag a volume key: sideways is time, up and down is level. */
  const dragKey = (e: React.PointerEvent, keyId: string) => {
    e.stopPropagation();
    ctx.setSel({ kind: 'vkey', track: track.id, key: keyId });
    const el = e.currentTarget as HTMLElement;
    const lane = el.closest('.audio-lane') as HTMLElement | null;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic event */
    }
    const move = (ev: PointerEvent) => {
      const top = lane?.getBoundingClientRect().top ?? 0;
      const v = 1 - (ev.clientY - top - 6) / (innerH - 6);
      const t = ctx.snap(ctx.timeAt(ev.clientX), ev);
      setTl((d) => {
        const tr = d.audio?.find((x) => x.id === track.id);
        const k = tr?.volumeKeys?.find((x) => x.id === keyId);
        if (!tr || !k) return;
        k.t = Math.round(t);
        k.value = Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;
        tr.volumeKeys!.sort((a, b) => a.t - b.t);
      }, `vkey-${keyId}`);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      store().commit();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  /** Double-click on the clip puts a volume key where it was clicked. */
  const addKey = (e: React.MouseEvent) => {
    const lane = (e.currentTarget as HTMLElement).closest('.audio-lane') as HTMLElement | null;
    const top = lane?.getBoundingClientRect().top ?? 0;
    const v = Math.round(Math.max(0, Math.min(1, 1 - (e.clientY - top - 6) / (innerH - 6))) * 100) / 100;
    const t = Math.round(ctx.timeAt(e.clientX));
    const id = uid('vk');
    setTl((d) => {
      const tr = d.audio?.find((x) => x.id === track.id);
      if (!tr) return;
      (tr.volumeKeys ??= []).push({ id, t, value: v, ease: 'linear' });
      tr.volumeKeys.sort((a, b) => a.t - b.t);
    });
    ctx.setSel({ kind: 'vkey', track: track.id, key: id });
  };

  // The level line: flat before the first key, through every key, flat after the last
  const pts = keys.length ? [{ x: 0, y: yOf(Number(keys[0].value)) }, ...keys.map((k) => ({ x: X(pxPerMs, k.t) - left, y: yOf(Number(k.value)) })), { x: width, y: yOf(Number(keys[keys.length - 1].value)) }] : [];
  const envelope = pts.map((q, i) => `${i ? 'L' : 'M'}${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');

  return (
    <div className="lane audio-lane" style={{ height: AUDIO_ROW }} onPointerDown={ctx.scrub}>
      <div
        className={`audio-clip${selected ? ' selected' : ''}${track.muted ? ' muted' : ''}${missing ? ' missing' : ''}`}
        style={{ left, width, top: 2, height: AUDIO_ROW - 4 }}
        title={`${track.name}: starts at ${Math.round(track.offset)} ms${trim ? `, skips the first ${Math.round(trim)} ms of the file` : ''}. Drag to move it, drag an edge to trim it, double-click to add a volume key`}
        onPointerDown={(e) => drag(e, 'move')}
        onDoubleClick={addKey}
      >
        {w && <WaveCanvas w={w} from={trim} to={trim + shownSpan} width={width} height={AUDIO_ROW - 4} />}
        <span className="clip-name">{missing ? `${track.name} (file missing)` : w ? track.name : `${track.name} (loading)`}</span>
        {pts.length > 0 && (
          <svg className="envelope" width={width} height={AUDIO_ROW - 4} aria-hidden="true">
            <path d={envelope} />
          </svg>
        )}
        {keys.map((k) => (
          <span
            key={k.id}
            className={`vkey${sel?.kind === 'vkey' && sel.key === k.id ? ' selected' : ''}`}
            style={{ left: X(pxPerMs, k.t) - left, top: yOf(Number(k.value)) - 2 }}
            title={`Volume ${Math.round(Number(k.value) * 100)}% at ${Math.round(k.t)} ms. Drag to change it`}
            onPointerDown={(e) => dragKey(e, k.id)}
          />
        ))}
        <span className="trim-handle left" title="Drag to skip the start of the file" onPointerDown={(e) => drag(e, 'left')} />
        <span className="trim-handle right" title="Drag to stop the clip sooner" onPointerDown={(e) => drag(e, 'right')} />
      </div>
      {tl.duration < track.offset + shownSpan - 1 && <span className="clip-over" style={{ left: X(pxPerMs, tl.duration) }} title="The sound runs past the end of the timeline" />}
    </div>
  );
}

/** A lane of cues: a caption track, or (`kind` descriptions) a description track, which shares everything but the words around it. */
function CaptionLane({ ctx, track, kind = 'captions' }: { ctx: MediaCtx; track: CaptionTrack; kind?: 'captions' | 'descriptions' }) {
  const { pxPerMs, sel, setSel, setTl, playhead, tl } = ctx;
  const described = kind === 'descriptions';
  const drag = (e: React.PointerEvent, cue: CaptionCue, mode: 'move' | 'start' | 'end') => {
    e.stopPropagation();
    setSel({ kind: 'cue', track: track.id, cue: cue.id });
    const el = e.currentTarget as HTMLElement;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic event */
    }
    const startX = e.clientX;
    const s0 = cue.start;
    const e0 = cue.end;
    const move = (ev: PointerEvent) => {
      const dt = (ev.clientX - startX) / pxPerMs;
      setTl((d) => {
        const c = findTrack(d, track.id)?.cues.find((x) => x.id === cue.id);
        if (!c) return;
        if (mode === 'move') {
          const len = e0 - s0;
          c.start = Math.max(0, Math.round(ctx.snap(s0 + dt, ev)));
          c.end = c.start + len;
        } else if (mode === 'start') c.start = Math.max(0, Math.min(e0 - 100, Math.round(ctx.snap(s0 + dt, ev))));
        else c.end = Math.max(s0 + 100, Math.round(ctx.snap(e0 + dt, ev)));
      }, `cue-${mode}-${cue.id}`);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      setTl((d) => {
        const t = findTrack(d, track.id);
        if (t) orderCues(t);
      });
      store().commit();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  return (
    <div
      className={`lane caption-lane${described ? ' description-lane' : ''}`}
      style={{ height: CAPTION_ROW }}
      onPointerDown={ctx.scrub}
      onDoubleClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const at = Math.round(ctx.timeAt(e.clientX));
        let id = '';
        setTl((d) => {
          const t = findTrack(d, track.id);
          if (t) id = addCue(t, at, described ? 3000 : 2500, described ? 'New description' : 'New caption').id;
        });
        if (id) setSel({ kind: 'cue', track: track.id, cue: id });
      }}
    >
      {track.cues.map((c) => (
        <div
          key={c.id}
          className={`cue${described ? ' desc' : ''}${described && descriptionClashes(tl, c).length ? ' clash' : ''}${sel?.kind === 'cue' && sel.cue === c.id ? ' selected' : ''}${playhead >= c.start && playhead < c.end ? ' live' : ''}`}
          style={{ left: X(pxPerMs, c.start), width: Math.max(8, (c.end - c.start) * pxPerMs), top: 3, height: CAPTION_ROW - 6 }}
          title={`${clockLabel(c.start)} to ${clockLabel(c.end)}${c.speaker ? `, ${c.speaker}` : ''}: ${c.text}.${described && descriptionClashes(tl, c).length ? ' It overlaps a caption, so the voice would talk over the speech.' : ''} Drag to move it, drag an edge to retime it`}
          onPointerDown={(e) => drag(e, c, 'move')}
        >
          <span className="cue-edge start" onPointerDown={(e) => drag(e, c, 'start')} />
          <span className="cue-text">{c.text}</span>
          <span className="cue-edge end" onPointerDown={(e) => drag(e, c, 'end')} />
        </div>
      ))}
      {!track.cues.length && <span className="lane-hint">{described ? 'Double-click here to add a description of what is on screen, in a gap between the speech' : 'Double-click here to add a caption, or paste a transcript from the Captions menu'}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The editor for what is selected

const ROLES: { value: AudioRole; label: string }[] = [
  { value: 'narration', label: 'Narration (needs captions)' },
  { value: 'music', label: 'Music' },
  { value: 'effect', label: 'Sound effect' },
];

export function MediaEditor({ ctx, onPaste }: { ctx: MediaCtx; onPaste: () => void }) {
  const { tl, sel, setTl, setSel, playhead } = ctx;
  if (!sel) return null;
  if (sel.kind === 'audio' || sel.kind === 'vkey') {
    const a = tl.audio?.find((x) => x.id === sel.track);
    if (!a) return null;
    const set = (fn: (t: AudioTrack) => void, coalesce?: string) =>
      setTl((d) => {
        const t = d.audio?.find((x) => x.id === a.id);
        if (t) fn(t);
      }, coalesce);
    const vk = sel.kind === 'vkey' ? a.volumeKeys?.find((k) => k.id === sel.key) : undefined;
    return (
      <div className="key-editor media-editor">
        <div className="field-label block">Sound: {a.name}</div>
        <TextField label="Name" value={a.name} commitOnBlur onChange={(v) => set((t) => void (t.name = v || t.name))} />
        <SelectField<AudioRole> label="Role" title="What the sound is for. Narration and speech need captions (the accessibility check looks); music and effects do not" value={a.role ?? 'narration'} options={ROLES} onChange={(v) => set((t) => void (t.role = v))} />
        <NumberField label="Starts at" title="Where on the timeline the sound starts, in ms" value={a.offset} min={0} step={10} suffix="ms" onChange={(v) => set((t) => void (t.offset = Math.max(0, Math.round(v))), `audio-offset-${a.id}`)} />
        <NumberField label="Skip start" title="Skip this much of the start of the file, in ms" value={a.trimStart ?? 0} min={0} step={10} suffix="ms" onChange={(v) => set((t) => void (t.trimStart = v > 0 ? Math.round(v) : undefined), `audio-trim-${a.id}`)} />
        <NumberField label="Play for" title="How much of the file to play after the skipped start, in ms. 0 plays to the end of the file" value={a.length ?? 0} min={0} step={10} suffix="ms" onChange={(v) => set((t) => void (t.length = v > 0 ? Math.round(v) : undefined), `audio-len-${a.id}`)} />
        <NumberField label="Volume" title="0 is silent, 1 is the file as recorded" value={a.volume} min={0} max={1} step={0.05} onChange={(v) => set((t) => void (t.volume = Math.max(0, Math.min(1, v))), `audio-vol-${a.id}`)} />
        <CheckField label="Muted" title="Silent in the player, but still in step" value={!!a.muted} onChange={(v) => set((t) => void (t.muted = v ? true : undefined))} />
        <CheckField
          label="Keep pitch at other speeds"
          title="When the timeline's speed isn't 1, the sound is time-stretched so voices and music keep their pitch. Untick it for the record-player effect: faster is higher, slower is lower"
          value={a.keepPitch !== false}
          onChange={(v) => set((t) => void (t.keepPitch = v ? undefined : false))}
        />
        <div className="field-label block">Volume keys</div>
        <SectionBlurb text="Double-click the clip to add one; drag it up and down for the level, sideways for the time." name="volume keys" help={['captions', 'sound']} />
        <div className="row">
          <button
            className="btn small-btn"
            title="Add a volume key at the playhead at the level the sound has there"
            onClick={() => {
              const id = uid('vk');
              set((t) => {
                (t.volumeKeys ??= []).push({ id, t: Math.round(playhead), value: 1, ease: 'linear' });
                t.volumeKeys.sort((x, y) => x.t - y.t);
              });
              setSel({ kind: 'vkey', track: a.id, key: id });
            }}
          >
            + Key at playhead
          </button>
          <button
            className="btn small-btn"
            title="Fade the sound out over its last second"
            onClick={() =>
              set((t) => {
                const end = t.offset + (Number.isFinite(trackSpan(t)) ? trackSpan(t) : Math.max(1000, tl.duration - t.offset));
                const keys = (t.volumeKeys ??= []);
                keys.push({ id: uid('vk'), t: Math.max(0, Math.round(end - 1000)), value: 1, ease: 'easeOut' }, { id: uid('vk'), t: Math.round(end), value: 0, ease: 'linear' });
                keys.sort((x, y) => x.t - y.t);
              })
            }
          >
            Fade out
          </button>
        </div>
        {vk && (
          <>
            <NumberField label="Key time" value={vk.t} min={0} suffix="ms" onChange={(v) => set((t) => {
              const k = t.volumeKeys?.find((x) => x.id === vk.id);
              if (k) k.t = Math.round(v);
              t.volumeKeys?.sort((x, y) => x.t - y.t);
            }, `vkey-t-${vk.id}`)} />
            <NumberField label="Key level" title="0 to 1, times the volume above" value={Number(vk.value)} min={0} max={1} step={0.05} onChange={(v) => set((t) => {
              const k = t.volumeKeys?.find((x) => x.id === vk.id);
              if (k) k.value = Math.max(0, Math.min(1, v));
            }, `vkey-v-${vk.id}`)} />
            <button
              className="btn small-btn"
              onClick={() => {
                set((t) => {
                  t.volumeKeys = t.volumeKeys?.filter((x) => x.id !== vk.id);
                  if (!t.volumeKeys?.length) delete t.volumeKeys;
                });
                setSel({ kind: 'audio', track: a.id });
              }}
            >
              Delete key
            </button>
          </>
        )}
      </div>
    );
  }
  const track = findTrack(tl, sel.track);
  if (!track) return null;
  const described = trackKind(tl, track.id) === 'descriptions';
  const noun = described ? 'description' : 'caption';
  const setTrack = (fn: (t: CaptionTrack) => void, coalesce?: string) =>
    setTl((d) => {
      const t = findTrack(d, track.id);
      if (t) fn(t);
    }, coalesce);
  if (sel.kind === 'cue') {
    const cue = track.cues.find((c) => c.id === sel.cue);
    if (!cue) return null;
    const setCue = (fn: (c: CaptionCue) => void, coalesce?: string) =>
      setTrack((t) => {
        const c = t.cues.find((x) => x.id === cue.id);
        if (c) fn(c);
      }, coalesce);
    return (
      <div className="key-editor media-editor">
        <div className="field-label block">
          {described ? 'Description' : 'Caption'} {clockLabel(cue.start)} to {clockLabel(cue.end)}
        </div>
        <TextField
          label="Text"
          title={described ? 'What is on screen, in a sentence a voice can read. It is not drawn: it is read aloud when descriptions are on, and listed in the transcript' : 'What shows on screen. A line break makes a second line'}
          value={cue.text}
          multiline
          rows={3}
          commitOnBlur
          onChange={(v) => setCue((c) => void (c.text = v))}
        />
        {!described && <TextField label="Speaker" title="Shown before the words (Dr Lee: ...) and in the transcript. Leave empty for one voice" value={cue.speaker ?? ''} commitOnBlur onChange={(v) => setCue((c) => void (c.speaker = v.trim() || undefined))} />}
        {described && descriptionClashes(tl, cue).length > 0 && <p className="hint warn">This overlaps a caption, so the voice would talk over the speech. Move it into a gap, or shorten it.</p>}
        <NumberField label="Start" value={cue.start} min={0} step={10} suffix="ms" onChange={(v) => setCue((c) => void (c.start = Math.max(0, Math.min(c.end - 100, Math.round(v)))), `cue-start-${cue.id}`)} />
        <NumberField label="End" value={cue.end} min={0} step={10} suffix="ms" onChange={(v) => setCue((c) => void (c.end = Math.max(c.start + 100, Math.round(v))), `cue-end-${cue.id}`)} />
        <div className="row wrap">
          <button className="btn small-btn" title={`Make the ${noun} start at the playhead`} onClick={() => setCue((c) => void (c.start = Math.max(0, Math.min(c.end - 100, Math.round(playhead)))))}>
            Start = playhead
          </button>
          <button className="btn small-btn" title={`Make the ${noun} end at the playhead`} onClick={() => setCue((c) => void (c.end = Math.max(c.start + 100, Math.round(playhead))))}>
            End = playhead
          </button>
        </div>
        <div className="row wrap">
          <button
            className="btn small-btn"
            title={`Cut this ${noun} in two at the playhead, sharing the words out by time`}
            disabled={!(playhead > cue.start + 50 && playhead < cue.end - 50)}
            onClick={() => {
              let nid: string | null = null;
              setTrack((t) => void (nid = splitCue(t, cue.id, playhead)));
              if (nid) setSel({ kind: 'cue', track: track.id, cue: nid });
            }}
          >
            Split at playhead
          </button>
          <button
            className="btn small-btn"
            title={`Join this ${noun} and the next one`}
            disabled={[...track.cues].sort((a, b) => a.start - b.start).findIndex((c) => c.id === cue.id) >= track.cues.length - 1}
            onClick={() => setTrack((t) => void mergeWithNext(t, cue.id))}
          >
            Merge with next
          </button>
          <button
            className="btn small-btn"
            onClick={() => {
              setTrack((t) => void (t.cues = t.cues.filter((c) => c.id !== cue.id)));
              setSel({ kind: 'captions', track: track.id });
            }}
          >
            Delete
          </button>
        </div>
      </div>
    );
  }
  // The track itself
  const voices = typeof speechSynthesis !== 'undefined' ? localVoices(speechSynthesis.getVoices()) : [];
  return (
    <div className="key-editor media-editor">
      <div className="field-label block">
        {described ? 'Description' : 'Caption'} track: {track.name}
      </div>
      <TextField label="Name" value={track.name} commitOnBlur onChange={(v) => setTrack((t) => void (t.name = v || t.name))} />
      <TextField label="Language" title="A language tag such as en, fr or pt-BR. With more than one language the viewer gets a language menu" value={track.lang ?? ''} placeholder="en" commitOnBlur onChange={(v) => setTrack((t) => void (t.lang = v.trim() || undefined))} />
      <p className="hint">
        {track.cues.length} {noun}
        {track.cues.length === 1 ? '' : 's'}.
      </p>
      {described && (
        <SectionBlurb text="A voice on the viewer's device reads each one in the gaps. A cheaper aid, not a recorded described version." name="descriptions" help={['describe-what-you-see', 'how-it-works-for-the-viewer']} />
      )}
      <div className="row wrap">
        {!described && (
          <button className="btn small-btn" title="Paste a transcript and turn it into timed captions" onClick={onPaste}>
            Paste a transcript…
          </button>
        )}
        <button
          className="btn small-btn"
          title="Move every caption later (or earlier with a minus) by the amount you give"
          onClick={async () => {
            const ms = await shiftPrompt();
            if (ms) setTrack((t) => shiftCues(t, ms));
          }}
        >
          Shift all…
        </button>
      </div>
      {!described && <CheckField
        label="Read aloud (draft voice)"
        title="The player reads each caption aloud with a voice installed on the viewer's device. A stand-in until the real recording is in. Voices that need the internet are never used"
        value={!!track.speak}
        onChange={(v) => setTrack((t) => void (t.speak = v ? true : undefined))}
      />}
      {(track.speak || described) && (
        <SectionBlurb
          text={voices.length ? `${voices.length} voice${voices.length === 1 ? '' : 's'} on this device can read ${described ? 'them' : 'it'}.` : `No voice that runs on this device was found, so nothing will be read here. Viewers with one will hear ${described ? 'them' : 'it'}.`}
          name="the draft voice"
          help={['captions', 'draft-voice']}
        />
      )}
      <div className="row wrap">
        <button
          className="btn small-btn"
          title={`Delete this ${noun} track and all its ${noun}s`}
          onClick={async () => {
            if (!(await confirmDialog({ title: `Delete ${noun} track`, message: `Delete "${track.name}" and its ${track.cues.length} ${noun}s?`, confirmLabel: 'Delete', danger: true }))) return;
            setTl((d) => removeTrack(d, track.id));
            setSel(null);
          }}
        >
          Delete track
        </button>
      </div>
    </div>
  );
}

async function shiftPrompt(): Promise<number> {
  const { promptDialog } = await import('../components/dialogs');
  const v = await promptDialog({ title: 'Shift captions', label: 'Milliseconds (negative for earlier)', initial: '500', confirmLabel: 'Shift', validate: (s) => (Number.isFinite(Number(s)) ? null : 'A number of milliseconds, such as 500 or -250') });
  return v === null ? 0 : Math.round(Number(v));
}

// ---------------------------------------------------------------------------
// The paste-a-transcript dialog

export function TranscriptDialog({ tl, track, onClose, onDone }: { tl: TL; track: CaptionTrack; onClose: () => void; onDone: (message: string) => void }) {
  const hasSound = !!tl.audio?.length;
  const [text, setText] = useState('');
  const [timing, setTiming] = useState<PasteTiming>(hasSound ? 'narration' : 'timeline');
  const [by, setBy] = useState<'sentence' | 'line' | 'paragraph'>('sentence');
  const [append, setAppend] = useState(false);
  const [error, setError] = useState('');
  const apply = () => {
    const box: { result: ReturnType<typeof pasteTranscript> } = { result: { error: 'Nothing happened.' } };
    store().updateTimeline((d) => {
      const t = findTrack(d as TL, track.id);
      if (t) box.result = pasteTranscript(d as TL, t, text, { timing, by, append });
    });
    const result = box.result;
    if ('error' in result) {
      setError(result.error);
      return;
    }
    usage('feature', 'captions-transcript', { detail: { timing, by, append }, sum: { cues: result.made } });
    onDone(`${result.made} caption${result.made === 1 ? '' : 's'} made${result.stamped ? ' from the times in the transcript' : ''}. Check them against the sound and drag the edges where they are off.`);
    onClose();
  };
  return (
    <Modal title="Paste a transcript" help="captions" onClose={onClose}>
      <div className="share-body transcript-dialog">
        <SectionBlurb text="Paste the words that are spoken. They are cut into captions and timed for you; then drag the edges to fine-tune." name="pasting a transcript" help={['captions']} />
        <textarea className="transcript-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste or type the transcript here" aria-label="Transcript" rows={9} autoFocus />
        <div className="row wrap">
          <SelectField<PasteTiming>
            label="Timing"
            title="How the captions are spread over time"
            value={timing}
            options={[
              { value: 'narration', label: 'Across the narration' },
              { value: 'timeline', label: 'Across the whole timeline' },
              { value: 'markers', label: 'One per marker' },
              { value: 'rate', label: 'At reading speed' },
            ]}
            onChange={setTiming}
          />
          <SelectField<'sentence' | 'line' | 'paragraph'> label="One caption per" value={by} options={[{ value: 'sentence', label: 'Sentence' }, { value: 'line', label: 'Line' }, { value: 'paragraph', label: 'Paragraph' }]} onChange={setBy} />
          <CheckField label="Add to the existing captions" value={append} onChange={setAppend} />
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button className="btn primary" onClick={apply} disabled={!text.trim()}>
            Make captions
          </button>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// The actions behind the menus

/** Put a sound on the timeline: an asset of the project, or a file picked now. Returns the new track's id. */
export async function addSoundToTimeline(assetId: string, playhead: number): Promise<string | null> {
  const st = store();
  let id = assetId;
  if (assetId === '__upload') {
    const files = await pickFiles('audio/*,video/*', false);
    if (!files.length) return null;
    const { insertFiles } = await import('../lib/insert');
    const added = await insertFiles(files, null, null);
    const a = added.find((x) => assetKind(x.mime, x.name) === 'audio' || assetKind(x.mime, x.name) === 'video');
    if (!a) {
      st.toast('That file is not audio or video', 'error');
      return null;
    }
    id = a.id;
  }
  const asset = st.get().project.assets.find((a) => a.id === id);
  if (!asset) return null;
  const ms = await audioDuration(id);
  let made = '';
  st.updateTimeline((d) => {
    made = addAudioTrack(d as TL, asset, ms, playhead).id;
  });
  usage('feature', 'narration-audio-add');
  if (!ms) st.toast('Added, but the browser could not read how long it is, so it will play to the end of the file.');
  return made;
}

export function exportCaptions(project: Project, tl: TL, track: CaptionTrack, kind: 'vtt' | 'srt'): void {
  const body = kind === 'vtt' ? cuesToVtt(track.cues) : cuesToSrt(track.cues);
  download(new Blob([body], { type: kind === 'vtt' ? 'text/vtt' : 'application/x-subrip' }), captionFileName(project, tl, track, kind, trackKind(tl, track.id) ?? 'captions'));
}

/** Read a WebVTT or SRT file into a caption track (after asking whether to replace what is there). */
export async function importCaptionsInto(trackId: string): Promise<string | null> {
  const files = await pickFiles('.vtt,.srt,text/vtt,application/x-subrip,text/plain', false);
  if (!files.length) return null;
  const text = await files[0].text();
  usage('feature', 'captions-import', { thing: extOf(files[0].name) });
  const check = parseCaptions(text);
  if (!check.cues.length) {
    await alertDialog({ title: 'No captions found', message: check.warnings.join(' ') || 'That file has no captions in it.' });
    return null;
  }
  let append = false;
  const found = store().get().project.artboards.flatMap((a) => a.timelines).find((t) => findTrack(t, trackId));
  const track = found ? findTrack(found, trackId) : undefined;
  const noun = found && trackKind(found, trackId) === 'descriptions' ? 'description' : 'caption';
  if (track?.cues.length) {
    const replace = await confirmDialog({ title: `Import ${noun}s`, message: `This track already has ${track.cues.length} ${noun}s. Replace them with the ${check.cues.length} in ${files[0].name}?`, confirmLabel: 'Replace them', cancelLabel: 'Add to them' });
    append = !replace;
  }
  let out = { made: 0, warnings: [] as string[] };
  store().updateTimeline((d) => {
    const t = findTrack(d as TL, trackId);
    if (t) out = importCaptionFile(t, text, append);
  });
  return `${out.made} ${noun}${out.made === 1 ? '' : 's'} imported from ${files[0].name}.${out.warnings.length ? ` ${out.warnings.join(' ')}` : ''}`;
}

export { ensureCaptionTrack, addCue };
