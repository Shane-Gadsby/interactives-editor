/** A real measurement of how big a text is, with the browser's canvas, for the checker's "where do the words sit" estimate. */
import type { SceneNode } from 'interactives-player';
import type { TextMeasure } from './backdrop';

let g: CanvasRenderingContext2D | null | undefined;

export const canvasTextMeasure: TextMeasure = (node: SceneNode, maxWidth: number) => {
  if (g === undefined) {
    try {
      // jsdom has no canvas and complains out loud when asked
      g = /jsdom/i.test(navigator.userAgent) ? null : document.createElement('canvas').getContext('2d');
    } catch {
      g = null;
    }
  }
  if (!g) return null;
  const t = node as unknown as { text?: string; label?: string; fontFamily?: string; fontSize?: number; fontWeight?: number; fontStyle?: string; lineHeight?: number; letterSpacing?: number; wrap?: boolean; autoSize?: string };
  const text = String((node.type === 'button' ? t.label : t.text) ?? '');
  const size = t.fontSize ?? 16;
  g.font = `${t.fontStyle === 'italic' ? 'italic ' : ''}${t.fontWeight ?? 400} ${size}px ${t.fontFamily ?? 'sans-serif'}`;
  const spacing = t.letterSpacing ?? 0;
  const wide = (s: string) => g!.measureText(s).width + spacing * s.length;
  const wrap = node.type !== 'button' && t.wrap !== false && t.autoSize !== 'width';
  let lines = 0;
  let widest = 0;
  for (const para of text.split('\n')) {
    if (!wrap) {
      lines++;
      widest = Math.max(widest, wide(para));
      continue;
    }
    let line = '';
    let any = false;
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && wide(next) > maxWidth) {
        widest = Math.max(widest, wide(line));
        lines++;
        line = word;
      } else line = next;
      any = true;
    }
    if (any || !para) {
      widest = Math.max(widest, wide(line));
      lines++;
    }
  }
  if (!widest && !lines) return null;
  return { width: widest, height: Math.max(1, lines) * size * (t.lineHeight ?? 1.3) };
};
