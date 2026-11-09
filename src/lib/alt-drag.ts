import { useEffect, useState } from 'react';
import { prefs } from './prefs';

/**
 * Alt-drag (Option on a Mac) drags a copy of a layer, group or page instead of moving it. Nothing on screen says so, so
 * the pointer shows a copy cursor while Alt is down, the first few plain drags carry a note about it, and the tooltips
 * on things that can be dragged say it too.
 */

export const ALT_DRAG_TIP = 'Hold Alt (Option on a Mac) while you drag to drag a copy';
export const ALT_DRAG_HINT = 'Alt: drag a copy (Option on a Mac)';

/** How many plain drags show the hint before it goes quiet. */
export const ALT_HINT_TIMES = 3;
const KEY = 'ix-alt-drag-hint';

const read = (): number => {
  try {
    return Number(localStorage.getItem(KEY)) || 0;
  } catch {
    return 0;
  }
};

/** Whether a drag that has just started without Alt should say what Alt does (counts the showing). */
export function altHintDue(): boolean {
  //Preferences > Always show the Alt-drag hint: every plain drag says it, and the count is left alone
  if (prefs().altDragHintAlways) return true;
  const n = read();
  if (n >= ALT_HINT_TIMES) return false;
  try {
    localStorage.setItem(KEY, String(n + 1));
  } catch {
    // storage unavailable: it shows every time, which is fine
  }
  return true;
}

/** Whether Alt is held down right now (also false when the window loses focus, so it can't stick). */
export function useAltHeld(): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const on = (e: KeyboardEvent) => setHeld(e.altKey);
    const off = () => setHeld(false);
    window.addEventListener('keydown', on);
    window.addEventListener('keyup', on);
    window.addEventListener('blur', off);
    return () => {
      window.removeEventListener('keydown', on);
      window.removeEventListener('keyup', on);
      window.removeEventListener('blur', off);
    };
  }, []);
  return held;
}
