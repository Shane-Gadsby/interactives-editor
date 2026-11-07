// The trusted side of the media bridge, for the learner page and the share-time check, bundled to shared/media-bridge.mjs by
// vite.media.config.ts so the page runs the very code the player's tests run, and the server cleans a declaration with the same rule.
export { startBridge } from '../../interactives-player/src/media/bridge';
export { cleanSensors, declaresSensors } from '../../interactives-player/src/media/sensors';
