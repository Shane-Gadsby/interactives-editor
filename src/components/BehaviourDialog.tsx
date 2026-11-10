import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DEFAULT_TRANSITION_MS, PAGE_TRANSITIONS, speedOf, TRANSITION_SPEEDS, variableLabelAndName } from 'interactives-player';
import { onCurrentStore, store, useEditor } from '../store/store';
import { pickNewAsset } from '../lib/quick-add';
import { DONE_HOWS, doneHowOf, doneLayers } from '../lib/all-done';
import { RECIPES, RECIPE_BY_ID, KEY_CHOICES, NEW_PREFIX, THIS_LAYER, TRIGGERS, TRIGGER_BY_ID, applyBehaviour, audioAssets, buildBehaviour, counterChoices, defaultAnswers, defaultTriggerAnswers, findLayer, incomplete, joinSet, layerChoices, listChoices, lookColour, otherPages, reachOps, resettable, seedCondition, splitSet, switchChoices, textChoices, triggerIncomplete, triggerLabel, triggerUnavailable, unavailable, videoChoices, zoneChoices, type Answers, type Need, type Recipe, type RecipeCtx, type Step, type Trigger } from '../lib/recipes';
import { OP_LABELS } from '../lib/condition';
import { ColorField, TextField } from './ui';
import { ConditionField } from './ConditionField';
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
    //Another project opened (or none): a dialog for the last one's layer must not stay up, or Add would write there
    const off = onCurrentStore(() => closeBehaviours());
    return () => {
      listeners.delete(l);
      off();
    };
  }, []);
  return request ? <BehaviourDialog key={`${request.abId}:${request.layerId}:${request.trigger}`} req={request} /> : null;
}

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';
const GROUPS: Recipe['group'][] = ['Pages', 'Layers', 'Motion and sound', 'Counting and switches', 'Other'];
const NEW_VALUE = '__new__';
const OTHER_VALUE = '__other__';

/** What a second step starts as: a number change if it can be, the commonest thing to do beside another. */
const firstUsable = (ctx: RecipeCtx): Recipe => RECIPE_BY_ID.counter && !unavailable(RECIPE_BY_ID.counter, ctx) ? RECIPE_BY_ID.counter : (RECIPES.find((r) => !unavailable(r, ctx)) ?? RECIPES[0]);

