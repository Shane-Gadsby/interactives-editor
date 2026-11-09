import { useMemo, useSyncExternalStore } from 'react';
import { PropRow } from '../lib/prop-search';
import { FORMULA_HELPERS, assetsEmbedded, type Artboard, type Asset, type Project } from 'interactives-player';
import { store } from '../store/store';
import { Section } from '../components/ui';
import { getVariantsVersion, onVariantsChange, savingsFor } from '../lib/asset-variants';
import { optimiseSettings } from '../lib/image-optimise';
import { kindSummary, projectWeight } from '../lib/weight';
import { SectionBlurb } from '../components/SectionBlurb';

const say = FORMULA_HELPERS.fileSize;

/**
 * The artboard's Download size section: what this artboard asks a learner to download, and the same for every artboard so
 * the versions of a lesson can be compared. Sizes are the ones the editor already stores (the optimised copy's while
 * Optimise output is on and one has been made).
 */
export function WeightSection({ ab, project }: { ab: Artboard; project: Project }) {
  // The optimised copies' sizes arrive as they are made
  const variantsVersion = useSyncExternalStore(onVariantsChange, getVariantsVersion);
  const optimising = optimiseSettings(project.settings).on;
  const weight = useMemo(() => {
    const sizeOf = (a: Asset) => {
      if (!optimising) return a.size;
      const out = savingsFor(project, a).output;
      return out && out !== 'same' ? out.size : a.size;
    };
    return projectWeight(project, sizeOf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, optimising, variantsVersion]);
  const mine = weight.artboards.find((w) => w.id === ab.id);
  if (!mine) return null;
  const heaviest = Math.max(1, ...weight.artboards.map((w) => w.bytes));
  const embedded = assetsEmbedded(project);
  const shown = mine.files.slice(0, 5);
  return (
    <Section id="download-size" help="download-size" title={`Download size: ${say(mine.bytes)}`} defaultOpen={false}>
      <SectionBlurb
        text={mine.files.length ? `This artboard needs ${mine.files.length} file${mine.files.length === 1 ? '' : 's'}: ${kindSummary(mine.byKind, say)}.` : 'This artboard needs no pictures, video or sound files, so it costs a learner nothing to open.'}
        name="Download size"
        help={['download-size', 'seeing-what-an-artboard-weighs']}
      />
      {shown.length > 0 && (
        <ul className="weight-files" aria-label="The heaviest files on this artboard">
          {shown.map((f) => (
            <li key={f.id}>
              <span className="weight-name" title={f.name}>
                {f.name}
              </span>
              <span className="muted">{say(f.bytes)}</span>
            </li>
          ))}
          {mine.files.length > shown.length && <li className="muted">and {mine.files.length - shown.length} more</li>}
        </ul>
      )}
      {weight.artboards.length > 1 && (
        <PropRow k="Download size of every artboard" words={['weight', 'file size', 'heaviest', 'megabytes']}>
        <ul className="weight-list" aria-label="Download size of every artboard">
          {weight.artboards.map((w) => (
            <li key={w.id} className={w.id === ab.id ? 'current' : undefined}>
              <button
                className="weight-pick"
                title={`Select ${w.name}`}
                onClick={() => store().set({ activeArtboardId: w.id, artboardSelected: true, selection: [], activeTimelineId: null })}
              >
                {w.name}
              </button>
              <span className="weight-bar" aria-hidden="true">
                <span style={{ width: `${Math.round((w.bytes / heaviest) * 100)}%` }} />
              </span>
              <span className="weight-size">{say(w.bytes)}</span>
            </li>
          ))}
        </ul>
        </PropRow>
      )}
      {weight.shared.bytes > 0 && <p className="hint">Not counted: {say(weight.shared.bytes)} of font and data files, which load with every artboard.</p>}
      <SectionBlurb
        text={embedded ? 'This project holds every file in one page, so these sizes are what each version costs when hosted separately.' : 'Each file counts once, however many layers use it.'}
        name="Download size"
        help={['download-size', 'showing-a-size-to-learners']}
      />
    </Section>
  );
}
