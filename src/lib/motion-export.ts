import type { Artboard, Project, Timeline } from 'interactives-player';
import { fileSafe } from './export';
import { drawArtboardFrame } from './image-export';
import { FrameZip } from './frame-zip';
import { GifEncoder, gifDelays } from './gif';
import { avcCodec, frameCount, frameName, frameTime, motionProblem, outputSize, videoBitrate, VP9_CODEC, type MotionFormat } from './motion-frames';

export interface MotionOptions {
  format: MotionFormat;
  /** Output picture width in px; the height follows the artboard's shape */
  width: number;
  fps: number;
  theme?: string | null;
  /** GIF only: repeat for ever */
  loop?: boolean;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

export interface MotionResult {
  blob: Blob;
  filename: string;
  frames: number;
  warnings: string[];
}

const hasEncoder = () => typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';

/** Which video files this browser can make at this size. Empty when it has no VideoEncoder at all. */
export async function supportedVideoFormats(width: number, height: number, fps: number): Promise<('mp4' | 'webm')[]> {
  if (!hasEncoder()) return [];
  const out: ('mp4' | 'webm')[] = [];
  const bitrate = videoBitrate(width, height, fps);
  for (const [fmt, codec] of [['mp4', avcCodec(width, height)], ['webm', VP9_CODEC]] as const) {
    try {
      const r = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate, framerate: fps });
      if (r.supported) out.push(fmt);
    } catch {
      /* not supported */
    }
  }
  return out;
}

/** The container writer for a video format (the muxers are only fetched when a video is exported). */
async function makeMuxer(mp4: boolean, width: number, height: number, fps: number): Promise<{ add: (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => void; finish: () => ArrayBuffer }> {
  if (mp4) {
    const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
    const target = new ArrayBufferTarget();
    const m = new Muxer({ target, video: { codec: 'avc', width, height, frameRate: fps }, fastStart: 'in-memory' });
    return { add: (c, meta) => m.addVideoChunk(c, meta), finish: () => (m.finalize(), target.buffer) };
  }
  const { Muxer, ArrayBufferTarget } = await import('webm-muxer');
  const target = new ArrayBufferTarget();
  const m = new Muxer({ target, video: { codec: 'V_VP9', width, height, frameRate: fps } });
  return { add: (c, meta) => m.addVideoChunk(c, meta), finish: () => (m.finalize(), target.buffer) };
}

const aborted = () => new DOMException('Export cancelled', 'AbortError');
export const isCancelled = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/** Waits until the encoder's backlog is small, so frames don't pile up in memory faster than they're encoded. */
async function drain(enc: VideoEncoder, limit: number) {
  while (enc.encodeQueueSize > limit) await new Promise((r) => setTimeout(r, 4));
}

/**
 * Renders one timeline of one artboard frame by frame: for each frame the timeline is sampled at that exact time and drawn, so the
 * result doesn't depend on how fast the browser is. Throws an AbortError when cancelled.
 */
export async function exportMotion(project: Project, ab: Artboard, tl: Timeline, opts: MotionOptions): Promise<MotionResult> {
  const problem = motionProblem({ durationMs: tl.duration, fps: opts.fps, format: opts.format });
  if (problem) throw new Error(problem);
  const total = frameCount(tl.duration, opts.fps);
  const isVideo = opts.format === 'mp4' || opts.format === 'webm';
  const { width, height } = outputSize(ab.width, ab.height, opts.width, isVideo);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: opts.format === 'gif' })!;
  const warnings = new Set<string>();
  const base = `${fileSafe(project.name)}-${fileSafe(ab.name)}`;
  const check = () => {
    if (opts.signal?.aborted) throw aborted();
  };
  // Video and GIF have no transparency to speak of, so they're drawn on white; PNG frames keep theirs
  const background = opts.format === 'png' ? null : '#ffffff';
  const draw = async (i: number) => {
    check();
    const w = await drawArtboardFrame(project, ab, tl, frameTime(i, opts.fps, tl.duration), ctx, width, height, { theme: opts.theme, background });
    w.forEach((x) => warnings.add(x));
    check();
  };
  const result = (blob: Blob, ext: string): MotionResult => ({ blob, filename: `${base}.${ext}`, frames: total, warnings: [...warnings] });
  opts.onProgress?.(0, total);

  if (opts.format === 'gif') {
    const gif = new GifEncoder(width, height, { loop: opts.loop });
    const delays = gifDelays(opts.fps, total);
    for (let i = 0; i < total; i++) {
      await draw(i);
      gif.addFrame(ctx.getImageData(0, 0, width, height).data, delays[i]);
      opts.onProgress?.(i + 1, total);
    }
    return result(new Blob([gif.finish() as BlobPart], { type: 'image/gif' }), 'gif');
  }

  if (opts.format === 'png') {
    const zip = new FrameZip(total);
    for (let i = 0; i < total; i++) {
      await draw(i);
      const png = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
      if (!png) throw new Error('The browser could not make a PNG frame.');
      zip.add(new Uint8Array(await png.arrayBuffer()));
      opts.onProgress?.(i + 1, total);
    }
    return result(await zip.finish(), 'zip');
  }

  if (!hasEncoder()) throw new Error('This browser cannot encode video. Choose GIF or PNG frames instead.');
  const mp4 = opts.format === 'mp4';
  const codec = mp4 ? avcCodec(width, height) : VP9_CODEC;
  const config = { codec, width, height, bitrate: videoBitrate(width, height, opts.fps), framerate: opts.fps };
  if (!(await VideoEncoder.isConfigSupported(config)).supported) throw new Error(`This browser cannot encode ${mp4 ? 'MP4 (H.264)' : 'WebM (VP9)'} at ${width} x ${height}. Try a smaller width or another format.`);
  const muxer = await makeMuxer(mp4, width, height, opts.fps);
  let failure: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.add(chunk, meta),
    error: (e) => {
      failure = e;
    },
  });
  encoder.configure(config);
  try {
    const step = Math.round(1e6 / opts.fps);
    for (let i = 0; i < total; i++) {
      await draw(i);
      if (failure) throw failure;
      const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / opts.fps), duration: step });
      // A key frame every two seconds, so the file can be scrubbed
      encoder.encode(frame, { keyFrame: i % Math.max(1, Math.round(opts.fps * 2)) === 0 });
      frame.close();
      await drain(encoder, 6);
      opts.onProgress?.(i + 1, total);
    }
    await encoder.flush();
    if (failure) throw failure;
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
  return result(new Blob([muxer.finish()], { type: mp4 ? 'video/mp4' : 'video/webm' }), mp4 ? 'mp4' : 'webm');
}

export { frameName };
