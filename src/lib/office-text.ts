//The text of a Word (.docx) or Excel (.xlsx) file, for pasting questions in from a file instead of from the clipboard. Only what
//the question reader needs: Word gives its paragraphs as lines (a table row as one line with a tab between its cells), Excel gives
//its first sheet as tab separated rows. Plain .csv, .tsv and .txt files are read as they are.
import { unzipSync, strFromU8 } from 'fflate';

const xml = (s: string) => new DOMParser().parseFromString(s, 'application/xml');
const local = (el: Element) => el.localName;
const kids = (el: Element, name: string) => [...el.children].filter((c) => local(c) === name);
const all = (el: Element | Document, name: string) => [...el.getElementsByTagNameNS('*', name)];

/** Paragraph styles whose text is for the person reading the Word file (the template's headings and notes), not a question. */
const NOTE_STYLE = /^(heading\d*|title|subtitle|quote|intensequote|caption)$/i;

function paragraphText(p: Element): string {
  let out = '';
  const walk = (el: Element) => {
    for (const c of el.children) {
      const n = local(c);
      if (n === 't') out += c.textContent ?? '';
      else if (n === 'tab') out += ' ';
      else if (n === 'br' || n === 'cr') out += ' ';
      else if (n === 'noBreakHyphen') out += '-';
      else if (n !== 'pPr' && n !== 'rPr') walk(c);
    }
  };
  walk(p);
  return out;
}

const styleOf = (p: Element) => all(p, 'pStyle')[0]?.getAttribute('w:val') ?? all(p, 'pStyle')[0]?.getAttribute('val') ?? '';

/** The paragraphs of a .docx as lines, in order. An empty paragraph is an empty line; a table row is one line, cells split by tabs. */
export function docxText(bytes: Uint8Array): string {
  const files = unzipSync(bytes, { filter: (f) => f.name === 'word/document.xml' });
  const raw = files['word/document.xml'];
  if (!raw) throw new Error('That is not a Word document.');
  const body = all(xml(strFromU8(raw)), 'body')[0];
  const lines: string[] = [];
  const doPara = (p: Element) => {
    if (NOTE_STYLE.test(styleOf(p))) return;
    lines.push(paragraphText(p));
  };
  const doBlock = (el: Element) => {
    for (const c of el.children) {
      const n = local(c);
      if (n === 'p') doPara(c);
      else if (n === 'tbl') {
        for (const tr of kids(c, 'tr'))
          lines.push(
            kids(tr, 'tc')
              .map((tc) =>
                kids(tc, 'p')
                  .map(paragraphText)
                  .join(' ')
                  .trim(),
              )
              .join('\t'),
          );
        lines.push('');
      } else if (n === 'sdt') for (const content of kids(c, 'sdtContent')) doBlock(content);
    }
  };
  if (body) doBlock(body);
  return lines.join('\n');
}

const colIndex = (ref: string): number => {
  let n = 0;
  for (const ch of /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? '') n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
};

/** The first sheet of an .xlsx as tab separated rows. Empty rows stay (so the row numbers in a report match the sheet's). */
export function xlsxText(bytes: Uint8Array): string {
  const files = unzipSync(bytes, { filter: (f) => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(f.name) });
  if (!files['xl/workbook.xml']) throw new Error('That is not an Excel workbook.');
  //The first sheet in the workbook's own order, which is not always sheet1.xml
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const first = all(xml(strFromU8(files['xl/workbook.xml'])), 'sheet')[0];
  const rid = first?.getAttribute('r:id') ?? first?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  if (rid && files['xl/_rels/workbook.xml.rels']) {
    const rel = all(xml(strFromU8(files['xl/_rels/workbook.xml.rels'])), 'Relationship').find((r) => r.getAttribute('Id') === rid);
    const target = rel?.getAttribute('Target');
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  }
  const sheet = files[sheetPath] ?? Object.entries(files).find(([k]) => k.startsWith('xl/worksheets/'))?.[1];
  if (!sheet) throw new Error('The workbook has no sheets.');
  const shared = files['xl/sharedStrings.xml'] ? all(xml(strFromU8(files['xl/sharedStrings.xml'])), 'si').map((si) => all(si, 't').map((t) => t.textContent ?? '').join('')) : [];
  const rows: string[][] = [];
  for (const row of all(xml(strFromU8(sheet)), 'row')) {
    const at = Number(row.getAttribute('r')) - 1;
    const cells: string[] = [];
    for (const c of kids(row, 'c')) {
      const type = c.getAttribute('t');
      const v = kids(c, 'v')[0]?.textContent ?? '';
      let text = v;
      if (type === 's') text = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') text = all(c, 't').map((t) => t.textContent ?? '').join('');
      else if (type === 'b') text = v === '1' ? 'TRUE' : 'FALSE';
      const ref = c.getAttribute('r');
      const i = ref ? colIndex(ref) : cells.length;
      while (cells.length < i) cells.push('');
      cells[i] = text.replace(/[\t\r\n]+/g, ' ');
    }
    while (cells.length && !cells[cells.length - 1].trim()) cells.pop();
    rows[Number.isFinite(at) && at >= 0 ? at : rows.length] = cells;
  }
  return Array.from(rows, (r) => (r ?? []).join('\t')).join('\n');
}

/** What a picked file says, as text for the paste box. */
export async function fileQuestionText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.docx')) return docxText(new Uint8Array(await file.arrayBuffer()));
  if (name.endsWith('.xlsx')) return xlsxText(new Uint8Array(await file.arrayBuffer()));
  if (/\.(doc|xls|rtf|odt|ods)$/.test(name)) throw new Error('Save it as .docx, .xlsx or .csv first: older Word and Excel files cannot be read here.');
  return file.text();
}
