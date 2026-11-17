import { useState } from 'react';
import type { Artboard, ComponentProp, Project, Variable } from 'interactives-player';
import { store } from '../store/store';
import { IconButton, Row, Section, SelectField, TextField } from '../components/ui';
import { Icons } from '../components/icons';
import { SectionBlurb } from '../components/SectionBlurb';

/**
 * What a page takes when it's used as a component. The page's variables are already its settings; this says which of them an
 * instance may set, in what order, and what to call them there. Every instance of the page then shows those as ordinary fields
 * instead of a box of JSON.
 */
export function ComponentPropsSection({ ab, project }: { ab: Artboard; project: Project }) {
  const [adding, setAdding] = useState('');
  const props = ab.props ?? [];
  const used = new Set(props.map((p) => p.variable));
  const spare = project.variables.filter((v) => !used.has(v.id) && !v.live);
  //A page nobody uses as a component, with nothing declared, has nothing to say here yet
  const usedAsComponent = project.artboards.some((a) => a.id !== ab.id && hasInstanceOf(a, ab.id));
  //An overlay takes things too: what each layer hands it as it opens
  if (ab.library || (!props.length && !usedAsComponent && !ab.overlay)) return null;

  const setProps = (f: (list: ComponentProp[]) => void, coalesce?: string) =>
    store().update(
      (d) => {
        const page = d.artboards.find((a) => a.id === ab.id);
        if (!page) return;
        page.props ??= [];
        f(page.props);
        if (!page.props.length) delete page.props;
      },
      coalesce ? { coalesce } : undefined,
    );

  return (
    <Section id="component-props" help="instances#what-the-component-takes" title="What it takes" defaultOpen={props.length > 0}>
      <SectionBlurb
        text={ab.overlay ? 'The variables a layer may set as it opens this. Each becomes a field on that layer.' : 'The variables an instance of this page may set. Each becomes a field there, instead of JSON.'}
        name="What it takes"
        help={['instances']}
      />
      {props.map((p, i) => {
        const v = project.variables.find((x) => x.id === p.variable);
        return (
          <div className="prop-row" key={p.variable}>
            <Row>
              <TextField
                label={v ? `${kindOf(v)}` : 'Missing variable'}
                title={v ? `Sets ${v.name} inside the component. Leave the name empty to use "${v.label || v.name}"` : 'This variable has been deleted. Take the row out'}
                value={p.label ?? ''}
                placeholder={v ? v.label || v.name : ''}
                onChange={(val) => setProps((list) => (val.trim() ? (list[i].label = val) : delete list[i].label), `prop-label-${ab.id}-${p.variable}`)}
              />
              <IconButton icon={<Icons.chevronUp />} title="Move up" disabled={i === 0} onClick={() => setProps((list) => void list.splice(i - 1, 0, list.splice(i, 1)[0]))} />
              <IconButton icon={<Icons.chevronDown />} title="Move down" disabled={i === props.length - 1} onClick={() => setProps((list) => void list.splice(i + 1, 0, list.splice(i, 1)[0]))} />
              <IconButton icon={<Icons.trash />} title="Take this setting off the component" onClick={() => setProps((list) => void list.splice(i, 1))} />
            </Row>
            <TextField
              label="Hint"
              title="A line under the field on the instance, saying what it does"
              value={p.help ?? ''}
              onChange={(val) => setProps((list) => (val.trim() ? (list[i].help = val) : delete list[i].help), `prop-help-${ab.id}-${p.variable}`)}
            />
          </div>
        );
      })}
      <SelectField
        label="Add"
        title="A variable of this project that an instance of this page may set"
        value={adding}
        options={[{ value: '', label: spare.length ? 'Choose a variable…' : 'Every variable is already on the list' }, ...spare.map((v) => ({ value: v.id, label: `${v.label || v.name} (${kindOf(v)})` }))]}
        onChange={(id) => {
          if (!id) return;
          setAdding('');
          setProps((list) => void list.push({ variable: id }));
        }}
      />
    </Section>
  );
}

/** What kind of field this variable gives an instance, in the words the Inspector uses elsewhere. */
function kindOf(v: Variable): string {
  if (v.type === 'enum' || (v.options && v.options.length)) return 'Choice';
  if (v.type === 'boolean') return 'Yes or no';
  if (v.type === 'number') return 'Number';
  if (v.type === 'color') return 'Colour';
  if (v.type === 'list') return 'List';
  return 'Text';
}

function hasInstanceOf(ab: Artboard, id: string): boolean {
  const walk = (list: Artboard['children']): boolean =>
    list.some((n) => (n.type === 'instance' && n.artboardId === id) || ('children' in n && Array.isArray(n.children) && walk(n.children as Artboard['children'])));
  return walk(ab.children);
}
