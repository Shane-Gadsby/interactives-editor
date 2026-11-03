import { useEffect, useRef, useState } from 'react';
import { ANIMATABLE_PROPS, EASING_NAMES, ease, type Easing, type Keyframe, type Timeline as TL } from 'interactives-player';
import { store, useEditor } from '../store/store';
import { getArtboard, locate } from '../store/doc';
import { CheckField, ColorField, IconButton, NumberField, SelectField, TextField } from '../components/ui';
import { Icons } from '../components/icons';

const LABEL_W = 220;

export function TimelinePanel() {
  const s = useEditor((st) => ({
    project: st.project,
    abId: st.activeArtboardId,
    tlId: st.activeTimelineId,
    playhead: st.playhead,
    playing: st.previewPlaying,
    recording: st.recording,
    selection: st.selection,
    selectedKeys: st.selectedKeys,
  }));
  const ab = getArtboard(s.project, s.abId);
  const tl = ab?.timelines.find((t) => t.id === s.tlId);
  const lane = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [addProp, setAddProp] = useState('x');
  // The tween (span between a key and the next) whose easing is being edited, named by its starting key
  const [tween, setTween] = useState<{ trackId: string; keyId: string } | null>(null);

  useEffect(() => {
    const el = lane.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [tl?.id]);

  // Preview playback in the canvas.
  useEffect(() => {
    if (!s.playing || !tl) return;
    let raf = 0;
    let last = performance.now();
    let dir = 1;
    const tick = (now: number) => {
      const dt = (now - last) * (tl.speed || 1);
      last = now;
      let t = store().get().playhead + dt * dir;
      if (tl.loop === 'loop') t = ((t % tl.duration) + tl.duration) % tl.duration;
      else if (tl.loop === 'pingpong') {
        if (t > tl.duration) {
          t = 2 * tl.duration - t;
          dir = -1;
        } else if (t < 0) {
          t = -t;
          dir = 1;
        }
      } else if (t >= tl.duration) {
        store().set({ playhead: tl.duration, previewPlaying: false });
        return;
      }
      store().set({ playhead: t });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.playing, tl]);

  if (!ab) return null;
  if (!tl) {
    // Design view: the canvas shows the layers as they are. Picking a timeline shows its frames.
    return (
      <div className="panel-empty">
        {ab.timelines.length ? (
          <>
            <p>Design view: the canvas shows the layers as they are. Choose a timeline to see and edit its animation.</p>
            <div className="row">
              <SelectField
                value=""
                title="Show and edit a timeline on the canvas"
                options={[{ value: '', label: 'Choose a timeline…' }, ...ab.timelines.map((t) => ({ value: t.id, label: t.name })), { value: '__new', label: '+ New timeline' }]}
                onChange={(v) => (v === '__new' ? store().addTimeline() : v && store().set({ activeTimelineId: v, playhead: 0, selectedKeys: [] }))}
              />
            </div>
          </>
        ) : (
          <>
            <p>Timelines animate layer properties with keyframes. Play them on start or from interactions.</p>
            <button className="btn primary" onClick={() => store().addTimeline()}>
              + New timeline
            </button>
          </>
        )}
      </div>
    );
  }

  const pxPerMs = Math.max(0.01, (width - 24) / Math.max(1, tl.duration));
  const X = (t: number) => 12 + t * pxPerMs;
  const T = (clientX: number) => {
    const r = lane.current!.getBoundingClientRect();
    return Math.max(0, Math.min(tl.duration, (clientX - r.left - 12) / pxPerMs));
  };
  const snap = (t: number, e: { shiftKey: boolean }) => Math.round(t / (e.shiftKey ? 100 : 10)) * (e.shiftKey ? 100 : 10);

  const setTl = (fn: (t: TL) => void, coalesce?: string) => store().updateTimeline((d) => fn(d as TL), coalesce);

  const scrub = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    store().set({ playhead: snap(T(e.clientX), e), previewPlaying: false });
    const move = (ev: PointerEvent) => store().set({ playhead: snap(T(ev.clientX), ev) });
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const keyDown = (e: React.PointerEvent, trackId: string, key: Keyframe) => {
    e.stopPropagation();
    const ref = `${trackId}:${key.id}`;
    let sel = store().get().selectedKeys;
    if (e.shiftKey) sel = sel.includes(ref) ? sel.filter((x) => x !== ref) : [...sel, ref];
    else if (!sel.includes(ref)) sel = [ref];
    store().set({ selectedKeys: sel, playhead: key.t, previewPlaying: false });
    setTween(null);
    const startX = e.clientX;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const starts = new Map<string, number>();
    for (const tr of tl.tracks) for (const k of tr.keys) if (sel.includes(`${tr.id}:${k.id}`)) starts.set(k.id, k.t);
    const move = (ev: PointerEvent) => {
      const dt = (ev.clientX - startX) / pxPerMs;
      setTl((d) => {
        for (const tr of d.tracks) {
          for (const k of tr.keys) {
            const t0 = starts.get(k.id);
            if (t0 !== undefined) k.t = Math.max(0, Math.min(d.duration, snap(t0 + dt, ev)));
          }
          tr.keys.sort((a, b) => a.t - b.t);
        }
      }, 'move-keys');
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      store().commit();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  // Group tracks by node, keeping layer order.
  const byNode = new Map<string, typeof tl.tracks>();
  for (const tr of tl.tracks) {
    const list = byNode.get(tr.nodeId) ?? [];
    list.push(tr);
    byNode.set(tr.nodeId, list);
  }

  const selectedKey = s.selectedKeys.length === 1 ? findKey(tl, s.selectedKeys[0]) : null;
  const selectedTween = (() => {
    if (!tween) return null;
    const track = tl.tracks.find((t) => t.id === tween.trackId);
    const i = track ? track.keys.findIndex((k) => k.id === tween.keyId) : -1;
    return track && i >= 0 && i < track.keys.length - 1 ? { track, key: track.keys[i], next: track.keys[i + 1] } : null;
  })();
  const setEase = (e: Easing) =>
    setTl((d) => {
      const k = d.tracks.find((t) => t.id === tween?.trackId)?.keys.find((x) => x.id === tween?.keyId);
      if (k) k.ease = e;
    });
  const ticks: number[] = [];
  const step = niceStep(tl.duration, width);
  for (let t = 0; t <= tl.duration + 0.1; t += step) ticks.push(t);
  const selNode = s.selection.length === 1 ? locate(ab, s.selection[0])?.node : null;

  return (
    <div className="timeline">
      <div className="timeline-bar">
        <SelectField
          value={tl.id}
          options={[{ value: '__design', label: 'Design view (no timeline)' }, ...ab.timelines.map((t) => ({ value: t.id, label: t.name })), { value: '__new', label: '+ New timeline' }]}
          onChange={(v) =>
            v === '__new' ? store().addTimeline() : store().set({ activeTimelineId: v === '__design' ? null : v, playhead: 0, selectedKeys: [], recording: v === '__design' ? false : store().get().recording })
          }
        />
        <TextField value={tl.name} commitOnBlur onChange={(v) => setTl((d) => (d.name = v || d.name))} />
        <IconButton icon={s.playing ? <Icons.pause /> : <Icons.play />} title={s.playing ? 'Pause preview' : 'Play preview'} onClick={() => store().set({ previewPlaying: !s.playing, playhead: !s.playing && s.playhead >= tl.duration ? 0 : s.playhead })} />
        <IconButton icon={<Icons.stop />} title="Back to start" onClick={() => store().set({ previewPlaying: false, playhead: 0 })} />
        <IconButton icon={<Icons.record />} className="record-btn" title="Record: property changes become keyframes" active={s.recording} onClick={() => store().set({ recording: !s.recording })} />
        <span className="time-readout mono">{Math.round(s.playhead)} ms</span>
        <NumberField label="Length" value={tl.duration} min={50} step={50} suffix="ms" onChange={(v) => setTl((d) => (d.duration = Math.round(v)), 'tl-dur')} />
        <SelectField
          value={tl.loop}
          options={[
            { value: 'once', label: 'Play once' },
            { value: 'loop', label: 'Loop' },
            { value: 'pingpong', label: 'Ping-pong' },
          ]}
          onChange={(v) => setTl((d) => (d.loop = v))}
        />
        <CheckField label="Autoplay" title="Start when the artboard is shown" value={tl.autoplay} onChange={(v) => setTl((d) => (d.autoplay = v))} />
        <NumberField label="Speed" value={tl.speed} step={0.1} min={0.1} onChange={(v) => setTl((d) => (d.speed = v), 'tl-speed')} />
        <IconButton
          icon={<Icons.trash />}
          title="Delete timeline"
          onClick={() => {
            if (!confirm(`Delete timeline "${tl.name}"?`)) return;
            store().update((d) => {
              const a = d.artboards.find((x) => x.id === ab.id);
              if (a) a.timelines = a.timelines.filter((t) => t.id !== tl.id);
            });
          }}
        />
      </div>
      <div className="timeline-body">
        <div className="timeline-labels" style={{ width: LABEL_W }}>
          <div className="ruler-spacer">
            {selNode ? (
              <div className="add-track">
                <SelectField value={addProp} options={ANIMATABLE_PROPS.map((a) => ({ value: a.prop, label: a.label }))} onChange={setAddProp} />
                <button className="btn" title={`Keyframe ${selNode.name}'s ${addProp} at the playhead`} onClick={() => store().keyCurrent(selNode.id, addProp)}>
                  + Key
                </button>
              </div>
            ) : (
              <span className="muted small">Select a layer to add keys</span>
            )}
          </div>
          {[...byNode.entries()].map(([nodeId, tracks]) => {
            const node = locate(ab, nodeId)?.node;
            return (
              <div key={nodeId} className="track-group">
                <div className="track-node" onClick={() => store().select([nodeId])}>
                  {node?.name ?? '(deleted layer)'}
                </div>
                {tracks.map((tr) => (
                  <div key={tr.id} className="track-label">
                    <span>{ANIMATABLE_PROPS.find((a) => a.prop === tr.prop)?.label ?? tr.prop}</span>
                    <button
                      className="mini"
                      title="Remove track"
                      onClick={() =>
                        setTl((d) => {
                          d.tracks = d.tracks.filter((x) => x.id !== tr.id);
                        })
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        <div className="timeline-lanes" ref={lane}>
          <div className="ruler" onPointerDown={scrub}>
            {ticks.map((t) => (
              <span key={t} className="tick" style={{ left: X(t) }}>
                {t >= 1000 ? `${(t / 1000).toFixed(t % 1000 ? 1 : 0)}s` : `${t}`}
              </span>
            ))}
          </div>
          {[...byNode.entries()].map(([nodeId, tracks]) => (
            <div key={nodeId} className="track-group">
              <div className="lane node-lane" onPointerDown={scrub}>
                {[...new Set(tracks.flatMap((t) => t.keys.map((k) => k.t)))].map((t) => (
                  <span key={t} className="key summary" style={{ left: X(t) }} />
                ))}
              </div>
              {tracks.map((tr) => (
                <div key={tr.id} className="lane" onPointerDown={scrub}>
                  {tr.keys.slice(0, -1).map((k, i) => {
                    const w = X(tr.keys[i + 1].t) - X(k.t);
                    const sel = tween?.trackId === tr.id && tween.keyId === k.id;
                    return (
                      <span
                        key={`seg-${k.id}`}
                        className={`segment${sel ? ' selected' : ''}`}
                        style={{ left: X(k.t), width: w }}
                        title={`Tween ${k.t}–${tr.keys[i + 1].t} ms: ${easeLabel(k.ease)}. Click to change its easing`}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setTween({ trackId: tr.id, keyId: k.id });
                          store().set({ selectedKeys: [], previewPlaying: false });
                        }}
                      >
                        {w > 28 && <EaseCurve ease={k.ease} width={w} />}
                      </span>
                    );
                  })}
                  {tr.keys.map((k) => (
                    <span
                      key={k.id}
                      className={`key${s.selectedKeys.includes(`${tr.id}:${k.id}`) ? ' selected' : ''}`}
                      style={{ left: X(k.t) }}
                      title={`${k.t} ms: ${String(k.value)}`}
                      onPointerDown={(e) => keyDown(e, tr.id, k)}
                    />
                  ))}
                </div>
              ))}
            </div>
          ))}
          <div className="playhead" style={{ left: X(Math.min(s.playhead, tl.duration)) }} />
        </div>
        {selectedKey && (
          <div className="key-editor">
            <div className="field-label block">Keyframe</div>
            <NumberField
              label="Time"
              value={selectedKey.key.t}
              suffix="ms"
              min={0}
              max={tl.duration}
              onChange={(v) =>
                setTl((d) => {
                  const k = findKey(d, s.selectedKeys[0]);
                  if (k) {
                    k.key.t = Math.round(v);
                    k.track.keys.sort((a, b) => a.t - b.t);
                  }
                }, 'key-t')
              }
            />
            <KeyValueField
              prop={selectedKey.track.prop}
              value={selectedKey.key.value}
              onChange={(v) =>
                setTl((d) => {
                  const k = findKey(d, s.selectedKeys[0]);
                  if (k) k.key.value = v;
                }, 'key-v')
              }
            />
            <p className="hint">Easing belongs to the tweens: click the line between two keys to change how it moves.</p>
          </div>
        )}
        {!selectedKey && selectedTween && (
          <div className="key-editor">
            <div className="field-label block">Tween</div>
            <div className="small muted">
              {ANIMATABLE_PROPS.find((a) => a.prop === selectedTween.track.prop)?.label ?? selectedTween.track.prop}: {String(selectedTween.key.value)} → {String(selectedTween.next.value)}, {selectedTween.key.t}–{selectedTween.next.t} ms
            </div>
            <EaseCurve ease={selectedTween.key.ease} width={196} height={70} big />
            <SelectField
              label="Ease"
              title="How the value moves from the first key to the second"
              value={Array.isArray(selectedTween.key.ease) ? 'custom' : selectedTween.key.ease}
              options={[...EASING_NAMES.map((e) => ({ value: e, label: e })), { value: 'custom', label: 'cubic-bezier…' }]}
              onChange={(v) => setEase(v === 'custom' ? [0.25, 0.1, 0.25, 1] : (v as Easing))}
            />
            {Array.isArray(selectedTween.key.ease) && (
              <TextField
                label="Bezier"
                mono
                commitOnBlur
                title="x1, y1, x2, y2 of the curve's two handles"
                value={selectedTween.key.ease.join(', ')}
                onChange={(v) => {
                  const n = v.split(/[\s,]+/).map(Number);
                  if (n.length === 4 && n.every(Number.isFinite)) setEase(n as [number, number, number, number]);
                }}
              />
            )}
            <button
              className="btn small-btn"
              title="Give every tween in this timeline the same easing"
              onClick={() =>
                setTl((d) => {
                  for (const tr of d.tracks) for (const k of tr.keys.slice(0, -1)) k.ease = Array.isArray(selectedTween.key.ease) ? [...selectedTween.key.ease] as typeof k.ease : selectedTween.key.ease;
                })
              }
            >
              Use for all tweens
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function KeyValueField({ prop, value, onChange }: { prop: string; value: Keyframe['value']; onChange: (v: Keyframe['value']) => void }) {
  const kind = ANIMATABLE_PROPS.find((a) => a.prop === prop)?.kind ?? (typeof value === 'number' ? 'number' : 'string');
  if (kind === 'number') return <NumberField label="Value" value={Number(value)} step={prop === 'opacity' || prop.startsWith('scale') ? 0.05 : 1} onChange={onChange} />;
  if (kind === 'color') return <ColorField label="Value" value={String(value)} onChange={onChange} />;
  if (kind === 'boolean') return <CheckField label="Value" value={!!value} onChange={onChange} />;
  return <TextField label="Value" value={String(value)} onChange={onChange} />;
}

function findKey(tl: TL, ref: string) {
  const [trackId, keyId] = ref.split(':');
  const track = tl.tracks.find((t) => t.id === trackId);
  const key = track?.keys.find((k) => k.id === keyId);
  return track && key ? { track, key } : null;
}

function niceStep(duration: number, width: number): number {
  const target = duration / Math.max(1, width / 70);
  for (const s of [10, 20, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 30000, 60000]) if (s >= target) return s;
  return 60000;
}

/** Delete the selected keyframes (from the global Delete shortcut). */
export function deleteSelectedKeys(): boolean {
  const st = store().get();
  if (!st.selectedKeys.length) return false;
  const refs = new Set(st.selectedKeys);
  store().updateTimeline((d) => {
    for (const tr of d.tracks) tr.keys = tr.keys.filter((k) => !refs.has(`${tr.id}:${k.id}`));
    d.tracks = d.tracks.filter((t) => t.keys.length);
  });
  store().set({ selectedKeys: [] });
  return true;
}

function easeLabel(e: Easing): string {
  return Array.isArray(e) ? `cubic-bezier(${e.join(', ')})` : e;
}

/** The easing curve, drawn inside a tween (or larger in the tween panel). */
function EaseCurve({ ease: e, width, height = 14, big }: { ease: Easing; width: number; height?: number; big?: boolean }) {
  const pts: string[] = [];
  const n = Math.max(8, Math.min(60, Math.round(width / 4)));
  const pad = big ? 6 : 1;
  const h = height - pad * 2;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const v = ease(e, t);
    pts.push(`${(t * (width - pad * 2) + pad).toFixed(1)},${(pad + h - v * h).toFixed(1)}`);
  }
  return (
    <svg className={big ? 'ease-curve big' : 'ease-curve'} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={pts.join(' ')} />
    </svg>
  );
}
