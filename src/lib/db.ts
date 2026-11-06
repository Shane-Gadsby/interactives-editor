/**
 * Project storage: the editor's server (index.js), which keeps projects and
 * their asset bytes in MongoDB (`lti-interactives`). Whole projects move in
 * and out as `.ixp` packages, packed and unpacked here in the browser.
 *
 * The session id reaches the server through si-manager's utilities.js, which
 * adds `X-Session-ID` to every same-origin fetch when the page loads it.
 */
import type { LibraryContent, LibraryInfo } from './libraries';
import type { TemplateInfo } from './templates';
import { reportError, routePattern, track } from './analytics';
import { normalizeProject, readPackage, uid, writePackage, type Asset, type Project } from 'interactives-player';

export interface ProjectMeta {
  id: string;
  name: string;
  updated: string;
  created: string;
  rev: number;
  artboards: number;
  /** People the owner invited to open and edit it. */
  collaborators?: { username: string; name: string | null }[];
  owner: { username: string | null; name: string | null } | null;
  preview?: { width: number; height: number; background: string } | null;
  /** Time of the latest thumbnail (api/projects/<id>/thumbnail?v=<thumb>), if there is one. */
  thumb?: number | null;
  /** Free-text tags, kept on the server beside the project (not inside the project JSON). */
  tags?: string[];
  /** One-level folder name, or null for "No folder". */
  folder?: string | null;
  /** Marked as a component library in its settings. */
  isLibrary?: boolean;
  /** The published version, 0 when it has never been published. */
  libraryVersion?: number;
  /** Review comments still open, and how many of them are handed to you. */
  openComments?: number;
  assignedComments?: number;
}

/** Limits the server enforces on tags and folder names. */
export const META_MAX_TAGS = 20;
export const META_MAX_LABEL = 40;

export interface SessionInfo {
  user: { username: string | null; userID: string | number | null; name: string | null } | null;
  /** Admin or power user (the suite's god mode rule), as the server sees it. */
  power: boolean;
}

/** A request the server answered with an error (status 0: it was never reached). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
  /** Worth sending again as it is: the server or the network had trouble. Any other 4xx fails the same way every time. */
  get retryable(): boolean {
    return this.status === 0 || this.status >= 500 || this.status === 408 || this.status === 429;
  }
}

export class ConflictError extends Error {
  constructor(
    message: string,
    readonly rev: number,
  ) {
    super(message);
  }
}

const API = new URL('api/', document.baseURI).href;


/** `as: 'blob'` reads the body as bytes whatever its content type (an uploaded .json asset is served as application/json). */
async function call<T>(path: string, init: RequestInit = {}, as?: 'blob'): Promise<T> {
  let res: Response;
  const started = Date.now();
  const method = (init.method ?? 'GET').toUpperCase();
  const route = routePattern(path).slice(0, 46);
  try {
    res = await fetch(API + path, { credentials: 'same-origin', ...init });
  } catch (err) {
    reportError({ kind: 'api', error: err, where: route, detail: { method, status: 0 } });
    throw new ApiError('Could not reach the Interactives server', 0);
  }
  // Which parts of the server get used (the route with its ids taken out), how long they take, and what it refused or broke on
  if (res.ok) track('api', 'call', { thing: route, ms: Date.now() - started, detail: { method } });
  else if (res.status >= 500) reportError({ kind: 'api', error: `Server error ${res.status}`, where: route, detail: { method, status: res.status } });
  else track('api', 'rejected', { thing: route, detail: { method, status: res.status } });
  if (!res.ok) {
    let body: { error?: string; rev?: number } = {};
    try {
      body = await res.json();
    } catch {
      /* not json */
    }
    if (res.status === 409) throw new ConflictError(body.error ?? 'Conflict', body.rev ?? 0);
    throw new ApiError(body.error ?? `Server error ${res.status}`, res.status);
  }
  const type = res.headers.get('content-type') ?? '';
  return (as !== 'blob' && type.includes('application/json') ? res.json() : res.blob()) as Promise<T>;
}

