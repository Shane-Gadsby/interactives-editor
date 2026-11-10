import { useMemo } from 'react';
import { isMasterArtboard, masterOf, pagesOfMaster, runsOnMaster, type Artboard, type Project } from 'interactives-player';
import { flowLines, flowSentence, flowsOf } from '../lib/flow-describe';
import { store } from '../store/store';

/**
 * The page master's flows on the Interactions tab. On a page it shows what the master's buttons and keys do on this page, read
 * only, with a way to open the master to change them. On the master itself it says where its flows run, and which of its events
 * do not run on pages (drag, step, video, data and load events are about one page).
 */
export function MasterFlows({ ab, project }: { ab: Artboard; project: Project }) {
  const master = masterOf(project.artboards, ab);
  const mine = isMasterArtboard(project.artboards, ab);
  const flows = useMemo(() => (master ? flowsOf({ ab: master, project }, { limit: 40 }).filter((f) => runsOnMaster(f.event)) : []), [master, project]);
  if (master) {
    if (!flows.length) return null;
    return (
      <details className="master-flows" aria-label={`Flows from the page master ${master.name}`}>
        <summary>
          From the page master “{master.name}”: {flows.length} flow{flows.length === 1 ? '' : 's'} run on this page
        </summary>
        <div className="master-flows-body">
          <p className="muted">These come from the master, so they are read only here. They work alongside this page's own flows.</p>
          {flows.map((f) => (
            <section key={f.event.id} className="flow-block" aria-label={flowSentence(f)}>
              {flowLines(f).map((l) => (
                <div key={l.key} className={`flow-line ${l.kind}`} style={{ paddingLeft: 8 + l.depth * 16 }}>
                  <span className="flow-text">
                    {l.kind === 'step' ? <span aria-hidden="true">then </span> : null}
                    {l.text}
                  </span>
                </div>
              ))}
            </section>
          ))}
          <button type="button" className="btn" title="Open the master to change these flows. They change on every page that uses it" onClick={() => store().editMasterOf(ab.id)}>
            Edit the master
          </button>
        </div>
      </details>
    );
  }
  if (!mine || !ab.logic.nodes.length) return null;
  const pages = pagesOfMaster(project.artboards, ab).length;
  const skipped = ab.logic.nodes.filter((n) => n.kind.startsWith('event.') && !runsOnMaster(n)).length;
  return (
    <div className="master-flows note" role="note">
      These flows run on {pages ? `${pages} page${pages === 1 ? '' : 's'}` : 'every page that uses this master'}, for the master's own layers.
      {skipped > 0 ? ` ${skipped} event${skipped === 1 ? '' : 's'} here (drag, step, video, data or load) only work on a page of their own, so they do nothing from a master.` : ''}
    </div>
  );
}
