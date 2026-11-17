import { store } from '../store/store';
import { openBehaviours, type BehaviourPrefill } from '../components/BehaviourDialog';
import { describeIt, looksLikeSentence, type Described } from './describe-it';
import type { Command } from './commands';

/**
 * The "Describe it" row of the command palette: when what was typed reads as a sentence, a row that opens the + When clicked...
 * dialog filled in with what was understood. When nothing could be read (and no ordinary command matched either) the row says so
 * and opens the dialog empty. It reads the open page and the selected layer as they are now.
 */

/** The lines the dialog shows above its list for a sentence that was read. */
export function describedNotes(d: Described): string[] {
  const out = [`From your words: ${d.sentence}. Check it, change anything you need to, then press Add.`];
  if (d.missing.length) out.push(`Not found in this project: ${d.missing.join(', ')}. Choose it below.`);
  if (d.ignored.length) out.push(`Not understood, so left out: ${d.ignored.map((x) => `“${x}”`).join(', ')}.`);
  return out;
}

const prefillOf = (d: Described): BehaviourPrefill => ({ answers: d.answers, when: d.when, then: d.then, only: d.only, otherwise: d.otherwise, notes: describedNotes(d) });

/**
 * The row to show for what was typed, or null for none. `commandMatches` is how many ordinary commands the text found: with some,
 * a sentence that cannot be read is left to them, with none it gets the "I could not read that" row.
 */
export function describeCommand(query: string, commandMatches: number): Command | null {
  if (!looksLikeSentence(query)) return null;
  const s = store();
  const ab = s.artboard();
  if (!ab) return null;
  const sel = s.selectedNodes();
  const one = sel.length === 1 ? sel[0] : null;
  const d = describeIt(query, s.get().project, ab, one?.id ?? '');
  if (d) {
    const needsLayer = !d.layerId;
    return {
      id: 'describe:it',
      title: `Describe it: ${d.sentence}${d.missing.length ? ' (you choose the rest)' : ''}`,
      group: 'Behaviours',
      disabled: needsLayer ? 'Select the layer first' : undefined,
      run: () => openBehaviours({ abId: ab.id, layerId: d.layerId, trigger: d.trigger, recipe: d.recipe, prefill: prefillOf(d) }),
    };
  }
  if (commandMatches) return null;
  return {
    id: 'describe:none',
    title: 'I could not turn that into a behaviour. Open the dialog and choose it yourself…',
    group: 'Behaviours',
    disabled: one ? undefined : 'Select one layer first',
    run: () => openBehaviours({ abId: ab.id, layerId: one!.id, trigger: 'click', prefill: { notes: [`I could not read “${query.trim()}”. Choose what should happen below.`] } }),
  };
}