const json = (body: unknown): RequestInit => ({ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** Last revision seen per project, sent back on save for conflict detection. */
const revs = new Map<string, number>();
/** The live room's op number when the project was loaded (null: no room was open). */
const liveSeqs = new Map<string, number | null>();

export function liveSeqOf(id: string): number {
  return liveSeqs.get(id) ?? 0;
}

export function session(): Promise<SessionInfo> {
  return call<SessionInfo>('session');
}

export async function listProjects(all = false): Promise<ProjectMeta[]> {
  return call<ProjectMeta[]>(`projects${all ? '?all=1' : ''}`);
}

/** Change a project's tags and/or folder (organising metadata only; does not touch the document or its rev). */
export const setProjectMeta = (id: string, patch: { tags?: string[]; folder?: string | null }) =>
  call<ProjectMeta>(`projects/${encodeURIComponent(id)}/meta`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });

export async function loadProjectRecord(id: string): Promise<Project | null> {
  try {
    const r = await call<{ project: Project; rev: number; live?: number | null }>(`projects/${encodeURIComponent(id)}`);
    revs.set(id, r.rev);
    liveSeqs.set(id, r.live ?? null);
    return normalizeProject(r.project);
  } catch (err) {
    if (err instanceof Error && /No such project/.test(err.message)) return null;
    throw err;
  }
}

export async function saveProject(p: Project, opts: { force?: boolean } = {}): Promise<void> {
  const r = await call<{ rev: number }>(`projects/${encodeURIComponent(p.id)}`, json({ project: p, rev: revs.get(p.id) ?? 0, force: opts.force }));
  revs.set(p.id, r.rev);
}

/** Moves the project to the bin (kept 30 days; restore it from the projects page's Bin). */
export async function deleteProject(id: string): Promise<void> {
  await call(`projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
  revs.delete(id);
}

/** Who is using a project: its links, and learners with records per course (GET projects/:id/in-use). */
export interface InUse {
  share: boolean;
  review: boolean;
  learners: number;
  last: string | null;
  courses: { course: string; learners: number; last: string | null }[];
  moreCourses: number;
}

export const projectInUse = (id: string) => call<InUse>(`projects/${encodeURIComponent(id)}/in-use`);

/** A project in the bin: its card details, when and by whom it was deleted, and when it goes for good. */
export interface BinnedProject extends ProjectMeta {
  binned: { at: string; by: { username: string | null; name: string | null } | null };
  purge: string;
}

export const listBin = (all = false) => call<BinnedProject[]>(`bin${all ? '?all=1' : ''}`);
export const restoreFromBin = (id: string) => call<{ ok: boolean; id: string }>(`bin/${encodeURIComponent(id)}/restore`, { method: 'POST' });
/** Gone for good: the project, its files, revisions, learner records and comments. */
export const deleteForever = (id: string) => call<{ ok: boolean }>(`bin/${encodeURIComponent(id)}`, { method: 'DELETE' });

export async function putAsset(projectId: string, assetId: string, blob: Blob): Promise<void> {
  await call(`projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': blob.type || 'application/octet-stream' },
    body: blob,
  });
}

export async function getAsset(projectId: string, assetId: string): Promise<Blob | null> {
  try {
    return await call<Blob>(`projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`, {}, 'blob');
  } catch {
    return null;
  }
}

export async function deleteAsset(projectId: string, assetId: string): Promise<void> {
  await call(`projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`, { method: 'DELETE' });
}

/** One row of the server's asset list. `variants` is the sizes of the smaller copies kept beside it, by key (0 means the original is as good). */
export interface AssetListing {
  id: string;
  mime: string;
  size: number;
  variants?: Record<string, number>;
}

export const listAssets = (projectId: string) => call<AssetListing[]>(`projects/${encodeURIComponent(projectId)}/assets`);

const variantPath = (projectId: string, assetId: string, key: string) => `projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/variant/${encodeURIComponent(key)}`;

/** A smaller copy of an asset (see image-optimise.ts), or null when there is none. */
export async function getVariant(projectId: string, assetId: string, key: string): Promise<Blob | null> {
  try {
    return await call<Blob>(variantPath(projectId, assetId, key), {}, 'blob');
  } catch {
    return null;
  }
}

/** Keep a smaller copy beside the asset. An empty blob records that the original is already as good. */
export async function putVariant(projectId: string, assetId: string, key: string, blob: Blob): Promise<void> {
  await call(variantPath(projectId, assetId, key), { method: 'PUT', headers: { 'Content-Type': blob.type || 'image/webp' }, body: blob });
}

/**
 * Every asset's file for the canvas: the proxy where one is stored, the original where not. `listing` is what the
 * server said, so the caller can see which assets have copies and which big ones don't.
 */
