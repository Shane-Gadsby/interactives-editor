import { loadPlayerSource } from './player-source';
import { buildStandaloneHtml, PACKAGE_EXTENSION, withPublishedCredits, type Asset, type ContextValues, type Project } from 'interactives-player';
import { hasScriptLayers } from './draw-templates';
import { assetBytes, exportPackage } from './db';
import { withOptimisedAssets } from './asset-variants';
import { extOf, reportError, track } from './analytics';
import { embeddedFontStyles, inHead } from './font-embed';
import { fontsBase } from './fonts';
import { store } from '../store/store';
import { alertDialog } from '../components/dialogs';
import { embedLinkedAssets, failureMessage, withFetched, type LinkedFailure } from './media-catalogue';

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

/** The project without its links to files on this computer, and without editor-only settings (an artboard's own grid, the ruler guides): what an export or a share shouldn't carry. */
export function withoutLinks(project: Project): Project {
  if (!project.artboards.some((a) => a.source || a.grid || a.guides) && !project.guides && !project.canvasGuides && !project.guidesLocked) return project;
  const { guides: _guides, canvasGuides: _universal, guidesLocked: _locked, ...rest } = project;
  return { ...rest, artboards: project.artboards.map(({ source: _source, grid: _grid, guides: _pageGuides, ...a }) => a) };
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
  opts: { startArtboardId?: string; debug?: boolean; accessibility?: boolean; lessMotion?: boolean; context?: Partial<ContextValues>; bytesFor?: (asset: Asset) => Promise<Uint8Array | null>; embedFonts?: boolean; optimise?: boolean; onWarning?: (text: string) => void; embedLinked?: boolean; onLinkedFailed?: (failed: LinkedFailure[]) => void } = {},
): Promise<string> {
  //A page for learners carries the attributions only when the Credits button or the exports option asks, and never the author's notes
  // The author's made-up context values are for designing, so a file for learners does not carry them
  // Media Catalogue pictures stay links (a share, an embed, the preview) unless this file has to work on its own
  let fetched = new Map<string, Uint8Array>();
  let whole = project;
  if (opts.embedLinked) {
    const e = await embedLinkedAssets(project);
    whole = e.project;
    fetched = e.bytes;
    if (e.failed.length) opts.onLinkedFailed?.(e.failed);
  }
  const { sampleContext: _sample, ...unsampled } = withoutLinks(whole);
  void _sample;
  // Where a picture was found in the catalogue is the author's business, not something a page for learners carries
  const unfound = unsampled.assets.some((a) => a.catalogue) ? { ...unsampled, assets: unsampled.assets.map(({ catalogue: _c, ...a }) => a) } : unsampled;
  const clean = withPublishedCredits(unfound as Project);
  const named = opts.startArtboardId ? { ...clean, settings: { ...clean.settings, startArtboardId: opts.startArtboardId } } : clean;
  // The swapped assets carry their bytes as data: urls, which the builder embeds as they are (assetBytes reads them too)
  const p = opts.optimise && !opts.bytesFor ? await withOptimisedAssets(named) : named;
  const sandbox = p.settings.scriptSandbox && (p.scripts.length || hasCodeNodes(p) || hasScriptLayers(p)) ? await loadSandboxSource() : undefined;
  const html = await buildStandaloneHtml(p, { playerSource: await loadPlayerSource(), sandboxSource: sandbox, bytesFor: withFetched(fetched, opts.bytesFor ?? ((a) => assetBytes(project.id, a))), debug: opts.debug, accessibility: opts.accessibility, lessMotion: opts.lessMotion, context: opts.context, preconnectFonts: !opts.embedFonts, fontsBase: opts.embedFonts ? undefined : fontsBase() });
  // The player skips a Google font whose element id is already in the page, so these go in ahead of its script
  return opts.embedFonts ? inHead(html, await embeddedFontStyles(p, opts.onWarning)) : html;
}

/** Says so in the editor when an export couldn't embed a font */
export const warnInEditor = (text: string) => store().toast(text, 'error');

function hasCodeNodes(p: Project): boolean {
  return p.artboards.some((a) => a.logic.nodes.some((n) => n.kind === 'action.code' || n.kind === 'action.script'));
}

/** Says so when an export couldn't fetch some Media Catalogue pictures (it is made without them, not with links that might not work). */
export const warnLinkedFailed = (file: string) => (failed: LinkedFailure[]) => {
  const m = failureMessage(failed, file);
  void alertDialog({ title: m.title, message: m.message });
};

export async function downloadStandalone(project: Project): Promise<void> {
  const html = await failsAs('export', 'html', () => standaloneHtml(project, { embedFonts: true, optimise: true, onWarning: warnInEditor, embedLinked: true, onLinkedFailed: warnLinkedFailed('page') }));
  download(new Blob([html], { type: 'text/html' }), `${fileSafe(project.name)}.html`);
}

export async function downloadPackage(project: Project): Promise<void> {
  const blob = await failsAs('export', 'ixp', async () => {
    const e = await embedLinkedAssets(project);
    if (e.failed.length) warnLinkedFailed('package')(e.failed);
    return exportPackage(withoutLinks(e.project), e.bytes);
  });
  download(blob, `${fileSafe(project.name)}${PACKAGE_EXTENSION}`);
}

export function downloadJson(project: Project): void {
  download(new Blob([JSON.stringify(withoutLinks(project), null, 2)], { type: 'application/json' }), `${fileSafe(project.name)}.json`);
}

/** Runs an export step; if it throws, the fault is reported (the format and the kind of failure, nothing of the project) and goes on up. */
async function failsAs<T>(kind: string, format: string, step: () => Promise<T>): Promise<T> {
  try {
    return await step();
  } catch (err) {
    reportError({ kind, error: err, where: format, detail: { format } });
    throw err;
  }
}
