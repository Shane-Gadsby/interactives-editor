import { useState } from 'react';
import {
  SHADER_PRESETS,
  SHADER_UNIFORM_TYPES,
  VECTOR_SIZE,
  uniformNameProblem,
  uniformProp,
  type ImageNode,
  type Project,
  type SceneNode,
  type ShaderNode,
  type ShaderUniform,
} from 'interactives-player';
import { store } from '../store/store';
import { CheckField, IconButton, NumberField, Row, Section, SelectField, TextField } from '../components/ui';
import { Icons } from '../components/icons';
import { CodeEditor } from '../components/CodeEditor';
import { assetKind } from '../lib/assets';
import { useShaderProblem } from '../lib/shader-edit';
import { addUniform, applyShaderPreset, removeUniform, retypeUniform, type ShaderPrefix } from '../lib/shader-uniform-edit';
import { Color, KeyButton, Num } from './Inspector';

const PIXEL_RATIOS = ['auto', '1', '2', '3'] as const;
// Plain words in the picker; the stored type stays the GLSL one
const TYPE_LABEL: Record<ShaderUniform['type'], string> = { float: 'Number', vec2: 'Vector 2', vec3: 'Vector 3', vec4: 'Vector 4', color: 'Colour', image: 'Image' };

/** What the code editor and the uniform list edit: a shader layer itself, or an image layer's `shaderFilter`. */
interface Target {
  code: string;
  uniforms: ShaderUniform[];
  fps?: number;
  pixelRatio?: 'auto' | number;
  animateInEditor?: boolean;
}

export function ShaderSection({ node, project }: { node: ShaderNode; project: Project }) {
  return (
    <Section help="shader-layers" title="Shader layer">
      <ShaderFields node={node} target={node} prefix="" project={project} onPatch={(p, coalesce) => store().setProps([node.id], p, coalesce ?? `shader-${node.id}`)} />
    </Section>
  );
}

/** The shader filter of an image layer, inside the Effects section. */
export function ShaderFilterFields({ node, project }: { node: ImageNode; project: Project }) {
  const f = node.shaderFilter!;
  return (
    <ShaderFields
      node={node}
      target={f}
      prefix="shaderFilter."
      project={project}
      onPatch={(p, coalesce) => {
        // `setProps` addresses properties by path, so each patched field goes under `shaderFilter.`
        store().setProps([node.id], Object.fromEntries(Object.entries(p).map(([k, v]) => [`shaderFilter.${k}`, v])), coalesce ?? `shaderfilter-${node.id}`);
      }}
    />
  );
}

