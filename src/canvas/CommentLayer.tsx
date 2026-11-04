/**
 * Review comment pins over the editor's canvas: a numbered marker per thread at its spot (following the layer it is on),
 * the pin about to be placed, and the open conversation next to its pin. Pins are drawn on top of the canvas and are not
 * part of any artboard, so nothing here reaches the preview, an export or a share link.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Project } from 'interactives-player';
import { comments, useComments } from '../lib/comments';
import { pinPlace, placeLabel } from '../lib/comment-anchor';
import { DraftCard, Pin, ThreadCard } from '../components/CommentUI';

const CARD_W = 330;

export function CommentLayer({ project, zoom, panX, panY, hidden }: { project: Project; zoom: number; panX: number; panY: number; hidden?: boolean }) {
  const c = useComments();
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 800 });
  useEffect(() => {
    const el = box.current?.parentElement;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Scrolling a conversation must not zoom the canvas under it (the canvas listens for the wheel on its own element)
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const stop = (e: WheelEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('.cm-card')) e.stopPropagation();
    };
    el.addEventListener('wheel', stop);
    return () => el.removeEventListener('wheel', stop);
  }, []);
  // Escape puts a draft or an open conversation away (typing in a box has its own Escape)
  useEffect(() => {
    if (!c.openId && !c.draft) return;
    const k = (e: KeyboardEvent) => {
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (e.key !== 'Escape' || (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT'))) return;
      comments.startDraft(null);
      comments.open(null);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [c.openId, c.draft]);

  if (hidden) return null;
  const at = (artboardId: string, x: number, y: number) => {
    const ab = project.artboards.find((a) => a.id === artboardId);
    return ab ? { x: panX + (ab.canvasX + x) * zoom, y: panY + (ab.canvasY + y) * zoom } : null;
  };
  const shown = comments.visible().filter((t) => c.showPins || t.id === c.openId);
  const open = comments.thread(c.openId);
  const where = (x: number, y: number): CSSProperties => {
    // To the right of the pin unless there is no room, and kept on the canvas. Low on the canvas it grows upward instead,
    // since a conversation's height isn't known until it is drawn
    const left = x + 36 + CARD_W > size.w ? Math.max(8, x - 10 - CARD_W) : x + 36;
    if (y > size.h * 0.5) return { left, bottom: Math.max(8, size.h - y - 4), maxHeight: Math.max(160, y - 8) };
    const top = Math.max(8, y - 32);
    return { left, top, maxHeight: Math.max(160, size.h - top - 12) };
  };
  const openPlace = open ? pinPlace(project, open) : null;
  const openAt = open && openPlace && !openPlace.missing ? at(openPlace.artboardId, openPlace.x, openPlace.y) : null;
  const draftAt = c.draft ? at(c.draft.anchor.artboardId, c.draft.anchor.x, c.draft.anchor.y) : null;

  return (
    <div className="cm-layer" ref={box} aria-label="Comment pins">
      {shown.map((t) => {
        const p = pinPlace(project, t);
        const s = p.missing ? null : at(p.artboardId, p.x, p.y);
        if (!s) return null;
        return <Pin key={t.id} thread={t} detached={p.detached} selected={c.openId === t.id} mine={!!c.me?.username && t.assignee?.username === c.me.username} style={{ left: s.x, top: s.y }} onClick={(e) => (e.stopPropagation(), comments.open(c.openId === t.id ? null : t.id))} />;
      })}
      {c.draft && draftAt && (
        <>
          <span className="cm-pin draft" style={{ left: draftAt.x, top: draftAt.y }} aria-hidden="true">
            +
          </span>
          <div className="cm-card" style={{ ...where(draftAt.x, draftAt.y), width: CARD_W }} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <DraftCard where={c.draft.context.layer ? `${c.draft.context.artboard} › ${c.draft.context.layer}` : c.draft.context.artboard} onClose={() => comments.startDraft(null)} />
          </div>
        </>
      )}
      {open && openAt && (
        <div className="cm-card" style={{ ...where(openAt.x, openAt.y), width: CARD_W }} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <ThreadCard thread={open} where={placeLabel(project, open)} onClose={() => comments.open(null)} />
        </div>
      )}
    </div>
  );
}
