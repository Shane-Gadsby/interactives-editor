import { Fragment, useState, type ReactNode } from 'react';
import { stepNumber } from '../lib/tutorial-progress';

/**
 * A small Markdown subset for the help pages: # headings, paragraphs, - and 1. lists, ``` code blocks,
 * | tables |, > notes, **bold**, *italic*, `code`, [links](topic-id#anchor or https://…), <kbd>Ctrl</kbd>, and pictures and
 * short clips on a line of their own: `![What it shows](help/name.png)` or `![What it shows](help/name.mp4)`. The files live in
 * `public/help/` (Vite copies them to `dist/help/`). A clip plays muted and looping with controls; the alt text is the caption.
 */
export function Markdown({ text, onLink, steps }: { text: string; onLink: (href: string) => void; steps?: StepTicks }) {
  return <>{blocks(text, onLink, steps)}</>;
}

/** Tutorials only: a tick box on each numbered step heading (`## 3. Draw the box`), and which are ticked. */
export interface StepTicks {
  done: ReadonlySet<number>;
  onTick: (n: number, on: boolean) => void;
}

const MEDIA = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/;
const VIDEO = /\.(mp4|webm|ogv)$/i;

/** Every `help/…` file a Markdown string shows as a picture or clip (the tests check that they exist). */
export function mediaRefs(text: string): string[] {
  return [...text.matchAll(/^!\[[^\]]*\]\(([^)\s]+)\)\s*$/gm)].map((m) => m[1]);
}

/** A picture or a clip with its caption. The address is relative to the page, like the editor's other files. */
function Media({ alt, src }: { alt: string; src: string }) {
  const url = /^(https?:|data:)/.test(src) || typeof document === 'undefined' ? src : new URL(src, document.baseURI).href;
  return (
    <figure className="help-figure">
      {VIDEO.test(src) ? (
        <video src={url} muted loop playsInline autoPlay controls preload="metadata" aria-label={alt} />
      ) : (
        <a href={url} target="_blank" rel="noreferrer" title="Open the picture full size">
          <img src={url} alt={alt} loading="lazy" />
        </a>
      )}
      {alt && <figcaption>{alt}</figcaption>}
    </figure>
  );
}

export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[`*]/g, '')
    .replace(/[^\w]+/g, '-')
    .replace(/^-|-$/g, '');
}

function blocks(text: string, onLink: (href: string) => void, steps?: StepTicks): ReactNode[] {
  const lines = text.replace(/\r/g, '').split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;
  const inl = (s: string) => inline(s, onLink);
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const media = MEDIA.exec(line);
    if (media) {
      out.push(<Media key={k++} alt={media[1]} src={media[2]} />);
      i++;
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length + 1;
      const Tag = `h${Math.min(5, level)}` as 'h2';
      const n = steps ? stepNumber(h[2], h[1].length) : null;
      const ticked = n !== null && steps!.done.has(n);
      out.push(
        <Tag key={k++} id={slug(h[2])} className={n !== null ? `help-step${ticked ? ' step-done' : ''}` : undefined}>
          {n !== null && (
            <input type="checkbox" className="step-tick" checked={ticked} aria-label={`Step ${n} done`} title={ticked ? `Step ${n} is ticked. Click to untick it` : `Tick this when you have done step ${n}`} onChange={(e) => steps!.onTick(n, e.target.checked)} />
          )}
          {n !== null ? <span>{inl(h[2])}</span> : inl(h[2])}
        </Tag>,
      );
      i++;
      continue;
    }
    if (line.startsWith('```')) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++]);
      i++;
      out.push(<CodeBlock key={k++} text={body.join('\n')} />);
      continue;
    }
    if (line.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        const cells = lines[i]
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => c.trim());
        if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      out.push(
        <table key={k++} className="help-table">
          <thead>
            <tr>
              {head.map((c, j) => (
                <th key={j}>{inl(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((r, j) => (
              <tr key={j}>
                {r.map((c, m) => (
                  <td key={m}>{inl(c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s/.test(lines[i])) {
        let item = lines[i].replace(/^\s*([-*]|\d+\.)\s+/, '');
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s/.test(lines[i])) item += ' ' + lines[i++].trim();
        items.push(item);
      }
      const L = ordered ? 'ol' : 'ul';
      // A numbered list that carries on after a picture keeps its numbers
      const first = ordered ? Number(/^\s*(\d+)/.exec(line)![1]) : 1;
      out.push(
        <L key={k++} {...(ordered && first !== 1 ? { start: first } : {})}>
          {items.map((it, j) => (
            <li key={j}>{inl(it)}</li>
          ))}
        </L>,
      );
      continue;
    }
    if (line.startsWith('>')) {
      const body: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) body.push(lines[i++].replace(/^>\s?/, ''));
      out.push(
        <aside key={k++} className="help-note">
          {inl(body.join(' '))}
        </aside>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#|```|\||>|!\[|\s*([-*]|\d+\.)\s)/.test(lines[i])) para.push(lines[i++]);
    out.push(<p key={k++}>{inl(para.join(' '))}</p>);
  }
  return out;
}

const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|<kbd>[^<]+<\/kbd>)/g;

function inline(s: string, onLink: (href: string) => void): ReactNode {
  const parts = s.split(INLINE);
  return parts.map((p, i) => {
    if (!p) return null;
    if (p.startsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('`')) return <code key={i}>{p.slice(1, -1)}</code>;
    if (p.startsWith('<kbd>')) return <kbd key={i}>{p.slice(5, -6)}</kbd>;
    if (p.startsWith('[')) {
      const m = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(p)!;
      //A file the editor serves (the question templates) downloads instead of opening a help page
      if (/^templates\/[\w.-]+\.(docx|xlsx|csv)$/.test(m[2])) return <a key={i} href={typeof document === 'undefined' ? m[2] : new URL(m[2], document.baseURI).href} download>{m[1]}</a>;
      const external = /^https?:/.test(m[2]);
      return (
        <a
          key={i}
          href={external ? m[2] : `#/help/${m[2]}`}
          target={external ? '_blank' : undefined}
          rel={external ? 'noreferrer' : undefined}
          onClick={(e) => {
            if (external) return;
            e.preventDefault();
            onLink(m[2]);
          }}
        >
          {m[1]}
        </a>
      );
    }
    if (p.startsWith('*') && p.endsWith('*') && p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}

/** Plain text of a Markdown string (for search). */
export function plain(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<\/?kbd>/g, '')
    .replace(/^!\[([^\]]*)\]\([^)]*\)\s*$/gm, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*`#>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A code block with a Copy button, since most of them are commands or settings to paste somewhere else. */
function CodeBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="help-code-wrap">
      <pre className="help-code">
        <code>{text}</code>
      </pre>
      <button
        type="button"
        className="help-code-copy"
        title="Copy to the clipboard"
        onClick={() =>
          void navigator.clipboard?.writeText(text).then(
            () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            },
            () => undefined,
          )
        }
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
