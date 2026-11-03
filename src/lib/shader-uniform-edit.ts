import {
  DEFAULT_SHADER_FILTER,
  SHADER_PRESETS_BY_ID,
  defaultUniformValue,
  parseUniformPath,
  presetContent,
  uniformNameProblem,
  type Artboard,
  type Project,
  type SceneNode,
  type ShaderUniform,
  type ShaderUniformType,
} from 'interactives-player';
import { store } from '../store/store';
import { getArtboard, locate } from '../store/doc';

/** Where a node keeps its shader: on the node itself (a shader layer) or in its `shaderFilter` (an image layer). */
export type ShaderPrefix = '' | 'shaderFilter.';

interface Holder {
  uniforms: ShaderUniform[];
  code: string;
  preset?: string;
}

function holderOf(node: SceneNode, prefix: ShaderPrefix): Holder | null {
  if (prefix === '' && node.type === 'shader') return node as unknown as Holder;
  if (prefix === 'shaderFilter.' && node.type === 'image' && node.shaderFilter) return node.shaderFilter as unknown as Holder;
  return null;
}

/** A name for a new uniform that no other uniform has: `uniform1`, `uniform2`, ... */
export function freshUniformName(list: ShaderUniform[], base = 'value'): string {
  const names = new Set(list.map((u) => u.name));
  let i = 1;
  while (names.has(`${base}${i}`) || uniformNameProblem(`${base}${i}`)) i++;
  return `${base}${i}`;
}

/**
 * Edit the document so uniform paths stay true after the list changed. `keep(index)` says where a uniform went (its new
 * index), or null when it is gone or changed type: its tracks and bindings are removed, the rest are renumbered.
 */
function renumber(ab: Artboard, nodeId: string, prefix: ShaderPrefix, keep: (index: number) => number | null): void {
  const rename = (prop: string): string | null | undefined => {
    const p = parseUniformPath(prop);
    if (!p || p.prefix !== prefix) return undefined;
    const to = keep(p.index);
    if (to === null) return null;
    return `${prefix}uniforms.${to}.value${p.component === null ? '' : `.${p.component}`}`;
  };
  for (const tl of ab.timelines) {
    tl.tracks = tl.tracks.filter((t) => {
      if (t.nodeId !== nodeId) return true;
      const to = rename(t.prop);
      if (to === null) return false;
      if (to !== undefined) t.prop = to;
      return true;
    });
  }
  const node = locate(ab, nodeId)?.node;
  if (!node) return;
  for (const key of ['bindings', 'converters'] as const) {
    const map = node[key] as Record<string, unknown> | undefined;
    if (!map) continue;
    const next: Record<string, unknown> = {};
    for (const [prop, v] of Object.entries(map)) {
      const to = rename(prop);
      if (to === null) continue;
      next[to ?? prop] = v;
    }
    (node as unknown as Record<string, unknown>)[key] = Object.keys(next).length ? next : undefined;
  }
}

function withNode(nodeId: string, fn: (node: SceneNode, ab: Artboard) => void, coalesce?: string): void {
  store().update(
    (d) => {
      const ab = getArtboard(d as Project, store().get().activeArtboardId);
      const node = ab && locate(ab, nodeId)?.node;
      if (ab && node) fn(node, ab);
    },
    { coalesce },
  );
}

export function addUniform(nodeId: string, prefix: ShaderPrefix, type: ShaderUniformType): void {
  withNode(nodeId, (node) => {
    const h = holderOf(node, prefix);
    if (h) h.uniforms.push({ name: freshUniformName(h.uniforms, type === 'color' ? 'color' : type === 'image' ? 'image' : 'value'), type, value: defaultUniformValue(type) });
  });
}

export function removeUniform(nodeId: string, prefix: ShaderPrefix, index: number): void {
  withNode(nodeId, (node, ab) => {
    const h = holderOf(node, prefix);
    if (!h || !h.uniforms[index]) return;
    h.uniforms.splice(index, 1);
    renumber(ab, nodeId, prefix, (i) => (i === index ? null : i > index ? i - 1 : i));
  });
}

/** A uniform of another type: its value starts over, and animation or bindings aimed at the old type are removed. */
export function retypeUniform(nodeId: string, prefix: ShaderPrefix, index: number, type: ShaderUniformType): void {
  withNode(nodeId, (node, ab) => {
    const u = holderOf(node, prefix)?.uniforms[index];
    if (!u || u.type === type) return;
    u.type = type;
    u.value = defaultUniformValue(type);
    delete u.min;
    delete u.max;
    renumber(ab, nodeId, prefix, (i) => (i === index ? null : i));
  });
}

/** Put a starter shader on a layer: its code and uniforms replace the current ones (undo brings them back). */
export function applyShaderPreset(nodeId: string, prefix: ShaderPrefix, presetId: string): void {
  const preset = SHADER_PRESETS_BY_ID[presetId];
  if (!preset) return;
  withNode(nodeId, (node, ab) => {
    const h = holderOf(node, prefix);
    if (!h) return;
    const c = presetContent(preset, prefix === '' ? 'layer' : 'filter');
    h.code = c.code;
    h.uniforms = c.uniforms;
    if (prefix === 'shaderFilter.') h.preset = preset.id;
    renumber(ab, nodeId, prefix, () => null);
  });
}

/** Give an image layer a shader filter (the wave distortion to start with). */
export function addShaderFilter(nodeId: string): void {
  withNode(nodeId, (node) => {
    if (node.type !== 'image') return;
    node.shaderFilter = { preset: DEFAULT_SHADER_FILTER.preset, code: DEFAULT_SHADER_FILTER.code, uniforms: DEFAULT_SHADER_FILTER.uniforms.map((u) => ({ ...u })) };
  });
}

/** Take the filter off, with the animation and bindings that were aimed at its uniforms. */
export function removeShaderFilter(nodeId: string): void {
  withNode(nodeId, (node, ab) => {
    if (node.type !== 'image') return;
    node.shaderFilter = null;
    renumber(ab, nodeId, 'shaderFilter.', () => null);
  });
}
