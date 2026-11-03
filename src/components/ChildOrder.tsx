import { applyDrawOrder, type SceneNode } from 'interactives-player';

/** The draw order a container shows right now: its children as the (possibly partial) list arranges them. */
export function effectiveOrder(children: SceneNode[], order: string[] | null | undefined): string[] {
  return (order?.length ? applyDrawOrder(children, order) : children).map((c) => c.id);
}

/** Children back to front, with buttons to move one up or down. Reports the whole new order. */
export function ChildOrder({ children, order, onChange }: { children: SceneNode[]; order: string[] | null | undefined; onChange: (order: string[]) => void }) {
  const ids = effectiveOrder(children, order);
  const name = (id: string) => children.find((c) => c.id === id)?.name ?? id;
  const move = (i: number, by: number) => {
    const next = [...ids];
    const [x] = next.splice(i, 1);
    next.splice(i + by, 0, x);
    onChange(next);
  };
  // Front-most first, like the layers panel
  const rows = ids.map((id, i) => ({ id, i })).reverse();
  return (
    <div className="child-order">
      {rows.map(({ id, i }) => (
        <div key={id} className="child-order-row">
          <span className="child-order-name">{name(id)}</span>
          <button type="button" className="mini" title="Draw it further forward" disabled={i === ids.length - 1} onClick={() => move(i, 1)}>
            ↑
          </button>
          <button type="button" className="mini" title="Draw it further back" disabled={i === 0} onClick={() => move(i, -1)}>
            ↓
          </button>
        </div>
      ))}
    </div>
  );
}
