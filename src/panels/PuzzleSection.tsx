import { BIG_HINT_COST, HINT_COST, PUZZLE_VALUE, puzzleDrop, puzzleNumber, type Artboard, type Project, type PuzzleSettings } from 'interactives-player';
import { store } from '../store/store';
import { getArtboard } from '../store/doc';
import { IconButton, NumberField, Section, TextField } from '../components/ui';
import { Icons } from '../components/icons';
import { makePuzzle, PUZZLE_FRAME_NAME } from '../lib/puzzle-page';

/** A page as a puzzle: its number and title, what it's worth, its hints, and the frame of layers that shows them. */
export function PuzzleSection({ ab, project }: { ab: Artboard; project: Project }) {
  const p = ab.puzzle;
  const on = !!p;
  const set = (patch: Partial<PuzzleSettings>, coalesce?: string) =>
    store().update(
      (d) => {
        const a = getArtboard(d as Project, ab.id);
        if (!a?.puzzle) return;
        const next: Record<string, unknown> = { ...a.puzzle, ...patch };
        for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === '') delete next[k];
        a.puzzle = next as PuzzleSettings;
      },
      { coalesce: coalesce ?? `puzzle-${Object.keys(patch).join(',')}-${ab.id}` },
    );
  const hasFrame = ab.children.some((c) => c.name === PUZZLE_FRAME_NAME);
  const hints = [...(p?.hints ?? [])];
  const setHint = (i: number, v: string) => {
    const next = [0, 1, 2].map((j) => (j === i ? v : hints[j] ?? ''));
    while (next.length && !next[next.length - 1].trim()) next.pop();
    set({ hints: next }, `puzzle-hint-${i}-${ab.id}`);
  };
  return (
    <Section
      help="story-puzzles"
      title="Puzzle"
      defaultOpen={on}
      actions={
        on ? (
          <IconButton icon={<Icons.trash />} title="This page stops being a puzzle (its layers stay)" onClick={() => store().update((d) => void delete getArtboard(d as Project, ab.id)!.puzzle)} />
        ) : (
          <IconButton icon={<Icons.plus />} title="Make this page a puzzle: a number, a value, hints bought with coins, and the frame that shows them" onClick={() => store().update((d) => makePuzzle(d as Project, ab.id))} />
        )
      }
    >
      {!on && <div className="muted small">Not a puzzle. The + adds hints, a score and the frame that shows them.</div>}
      {on && (
        <>
          <NumberField label="Number" title="Its number in the puzzle index. Empty: its place among the puzzle pages" value={p!.number ?? puzzleNumber(project.artboards, ab)} min={0} max={9999} onChange={(v) => set({ number: Math.max(0, Math.round(v)) })} />
          <TextField label="Title" title="Shown at the top of the puzzle and in the index. Empty: the page's name" value={p!.title ?? ''} placeholder={ab.name} commitOnBlur onChange={(v) => set({ title: v })} />
          <NumberField label="Value" suffix="points" title="What it's worth solved first time" value={p!.value ?? PUZZLE_VALUE} min={0} max={9999} onChange={(v) => set({ value: Math.max(0, Math.round(v)) })} />
          <NumberField label="Off per wrong try" suffix="points" title="Taken off the value for each wrong answer, never below a third of it. Empty: a tenth of the value" value={p!.drop ?? puzzleDrop(p!)} min={0} max={9999} onChange={(v) => set({ drop: Math.max(0, Math.round(v)) })} />
          {[0, 1, 2].map((i) => (i === 0 || hints[i - 1]?.trim() ? <TextField key={i} label={`Hint ${i + 1}`} title="Hints open in order, each for hint coins. Leave it empty for fewer hints" value={hints[i] ?? ''} multiline rows={2} commitOnBlur onChange={(v) => setHint(i, v)} /> : null))}
          <TextField label="Big hint" title="The last hint, all but the answer. It opens after the others, for more coins" value={p!.bigHint ?? ''} multiline rows={2} commitOnBlur onChange={(v) => set({ bigHint: v })} />
          <NumberField label="Hint cost" suffix="coins" title="Hint coins each hint costs to open (once: an open hint stays open)" value={p!.hintCost ?? HINT_COST} min={0} max={99} onChange={(v) => set({ hintCost: Math.max(0, Math.round(v)) })} />
          <NumberField label="Big hint cost" suffix="coins" title="Hint coins the big hint costs" value={p!.bigCost ?? BIG_HINT_COST} min={0} max={99} onChange={(v) => set({ bigCost: Math.max(0, Math.round(v)) })} />
          {!hasFrame && (
            <button type="button" className="btn small" title="Put the number, value, hints, coins, memo, Skip and the right and wrong moments on this page, already wired" onClick={() => store().update((d) => makePuzzle(d as Project, ab.id))}>
              Add the puzzle frame
            </button>
          )}
          <div className="muted small">A question here answers the puzzle when checked. Anything else: a Puzzle answer node.</div>
        </>
      )}
    </Section>
  );
}
