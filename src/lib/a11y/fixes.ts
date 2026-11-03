/** Applying a finding's fix to a project (an immer draft or a plain copy). */
import { setPath, type Project, type SceneNode } from 'interactives-player';
import { locate } from '../../store/doc';
import { unlinkStyleRef } from '../libraries';
import type { Fix } from './types';

/** The values a fix would write, with what the person typed in for a fix that asks for a word. Null when it asked and got nothing. */
export function fixValues(fix: Fix, typed?: string): Record<string, unknown> | null {
  if (!fix.input) return fix.set;
  const v = (typed ?? fix.input.value).trim();
  return v ? { ...fix.set, [fix.input.key]: v } : null;
}

/** Make the change. False when there was nothing to do it to (the layer is gone) or the fix needed a word and had none. */
export function applyFix(project: Project, fix: Fix, typed?: string): boolean {
  const values = fixValues(fix, typed);
  if (!values) return false;
  let host: Record<string, unknown>;
  let node: SceneNode | null = null;
  if (fix.target.scope === 'project') host = project as unknown as Record<string, unknown>;
  else {
    const target = fix.target;
    const ab = project.artboards.find((a) => a.id === target.artboardId);
    node = ab ? locate(ab, target.nodeId)?.node ?? null : null;
    if (!node) return false;
    host = node as unknown as Record<string, unknown>;
  }
  for (const [path, value] of Object.entries(values)) {
    setPath(host, path, value);
    // Same as typing it in the inspector: a layer that followed a text style stops following it
    if (node) unlinkStyleRef(node, path);
  }
  return true;
}
