import { describe, expect, it } from 'vitest';
import { filterProjects, sortProjects } from '../src/AdminPage';
import type { AdminProject } from '../src/lib/db';

const row = (id: string, extra: Partial<AdminProject> = {}): AdminProject => ({ id, name: id, owner: { username: 'ann', name: 'Ann' }, collaborators: 0, created: '2026-01-01', updated: '2026-01-01', docBytes: 100, fileBytes: 0, files: 0, share: false, shareUpdated: null, review: false, library: false, libraryVersion: 0, learners: 0, openComments: 0, serverMarked: false, ...extra });

describe('admin table', () => {
  const rows = [row('b', { fileBytes: 5000, updated: '2026-03-01' }), row('a', { share: true, learners: 3, updated: '2026-02-01', owner: { username: 'zed', name: 'Zed' } }), row('c', { library: true, docBytes: null })];
  it('sorts by size counting files, by learners and by name', () => {
    expect(sortProjects(rows, 'size').map((r) => r.id)).toEqual(['b', 'a', 'c']);
    expect(sortProjects(rows, 'learners')[0].id).toBe('a');
    expect(sortProjects(rows, 'name').map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(sortProjects(rows, 'updated')[0].id).toBe('b');
  });
  it('filters by text (name, owner, exact id) and by kind', () => {
    expect(filterProjects(rows, 'zed', 'all').map((r) => r.id)).toEqual(['a']);
    expect(filterProjects(rows, '', 'shared').map((r) => r.id)).toEqual(['a']);
    expect(filterProjects(rows, '', 'library').map((r) => r.id)).toEqual(['c']);
    expect(filterProjects(rows, '', 'learners').map((r) => r.id)).toEqual(['a']);
  });
});
