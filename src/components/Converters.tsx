import type { Converter, Variable } from 'interactives-player';
import { IconButton, NumberField, Row, SelectField, TextField, CheckField } from './ui';
import { ExprField } from './ExprField';

const CONVERTER_LOCALS = ['value'];
import { Icons } from './icons';

type MapValue = string | number | boolean;

const KINDS: { value: Converter['type']; label: string }[] = [
  { value: 'format', label: 'Number to text' },
  { value: 'round', label: 'Round' },
  { value: 'invert', label: 'Invert (not)' },
  { value: 'range', label: 'Remap range' },
  { value: 'map', label: 'Look up (choice / value to value)' },
  { value: 'toNumber', label: 'To number' },
  { value: 'toText', label: 'To text' },
  { value: 'toBoolean', label: 'To true/false' },
  { value: 'duration', label: 'Seconds to m:ss' },
  { value: 'expr', label: 'Expression' },
];

export function newConverter(type: Converter['type'], options: string[] = []): Converter {
  switch (type) {
    case 'format':
      return { type, decimals: 0 };
    case 'round':
      return { type, decimals: 0, mode: 'round' };
    case 'range':
      return { type, inMin: 0, inMax: 1, outMin: 0, outMax: 100, clamp: true };
    case 'map':
      return { type, map: Object.fromEntries(options.map((o) => [o, ''])) };
    case 'expr':
      return { type, expr: 'value' };
    default:
      return { type } as Converter;
  }
}

/** Text typed into a lookup's value box: numbers and true/false keep their type, anything else is text. */
export function readMapValue(text: string): MapValue {
  const t = text.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t !== '' && Number.isFinite(Number(t))) return Number(t);
  return text;
}

/** The choice variable a binding expression is exactly, so a lookup can list its options. */
export function enumOf(expr: string, variables: Variable[]): Variable | undefined {
  const name = expr.trim();
  return variables.find((v) => v.type === 'enum' && v.name === name);
}

