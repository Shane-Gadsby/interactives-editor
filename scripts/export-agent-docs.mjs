// Writes the two files the Activity Designer's Cogniti agent is given:
//   activity-designer-playbook.docx  -> the agent's Knowledge tab (agent-docs/playbook.md)
//   interactives-help.docx           -> the agent's Resources tab (every help topic and tutorial, text only)
// Usage: npm run build first (the help comes from mcp/dist), then
//   node scripts/export-agent-docs.mjs [out dir]   (default: agent-docs/out)
// It writes .html and, when LibreOffice (soffice) is on the PATH, converts each to .docx. Re-run and re-upload the help
// file when the help changes a lot; the playbook only when agent-docs/playbook.md changes.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(root, 'agent-docs', 'out'));
mkdirSync(out, { recursive: true });

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Inline Markdown: code, bold, italic, links (kept as text), <kbd>
function inline(s) {
  const parts = s.split(/(`[^`]+`)/g);
  return parts
    .map((p) => {
      if (/^`[^`]+`$/.test(p)) return `<code>${esc(p.slice(1, -1))}</code>`;
      let t = esc(p);
      t = t.replace(/&lt;kbd&gt;(.*?)&lt;\/kbd&gt;/g, '<b>$1</b>');
      t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => (/^https?:/.test(href) ? `${text} (${href})` : text));
      t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<i>$2</i>');
      return t;
    })
    .join('');
}

// Enough Markdown for the help: headings, paragraphs, lists, code blocks, tables, notes, and pictures as their captions
function html(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  const outp = [];
  let list = null;
  let para = [];
  const flushPara = () => {
    if (para.length) outp.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  const closeList = () => {
    if (list) outp.push(`</${list}>`);
    list = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flushPara();
      closeList();
      const code = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) code.push(lines[i]);
      outp.push(`<pre>${esc(code.join('\n'))}</pre>`);
      continue;
    }
    if (/^\s*\|/.test(line)) {
      flushPara();
      closeList();
      const rows = [];
      for (; i < lines.length && /^\s*\|/.test(lines[i]); i++) rows.push(lines[i]);
      i--;
      const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const body = rows.filter((r) => !/^\s*\|[\s:|-]+\|\s*$/.test(r));
      outp.push('<table border="1" cellpadding="4">' + body.map((r, n) => '<tr>' + cells(r).map((c) => (n === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`)).join('') + '</tr>').join('') + '</table>');
      continue;
    }
    const pic = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (pic) {
      flushPara();
      closeList();
      if (pic[1]) outp.push(`<p><i>Picture: ${inline(pic[1])}</i></p>`);
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara();
      closeList();
      outp.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
      continue;
    }
    const li = line.match(/^\s*(?:([-*])|(\d+)\.)\s+(.*)$/);
    if (li) {
      flushPara();
      const kind = li[1] ? 'ul' : 'ol';
      if (list !== kind) {
        closeList();
        outp.push(`<${kind}>`);
        list = kind;
      }
      outp.push(`<li>${inline(li[3])}</li>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      flushPara();
      closeList();
      outp.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`);
      continue;
    }
    if (!line.trim()) {
      flushPara();
      closeList();
      continue;
    }
    if (list && /^\s+\S/.test(line)) {
      outp[outp.length - 1] = outp[outp.length - 1].replace(/<\/li>$/, ` ${inline(line.trim())}</li>`);
      continue;
    }
    closeList();
    para.push(line.trim());
  }
  flushPara();
  closeList();
  return outp.join('\n');
}

const page = (title, body) =>
  `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Arial,sans-serif;font-size:11pt}pre{font-family:Consolas,monospace;font-size:9pt}</style></head><body>${body}</body></html>`;

function write(name, title, body) {
  const file = path.join(out, `${name}.html`);
  writeFileSync(file, page(title, body));
  try {
    execFileSync('soffice', ['--headless', '--convert-to', 'docx:MS Word 2007 XML', '--outdir', out, file], { stdio: 'ignore' });
    console.log(`${path.join(out, name)}.docx`);
  } catch {
    console.log(`${file} (no LibreOffice here, so no .docx: open the .html in Word and save it as .docx)`);
  }
}

// The playbook
const playbook = readFileSync(path.join(root, 'agent-docs', 'playbook.md'), 'utf8');
write('activity-designer-playbook', 'Activity Designer playbook', html(playbook));

// The help, through the MCP bundle's reference() so it's exactly what the editor ships
process.env.INTERACTIVES_MCP_NO_STDIO = '1';
const mcp = await import(pathToFileURL(path.join(root, 'mcp', 'dist', 'interactives-mcp.mjs')).href);
const ids = mcp.reference('?').split('help pages: ')[1].split(', ');
const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const intro = `<h1>Interactives editor help</h1><p>Every help page and tutorial in the StudyDesk Toolbox Interactives editor (version ${version}, exported ${new Date().toISOString().slice(0, 10)}), as text. Pictures are given as their captions.</p>`;
const topics = ids.map((id) => html(mcp.reference(id).replace(/^# /, '## ').replace(/\n#{1}(#+) /g, '\n#$1# '))).join('\n<hr>\n');
write('interactives-help', 'Interactives editor help', intro + topics);
process.exit(0);
