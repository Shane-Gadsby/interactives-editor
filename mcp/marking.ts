// What the server needs from the player to mark answers (the question kit's marking and the server-marking steps), without the DOM,
// bundled to shared/marking-kit.mjs by vite.marking.config.ts so index.js uses the very code the player marks with.
export { stripProject, stepMarking, cleanMarkRequest, resultOf, parseStates, pruneStates, makeLimiter, MARK_RATE, RATE_LIMITED } from '../../interactives-player/src/server-marking';
export { normaliseQuestion } from '../../interactives-player/src/question';
