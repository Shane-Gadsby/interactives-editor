/** A round badge with a tick, drawn in the editor's gold. `earned` false draws it as an empty outline (not yet won). */
export function Badge({ earned = true, size = 28, label }: { earned?: boolean; size?: number; label?: string }) {
  return (
    <svg className={`tut-badge${earned ? ' earned' : ''}`} viewBox="0 0 32 32" width={size} height={size} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path className="tut-badge-ribbon" d="M10 20l-3 9 6-3 3 4 3-4 6 3-3-9" />
      <circle className="tut-badge-disc" cx="16" cy="14" r="11" />
      <path className="tut-badge-tick" d="M10.5 14.5l4 4 7-8" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
