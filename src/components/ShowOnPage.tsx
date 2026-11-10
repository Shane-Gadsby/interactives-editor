import { Icons } from './icons';
import { endValueDrag, placeValueHere, startValueDrag, type DraggedValue } from '../lib/value-drag';

/**
 * A small handle on a variable or a data field. Drag it onto the page to show the value there (onto a text layer to add it to that
 * text, anywhere else to make a new text); press it to do the same without a mouse, on the selected text layer or as a new text.
 */
export function ShowOnPage({ value, className }: { value: DraggedValue; className?: string }) {
  return (
    <button
      type="button"
      className={`show-on-page${className ? ` ${className}` : ''}`}
      draggable
      aria-label={`Show ${value.label} on the page`}
      title={`Drag onto the page to show ${value.label}: onto a text layer to add it to that text, anywhere else to make a new text. Press it to add it to the selected text layer, or as a new text.`}
      onDragStart={(e) => startValueDrag(e, value)}
      onDragEnd={endValueDrag}
      onClick={() => void placeValueHere(value)}
    >
      <Icons.text width={14} />
    </button>
  );
}
