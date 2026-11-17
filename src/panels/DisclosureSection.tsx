import { isContainer, type ContainerNode, type Project, type SceneNode } from 'interactives-player';
import { store } from '../store/store';
import { CheckField, Row, Section, SelectField } from '../components/ui';
import { SectionBlurb } from '../components/SectionBlurb';

/**
 * A frame's **Accordion**: its children become sections, and opening one shows its panel. Each section holds its own header
 * (its first layer) and panel (the rest), unless a separate panels container is picked, which makes it a set of tabs.
 */
export function DisclosureSection({ node, project }: { node: SceneNode; project: Project }) {
  if (!isContainer(node)) return null;
  const d = (node as ContainerNode).disclosure ?? null;
  const set = (patch: Partial<NonNullable<ContainerNode['disclosure']>> | null) =>
    store().update((draft) => {
      const n = findNode(draft.artboards.flatMap((a) => a.children), node.id) as ContainerNode | null;
      if (!n) return;
      if (!patch) delete n.disclosure;
      else n.disclosure = { ...(n.disclosure ?? { open: 'one' }), ...patch };
    });

  const numbers = project.variables.filter((v) => v.type === 'number' && !v.live);
  const lists = project.variables.filter((v) => v.type === 'list' && !v.live);
  const wanted = d?.open === 'many' ? lists : numbers;
  const containers = (node as ContainerNode).children.filter(isContainer);

  return (
    <Section id="disclosure" help="accordions" title="Accordion" defaultOpen={!!d}>
      <SectionBlurb text="Each layer in here becomes a section: its first layer is the header, the rest is the panel." name="Accordion" help={['accordions']} />
      <CheckField
        label="Make this an accordion"
        title="Clicking a section's header opens it. Without this the layers are just layers"
        value={!!d}
        onChange={(v) => set(v ? { open: 'one' } : null)}
      />
      {d && (
        <>
          <SelectField
            label="Open"
            title="One at a time is the usual accordion, and what tabs need. Any number lets several stand open"
            value={d.open}
            options={[
              { value: 'one', label: 'One at a time' },
              { value: 'many', label: 'Any number' },
            ]}
            //the variable holds a number for one and a list for many, so it goes when the kind changes
            onChange={(v) => set({ open: v, variable: undefined, toggle: v === 'one' ? d.toggle : undefined })}
          />
          <SelectField
            label="Keeps what's open in"
            title={d.open === 'many' ? 'A list variable holding the open sections by position' : 'A number variable holding the open section, from 0. Without one nothing opens when clicked'}
            value={d.variable ?? ''}
            options={[{ value: '', label: wanted.length ? 'Choose a variable…' : `Make a ${d.open === 'many' ? 'list' : 'number'} variable first` }, ...wanted.map((v) => ({ value: v.id, label: v.label || v.name }))]}
            onChange={(v) => set({ variable: v || undefined })}
          />
          {d.open === 'one' && (
            <CheckField
              label="Clicking the open one closes it"
              title="Lets the accordion close fully, with nothing open. Tabs usually leave this off"
              value={!!d.toggle}
              onChange={(v) => set({ toggle: v || undefined })}
            />
          )}
          <SelectField
            label="Panels"
            title="Tabs: a layer in here whose own layers are the panels, matched to the headers in order. Empty: each section holds its own panel"
            value={d.panels ?? ''}
            options={[{ value: '', label: 'Inside each section' }, ...containers.map((c) => ({ value: c.id, label: c.name }))]}
            onChange={(v) => set({ panels: v || undefined })}
          />
          {!d.variable && <div className="hint">Pick a variable, or the sections never change.</div>}
          <Row k="Sections" words={['accordion sections', 'tabs', 'panels']}>
            <span className="muted small">
              {(node as ContainerNode).children.length} section{(node as ContainerNode).children.length === 1 ? '' : 's'}
              {d.panels ? ' (headers)' : ''}
            </span>
          </Row>
        </>
      )}
    </Section>
  );
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
