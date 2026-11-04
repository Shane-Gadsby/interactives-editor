import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MutableRefObject, type ReactNode, type RefObject } from 'react';
import { formatColor, parseColor, type RunStyle, type TextNode } from 'interactives-player';
import { store, useEditor } from '../store/store';
import { PaletteButton } from '../components/ui';
import { Icons } from '../components/icons';
import { FontPicker } from '../components/FontPicker';
import { ensureGoogleFont } from '../lib/font-catalog';
import { setSelectionOffsets } from '../lib/rich-text-dom';
import { actionPatch, linkPatch, shortcutAction, targetRange, toolbarState, unlinkPatch, type TextAction, type TextSel, type Tri } from '../lib/text-toolbar';

/** Where the editing box is on the canvas, in the canvas element's own pixels. */
export interface ToolbarBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

const GAP = 8;

const pressed = (t: Tri) => (t === 'mixed' ? 'mixed' : t === 'on');
const hexOf = (c: string) => {
  const p = parseColor(c);
  return p ? formatColor([p[0], p[1], p[2], 1]) : '#000000';
};

/**
 * The floating toolbar over a text layer being edited on the canvas: bold, italic, underline, strikethrough,
 * colour, size, font, link and clear formatting, for the selected characters (or the word the caret is in).
 * The buttons read the selection from the store, so they show "mixed" when it varies, and write runs through
 * `styleTextRange` like the shortcuts do. Mouse presses on its buttons keep the focus (and the selection) in
 * the text; the keyboard gets in with Tab (or Alt+F10) and out with Escape or Shift+Tab, and a command done
 * from the keyboard puts the focus back in the text.
 */
/** What the text editor can ask of the toolbar (the shortcuts go through it, so they and the buttons do the same). */
export interface ToolbarCommands {
  apply: (action: TextAction, at?: TextSel | null) => void;
  /** Move the focus to the first control (Alt+F10). */
  enter: () => void;
}

