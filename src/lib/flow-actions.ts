import { store } from '../store/store';
import { removableWithEvent, turnedOff, turnedOn } from './flow-describe';

//What the Inspector's rows and the sentences view do to a flow: all ordinary edits to the graph, each one undo step.

/** Turn a flow off or on. Off puts a false in front of its Only if (what was there stays behind it), so the graph shows it. */
export function setFlowOff(abId: string, eventId: string, off: boolean) {
  store().update((d) => {
    const n = d.artboards.find((a) => a.id === abId)?.logic.nodes.find((x) => x.id === eventId);
    if (!n) return;
    const next = off ? turnedOff(n.params.onlyIf) : turnedOn(n.params.onlyIf);
    if (next) n.params.onlyIf = next;
    else delete n.params.onlyIf;
  });
}

/** Remove an event and the steps only it reaches (a step another flow also runs stays, and so do the notes and groups). */
export function removeFlow(abId: string, eventId: string) {
  store().update((d) => {
    const a = d.artboards.find((x) => x.id === abId);
    if (!a) return;
    const gone = removableWithEvent(a as never, eventId);
    a.logic.nodes = a.logic.nodes.filter((n) => !gone.has(n.id));
    a.logic.edges = a.logic.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to));
  });
  const st = store().get();
  if (st.logicSelection === eventId) store().set({ logicSelection: null, logicPicked: [] });
}

/** Open a node in the graph: the Interactions panel, as the graph, with that node picked. */
export function showInGraph(nodeId: string) {
  store().set({ bottomTab: 'logic', logicView: 'graph', logicSelection: nodeId, logicPicked: [nodeId] });
}
