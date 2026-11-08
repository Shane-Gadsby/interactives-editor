// The embed code for a project: the same iframe the Toolbox writes for its own items (toolbox's toolboxItems.js), pointing at
// the learner page, so StudyDesk, StaffDesk and the open site all treat it like any other ILAR. One shape for all three, since they
// share the one ILAR host and the one si-manager script; only the host differs per environment and that comes from the address
// the editor is on.
import type { Project } from 'interactives-player';

/** What the share record says the project uses of the learner's device (the page only allows what was declared when it was shared). */
export interface EmbedSensors {
  microphone?: boolean;
  camera?: boolean;
  photos?: boolean;
}

export interface EmbedOptions {
  /** The learner page address (`/play/<token>`, absolute, for the environment the editor is on). */
  url: string;
  /** The project's name, for the iframe title and the page's analytics. */
  title: string;
  sensors?: EmbedSensors | null;
  /** The shape the project is shown at, as `width/height`. */
  aspect?: string;
  /** The item's own id, the way the Toolbox stamps `Date.now()` on every item it inserts. */
  cdtID: number | string;
}

// Same escaping the Toolbox uses for anything that lands in an attribute
const escapeAttr = (text: unknown) =>
  `${text ?? ''}`.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// "what it is: its own name", or just what it is when there is no name (the Toolbox's iframeTitle)
export const embedTitle = (name: string, label = 'Interactive') => {
  const n = `${name ?? ''}`.replace(/\s+/g, ' ').trim();
  return escapeAttr(!n || n.toLowerCase() === label.toLowerCase() ? label : `${label}: ${n}`);
};

/**
 * The iframe's allow list. Fullscreen and autoplay as the learner page's own frame has them, plus the microphone and camera only when
 * the shared project declared them: the learner page owns the devices, and a cross-origin frame is only let at them by its embedder.
 * Photos are a file picker and need nothing.
 */
export const embedAllow = (sensors?: EmbedSensors | null) => ['autoplay', 'fullscreen', ...(sensors?.microphone ? ['microphone'] : []), ...(sensors?.camera ? ['camera'] : [])].join('; ');

/** The start artboard's shape, `width/height`, which is what the player sizes itself to. 16/9 when there is nothing sensible to go on. */
export const embedAspect = (project: Pick<Project, 'artboards' | 'settings'>) => {
  const ab = project.artboards.find((a) => a.id === project.settings.startArtboardId) ?? project.artboards[0];
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
  if (!ab || !ok(ab.width) || !ok(ab.height)) return '16/9';
  return `${Math.round(ab.width)}/${Math.round(ab.height)}`;
};

/**
 * The iframe. title, cdtID and the query shape are the Toolbox's; the sizing is the Rive player item's (width 100%, height from the
 * aspect ratio) until si-manager sets a real height, which the learner page asks it for as the project resizes (setILARSize).
 * allowfullscreen goes beside allow= because the Toolbox has only ever written that one, so it still works if something strips allow.
 */
export const embedCode = (o: EmbedOptions) => {
  const aspect = /^\d+\/\d+$/.test(o.aspect ?? '') ? o.aspect : '16/9';
  // Built by hand the way the Toolbox builds its src (encodeURIComponent, a bare &), so it reads the same as every other item's.
  // Everything after the path is encoded, and the path is a token of letters, digits, dashes and underscores
  const src = `${o.url.split(/[?#]/)[0].replace(/["<>\s]/g, '')}?title=${encodeURIComponent(o.title)}&cdtID=${encodeURIComponent(`${o.cdtID}`)}`;
  return `<iframe title="${embedTitle(o.title)}" src="${src}" data-cdt-id="${escapeAttr(o.cdtID)}" allow="${embedAllow(o.sensors)}" allowfullscreen style="border:0; width:100%; height:auto; aspect-ratio:${aspect}"></iframe>`;
};
