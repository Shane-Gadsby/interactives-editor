import { useEffect, useRef, useState } from 'react';
import { KIND_LABEL, linkManager, useLinks, type LinkStatus } from '../lib/links';
import { HelpLink } from '../help/Help';

const when = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * Asks before bringing in linked files that were saved since they were last imported: one row per changed file, all
 * ticked to start with. Re-import brings in the ticked ones; the rest (and everything, on Not now or Esc) are left
 * until their files change again.
 */
export function LinkChanges() {
  const links = useLinks();
  const waiting = links.filter((l) => l.changed && !l.changed.dismissed && !l.busy);
  const [unticked, setUnticked] = useState<Set<string>>(() => new Set());
  const box = useRef<HTMLDivElement>(null);
  const open = waiting.length > 0;

  // a file that changes again comes back ticked
  const stamps = waiting.map((l) => `${l.linkId}:${l.changed!.stamp}`).join('|');
  const lastStamps = useRef('');
  useEffect(() => {
    if (stamps === lastStamps.current) return;
    const before = new Set(lastStamps.current.split('|'));
    lastStamps.current = stamps;
    setUnticked((cur) => {
      const next = new Set(cur);
      for (const l of waiting) if (!before.has(`${l.linkId}:${l.changed!.stamp}`)) next.delete(l.linkId);
      return next;
    });
  });

  const later = () => linkManager()?.dismissChanges(waiting.map((l) => l.linkId));
  const apply = () => {
    const pick = waiting.filter((l) => !unticked.has(l.linkId)).map((l) => l.linkId);
    linkManager()?.dismissChanges(waiting.filter((l) => unticked.has(l.linkId)).map((l) => l.linkId));
    if (pick.length) void linkManager()?.applyChanges(pick);
  };
  const handlers = useRef({ later, apply });
  handlers.current = { later, apply };

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('.dialog-actions .primary')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handlers.current.later();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (before && document.contains(before)) before.focus();
    };
  }, [open]);

  if (!open) return null;
  const ticked = waiting.filter((l) => !unticked.has(l.linkId)).length;
  const setAll = (on: boolean) => setUnticked(on ? new Set() : new Set(waiting.map((l) => l.linkId)));
  const toggle = (l: LinkStatus) =>
    setUnticked((cur) => {
      const next = new Set(cur);
      if (next.has(l.linkId)) next.delete(l.linkId);
      else next.add(l.linkId);
      return next;
    });

  return (
    <div className="modal-backdrop dialog-backdrop">
      <div className="modal dialog link-dialog link-changes" role="dialog" aria-modal="true" aria-labelledby="link-changes-title" ref={box}>
        <header>
          <strong id="link-changes-title">{waiting.length === 1 ? 'A linked file has changed' : `${waiting.length} linked files have changed`}</strong>
          <HelpLink topic="import" anchor="updating-a-design-file" />
        </header>
        <div className="dialog-body">
          <p className="dialog-message">Pick which ones to bring in. Your own edits to their layers are kept.</p>
          <ul className="link-rows">
            {waiting.map((l) => (
              <li key={l.linkId} className="link-row">
                <label className="link-file link-pick">
                  <input type="checkbox" checked={!unticked.has(l.linkId)} onChange={() => toggle(l)} aria-label={`Re-import ${l.fileName}`} />
                  <span className="link-name" title={l.fileName}>
                    {l.fileName}
                  </span>
                  <span className="link-reason">
                    {KIND_LABEL[l.kind] ?? l.kind}, saved {when(l.changed!.lastModified)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <footer className="dialog-actions">
          <button className="btn" title="Leave them as they are until the files change again (Esc). Re-import now in the artboard's settings still brings them in" onClick={later}>
            Not now
          </button>
          {waiting.length > 1 && (
            <>
              <button className="btn" title="Untick every file" onClick={() => setAll(false)}>
                None
              </button>
              <button className="btn" title="Tick every file" onClick={() => setAll(true)}>
                All
              </button>
            </>
          )}
          <button className="btn primary" disabled={!ticked} title="Bring in the ticked files' changes" onClick={apply}>
            {ticked === waiting.length && waiting.length > 1 ? 'Re-import all' : ticked > 1 ? `Re-import ${ticked}` : 'Re-import'}
          </button>
        </footer>
      </div>
    </div>
  );
}
