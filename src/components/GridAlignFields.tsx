import type { GridLayout } from 'interactives-player';
import { AlignPicker, type Edge } from './AlignPicker';
import { Row, SelectField } from './ui';

/**
 * A grid frame's alignment, in the Auto layout section: where a layer sits in its cell (the 3x3 picker; for a stack, where
 * the layers sit in the one shared cell), and for a grid whose tracks don't fill the frame, where the tracks sit.
 */
export function GridAlignFields({ grid, onChange }: { grid: GridLayout; onChange: (next: GridLayout) => void }) {
  // Defaults (start) stay out of the document
  const patch = (p: Partial<GridLayout>) => {
    const next: GridLayout = { ...grid, ...p };
    if (next.justifyItems === 'start') delete next.justifyItems;
    if (next.alignItems === 'start') delete next.alignItems;
    if (next.justifyContent === 'start') delete next.justifyContent;
    if (next.alignContent === 'start') delete next.alignContent;
    onChange(next);
  };
  return (
    <>
      <Row>
        <AlignPicker
          label={grid.stack ? 'Stack position' : 'Cell alignment'}
          title={
            grid.stack
              ? 'Where the stacked layers sit in the frame: top left to bottom right. A layer that fills stretches instead'
              : 'Where a layer that is smaller than its cell sits in it. A layer that fills stretches instead'
          }
          horizontal={(grid.justifyItems ?? 'start') as Edge}
          vertical={(grid.alignItems ?? 'start') as Edge}
          onChange={(h, v) => patch({ justifyItems: h, alignItems: v })}
        />
      </Row>
      {!grid.stack && (
        <>
          <Row>
            <SelectField
              label="Justify content"
              title="Where the columns sit across the frame when they don't fill it (fixed-size columns in a wider frame)"
              value={grid.justifyContent ?? 'start'}
              options={[
                { value: 'start', label: 'Start' },
                { value: 'center', label: 'Centre' },
                { value: 'space-between', label: 'Space between' },
              ]}
              onChange={(v) => patch({ justifyContent: v })}
            />
          </Row>
          <Row>
            <SelectField
              label="Align content"
              title="Where the rows sit down the frame when they don't fill it (fixed-size rows in a taller frame)"
              value={grid.alignContent ?? 'start'}
              options={[
                { value: 'start', label: 'Start' },
                { value: 'center', label: 'Centre' },
              ]}
              onChange={(v) => patch({ alignContent: v })}
            />
          </Row>
        </>
      )}
    </>
  );
}
