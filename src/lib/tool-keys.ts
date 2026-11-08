import type { Tool } from '../store/store';

//The one-key tool shortcuts (the shortcuts handler in Editor.tsx, the command palette's hints)
export const TOOL_KEYS: Record<string, Tool> = {
  v: 'select',
  h: 'hand',
  a: 'artboard',
  f: 'frame',
  r: 'rect',
  o: 'ellipse',
  l: 'line',
  p: 'pen',
  n: 'pencil',
  k: 'connector',
  w: 'bend',
  t: 'text',
  b: 'button',
  j: 'bone',
  c: 'comment',
  s: 'note',
};
