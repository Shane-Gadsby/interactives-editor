import { usePrefs } from '../lib/prefs';
import { resetAllOrders } from '../lib/reorder';
import { announce } from '../lib/announce';

/** The one control for the order of the Properties sections and the tool bar's groups and tools. */
export function WorkspaceOrder() {
  const p = usePrefs();
  const hasOrder = Object.keys(p.sectionOrder ?? {}).length + Object.keys(p.toolOrder ?? {}).length > 0;
  return (
    <section className="prefs-keys" aria-label="Section and tool order">
      <button
        type="button"
        className="btn"
        disabled={!hasOrder}
        title="You can drag the sections in the Properties panel, and the tool groups and tools, into the order you like (or press Alt and an arrow key on one). This puts every one of them back where the editor puts it. Your order is saved with you, never in the project"
        onClick={() => (resetAllOrders(), announce('Sections and tools are back in their default order'))}
      >
        Reset section and tool order
      </button>
    </section>
  );
}
