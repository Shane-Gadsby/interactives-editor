import { useState } from 'react';
import { Icons } from './icons';
import { VERSION_LABEL } from '../lib/version';

/** A small (i) whose tooltip says the version and build id; clicking it copies them, for problem reports. */
export function VersionInfo() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="icon-btn version-info"
      aria-label={VERSION_LABEL}
      title={copied ? `${VERSION_LABEL} (copied)` : `${VERSION_LABEL}. Click to copy it for a problem report`}
      onClick={() => {
        void navigator.clipboard?.writeText(VERSION_LABEL).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          },
          () => {},
        );
      }}
    >
      <Icons.info width={14} />
    </button>
  );
}
