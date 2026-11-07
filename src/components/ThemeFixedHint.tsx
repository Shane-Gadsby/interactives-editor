import { useMemo } from 'react';
import { useEditor } from '../store/store';
import { nothingFollowsTheme } from '../lib/link-colours';
import { linkColoursCommand } from '../lib/link-colours-action';

/**
 * The line shown when a theme is switched on a project where no colour follows a token: the switch can only change colours
 * that do, so without this it just looks broken. `onCanvas` looks only at the artboards on the canvas; otherwise all of them.
 */
export function ThemeFixedHint({ onCanvas = false, onClose }: { onCanvas?: boolean; onClose?: () => void }) {
  const project = useEditor((s) => s.project);
  const nothing = useMemo(() => nothingFollowsTheme(project, onCanvas ? project.artboards.filter((a) => !a.canvasHidden).map((a) => a.id) : undefined), [project, onCanvas]);
  if (!nothing) return null;
  return (
    <div className="theme-fixed-hint" role="status">
      <span>Nothing here follows the theme: these colours are fixed.</span>
      <button type="button" className="btn small-btn" title="Turn each plain colour that is the same as a token's colour into that token, so it changes with the theme. You see what it will do first, and it is one undo" onClick={() => void linkColoursCommand()}>
        Link colours to tokens
      </button>
      {onClose && (
        <button type="button" className="theme-fixed-close" aria-label="Dismiss" title="Dismiss" onClick={onClose}>
          ×
        </button>
      )}
    </div>
  );
}
