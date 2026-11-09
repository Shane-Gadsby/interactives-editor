//An empty "On pointer" event for a layer, shared by the canvas right-click menu and the command palette (and so the keymap)
import { defaultParams, uid, type Artboard } from 'interactives-player';
import { store } from '../store/store';
import { revealAdded } from './graph-reveal';

/** Add just an "On pointer" event for a layer, with nothing joined to it (the recipes in the behaviour dialog add the action too), and open the Interactions tab on it. */
export function addInteraction(ab: Artboard, nodeId: string, type: 'click' | 'pointerenter'): void {
  const ev = { id: uid('lg'), kind: 'event.pointer', x: 40, y: 40 + ab.logic.nodes.length * 30, params: { ...defaultParams('event.pointer'), target: nodeId, type } };
  store().update((d) => {
    const a = d.artboards.find((x) => x.id === ab.id);
    a?.logic.nodes.push(ev);
  });
  revealAdded({ abId: ab.id, ids: [ev.id], focusId: ev.id, say: `Added an empty ${type === 'click' ? 'When clicked' : 'When hovered'} event`, quiet: () => store().set({ bottomTab: 'logic', logicSelection: ev.id }) });
}
