/**
 * The contrast check over every branded starter (see src/lib/branded/contrast-check.ts for what it looks at): every page in its start
 * state and in the starter's layout states, under every colourway and High contrast, against WCAG 2.2 AA (4.5:1 text, 3:1 large text and
 * the edges, focus rings, progress bars and chart marks). It also holds the colourways' own token pairs to their targets, so a change
 * to a colourway names the pair it broke.
 *
 * STRICT: any failure fails the test. STARTER_CONTRAST_REPORT=/path/to/report.md also writes the full list; STARTER_CONTRAST_STRICT=0
 * turns it into a report only, for working through a batch of changes.
 */
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BRANDED_STARTERS, COLOURWAYS, projectFromBrandedStarter } from '../src/lib/branded';
import { STRICT_CONTRAST_KINDS, checkProjectContrast, type ContrastFinding } from '../src/lib/branded/contrast-check';
import { checkThemePairs } from '../src/lib/themes';

const STRICT = process.env.STARTER_CONTRAST_STRICT !== '0';

describe('colourway token pairs', () => {
  it('meet their targets in every colourway and High contrast', () => {
    const project = projectFromBrandedStarter(BRANDED_STARTERS[0], COLOURWAYS[0]);
    //the editor's own list of the pairs that matter (src/lib/themes.ts), which is what the Themes tab shows
    const results = checkThemePairs(project.themes);
    expect(results.length).toBeGreaterThan(100);
    const names = new Map(project.themes!.list.map((t) => [t.id, t.name]));
    const bad = results.filter((r) => !r.pass).map((r) => `${names.get(r.themeId)}: ${r.label} ${Math.round(r.ratio * 100) / 100}:1 (needs ${r.need}:1)`);
    if (process.env.STARTER_CONTRAST_REPORT) writeFileSync(`${process.env.STARTER_CONTRAST_REPORT}.pairs.json`, JSON.stringify(results.map((r) => ({ theme: names.get(r.themeId), label: r.label, ratio: Math.round(r.ratio * 100) / 100, need: r.need })), null, 1));
    if (STRICT) expect(bad).toEqual([]);
    else console.log(bad.join('\n'));
  });
});

describe('starter contrast', () => {
  it('holds the focus ring on gradient pages and dark panels to the same strictness as everywhere else', () => {
    expect(STRICT_CONTRAST_KINDS).toContain('focus-brand');
  });

  it('passes on every page of every starter, in every state, under every theme', () => {
    const found: { key: string; f: ContrastFinding }[] = [];
    for (const starter of BRANDED_STARTERS) {
      //every theme is in every project, and the layout does not depend on which one opens: one build, read under all of them
      const project = projectFromBrandedStarter(starter, COLOURWAYS[0]);
      for (const f of checkProjectContrast(project, starter.layoutStates)) found.push({ key: starter.key, f });
    }
    //one line per layer and kind, with the themes it fails in and the worst ratio
    const lines = new Map<string, { key: string; f: ContrastFinding; themes: Set<string>; worst: number }>();
    for (const { key, f } of found) {
      const id = `${key}|${f.kind}|${f.page}|${f.layer}`;
      const have = lines.get(id) ?? { key, f, themes: new Set<string>(), worst: Infinity };
      have.themes.add(f.theme);
      have.worst = Math.min(have.worst, f.ratio);
      lines.set(id, have);
    }
    //every kind is strict now (the focus ring is two tones, so it clears gradients and dark panels too): nothing is listed
    const listed = [...lines.values()].filter((l) => !STRICT_CONTRAST_KINDS.includes(l.f.kind));
    const text = [...lines.values()].filter((l) => STRICT_CONTRAST_KINDS.includes(l.f.kind)).map((l) => `${l.key} | ${l.f.kind} | ${l.f.page} | ${l.f.layer} | worst ${l.worst}:1 (needs ${l.f.need}:1) in ${[...l.themes].join(', ')} | ${l.f.detail}`);
    if (process.env.STARTER_CONTRAST_REPORT) writeFileSync(process.env.STARTER_CONTRAST_REPORT, `${text.join('\n')}\n`);
    if (process.env.STARTER_CONTRAST_REPORT) writeFileSync(`${process.env.STARTER_CONTRAST_REPORT}.listed.txt`, listed.map((l) => `${l.key} | ${l.f.page} | ${l.f.layer} | worst ${l.worst}:1 in ${[...l.themes].join(', ')}`).join('\n'));
    expect(listed.map((l) => `${l.key} | ${l.f.kind} | ${l.f.page} | ${l.f.layer}`)).toEqual([]);
    if (STRICT) expect(text).toEqual([]);
  }, 300_000);
});