export async function loadAssetsForCanvas(projectId: string, proxy: string): Promise<{ blobs: Map<string, Blob>; proxied: Set<string>; listing: AssetListing[] }> {
  const listing = await listAssets(projectId);
  const blobs = new Map<string, Blob>();
  const proxied = new Set<string>();
  await Promise.all(
    listing.map(async (a) => {
      if (a.variants?.[proxy]) {
        const small = await getVariant(projectId, a.id, proxy);
        if (small) {
          blobs.set(a.id, small);
          proxied.add(a.id);
          return;
        }
      }
      const b = await getAsset(projectId, a.id);
      if (b) blobs.set(a.id, b);
    }),
  );
  return { blobs, proxied, listing };
}

export async function listAssetBlobs(projectId: string): Promise<Map<string, Blob>> {
  const out = new Map<string, Blob>();
  await Promise.all(
    (await listAssets(projectId)).map(async (a) => {
      const b = await getAsset(projectId, a.id);
      if (b) out.set(a.id, b);
    }),
  );
  return out;
}

export async function assetBytes(projectId: string, asset: Asset): Promise<Uint8Array | null> {
  if (asset.src?.startsWith('data:')) {
    const res = await fetch(asset.src);
    return new Uint8Array(await res.arrayBuffer());
  }
  const blob = await getAsset(projectId, asset.id);
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}

// ---------------------------------------------------------------- .ixp import / export

export async function exportPackage(p: Project): Promise<Blob> {
  const bytes = await writePackage(p, (a) => assetBytes(p.id, a), 'interactives-editor');
  return new Blob([bytes as BlobPart], { type: 'application/zip' });
}

/**
 * Import a `.ixp` package (or bare project JSON) as a new project. It always
 * gets a fresh id, so importing the same file twice keeps both copies.
 */
export async function importPackage(file: Blob): Promise<Project> {
  try {
    const p = await importPackageInner(file);
    track('import', 'ok', { thing: 'ixp', sum: { kb: Math.round(file.size / 1024), artboards: p.artboards.length } });
    return p;
  } catch (err) {
    track('import', 'failed', { thing: 'ixp' });
    reportError({ kind: 'import', error: err, where: 'ixp', detail: { format: 'ixp', kb: Math.round(file.size / 1024) } });
    throw err;
  }
}

async function importPackageInner(file: Blob): Promise<Project> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let project: Project;
  const blobs = new Map<string, Blob>();
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const unpacked = readPackage(bytes);
    project = unpacked.project;
    for (const [id, { asset, bytes: b }] of unpacked.assets) blobs.set(id, new Blob([b as BlobPart], { type: asset.mime }));
  } else {
    project = normalizeProject(JSON.parse(new TextDecoder().decode(bytes)));
    for (const a of project.assets) if (a.src?.startsWith('data:')) blobs.set(a.id, await (await fetch(a.src)).blob());
  }
  const now = new Date().toISOString();
  project = { ...project, id: uid('pr'), updated: now };
  project.assets = project.assets.filter((a) => blobs.has(a.id)).map(({ src: _src, ...a }) => ({ ...a }));
  // The project has to exist on the server before assets can be attached to it (the asset routes check its owner)
  revs.set(project.id, 0);
  await saveProject(project);
  for (const [id, blob] of blobs) await putAsset(project.id, id, blob);
  return project;
}

