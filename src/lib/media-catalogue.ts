import type { Asset, Project } from 'interactives-player';

/**
 * The Media Catalogue (the suite's photo library) as a picture source. The editor opens it in a modal frame, the catalogue
 * answers with the toolbox contract (`{photographyGallery: true, code: '<img ... src=... data-media-catalogue=...>'}`, or
 * `code: null` to close), and the photo goes in as an image layer linked to the catalogue's address. Normal saves, shares and
 * embeds keep the link. A single-file or package export fetches the picture and embeds it (`embedLinkedAssets`).
 */

export const CATALOGUE_PATH = '/media-catalogue';

/** Where the catalogue is for an origin. `target=parent` makes it answer the frame that opened it, not window.top (which is Moodle when the editor itself is framed). */
export function catalogueUrl(origin: string): string {
  return `${origin}${CATALOGUE_PATH}?editor=interactives&mode=catalogue&target=parent`;
}

export interface CataloguePick {
  /** The photo's address, on the catalogue's own origin. */
  src: string;
  /** The file's name without its extension, for the layer and asset names. */
  name: string;
  mime: string;
  alt: string;
  /** The catalogue's `data-media-catalogue` text as it came (URI-encoded JSON), kept so the photo can be opened where it was found. */
  catalogue?: string;
}

export type CatalogueMessage = { kind: 'insert'; pick: CataloguePick } | { kind: 'close' } | null;

const MIME_BY_EXT: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml' };

/** The attributes of the first <img> in some html, read without building any DOM from it (the text is another page's). */
export function imgAttributes(code: string): Record<string, string> | null {
  const tag = /<img\b([^>]*)>/i.exec(code);
  if (!tag) return null;
  const out: Record<string, string> = {};
  const attr = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (let m = attr.exec(tag[1]); m; m = attr.exec(tag[1])) out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}

function decodeEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|#39);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e]!);
}

const MAX_CATALOGUE_ATTR = 8000;

/** Is this `data-media-catalogue` text something the catalogue would read back: URI-encoded (or plain) JSON that names an item. */
function sensibleCatalogue(raw: string | undefined): string | undefined {
  if (!raw || raw.length > MAX_CATALOGUE_ATTR) return undefined;
  try {
    const t = raw.trim();
    const state = JSON.parse(t.startsWith('{') ? t : decodeURIComponent(t)) as { item?: unknown };
    return state && typeof state.item === 'string' ? raw : undefined;
  } catch {
    return undefined;
  }
}

/**
 * What the catalogue's message means. `origin` is the message's own, and `expected` the catalogue's: anything from elsewhere is
 * nothing. A photo whose address isn't http(s) on the catalogue's origin is refused, whatever the message says.
 */
