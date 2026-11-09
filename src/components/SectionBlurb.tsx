import type { ReactNode } from 'react';
import { openHelp } from '../help/Help';

/**
 * The one explainer line under a section or field group: what it is for, in a sentence or two, then a link into the help at
 * the place that has the rest. Anything longer than a line or two belongs in that help topic, so test/hint-length.test.ts
 * holds the text to a character budget and checks that every `help` pair names a real topic and heading.
 */
export function SectionBlurb({ text, name, help, className, hidden }: { text: ReactNode; name: string; help?: [topic: string, anchor?: string]; className?: string; hidden?: boolean }) {
  return (
    <p className={`hint section-blurb${className ? ' ' + className : ''}`} hidden={hidden}>
      {text}
      {help && (
        <>
          {' '}
          <button type="button" className="link-btn" onClick={() => openHelp(help[0], help[1])} aria-label={`More about ${name}, in the help`}>
            More about {name} →
          </button>
        </>
      )}
    </p>
  );
}
