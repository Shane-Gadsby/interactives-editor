import { artboardAssetIds, projectAssetIds, type Artboard, type Asset, type Project } from 'interactives-player';
import { orderedArtboards } from './variants-edit';

/**
 * The size readout: what each artboard asks a learner to download, from the asset sizes the project already stores. The
 * maths is the player's (`artboardAssetIds`), the same the `downloadSize()` expression uses, so what an author reads here is
 * what a learner is shown.
 */

export type WeightKind = 'video' | 'audio' | 'pictures' | 'other';

export const KIND_ORDER: WeightKind[] = ['video', 'audio', 'pictures', 'other'];

export function weightKind(mime: string): WeightKind {
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('image/')) return 'pictures';
  return 'other';
}

export interface WeightFile {
  id: string;
  name: string;
  mime: string;
  /** What it downloads as (the optimised copy's size when there is one). */
  bytes: number;
  kind: WeightKind;
}

export interface ArtboardWeight {
  id: string;
  name: string;
  bytes: number;
  files: WeightFile[];
  byKind: Record<WeightKind, number>;
}

export interface ProjectWeight {
  artboards: ArtboardWeight[];
  /** Font and data files: loaded whichever artboard shows, so left out of every artboard's number. */
  shared: { files: WeightFile[]; bytes: number };
}

const file = (a: Asset, sizeOf: (a: Asset) => number): WeightFile => ({ id: a.id, name: a.name, mime: a.mime, bytes: Math.max(0, Number(sizeOf(a)) || 0), kind: weightKind(a.mime) });

/** Each artboard's files and total, in the order the Layers panel lists them, largest file first. `sizeOf` can swap in the optimised copy's size. */
export function projectWeight(project: Project, sizeOf: (a: Asset) => number = (a) => a.size): ProjectWeight {
  const shared = projectAssetIds(project);
  const byId = new Map(project.assets.map((a) => [a.id, a]));
  const of = (ab: Artboard): ArtboardWeight => {
    const files: WeightFile[] = [];
    for (const id of artboardAssetIds(project, ab)) {
      const a = byId.get(id);
      if (a && !shared.has(id)) files.push(file(a, sizeOf));
    }
    files.sort((x, y) => y.bytes - x.bytes);
    const byKind: Record<WeightKind, number> = { video: 0, audio: 0, pictures: 0, other: 0 };
    for (const f of files) byKind[f.kind] += f.bytes;
    return { id: ab.id, name: ab.name, bytes: files.reduce((n, f) => n + f.bytes, 0), files, byKind };
  };
  const sharedFiles = [...shared].map((id) => byId.get(id)).filter((a): a is Asset => !!a).map((a) => file(a, sizeOf));
  return { artboards: orderedArtboards(project.artboards).map(of), shared: { files: sharedFiles, bytes: sharedFiles.reduce((n, f) => n + f.bytes, 0) } };
}

/** "12.4 MB video, 1.2 MB audio, 300 KB pictures": the kinds that have anything, biggest first. */
export function kindSummary(byKind: Record<WeightKind, number>, say: (bytes: number) => string): string {
  return KIND_ORDER.filter((k) => byKind[k] > 0)
    .sort((a, b) => byKind[b] - byKind[a])
    .map((k) => `${say(byKind[k])} ${k}`)
    .join(', ');
}
