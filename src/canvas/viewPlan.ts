import type { Artboard } from 'interactives-player';

/**
 * What each artboard's live DOM should do. The active one and the ones in view are drawn at once while there are only a few of
 * them (so panning around a handful never shows a blank); with many in view (zoomed out on a big project) they fill in one by
 * one, nearest the middle first, rather than holding up the first paint. Out of view they follow, nearest first.
 */
export function viewPlan(artboards: Artboard[], activeId: string | null, zoom: number, panX: number, panY: number, W: number, H: number): Map<string, { deferred: boolean; rank: number }> {
  const out = new Map<string, { deferred: boolean; rank: number }>();
  const rows = artboards.map((ab) => {
    const x0 = panX + ab.canvasX * zoom;
    const y0 = panY + ab.canvasY * zoom;
    const x1 = x0 + ab.width * zoom;
    const y1 = y0 + ab.height * zoom;
    const dx = Math.max(0, -x1, x0 - W);
    const dy = Math.max(0, -y1, y0 - H);
    const mid = Math.hypot((x0 + x1) / 2 - W / 2, (y0 + y1) / 2 - H / 2);
    return { id: ab.id, gap: Math.hypot(dx, dy), mid };
  });
  const inView = rows.filter((r) => r.gap === 0).length;
  for (const r of rows) {
    const near = r.gap === 0 && inView <= 3;
    // Rank: in view first (by distance from the middle), then by distance from the view
    out.set(r.id, { deferred: r.id !== activeId && !near, rank: r.gap === 0 ? r.mid / 1e6 : 1 + r.gap });
  }
  return out;
}
