import { hasTokens } from 'interactives-player';
import { store } from '../store/store';
import { alertDialog, confirmDialog } from '../components/dialogs';
import { describeLink, linkColours, planLinkColours, type LeftOver, type LinkSummary } from './link-colours';

/** The colours that match nothing, as lines for a dialog (the first few, then a count of the rest). */
export function leftOverLines(left: LeftOver[], max = 8): string {
  const lines = left.slice(0, max).map((l) => `${l.color}, ${l.count} ${l.count === 1 ? 'place' : 'places'} (${l.where.join(', ')})`);
  if (left.length > max) lines.push(`and ${left.length - max} more`);
  return lines.join('\n');
}

const LEFT_NOTE = 'These match no token, so they stay as they are. Link them by hand from the colour picker\'s Tokens tab, or add a token with their colour first:';

/**
 * Link plain colours to the tokens that have the same colour in the default theme. Says what it will do first (with the colours
 * it will leave alone), then does it as one undo step. `artboardIds` limits it to those artboards.
 */
export async function linkColoursCommand(artboardIds?: string[]): Promise<LinkSummary | null> {
  const s = store();
  const opts = { artboardIds, brandOverride: s.get().brandOverride };
  if (!hasTokens(s.get().project.themes)) {
    await alertDialog({ title: 'No tokens yet', message: 'Add the themes first (the Themes tab under the canvas). Then plain colours that match a token can be linked to it.' });
    return null;
  }
  const plan = planLinkColours(s.get().project, opts);
  const where = artboardIds ? (artboardIds.length === 1 ? 'on this artboard' : 'on these artboards') : 'in the project';
  if (!plan.total) {
    await alertDialog({
      title: 'Nothing to link',
      message: plan.left.length
        ? `No plain colour ${where} is the same as a token's colour in the default theme.\n\n${LEFT_NOTE}\n${leftOverLines(plan.left)}`
        : plan.already
          ? `Every colour ${where} already follows a token.`
          : `There are no plain colours ${where}.`,
    });
    return plan;
  }
  const ok = await confirmDialog({
    title: 'Link colours to tokens',
    message: `${describeLink(plan)} ${where} to the token with the same colour in the default theme. They then change with the theme. Undo (Ctrl+Z) takes it back in one step.${plan.left.length ? `\n\n${LEFT_NOTE}\n${leftOverLines(plan.left)}` : ''}`,
    confirmLabel: `Link ${plan.total} ${plan.total === 1 ? 'colour' : 'colours'}`,
  });
  if (!ok) return null;
  let done: LinkSummary = plan;
  s.update((d) => void (done = linkColours(d, opts)));
  s.toast(`${describeLink(done, 'Linked')}. Undo (Ctrl+Z) takes them back in one step.`, 'info');
  return done;
}
