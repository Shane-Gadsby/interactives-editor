import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProject, type DataSource } from 'interactives-player';
import { dataCache } from '../src/lib/data';
import { getTopic, topicBody } from '../src/help/topics';

const source = (id: string, url: string): DataSource => ({ id, name: id, kind: 'json', source: 'url', url });
const settled = () => new Promise((r) => setTimeout(r, 10));

afterEach(() => {
  dataCache.clear();
  vi.unstubAllGlobals();
});

describe('editor data loading follows the project\'s data rules', () => {
  it('loads a listed host without credentials, refuses an unlisted or file: URL, and reloads when the list changes', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, text: async () => '{"n":1}' }));
    vi.stubGlobal('fetch', f);
    const p = createProject();
    p.settings.dataAllowList = ['api.test'];
    p.dataSources.push(source('ok', 'https://api.test/a.json'), source('other', 'https://evil.test/a.json'), source('local', 'file:///etc/passwd'));
    dataCache.sync(p);
    await settled();
    expect(dataCache.get('ok')?.value).toEqual({ n: 1 });
    expect(dataCache.get('other')?.error).toMatch(/not on this project's list/);
    expect(dataCache.get('local')?.error).toMatch(/http\(s\)/);
    expect(f).toHaveBeenCalledTimes(1);
    expect(f).toHaveBeenCalledWith('https://api.test/a.json', expect.objectContaining({ credentials: 'omit' }));
    p.settings.dataAllowList = ['api.test', 'evil.test'];
    dataCache.sync(p);
    await settled();
    expect(dataCache.get('other')?.value).toEqual({ n: 1 });
  });
});

describe('help covers the new rules', () => {
  it('documents the pattern rules, the data rules and the setting', () => {
    expect(topicBody(getTopic('expressions')!)).toMatch(/Patterns \(regular expressions\)[\s\S]*backreference[\s\S]*repeated group/);
    expect(topicBody(getTopic('data-sources')!)).toMatch(/What may be loaded[\s\S]*Allowed data hosts/);
    expect(topicBody(getTopic('project-settings')!)).toContain('Allowed data hosts');
    expect(topicBody(getTopic('scripts')!)).toContain('data rules');
  });
});
