/**
 * The layout check over every branded starter (see src/lib/branded/layout-check.ts for what it looks for). It builds each starter
 * in every colourway, runs each page the way the player draws it, and fails on a button over words, anything in the logo's clear
 * space, or words off the page or into the brand's own layers.
 *
 * REPORT MODE: until the template sweep has fixed what it finds, this test lists the violations (set it to a file with
 * STARTER_LAYOUT_REPORT=/path/to/report.md) and passes. Set STARTER_LAYOUT_STRICT=1 to make them fail it. The sweep ends by
 * flipping STRICT below to true.
 */
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BRANDED_STARTERS, COLOURWAYS, HIGH_CONTRAST, SET_NAMES, projectFromBrandedStarter, type BrandedStarter } from '../src/lib/branded';
import { STRICT_KINDS, checkProjectLayout, type LayoutViolation } from '../src/lib/branded/layout-check';

const STRICT = process.env.STARTER_LAYOUT_STRICT === '1' || false;
const WAYS = [...COLOURWAYS, HIGH_CONTRAST];

interface Found {
  starter: BrandedStarter;
  way: string;
  violations: LayoutViolation[];
}

describe('starter layout', () => {
  it('has no button over words, nothing in the logo clear space and no words off the page, on every page of every starter in every colourway', () => {
    const found: Found[] = [];
    for (const starter of BRANDED_STARTERS) {
      for (const way of WAYS) {
        const violations = checkProjectLayout(projectFromBrandedStarter(starter, way), starter.layoutStates);
        if (violations.length) found.push({ starter, way: way.id, violations });
      }
    }
    //the layout does not depend on the colourway, so the report lists each violation once with the colourways it shows in
    const lines: string[] = [];
    const sets = new Map<string, Map<string, Map<string, { v: LayoutViolation; ways: string[] }>>>();
    for (const f of found) {
      const bySet = sets.get(f.starter.set) ?? new Map();
      sets.set(f.starter.set, bySet);
      const byKey = bySet.get(f.starter.key) ?? new Map();
      bySet.set(f.starter.key, byKey);
      for (const v of f.violations) {
        const id = `${v.kind}|${v.page}|${v.a}|${v.b ?? ''}|${v.detail}`;
        const hit = byKey.get(id) ?? { v, ways: [] };
        byKey.set(id, hit);
        hit.ways.push(f.way);
      }
    }
    const count = (kinds: string[]) => [...sets.values()].reduce((n, bySet) => n + [...bySet.values()].reduce((m, byKey) => m + [...byKey.values()].filter((h) => kinds.includes(h.v.kind)).length, 0), 0);
    lines.push('# Starter layout violations', '', `Strict kinds (fail the test once STRICT is on): ${STRICT_KINDS.join(', ')}. text-text is advisory.`, '', `${count(STRICT_KINDS)} strict violations and ${count(['text-text'])} advisory ones, each counted once however many colourways show it.`, '');
    lines.push('## Counts per set', '', '| Set | starters with violations | strict | advisory |', '| --- | --- | --- | --- |');
    for (const [set, bySet] of sets) {
      const all = [...bySet.values()].flatMap((m) => [...m.values()]);
      lines.push(`| ${set} (${SET_NAMES[set as keyof typeof SET_NAMES]}) | ${bySet.size} | ${all.filter((h) => STRICT_KINDS.includes(h.v.kind)).length} | ${all.filter((h) => !STRICT_KINDS.includes(h.v.kind)).length} |`);
    }
    for (const [set, bySet] of sets) {
      lines.push('', `## ${set}`);
      for (const [key, byKey] of bySet) {
        lines.push('', `### ${key}`);
        for (const { v, ways } of byKey.values()) lines.push(`- **${v.kind}** on "${v.page}": ${v.a}${v.b ? ` / ${v.b}` : ''}. ${v.detail}${ways.length < WAYS.length ? ` (only in ${ways.join(', ')})` : ''}`);
      }
    }
    if (process.env.STARTER_LAYOUT_REPORT) writeFileSync(process.env.STARTER_LAYOUT_REPORT, `${lines.join('\n')}\n`);
    const strict = found.flatMap((f) => f.violations.filter((v) => STRICT_KINDS.includes(v.kind)).map((v) => `${f.starter.key} (${f.way}): ${v.kind} on "${v.page}": ${v.a}${v.b ? ` / ${v.b}` : ''}. ${v.detail}`));
    if (STRICT) expect([...new Set(strict)]).toEqual([]);
  }, 300_000);
});
