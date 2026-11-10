import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { hideTour, isShown, useTour } from '../lib/tour';

type Box = { left: number; top: number; width: number; height: number };

/**
 * What Show me draws: a gold ring round the control with its name beside it, or (when the control is not on screen) a note
 * saying where it is. Nothing here takes a click or the focus. It follows the control if the window or the panel moves, and it
 * is said politely to a screen reader by lib/tour.ts (this drawing is for the eyes).
 */
export function TourOverlay() {
  const tour = useTour();
  const [box, setBox] = useState<Box | null>(null);
  const el = tour?.el ?? null;
  useEffect(() => {
    if (!el) return setBox(null);
    const measure = () => {
      //the control went (its panel closed, a tool group folded): the ring goes with it
      if (!isShown(el)) return hideTour();
      const r = el.getBoundingClientRect();
      setBox((b) => (b && b.left === r.left && b.top === r.top && b.width === r.width && b.height === r.height ? b : { left: r.left, top: r.top, width: r.width, height: r.height }));
    };
    measure();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    const every = setInterval(measure, 250);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      ro?.disconnect();
      clearInterval(every);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [el, tour?.key]);
  if (!tour) return null;
  const pad = 5;
  const below = box ? box.top + box.height + 80 < window.innerHeight : true;
  return createPortal(
    <div className="tour-layer" data-tour-layer="">
      {box && (
        <>
          <div key={tour.key} className="tour-ring" style={{ left: box.left - pad, top: box.top - pad, width: box.width + pad * 2, height: box.height + pad * 2 }} />
          <div
            className="tour-label"
            style={{ left: Math.max(8, Math.min(box.left + box.width / 2 - 110, window.innerWidth - 228)), ...(below ? { top: box.top + box.height + pad + 8 } : { bottom: window.innerHeight - box.top + pad + 8 }) }}
          >
            {tour.label}
          </div>
        </>
      )}
      {!box && (
        <div className="tour-label tour-note">
          <strong>{tour.label}</strong> {tour.where}
        </div>
      )}
    </div>,
    document.body,
  );
}
