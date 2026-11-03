import { uid, type VariableType } from 'interactives-player';
import { store } from '../store/store';
import { uniqueName } from '../store/doc';
import { insertFiles, pickFiles } from './insert';

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

/** Ask for a name and make a variable; returns its id. */
export function createVariable(type: VariableType = 'number', suggested = 'value'): string | null {
  const taken = store().get().project.variables.map((v) => v.name);
  const raw = prompt('Name for the new variable (letters, digits and _):', uniqueName(taken, suggested).replace(/\s+/g, ''));
  if (raw === null) return null;
  const name = uniqueName(taken, raw.trim().replace(/[^\w$]+/g, '_').replace(/^(\d)/, '_$1') || suggested).replace(/\s+/g, '');
  const id = uid('v');
  const initial = type === 'number' ? 0 : type === 'boolean' ? false : type === 'color' ? '#3b5bfd' : '';
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
export function withQuickAdd(onChange: (v: string) => void, opts: { asset?: PickKind; variableType?: VariableType; variableName?: string } = {}) {
  return (v: string) => {
    if (v === ADD_ASSET && opts.asset) {
      void pickNewAsset(opts.asset).then((id) => id && onChange(id));
      return;
    }
    if (v === ADD_VARIABLE) {
      const id = createVariable(opts.variableType, opts.variableName);
      if (id) onChange(id);
      return;
    }
    onChange(v);
  };
}