function BehaviourDialog({ req }: { req: BehaviourRequest }) {
  const project = useEditor((s) => s.project);
  const ab = project.artboards.find((a) => a.id === req.abId);
  const layer = ab ? layerChoices(ab).find((l) => l.id === req.layerId) : undefined;
  const ctx: RecipeCtx | null = ab ? { project, ab, layerId: req.layerId } : null;
  const [recipeId, setRecipeId] = useState(req.recipe && RECIPE_BY_ID[req.recipe] ? req.recipe : 'page-next');
  const [answers, setAnswers] = useState<Answers>(() => (ctx ? defaultAnswers(RECIPE_BY_ID[req.recipe && RECIPE_BY_ID[req.recipe] ? req.recipe : 'page-next'], ctx) : {}));
  // what starts it (clicked unless the person says otherwise), and the optional extras: more steps, an Only if, an Otherwise
  const [trigger, setTrigger] = useState<Trigger>(req.trigger);
  const [when, setWhen] = useState<Answers>(() => (ctx ? defaultTriggerAnswers(req.trigger, ctx) : {}));
  const [then, setThen] = useState<Step[]>([]);
  const [only, setOnly] = useState<string | null>(null);
  const [otherwise, setOtherwise] = useState<Step | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const titleId = 'behaviour-title';

  const recipe = RECIPE_BY_ID[recipeId];
  //Count what has been done has no trigger of its own: each layer you tick starts its own small flow
  const counting = recipeId === 'count-done';
  const blocked = ctx ? unavailable(recipe, ctx) : 'This page is gone.';
  const triggerBlocked = ctx ? triggerUnavailable(trigger, ctx) : null;
  const gap =
    incomplete(recipe, answers, project, ab) ??
    (counting ? null : triggerIncomplete(trigger, when, project, ab)) ??
    then.map((st) => incomplete(RECIPE_BY_ID[st.recipe], st.answers, project, ab)).find(Boolean) ??
    (only !== null && otherwise ? incomplete(RECIPE_BY_ID[otherwise.recipe], otherwise.answers, project, ab) : null) ??
    (only !== null && !only.trim() ? 'Add a condition to the Only if, or remove it.' : null);
  const extras = { when, then, only: only ?? '', otherwise: only !== null ? otherwise : null };
  const preview = useMemo(() => {
    if (!ctx || blocked || triggerBlocked || gap) return null;
    try {
      return buildBehaviour(ctx, recipeId, trigger, answers, undefined, extras).sentence;
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, recipeId, answers, trigger, when, then, only, otherwise]);

  const choose = (r: Recipe) => {
    if (!ctx || unavailable(r, ctx)) return;
    setRecipeId(r.id);
    setAnswers(defaultAnswers(r, ctx));
  };
  const chooseTrigger = (t: Trigger) => {
    if (!ctx || triggerUnavailable(t, ctx)) return;
    setTrigger(t);
    setWhen(defaultTriggerAnswers(t, ctx));
  };
  const add = () => {
    if (!ctx || blocked || triggerBlocked || gap) return;
    const b = buildBehaviour(ctx, recipeId, trigger, answers, undefined, extras);
    const made = applyBehaviour((r) => store().update(r), req.abId, b);
    track('feature', `behaviour-${recipeId}`);
    if (trigger !== 'click' && trigger !== 'pointerenter') track('feature', `behaviour-when-${trigger}`);
    if (then.length) track('feature', 'behaviour-then-also');
    if (only !== null && only.trim()) track('feature', otherwise ? 'behaviour-otherwise' : 'behaviour-only-if');
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
        // Enter on a button presses that button; in a text box or a list it adds (a tick box is ticked with Space, Enter leaves it alone)
        if ((t instanceof HTMLButtonElement && t.getAttribute('role') !== 'radio') || t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && t.type === 'checkbox')) return;
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
  const problem = blocked ?? triggerBlocked;
  return createPortal(
    <div className="modal-backdrop dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && closeBehaviours()}>
      <div className="modal dialog behaviour-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={box}>
        <header>
          <strong id={titleId}>{counting ? 'Count what has been done…' : <>When {triggerLabel(trigger, who)}…</>}</strong>
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
          {ctx && !blocked && <NeedFields needs={recipe.needs} ctx={ctx} answers={answers} onAnswers={(patch) => setAnswers((a) => ({ ...a, ...patch }))} recipeId={recipeId} />}
          <div className="behaviour-extras">
            {ctx && !counting && (
              <>
                <label className="dialog-field behaviour-when">
                  <span>It starts when</span>
                  <select value={trigger} onChange={(e) => chooseTrigger(e.target.value as Trigger)}>
                    {TRIGGERS.map((t) => {
                      const why = triggerUnavailable(t.id, ctx);
                      return (
                        <option key={t.id} value={t.id} disabled={!!why} title={why ?? undefined}>
                          {triggerLabel(t.id, who)}
                          {why ? ' (not yet)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </label>
                {!triggerBlocked && <NeedFields needs={TRIGGER_BY_ID[trigger].needs} ctx={ctx} answers={when} onAnswers={(patch) => setWhen((a) => ({ ...a, ...patch }))} recipeId={trigger} />}
                {trigger === 'drop' && !(findLayer(ctx.ab, ctx.layerId) as { draggable?: unknown } | undefined)?.draggable && <p className="recipe-detail">This layer can’t be dragged yet. Add Draggable to it in the Inspector, or nothing will be dropped.</p>}
                {then.map((st, i) => (
                  <StepRow key={i} label="Then" step={st} ctx={ctx} onChange={(x) => setThen((l) => l.map((y, j) => (j === i ? x : y)))} onRemove={() => setThen((l) => l.filter((_, j) => j !== i))} />
                ))}
                {only !== null && (
                  <div className="behaviour-row behaviour-only">
                    <ConditionField label="Only if" title="The steps run only when this is true" value={only} onChange={setOnly} />
                    <button
                      type="button"
                      className="btn small"
                      title="Take the Only if out (and the Otherwise with it)"
                      onClick={() => {
                        setOnly(null);
                        setOtherwise(null);
                      }}
                    >
                      Remove Only if
                    </button>
                  </div>
                )}
                {only !== null && otherwise && <StepRow label="Otherwise" step={otherwise} ctx={ctx} onChange={setOtherwise} onRemove={() => setOtherwise(null)} />}
                <div className="behaviour-add">
                  <button type="button" className="btn small" title="Add another thing to do straight after" onClick={() => setThen((l) => [...l, { recipe: firstUsable(ctx).id, answers: defaultAnswers(firstUsable(ctx), ctx) }])}>
                    + then also…
                  </button>
                  {only === null && (
                    <button type="button" className="btn small" title="Make it happen only when something is true" onClick={() => setOnly(seedCondition(project))}>
                      + only if…
                    </button>
                  )}
                  {only !== null && !otherwise && (
                    <button type="button" className="btn small" title="Choose what happens when it is not true" onClick={() => setOtherwise({ recipe: firstUsable(ctx).id, answers: defaultAnswers(firstUsable(ctx), ctx) })}>
                      + otherwise…
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
          <p className="behaviour-preview" aria-live="polite">
            {problem ? problem : gap ? gap : preview ? `It will do this: ${preview}.` : ''}
          </p>
        </div>
        <footer className="dialog-actions">
          <button className="btn" title="Cancel (Esc)" onClick={closeBehaviours}>
            Cancel
          </button>
          <button className="btn primary" disabled={!!problem || !!gap} title={problem ?? gap ?? 'Add it (Enter)'} onClick={add}>
            Add
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

/** A second (third...) thing to do, or the Otherwise: a short list of recipes and the questions the chosen one asks. */
function StepRow({ label, step, ctx, onChange, onRemove }: { label: string; step: Step; ctx: RecipeCtx; onChange: (s: Step) => void; onRemove: () => void }) {
  const r = RECIPE_BY_ID[step.recipe];
  return (
    <div className="behaviour-row behaviour-step" role="group" aria-label={label}>
      <div className="behaviour-step-head">
        <label className="dialog-field">
          <span>{label}</span>
          <select
            value={step.recipe}
            onChange={(e) => {
              const next = RECIPE_BY_ID[e.target.value];
              onChange({ recipe: next.id, answers: defaultAnswers(next, ctx) });
            }}
          >
            {GROUPS.map((g) => (
              <optgroup key={g} label={g}>
                {RECIPES.filter((x) => x.group === g && x.id !== 'count-done' && (x.id === step.recipe || !unavailable(x, ctx))).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <button type="button" className="btn small" aria-label={`Remove this ${label.toLowerCase()} step`} title="Take this step out" onClick={onRemove}>
          Remove
        </button>
      </div>
      <p className="recipe-detail">{r.hint}</p>
      <NeedFields needs={r.needs} ctx={ctx} answers={step.answers} onAnswers={(patch) => onChange({ ...step, answers: { ...step.answers, ...patch } })} recipeId={step.recipe} />
    </div>
  );
}

function NeedFields({ needs, ctx, answers, onAnswers, recipeId }: { needs: Need[]; ctx: RecipeCtx; answers: Answers; onAnswers: (patch: Answers) => void; recipeId: string }) {
  return (
    <>
      {needs
        .filter((n) => !n.when || n.when(answers))
        .map((n) => (
          <NeedField key={n.key} need={n} ctx={ctx} answers={answers} recipeId={recipeId} onAnswer={(v) => onAnswers({ [n.key]: v })} onAnswers={onAnswers} />
        ))}
    </>
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

function NeedField({ need, ctx, answers, onAnswer, onAnswers, recipeId }: { need: Need; ctx: RecipeCtx; answers: Answers; onAnswer: (v: string) => void; onAnswers: (patch: Answers) => void; recipeId: string }) {
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
  const digits = (x: string) => x.replace(/[^\d.]/g, '');
  switch (need.kind) {
    case 'layer': {
      const others = layerChoices(ctx.ab).filter((l) => l.id !== ctx.layerId);
      const me = layerChoices(ctx.ab).find((l) => l.id === ctx.layerId);
      //the look recipe's colour starts as the colour of whichever layer is picked
      const pick = (x: string) => (recipeId === 'look' ? onAnswers({ [need.key]: x, colour: lookColour(ctx, x) }) : onAnswer(x));
      return sel(v, [{ value: THIS_LAYER, label: `This layer (${me?.name ?? 'this one'})` }, ...others.map((l) => ({ value: l.id, label: l.hidden ? `${l.name} (hidden)` : l.name }))], pick);
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
    case 'video': {
      const videos = videoChoices(ctx.ab);
      const mine = videos.find((x) => x.id === ctx.layerId);
      return sel(v, [...(mine ? [{ value: THIS_LAYER, label: `This video (${mine.name})` }] : []), ...videos.filter((x) => x.id !== ctx.layerId).map((x) => ({ value: x.id, label: x.name }))], onAnswer);
    }
    case 'seconds':
      return <TextField label={need.label} value={v} placeholder="0" title="Seconds from the start: 75 is 1:15. A formula works too (chapter * 60)" onChange={onAnswer} />;
    case 'cuetime':
      return <TextField label={need.label} value={v} placeholder="10" title="Seconds from the start of the video: 75 is 1:15. It plays the steps as the video passes that time, not when someone jumps over it" onChange={(x) => onAnswer(digits(x))} />;
    case 'delay':
      return <TextField label={need.label} value={v} placeholder="5" title="Seconds, once, after the page is shown" onChange={(x) => onAnswer(digits(x))} />;
    case 'script': {
      const isNew = v.startsWith(NEW_PREFIX);
      return (
        <>
          {sel(isNew ? NEW_VALUE : v, [...ctx.project.scripts.map((x) => ({ value: x.id, label: x.runOnStart ? `${x.name} (also runs at the start)` : x.name })), { value: NEW_VALUE, label: 'A new script…' }], (x) => onAnswer(x === NEW_VALUE ? NEW_PREFIX + 'onClick' : x))}
          {isNew && <TextField label="Name the script" value={v.slice(NEW_PREFIX.length)} onChange={(x) => onAnswer(NEW_PREFIX + x)} title="It is made in the Scripts tab, ready to write" />}
        </>
      );
    }
    case 'counter':
    case 'switch': {
      const existing = need.kind === 'counter' ? counterChoices(ctx.project) : switchChoices(ctx.project);
      const isNew = v.startsWith(NEW_PREFIX);
      const noun = need.kind === 'counter' ? 'number' : 'switch';
      const fresh = need.newName ?? (need.kind === 'counter' ? 'count' : 'isOn');
      return (
        <>
          {sel(isNew ? NEW_VALUE : v, [...existing.map((x) => ({ value: x.id, label: variableLabelAndName(x) })), { value: NEW_VALUE, label: `A new ${noun}…` }], (x) => onAnswer(x === NEW_VALUE ? NEW_PREFIX + fresh : x))}
          {isNew && <TextField label={`Name the ${noun}`} value={v.slice(NEW_PREFIX.length)} onChange={(x) => onAnswer(NEW_PREFIX + x)} title="Plain words are fine, spaces too. It becomes a variable you can show in text or test in a condition" />}
        </>
      );
    }
    case 'numhow':
      return sel(v || 'add', [{ value: 'add', label: 'Add to it' }, { value: 'subtract', label: 'Take away from it' }, { value: 'set', label: 'Set it to' }], onAnswer);
    case 'switchhow':
      return sel(v || 'flip', [{ value: 'flip', label: 'Flip it each time' }, { value: 'on', label: 'Turn it on' }, { value: 'off', label: 'Turn it off' }], onAnswer);
    case 'amount':
      return <TextField label={need.label} value={v} placeholder="1" title="A number, or a formula such as score * 2" onChange={onAnswer} />;
    case 'startat':
      return sel(v || '1', [{ value: '1', label: 'Number 1' }, { value: '0', label: 'Number 0' }], onAnswer);
    case 'last': {
      const lists = listChoices(ctx.project);
      const isList = v.startsWith('list:');
      return (
        <>
          {sel(isList ? v : NEW_VALUE, [...lists.map((l) => ({ value: `list:${l.id}`, label: `As many as the list ${l.name} has` })), { value: NEW_VALUE, label: 'A number I type…' }], (x) => onAnswer(x === NEW_VALUE ? '3' : x))}
          {!isList && <TextField label="How many" value={v} placeholder="3" title="The number of slides, cards or tabs. A formula works too" onChange={onAnswer} />}
        </>
      );
    }
    case 'ends':
      return sel(v || 'round', [{ value: 'round', label: 'Go round to the other end' }, { value: 'stop', label: 'Stop there' }], onAnswer);
    case 'textvar': {
      const existing = textChoices(ctx.project);
      const isNew = v.startsWith(NEW_PREFIX);
      const pick = (x: string) => {
        if (x === NEW_VALUE) return onAnswers({ [need.key]: NEW_PREFIX + 'message', textvalue: '' });
        onAnswers({ [need.key]: x, textvalue: textChoices(ctx.project).find((t) => t.id === x)?.options?.[0] ?? '' });
      };
      return (
        <>
          {sel(isNew ? NEW_VALUE : v, [...existing.map((x) => ({ value: x.id, label: x.type === 'enum' ? `${variableLabelAndName(x)} (a choice)` : variableLabelAndName(x) })), { value: NEW_VALUE, label: 'A new piece of text…' }], pick)}
          {isNew && <TextField label="Name it" value={v.slice(NEW_PREFIX.length)} onChange={(x) => onAnswer(NEW_PREFIX + x)} title="Plain words are fine, spaces too. It becomes a variable you can show in text or test in a condition" />}
        </>
      );
    }
    case 'textvalue': {
      const chosen = ctx.project.variables.find((x) => x.id === answers.textvar);
      if (chosen?.type === 'enum' && chosen.options?.length) return sel(chosen.options.includes(v) ? v : chosen.options[0], chosen.options.map((o) => ({ value: o, label: o })), onAnswer);
      return <TextField label={need.label} value={v} placeholder="Some text" onChange={onAnswer} />;
    }
    case 'words':
      if (need.key === 'say') return <TextField label={need.label} value={v} placeholder="e.g. Slide {slide} of 5" title="Words a screen reader says once it has changed. Put a value in curly brackets to say it: Score {score}. Leave empty to say nothing" onChange={onAnswer} />;
      return <TextField label={need.label} value={v} onChange={onAnswer} />;
    case 'lookwhat':
      return sel(v || 'colour', [{ value: 'colour', label: 'Colour' }, { value: 'text', label: 'Text' }, { value: 'opacity', label: 'Opacity (how see-through)' }, { value: 'size', label: 'Size' }], onAnswer);
    case 'colour':
      return <ColorField label={need.label} value={v || '#e0b200'} onChange={onAnswer} />;
    case 'percent':
      return <TextField label={need.label} value={v} placeholder="50" title="100 is solid, 0 is invisible" onChange={(x) => onAnswer(digits(x))} />;
    case 'size':
      return <TextField label={need.label} value={v} placeholder="leave as it is" title="Leave empty to keep it as it is" onChange={(x) => onAnswer(digits(x))} />;
    case 'donehow': {
      const how = doneHowOf(v);
      const pick = (x: string) => {
        //the ticked layers that cannot be done this way are unticked, so a switch never leaves one behind
        const can = doneLayers(ctx.ab, ctx.project, doneHowOf(x)).map((l) => l.id);
        onAnswers({ [need.key]: x, doneset: joinSet(splitSet(answers.doneset).filter((id) => can.includes(id))) });
      };
      return sel(how, DONE_HOWS, pick);
    }
    case 'doneset': {
      const ticked = splitSet(v);
      const how = doneHowOf(answers.donehow);
      const choices = doneLayers(ctx.ab, ctx.project, how);
      return (
        <fieldset className="dialog-field check-list">
          <legend>{need.label}</legend>
          {choices.length === 0 && <p className="recipe-detail">{how === 'answered' ? 'No layer on this page has a question yet. Add one in the Question tab of the Inspector first.' : 'No layer on this page is a dialog with an open value yet. Give a frame the Dialog setting and an open value first.'}</p>}
          {choices.map((l) => (
            <label key={l.id} className="check-row">
              <input type="checkbox" checked={ticked.includes(l.id)} onChange={(e) => onAnswer(joinSet(e.target.checked ? [...ticked, l.id] : ticked.filter((x) => x !== l.id)))} />
              <span>{l.name}</span>
            </label>
          ))}
        </fieldset>
      );
    }
    case 'donename':
      return <TextField label={need.label} value={v} placeholder="explored" title="Letters, digits and _ . Three values are made from it: a list of what is done, a number for how many (name plus Count) and a number for how many there are (name plus Total). Show them in text, like {exploredCount} of {exploredTotal} explored" onChange={onAnswer} />;
    case 'layerset': {
      const ticked = splitSet(v);
      const others = layerChoices(ctx.ab).filter((l) => l.id !== ctx.layerId);
      return (
        <fieldset className="dialog-field check-list">
          <legend>{need.label}</legend>
          {others.map((l) => (
            <label key={l.id} className="check-row">
              <input type="checkbox" checked={ticked.includes(l.id)} onChange={(e) => onAnswer(joinSet(e.target.checked ? [...ticked, l.id] : ticked.filter((x) => x !== l.id)))} />
              <span>{l.name}</span>
            </label>
          ))}
        </fieldset>
      );
    }
    case 'varset': {
      const ticked = splitSet(v);
      return (
        <fieldset className="dialog-field check-list">
          <legend>{need.label}</legend>
          {resettable(ctx.project).map((x) => (
            <label key={x.id} className="check-row">
              <input type="checkbox" checked={ticked.includes(x.id)} onChange={(e) => onAnswer(joinSet(e.target.checked ? [...ticked, x.id] : ticked.filter((y) => y !== x.id)))} />
              <span>{variableLabelAndName(x)}</span>
            </label>
          ))}
        </fieldset>
      );
    }
    case 'watch':
      return sel(v, ctx.project.variables.map((x) => ({ value: x.id, label: variableLabelAndName(x) })), (x) => {
        const w = ctx.project.variables.find((y) => y.id === x);
        onAnswers({ [need.key]: x, reachop: reachOps(w)[0], reachto: w?.type === 'enum' ? (w.options?.[0] ?? '') : '1' });
      });
    case 'reachop':
      return sel(v, reachOps(ctx.project.variables.find((x) => x.id === answers.watch)).map((o) => ({ value: o, label: OP_LABELS[o] })), onAnswer);
    case 'reachto': {
      const w = ctx.project.variables.find((x) => x.id === answers.watch);
      if (w?.type === 'enum' && w.options?.length) return sel(w.options.includes(v) ? v : w.options[0], w.options.map((o) => ({ value: o, label: o })), onAnswer);
      return <TextField label={need.label} value={v} placeholder={w?.type === 'number' ? '1' : 'some text'} onChange={onAnswer} />;
    }
    case 'zone':
      return sel(v, [{ value: '', label: 'Any drop zone' }, ...zoneChoices(ctx.ab).map((z) => ({ value: z.id, label: z.name }))], onAnswer);
    case 'key': {
      const named = KEY_CHOICES.some((k) => k.value === v);
      return <KeyAnswer label={need.label} value={v} named={named} onAnswer={onAnswer} />;
    }
  }
}

/** A key by name (Enter, the arrows, Space...), or any other one typed. */
function KeyAnswer({ label, value, named, onAnswer }: { label: string; value: string; named: boolean; onAnswer: (v: string) => void }) {
  const [typed, setTyped] = useState(!named);
  const shown = typed ? OTHER_VALUE : value;
  return (
    <>
      <label className="dialog-field">
        <span>{label}</span>
        <select
          value={shown}
          onChange={(e) => {
            const other = e.target.value === OTHER_VALUE;
            setTyped(other);
            onAnswer(other ? '' : e.target.value);
          }}
        >
          {KEY_CHOICES.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
          <option value={OTHER_VALUE}>Another key…</option>
        </select>
      </label>
      {typed && <TextField label="Type the key" value={value} placeholder="a, 5, F2..." title="The key as it is named: a letter, a number, F2, Tab. Capital letters count the same as small ones" onChange={onAnswer} />}
    </>
  );
}
