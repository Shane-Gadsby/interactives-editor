import { useState } from 'react';
import { createNode, type Artboard, type BoneNode, type Project, type SceneNode, type SkinInfluence } from 'interactives-player';
import { store } from '../store/store';
import { getArtboard } from '../store/doc';
import { CheckField, IconButton, NumberField, Row, Section, SelectField } from '../components/ui';
import { PropRow } from '../lib/prop-search';
import { Icons } from '../components/icons';
import { addBonesExample } from '../lib/bones-example';
import { autoWeightPoint, bindLayer, bonesOf, setPointWeights, skinOf, unbindLayer } from '../lib/rig';

/** Run a change on the open artboard through the store (one undo step). */
function edit(abId: string, fn: (ab: NonNullable<ReturnType<typeof getArtboard>>) => void, coalesce?: string): void {
  store().update(
    (d) => {
      const ab = getArtboard(d as Project, abId);
      if (ab) fn(ab);
    },
    { coalesce },
  );
}

const EXAMPLE_TIP =
  "Add a three-bone arm with a shape skinned to it, an orange dot the arm reaches for (IK), a Wave timeline with a button, and the instructions on the artboard. Then open Preview and drag the dot";

/** Adds the example rig to an artboard, as one undo step. */
function buildExample(abId: string): void {
  edit(abId, (ab) => void addBonesExample(ab as Artboard));
  store().toast('Added an example arm. Click Preview (top right) and drag the orange dot: the arm reaches for it. Wave plays a keyed pose.');
}

/** The artboard's Bones section: what bones are for, and a one-click example to try. */
export function BonesArtboardSection({ ab }: { ab: Artboard }) {
  const count = bonesOf(ab.children).length;
  return (
    <Section help="bones#try-bones-in-two-minutes" title="Bones" defaultOpen={false}>
      <p className="hint">
        {count
          ? `${count} bone${count > 1 ? 's' : ''} on this artboard. Draw more with the Bone tool (J), then bind paths and images to them.`
          : 'Rig a character: draw bones with the Bone tool (J), bind paths and images to them, and pose limbs with IK. Not sure where to start?'}
      </p>
      <PropRow k="Build a rig example" words={['example rig', 'arm', 'ik', 'demo']}>
        <button className="link-btn" title={EXAMPLE_TIP} onClick={() => buildExample(ab.id)}>
          Build an example to try
        </button>
      </PropRow>
    </Section>
  );
}

/** A bone: what it is, and quick ways to grow the rig. */
export function BoneSection({ node, abId }: { node: BoneNode; abId: string }) {
  const addChild = () => {
    const child = createNode('bone', { name: 'Bone', x: node.width, y: 0, width: Math.max(20, Math.round(node.width * 0.8)), rotation: 0 });
    store().addNodes([child], { parentId: node.id, artboardId: abId });
  };
  return (
    <Section help="bones" title="Bone">
      <p className="hint">The bone points along its own x axis from its base (X, Y), for its length. Turn it with ↻ or drag it on the canvas; child bones and layers inside it follow.</p>
      <Row k="Add child bone" words={['skeleton', 'rig', 'joint']}>
        <button className="btn" title="Add a bone that starts at this bone's tip" onClick={addChild}>
          Add child bone
        </button>
      </Row>
      <PropRow k="Build an example" words={['example rig', 'arm', 'ik', 'demo']}>
        <button className="link-btn" title={EXAMPLE_TIP} onClick={() => buildExample(abId)}>
          Build an example to try
        </button>
      </PropRow>
    </Section>
  );
}

/** Bind every path and image in the selection to every bone in it. */
export function BindSelectionSection({ nodes, abId }: { nodes: SceneNode[]; abId: string }) {
  const layers = nodes.filter((n) => n.type === 'path' || n.type === 'image');
  const bones = nodes.filter((n) => n.type === 'bone');
  if (!layers.length || !bones.length) return null;
  return (
    <Section help="bones" title="Bones and skinning">
      <p className="hint">
        {layers.length} layer{layers.length > 1 ? 's' : ''} and {bones.length} bone{bones.length > 1 ? 's' : ''} selected.
      </p>
      <PropRow k="Bind to selected bones" words={['skin', 'weights', 'attach', 'rig']}>
      <button
        className="btn"
        title="Pull each layer's points along with the selected bones. Weights come from distance to the bones; the poses they are in now become the bind pose"
        onClick={() =>
          edit(abId, (ab) => {
            for (const l of layers) bindLayer(ab, l.id, bones.map((b) => b.id));
          })
        }
      >
        Bind to selected bones
      </button>
      </PropRow>
    </Section>
  );
}

