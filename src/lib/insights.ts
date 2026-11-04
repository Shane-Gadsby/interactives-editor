import type { Project } from 'interactives-player';
import type { Insights } from './db';
import { questionFrames } from './question-kit';

/** One bar of the artboard funnel: the project's artboards in order, with how many different learners got to each. */
export interface FunnelRow {
  id: string;
  name: string;
  learners: number;
  views: number;
  /** Share of the learners who reached the first artboard that got here (0 to 100), or null with nobody at the start. */
  ofStart: number | null;
  /** Share of the artboard before this one that went on to this one, or null for the first. */
  ofPrevious: number | null;
  /** The artboard is no longer in the project (it was deleted since learners saw it). */
  removed?: boolean;
  start?: boolean;
}

export interface OptionRow {
  id: string;
  text: string;
  chosen: number;
  correct: boolean;
}

export interface QuestionRow {
  question: string;
  prompt: string;
  kind: string;
  checks: number;
  learners: number;
  /** Percent of checks that were right. */
  rightRate: number | null;
  /** Percent of the learners who answered at all whose first check was right. */
  firstTryRate: number | null;
  options: OptionRow[];
  removed?: boolean;
}

export interface StepRow {
  artboard: string;
  name: string;
  /** One entry per step, counted from 1. */
  steps: { step: number; title: string; learners: number }[];
}

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 1000) / 10 : null);

/** The artboards in the project's order (start first), then any learners saw that are gone now. */
export function funnel(project: Project, data: Insights): FunnelRow[] {
  const seen = new Map(data.artboards.map((a) => [a.id, a]));
  const startId = project.settings.startArtboardId ?? project.artboards[0]?.id;
  const ordered = [...project.artboards].sort((a, b) => (a.id === startId ? -1 : b.id === startId ? 1 : 0));
  const rows: FunnelRow[] = ordered.map((a) => ({ id: a.id, name: a.name, learners: seen.get(a.id)?.learners ?? 0, views: seen.get(a.id)?.views ?? 0, ofStart: null, ofPrevious: null, start: a.id === startId }));
  for (const a of data.artboards) if (!project.artboards.some((x) => x.id === a.id)) rows.push({ id: a.id, name: a.name || a.id, learners: a.learners, views: a.views, ofStart: null, ofPrevious: null, removed: true });
  const first = rows[0]?.learners ?? 0;
  rows.forEach((r, i) => {
    r.ofStart = pct(r.learners, first);
    r.ofPrevious = i === 0 || r.removed ? null : pct(r.learners, rows[i - 1].learners);
  });
  return rows;
}

/** The project's questions with what learners chose, option by option (the options a nobody chose show as zero). */
export function questionRows(project: Project, data: Insights): QuestionRow[] {
  const seen = new Map(data.questions.map((q) => [q.question, q]));
  const rows: QuestionRow[] = [];
  const used = new Set<string>();
  for (const ab of project.artboards) {
    for (const frame of questionFrames(ab)) {
      const q = frame.question!;
      if (used.has(q.prefix)) continue;
      used.add(q.prefix);
      const hit = seen.get(q.prefix);
      const chosen = new Map((hit?.options ?? []).map((o) => [o.id, o.n]));
      rows.push({
        question: q.prefix,
        prompt: q.prompt || q.prefix,
        kind: q.kind,
        checks: hit?.checks ?? 0,
        learners: hit?.learners ?? 0,
        rightRate: hit ? pct(hit.correct, hit.checks) : null,
        firstTryRate: hit ? pct(hit.firstTryRight, hit.learners) : null,
        options: q.kind === 'blank' || q.kind === 'ordering' || q.kind === 'matching' ? [] : q.options.map((o) => ({ id: o.id, text: o.text || o.id, chosen: chosen.get(o.id) ?? 0, correct: !!o.correct })),
      });
    }
  }
  for (const q of data.questions) {
    if (used.has(q.question)) continue;
    rows.push({
      question: q.question,
      prompt: q.question,
      kind: q.kind,
      checks: q.checks,
      learners: q.learners,
      rightRate: pct(q.correct, q.checks),
      firstTryRate: pct(q.firstTryRight, q.learners),
      options: q.options.map((o) => ({ id: o.id, text: o.id, chosen: o.n, correct: false })),
      removed: true,
    });
  }
  return rows;
}

