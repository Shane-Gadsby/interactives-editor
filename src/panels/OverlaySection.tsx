import { overlayFadeMs, type Artboard, type Project, type SceneNode } from 'interactives-player';
import { store } from '../store/store';
import { CheckField, IconButton, NumberField, Row, Section, SelectField } from '../components/ui';
import { Icons } from '../components/icons';
import { SectionBlurb } from '../components/SectionBlurb';
import { overlayTargets } from '../lib/dialog-kit';
import { PropFields } from './PropFields';

const SIDES = [
  { value: 'auto', label: 'Wherever it fits' },
  { value: 'top', label: 'Above' },
  { value: 'bottom', label: 'Below' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
] as const;

/**
 * The layer's **Overlay**: which tooltip, modal, confirmation or prompt it shows, what makes it show, and where it sits. The layer is the
 * target (the thing the overlay belongs to); the trigger is this layer too unless another is picked.
 */
export function OverlaySection({ node, ab, project }: { node: SceneNode; ab: Artboard; project: Project }) {
  const overlays = project.artboards.filter((a) => a.overlay);
  const link = node.overlay ?? null;
  const page = link ? overlays.find((a) => a.id === link.overlayId) : undefined;
  //Nothing to say until the project has an overlay to point at
  if (!overlays.length && !link) return null;

  const set = (patch: Partial<NonNullable<SceneNode['overlay']>> | null, coalesce?: string) =>
    store().update(
      (d) => {
        const n = findNode(d.artboards.find((a) => a.id === ab.id)?.children ?? [], node.id);
        if (!n) return;
        if (!patch) delete n.overlay;
        else n.overlay = { ...(n.overlay ?? { overlayId: '' }), ...patch };
      },
      coalesce ? { coalesce } : undefined,
    );

  const pickable = flatLayers(ab.children).filter((n) => n.id !== node.id);
  return (
    <Section id="overlay" help="overlays" title="Overlay" defaultOpen={!!link}>
      <SectionBlurb text="A tooltip, modal, confirmation or prompt shown for this layer. It lives on its own page." name="Overlay" help={['overlays']} />
      <SelectField
        label="Shows"
        title="The overlay page this layer shows. Add one with Tooltip, Modal, Confirmation or Prompt in the Web tools"
        value={link?.overlayId ?? ''}
        options={[{ value: '', label: overlays.length ? 'None' : 'No overlays yet' }, ...overlays.map((a) => ({ value: a.id, label: a.name }))]}
        onChange={(v) => set(v ? { overlayId: v } : null)}
      />
      {link && page && (
        <>
          <Row>
            <SelectField
              label="Trigger"
              title="The layer whose hover, focus or click shows it. Empty: this layer"
              value={link.trigger ?? ''}
              options={[{ value: '', label: 'This layer' }, ...pickable.map((n) => ({ value: n.id, label: n.name }))]}
              onChange={(v) => set({ trigger: v || undefined })}
            />
            <IconButton
              icon={<Icons.start />}
              title="Pick the trigger by clicking a layer on the canvas"
              active={store().get().overlayPick === node.id}
              onClick={() => store().set({ overlayPick: store().get().overlayPick === node.id ? null : node.id })}
            />
          </Row>
          {page.overlay!.kind === 'tooltip' && (
            <Row>
              <SelectField
                label="Side"
                title="Which side of this layer it sits on. Wherever it fits tries above, below, right, then left. A side with no room goes to the opposite one"
                value={link.side ?? page.overlay!.side ?? 'auto'}
                options={SIDES.map((s) => ({ value: s.value, label: s.label }))}
                onChange={(v) => set({ side: v })}
              />
              <NumberField
                label="Gap"
                title="Space between this layer and the tooltip"
                value={link.offset ?? page.overlay!.offset ?? 8}
                min={0}
                max={200}
                suffix="px"
                onChange={(v) => set({ offset: Math.round(v) }, `overlay-offset-${node.id}`)}
              />
            </Row>
          )}
          {/* What this layer hands the overlay as it opens: the page says what it takes, so these are real fields */}
          <PropFields
            props={page.props ?? []}
            project={project}
            values={link.inputs}
            onChange={(inputs) =>
              store().update((d) => {
                const n = findNode(d.artboards.find((a) => a.id === ab.id)?.children ?? [], node.id);
                if (!n?.overlay) return;
                if (inputs) n.overlay.inputs = inputs;
                else delete n.overlay.inputs;
              })
            }
          />
          <Row k="Edit overlay" words={['open overlay', 'edit tooltip', 'edit modal']}>
            <button className="btn" onClick={() => store().set({ activeArtboardId: page.id, artboardSelected: true, selection: [] })}>
              Edit {page.name}
            </button>
            <IconButton icon={<Icons.unlink />} title="Stop showing it for this layer" onClick={() => set(null)} />
          </Row>
        </>
      )}
    </Section>
  );
}

/**
 * The overlay page's own settings, on the page itself: what kind it is, and the side and gap every layer pointing at it uses
 * unless it says otherwise. Also lists what points at it, since an overlay has no place on the canvas of its own.
 */
export function OverlayPageSection({ ab, project }: { ab: Artboard; project: Project }) {
  const o = ab.overlay;
  if (!o) return null;
  const setO = (patch: Partial<NonNullable<Artboard['overlay']>>, coalesce?: string) =>
    store().update(
      (d) => {
        const page = d.artboards.find((a) => a.id === ab.id);
        if (page?.overlay) page.overlay = { ...page.overlay, ...patch };
      },
      coalesce ? { coalesce } : undefined,
    );
  const used = overlayTargets(project, ab.id);
  return (
    <Section id="overlay-page" help="overlays" title="Overlay" defaultOpen>
      <SectionBlurb text="This page is shown beside, or over, whatever points at it. It is never opened on its own." name="Overlay" help={['overlays']} />
      <SelectField
        label="Kind"
        title="A tooltip sits beside its layer on hover or focus. The others cover the page, opened by a click: a modal says something, a confirmation asks with buttons, a prompt asks for something typed"
        value={o.kind}
        options={[
          { value: 'tooltip', label: 'Tooltip' },
          { value: 'modal', label: 'Modal' },
          { value: 'confirm', label: 'Confirmation' },
          { value: 'input', label: 'Prompt' },
        ]}
        onChange={(v) => setO({ kind: v })}
      />
      {o.kind === 'tooltip' && (
        <>
          <Row>
            <SelectField label="Side" title="Which side of the layer it sits on, unless that layer says otherwise" value={o.side ?? 'auto'} options={SIDES.map((s) => ({ value: s.value, label: s.label }))} onChange={(v) => setO({ side: v })} />
            <NumberField label="Gap" title="Space between the layer and the tooltip" value={o.offset ?? 8} min={0} max={200} suffix="px" onChange={(v) => setO({ offset: Math.round(v) }, `overlay-gap-${ab.id}`)} />
          </Row>
          <SelectField
            label="Fade"
            title="How long it takes to fade in and out: the project's own transition time (Page height time in Project settings) or its own. A viewer who asks for less motion gets none"
            value={o.fade === undefined ? 'default' : 'custom'}
            options={[
              { value: 'default', label: `Project default (${overlayFadeMs({}, project.settings)} ms)` },
              { value: 'custom', label: 'Custom' },
            ]}
            onChange={(v) => setO({ fade: v === 'custom' ? overlayFadeMs({}, project.settings) : undefined })}
          />
          {o.fade !== undefined && (
            <NumberField label="Time" title="The fade, in milliseconds. 0 shows and hides it at once" value={o.fade} min={0} max={2000} suffix="ms" onChange={(v) => setO({ fade: Math.max(0, Math.round(v)) }, `overlay-fade-${ab.id}`)} />
          )}
          <CheckField
            label="Tail"
            title="A small triangle on the side facing the layer, pointing at the middle of it, in the tooltip's own colour"
            value={o.tail !== false}
            onChange={(v) => setO({ tail: v ? undefined : false })}
          />
          <CheckField
            label="Stays while you're on it"
            title="Moving from the layer onto the tooltip keeps it open, so a link or a button inside it can be reached. Turn it off for a plain label"
            value={o.stay !== false}
            onChange={(v) => setO({ stay: v ? undefined : false })}
          />
        </>
      )}
      {o.kind !== 'tooltip' && (
        <CheckField
          label="Dim the page behind it"
          title="A colour over everything else while it is open"
          value={!!o.scrim}
          onChange={(v) => setO({ scrim: v ? { type: 'solid', color: 'rgba(0,0,0,0.5)' } : null })}
        />
      )}
      <div className="hint">
        {used.length ? `Shown for ${used.length} layer${used.length === 1 ? '' : 's'}: ${used.map((u) => u.node.name).slice(0, 4).join(', ')}` : 'Nothing points at this yet. Pick a layer and set its Overlay.'}
      </div>
      {used.map((u) => (
        <Row key={u.node.id}>
          <button className="link-btn" onClick={() => store().set({ activeArtboardId: u.artboard.id, artboardSelected: false, selection: [u.node.id] })}>
            {u.node.name} on {u.artboard.name}
          </button>
        </Row>
      ))}
    </Section>
  );
}

function flatLayers(list: SceneNode[]): SceneNode[] {
  const out: SceneNode[] = [];
  const visit = (l: SceneNode[]) => {
    for (const n of l) {
      out.push(n);
      if ('children' in n && Array.isArray(n.children)) visit(n.children as SceneNode[]);
    }
  };
  visit(list);
  return out;
}

function findNode(list: SceneNode[], id: string): SceneNode | null {
  for (const n of list) {
    if (n.id === id) return n;
    if ('children' in n && Array.isArray(n.children)) {
      const hit = findNode(n.children as SceneNode[], id);
      if (hit) return hit;
    }
  }
  return null;
}
