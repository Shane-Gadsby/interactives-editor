import { setMembers, type Artboard, type Project } from 'interactives-player';

/** The narrowest the Preview can be made: phone width and a bit under. */
export const PREVIEW_MIN_WIDTH = 200;

/** Responsive sets in a project, each as its members, narrowest first. */
export function responsiveSets(project: Project): Artboard[][] {
  return project.artboards.filter((a) => !a.variantOf && project.artboards.some((x) => x.variantOf === a.id)).map((a) => setMembers(project.artboards, a));
}

/** Every width a member is first shown at, across the project's sets (what the slider marks). */
export function breakpoints(sets: Artboard[][]): number[] {
  const out = new Set<number>();
  for (const members of sets) for (const m of members) if ((m.minWidth ?? 0) > 0) out.add(m.minWidth ?? 0);
  return [...out].sort((a, b) => a - b);
}

/** A width inside the range an artboard of a set is shown at, to open the Preview on it (the middle of the range, within what fits). */
export function widthInside(members: Artboard[], ab: Artboard, room: number): number {
  const i = members.indexOf(ab);
  const lo = Math.max(PREVIEW_MIN_WIDTH, ab.minWidth ?? 0);
  const hi = Math.max(lo, Math.min(room, members[i + 1] ? (members[i + 1].minWidth ?? 0) - 1 : room));
  return Math.round((lo + hi) / 2);
}

/**
 * The Preview's width slider for a project with responsive sets: drag to resize the page the project runs in and watch the
 * player switch artboards at each breakpoint, marked on the track. `width` null means the whole preview area.
 */
export function PreviewWidth({ sets, width, max, current, onChange }: { sets: Artboard[][]; width: number | null; max: number; current?: string; onChange: (w: number | null) => void }) {
  const marks = breakpoints(sets);
  const room = Math.max(PREVIEW_MIN_WIDTH + 1, Math.round(max));
  const value = Math.min(room, width ?? room);
  // Thumb centres run a thumb-width in from each end of the track
  const at = (w: number) => `calc(8px + (100% - 16px) * ${(w - PREVIEW_MIN_WIDTH) / (room - PREVIEW_MIN_WIDTH)})`;
  const names = sets.length === 1 ? sets[0] : [];
  return (
    <div className="preview-width">
      <span className="field-label" title="Resize the page the project is running in. A responsive set switches artboard at each breakpoint, keeping variables, timelines and changes">
        Page width
      </span>
      <div className="pw-track">
        <input
          type="range"
          min={PREVIEW_MIN_WIDTH}
          max={room}
          step={1}
          value={value}
          aria-label="Page width in the preview"
          aria-valuetext={`${value} pixels${current ? `, showing ${current}` : ''}`}
          onChange={(e) => onChange(Number(e.target.value) >= room ? null : Number(e.target.value))}
          onKeyDown={(e) => e.stopPropagation()}
        />
        {marks
          .filter((b) => b > PREVIEW_MIN_WIDTH && b < room)
          .map((b) => (
            <button key={b} className="pw-mark" style={{ left: at(b) }} title={`Breakpoint: an artboard is shown from ${b} px. Click to go to ${b} px`} onClick={() => onChange(b)}>
              <span>{b}</span>
            </button>
          ))}
        {names.map((m, i) => {
          const lo = Math.max(PREVIEW_MIN_WIDTH, m.minWidth ?? 0);
          const hi = Math.min(room, names[i + 1] ? (names[i + 1].minWidth ?? 0) : room);
          if (hi <= lo) return null;
          return (
            <span key={m.id} className={`pw-zone${m.name === current ? ' on' : ''}`} style={{ left: at(lo), width: `calc((100% - 16px) * ${(hi - lo) / (room - PREVIEW_MIN_WIDTH)})` }}>
              {m.name}
            </span>
          );
        })}
      </div>
      <span className="mono small pw-value">{width === null ? 'full' : `${value} px`}</span>
      {current && <span className="small pw-now">Showing <strong>{current}</strong></span>}
      <button className="btn small-btn" disabled={width === null} onClick={() => onChange(null)} title="Use the whole preview area again">
        Full width
      </button>
    </div>
  );
}
