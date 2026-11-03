import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { GROUPS, TOPICS, getTopic, topicBody } from '../src/help/topics';
import { TUTORIALS } from '../src/help/tutorials';
import { mediaRefs, plain, slug } from '../src/help/markdown';
import { searchHelp } from '../src/help/search';

// vitest runs from the project root
const publicDir = resolve(process.cwd(), 'public') + '/';

/** Every [text](target) in a topic that isn't an address or a picture. */
function topicLinks(body: string): string[] {
  const out: string[] = [];
  for (const m of body.replace(/```[\s\S]*?```/g, '').matchAll(/(?<!!)\[[^\]]+\]\(([^)\s]+)\)/g)) if (!/^https?:/.test(m[1])) out.push(m[1]);
  return out;
}

/** The anchors a topic offers: one per heading. */
function anchors(body: string): Set<string> {
  const set = new Set<string>();
  for (const m of body.replace(/```[\s\S]*?```/g, '').matchAll(/^#{1,4}\s+(.*)$/gm)) set.add(slug(m[1]));
  return set;
}

describe('help topics', () => {
  it('have unique ids, a known group, a title, a summary and a body', () => {
    const ids = new Set<string>();
    for (const t of TOPICS) {
      expect(ids.has(t.id), `duplicate topic id ${t.id}`).toBe(false);
      ids.add(t.id);
      expect(GROUPS, `${t.id} group`).toContain(t.group);
      expect(t.title.length, `${t.id} title`).toBeGreaterThan(2);
      expect(t.summary.length, `${t.id} summary`).toBeGreaterThan(10);
      expect(topicBody(t).length, `${t.id} body`).toBeGreaterThan(40);
    }
  });

  it('every topic link points at a topic that exists, and every #anchor at a real heading', () => {
    const bad: string[] = [];
    for (const t of TOPICS) {
      for (const href of topicLinks(topicBody(t))) {
        const [id, anchor] = href.split('#');
        const target = id ? getTopic(id) : t;
        if (!target) {
          bad.push(`${t.id} -> ${href} (no such topic)`);
          continue;
        }
        if (anchor && !anchors(topicBody(target)).has(anchor)) bad.push(`${t.id} -> ${href} (no such heading)`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('every picture and clip they show is in public/help/', () => {
    const bad: string[] = [];
    let count = 0;
    for (const t of TOPICS) {
      for (const ref of mediaRefs(topicBody(t))) {
        count++;
        if (!/^help\/[\w.-]+\.(png|jpe?g|gif|webp|svg|mp4|webm)$/.test(ref)) bad.push(`${t.id}: ${ref} is not a help/ picture or clip`);
        else if (!existsSync(publicDir + ref)) bad.push(`${t.id}: ${ref} is missing from public/help/`);
      }
    }
    expect(count).toBeGreaterThan(10);
    expect(bad).toEqual([]);
  });

  it('every file in public/help/ is used by a topic, and stays small', () => {
    const used = new Set(TOPICS.flatMap((t) => mediaRefs(topicBody(t)).map((r) => r.replace(/^help\//, ''))));
    const dir = publicDir + 'help/';
    const unused: string[] = [];
    const big: string[] = [];
    for (const f of readdirSync(dir)) {
      if (!used.has(f)) unused.push(f);
      const kb = statSync(dir + f).size / 1024;
      if (kb > (/\.(mp4|webm)$/.test(f) ? 1536 : 150)) big.push(`${f} (${Math.round(kb)} KB)`);
    }
    expect(unused).toEqual([]);
    expect(big).toEqual([]);
  });

  it('the tutorials run in order and each links to the next', () => {
    const ids = TUTORIALS.map((t) => t.id);
    expect(ids.length).toBeGreaterThanOrEqual(5);
    for (let i = 0; i < ids.length - 1; i++) expect(topicBody(TUTORIALS[i]), `${ids[i]} -> ${ids[i + 1]}`).toContain(`](${ids[i + 1]})`);
    const welcome = topicBody(getTopic('welcome')!);
    for (const id of ids) expect(welcome, `welcome links to ${id}`).toContain(`](${id})`);
    // Read in order in the help's own previous / next pager
    const at = TOPICS.findIndex((t) => t.id === ids[0]);
    expect(TOPICS.slice(at, at + ids.length).map((t) => t.id)).toEqual(ids);
  });

  it('keep to the house style: no em dashes', () => {
    const bad = TOPICS.filter((t) => /—/.test(`${t.title}${t.summary}${topicBody(t)}`)).map((t) => t.id);
    expect(bad).toEqual([]);
  });

  it('are found by search, including the newer features and media alt text', () => {
    const first = (q: string) => searchHelp(q, 5).map((h) => h.topic.id);
    expect(first('ghost')).toContain('layers-panel');
    expect(first('unlock badge')).toContain('layers-panel');
    expect(first('thumbnails')).toContain('assets');
    expect(first('first animation')).toContain('tutorial-first-animation');
    expect(first('share link')).toContain('export');
    expect(first('move to artboard')).toContain('layers-panel');
    expect(first('confirm dialog')).toContain('dialogs');
    expect(first('reconnect')).toBeTruthy();
    // A picture line is searchable as its caption, not as Markdown
    expect(plain('![A caption](help/x.png)')).toBe('A caption');
  });
});
