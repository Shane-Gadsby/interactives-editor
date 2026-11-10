import { useEditor } from '../store/store';
import { applyUniSQLookCommand } from '../lib/branded/unisq-look';
import { lookBlocked } from '../lib/branded/unisq-look-check';
import { COLOURWAYS } from '../lib/branded/looks';

/**
 * "Apply the UniSQ look…": a colourway to choose, for a project that did not start from a branded starter pack. Pick one and it adds
 * the theme and brand colours, a page master with the logo and accent bar, and sets the pages to use it (one undo step). Nothing is
 * shown for a project that already has the look from a starter.
 */
export function UniSQLookPick({ className = 'themes-way-pick' }: { className?: string }) {
  const project = useEditor((s) => s.project);
  const why = lookBlocked(project);
  if (project.brandLook) return null;
  return (
    <select
      className={className}
      value=""
      disabled={!!why}
      aria-label="Apply the UniSQ look"
      title={why ?? 'Gives the pages the UniSQ frame (a page master with the logo and an accent bar) and opens the project in a UniSQ colourway. Your own layers are not moved or recoloured. One undo takes it back'}
      onChange={(e) => {
        const id = e.target.value;
        if (id) applyUniSQLookCommand(id);
      }}
    >
      <option value="">Apply the UniSQ look…</option>
      {COLOURWAYS.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name}: {w.description}
        </option>
      ))}
    </select>
  );
}
