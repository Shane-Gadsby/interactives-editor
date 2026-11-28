// @vitest-environment node
//The worked examples in Ask Ixia's skills (agent-workspace/.agents/skills) are what the agent copies, so each blueprint
//in them has to build cleanly with the editor's own compiler, and the refs/ files they point at have to exist
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProject } from 'interactives-player';
import { compileBlueprint } from '../src/lib/designer-blueprint';

const ws = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'agent-workspace');
const skills = path.join(ws, '.agents', 'skills');
const read = (name: string) => fs.readFileSync(path.join(skills, name, 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');

//Every fenced block that parses as JSON and has pages: a whole blueprint
const blueprints = (text: string) =>
  [...text.matchAll(/```(?:json)?\n([\s\S]*?)\n```/g)]
    .map((m) => {
      try {
        return JSON.parse(m[1]);
      } catch {
        return null;
      }
    })
    .filter((b) => b && typeof b === 'object' && Array.isArray(b.pages));

describe('the skills', () => {
  it('has worked blueprint examples that build with no problems', () => {
    const list = blueprints(read('ixia-blueprint'));
    expect(list.length).toBeGreaterThanOrEqual(3);
    for (const bp of list) {
      const p = createProject('Example');
      p.artboards[0].name = 'Page 1';
      const r = compileBlueprint(p, bp);
      expect(r.problems, JSON.stringify(bp).slice(0, 80)).toEqual([]);
      expect(r.touched.length).toBeGreaterThan(0);
    }
  });

  it('points only at refs/ files that exist', () => {
    for (const s of fs.readdirSync(skills)) {
      for (const [ref] of read(s).matchAll(/refs\/[\w./-]+\.md/g)) expect(fs.existsSync(path.join(ws, ...ref.split('/'))), `${s}: ${ref}`).toBe(true);
    }
    for (const [ref] of fs.readFileSync(path.join(ws, '.agents', 'rules', 'AGENTS.md'), 'utf8').matchAll(/refs\/[\w./-]+\.md/g)) expect(fs.existsSync(path.join(ws, ...ref.split('/'))), ref).toBe(true);
  });

  it('never uses an em dash', () => {
    for (const s of fs.readdirSync(skills)) expect(read(s), s).not.toMatch(/—/);
  });
});
