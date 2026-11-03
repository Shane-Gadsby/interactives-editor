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

export function standaloneHtml(project: Project, opts: { startArtboardId?: string } = {}): Promise<string> {
  const p = opts.startArtboardId ? { ...project, settings: { ...project.settings, startArtboardId: opts.startArtboardId } } : project;
  return buildStandaloneHtml(p, { playerSource, bytesFor: (a) => assetBytes(project.id, a) });
}

export async function downloadStandalone(project: Project): Promise<void> {
  const html = await standaloneHtml(project);
  download(new Blob([html], { type: 'text/html' }), `${fileSafe(project.name)}.html`);
}

export async function downloadPackage(project: Project): Promise<void> {
  const blob = await exportPackage(project);
  download(blob, `${fileSafe(project.name)}${PACKAGE_EXTENSION}`);
}

export function downloadJson(project: Project): void {
  download(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), `${fileSafe(project.name)}.json`);
}

export { playerSource };
