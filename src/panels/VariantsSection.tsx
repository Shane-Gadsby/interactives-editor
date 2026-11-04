import { pairingReport, setMembers, type Artboard, type Project } from 'interactives-player';
import { store } from '../store/store';
import { NumberField, Row, Section, SelectField } from '../components/ui';
import { rangeLabel } from '../lib/variants-edit';

/**
 * The artboard's Responsive settings: the set it is in (one artboard per width range), the width each is shown from, adding a
 * narrower or wider one, joining or leaving a set, and what would not carry when the viewer moves between two members.
 */
export function VariantsSection({ ab, project }: { ab: Artboard; project: Project }) {
  const members = setMembers(project.artboards, ab);
  const inSet = members.length > 1;
  const base = members.find((m) => !m.variantOf) ?? members[0];
  // An artboard can join the set of any artboard that is not itself a variant, unless it has variants of its own
  const hasVariants = project.artboards.some((a) => a.variantOf === ab.id);
  const joinable = project.artboards.filter((a) => a.id !== ab.id && !a.variantOf && !a.library);

  if (!inSet) {
    return (
      <Section help="responsive" title="Responsive" defaultOpen={false}>
        <p className="hint">Show a different arrangement of this artboard when the page is narrower or wider. Each variant is a whole artboard of its own; the player picks the one that fits and keeps the viewer&rsquo;s variables, timelines and changes when it switches.</p>
        <Row>
          <button className="btn" title="Copy this artboard as a phone-sized variant (360 px). It is shown when the page is narrower than this artboard's breakpoint" onClick={() => store().addVariant(ab.id, 'narrower')}>
            Add narrow variant
          </button>
          <button className="btn" title="Copy this artboard as a wider variant. It is shown when the page is at least as wide as this artboard" onClick={() => store().addVariant(ab.id, 'wider')}>
            Add wide variant
          </button>
        </Row>
        {!hasVariants && joinable.length > 0 && (
          <SelectField
            label="Variant of"
            title="Make this artboard a variant of another one: the player shows whichever of the two fits the page"
            value=""
            options={[{ value: '', label: 'Make a variant of…' }, ...joinable.map((a) => ({ value: a.id, label: a.name }))]}
            onChange={(v) => v && store().setVariantOf(ab.id, v)}
          />
        )}
      </Section>
    );
  }

  const others = members.filter((m) => m !== ab);
  return (
    <Section help="responsive" title="Responsive">
      <p className="hint">
        {base.name} and its variants. The page shows the one whose width range fits the box it is in, and switches as the box is resized.
      </p>
      <ul className="variant-list" aria-label="Artboards in this set">
        {members.map((m) => (
          <li key={m.id} className={m === ab ? 'current' : undefined}>
            <button
              className="variant-name"
              title={`Select ${m.name}${m === base ? ' (the base of the set)' : ''}`}
              onClick={() => store().set({ activeArtboardId: m.id, artboardSelected: true, selection: [], activeTimelineId: null })}
            >
              {m.name}
              {m === base && <span className="badge">base</span>}
            </button>
            <NumberField
              title={`${m.name} is shown from this container width, in px, up to the next artboard's. ${rangeLabel(project.artboards, m)}`}
              label="from"
              value={m.minWidth ?? 0}
              min={0}
              suffix="px"
              onChange={(v) => store().setBreakpoint(m.id, v)}
            />
          </li>
        ))}
      </ul>
      <Row>
        <button className="btn" title="Copy this artboard as a variant for narrower pages, below the narrowest one" onClick={() => store().addVariant(ab.id, 'narrower')}>
          Add narrower
        </button>
        <button className="btn" title="Copy this artboard as a variant for wider pages, above the widest one" onClick={() => store().addVariant(ab.id, 'wider')}>
          Add wider
        </button>
      </Row>
      {ab.variantOf && (
        <Row>
          <button className="btn" title="Take this artboard out of the set. It stays as an artboard of its own" onClick={() => store().setVariantOf(ab.id, null)}>
            Make standalone
          </button>
        </Row>
      )}
      {others.map((o) => {
        const r = pairingReport(ab, o);
        return (
          <div key={o.id} className="variant-report" aria-label={`Moving between ${ab.name} and ${o.name}`}>
            <div className="field-label block">
              {ab.name} ⇄ {o.name}
            </div>
            <div className="small muted">
              {r.paired} layer{r.paired === 1 ? '' : 's'} paired by name{r.warnings.length ? '' : ', nothing left over'}
            </div>
            {r.warnings.length > 0 && (
              <ul className="variant-warnings">
                {r.warnings.map((w, i) => (
                  <li key={i} className="drag-warn small">
                    {w}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </Section>
  );
}
