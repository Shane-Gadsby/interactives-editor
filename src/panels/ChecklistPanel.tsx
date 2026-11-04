import { useEffect, useState } from 'react';
import { useEditor, store } from '../store/store';
import { getTemplate } from '../lib/db';
import { checklistProgress, detachTemplate, findLayer, itemState, setItemDone, updateAvailable } from '../lib/templates';
import { confirmDialog } from '../components/dialogs';
import { ReviewModal, UpdateFromTemplateModal } from '../components/TemplateModals';
import { Icons } from '../components/icons';

/** Take the editor to the layer an item is about: its artboard, the layer selected and in the middle of the canvas. */
export function revealLayer(nodeId: string, artboardId?: string): boolean {
  const s = store();
  const hit = findLayer(s.get().project, nodeId, artboardId);
  if (!hit) return false;
  s.select([nodeId], { artboardId: hit.artboard.id });
  const el = document.querySelector('.canvas') as HTMLElement | null;
  const st = s.get();
  const node = hit.node as unknown as { x: number; y: number; width: number; height: number };
  if (el) {
    // Layers inside a frame are placed in their parent's space, so this centres on the top level one near enough
    const zoom = st.zoom;
    s.set({ panX: el.clientWidth / 2 - (hit.artboard.canvasX + node.x + node.width / 2) * zoom, panY: el.clientHeight / 2 - (hit.artboard.canvasY + node.y + node.height / 2) * zoom });
  }
  return true;
}

const STATE_LABEL = { untouched: ['Still the template’s', 'The layer this is about has not been changed from the template yet'], missing: ['Layer deleted', 'The layer this item pointed at is gone'] } as const;

/** The checklist of a project made from a template: tick items off, click one to find its layer, review, and pull template updates. */
export function ChecklistPanel() {
  const use = useEditor((s) => s.project.template);
  const project = useEditor((s) => s.project);
  const [latest, setLatest] = useState<number | null>(null);
  const [review, setReview] = useState(false);
  const [update, setUpdate] = useState(false);
  useEffect(() => {
    if (!use?.id) return;
    let live = true;
    getTemplate(use.id).then(
      (t) => live && setLatest(t.version),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [use?.id]);
  if (!use) return <div className="panel-empty muted">This project did not start from a template.</div>;
  const { done, total } = checklistProgress(project);
  const select = (id: string) => {
    const item = use.checklist.find((i) => i.id === id);
    if (item?.nodeId && !revealLayer(item.nodeId, item.artboardId)) store().toast('That layer has been deleted.');
    else if (item?.artboardId && !item.nodeId) store().set({ activeArtboardId: item.artboardId });
  };
  return (
    <div className="checklist-panel">
      <div className="checklist-head">
        <div>
          <strong>{use.name}</strong>
          <span className="muted small"> {use.id ? `version ${use.version}` : 'starter'}</span>
        </div>
        <div className="checklist-progress" title={`${done} of ${total} done`}>
          <div className="bar">
            <span style={{ width: total ? `${(done / total) * 100}%` : '0%' }} />
          </div>
          <span className="small">
            {done} of {total} done
          </span>
        </div>
        <div className="spacer" />
        {updateAvailable(use, latest) && (
          <button className="btn" onClick={() => setUpdate(true)} title="The template has a newer version: pull it into the parts you have not changed">
            Update available: v{latest}
          </button>
        )}
        <button className="btn primary" onClick={() => setReview(true)} title="Before you share: what is not ticked yet, and what is still exactly the template's">
          {use.reviewed ? 'Reviewed. Review again' : 'Review'}
        </button>
        <button
          className="btn"
          title="Take the checklist away: this project stays as it is, just no longer tied to the template"
          onClick={async () => {
            if (await confirmDialog({ title: 'Remove checklist', message: 'Remove the checklist from this project? It will no longer be tied to the template, so it cannot be updated from it.', confirmLabel: 'Remove checklist', danger: true })) {
              store().update((d) => detachTemplate(d));
              store().set({ bottomTab: null });
            }
          }}
        >
          Remove
        </button>
      </div>
      {use.checklist.length === 0 ? (
        <p className="muted pad">The author did not list anything to change. Read through the project before you share it: the words and pictures in it are theirs.</p>
      ) : (
        <ol className="checklist">
          {use.checklist.map((item) => {
            const st = itemState(project, item);
            const label = st === 'untouched' || st === 'missing' ? STATE_LABEL[st] : null;
            return (
              <li key={item.id} className={item.done ? 'done' : ''}>
                <input type="checkbox" checked={!!item.done} aria-label={`Done: ${item.text}`} onChange={(e) => store().update((d) => setItemDone(d, item.id, e.target.checked))} />
                <button className="link-btn checklist-text" disabled={!item.nodeId && !item.artboardId} onClick={() => select(item.id)} title={item.nodeId ? 'Select the layer this is about' : item.artboardId ? 'Go to the artboard this is about' : 'A general item'}>
                  {item.text}
                </button>
                {label && (
                  <span className={`badge${st === 'missing' ? ' usage-flag bad' : ''}`} title={label[1]}>
                    {label[0]}
                  </span>
                )}
                {item.nodeId && (
                  <button className="icon-btn" title="Select the layer" aria-label="Select the layer" onClick={() => select(item.id)}>
                    <Icons.select width={13} />
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {review && <ReviewModal onClose={() => setReview(false)} onSelect={select} />}
      {update && <UpdateFromTemplateModal onClose={() => setUpdate(false)} />}
    </div>
  );
}
