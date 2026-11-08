import { useMemo } from 'react';
import type { Artboard, Project } from 'interactives-player';
import { flowLines, flowSentence, flowsOf, looseNodes, describeNode } from '../lib/flow-describe';
import { setFlowOff, showInGraph } from '../lib/flow-actions';
import { store } from '../store/store';

/**
 * "Read as sentences": everything on the artboard's graph as plain sentences, one block per event. Read only: it is made from the
 * graph on every change, so it can never say something the graph does not. Pick a line to see that node's settings; "Show in graph"
 * goes back to the graph with it picked. It is also the plain way to read a template somebody else built.
 */
export function FlowSentences({ ab, project, picked }: { ab: Artboard; project: Project; picked: string | null }) {
  const flows = useMemo(() => flowsOf({ ab, project }, { limit: 40 }), [ab, project]);
  const loose = useMemo(() => looseNodes(ab), [ab]);
  const pick = (id: string) => store().set({ logicSelection: id, logicPicked: [id] });
  const copy = () => {
    const text = flows.map(flowSentence).join('.\n') + (flows.length ? '.' : '');
    void navigator.clipboard?.writeText(text).then(() => store().toast('Copied the sentences.'));
  };
  return (
    <div className="flow-sentences" role="region" aria-label="What this page does, as sentences">
      <div className="flow-sentences-head">
        <strong>{flows.length ? `${flows.length} thing${flows.length === 1 ? '' : 's'} can start something on this page` : 'Nothing is set up to happen on this page yet'}</strong>
        {flows.length > 0 && (
          <button type="button" className="link-btn" title="Copy every sentence as plain text" onClick={copy}>
            Copy as text
          </button>
        )}
      </div>
      {flows.map((f) => {
        const lines = flowLines(f);
        return (
          <section key={f.event.id} className={`flow-block${f.off ? ' off' : ''}`} aria-label={flowSentence(f)}>
            {lines.map((l) => (
              <div key={l.key} className={`flow-line ${l.kind}${picked === l.nodeId && l.kind !== 'branch' && l.kind !== 'more' ? ' picked' : ''}`} style={{ paddingLeft: 8 + l.depth * 16 }}>
                {l.kind === 'branch' || l.kind === 'more' ? (
                  <span className="flow-text">{l.text}</span>
                ) : (
                  <button type="button" className="flow-text" title={l.summary || undefined} onClick={() => pick(l.nodeId)}>
                    {l.kind === 'step' ? <span aria-hidden="true">then </span> : null}
                    {l.text}
                  </button>
                )}
                {l.kind === 'event' && (
                  <span className="flow-actions">
                    <button type="button" className="link-btn" aria-label={`Show in the graph: ${l.text}`} onClick={() => showInGraph(f.event.id)}>
                      Show in graph
                    </button>
                    <button type="button" className="link-btn" aria-pressed={f.off} aria-label={`${f.off ? 'Turn on' : 'Turn off'}: ${l.text}`} onClick={() => setFlowOff(ab.id, f.event.id, !f.off)}>
                      {f.off ? 'Turn on' : 'Turn off'}
                    </button>
                  </span>
                )}
              </div>
            ))}
          </section>
        );
      })}
      {loose.length > 0 && (
        <section className="flow-block loose" aria-label="Steps nothing starts">
          <div className="flow-line event">
            <span className="flow-text">Not joined to anything, so these never run:</span>
          </div>
          {loose.map((n) => (
            <div key={n.id} className="flow-line step" style={{ paddingLeft: 24 }}>
              <button type="button" className="flow-text" onClick={() => pick(n.id)}>
                {describeNode(n, ab, project)}
              </button>
              <button type="button" className="link-btn" aria-label={`Show in the graph: ${describeNode(n, ab, project)}`} onClick={() => showInGraph(n.id)}>
                Show in graph
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
