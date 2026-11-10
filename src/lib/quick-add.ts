import { LIGHT_LOOK, uid, type VariableType } from 'interactives-player';
import { store } from '../store/store';
import { uniqueIdentifier } from '../store/doc';
import { insertFiles, pickFiles } from './insert';
import { promptDialog } from '../components/dialogs';

/** Dropdown values that mean "make a new one" instead of picking an existing item. */
export const ADD_ASSET = '__add_asset__';
export const ADD_VARIABLE = '__add_variable__';

export type PickKind = 'image' | 'video' | 'audio' | 'data';

const ACCEPT: Record<PickKind, string> = {
  image: 'image/*',
  video: 'video/*',
  audio: 'audio/*',
  data: '.json,.csv,.tsv,.txt,application/json,text/csv,text/plain',
};
const NOUN: Record<PickKind, string> = { image: 'image', video: 'video', audio: 'sound', data: 'data file' };

export const addAssetOption = (kind: PickKind) => ({ value: ADD_ASSET, label: `+ Add a new ${NOUN[kind]}…` });
export const addVariableOption = () => ({ value: ADD_VARIABLE, label: '+ Create new variable…' });

/** Upload a file of this kind as an asset and return its id (null if the person cancelled). */
export async function pickNewAsset(kind: PickKind): Promise<string | null> {
  const files = await pickFiles(ACCEPT[kind], false);
  if (!files.length) return null;
  const added = await insertFiles(files, null, null);
  return added[0]?.id ?? null;
}

/** Turn what was typed into a usable, unused variable name (letters, digits and _). */
export function variableNameFrom(raw: string, taken: string[], suggested = 'value'): string {
  return uniqueIdentifier(taken, raw.trim().replace(/[^\w$]+/g, '_').replace(/^(\d)/, '_$1') || suggested);
}

/** Ask for a name and make a variable; resolves to its id (null if the person cancelled). */
export async function createVariable(type: VariableType = 'number', suggested = 'value', start?: number | string | boolean): Promise<string | null> {
  const taken = store().get().project.variables.map((v) => v.name);
  const raw = await promptDialog({
    title: 'New variable',
    label: 'Name for the new variable (letters, digits and _)',
    initial: uniqueIdentifier(taken, suggested),
    confirmLabel: 'Create variable',
  });
  if (raw === null) return null;
  const name = variableNameFrom(raw, store().get().project.variables.map((v) => v.name), suggested);
  const id = uid('v');
  const initial = start ?? (type === 'number' ? 0 : type === 'boolean' ? false : type === 'color' ? LIGHT_LOOK.button : type === 'list' ? '[]' : '');
  store().update((d) => {
    d.variables.push({ id, name, type, initial });
  });
  store().toast(`Created variable “${name}”. Change its type and starting value in the Variables tab.`);
  return id;
}

/**
 * Wrap a dropdown's onChange so the "add new" entries create the item first, then select it.
 * `variableType` is the type a new variable gets.
 */
export function withQuickAdd(onChange: (v: string) => void, opts: { asset?: PickKind; variableType?: VariableType; variableName?: string; variableInitial?: number | string | boolean } = {}) {
  return (v: string) => {
    if (v === ADD_ASSET && opts.asset) {
      void pickNewAsset(opts.asset).then((id) => id && onChange(id));
      return;
    }
    if (v === ADD_VARIABLE) {
      void createVariable(opts.variableType, opts.variableName, opts.variableInitial).then((id) => id && onChange(id));
      return;
    }
    onChange(v);
  };
}
