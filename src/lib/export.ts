import playerSource from '@player-iife?raw';
import { buildStandaloneHtml, PACKAGE_EXTENSION, withPublishedCredits, type Asset, type ContextValues, type Project } from 'interactives-player';
import { hasScriptLayers } from './draw-templates';
import { assetBytes, exportPackage } from './db';
import { withOptimisedAssets } from './asset-variants';
import { extOf, reportError, track } from './analytics';
import { embeddedFontStyles, inHead } from './font-embed';
import { fontsBase } from './fonts';
import { store } from '../store/store';

export function download(blob: Blob, filename: string): void {
  // What kind of file and how big, never its name
  track('export', 'download', { thing: extOf(filename), sum: { kb: Math.round(blob.size / 1024) } });
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

/**
 * `embedFonts` is for files that leave the editor (a download, a share link): the Google fonts are fetched now and
 * written into the page, so it never calls Google when someone opens it. Previews skip it, they're online anyway.
 * `onWarning` hears about any font that couldn't be fetched.
 * `optimise` is also for files that leave the editor: with the project's Optimise output setting on, big pictures go in as
 * their optimised copies (the originals stay in the project). Previews and the review page leave it off.
 */
export async function standaloneHtml(
  project: Project,
  opts: { startArtboardId?: string; debug?: boolean; accessibility?: boolean; context?: Partial<ContextValues>; bytesFor?: (asset: Asset) => Promise<Uint8Array | null>; embedFonts?: boolean; optimise?: boolean; onWarning?: (text: string) => void } = {},
): Promise<string> {
  //A page for learners carries the attributions only when the Credits button or the exports option asks, and never the author's notes
  // The author's made-up context values are for designing, so a file for learners does not carry them
  const { sampleContext: _sample, ...unsampled } = withoutLinks(project);
  void _sample;
  const clean = withPublishedCredits(unsampled as Project);
  const named = opts.startArtboardId ? { ...clean, settings: { ...clean.settings, startArtboardId: opts.startArtboardId } } : clean;
  // The swapped assets carry their bytes as data: urls, which the builder embeds as they are (assetBytes reads them too)
  const p = opts.optimise && !opts.bytesFor ? await withOptimisedAssets(named) : named;
  const sandbox = p.settings.scriptSandbox && (p.scripts.length || hasCodeNodes(p) || hasScriptLayers(p)) ? await loadSandboxSource() : undefined;
  const html = await buildStandaloneHtml(p, { playerSource, sandboxSource: sandbox, bytesFor: opts.bytesFor ?? ((a) => assetBytes(project.id, a)), debug: opts.debug, accessibility: opts.accessibility, context: opts.context, preconnectFonts: !opts.embedFonts, fontsBase: opts.embedFonts ? undefined : fontsBase() });
  // The player skips a Google font whose element id is already in the page, so these go in ahead of its script
  return opts.embedFonts ? inHead(html, await embeddedFontStyles(p, opts.onWarning)) : html;
}

/** Says so in the editor when an export couldn't embed a font */
export const warnInEditor = (text: string) => store().toast(text, 'error');

function hasCodeNodes(p: Project): boolean {
  return p.artboards.some((a) => a.logic.nodes.some((n) => n.kind === 'action.code' || n.kind === 'action.script'));
}

export async function downloadStandalone(project: Project): Promise<void> {
  const html = await failsAs('export', 'html', () => standaloneHtml(project, { embedFonts: true, optimise: true, onWarning: warnInEditor }));
  download(new Blob([html], { type: 'text/html' }), `${fileSafe(project.name)}.html`);
}

export async function downloadPackage(project: Project): Promise<void> {
  const blob = await failsAs('export', 'ixp', () => exportPackage(withoutLinks(project)));
  download(blob, `${fileSafe(project.name)}${PACKAGE_EXTENSION}`);
}

export function downloadJson(project: Project): void {
  download(new Blob([JSON.stringify(withoutLinks(project), null, 2)], { type: 'application/json' }), `${fileSafe(project.name)}.json`);
}

export { playerSource };

/** Runs an export step; if it throws, the fault is reported (the format and the kind of failure, nothing of the project) and goes on up. */
async function failsAs<T>(kind: string, format: string, step: () => Promise<T>): Promise<T> {
  try {
    return await step();
  } catch (err) {
    reportError({ kind, error: err, where: format, detail: { format } });
    throw err;
  }
}
