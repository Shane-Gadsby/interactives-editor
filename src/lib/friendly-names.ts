import { cleanVariableLabel } from 'interactives-player';
import { isIdentifier, uniqueIdentifier } from '../store/doc';

/**
 * The identifier to offer for words someone typed as a variable's name: "Quiz score" gives `quizScore`, "2nd try" gives `_2ndTry`,
 * "Café visits!" gives `cafeVisits`. A name that already is an identifier comes back as it was. Answers '' when the text has no
 * letter or digit to build one from, so the caller can say so instead of making up a name.
 */
export function friendlyIdentifier(typed: string): string {
  const text = typed.trim();
  if (isIdentifier(text)) return text;
  const words = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  if (!words.length) return '';
  //an all-capitals word ("QUIZ", "ID") is read as a plain word; a word with its own capitals ("quizScore") keeps them
  const plain = (w: string) => (w === w.toUpperCase() ? w.toLowerCase() : w);
  let id = words.map((w, i) => (i === 0 ? plain(w).replace(/^./, (c) => c.toLowerCase()) : plain(w).replace(/^./, (c) => c.toUpperCase()))).join('');
  if (/^\d/.test(id)) id = `_${id}`;
  //a word the formulas already use (class, event, Math...) gets a tail rather than a clash
  if (!isIdentifier(id)) id = `${id}Value`;
  return id;
}

/** What a name field should do with typed words: the display label to keep (none when they are already an identifier) and the identifier to use. */
export function nameFromWords(typed: string, taken: Iterable<string>): { label?: string; name: string } | null {
  const text = typed.trim();
  if (!text) return null;
  if (isIdentifier(text)) return { name: text };
  const fixed = friendlyIdentifier(text);
  if (!fixed) return null;
  return { label: cleanVariableLabel(text), name: uniqueIdentifier(taken, fixed) };
}

/** A picker row for a variable whose value is its name (the formula pickers): the words first, the name small after them with the type. */
export function variableOption(v: { name: string; label?: string }, hint: string): { value: string; label: string; hint: string } {
  const own = v.label?.trim();
  return own && own !== v.name ? { value: v.name, label: own, hint: `${v.name} · ${hint}` } : { value: v.name, label: v.name, hint };
}
