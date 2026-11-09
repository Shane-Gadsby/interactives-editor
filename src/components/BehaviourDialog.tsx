import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DEFAULT_TRANSITION_MS, PAGE_TRANSITIONS, speedOf, TRANSITION_SPEEDS } from 'interactives-player';
import { store, useEditor } from '../store/store';
import { pickNewAsset } from '../lib/quick-add';
import { RECIPES, RECIPE_BY_ID, NEW_PREFIX, THIS_LAYER, TRIGGER_WORDS, applyBehaviour, audioAssets, buildBehaviour, counterChoices, defaultAnswers, incomplete, layerChoices, otherPages, switchChoices, unavailable, type Answers, type Need, type Recipe, type RecipeCtx, type Trigger } from '../lib/recipes';
import { TextField } from './ui';
import { track } from '../lib/analytics';
import { revealAdded, revealedWithin } from '../lib/graph-reveal';

/**
 * "When this is clicked...": a short list of what should happen, then the one or two choices it needs, then Add. What it writes is
 * ordinary graph nodes (lib/recipes.ts), so the same thing can be taken further in the Interactions graph.
 */

export interface BehaviourRequest {
  abId: string;
  layerId: string;
  trigger: Trigger;
  /** Start with this recipe picked (the command palette asks for one by name). */
  recipe?: string;
}

let request: BehaviourRequest | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Open the dialog for a layer: Add interaction on the canvas menu and the Inspector's buttons both call this. */
export function openBehaviours(r: BehaviourRequest) {
  request = r;
  emit();
}

export function closeBehaviours() {
  request = null;
  emit();
}

/** Mounted once at the app root, beside the other dialogs. */
export function BehaviourHost() {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return request ? <BehaviourDialog key={`${request.abId}:${request.layerId}:${request.trigger}`} req={request} /> : null;
}

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';
const GROUPS: Recipe['group'][] = ['Pages', 'Layers', 'Motion and sound', 'Counting and switches', 'Other'];
const NEW_VALUE = '__new__';

