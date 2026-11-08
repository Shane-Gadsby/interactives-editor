//The downloadable question templates (Word, Excel and CSV) for "Paste questions", built from one list of worked examples so the
//three files say the same thing. scripts/question-templates.mjs writes them to public/templates/, and test/paste-questions.test.ts
//reads each one back through the real parser and checks the committed files are what this builds. Change an example or a layout
//rule here (and in src/lib/paste-questions.ts), run `npm run templates:questions`, and commit the files.
import { zipSync, strToU8 } from 'fflate';

export const OPTION_COLUMNS = 8;
export const HEADER = ['Type', 'Question', ...Array.from({ length: OPTION_COLUMNS }, (_, i) => `Option ${i + 1}`), 'Correct', 'Feedback'];

/** One worked example per question type. `options` end with * where the line layout marks the right one; `correct` is the sheet's Correct cell. */
export const EXAMPLES = [
	{
		type: 'Multiple choice',
		title: 'Multiple choice (one right answer)',
		note: 'Mark the right choice with a * after it (or give its letter on an Answer line). Letters in front of the choices are optional.',
		question: 'Which planet is closest to the Sun?',
		options: ['Venus', 'Mercury', 'Earth', 'Mars'],
		right: [1],
		feedback: 'Mercury orbits closest, at about 58 million km.',
		correct: 'B',
	},
	{
		type: 'Multiple answer',
		title: 'Multiple answer (more than one right)',
		note: 'Mark every right choice. Learners tick all that apply.',
		question: 'Which of these animals are mammals?',
		options: ['Dolphin', 'Shark', 'Bat', 'Penguin'],
		right: [0, 2],
		feedback: 'Dolphins and bats are mammals. Sharks are fish and penguins are birds.',
		correct: 'A, C',
	},
	{
		type: 'True/False',
		title: 'True or false',
		note: 'No choices needed: say which it is on the Answer line.',
		question: 'The Great Barrier Reef is off the coast of Queensland.',
		options: [],
		right: [],
		answer: 'True',
		feedback: 'It stretches for about 2,300 km along the Queensland coast.',
		correct: 'True',
	},
	{
		type: 'Fill in the blank',
		title: 'Fill in the blank',
		note: 'Put every accepted answer on the Answer line, split with | . Capitals and spacing are forgiven by the question\'s own settings.',
		question: 'The chemical symbol for water is ____.',
		options: [],
		right: [],
		answer: 'H2O | h2o',
		feedback: 'Two hydrogen atoms and one oxygen atom.',
		correct: '',
		cells: ['H2O', 'h2o'],
	},
	{
		type: 'Matching',
		title: 'Matching',
		note: 'One pair a line, written as term = match. Up to 8 pairs.',
		question: 'Match each country to its capital.',
		options: ['France = Paris', 'Japan = Tokyo', 'Egypt = Cairo'],
		right: [],
		feedback: 'Well matched.',
		correct: '',
		bare: true,
	},
];

const letter = (i) => String.fromCharCode(97 + i);

/** An example as the lines layout writes it. */
export function exampleLines(e) {
	const out = [`Type: ${e.type}`, `1. ${e.question}`];
	e.options.forEach((o, i) => out.push(e.bare ? o : `${letter(i)}) ${o}${e.right.includes(i) ? ' *' : ''}`));
	if (e.answer) out.push(`Answer: ${e.answer}`);
	if (e.feedback) out.push(`Feedback: ${e.feedback}`);
	return out;
}

/** An example as a row of the sheet. */
export function exampleRow(e) {
	const opts = e.cells ?? e.options;
	return [e.type, e.question, ...Array.from({ length: OPTION_COLUMNS }, (_, i) => opts[i] ?? ''), e.correct, e.feedback];
}

export const HOW_TO = [
	'Fill in one row for each question, under the headings. Delete the five example rows first, or write below them.',
	'Type: Multiple choice, Multiple answer, True/False, Fill in the blank or Matching. Leave it empty and the kind is worked out from what you wrote.',
	'Question: the question itself.',
	'Option 1, Option 2 ...: the choices. For Fill in the blank put each accepted answer here. For Matching write each pair as term = match. True/False needs none.',
	'Correct: the letter or number of the right choice (B, or 2). For more than one write A, C. For True/False put True or False. You can also put a * after the right choice instead.',
	'Feedback: said to the learner once they have finished the question. Optional.',
	'Then copy the rows (with the headings) and paste them into Paste questions in the editor, or save this sheet as .xlsx or .csv and open the file there. You see a preview before anything is added.',
];

