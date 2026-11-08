/** The arithmetic behind Export > Video, GIF or frames: how many frames, when each one is, how big, and what a browser can encode. */
import { GIF_MAX_FPS } from './gif';

export type MotionFormat = 'mp4' | 'webm' | 'gif' | 'png';

export const MOTION_MAX_FRAMES = 3600;
export const MOTION_MAX_SIDE = 4096;
export const MOTION_MAX_FPS = 60;

/** Frames in a timeline of `durationMs` at `fps`: the last frame stops one step short of the end, so a looping clip doesn't repeat its first pose. */
export function frameCount(durationMs: number, fps: number): number {
  if (!(durationMs > 0) || !(fps > 0)) return 0;
  return Math.max(1, Math.round((durationMs / 1000) * fps));
}

/** The timeline time of frame `index`, in ms (never past the end). */
export function frameTime(index: number, fps: number, durationMs: number): number {
  return Math.min(durationMs, (index * 1000) / fps);
}

/** Output size for an artboard drawn `width` px wide. Videos need even sides; everything is kept inside the limits. */
export function outputSize(artW: number, artH: number, width: number, even: boolean): { width: number; height: number } {
  let w = Math.max(2, Math.min(MOTION_MAX_SIDE, Math.round(width)));
  let h = Math.max(2, Math.round((w * artH) / artW));
  if (h > MOTION_MAX_SIDE) {
    h = MOTION_MAX_SIDE;
    w = Math.max(2, Math.round((h * artW) / artH));
  }
  if (even) {
    w -= w % 2;
    h -= h % 2;
    w = Math.max(2, w);
    h = Math.max(2, h);
  }
  return { width: w, height: h };
}

/** The fastest frame rate a format keeps (GIF can't show frames closer than 20 ms). */
export function maxFps(format: MotionFormat): number {
  return format === 'gif' ? GIF_MAX_FPS : MOTION_MAX_FPS;
}

/** Why the chosen settings can't be exported, or null. */
export function motionProblem(opts: { durationMs: number; fps: number; format: MotionFormat }): string | null {
  if (!(opts.durationMs > 0)) return 'This timeline has no length yet. Add keyframes or set its duration first.';
  if (!(opts.fps >= 1)) return 'Frames per second must be at least 1.';
  if (opts.fps > maxFps(opts.format)) return `${opts.format.toUpperCase()} goes up to ${maxFps(opts.format)} frames per second.`;
  if (frameCount(opts.durationMs, opts.fps) > MOTION_MAX_FRAMES) return `That is more than ${MOTION_MAX_FRAMES} frames. Lower the frame rate, or shorten the timeline.`;
  return null;
}

/** Zero-padded frame file names: frame-0001.png, with enough digits for the count (at least four). */
export function frameName(index: number, count: number): string {
  const digits = Math.max(4, String(count).length);
  return `frame-${String(index + 1).padStart(digits, '0')}.png`;
}

/** A bitrate that suits the picture size and rate (bits per pixel per frame), in bits per second. */
export function videoBitrate(width: number, height: number, fps: number): number {
  return Math.round(Math.min(40_000_000, Math.max(1_000_000, width * height * fps * 0.12)));
}

/** The H.264 profile and level string for a picture size: level 4.2 reaches 1080p60, 5.1 reaches 4K. */
export function avcCodec(width: number, height: number): string {
  return width * height <= 1920 * 1088 ? 'avc1.64002a' : 'avc1.640033';
}

export const VP9_CODEC = 'vp09.00.10.08';
