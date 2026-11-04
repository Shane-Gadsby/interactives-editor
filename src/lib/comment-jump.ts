import type { Thread } from '../../shared/comments.mjs';
import { store } from '../store/store';
import { getArtboard } from '../store/doc';
import { comments } from './comments';
import { pinPlace } from './comment-anchor';

/** Take the editor to a thread: its artboard, the layer it is on, the pin in the middle of the canvas, its conversation open. */
export function jumpToThread(t: Thread): void {
  const s = store();
  const st = s.get();
  const place = pinPlace(st.project, t);
  const ab = place.missing ? undefined : getArtboard(st.project, place.artboardId);
  if (ab) {
    const r = document.querySelector('.canvas')?.getBoundingClientRect();
    const layer = t.anchor.layerId && !place.detached ? t.anchor.layerId : null;
    if (layer) s.select([layer], { artboardId: ab.id });
    else s.set({ activeArtboardId: ab.id });
    if (r) s.set({ panX: r.width / 2 - 120 - (ab.canvasX + place.x) * st.zoom, panY: r.height / 2 - (ab.canvasY + place.y) * st.zoom });
  }
  comments.open(t.id);
}
