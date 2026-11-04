/**
 * The report to hand over for sign-off: one self-contained HTML page that prints cleanly, with the same findings as the
 * panel, what each means in plain words, which ones a person has marked reviewed, what the checker can't see, and a block to
 * sign. It says "checks found", never "compliant".
 */
import { summarise } from './checks';
import type { A11yReport, Finding, Severity } from './types';

/** Finding id -> ISO time it was marked reviewed. */
export type ReviewedMap = Readonly<Record<string, string>>;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const LABEL: Record<Severity, string> = { issue: 'Problem', warning: 'Probably a problem', review: 'Needs a person' };

export function reportHtml(r: A11yReport, reviewed: ReviewedMap = {}): string {
  const info = new Map(r.checks.map((c) => [c.id, c]));
  const set = new Set(Object.keys(reviewed));
  const total = summarise(r.findings, set);
  const date = new Date(r.generated);
  const when = isNaN(date.getTime()) ? r.generated : date.toLocaleString();
  const groups = [...r.artboards.map((a) => ({ id: a.id as string | null, name: a.name })), { id: null as string | null, name: 'Whole project' }];

  const row = (f: Finding) => {
    const c = info.get(f.check)!;
    const done = reviewed[f.id];
    return `<tr class="${f.severity}${done ? ' done' : ''}">
<td class="st"><span class="tag ${f.severity}">${esc(LABEL[f.severity])}</span>${done ? `<br><span class="tag ok">Reviewed ${esc(new Date(done).toLocaleDateString())}</span>` : ''}</td>
<td><strong>${esc(f.title)}</strong>${f.nodeName ? `<br><span class="m">${esc(f.nodeName)} (${esc(f.nodeType)})</span>` : ''}</td>
<td>${esc(f.detail)}<br><span class="m">Why it matters: ${esc(c.why)}</span><br><span class="m">What to do: ${esc(c.how)}</span></td>
<td class="m">${esc(c.wcag)}</td>
</tr>`;
  };

  const sections = groups
    .map((g) => {
      const list = r.findings.filter((f) => f.artboardId === g.id);
      if (!list.length && g.id === null) return '';
      const s = summarise(list, set);
      return `<section>
<h2>${esc(g.name)}</h2>
<p class="m">${list.length ? `${s.issue} problem${s.issue === 1 ? '' : 's'}, ${s.warning} probable, ${s.review} for a person to look at${s.reviewed ? `, ${s.reviewed} marked reviewed` : ''}.` : 'The checks found nothing here.'}</p>
${list.length ? `<table><thead><tr><th>Status</th><th>Finding</th><th>Detail</th><th>Standard</th></tr></thead><tbody>${list.map(row).join('')}</tbody></table>` : ''}
</section>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Accessibility check: ${esc(r.projectName)}</title>
<style>
body{font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1c1f26;background:#fff;max-width:980px;margin:0 auto;padding:24px 20px 60px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 4px;border-bottom:2px solid #1c1f26;padding-bottom:3px}h3{font-size:15px;margin:20px 0 6px}
.m{color:#555;font-size:13px}
.box{border:2px solid #1c1f26;border-radius:6px;padding:12px 14px;margin:16px 0;background:#f6f7fa}
table{width:100%;border-collapse:collapse;margin:8px 0}th,td{text-align:left;vertical-align:top;padding:7px 8px;border-bottom:1px solid #d5d8de}th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#444}
td.st{white-space:nowrap}
.tag{display:inline-block;border-radius:3px;padding:1px 7px;font-size:12px;font-weight:600;color:#fff}
.tag.issue{background:#b3261e}.tag.warning{background:#8a5a00}.tag.review{background:#3b4a66}.tag.ok{background:#1d6b3a}
tr.done td{opacity:.6}
.sum td,.sum th{text-align:center}.sum td:first-child,.sum th:first-child{text-align:left}
.sign{display:grid;grid-template-columns:1fr 1fr;gap:18px 28px;margin-top:10px}.sign div{border-bottom:1px solid #1c1f26;min-height:34px;font-size:12px;color:#555}
ul{margin:6px 0 6px 20px;padding:0}
@media print{body{max-width:none;padding:0}section,.box,.sign{break-inside:avoid}tr{break-inside:avoid}}
</style></head><body>
<h1>Accessibility check</h1>
<div class="m">${esc(r.projectName)} &middot; ${esc(when)}</div>
<div class="box"><strong>What this is.</strong> The checks below found ${total.open + total.reviewed} thing${total.open + total.reviewed === 1 ? '' : 's'} to look at. This is a list of what automatic checks could find, not a statement that the project meets WCAG or any other standard. The checks cannot see everything (see "What was not checked"), and the ones marked "Needs a person" are the checker saying it could not tell.</div>

<h2>Summary</h2>
<table class="sum"><thead><tr><th>Artboard</th><th>Problems</th><th>Probable</th><th>Needs a person</th><th>Reviewed</th></tr></thead><tbody>
${groups
  .filter((g) => g.id !== null || r.findings.some((f) => f.artboardId === null))
  .map((g) => {
    const s = summarise(r.findings.filter((f) => f.artboardId === g.id), set);
    return `<tr><td>${esc(g.name)}</td><td>${s.issue}</td><td>${s.warning}</td><td>${s.review}</td><td>${s.reviewed}</td></tr>`;
  })
  .join('\n')}
<tr><th>Total</th><th>${total.issue}</th><th>${total.warning}</th><th>${total.review}</th><th>${total.reviewed}</th></tr>
</tbody></table>
<p class="m">Counts leave out findings marked reviewed, which are listed separately in each artboard's table.</p>

${sections}

<h2>Checks that were run</h2>
<ul>${r.checks.map((c) => `<li><strong>${esc(c.title)}</strong> <span class="m">${esc(c.wcag)}</span></li>`).join('')}</ul>

<h2>What was not checked</h2>
<ul>${r.notChecked.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>

<h2>Sign-off</h2>
<p class="m">Fill in by hand: who read this report, looked at the findings marked "Needs a person", and what was decided.</p>
<div class="sign"><div>Reviewed by</div><div>Date</div><div>Role</div><div>Decision / notes</div></div>
</body></html>`;
}

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function reportCsv(r: A11yReport, reviewed: ReviewedMap = {}): string {
  const rows = [['Artboard', 'Layer', 'Layer type', 'Severity', 'Check', 'Standard', 'Finding', 'Detail', 'Reviewed']];
  const info = new Map(r.checks.map((c) => [c.id, c]));
  for (const f of r.findings) rows.push([f.artboardName || 'Whole project', f.nodeName, f.nodeType, LABEL[f.severity], f.check, info.get(f.check)?.wcag ?? '', f.title, f.detail, reviewed[f.id] ?? '']);
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}
