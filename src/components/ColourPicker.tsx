import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { formatColor, parseColor } from 'interactives-player';
import { Icons } from './icons';
import { colourOf, hsvToRgb, readColour, type Hsv } from '../lib/colour-pick';

interface EyeDropperLike {
  open(): Promise<{ sRGBHex: string }>;
}

/**
 * The colour picker that opens from a swatch: the square (saturation across, brightness up), the hue strip, and the
 * alpha strip, drawn over grey and white squares so see-through reads as see-through. The browser's own picker only
 * knows solid colours, which is why this one exists; it is still a click away here, and so is the eyedropper.
 *
 * Every change is sent as it happens (`onChange`), and `onCommit` says a drag or a run of key presses has finished, so
 * one drag is one undo.
 */
export function ColourPicker({ value, onChange, onCommit, anchor, onClose }: { value: string; onChange: (v: string) => void; onCommit?: () => void; anchor: RefObject<HTMLElement>; onClose: () => void }) {
  const pop = useRef<HTMLDivElement>(null);
  const square = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  // What the picker is showing. Kept here rather than read back from the colour each time, since black and grey have no
  // hue of their own and would send the handles home
  const [state, setState] = useState(() => readColour(value));
  useEffect(() => setState((s) => readColour(value, s.hsv)), [value]);
  const { hsv, alpha } = state;
  const percent = Math.round(alpha * 100);

  const send = (next: Hsv, a = alpha) => {
    setState({ hsv: next, alpha: a });
    onChange(colourOf(next, a));
  };

  useLayoutEffect(() => {
    const el = anchor.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const h = pop.current?.offsetHeight ?? 300;
    const w = 236;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left));
    const below = r.bottom + 4;
    setPos({ left, top: below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 4) : below });
  }, [anchor]);

  useEffect(() => {
    const away = (e: Event) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !anchor.current?.contains(t)) onClose();
    };
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
      anchor.current?.focus();
    };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('resize', onClose);
    };
  }, [anchor, onClose]);

  // The square: across is saturation, up is brightness
  const fromPointer = (e: PointerEvent) => {
    const r = square.current!.getBoundingClientRect();
    const s = Math.min(1, Math.max(0, (e.clientX - r.left) / (r.width || 1)));
    const v = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / (r.height || 1)));
    send({ h: hsv.h, s, v });
  };
  const squareKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.01;
    const move: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const m = move[e.key];
    if (!m) return;
    e.preventDefault();
    e.stopPropagation();
    send({ h: hsv.h, s: Math.min(1, Math.max(0, hsv.s + m[0])), v: Math.min(1, Math.max(0, hsv.v + m[1])) });
  };

  const [r, g, b] = hsvToRgb(hsv);
  const solid = `rgb(${r}, ${g}, ${b})`;
  const pure = `hsl(${Math.round(hsv.h)} 100% 50%)`;
  const dropper = (window as unknown as { EyeDropper?: new () => EyeDropperLike }).EyeDropper;
  const pickFromScreen = async () => {
    if (!dropper) return;
    try {
      const got = parseColor((await new dropper().open()).sRGBHex);
      if (!got) return;
      // the colour picked keeps the alpha this one had
      onChange(formatColor([got[0], got[1], got[2], alpha]));
      onCommit?.();
    } catch {
      /* Esc out of the eyedropper is not an error */
    }
  };
  const keys = (e: KeyboardEvent) => e.stopPropagation();

  return (
    <div ref={pop} className="colour-pick" role="dialog" aria-label="Pick a colour" style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}>
      <div
        ref={square}
        className="colour-pick-square"
        tabIndex={0}
        role="slider"
        aria-label="Saturation and brightness"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuetext={`Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
        title="Drag to change how strong and how bright the colour is. Arrow keys nudge it, Shift for bigger steps"
        style={{ background: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, ${pure})` }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) fromPointer(e);
        }}
        onPointerUp={() => onCommit?.()}
        onKeyDown={squareKey}
        onBlur={() => onCommit?.()}
      >
        <span className="colour-pick-dot" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: solid }} />
      </div>
      <input
        className="colour-pick-strip hue"
        type="range"
        min={0}
        max={360}
        step={1}
        value={Math.round(hsv.h)}
        aria-label="Hue"
        aria-valuetext={`${Math.round(hsv.h)} degrees`}
        title="Hue: which colour it is"
        onChange={(e) => send({ ...hsv, h: Number(e.target.value) })}
        onPointerUp={() => onCommit?.()}
        onKeyDown={keys}
        onBlur={() => onCommit?.()}
      />
      <input
        className="colour-pick-strip alpha"
        type="range"
        min={0}
        max={100}
        step={1}
        value={percent}
        aria-label="Opacity"
        aria-valuetext={percent === 100 ? 'Solid' : percent === 0 ? 'Clear' : `${percent}% solid`}
        title="Opacity: how see-through the colour is, from clear to solid. The same number as the box beside the colour"
        style={{ '--clear': `rgba(${r}, ${g}, ${b}, 0)`, '--solid': solid } as CSSProperties}
        onChange={(e) => send(hsv, Number(e.target.value) / 100)}
        onPointerUp={() => onCommit?.()}
        onKeyDown={keys}
        onBlur={() => onCommit?.()}
      />
      <div className="colour-pick-foot">
        <span className="colour-pick-now" style={{ '--swatch': colourOf(hsv, alpha) } as CSSProperties} aria-hidden="true" />
        <span className="colour-pick-value mono">{colourOf(hsv, alpha)}</span>
        {dropper && (
          <button type="button" className="icon-btn" title="Pick a colour from anywhere on the screen" aria-label="Pick a colour from the screen" onClick={() => void pickFromScreen()}>
            <Icons.eyedropper />
          </button>
        )}
        <label className="colour-pick-native" title="Your browser's own colour picker. It only knows solid colours, so the opacity here is kept">
          <span className="sr-only">Your browser's own colour picker</span>
          <input
            type="color"
            value={`#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`}
            onChange={(e) => {
              const c = parseColor(e.target.value);
              if (c) onChange(formatColor([c[0], c[1], c[2], alpha]));
            }}
            onBlur={() => onCommit?.()}
          />
        </label>
      </div>
    </div>
  );
}

/**
 * A button that opens the picker: for the places a colour is chosen that aren't a full colour field (the text toolbar's A,
 * a style's swatch). What the button looks like is the caller's; this only adds the opening and the picker itself.
 */
export function PickerButton({
  value,
  onChange,
  onCommit,
  className,
  title,
  label,
  disabled,
  style,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit?: () => void;
  className?: string;
  title?: string;
  label: string;
  disabled?: boolean;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`${className ?? ''}${open ? ' open' : ''}`}
        style={style}
        title={title}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        //(the text being edited keeps its selection: a press here mustn't take the focus from it)
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
      >
        {children}
      </button>
      {open && createPortal(<ColourPicker value={value} onChange={onChange} onCommit={onCommit} anchor={btn} onClose={close} />, document.body)}
    </>
  );
}