export async function duplicateProject(id: string, name?: string): Promise<string> {
  // The server makes the new id (a client-chosen one could land on a project that already exists)
  const res = await call<{ id: string }>(`projects/${encodeURIComponent(id)}/duplicate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  return res.id;
}

/** A new project must be saved once before assets can be attached to it. */
export async function createProjectRecord(p: Project): Promise<void> {
  revs.set(p.id, 0);
  await saveProject(p);
}

// ---------------------------------------------------------------- revision history

export interface RevisionMeta {
  id: string;
  created: string;
  rev: number;
  by: { username: string | null; name: string | null } | null;
  reason: string;
  size: number;
  /** A name someone gave it ("Sent to the coordinator"). */
  name?: string | null;
  /** Pinned: kept whatever its age (up to 20 a project). */
  pinned?: boolean;
}

export const saveNamedVersion = (projectId: string, name: string) => call<{ ok: boolean; id: string }>(`projects/${encodeURIComponent(projectId)}/revisions`, postJson({ name }));
export const updateRevision = (projectId: string, revId: string, patch: { name?: string | null; pinned?: boolean }) =>
  call<{ ok: boolean }>(`projects/${encodeURIComponent(projectId)}/revisions/${encodeURIComponent(revId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });

export const listRevisions = (projectId: string) => call<RevisionMeta[]>(`projects/${projectId}/revisions`);

export async function loadRevision(projectId: string, revId: string): Promise<Project> {
  const r = await call<{ project: Project }>(`projects/${projectId}/revisions/${revId}`);
  return normalizeProject(r.project);
}

export const restoreRevision = (projectId: string, revId: string) => call<{ rev: number }>(`projects/${projectId}/revisions/${revId}/restore`, { method: 'POST' });

// ---------------------------------------------------------------- share links

export interface ShareInfo {
  token: string;
  created: string;
  updated: string;
  /** Signed in people who play it from the learner link get a "Remix this" button that copies the project into their own. */
  remix?: boolean;
  /** Who published the page now showing. */
  by?: { username: string | null; name: string | null } | null;
  /** The page an update replaced, kept for one-click revert. */
  previous?: { updated: string | null; by: { username: string | null; name: string | null } | null } | null;
}

/** Put the page the last update replaced back on the share link (the current one becomes the previous). */
export const revertShare = (projectId: string) => call<{ share: ShareInfo }>(`projects/${encodeURIComponent(projectId)}/share/revert`, { method: 'POST' }).then((r) => r.share);

export const getShare = (projectId: string) => call<{ share: ShareInfo | null }>(`projects/${projectId}/share`).then((r) => r.share);

// ---------------------------------------------------------------- collaborators

export interface Collaborator {
  username: string;
  name: string | null;
}
export interface CollaboratorList {
  owner: { username: string; name?: string | null } | null;
  collaborators: Collaborator[];
  canManage: boolean;
}
export interface Person {
  username: string;
  name: string;
  email: string | null;
}
/** Staff whose name, email or username contains what's typed (at least 2 characters). */
export const findPeople = (q: string) => call<{ people: Person[] }>(`people?q=${encodeURIComponent(q)}`).then((r) => r.people);
export const getCollaborators = (projectId: string) => call<CollaboratorList>(`projects/${encodeURIComponent(projectId)}/collaborators`);
const postJson = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const addCollaborator = (projectId: string, username: string, name = '') =>
  call<{ collaborators: Collaborator[] }>(`projects/${encodeURIComponent(projectId)}/collaborators`, postJson({ username, name })).then((r) => r.collaborators);
export const removeCollaborator = (projectId: string, username: string) =>
  call<{ collaborators: Collaborator[] }>(`projects/${encodeURIComponent(projectId)}/collaborators/${encodeURIComponent(username)}`, { method: 'DELETE' }).then((r) => r.collaborators);

/** Make a collaborator the owner; the old owner becomes a collaborator. */
export const transferOwner = (projectId: string, username: string) =>
  call<{ owner: { username: string; name: string | null }; collaborators: Collaborator[] }>(`projects/${encodeURIComponent(projectId)}/owner`, postJson({ username }));

export const publishShare = (projectId: string, html: string) =>
  call<{ share: ShareInfo }>(`projects/${projectId}/share`, { method: 'PUT', headers: { 'Content-Type': 'text/html' }, body: html }).then((r) => r.share);

/** Turn "Allow remix" on or off for an existing share link. */
export const setShareRemix = (projectId: string, remix: boolean) =>
  call<{ share: ShareInfo }>(`projects/${encodeURIComponent(projectId)}/share`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ remix }) }).then((r) => r.share);

export const stopShare = (projectId: string) => call<{ ok: boolean }>(`projects/${projectId}/share`, { method: 'DELETE' });

export const shareUrl = (token: string) => new URL(`s/${token}`, document.baseURI).href;

/** The page to give learners instead of the share link when results should be kept: it frames the same project and passes its progress to the server under the learner's session. */
export const learnerUrl = (token: string) => new URL(`play/${token}`, document.baseURI).href;

// ---------------------------------------------------------------- learner results

export interface ResultsRow {
  username: string;
  name: string | null;
  course: string | null;
  attempts: number;
  completed: boolean;
  passed: boolean;
  bestPercent: number | null;
  lastPercent: number | null;
  updated: string | null;
}

export interface Results {
  learners: number;
  records: number;
  completed: number;
  completionRate: number | null;
  passed: number;
  scored: number;
  passRate: number | null;
  averageBestPercent: number | null;
  averageAttempts: number | null;
  courses: { course: string; learners: number; completed: number }[];
  list: ResultsRow[];
  truncated: boolean;
  /** The project has a share link on (results are only collected through one). */
  shared: boolean;
  /** Whether this person may clear them: the owner or a power user, never a collaborator. */
  mayClear?: boolean;
}

