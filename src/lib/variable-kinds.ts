import { LIGHT_LOOK, uid, type Variable, type VariableType } from 'interactives-player';
import { uniqueIdentifier } from '../store/doc';

/**
 * What a person can ask for when they add a variable, in the words they use for it. Each is an ordinary variable (the type
 * and starting value behind it are shown in the table and can be changed), so nothing here is a new kind of data.
 */
export interface VariableKind {
  id: string;
  label: string;
  /** One line that says what it is for. */
  note: string;
  type: VariableType;
  /** The name it starts with (made unique if taken). */
  name: string;
  initial: Variable['initial'];
  /** Kept between visits (Remember progress). */
  persist?: boolean;
  options?: string[];
}

export const VARIABLE_KINDS: VariableKind[] = [
  {
    id: 'counter',
    label: 'Counter',
    note: 'A number that goes up and down: clicks, attempts, how many are done.',
    type: 'number',
    name: 'count',
    initial: 0,
  },
  {
    id: 'switch',
    label: 'Switch (on or off)',
    note: 'Either on or off: is the answer showing, has this been opened.',
    type: 'boolean',
    name: 'isOn',
    initial: false,
  },
  {
    id: 'text',
    label: 'Text',
    note: 'Words: what someone typed, the name of the choice they made.',
    type: 'string',
    name: 'words',
    initial: '',
  },
  {
    id: 'score',
    label: 'Score',
    note: 'A running total of points, kept if the learner comes back later.',
    type: 'number',
    name: 'points',
    initial: 0,
    persist: true,
  },
  {
    id: 'list',
    label: 'List',
    note: 'A list of things (names, questions, steps) that a repeater can show one by one.',
    type: 'list',
    name: 'items',
    initial: '[]',
  },
  {
    id: 'choice',
    label: 'Choice',
    note: 'One pick from a short list you write, such as easy, medium or hard.',
    type: 'enum',
    name: 'choice',
    initial: 'first',
    options: ['first', 'second'],
  },
  {
    id: 'colour',
    label: 'Colour',
    note: 'A colour that layers can take on, such as a highlight.',
    type: 'color',
    name: 'tint',
    initial: LIGHT_LOOK.button,
  },
];

/** The variable a kind makes, named so it does not clash with the ones already there. */
export function variableFor(kind: VariableKind, existing: string[]): Variable {
  const v: Variable = {
    id: uid('v'),
    name: uniqueIdentifier(existing, kind.name),
    type: kind.type,
    initial: kind.initial,
  };
  if (kind.persist) v.persist = true;
  if (kind.options) v.options = [...kind.options];
  return v;
}

/** How a type reads next to its friendly name in the Type box. */
export const TYPE_LABELS: Record<VariableType, string> = {
  number: 'Number (counter, score)',
  string: 'Text',
  boolean: 'True/false (switch)',
  color: 'Colour',
  enum: 'Choice',
  list: 'List',
};