export const WORD_NOTES = [
	'Write one question in each block, with a blank line between questions. First the Type line (optional), then the question, then a choice on each line.',
	'Mark the right choice with a * at the end. For true/false, fill in the blank and matching, follow the examples below.',
	'Headings and grey notes like this one are ignored, so you can leave the examples in. When you are ready, select your questions, copy them, and paste them into Paste questions in the editor, or open this file there. You see a preview before anything is added.',
];

//---------------------------------------------------------------------------------------------------------------------

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
//A fixed date makes the zip the same every time it is built
const ZIP = { mtime: new Date('2026-01-01T00:00:00Z'), level: 6 };

export function csv() {
	const q = (c) => (/[",\n]/.test(c) ? `"${String(c).replace(/"/g, '""')}"` : String(c));
	return `${[HEADER, ...EXAMPLES.map(exampleRow)].map((r) => r.map(q).join(',')).join('\n')}\n`;
}

export function docx() {
	const p = (text, style) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${text ? `<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r>` : ''}</w:p>`;
	const paras = [p('Questions for the Question kit', 'Title'), ...WORD_NOTES.map((n) => p(n, 'Quote')), p('')];
	for (const e of EXAMPLES) {
		paras.push(p(e.title, 'Heading2'), p(e.note, 'Quote'));
		for (const l of exampleLines(e)) paras.push(p(l));
		paras.push(p(''));
	}
	paras.push(p('Your questions', 'Heading2'), p('Write your own below, a blank line between questions.', 'Quote'), p(''));
	const ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
	const style = (id, name, extra) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/>${extra}</w:style>`;
	const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="24"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="60" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>${style('Title', 'Title', '<w:pPr><w:spacing w:after="200"/></w:pPr><w:rPr><w:b/><w:sz w:val="44"/></w:rPr>')}${style('Heading2', 'heading 2', '<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="60"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/></w:rPr>')}${style('Quote', 'Quote', '<w:pPr><w:spacing w:after="80"/></w:pPr><w:rPr><w:i/><w:color w:val="595959"/><w:sz w:val="22"/></w:rPr>')}</w:styles>`;
	const files = {
		'[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'),
		'_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
		'word/_rels/document.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
		'word/styles.xml': strToU8(styles),
		'word/document.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${ns}><w:body>${paras.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`),
	};
	return zipSync(files, ZIP);
}

const colName = (i) => String.fromCharCode(65 + i);

export function xlsx() {
	//Strings go inline, so there is no shared strings part to keep in step
	const cell = (r, c, v, style) => (v === '' ? '' : `<c r="${colName(c)}${r}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${esc(v)}</t></is></c>`);
	const row = (r, cells, style) => `<row r="${r}">${cells.map((v, c) => cell(r, c, v, style)).join('')}</row>`;
	const widths = [18, 52, ...Array.from({ length: OPTION_COLUMNS }, () => 18), 12, 48];
	const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
	const sheet = (rows, extra = '', colsXml = cols) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${extra}<cols>${colsXml}</cols><sheetData>${rows}</sheetData></worksheet>`;
	const questions = sheet([row(1, HEADER, 1), ...EXAMPLES.map((e, i) => row(i + 2, exampleRow(e), 2))].join(''), '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>');
	const how = sheet([row(1, ['How to fill this in'], 1), ...HOW_TO.map((t, i) => row(i + 2, [t], 2))].join(''), '', '<col min="1" max="1" width="120" customWidth="1"/>');
	const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFE8A3"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs></styleSheet>';
	const files = {
		'[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'),
		'_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
		'xl/workbook.xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Questions" sheetId="1" r:id="rId1"/><sheet name="How to use" sheetId="2" r:id="rId2"/></sheets></workbook>'),
		'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
		'xl/styles.xml': strToU8(styles),
		'xl/worksheets/sheet1.xml': strToU8(questions),
		'xl/worksheets/sheet2.xml': strToU8(how),
	};
	return zipSync(files, ZIP);
}

export const TEMPLATE_FILES = { 'question-template.docx': docx, 'question-template.xlsx': xlsx, 'question-template.csv': () => strToU8(csv()) };