/** Skinning on a path or an image mesh: bind to bones, then fix single points' weights. */
export function SkinSection({ node, abId }: { node: Extract<SceneNode, { type: 'path' | 'image' }>; abId: string }) {
  const ab = getArtboard(store().get().project, abId);
  const allBones = ab ? bonesOf(ab.children) : [];
  const skin = skinOf(node);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [max, setMax] = useState(4);
  const chosen = picked ?? allBones.map((b) => b.id);
  const [point, setPoint] = useState('0:0');
  const isImage = node.type === 'image';

  const points: { value: string; label: string }[] = [];
  if (node.type === 'path') node.paths.forEach((sp, si) => sp.points.forEach((_, pi) => points.push({ value: `${si}:${pi}`, label: node.paths.length > 1 ? `Path ${si + 1}, point ${pi + 1}` : `Point ${pi + 1}` })));
  else if (node.mesh) node.mesh.vertices.forEach((_, i) => points.push({ value: `0:${i}`, label: `Vertex ${i + 1}` }));
  const [si, pi] = (points.some((p) => p.value === point) ? point : points[0]?.value ?? '0:0').split(':').map(Number);
  const nameOf = (i: number) => {
    const id = skin?.bones[i]?.bone;
    const b = id ? allBones.find((x) => x.id === id) : undefined;
    return b ? b.name : '(missing bone)';
  };
  const infl: SkinInfluence[] = skin?.weights?.[si]?.[pi]?.w ?? [];
  const setInfl = (list: SkinInfluence[], coalesce?: string) => edit(abId, (a) => setPointWeights(a, node.id, si, pi, list), coalesce);

  return (
    <Section id="skin" help="bones#skinning" title={isImage ? 'Mesh and skin' : 'Skin'} defaultOpen={!!skin}>
      {!skin && (
        <>
          <p className="hint">
            {allBones.length
              ? isImage
                ? 'Make a mesh over the picture and bind it to bones: the picture bends where the bones turn.'
                : 'Bind the path to bones so its points follow them when they move.'
              : 'Draw bones with the Bone tool (J) first.'}
          </p>
          {allBones.length > 0 && (
            <>
              {allBones.map((b) => (
                <CheckField
                  key={b.id}
                  label={b.name}
                  value={chosen.includes(b.id)}
                  onChange={(v) => setPicked(v ? [...chosen, b.id] : chosen.filter((x) => x !== b.id))}
                />
              ))}
              <NumberField label="Max per point" title="How many bones may pull on one point (1 to 4)" value={max} step={1} min={1} max={4} onChange={setMax} />
              <PropRow k="Bind to bones" words={['skin', 'weights', 'attach', 'mesh']}>
                <button className="btn" disabled={!chosen.length} onClick={() => edit(abId, (a) => void bindLayer(a, node.id, chosen, { maxInfluences: max }))}>
                Bind to {chosen.length} bone{chosen.length === 1 ? '' : 's'}
              </button>
              </PropRow>
            </>
          )}
        </>
      )}
      {skin && (
        <>
          <p className="hint">
            Bound to {skin.bones.length} bone{skin.bones.length === 1 ? '' : 's'}: {skin.bones.map((_, i) => nameOf(i)).join(', ')}. It follows its bones, not its own position.
          </p>
          <Row>
            <button className="btn" title="Work the weights out again from where the bones are now (the current pose becomes the bind pose)" onClick={() => edit(abId, (a) => void bindLayer(a, node.id, skin.bones.map((b) => b.bone).filter((id) => allBones.some((x) => x.id === id)), { maxInfluences: max }))}>
              Re-bind
            </button>
            <button className="btn" onClick={() => edit(abId, (a) => unbindLayer(a, node.id))}>
              Remove skin
            </button>
          </Row>
          {points.length > 0 && (
            <>
              <SelectField label="Weights of" title="Pick a point to see and change which bones pull on it" value={`${si}:${pi}`} options={points} onChange={setPoint} />
              {infl.map((x, i) => (
                <Row key={i}>
                  <SelectField
                    value={String(x.b)}
                    options={skin.bones.map((_, k) => ({ value: String(k), label: nameOf(k) }))}
                    onChange={(v) => setInfl(infl.map((y, j) => (j === i ? { ...y, b: Number(v) } : y)))}
                  />
                  <NumberField value={x.w} step={0.05} min={0} max={1} title="How strongly this bone pulls (the weights are scaled to add up to 1)" onChange={(v) => setInfl(infl.map((y, j) => (j === i ? { ...y, w: v } : y)), `weight-${node.id}-${si}-${pi}`)} onCommit={() => store().commit()} />
                  <IconButton icon={<Icons.trash />} title="Remove this influence" onClick={() => setInfl(infl.filter((_, j) => j !== i))} />
                </Row>
              ))}
              {!infl.length && <p className="hint">No bone pulls on this point: it stays put.</p>}
              <Row>
                <button className="btn" disabled={infl.length >= 4 || infl.length >= skin.bones.length} onClick={() => setInfl([...infl, { b: skin.bones.findIndex((_, k) => !infl.some((y) => y.b === k)), w: 0.5 }])}>
                  Add bone
                </button>
                <button className="btn" title="Work this point's weights out from distance again" onClick={() => edit(abId, (a) => autoWeightPoint(a, node.id, si, pi, max))}>
                  Auto
                </button>
              </Row>
            </>
          )}
        </>
      )}
      {isImage && node.mesh && (
        <button className="btn" onClick={() => edit(abId, (a) => unbindLayer(a, node.id, true))}>
          Remove mesh
        </button>
      )}
    </Section>
  );
}