export function TextToolbar({ node, editor, box, bounds, commands }: { node: TextNode; editor: RefObject<HTMLElement | null>; box: ToolbarBox; bounds: { width: number; height: number }; commands: MutableRefObject<ToolbarCommands | null> }) {
  const id = node.id;
  const sel = useEditor((s) => (s.textSelection && s.textSelection.id === id ? s.textSelection : null));
  const project = useEditor((s) => s.project);
  const st = toolbarState(node, sel);
  const root = useRef<HTMLDivElement>(null);
  const sizeInput = useRef<HTMLInputElement>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const [size, setSize] = useState<string | null>(null);
  const [link, setLink] = useState<{ range: TextSel; url: string; newTab: boolean; had: boolean; error: string } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Above the text box, or below it when there is no room, and always inside the canvas
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const left = clamp(box.left + box.width / 2 - w / 2, 4, Math.max(4, bounds.width - w - 4));
    const above = box.top - h - GAP;
    const below = box.top + box.height + GAP;
    let top = above;
    if (above < 4) top = below + h <= bounds.height - 4 ? below : clamp(above, 4, Math.max(4, bounds.height - h - 4));
    setPos((p) => (p && p.left === left && p.top === top ? p : { left, top }));
  });

  // Back to the text, with the characters selected as they were
  const refocus = (to: TextSel | null = store().get().textSelection) => {
    const el = editor.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    if (to) setSelectionOffsets(el, to.start, to.end);
  };

  const apply = (action: TextAction, at: TextSel | null = sel) => {
    const range = targetRange(node, at, action);
    if (!range) return;
    if (action === 'link') {
      const existing = toolbarState(node, range).link;
      const one = existing && existing !== 'mixed' ? existing : null;
      setLink({ range, url: one?.url ?? '', newTab: one ? one.target === '_blank' : true, had: !!one, error: '' });
      return;
    }
    store().styleTextRange(id, range.start, range.end, actionPatch(node, range, action));
    refocus(at);
  };
  commands.current = { apply, enter: () => root.current?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)')?.focus() };

  const patch = (p: Partial<RunStyle>, coalesce?: string) => {
    const range = targetRange(node, sel);
    if (range) store().styleTextRange(id, range.start, range.end, p, coalesce);
  };

  useEffect(() => {
    if (link) linkInput.current?.focus();
  }, [!!link]);

  // Size: applied when the box is left or Enter is pressed, and when the arrows or the list step it
  useEffect(() => {
    const el = sizeInput.current;
    if (!el) return;
    const done = () => {
      const v = Number(el.value);
      if (el.value.trim() && Number.isFinite(v) && v >= 1) patch({ fontSize: Math.round(v * 100) / 100 });
      setSize(null);
    };
    el.addEventListener('change', done);
    return () => el.removeEventListener('change', done);
  });

  const submitLink = () => {
    if (!link) return;
    const r = linkPatch(link.url, link.newTab);
    if ('error' in r) return setLink({ ...link, error: r.error });
    store().styleTextRange(id, link.range.start, link.range.end, r.patch);
    setLink(null);
    refocus(sel);
  };
  const removeLink = () => {
    if (!link) return;
    store().styleTextRange(id, link.range.start, link.range.end, unlinkPatch());
    setLink(null);
    refocus(sel);
  };

  const buttons = () => Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? []);
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    // nothing typed in here is a canvas shortcut
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      if (link) setLink(null);
      refocus();
      return;
    }
    const act = shortcutAction(e);
    if (act) {
      e.preventDefault();
      apply(act);
      return;
    }
    // arrows walk along the buttons
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && (e.target as HTMLElement).tagName === 'BUTTON') {
      const all = buttons();
      const i = all.indexOf(e.target as HTMLElement);
      const next = all[(i + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length];
      if (next && i >= 0) {
        e.preventDefault();
        next.focus();
      }
    }
  };

  const disabled = !st.range;
  const toggle = (action: Exclude<TextAction, 'link' | 'clear'>, label: string, tip: string, glyph: ReactNode, state: Tri) => (
    <button type="button" className={`tt-btn${state === 'on' ? ' on' : state === 'mixed' ? ' mixed' : ''}`} aria-pressed={pressed(state)} aria-label={label} title={tip} disabled={disabled} onClick={() => apply(action)}>
      {glyph}
    </button>
  );

  return (
    <div
      ref={root}
      className="text-toolbar"
      role="toolbar"
      aria-label="Text formatting"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => {
        // pressing a button must not take the focus off the text (and with it the selection)
        const t = e.target as HTMLElement;
        if (!t.closest('input, select, textarea, label')) e.preventDefault();
      }}
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        // Focus going anywhere but the text, this toolbar, its palette or the inspector means editing is over
        const to = e.relatedTarget as HTMLElement | null;
        if (!to || to.closest?.('.text-toolbar, .palette-pop, .inspector') || to === editor.current) return;
        store().commit();
        store().set({ editingTextId: null, textSelection: null });
      }}
    >
      <div className="tt-row">
        {toggle('bold', 'Bold', 'Bold (Ctrl/Cmd+B)', <b>B</b>, st.bold)}
        {toggle('italic', 'Italic', 'Italic (Ctrl/Cmd+I)', <i>I</i>, st.italic)}
        {toggle('underline', 'Underline', 'Underline (Ctrl/Cmd+U)', <u>U</u>, st.underline)}
        {toggle('strike', 'Strikethrough', 'Strikethrough (Ctrl/Cmd+Shift+X)', <s>S</s>, st.strike)}
        <span className="tt-sep" aria-hidden="true" />
        <span className="tt-color" title={st.color === 'mixed' ? 'Text colour (the selection has several)' : 'Text colour'}>
          <label className={`tt-swatch${st.color === 'mixed' ? ' mixed' : ''}`} aria-label={st.color === 'mixed' ? 'Text colour, mixed' : `Text colour ${st.color}`}>
            <span className="tt-a" aria-hidden="true">A</span>
            <span className="tt-bar" style={st.color === 'mixed' ? undefined : { background: st.color }} aria-hidden="true" />
            <input
              type="color"
              disabled={disabled}
              value={st.color === 'mixed' ? '#000000' : hexOf(st.color)}
              onChange={(e) => patch({ color: e.target.value }, `tt-color-${id}`)}
              onBlur={() => store().commit()}
            />
          </label>
          <PaletteButton value={st.color === 'mixed' ? '#000000' : st.color} onPick={(v) => (patch({ color: v }), store().commit(), refocus(sel))} />
        </span>
        <span className="tt-sep" aria-hidden="true" />
        <input
          ref={sizeInput}
          className="tt-size"
          type="number"
          min={1}
          step={1}
          aria-label="Font size"
          title="Font size in pixels (type a number and press Enter, or use the arrow keys)"
          placeholder={st.fontSize === 'mixed' ? 'mixed' : undefined}
          disabled={disabled}
          value={size ?? (st.fontSize === 'mixed' ? '' : String(Math.round(st.fontSize * 100) / 100))}
          onChange={(e) => setSize(e.target.value)}
          onBlur={() => setSize(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              sizeInput.current?.dispatchEvent(new Event('change'));
              refocus(sel);
            }
          }}
        />
        <FontPicker
          className="tt-font"
          ariaLabel="Font"
          title="Font: search every Google font (a new one is added to the project), or pick a project or system font"
          disabled={disabled}
          value={st.fontFamily === 'mixed' ? '' : st.fontFamily}
          mixed={st.fontFamily === 'mixed'}
          project={project.fonts}
          onPick={(o) => {
            //a Google font the project doesn't load yet gets added, in the same undo step
            if (o.google) store().update((d) => void ensureGoogleFont(d.fonts, o.family, [node.fontWeight]), { coalesce: `tt-font-${id}` });
            patch({ fontFamily: o.stack }, `tt-font-${id}`);
            refocus(sel);
          }}
        />
        <span className="tt-sep" aria-hidden="true" />
        <button type="button" className={`tt-btn${st.link && st.link !== 'mixed' ? ' on' : st.link === 'mixed' ? ' mixed' : ''}`} aria-pressed={st.link === 'mixed' ? 'mixed' : !!st.link} aria-label="Link" title="Add or edit a link (Ctrl/Cmd+K)" disabled={disabled} onClick={() => apply('link')}>
          <Icons.link />
        </button>
        <button type="button" className="tt-btn" aria-label="Clear formatting" title="Clear formatting: remove the styling of the selection and go back to the layer's own (Ctrl/Cmd+\)" disabled={disabled || !st.styled} onClick={() => apply('clear')}>
          <span aria-hidden="true">T<sub>x</sub></span>
        </button>
      </div>
      {link && (
        <form
          className="tt-link"
          aria-label="Link"
          onSubmit={(e) => {
            e.preventDefault();
            submitLink();
          }}
        >
          <input ref={linkInput} type="text" aria-label="Link address" placeholder="https://… or mailto: or tel:" value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value, error: '' })} spellCheck={false} />
          <label className="tt-newtab">
            <input type="checkbox" checked={link.newTab} onChange={(e) => setLink({ ...link, newTab: e.target.checked })} /> New tab
          </label>
          <button type="submit" className="btn primary">
            {link.had ? 'Update' : 'Add link'}
          </button>
          {link.had && (
            <button type="button" className="btn" onClick={removeLink}>
              Remove
            </button>
          )}
          {link.error && (
            <div className="tt-error" role="alert">
              {link.error}
            </div>
          )}
        </form>
      )}
    </div>
  );
}
