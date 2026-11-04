export interface CommentUser {
  username?: string | null;
  userID?: string | number | null;
  name: string;
  guest?: boolean;
}
export interface Anchor {
  artboardId: string;
  layerId: string | null;
  x: number;
  y: number;
  lx?: number;
  ly?: number;
}
export interface CommentMessage {
  id: string;
  by: CommentUser;
  text: string;
  mentions: string[];
  created: string;
  edited: string | null;
}
export interface Person {
  username: string;
  name: string;
}
export interface Thread {
  id: string;
  n: number;
  anchor: Anchor;
  ctx: { artboard: string; layer: string };
  status: 'open' | 'resolved';
  assignee: Person | null;
  resolved: { by: CommentUser; at: string } | null;
  created: string;
  updated: string;
  comments: CommentMessage[];
}
export interface Filter {
  status?: 'open' | 'resolved' | 'all';
  scope?: 'all' | 'mine' | 'assigned';
  artboardId?: string;
}
export const LIMITS: { text: number; name: number; mentions: number; perThread: number; perProject: number; label: number };
export const STATUSES: string[];
export function validCommentID(id: unknown): boolean;
export function cleanText(value: unknown): string | null;
export function cleanName(value: unknown): string | null;
export function cleanAnchor(a: unknown): Anchor | null;
export function cleanContext(c: unknown): { artboard: string; layer: string };
export function cleanUsername(v: unknown): string | null;
export function cleanMentions(list: unknown): string[];
export function cleanAssignee(v: unknown): Person | null;
export function cleanStatus(v: unknown): 'open' | 'resolved' | null;
export function threadsOf(rows: Record<string, any>[]): Thread[];
export function isMine(thread: Thread, me: CommentUser | null | undefined): boolean;
export function isAssignedTo(thread: Thread, me: { username?: string | null } | null | undefined): boolean;
export function matchesFilter(thread: Thread, filter: Filter, me: CommentUser | null | undefined): boolean;
export function countsOf(threads: Thread[], me: CommentUser | null | undefined): { open: number; resolved: number; mine: number; assigned: number };
export function peopleOf(threads: Thread[], owner: { username?: string | null; name?: string | null } | null | undefined): Person[];
export function noticesFor(a: { thread: Thread; by?: CommentUser | null; kind: 'root' | 'reply'; mentions?: string[]; assignee?: Person | null }): { user: string; kind: 'assigned' | 'mention' | 'reply' }[];
export class Limiter {
  constructor(max: number, windowMs: number);
  hit(key: string, now?: number): boolean;
  sweep(now?: number): void;
}
export function pinSpot(anchor: Anchor, place: (layerId: string, lx: number, ly: number) => { x: number; y: number } | null): { x: number; y: number; detached: boolean };
export function snippet(text: string, max?: number): string;