export const getResults = (projectId: string) => call<Results>(`projects/${encodeURIComponent(projectId)}/results`);

/** Every learner's record as a CSV file. */
export const resultsCsv = (projectId: string) => call<Blob>(`projects/${encodeURIComponent(projectId)}/results.csv`, {}, 'blob');

export const clearResults = (projectId: string) => call<{ ok: boolean; deleted: number }>(`projects/${encodeURIComponent(projectId)}/results`, { method: 'DELETE' });

// ---------------------------------------------------------------- learner insights

/** What learners did in a project, as counts (`GET /api/projects/:id/insights`). Nobody is named: totals and numbers of different learners. */
export interface Insights {
  records: number;
  learners: number;
  visits: number;
  first: number | null;
  last: number | null;
  truncated: boolean;
  days: number;
  shared: boolean;
  artboards: { id: string; name: string; views: number; learners: number }[];
  clicks: {
    total: number;
    positioned: number;
    onLayers: number;
    cell: number;
    artboards: { id: string; name: string; clicks: number; cells: { x: number; y: number; n: number }[] }[];
    layers: { artboard: string; layer: string; label: string; clicks: number; learners: number }[];
  };
  steps: { artboard: string; name: string; step: number; steps: number; visits: number; learners: number }[];
  questions: { question: string; kind: string; checks: number; correct: number; learners: number; firstTry: number; firstTryRight: number; options: { id: string; n: number }[] }[];
  custom: { name: string; count: number; learners: number; values: { value: string; n: number }[] }[];
  courses: { course: string; learners: number }[];
  daily: { day: string; learners: number }[];
}

/** `days` is 7, 30, 90, 365 or 0 for everything. */
export const getInsights = (projectId: string, days: number) => call<Insights>(`projects/${encodeURIComponent(projectId)}/insights?days=${days}`);

// ---------------------------------------------------------------- libraries

export const listLibraries = () => call<LibraryInfo[]>('libraries');

export const getLibrary = (id: string) => call<{ library: LibraryInfo; snapshot: LibraryContent }>(`libraries/${encodeURIComponent(id)}`);

/** Always bytes: a library's .json data file is served as application/json and must not come back parsed (createObjectURL would refuse it). */
export const getLibraryAsset = (libraryId: string, assetId: string) => call<Blob>(`libraries/${encodeURIComponent(libraryId)}/assets/${encodeURIComponent(assetId)}`, {}, 'blob');

/** This project's own library record (published or not), for its owner. */
export const getOwnLibrary = (projectId: string) => call<{ library: LibraryInfo | null }>(`projects/${encodeURIComponent(projectId)}/library`).then((r) => r.library);

