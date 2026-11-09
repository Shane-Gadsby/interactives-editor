//What renaming a variable would do, for the Variables panel's confirmation. Kept apart from rename-variable.ts, which the MCP
//server bundles and which must not pull in the usage report or the question kit.
import { QUESTION_SUFFIXES, type Project } from 'interactives-player';
import { analyzeUsage, type Usage } from './dependencies';
import { questionFrames } from './question-kit';
import { changedLines, eachText, IDENT_RE } from './rename-variable';

export interface RenamePlan {
  /** Why it can't be done, in words. Nothing else is filled in then. */
  error?: string;
  from: string;
  to: string;
  /** Where it is used (the usage report's list). */
  used: Usage[];
  /** Scripts and code snippets that name it, with the lines that would change. */
  scripts: { where: string; lines: string[] }[];
  /** Remembered or user data: learners' saved values are kept by name. */
  saved: boolean;
  /** Its question's name prefix, when the question kit owns it. */
  kitPrefix?: string;
}

/** What renaming this variable would do, or why it can't be. */
export function planRename(p: Project, id: string, to: string): RenamePlan {
  const v = p.variables.find((x) => x.id === id);
  const from = v?.name ?? '';
  const base: RenamePlan = { from, to, used: [], scripts: [], saved: false };
  if (!v) return { ...base, error: 'That variable is gone.' };
  if (!IDENT_RE.test(to)) return { ...base, error: 'Use letters, digits and _ only, not starting with a digit.' };
  if (to === from) return base;
  if (p.variables.some((x) => x.id !== id && x.name === to)) return { ...base, error: `Another variable is already called ${to}.` };
  if (p.dataSources.some((d) => d.name === to)) return { ...base, error: `A data source is already called ${to}, and expressions would not know which one you mean.` };
  const report = analyzeUsage(p);
  const used = report.variables.find((i) => i.id === id)?.usedBy ?? [];
  const scripts: RenamePlan['scripts'] = [];
  eachText(p, (kind, get, _set, where) => {
    if (kind !== 'code') return;
    const lines = changedLines(get(), from, to);
    if (lines.length) scripts.push({ where, lines });
  });
  let kitPrefix: string | undefined;
  for (const ab of p.artboards)
    for (const f of questionFrames(ab)) {
      const pre = f.question!.prefix;
      const rest = from.startsWith(`${pre}_`) ? from.slice(pre.length + 1) : null;
      if (rest && (QUESTION_SUFFIXES.includes(rest) || /^blank\d+$/.test(rest))) kitPrefix = pre;
    }
  return { from, to, used, scripts, saved: !!(v.persist || v.userData), kitPrefix };
}

