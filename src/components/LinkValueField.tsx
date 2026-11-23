import { useEffect, useState } from 'react';

/** One link value to open a project with (Preview's bar, Share): a list when the project names its choices, otherwise text that applies on Enter or on leaving it. */
export function LinkValueField({ name, value, choices, onChange, title, label = 'in the preview' }: { name: string; value: string; choices?: string[]; onChange: (v: string) => void; title?: string; label?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  title ??= `Play it as if the link had &${name}=… on it (link.${name}). Changing it starts the preview again. The project's own sample stays as it is`;
  if (choices?.length)
    return (
      <select className="link-value-select" value={value} title={title} aria-label={`link.${name} ${label}`} onChange={(e) => onChange(e.target.value)}>
        <option value="">{name}: none</option>
        {value && !choices.includes(value) && <option value={value}>{name}: {value}</option>}
        {choices.map((c) => (
          <option key={c} value={c}>
            {name}: {c}
          </option>
        ))}
      </select>
    );
  const commit = () => text !== value && onChange(text);
  return (
    <label className="link-value-text" title={title}>
      <span className="mono small">{name}</span>
      <input value={text} size={Math.max(4, Math.min(14, text.length + 1))} placeholder="none" aria-label={`link.${name} ${label}`} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
    </label>
  );
}
