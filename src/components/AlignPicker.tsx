export type Edge = 'start' | 'center' | 'end';

const EDGES: Edge[] = ['start', 'center', 'end'];
const ROW_NAMES = ['Top', 'Middle', 'Bottom'];
const COL_NAMES = ['left', 'centre', 'right'];

/**
 * A 3x3 picker for where something sits in a box: the columns are the horizontal edge (start, centre, end), the rows the
 * vertical one. Used for a grid's cell alignment and a stack's position.
 */
export function AlignPicker({ label, title, horizontal, vertical, onChange }: { label: string; title?: string; horizontal: Edge; vertical: Edge; onChange: (h: Edge, v: Edge) => void }) {
  return (
    <div className="field li-picker-field" title={title}>
      <span className="field-label">{label}</span>
      <div className="li-picker" role="radiogroup" aria-label={label}>
        {EDGES.map((v, r) =>
          EDGES.map((h, c) => {
            const on = h === horizontal && v === vertical;
            const name = `${ROW_NAMES[r]} ${COL_NAMES[c]}`;
            return (
              <button key={`${r}${c}`} type="button" className={`li-cell${on ? ' on' : ''}`} role="radio" aria-checked={on} aria-label={name} data-pos={`${h} ${v}`} onClick={() => onChange(h, v)}>
                <span className="li-dot" />
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