export function parseCatalogueMessage(data: unknown, origin: string, expected: string): CatalogueMessage {
  if (origin !== expected) return null;
  if (!data || typeof data !== 'object' || (data as { photographyGallery?: unknown }).photographyGallery !== true) return null;
  const code = (data as { code?: unknown }).code;
  if (code === null) return { kind: 'close' };
  if (typeof code !== 'string' || code.length > 20000) return null;
  const attrs = imgAttributes(code);
  if (!attrs?.src) return null;
  let url: URL;
  try {
    url = new URL(attrs.src, expected);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  if (url.origin !== expected) {
    // The legacy photography gallery (what /media-catalogue still is on prod until the cutover) writes its photos on the
    // other university name's host. Same server, same paths, so the photo is taken at the catalogue's own address.
    if (url.origin !== sisterOrigin(expected)) return null;
    url = new URL(url.pathname + url.search, expected);
  }
  const file = decodeURIComponentSafe(url.pathname.split('/').filter(Boolean).pop() ?? '');
  const ext = /\.([a-z0-9]+)$/i.exec(file)?.[1].toLowerCase() ?? '';
  return {
    kind: 'insert',
    pick: {
      src: url.href,
      name: file.replace(/\.[^.]+$/, '') || 'Photo',
      mime: MIME_BY_EXT[ext] ?? 'image/jpeg',
      alt: (attrs.alt ?? '').slice(0, 300),
      catalogue: sensibleCatalogue(attrs['data-media-catalogue']),
    },
  };
}

/** The same server under the university's other name (lti.usq.edu.au and lti.unisq.edu.au, test's too), or null when the host has neither. */
export function sisterOrigin(origin: string): string | null {
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return null;
  }
  const parts = u.hostname.split('.');
  const i = parts.findIndex((p) => p === 'usq' || p === 'unisq');
  if (i < 0 || parts.slice(i + 1).join('.') !== 'edu.au') return null;
  parts[i] = parts[i] === 'usq' ? 'unisq' : 'usq';
  u.hostname = parts.join('.');
  return u.origin;
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** An asset that lives at an address (a catalogue photo) instead of in the project's own storage. */
export const isLinkedAsset = (a: { src?: string }): boolean => !!a.src && /^https?:\/\//i.test(a.src);

// ---------------------------------------------------------------- exports

export interface LinkedFailure {
  asset: Asset;
  reason: string;
}

const FETCH_MS = 30000;

/** A linked picture's bytes. Throws with a plain reason when the address doesn't answer, answers an error, or isn't a picture. */
export async function fetchLinkedBytes(asset: Asset, fetchImpl: typeof fetch = fetch): Promise<{ bytes: Uint8Array; mime: string }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_MS);
  try {
    let res: Response;
    try {
      res = await fetchImpl(asset.src!, { credentials: 'same-origin', signal: ctl.signal });
    } catch (err) {
      throw new Error(ctl.signal.aborted ? 'it took too long to answer' : `it couldn't be reached${err instanceof Error && err.message ? ` (${err.message})` : ''}`);
    }
    if (!res.ok) throw new Error(`the catalogue answered ${res.status}`);
    const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (mime && !mime.startsWith('image/')) throw new Error(`it sent ${mime}, not a picture`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.byteLength) throw new Error('it sent nothing');
    return { bytes, mime: mime || asset.mime };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Get every linked picture the project uses ready to embed, for a file that has to work with no network (a single-file page,
 * a package). `bytes` holds the ones fetched, by asset id. A picture that couldn't be fetched is listed in `failed` and left
 * out of the returned project's assets (its layer shows nothing), rather than shipping a link that may not work for whoever
 * opens the file. Each address is fetched once however many assets name it.
 */
export async function embedLinkedAssets(project: Project, fetchImpl: typeof fetch = fetch): Promise<{ project: Project; bytes: Map<string, Uint8Array>; failed: LinkedFailure[] }> {
  const bytes = new Map<string, Uint8Array>();
  const failed: LinkedFailure[] = [];
  const linked = project.assets.filter(isLinkedAsset);
  if (!linked.length) return { project, bytes, failed };
  const byUrl = new Map<string, Promise<{ bytes: Uint8Array; mime: string }>>();
  const dropped = new Set<string>();
  await Promise.all(
    linked.map(async (a) => {
      let pending = byUrl.get(a.src!);
      if (!pending) byUrl.set(a.src!, (pending = fetchLinkedBytes(a, fetchImpl)));
      try {
        bytes.set(a.id, (await pending).bytes);
      } catch (err) {
        dropped.add(a.id);
        failed.push({ asset: a, reason: err instanceof Error ? err.message : String(err) });
      }
    }),
  );
  const assets = project.assets.filter((a) => !dropped.has(a.id));
  return { project: { ...project, assets }, bytes, failed };
}

/** The bytes the embed step fetched, then whatever the usual source has. */
export function withFetched(fetched: Map<string, Uint8Array>, inner: (asset: Asset) => Promise<Uint8Array | null> | Uint8Array | null): (asset: Asset) => Promise<Uint8Array | null> | Uint8Array | null {
  return (a: Asset) => fetched.get(a.id) ?? inner(a);
}

/** The words for the message that says what couldn't be embedded. */
export function failureMessage(failed: LinkedFailure[], file: string): { title: string; message: string } {
  const lines = failed.map((f) => `${f.asset.name}: ${f.reason}`);
  return {
    title: failed.length === 1 ? "A Media Catalogue picture couldn't be added" : `${failed.length} Media Catalogue pictures couldn't be added`,
    message: `The ${file} was made without ${failed.length === 1 ? 'this picture, so its layer shows nothing' : 'these pictures, so their layers show nothing'}, because ${failed.length === 1 ? 'it' : 'they'} couldn't be fetched to embed. Check you can reach the catalogue and export again.\n\n${lines.join('\n')}`,
  };
}

/** A project's catalogue pictures, by asset, to put back in the canvas (their address is their `src`). */
export const linkedSources = (assets: Asset[]): Map<string, string> => new Map(assets.filter(isLinkedAsset).map((a) => [a.id, a.src!]));