function BehaviourDialog({ req }: { req: BehaviourRequest }) {
  const project = useEditor((s) => s.project);
  const ab = project.artboards.find((a) => a.id === req.abId);
  const layer = ab ? layerChoices(ab).find((l) => l.id === req.layerId) : undefined;
  const ctx: RecipeCtx | null = ab ? { project, ab, layerId: req.layerId } : null;
  const [recipeId, setRecipeId] = useState(req.recipe && RECIPE_BY_ID[req.recipe] ? req.recipe : 'page-next');
  const [answers, setAnswers] = useState<Answers>(() => (ctx ? defaultAnswers(RECIPE_BY_ID[req.recipe && RECIPE_BY_ID[req.recipe] ? req.recipe : 'page-next'], ctx) : {}));
  const box = useRef<HTMLDivElement>(null);
  const titleId = 'behaviour-title';

  const recipe = RECIPE_BY_ID[recipeId];
  const blocked = ctx ? unavailable(recipe, ctx) : 'This page is gone.';
  const gap = incomplete(recipe, answers);
  const preview = useMemo(() => {
    if (!ctx || blocked || gap) return null;
    try {
      return buildBehaviour(ctx, recipeId, req.trigger, answers).sentence;
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, recipeId, answers, req.trigger]);

  const choose = (r: Recipe) => {
    if (!ctx || unavailable(r, ctx)) return;
    setRecipeId(r.id);
    setAnswers(defaultAnswers(r, ctx));
  };
  const add = () => {
    if (!ctx || blocked || gap) return;
    const b = buildBehaviour(ctx, recipeId, req.trigger, answers);
    const made = applyBehaviour((r) => store().update(r), req.abId, b);
    track('feature', `behaviour-${recipeId}`);
    closeBehaviours();
    //The graph opens on what was made and frames it (lib/graph-reveal.ts). With that preference off the nodes are only picked
    //in the graph, and the person stays where they are, and can open the graph from the row
    const said = `Added ${b.sentence}`;
    const shown = revealAdded({
      abId: req.abId,
      ids: made.nodeIds,
      focusId: made.eventId,
      say: said,
      quiet: () => store().set({ logicSelection: made.actionId, logicPicked: made.nodeIds }),
    });
    if (!shown) store().toast(said);
  };
  // arrows move through the list as they would through radio buttons
  const step = (d: number) => {
    if (!ctx) return;
    const usable = RECIPES.filter((r) => !unavailable(r, ctx));
    const at = usable.findIndex((r) => r.id === recipeId);
    choose(usable[(at + d + usable.length) % usable.length]);
    requestAnimationFrame(() => box.current?.querySelector<HTMLElement>('[role=radio][aria-checked=true]')?.focus());
  };
  const handlers = useRef({ add, close: closeBehaviours, step });
  handlers.current = { add, close: closeBehaviours, step };

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('[role=radio][aria-checked=true]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      // modal: the editor's own shortcuts must not see keys while it is open
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        handlers.current.close();
      } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') && (e.target as HTMLElement | null)?.getAttribute?.('role') === 'radio') {
        e.preventDefault();
        handlers.current.step(e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1);
      } else if (e.key === 'Enter' && !e.isComposing) {
        const t = e.target as HTMLElement | null;
        // Enter on a button presses that button; in a text box or a list it adds
        if ((t instanceof HTMLButtonElement && t.getAttribute('role') !== 'radio') || t instanceof HTMLSelectElement) return;
        e.preventDefault();
        handlers.current.add();
      } else if (e.key === 'Tab') {
        const items = Array.from(box.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
        if (!items.length) return;
        const at = document.activeElement as HTMLElement | null;
        if (!at || !box.current?.contains(at)) {
          e.preventDefault();
          items[0].focus();
        } else if (e.shiftKey && at === items[0]) {
          e.preventDefault();
          items[items.length - 1].focus();
        } else if (!e.shiftKey && at === items[items.length - 1]) {
          e.preventDefault();
          items[0].focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      //(unless the graph has just been brought up: focus is on its new nodes, not back where the dialog came from)
      if (before && document.contains(before) && !revealedWithin(1500)) before.focus();
    };
  }, []);

  const who = layer?.name ?? 'this layer';
  return createPortal(
    <div className="modal-backdrop dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && closeBehaviours()}>
      <div className="modal dialog behaviour-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={box}>
        <header>
          <strong id={titleId}>
            When “{who}” is {TRIGGER_WORDS[req.trigger]}…
          </strong>
        </header>
        <div className="dialog-body">
          <p className="dialog-message">What should happen? It is added to the Interactions graph, where you can take it further.</p>
          <ul className="recipe-list" role="radiogroup" aria-label="What should happen">
            {GROUPS.map((g) => (
              <li key={g} role="presentation" className="recipe-group-item">
                <div className="recipe-group">{g}</div>
                <ul role="presentation">
                  {RECIPES.filter((r) => r.group === g).map((r) => {
                    const why = ctx ? unavailable(r, ctx) : null;
                    const on = r.id === recipeId;
                    return (
                      <li key={r.id} role="presentation">
                        <button type="button" role="radio" aria-checked={on} aria-disabled={!!why} tabIndex={on ? 0 : -1} className={`recipe-opt${on ? ' on' : ''}${why ? ' off' : ''}`} title={why ?? r.hint} onClick={() => choose(r)}>
                          <span className="recipe-name">{r.label}</span>
                          {why && <span className="recipe-hint">{why}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
          <p className="recipe-detail">{recipe.hint}</p>
          {ctx && !blocked && recipe.needs.map((n) => <NeedField key={n.key} need={n} ctx={ctx} answers={answers} onAnswer={(v) => setAnswers((a) => ({ ...a, [n.key]: v }))} />)}
          <p className="behaviour-preview" aria-live="polite">
            {blocked ? blocked : gap ? gap : preview ? `It will do this: ${preview}.` : ''}
          </p>
        </div>
        <footer className="dialog-actions">
          <button className="btn" title="Cancel (Esc)" onClick={closeBehaviours}>
            Cancel
          </button>
          <button className="btn primary" disabled={!!blocked || !!gap} title={blocked ?? gap ?? 'Add it (Enter)'} onClick={add}>
            Add
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

/** Slow, Medium, Fast or Custom for a page change, styled for the dialog. The answer is the milliseconds, as text. */
function SpeedAnswer({ label, raw, onAnswer }: { label: string; raw: string; onAnswer: (v: string) => void }) {
  const read = speedOf(raw.trim() === '' ? DEFAULT_TRANSITION_MS : Number(raw));
  const [custom, setCustom] = useState(read === 'custom');
  const shown = custom ? 'custom' : read;
  return (
    <>
      <label className="dialog-field">
        <span>{label}</span>
        <select
          value={shown}
          onChange={(e) => {
            const preset = TRANSITION_SPEEDS.find((s) => s.value === e.target.value);
            setCustom(!preset);
            if (preset) onAnswer(String(preset.ms));
          }}
        >
          {TRANSITION_SPEEDS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
          <option value="custom">Custom</option>
        </select>
      </label>
      {shown === 'custom' && <TextField label="Custom speed (ms)" value={raw} onChange={(x) => onAnswer(x.replace(/[^\d]/g, ''))} title="How long the page change takes, in milliseconds. 1000 is one second" />}
    </>
  );
}

function NeedField({ need, ctx, answers, onAnswer }: { need: Need; ctx: RecipeCtx; answers: Answers; onAnswer: (v: string) => void }) {
  const v = answers[need.key] ?? '';
  const sel = (value: string, options: { value: string; label: string }[], onChange: (x: string) => void) => (
    <label className="dialog-field">
      <span>{need.label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
  switch (need.kind) {
    case 'layer': {
      const others = layerChoices(ctx.ab).filter((l) => l.id !== ctx.layerId);
      const me = layerChoices(ctx.ab).find((l) => l.id === ctx.layerId);
      return sel(v, [{ value: THIS_LAYER, label: `This layer (${me?.name ?? 'this one'})` }, ...others.map((l) => ({ value: l.id, label: l.hidden ? `${l.name} (hidden)` : l.name }))], onAnswer);
    }
    case 'transition':
      return sel(v || 'fade', PAGE_TRANSITIONS, onAnswer);
    case 'speed': {
      // Instant has no length, so there is nothing to ask
      if ((answers.transition ?? 'fade') === 'none') return null;
      return <SpeedAnswer label={need.label} raw={v} onAnswer={onAnswer} />;
    }
    case 'page':
      return sel(v, otherPages(ctx).map((a) => ({ value: a.id, label: a.name })), onAnswer);
    case 'timeline':
      return sel(v, ctx.ab.timelines.map((t) => ({ value: t.id, label: t.name })), onAnswer);
    case 'sound': {
      const sounds = audioAssets(ctx.project);
      return (
        <div className="dialog-field">
          {sounds.length ? (
            sel(v, sounds.map((a) => ({ value: a.id, label: a.name })), onAnswer)
          ) : (
            <span>{need.label}: none in this project yet</span>
          )}
          <button type="button" className="btn small" onClick={() => void pickNewAsset('audio').then((id) => id && onAnswer(id))}>
            + Add a new sound…
          </button>
        </div>
      );
    }
    case 'link':
      return <TextField label={need.label} value={v} placeholder="https://example.com" onChange={onAnswer} />;
    case 'counter':
    case 'switch': {
      const existing = need.kind === 'counter' ? counterChoices(ctx.project) : switchChoices(ctx.project);
      const isNew = v.startsWith(NEW_PREFIX);
      const noun = need.kind === 'counter' ? 'counter' : 'switch';
      return (
        <>
          {sel(isNew ? NEW_VALUE : v, [...existing.map((x) => ({ value: x.id, label: x.name })), { value: NEW_VALUE, label: `A new ${noun}…` }], (x) => onAnswer(x === NEW_VALUE ? NEW_PREFIX + (need.kind === 'counter' ? 'count' : 'isOn') : x))}
          {isNew && <TextField label={`Name the ${noun}`} value={v.slice(NEW_PREFIX.length)} onChange={(x) => onAnswer(NEW_PREFIX + x)} title="Letters, digits and _ . It becomes a variable you can show in text or test in a condition" />}
        </>
      );
    }
  }
}
