import { linkManager, useLinks, type LinkStatus } from '../lib/links';

/**
 * Shown when a file linked from this browser can't be watched yet: ask for permission, or say it's gone. A design file
 * imported without a link (every import now, see chooseLinking) is updated by hand with Update from file, so it gets no
 * banner here.
 */
export function LinkBanner() {
  const links = useLinks();
  const needs = links.filter((l) => l.state === 'needs-permission');
  const missing = links.filter((l) => l.state === 'missing');
  if (!needs.length && !missing.length) return null;
  const names = (l: LinkStatus[]) => l.map((x) => x.fileName).join(', ');
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
    </>
  );
}
