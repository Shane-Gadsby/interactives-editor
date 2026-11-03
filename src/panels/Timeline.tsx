import { useEffect, useRef, useState } from 'react';
import { ANIMATABLE_PROPS, animatableProp, EASING_NAMES, ease, pathPointProp, uid, type Easing, type Keyframe, type SceneNode, type Timeline as TL } from 'interactives-player';
import { store, useEditor } from '../store/store';
import { getArtboard, locate } from '../store/doc';
import { confirmDialog } from '../components/dialogs';
import { CheckField, ColorField, IconButton, NumberField, SelectField, TextField } from '../components/ui';
import { Icons } from '../components/icons';
import { ChildOrder } from '../components/ChildOrder';
import { CurveEditor, bezierFor } from '../components/CurveEditor';

const LABEL_W = 220;

/** Short names of a path point's tracks, shown under the point's own row. */
const POINT_PART_LABEL = { x: 'X', y: 'Y', 'in.x': 'In handle X', 'in.y': 'In handle Y', 'out.x': 'Out handle X', 'out.y': 'Out handle Y' } as const;
/** A layer with more point tracks than this starts with its points folded. */
const FOLD_POINTS_OVER = 12;

type TrackRow = { kind: 'track'; tr: TL['tracks'][number] };
type PointRow = { kind: 'point'; key: string; label: string; tracks: TL['tracks']; open: boolean };

/**
 * One layer's track rows: its ordinary tracks, then its shape keys grouped by point ("Shape: point 3" with that point's
 * x, y and handle tracks under it; a layer with many points starts folded).
 */
export function trackRows(nodeId: string, tracks: TL['tracks'], toggled: Record<string, boolean>): (TrackRow | PointRow)[] {
  const rows: (TrackRow | PointRow)[] = [];
  const groups = new Map<string, { sub: number; index: number; tracks: TL['tracks'] }>();
  const nPoint = tracks.filter((t) => pathPointProp(t.prop)).length;
  for (const tr of tracks) {
    const pp = pathPointProp(tr.prop);
    if (!pp) {
      rows.push({ kind: 'track', tr });
      continue;
    }
    const k = `${pp.sub}.${pp.index}`;
    const g = groups.get(k) ?? { sub: pp.sub, index: pp.index, tracks: [] };
    g.tracks.push(tr);
    groups.set(k, g);
  }
  const order = ['x', 'y', 'in.x', 'in.y', 'out.x', 'out.y'];
  for (const g of [...groups.values()].sort((a, b) => a.sub - b.sub || a.index - b.index)) {
    const key = `${nodeId}:${g.sub}.${g.index}`;
    g.tracks.sort((a, b) => order.indexOf(pathPointProp(a.prop)!.part) - order.indexOf(pathPointProp(b.prop)!.part));
    rows.push({ kind: 'point', key, label: `Shape: point ${g.index + 1}${g.sub ? ` (path ${g.sub + 1})` : ''}`, tracks: g.tracks, open: toggled[key] ?? nPoint <= FOLD_POINTS_OVER });
    if (toggled[key] ?? nPoint <= FOLD_POINTS_OVER) for (const tr of g.tracks) rows.push({ kind: 'track', tr });
  }
  return rows;
}

