import type { Examine, SceneNode } from 'interactives-player';
import { store } from '../store/store';
import { CheckField, IconButton, NumberField, Section, TextField } from '../components/ui';
import { Icons } from '../components/icons';

/** A layer to look at in a room: its words in the room box, and coins or a thing it gives once. */
export function ExamineSection({ node }: { node: SceneNode }) {
  const ex = node.examine;
  const on = !!ex;
  const set = (patch: Partial<Examine>, coalesce?: string) => {
    const next: Record<string, unknown> = { ...(ex ?? {}), ...patch };
    for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === '' || next[k] === 0) delete next[k];
    store().setProps([node.id], { examine: next as Examine }, coalesce ?? `examine-${Object.keys(patch).join(',')}-${node.id}`);
  };
  return (
    <Section
      help="story-rooms"
      title="Look at"
      defaultOpen={on}
      actions={
        on ? (
          <IconButton icon={<Icons.trash />} title="This layer stops being something to look at" onClick={() => store().setProps([node.id], { examine: undefined })} />
        ) : (
          <IconButton icon={<Icons.plus />} title="Make this something to look at in a room: a click shows its words in the room box" onClick={() => store().setProps([node.id], { examine: { text: `A ${node.name.toLowerCase()}.` } })} />
        )
      }
    >
      {!on && <div className="muted small">The + makes it something to look at, with words and maybe coins or a thing to carry.</div>}
      {on && (
        <>
          <TextField label="Words" title="Said in the room box when it's clicked. One line each; Name: words is someone talking. {values} work" value={ex!.text ?? ''} multiline rows={3} commitOnBlur onChange={(v) => set({ text: v })} />
          <NumberField label="Hint coins" suffix="coins" title="Hint coins it gives, the first time only. The layer disappears once picked up" value={ex!.coins ?? 0} min={0} max={99} onChange={(v) => set({ coins: Math.max(0, Math.round(v)) })} />
          {(!!ex!.coins || !!ex!.item) && <CheckField label="Stays when picked up" title="On for something that holds what it gives (a desk with a key in it). Off, it disappears once picked up, like a coin" value={!!ex!.stays} onChange={(v) => set({ stays: v || undefined })} />}
          <TextField label="Gives" title="A thing to carry it gives, the first time only (story.items). The script can ask has(&quot;Brass key&quot;)" value={ex!.item ?? ''} placeholder="Brass key" commitOnBlur onChange={(v) => set({ item: v.trim() })} />
        </>
      )}
    </Section>
  );
}
