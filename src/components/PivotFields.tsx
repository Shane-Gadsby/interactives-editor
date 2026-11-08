import { AlignPicker, type Edge } from './AlignPicker';
import { NumberField } from './ui';
import { PropRow } from '../lib/prop-search';

const EDGE_AT: Record<Edge, number> = { start: 0, center: 0.5, end: 1 };
const edgeOf = (v: number | undefined): Edge | null => {
  const n = v ?? 0.5;
  return n === 0 ? 'start' : n === 0.5 ? 'center' : n === 1 ? 'end' : null;
};

/**
 * The point a layer turns and scales around, the way people think of it: nine dots across the layer, and a percent each
 * way for anywhere between them. It is stored as originX and originY (0 to 1), so nothing about the file changes.
 */
export function PivotFields({
  originX,
  originY,
  onChange,
  onCommit,
}: {
  originX: number | undefined;
  originY: number | undefined;
  onChange: (p: { originX?: number; originY?: number }) => void;
  onCommit?: () => void;
}) {
  return (
    <PropRow
      k="pivot"
      label="Pivot"
      tip="The point the layer turns and scales around: pick a dot, or type a percent each way. The file keeps it as originX and originY (0 to 1)"
      words={['origin', 'anchor', 'transform origin', 'centre of rotation', 'center of rotation', 'ox', 'oy', 'rotate around']}
      className="pivot-row"
    >
      <AlignPicker
        label="Pivot"
        title="The point the layer turns and scales around. Pick one of the nine dots"
        horizontal={edgeOf(originX)}
        vertical={edgeOf(originY)}
        onChange={(h, v) => onChange({ originX: EDGE_AT[h], originY: EDGE_AT[v] })}
      />
      <div className="pivot-nums">
        <NumberField
          label={'Pivot\u00a0X'}
          title="How far across the layer the pivot sits: 0% is the left edge, 50% the middle, 100% the right (originX)"
          value={originX ?? 0.5}
          scale={100}
          suffix="%"
          step={5}
          min={0}
          max={100}
          onChange={(v) => onChange({ originX: v })}
          onCommit={onCommit}
        />
        <NumberField
          label={'Pivot\u00a0Y'}
          title="How far down the layer the pivot sits: 0% is the top, 50% the middle, 100% the bottom (originY)"
          value={originY ?? 0.5}
          scale={100}
          suffix="%"
          step={5}
          min={0}
          max={100}
          onChange={(v) => onChange({ originY: v })}
          onCommit={onCommit}
        />
      </div>
    </PropRow>
  );
}