export const publishLibrary = (projectId: string, note: string) =>
  call<{ ok: boolean; unchanged: boolean; version: number; components: number }>(`projects/${encodeURIComponent(projectId)}/library/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  });

export const shareLibrary = (projectId: string, share: { everyone: boolean; users: string[] }) =>
  call<{ shared: { everyone: boolean; users: string[] } }>(`projects/${encodeURIComponent(projectId)}/library/share`, json(share));

export const unpublishLibrary = (projectId: string) => call<{ ok: boolean }>(`projects/${encodeURIComponent(projectId)}/library`, { method: 'DELETE' });

// ---------------------------------------------------------------- templates

export interface SaveTemplateBody {
  name: string;
  description: string;
  checklist: { id?: string; text: string; artboardId?: string; nodeId?: string }[];
  everyone: boolean;
  /** Save over one of yours as its next version. */
  templateId?: string;
  note?: string;
}

export const listTemplates = () => call<TemplateInfo[]>('templates');

export const getTemplate = (id: string) => call<{ template: TemplateInfo }>(`templates/${encodeURIComponent(id)}`).then((r) => r.template);

/** The template with the project it holds, for "Update from template". */
export const getTemplateFull = (id: string) => call<{ template: TemplateInfo; snapshot: Project }>(`templates/${encodeURIComponent(id)}?full=1`);

export const saveAsTemplate = (projectId: string, body: SaveTemplateBody) =>
  call<{ ok: boolean; id: string; unchanged: boolean; version: number }>(`projects/${encodeURIComponent(projectId)}/template`, postJson(body));

export const changeTemplate = (id: string, patch: Partial<Pick<SaveTemplateBody, 'name' | 'description' | 'checklist' | 'everyone'>>) => call<TemplateInfo>(`templates/${encodeURIComponent(id)}`, json(patch));

export const deleteTemplate = (id: string) => call<{ ok: boolean }>(`templates/${encodeURIComponent(id)}`, { method: 'DELETE' });

/** A new project from a saved template (the server copies it, its files and thumbnail, and makes the id). */
export const useTemplate = (id: string, opts: { name?: string; folder?: string | null } = {}) => call<{ id: string }>(`templates/${encodeURIComponent(id)}/use`, postJson(opts)).then((r) => r.id);

export const getTemplateAsset = (templateId: string, assetId: string) => call<Blob>(`templates/${encodeURIComponent(templateId)}/assets/${encodeURIComponent(assetId)}`, {}, 'blob');

export const templateThumbUrl = (id: string, v: number | null | undefined) => `api/templates/${encodeURIComponent(id)}/thumbnail?v=${v ?? 0}`;

// ---------------------------------------------------------------- examples (read-only, shipped in the repo)

export interface ExampleInfo {
  key: string;
  title: string;
  description: string;
  group: string;
  tags: string[];
  artboards: number;
  preview: { width: number; height: number; background: string } | null;
}

export const listExamples = () => call<ExampleInfo[]>('examples');

export const getExample = (key: string) => call<{ example: ExampleInfo; project: Project }>(`examples/${encodeURIComponent(key)}`).then((r) => ({ example: r.example, project: normalizeProject(r.project) }));

/** The bytes of one of an example's files (for playing it). */
export const exampleAssetBytes = async (key: string, assetId: string): Promise<Uint8Array | null> => {
  try {
    const blob = await call<Blob>(`examples/${encodeURIComponent(key)}/assets/${encodeURIComponent(assetId)}`, {}, 'blob');
    return new Uint8Array(await blob.arrayBuffer());
  } catch {
    return null;
  }
};

export const exampleThumbUrl = (key: string) => `api/examples/${encodeURIComponent(key)}/thumbnail`;

/** Your own copy of an example, as a new project. */
export const useExample = (key: string, opts: { name?: string; folder?: string | null } = {}) => call<{ id: string }>(`examples/${encodeURIComponent(key)}/use`, postJson(opts)).then((r) => r.id);

// ---------------------------------------------------------------- usage and errors (power users)

export interface UsageRow {
  key: string;
  uses: number;
  users: number;
  ms: number;
  last: number;
}

export interface EditorFault {
  fp: string;
  kind: string;
  where: string;
  cls: string;
  msg: string;
  frame: string;
  status: number | null;
  via: string;
  reports: number;
  count: number;
  users: number;
  visits: number;
  builds: string[];
  projects: number;
  first: number;
  last: number;
}

export interface PlayerFault {
  fp: string;
  kind: string;
  where: string;
  msg: string;
  level: string;
  status: number | null;
  count: number;
  learners: number;
  runs: number;
  versions: string[];
  projects: number;
  first: number;
  last: number;
}

export interface UsageReport {
  days: number;
  generatedAt: number;
  truncated: boolean;
  editor: {
    rows: number;
    visits: number;
    users: number;
    activeMs: number;
    builds: { build: string; rows: number }[];
    browsers: { browser: string; visits: number }[];
    funnel: { label: string; people: number }[];
    features: UsageRow[];
    inspector: UsageRow[];
    nodes: UsageRow[];
    doc: UsageRow[];
    history: UsageRow[];
    tools: { tool: string; uses: number; users: number; ms: number }[];
    panels: { panel: string; opens: number; users: number; ms: number }[];
    imports: { format: string; ok: number; failed: number; kb: number; users: number }[];
    exports: UsageRow[];
    help: { topics: UsageRow[]; searches: number; notFound: number };
    preview: { loads: number; avgLoadMs: number };
    live: UsageRow[];
    api: UsageRow[];
    faults: EditorFault[];
    faultCount: number;
  };
  player: {
    rows: number;
    pageLoads: number;
    learners: number;
    loads: { n: number; p50: number; p90: number; p99: number };
    byKind: { kind: string; rows: number }[];
    versions: { version: string; rows: number }[];
    faults: PlayerFault[];
    projects: { project: string; loads: number; faults: number }[];
  };
}

/** How the editor is used and where it and published projects break (`GET /api/analytics/usage`, power users only). */
export const getUsageReport = (days: number) => call<UsageReport>(`analytics/usage?days=${days}`);
