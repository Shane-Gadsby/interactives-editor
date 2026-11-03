import playerSource from '@player-iife?raw';
import { buildStandaloneHtml, PACKAGE_EXTENSION, type Project } from 'interactives-player';
import { assetBytes, exportPackage } from './db';

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function fileSafe(name: string): string {
  return name.replace(/[^\w.\- ]+/g, '').trim().replace(/\s+/g, '-') || 'project';
}

/** The sandbox (~735 kB) is only fetched when a project runs scripts in it. */
let sandboxSource: Promise<string> | null = null;
function loadSandboxSource(): Promise<string> {
  sandboxSource ??= import('@player-sandbox-iife?raw').then((m) => m.default);
  return sandboxSource;
}

/** The project without its links to files on this computer (what an export or a share shouldn't carry). */
export function withoutLinks(project: Project): Project {
  if (!project.artboards.some((a) => a.source)) return project;
  return { ...project, artboards: project.artboards.map(({ source: _source, ...a }) => a) };
}

export async function standaloneHtml(project: Project, opts: { startArtboardId?: string; debug?: boolean } = {}): Promise<string> {
  const clean = withoutLinks(project);
  const p = opts.startArtboardId ? { ...clean, settings: { ...clean.settings, startArtboardId: opts.startArtboardId } } : clean;
  const sandbox = p.settings.scriptSandbox && (p.scripts.length || hasCodeNodes(p)) ? await loadSandboxSource() : undefined;
  return buildStandaloneHtml(p, { playerSource, sandboxSource: sandbox, bytesFor: (a) => assetBytes(project.id, a), debug: opts.debug });
}

function hasCodeNodes(p: Project): boolean {
  return p.artboards.some((a) => a.logic.nodes.some((n) => n.kind === 'action.code' || n.kind === 'action.script'));
}

export async function downloadStandalone(project: Project): Promise<void> {
  const html = await standaloneHtml(project);
  download(new Blob([html], { type: 'text/html' }), `${fileSafe(project.name)}.html`);
}

export async function downloadPackage(project: Project): Promise<void> {
  const blob = await exportPackage(withoutLinks(project));
  download(blob, `${fileSafe(project.name)}${PACKAGE_EXTENSION}`);
}

export function downloadJson(project: Project): void {
  download(new Blob([JSON.stringify(withoutLinks(project), null, 2)], { type: 'application/json' }), `${fileSafe(project.name)}.json`);
}

export { playerSource };
