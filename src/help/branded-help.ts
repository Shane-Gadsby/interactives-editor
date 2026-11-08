import { BRANDED_STARTERS, COLOURWAYS, SETS, SET_NAMES } from '../lib/branded';
import { provideBrandedHelp } from './topics';

//The branded starters topic lists whatever is registered when it is read, so it stays right as the sets fill up
provideBrandedHelp(() => ({
  colourways: COLOURWAYS.map((c) => ({ name: c.name, description: c.description })),
  sets: SETS.filter((set) => BRANDED_STARTERS.some((s) => s.set === set)).map((set) => ({ name: SET_NAMES[set], starters: BRANDED_STARTERS.filter((s) => s.set === set).map((s) => ({ name: s.name, description: s.description })) })),
}));
