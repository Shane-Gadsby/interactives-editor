import { useEffect, useRef, useState } from 'react';
import { getArtboard } from '../store/doc';
import { store } from '../store/store';
import { download } from '../lib/export';
import { track } from '../lib/analytics';
import { frameCount, maxFps, motionProblem, outputSize, MOTION_MAX_SIDE, type MotionFormat } from '../lib/motion-frames';
import { Modal } from './ProjectModals';

const LABELS: Record<MotionFormat, string> = {
  mp4: 'MP4 video (H.264)',
  webm: 'WebM video (VP9)',
  gif: 'Animated GIF',
  png: 'PNG frames (ZIP)',
};

/**
 * Export > Video, GIF or frames. One timeline of the open artboard, drawn frame by frame at an exact time each (so the result
 * doesn't depend on how fast this computer is), as a video, a GIF or a ZIP of PNG pictures. Audio is not part of it yet.
 */
export function MotionExportModal({ onClose }: { onClose: () => void }) {
  const state = store().get();
  const project = state.project;
  const ab = getArtboard(project, state.activeArtboardId);
  const timelines = ab?.timelines ?? [];
  const [tlId, setTlId] = useState(timelines.find((t) => t.id === state.activeTimelineId)?.id ?? timelines[0]?.id ?? '');
  const tl = timelines.find((t) => t.id === tlId) ?? null;
  const [picked, setPicked] = useState<MotionFormat | null>(null);
  const [width, setWidth] = useState(Math.min(ab?.width ?? 1280, 1280));
  const [fps, setFps] = useState(Math.round(tl?.fps ?? 30));
  const [loop, setLoop] = useState(true);
  const [videos, setVideos] = useState<('mp4' | 'webm')[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const control = useRef<AbortController | null>(null);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  const canEncode = typeof VideoEncoder !== 'undefined';
  const format: MotionFormat = picked ?? videos?.[0] ?? 'gif';
  const isVideo = format === 'mp4' || format === 'webm';
  const size = ab ? outputSize(ab.width, ab.height, width, isVideo) : { width, height: width };
  const fpsNow = Math.min(fps, maxFps(format));

  // Which video files this browser can encode at the chosen size
  useEffect(() => {
    if (!canEncode) return setVideos([]);
    let stale = false;
    const t = setTimeout(() => {
      import('../lib/motion-export').then((m) => m.supportedVideoFormats(size.width, size.height, Math.min(fps, 60))).then((list) => !stale && setVideos(list));
    }, 150);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [canEncode, size.width, size.height, fps]);

  const running = progress !== null;
  const problem = tl ? motionProblem({ durationMs: tl.duration, fps: fpsNow, format }) : 'This artboard has no timeline. Add one in the timeline panel first.';
  const frames = tl ? frameCount(tl.duration, fpsNow) : 0;
  const close = () => {
    control.current?.abort();
    onClose();
  };
  const start = async () => {
    if (!ab || !tl || problem) return;
    setError(null);
    setProgress({ done: 0, total: frames });
    const ctl = (control.current = new AbortController());
    try {
      const { exportMotion } = await import('../lib/motion-export');
      const r = await exportMotion(project, ab, tl, {
        format,
        width,
        fps: fpsNow,
        loop,
        theme: state.canvasTheme,
        signal: ctl.signal,
        onProgress: (done, total) => alive.current && setProgress({ done, total }),
      });
      download(r.blob, r.filename);
      track('feature', 'motion-export', { thing: format, sum: { frames: r.frames } });
      for (const w of r.warnings) store().toast(w);
      store().toast(`Saved ${r.frames} frames as ${r.filename}.`);
      if (alive.current) onClose();
    } catch (e) {
      if (!alive.current) return;
      if (e instanceof DOMException && e.name === 'AbortError') store().toast('Export cancelled.');
      else setError(e instanceof Error ? e.message : String(e));
      setProgress(null);
    }
  };

  return (
    <Modal title="Video, GIF or frames" help="export#video-gif-and-frames" onClose={close} className="share-modal">
      <div className="share-body">
        {!ab ? (
          <p className="muted">Open an artboard first.</p>
        ) : (
          <>
            <p className="muted">Draws one timeline of the open artboard frame by frame, each frame at its exact time, so the file is smooth however fast this computer is.</p>
            <label className="field">
              <span>Timeline</span>
              <select value={tlId} disabled={running} onChange={(e) => (setTlId(e.target.value), setFps(Math.round(timelines.find((t) => t.id === e.target.value)?.fps ?? fps)))}>
                {timelines.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({(t.duration / 1000).toFixed(2)} s)
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Format</span>
              <select
                value={format}
                disabled={running}
                onChange={(e) => {
                  const f = e.target.value as MotionFormat;
                  setPicked(f);
                  if (f === 'gif') setWidth((w) => Math.min(w, 640));
                }}
              >
                {(videos ?? []).includes('mp4') && <option value="mp4">{LABELS.mp4}</option>}
                {(videos ?? []).includes('webm') && <option value="webm">{LABELS.webm}</option>}
                <option value="gif">{LABELS.gif}</option>
                <option value="png">{LABELS.png}</option>
              </select>
            </label>
            {!canEncode && <p className="small muted">This browser cannot encode video (it has no VideoEncoder), so only GIF and PNG frames are offered. A recent Chrome, Edge or Safari can make MP4 and WebM.</p>}
            {canEncode && videos && videos.length === 0 && <p className="small muted">This browser cannot encode video at this size. Try a smaller width, or use GIF or PNG frames.</p>}
            <div className="row">
              <label className="field">
                <span>Width (px)</span>
                <input type="number" min={2} max={MOTION_MAX_SIDE} value={width} disabled={running} onChange={(e) => setWidth(Number(e.target.value) || 2)} />
              </label>
              <label className="field">
                <span>Frames per second</span>
                <input type="number" min={1} max={maxFps(format)} value={fps} disabled={running} onChange={(e) => setFps(Math.max(1, Math.round(Number(e.target.value) || 1)))} />
              </label>
            </div>
            {format === 'gif' && (
              <label className="check-row">
                <input type="checkbox" checked={loop} disabled={running} onChange={(e) => setLoop(e.target.checked)} /> Repeat for ever
              </label>
            )}
            <p className="small muted">
              {problem ?? `${frames} frames at ${size.width} x ${size.height}, ${fpsNow} per second. The timeline plays once through, from the start.`}
              {fps > maxFps(format) && !problem && ` ${format.toUpperCase()} is limited to ${maxFps(format)} per second.`}
            </p>
            <p className="small muted">Audio is not included yet. Video and embed layers show as empty boxes. Frames use the theme shown on the canvas. Video and GIF are drawn on white; PNG frames keep any transparency.</p>
            {running && (
              <div className="motion-progress" role="progressbar" aria-valuemin={0} aria-valuemax={progress!.total} aria-valuenow={progress!.done}>
                <div className="bar">
                  <span style={{ width: `${(progress!.done / Math.max(1, progress!.total)) * 100}%` }} />
                </div>
                <span className="small muted">
                  Frame {progress!.done} of {progress!.total}
                </span>
              </div>
            )}
            {error && <p className="error">{error}</p>}
            <div className="row">
              <button className="btn primary" disabled={running || !!problem} onClick={() => void start()}>
                {running ? 'Rendering…' : 'Export'}
              </button>
              <button className="btn" onClick={close}>
                {running ? 'Cancel' : 'Close'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