/** For each artboard with steps (or that learners reported steps on), how many different learners reached each step. */
export function stepRows(project: Project, data: Insights): StepRow[] {
  const by = new Map<string, StepRow>();
  for (const s of data.steps) {
    let row = by.get(s.artboard);
    if (!row) {
      row = { artboard: s.artboard, name: project.artboards.find((a) => a.id === s.artboard)?.name ?? (s.name || s.artboard), steps: [] };
      by.set(s.artboard, row);
    }
    const count = Math.max(s.steps, ...data.steps.filter((x) => x.artboard === s.artboard).map((x) => x.steps));
    if (row.steps.length < count) row.steps = Array.from({ length: count }, (_, i) => ({ step: i + 1, title: '', learners: 0 }));
    row.steps[s.step - 1] = { step: s.step, title: '', learners: s.learners };
  }
  return [...by.values()];
}

/** The cells of the heat overlay for one artboard, with the biggest count to scale by. */
export function heatFor(data: Insights, artboardId: string): { cell: number; cells: { x: number; y: number; n: number }[]; max: number; clicks: number } | null {
  const ab = data.clicks.artboards.find((a) => a.id === artboardId);
  if (!ab || !ab.cells.length) return null;
  return { cell: data.clicks.cell, cells: ab.cells, max: Math.max(...ab.cells.map((c) => c.n)), clicks: ab.clicks };
}

const csvCell = (v: unknown): string => {
  let s = v === null || v === undefined ? '' : String(v);
  //a cell a spreadsheet would run as a formula is turned into text
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Everything Insights shows as one CSV: a section, an item, a detail, and the counts. Counts only, nobody is named. */
export function insightsCsv(project: Project, data: Insights): string {
  const rows: unknown[][] = [['section', 'item', 'detail', 'count', 'learners', 'percent']];
  const range = data.days ? `last ${data.days} days` : 'all time';
  rows.push(['summary', project.name, range, data.records, data.learners, '']);
  rows.push(['summary', 'visits', '', data.visits, '', '']);
  for (const r of funnel(project, data)) rows.push(['artboard views', r.name, r.removed ? 'removed from the project' : r.start ? 'start' : '', r.views, r.learners, r.ofStart ?? '']);
  for (const r of stepRows(project, data)) for (const s of r.steps) rows.push(['steps reached', r.name, `step ${s.step} of ${r.steps.length}`, '', s.learners, '']);
  for (const q of questionRows(project, data)) {
    rows.push(['question', q.prompt, `${q.question} (${q.kind})`, q.checks, q.learners, q.rightRate ?? '']);
    for (const o of q.options) rows.push(['question option', q.prompt, `${o.text}${o.correct ? ' (right answer)' : ''}`, o.chosen, '', q.checks ? pct(o.chosen, q.checks) ?? '' : '']);
  }
  for (const l of data.clicks.layers) rows.push(['clicked layer', l.label || l.layer, project.artboards.find((a) => a.id === l.artboard)?.name ?? l.artboard, l.clicks, l.learners, '']);
  rows.push(['clicks', 'all clicks', `${data.clicks.positioned} with a position, ${data.clicks.onLayers} on a button or link`, data.clicks.total, '', '']);
  for (const a of data.clicks.artboards) for (const c of a.cells) rows.push(['click heat', project.artboards.find((x) => x.id === a.id)?.name ?? a.id, `x ${c.x}, y ${c.y}, ${data.clicks.cell}px cell`, c.n, '', '']);
  for (const c of data.custom) {
    rows.push(['record', c.name, '', c.count, c.learners, '']);
    for (const v of c.values) rows.push(['record value', c.name, v.value, v.n, '', pct(v.n, c.count) ?? '']);
  }
  for (const c of data.courses) rows.push(['course', c.course, '', '', c.learners, '']);
  for (const d of data.daily) rows.push(['day', d.day, '', '', d.learners, '']);
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
