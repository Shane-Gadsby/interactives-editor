import { useState } from 'react';
import type { Project } from 'interactives-player';
import { store } from '../store/store';
import { CheckField } from '../components/ui';
import { PropRow } from '../lib/prop-search';
import { LEVELS, optimiseSettings } from '../lib/image-optimise';
import { prepareOutputs } from '../lib/asset-variants';

const mb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** The project's Optimise output setting: a box, and while it's on a slider from smaller files to better quality. */
export function OptimiseOutputFields({ project }: { project: Project }) {
  const { on, level } = optimiseSettings(project.settings);
  const [busy, setBusy] = useState<string | null>(null);
  const run = async () => {
    setBusy('Starting…');
    try {
      const r = await prepareOutputs(store().get().project, (done, total) => setBusy(`Optimising ${done} of ${total}…`));
      store().toast(r.pictures ? `${r.pictures} picture${r.pictures === 1 ? '' : 's'} optimised, ${mb(r.saved)} lighter in downloads and share links` : 'No pictures here are big enough to shrink');
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <CheckField
        label="Optimise output"
        title="Downloads and share links carry smaller copies of big pictures. Your originals stay in the project at full size, and the canvas shows a lighter copy while you edit"
        value={on}
        onChange={(v) => store().update((d) => void ((d as Project).settings.optimiseOutput = v))}
      />
      {on && (
        <>
          <PropRow k="Optimise quality" words={['smaller files', 'better quality', 'picture size', 'compression']}>
            <div className="field optimise-slider">
              <div className="optimise-ends">
                <span>Smaller files</span>
                <span>Better quality</span>
              </div>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={level}
                aria-label="Optimise output: from smaller files to better quality"
                aria-valuetext={LEVELS[level].label}
                title="Slide towards Smaller files for lighter downloads and shares, towards Better quality for sharper pictures"
                onChange={(e) => store().update((d) => void ((d as Project).settings.optimiseLevel = Number(e.target.value)), { coalesce: 'optimise-level' })}
                onPointerUp={() => store().commit()}
                onKeyUp={() => store().commit()}
              />
              <div className="optimise-now">
                {LEVELS[level].label}: pictures up to {LEVELS[level].maxSide} px on the long side
              </div>
            </div>
          </PropRow>
          <PropRow k="Optimise pictures now" words={['compress', 'resize pictures']}>
            <button className="link-btn" disabled={!!busy} title="Make the optimised copies of every picture now, so the next download or share is quick, and see what they save" onClick={() => void run()}>
              {busy ?? 'Optimise pictures now'}
            </button>
          </PropRow>
        </>
      )}
    </>
  );
}
