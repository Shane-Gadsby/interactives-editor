import { useEffect, useState } from 'react';
import { BRANDED_STARTERS, COLOURWAYS, SETS, SET_NAMES, type BrandedStarter, type Colourway } from '../lib/branded';
import { ColourwaySwatches } from './ColourwaySwatches';

const WAY_KEY = 'ix.branded.colourway';

const remembered = (): string => {
  try {
    return localStorage.getItem(WAY_KEY) ?? '';
  } catch {
    return '';
  }
};
const remember = (id: string) => {
  try {
    localStorage.setItem(WAY_KEY, id);
  } catch {
    /* private window: the choice just isn't kept */
  }
};

/** Pictures of the first page of each branded starter in each colourway, made once from the real project. */
const thumbs = new Map<string, Promise<string | null>>();
function thumb(s: BrandedStarter, way: Colourway): Promise<string | null> {
  const key = `${s.key}|${way.id}`;
  let p = thumbs.get(key);
  if (!p) {
    p = import('../lib/image-export')
      .then(({ projectThumbnail }) => projectThumbnail(s.build(way).project, 360))
      .then((blob) => (blob ? URL.createObjectURL(blob) : null))
      .catch(() => null);
    thumbs.set(key, p);
  }
  return p;
}

export function BrandedPicture({ starter, way }: { starter: BrandedStarter; way: Colourway }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setUrl(undefined);
    void thumb(starter, way).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [starter, way]);
  if (url) return <img className="thumb-board thumb-img" src={url} alt="" />;
  return <span className="thumb-board template-blank">{url === undefined ? '' : starter.name}</span>;
}

/**
 * The branded starter packs on the Templates page: a colourway picker (kept in this browser), then the starters by set with a
 * picture of the first page in that colourway. Nothing at all while no starter is registered; sets with none are left out.
 */
export function BrandedPacks({ onPick }: { onPick: (s: BrandedStarter, way: Colourway) => void }) {
  const [wayId, setWayId] = useState(remembered);
  const way = COLOURWAYS.find((c) => c.id === wayId) ?? COLOURWAYS[0];
  if (!BRANDED_STARTERS.length) return null;
  const choose = (id: string) => {
    setWayId(id);
    remember(id);
  };
  const sets = SETS.filter((set) => BRANDED_STARTERS.some((s) => s.set === set));
  return (
    <section className="branded-packs" aria-labelledby="branded-packs-title">
      <div className="branded-packs-head">
        <h2 id="branded-packs-title">Branded starter packs</h2>
        <span className="muted small">Ready-made UniSQ activities. The logo, colours and font are set for you and locked; you write the content.</span>
      </div>
      <div className="colourway-pick">
        <span id="colourway-pick-label">Colourway</span>
        <ColourwaySwatches ways={COLOURWAYS} value={way.id} onPick={choose} label="Colourway for the starter packs" />
        <span className="muted small">
          {way.name}: {way.description} You can switch it later in the project settings.
        </span>
      </div>
      {sets.map((set) => (
        <section key={set} className="example-group" aria-label={SET_NAMES[set]}>
          <h3>{SET_NAMES[set]}</h3>
          <div className="project-grid templates-grid" style={{ '--card-size': '260px' } as React.CSSProperties}>
            {BRANDED_STARTERS.filter((s) => s.set === set).map((s) => (
              <article key={s.key} className="project-card template-card branded-card">
                <button className="project-thumb" onClick={() => onPick(s, way)} aria-label={`Use the ${s.name} starter in ${way.name}`}>
                  <BrandedPicture starter={s} way={way} />
                </button>
                <div className="project-info">
                  <div className="project-name">{s.name}</div>
                  <div className="muted small template-desc">{s.description}</div>
                  <div className="card-tags">
                    {s.tags.map((t) => (
                      <span key={t} className="tag-chip static">
                        <span className="tag-label">{t}</span>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="project-actions">
                  <span className="muted small">Branded</span>
                  <span className="spacer" />
                  <button className="btn primary" onClick={() => onPick(s, way)} title="Make a new project from this starter in the chosen colourway, with a checklist of what to change">
                    Use template
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}
