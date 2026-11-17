import type { ComponentProp, Project } from 'interactives-player';
import { CheckField, ColorField, NumberField, SelectField, TextField } from '../components/ui';

type Values = Record<string, number | string | boolean>;

/**
 * One field per setting a page says it takes (`Artboard.props`), reading and writing a map of values by variable name. Used
 * by an instance for its inputs and by a layer for what it hands its overlay. The variable's own type picks the field, and its
 * `options` make it a dropdown. Every field starts on the page's own value, so the map only carries what was changed.
 */
export function PropFields({ props, project, values, onChange }: { props: ComponentProp[]; project: Project; values: Values | undefined; onChange: (next: Values | undefined) => void }) {
  if (!props.length) return null;
  const put = (name: string, value: number | string | boolean | undefined) => {
    const next = { ...(values ?? {}) };
    if (value === undefined || value === '') delete next[name];
    else next[name] = value;
    onChange(Object.keys(next).length ? next : undefined);
  };
  return (
    <>
      {props.map((p) => {
        const v = project.variables.find((x) => x.id === p.variable);
        if (!v) return null;
        const label = p.label || v.label || v.name;
        const cur = values?.[v.name];
        const title = p.help || `Sets ${v.name} for this one. Empty leaves the page's own starting value`;
        if (v.options?.length || v.type === 'enum') {
          return (
            <SelectField
              key={p.variable}
              label={label}
              title={title}
              value={cur === undefined ? '' : String(cur)}
              options={[{ value: '', label: "The page's own value" }, ...(v.options ?? []).map((o) => ({ value: o, label: o }))]}
              onChange={(val) => put(v.name, val || undefined)}
            />
          );
        }
        if (v.type === 'boolean') return <CheckField key={p.variable} label={label} title={title} value={cur === undefined ? Boolean(v.initial) : Boolean(cur)} onChange={(val) => put(v.name, val)} />;
        if (v.type === 'number') return <NumberField key={p.variable} label={label} title={title} value={cur === undefined ? Number(v.initial) || 0 : Number(cur)} onChange={(val) => put(v.name, val)} />;
        if (v.type === 'color') return <ColorField key={p.variable} label={label} title={title} tokens value={cur === undefined ? String(v.initial ?? '') : String(cur)} onChange={(val) => put(v.name, val)} />;
        return <TextField key={p.variable} label={label} title={title} value={cur === undefined ? '' : String(cur)} placeholder={String(v.initial ?? '')} onChange={(val) => put(v.name, val || undefined)} />;
      })}
    </>
  );
}