function ShaderFields({ node, target, prefix, project, onPatch }: { node: SceneNode; target: Target; prefix: ShaderPrefix; project: Project; onPatch: (p: Partial<Target>, coalesce?: string) => void }) {
  const problem = useShaderProblem(node.id);
  const ratio = typeof target.pixelRatio === 'number' ? String(target.pixelRatio) : 'auto';
  const lines = (problem?.problems ?? []).map((p) => p.line).filter((l): l is number => l !== null);
  const isFilter = prefix !== '';
  return (
    <>
      <SelectField
        label="Start from"
        title="Replace the shader with a starter: clouds, plasma, ripples, a glow backdrop, Voronoi cells, or (for pictures) wave distortion, CRT, halftone and film grain. Undo brings the old one back"
        value=""
        options={[
          { value: '', label: 'Choose a preset…' },
          ...SHADER_PRESETS.filter((p) => !isFilter || p.kind === 'filter').map((p) => ({ value: p.id, label: p.name })),
        ]}
        onChange={(id) => id && applyShaderPreset(node.id, prefix, id)}
      />
      <div className="code-field">
        <div className="field-label block">
          Fragment shader: <code>void mainImage(out vec4 fragColor, in vec2 fragCoord)</code>
        </div>
        <CodeEditor language="glsl" value={target.code} errorLines={lines} onChange={(v) => onPatch({ code: v }, `code-${node.id}`)} height={280} />
      </div>
      {problem && (
        <div className={problem.kind === 'error' ? 'hint error' : 'hint'} role="alert">
          {problem.kind === 'error' ? 'The shader did not compile, so the layer shows a placeholder:' : problem.message}
          {problem.kind === 'error' && (
            <ul className="shader-problems">
              {(problem.problems.length ? problem.problems : [{ line: null, message: problem.message }]).map((p, i) => (
                <li key={i}>
                  {p.line !== null && <strong>Line {p.line}: </strong>}
                  {p.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <UniformList node={node} uniforms={target.uniforms} prefix={prefix} project={project} onPatch={onPatch} />
      <Row>
        <NumberField label="FPS" title="Frame rate cap: 0 draws on every frame" value={target.fps ?? 0} min={0} max={120} onChange={(v) => onPatch({ fps: Math.max(0, Math.round(v)) })} />
        <SelectField
          label="Pixel ratio"
          title="Canvas pixels per layer pixel. Auto follows the screen's density and the artboard's scale, up to 2x; a higher number is sharper but slower (shaders cost per pixel, so big layers are capped near 4 million pixels)"
          value={ratio}
          options={PIXEL_RATIOS.map((r) => ({ value: r, label: r === 'auto' ? 'Auto' : `${r}x` }))}
          onChange={(v) => onPatch({ pixelRatio: v === 'auto' ? 'auto' : Number(v) })}
        />
      </Row>
      <CheckField
        label="Animate while editing"
        title="Run the shader live on the editor canvas. Off shows one still frame at the timeline's time (or 0); Preview always runs it"
        value={!!target.animateInEditor}
        onChange={(v) => onPatch({ animateInEditor: v })}
      />
      <details className="draw-api">
        <summary>What can the shader use?</summary>
        <ul className="hint">
          <li>
            <code>u_time</code>: seconds since the layer started (frozen for viewers who prefer reduced motion)
          </li>
          <li>
            <code>u_resolution</code> (vec2): the canvas size in pixels; <code>fragCoord</code> is in the same pixels, origin bottom-left
          </li>
          <li>
            <code>u_mouse</code> (vec3): pointer over the layer, x and y from 0 to 1 with y up, z is 1 while the button is down
          </li>
          <li>
            <code>u_frame</code>: frames drawn so far; <code>v_uv</code> (vec2): 0 to 1 across the layer, y up
          </li>
          <li>Your uniforms are declared for you: use their names in the code. An image uniform also gives <code>name_size</code> (vec2, pixels).</li>
          {isFilter && (
            <li>
              <code>u_image</code> (sampler2D) and <code>u_image_size</code>: this layer&rsquo;s own picture, laid out as the layer shows it
            </li>
          )}
          <li>Return straight (not premultiplied) alpha. <code>texture2D</code> and <code>texture</code> both work.</li>
        </ul>
      </details>
    </>
  );
}

function UniformList({ node, uniforms, prefix, project, onPatch }: { node: SceneNode; uniforms: ShaderUniform[]; prefix: ShaderPrefix; project: Project; onPatch: (p: Partial<Target>, coalesce?: string) => void }) {
  const [adding, setAdding] = useState('');
  const images = project.assets.filter((a) => assetKind(a.mime, a.name) === 'image');
  const rename = (i: number, name: string) => onPatch({ uniforms: uniforms.map((u, j) => (j === i ? { ...u, name } : u)) }, `uname-${node.id}-${i}`);
  return (
    <div className="uniform-list">
      <div className="field-label block">Uniforms (animate with ◆, bind in Data bindings)</div>
      {uniforms.length === 0 && <p className="hint">No uniforms. Add one to give the shader a value to animate or bind to a variable.</p>}
      {uniforms.map((u, i) => {
        const others = uniforms.filter((_, j) => j !== i).map((x) => x.name);
        // `<image>_size` is declared too
        const taken = [...others, ...uniforms.filter((x, j) => j !== i && x.type === 'image').map((x) => `${x.name}_size`)];
        const bad = uniformNameProblem(u.name, taken) ?? (u.type === 'image' && taken.includes(`${u.name}_size`) ? 'That name clashes with another uniform.' : null);
        return (
          <div key={i} className="uniform-item effect-item">
            <Row>
              <TextField label="Name" title="The uniform's name, as the shader code uses it" placeholder="Name" value={u.name} mono commitOnBlur onChange={(v) => rename(i, v.trim())} />
              <SelectField label="Type" title="The kind of value: a number, a vector, a colour or an image" value={u.type} options={SHADER_UNIFORM_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))} onChange={(t) => retypeUniform(node.id, prefix, i, t)} />
              <IconButton icon={<Icons.trash />} title={`Remove ${u.name}`} onClick={() => removeUniform(node.id, prefix, i)} />
            </Row>
            {bad && <p className="hint error">{bad} This uniform is left out until it is fixed.</p>}
            <UniformValue node={node} u={u} index={i} prefix={prefix} images={images} />
          </div>
        );
      })}
      <SelectField
        value={adding}
        options={[{ value: '', label: '+ Add a uniform…' }, ...SHADER_UNIFORM_TYPES.map((t) => ({ value: t as string, label: TYPE_LABEL[t] }))]}
        onChange={(t) => {
          setAdding('');
          if (t) addUniform(node.id, prefix, t as ShaderUniform['type']);
        }}
      />
    </div>
  );
}

function UniformValue({ node, u, index, prefix, images }: { node: SceneNode; u: ShaderUniform; index: number; prefix: ShaderPrefix; images: Project['assets'] }) {
  const ids = [node.id];
  const size = VECTOR_SIZE[u.type];
  if (u.type === 'float')
    return <Num node={node} ids={ids} prop={uniformProp(prefix, index)} label="Value" step={step(u)} min={u.min} max={u.max} />;
  if (size)
    return (
      <Row>
        {Array.from({ length: size }, (_, k) => (
          <Num key={k} node={node} ids={ids} prop={uniformProp(prefix, index, k)} label={'xyzw'[k]} step={step(u)} min={u.min} max={u.max} />
        ))}
      </Row>
    );
  if (u.type === 'color') return <Color node={node} ids={ids} prop={uniformProp(prefix, index)} label="Value" />;
  const prop = uniformProp(prefix, index);
  return (
    <div className="keyed">
      <SelectField
        label="Image"
        value={String(u.value ?? '')}
        options={[{ value: '', label: images.length ? '(none)' : '(none: upload an image in Assets)' }, ...images.map((a) => ({ value: a.id, label: a.name }))]}
        onChange={(v) => store().setProps(ids, { [prop]: v }, `uimg-${node.id}-${index}`)}
      />
      <KeyButton node={node} prop={prop} ids={ids} />
    </div>
  );
}

/** A step that suits the range: finer for small ranges. */
function step(u: ShaderUniform): number {
  const span = u.min !== undefined && u.max !== undefined ? u.max - u.min : 0;
  return span > 0 && span <= 2 ? 0.01 : span > 0 && span <= 20 ? 0.05 : 0.1;
}