/** A track's property name for people: the list's label, with the number of a later constraint or text modifier. */
function animatableLabel(prop: string): string {
  const label = animatableProp(prop)?.label;
  if (!label) return prop;
  const m = /^(?:constraints|modifiers)\.(\d+)\./.exec(prop);
  return m && m[1] !== '0' ? `${label} #${Number(m[1]) + 1}` : label;
}

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
  // The marker on the ruler being edited
  const [markerId, setMarkerId] = useState<string | null>(null);
  // The tween (span between a key and the next) whose easing is being edited, named by its starting key
  const [tween, setTween] = useState<{ trackId: string; keyId: string } | null>(null);
  // Shape-key point groups opened or folded by hand (otherwise by how many there are)
  const [pointsOpen, setPointsOpen] = useState<Record<string, boolean>>({});

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

  const addMarker = () => {
    const id = uid('mk');
    const n = (tl.markers?.length ?? 0) + 1;
    setTl((d) => {
      (d.markers ??= []).push({ id, time: Math.round(Math.min(s.playhead, d.duration)), name: `Marker ${n}` });
      d.markers.sort((a, b) => a.time - b.time);
    });
    setMarkerId(id);
  };

  /** Press on a marker: select it, then drag to retime it. */
  const markerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    setMarkerId(id);
    const el = e.currentTarget as HTMLElement;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable in some test environments */
    }
    const move = (ev: PointerEvent) => {
      const t = snap(T(ev.clientX), ev);
      setTl((d) => {
        const m = d.markers?.find((x) => x.id === id);
        if (m) m.time = t;
      }, `marker-${id}`);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  const selMarker = tl.markers?.find((m) => m.id === markerId);

  const keyDown = (e: React.PointerEvent, trackId: string, key: Keyframe) => keysDown(e, [`${trackId}:${key.id}`], key.t);

  /** Press on one key, or on a layer's summary diamond (all of its keys at that time): select, then drag them. */
  const keysDown = (e: React.PointerEvent, refs: string[], t: number) => {
    e.stopPropagation();
    let sel = store().get().selectedKeys;
    const allIn = refs.every((r) => sel.includes(r));
    if (e.shiftKey) sel = allIn ? sel.filter((x) => !refs.includes(x)) : [...new Set([...sel, ...refs])];
    else if (!allIn) sel = refs;
    store().set({ selectedKeys: sel, playhead: t, previewPlaying: false });
    setTween(null);
    const startX = e.clientX;
    const el = e.currentTarget as HTMLElement;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic event */
    }
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

  /** One track's lane: its tweens (click for easing) and keys. */
  const trackLane = (tr: TL['tracks'][number]) => (
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
  );

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
        <button className="btn" title="Add a marker at the playhead. An On timeline marker node runs when playback passes it" onClick={addMarker}>
          + Marker
        </button>
        {selMarker && (
          <>
            <TextField value={selMarker.name} commitOnBlur onChange={(v) => setTl((d) => void (d.markers!.find((x) => x.id === selMarker.id)!.name = v || selMarker.name))} />
            <NumberField label="At" value={selMarker.time} min={0} max={tl.duration} suffix="ms" onChange={(v) => setTl((d) => void (d.markers!.find((x) => x.id === selMarker.id)!.time = Math.round(v)), `marker-${selMarker.id}`)} />
            <IconButton
              icon={<Icons.trash />}
              title="Delete marker"
              onClick={() => {
                setTl((d) => void (d.markers = d.markers!.filter((x) => x.id !== selMarker.id)));
                setMarkerId(null);
              }}
            />
          </>
        )}
        <IconButton
          icon={<Icons.trash />}
          title="Delete timeline"
          onClick={async () => {
            if (!(await confirmDialog({ title: 'Delete timeline', message: `Delete timeline "${tl.name}"?`, confirmLabel: 'Delete timeline', danger: true }))) return;
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
                {trackRows(nodeId, tracks, pointsOpen).map((row) =>
                  row.kind === 'point' ? (
                    <div key={row.key} className="track-label track-point" onClick={() => setPointsOpen((o) => ({ ...o, [row.key]: !row.open }))} title="Show or fold this point's keys">
                      <span>
                        {row.open ? '▾' : '▸'} {row.label}
                      </span>
                      <button
                        className="mini"
                        title="Remove this point's keys"
                        onClick={(e) => {
                          e.stopPropagation();
                          const gone = new Set(row.tracks.map((x) => x.id));
                          setTl((d) => {
                            d.tracks = d.tracks.filter((x) => !gone.has(x.id));
                          });
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <div key={row.tr.id} className={`track-label${pathPointProp(row.tr.prop) ? ' point-part' : ''}`}>
                      <span>{pathPointProp(row.tr.prop) ? POINT_PART_LABEL[pathPointProp(row.tr.prop)!.part] : animatableLabel(row.tr.prop)}</span>
                      <button
                        className="mini"
                        title="Remove track"
                        onClick={() =>
                          setTl((d) => {
                            d.tracks = d.tracks.filter((x) => x.id !== row.tr.id);
                          })
                        }
                      >
                        ×
                      </button>
                    </div>
                  ),
                )}
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
            {(tl.markers ?? []).map((m) => (
              <span key={m.id} className={`marker${m.id === markerId ? ' selected' : ''}`} style={{ left: X(Math.min(m.time, tl.duration)) }} title={`${m.name} at ${m.time} ms. Drag to move it`} onPointerDown={(e) => markerDown(e, m.id)} />
            ))}
          </div>
          {[...byNode.entries()].map(([nodeId, tracks]) => (
            <div key={nodeId} className="track-group">
              <div className="lane node-lane" onPointerDown={scrub}>
                {[...new Set(tracks.flatMap((t) => t.keys.map((k) => k.t)))].map((t) => {
                  const refs = tracks.flatMap((tr) => tr.keys.filter((k) => k.t === t).map((k) => `${tr.id}:${k.id}`));
                  return (
                    <span
                      key={t}
                      className={`key summary${refs.every((r) => s.selectedKeys.includes(r)) ? ' selected' : ''}`}
                      style={{ left: X(t) }}
                      title={`${t} ms: all of this layer's keys here. Drag to move them together`}
                      onPointerDown={(e) => keysDown(e, refs, t)}
                    />
                  );
                })}
              </div>
              {trackRows(nodeId, tracks, pointsOpen).map((row) =>
                row.kind === 'point' ? (
                  <div key={row.key} className="lane node-lane point-lane" onPointerDown={scrub}>
                    {[...new Set(row.tracks.flatMap((t) => t.keys.map((k) => k.t)))].map((t) => {
                      const refs = row.tracks.flatMap((tr) => tr.keys.filter((k) => k.t === t).map((k) => `${tr.id}:${k.id}`));
                      return (
                        <span
                          key={t}
                          className={`key summary${refs.every((r) => s.selectedKeys.includes(r)) ? ' selected' : ''}`}
                          style={{ left: X(t) }}
                          title={`${t} ms: this point's keys here. Drag to move them together`}
                          onPointerDown={(e) => keysDown(e, refs, t)}
                        />
                      );
                    })}
                  </div>
                ) : (
                  trackLane(row.tr)
                ),
              )}
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
              kids={(() => {
                const n = locate(ab, selectedKey.track.nodeId)?.node;
                return n && 'children' in n ? n.children : [];
              })()}
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
              {animatableLabel(selectedTween.track.prop)}: {tweenValue(selectedTween.key.value)} → {tweenValue(selectedTween.next.value)}, {selectedTween.key.t}–{selectedTween.next.t} ms
            </div>
            <CurveEditor ease={selectedTween.key.ease} onChange={(e) => setEase(e)} />
            <SelectField
              label="Ease"
              title="How the value moves from the first key to the second"
              value={Array.isArray(selectedTween.key.ease) ? 'custom' : selectedTween.key.ease}
              options={[...EASING_NAMES.map((e) => ({ value: e, label: e })), { value: 'custom', label: 'Custom (drag the handles)' }]}
              onChange={(v) => setEase(v === 'custom' ? bezierFor(selectedTween.key.ease) : (v as Easing))}
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

function KeyValueField({ prop, value, kids, onChange }: { prop: string; value: Keyframe['value']; kids: SceneNode[]; onChange: (v: Keyframe['value']) => void }) {
  if (prop === 'drawOrder') return <ChildOrder children={kids} order={Array.isArray(value) ? value : []} onChange={onChange} />;
  if (prop === 'solo.active')
    return <SelectField label="Value" value={String(value)} options={[{ value: '', label: '(none)' }, ...kids.map((c) => ({ value: c.id, label: c.name }))]} onChange={onChange} />;
  const kind = animatableProp(prop)?.kind ?? (typeof value === 'number' ? 'number' : 'string');
  if (kind === 'number') return <NumberField label="Value" value={Number(value)} step={prop === 'opacity' || prop.startsWith('scale') ? 0.05 : 1} onChange={onChange} />;
  if (kind === 'color') return <ColorField label="Value" value={String(value)} onChange={onChange} />;
  if (kind === 'boolean') return <CheckField label="Value" value={!!value} onChange={onChange} />;
  return <TextField label="Value" value={String(value)} onChange={onChange} />;
}

/** Short text for a keyframe value (a draw order is a list of layer ids, which says little). */
function tweenValue(v: Keyframe['value']): string {
  return Array.isArray(v) ? `order of ${v.length} layers` : String(v);
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

