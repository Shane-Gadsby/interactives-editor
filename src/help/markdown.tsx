import { Fragment, type ReactNode } from 'react';

/**
 * A small Markdown subset for the help pages: # headings, paragraphs, - and 1. lists, ``` code blocks,
 * | tables |, > notes, **bold**, *italic*, `code`, [links](topic-id#anchor or https://…) and <kbd>Ctrl</kbd>.
 */
export function Markdown({ text, onLink }: { text: string; onLink: (href: string) => void }) {
  return <>{blocks(text, onLink)}</>;
}

export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[`*]/g, '')
    .replace(/[^\w]+/g, '-')
    .replace(/^-|-$/g, '');
}

function blocks(text: string, onLink: (href: string) => void): ReactNode[] {
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
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length + 1;
      const Tag = `h${Math.min(5, level)}` as 'h2';
      out.push(
        <Tag key={k++} id={slug(h[2])}>
          {inl(h[2])}
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
      out.push(
        <pre key={k++} className="help-code">
          <code>{body.join('\n')}</code>
        </pre>,
      );
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
      out.push(
        <L key={k++}>
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
    while (i < lines.length && lines[i].trim() && !/^(#|```|\||>|\s*([-*]|\d+\.)\s)/.test(lines[i])) para.push(lines[i++]);
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
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*`#>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