function Number1({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return <NumberField label={label} value={value} onChange={onChange} />;
}

function ConverterRow({ c, expr, variables, onChange, onRemove }: { c: Converter; expr: string; variables: Variable[]; onChange: (c: Converter) => void; onRemove: () => void }) {
  const enumVar = enumOf(expr, variables);
  const switchKind = (type: Converter['type']) => onChange(newConverter(type, type === 'map' ? enumVar?.options : undefined));
  return (
    <div className="converter-row">
      <Row>
        <SelectField<Converter['type']> value={c.type} options={KINDS} onChange={switchKind} title="Changes the value before it is set on the layer" />
        <IconButton icon={<Icons.trash />} title="Remove this converter" onClick={onRemove} />
      </Row>
      {c.type === 'format' && (
        <>
          <Row>
            <Number1 label="Decimals" value={c.decimals ?? 0} onChange={(v) => onChange({ ...c, decimals: Math.max(0, Math.round(v)) })} />
            <Number1 label="Pad to" value={c.pad ?? 0} onChange={(v) => onChange({ ...c, pad: Math.max(0, Math.round(v)) || undefined })} />
          </Row>
          <Row>
            <TextField label="Before" value={c.prefix ?? ''} commitOnBlur onChange={(v) => onChange({ ...c, prefix: v || undefined })} />
            <TextField label="After" value={c.suffix ?? ''} commitOnBlur onChange={(v) => onChange({ ...c, suffix: v || undefined })} />
          </Row>
          <CheckField label="Thousands separators" value={!!c.thousands} onChange={(v) => onChange({ ...c, thousands: v || undefined })} />
        </>
      )}
      {c.type === 'round' && (
        <Row>
          <Number1 label="Decimals" value={c.decimals ?? 0} onChange={(v) => onChange({ ...c, decimals: Math.max(0, Math.round(v)) })} />
          <SelectField value={c.mode ?? 'round'} options={['round', 'floor', 'ceil'] as const} onChange={(mode) => onChange({ ...c, mode })} />
        </Row>
      )}
      {c.type === 'range' && (
        <>
          <Row>
            <Number1 label="In from" value={c.inMin} onChange={(v) => onChange({ ...c, inMin: v })} />
            <Number1 label="to" value={c.inMax} onChange={(v) => onChange({ ...c, inMax: v })} />
          </Row>
          <Row>
            <Number1 label="Out from" value={c.outMin} onChange={(v) => onChange({ ...c, outMin: v })} />
            <Number1 label="to" value={c.outMax} onChange={(v) => onChange({ ...c, outMax: v })} />
          </Row>
          <CheckField label="Keep inside the range" value={!!c.clamp} onChange={(v) => onChange({ ...c, clamp: v })} />
        </>
      )}
      {c.type === 'map' && <MapEditor c={c} enumVar={enumVar} onChange={onChange} />}
      {c.type === 'expr' && <ExprField value={c.expr} locals={CONVERTER_LOCALS} commitOnBlur placeholder="value * 2" title="An expression; `value` is the incoming value" onChange={(v) => onChange({ ...c, expr: v })} />}
    </div>
  );
}

function MapEditor({ c, enumVar, onChange }: { c: Extract<Converter, { type: 'map' }>; enumVar?: Variable; onChange: (c: Converter) => void }) {
  const show = (v: MapValue | undefined | null) => (v === undefined || v === null ? '' : String(v));
  if (enumVar) {
    return (
      <>
        {(enumVar.options ?? []).map((o) => (
          <Row key={o}>
            <span className="mono small binding-prop" title={o}>
              {o}
            </span>
            <TextField value={show(c.map[o])} commitOnBlur placeholder="value" onChange={(t) => onChange({ ...c, map: { ...c.map, [o]: readMapValue(t) } })} />
          </Row>
        ))}
        <TextField label="Otherwise" value={show(c.fallback)} commitOnBlur placeholder="keep the value" onChange={(t) => onChange({ ...c, fallback: t === '' ? undefined : readMapValue(t) })} />
      </>
    );
  }
  const text = Object.entries(c.map)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  return (
    <>
      <TextField
        value={text}
        multiline
        mono
        commitOnBlur
        rows={3}
        placeholder={'one per line\ntrue: Open\nfalse: Closed'}
        title="One lookup per line: the incoming value, a colon, what it becomes"
        onChange={(t) => {
          const map: Record<string, MapValue> = {};
          for (const line of t.split('\n')) {
            const at = line.indexOf(':');
            if (at > 0) map[line.slice(0, at).trim()] = readMapValue(line.slice(at + 1).replace(/^ /, ''));
          }
          onChange({ ...c, map });
        }}
      />
      <TextField label="Otherwise" value={show(c.fallback)} commitOnBlur placeholder="keep the value" onChange={(t) => onChange({ ...c, fallback: t === '' ? undefined : readMapValue(t) })} />
    </>
  );
}

/** The converters of one binding: each one's settings, and a menu to add another. */
export function ConvertersEditor({ list, expr, variables, onChange }: { list: Converter[]; expr: string; variables: Variable[]; onChange: (next: Converter[]) => void }) {
  const enumVar = enumOf(expr, variables);
  return (
    <div className="converters">
      {list.map((c, i) => (
        <ConverterRow key={i} c={c} expr={expr} variables={variables} onChange={(n) => onChange(list.map((x, j) => (j === i ? n : x)))} onRemove={() => onChange(list.filter((_, j) => j !== i))} />
      ))}
      <SelectField<string>
        value=""
        title="Change the value before it is set: format a number, invert, remap a range, look up a choice…"
        options={[{ value: '', label: list.length ? '+ Then convert…' : '+ Convert…' }, ...KINDS]}
        onChange={(t) => t && onChange([...list, newConverter(t as Converter['type'], t === 'map' ? enumVar?.options : undefined)])}
      />
    </div>
  );
}
