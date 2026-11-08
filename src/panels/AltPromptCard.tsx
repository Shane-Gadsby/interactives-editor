import { useEffect, useState } from 'react';
import type { SceneNode } from 'interactives-player';
import { doneAsking, needsDescription, useWaiting } from '../lib/alt-prompt';
import { useSetter } from './Inspector';

/**
 * Shown at the top of a picture's or video's settings right after it was added (and until it is answered): "What is this a
 * picture of?". The answer is the layer's text alternative. Decorative and Skip both stop the asking for this layer, and
 * nothing here stops the person doing anything else.
 */
export function AltPromptCard({ node, projectId }: { node: SceneNode; projectId: string }) {
  const waiting = useWaiting(projectId);
  const set = useSetter([node.id]);
  const [text, setText] = useState('');
  const hint = waiting[node.id];
  // a different layer is a different question
  useEffect(() => setText(''), [node.id]);
  if (hint === undefined) return null;
  // described some other way (the Accessibility section, a fix): nothing left to ask
  if (!needsDescription(node)) return <Cleared id={node.id} projectId={projectId} />;
  const what = node.type === 'video' ? 'video' : 'picture';
  const save = () => {
    const v = text.trim();
    if (!v) return;
    set({ ariaLabel: v });
    doneAsking(projectId, [node.id]);
  };
  const skip = () => doneAsking(projectId, [node.id]);
  return (
    <div className="alt-prompt" role="group" aria-label={`Describe this ${what}`}>
      <label className="alt-prompt-q" htmlFor={`alt-${node.id}`}>
        What is this a {what} of?
      </label>
      <p className="hint">Screen readers read this out in place of the {what}. A few words is enough.</p>
      <input
        id={`alt-${node.id}`}
        className="alt-prompt-input"
        type="text"
        value={text}
        placeholder={hint ? `For example: ${hint}` : `For example: a teacher at a whiteboard`}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') skip();
        }}
      />
      <div className="alt-prompt-actions">
        <button type="button" className="alt-prompt-save" disabled={!text.trim()} onClick={save} title="Use this as the text alternative (Enter)">
          Save
        </button>
        <button
          type="button"
          onClick={() => {
            set({ decorative: true });
            doneAsking(projectId, [node.id]);
          }}
          title={`It only decorates the page, so a screen reader skips it. You can change this under Accessibility, Role`}
        >
          Decorative
        </button>
        <button type="button" onClick={skip} title="Ask me no more about this one. The Accessibility checker still lists it until it has a description (Escape)">
          Skip
        </button>
      </div>
    </div>
  );
}

/** Takes a layer off the list once it was described elsewhere, after rendering (not during). */
function Cleared({ id, projectId }: { id: string; projectId: string }) {
  useEffect(() => doneAsking(projectId, [id]), [id, projectId]);
  return null;
}
