export function stable(value: unknown): string
export function hashOf(value: unknown): string
export function hashArtboard(ab: object): string
export function cleanArtboard<T>(ab: T): T
export function instanceTargets(ab: { children?: unknown[] }): string[]
export function closureOf(artboards: { id: string; children?: unknown[] }[], rootId: string): string[]

export interface SnapshotComponent {
  id: string
  name: string
  width: number
  height: number
  hash: string
  /** Artboards this component uses as instances (ids in the library), nested at any depth. */
  uses: string[]
}

export interface SnapshotInternal {
  id: string
  name: string
  hash: string
}

export interface LibrarySnapshot {
  components: SnapshotComponent[]
  internals: SnapshotInternal[]
  artboards: any[]
  variables: any[]
  fonts: any[]
  dataSources: any[]
  assets: any[]
  styles: { colors: any[]; texts: any[] }
}

export function buildSnapshot(project: any): LibrarySnapshot
export function snapshotHash(snap: LibrarySnapshot): string
export function mayUseLibrary(lib: { owner?: { username?: string | null } | null; shared?: { everyone?: boolean; users?: string[] } } | null | undefined, me: { username?: string | null } | null | undefined, enforcing: boolean): boolean
export function accessFilter(me: { username?: string | null } | null | undefined, enforcing: boolean): Record<string, unknown>
export function cleanShare(body: unknown, maxUsers?: number): { everyone: boolean; users: string[] }

export interface PublishPlan {
  unchanged: boolean
  version: number
  hash: string
  history?: { version: number; created: Date | string; by: string | null; note: string; components: { id: string; name: string; hash: string }[] }[]
}
export function planPublish(existing: { hash?: string; version: number; history?: PublishPlan['history'] } | null | undefined, snap: LibrarySnapshot, opts: { note?: string; by?: string | null; now: Date | string }): PublishPlan
export function mayMarkBrand(access: unknown, power: boolean, group?: string | null): boolean
