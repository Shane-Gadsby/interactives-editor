import { linkManager, useLinks, type LinkStatus } from '../lib/links';

/** Shown when linked files can't be watched in this browser yet: ask for permission, or say whose computer has the file. */
export function LinkBanner() {
  const links = useLinks();
  const needs = links.filter((l) => l.state === 'needs-permission');
  const nobody = links.filter((l) => l.state === 'no-handle');
  const missing = links.filter((l) => l.state === 'missing');
  if (!needs.length && !nobody.length && !missing.length) return null;
  const names = (l: LinkStatus[]) => l.map((x) => x.fileName).join(', ');
  const who = (l: LinkStatus[]) => [...new Set(l.map((x) => x.by).filter(Boolean))].join(', ');
  return (
    <>
      {needs.length > 0 && (
        <div className="link-banner" role="status">
          <span className="link-banner-text">
            {needs.length} linked file{needs.length > 1 ? 's' : ''} ({names(needs)}): click to reconnect and keep them up to date.
          </span>
          <button className="btn primary" onClick={() => void linkManager()?.reconnect()}>
            Reconnect
          </button>
        </div>
      )}
      {missing.length > 0 && (
        <div className="link-banner warn" role="status">
          <span className="link-banner-text">{names(missing)}: the file was moved, renamed or deleted. Put it back to carry on watching, or unlink it in the artboard’s settings.</span>
        </div>
      )}
      {nobody.length > 0 && (
        <div className="link-banner" role="status">
          <span className="link-banner-text">
            {names(nobody)} {nobody.length > 1 ? 'are' : 'is'} linked from {who(nobody) ? `${who(nobody)}’s` : 'another'} browser, so this one can’t reconnect it. You see the last imported version and it updates when they save changes.
          </span>
        </div>
      )}
    </>
  );
}
